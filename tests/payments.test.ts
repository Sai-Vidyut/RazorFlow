import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyPaymentSignature, verifyWebhookSignature } from "@/lib/razorpay/verify";
import { createBuyerSession } from "@/lib/services/sessions";
import { runAgentForSession } from "@/lib/services/agent-run";
import { createCheckoutForSession } from "@/lib/services/checkout";
import {
  handleRazorpayWebhook,
  recordPaymentFailure,
  verifyAndCapturePayment,
} from "@/lib/services/payments";
import { getLedgerData } from "@/lib/services/ledger";
import { updatePersistedPolicies } from "@/lib/services/policies";

const prisma = new PrismaClient();
const TEST_SECRET = "test_razorpay_secret";
const TEST_WEBHOOK_SECRET = "test_webhook_secret";

vi.mock("@/lib/razorpay/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/razorpay/client")>("@/lib/razorpay/client");
  return {
    ...actual,
    isRazorpayConfigured: () => true,
    getRazorpayKeySecret: () => TEST_SECRET,
    getPublicRazorpayKeyId: () => "rzp_test_key",
    getRazorpayWebhookSecret: () => TEST_WEBHOOK_SECRET,
    getRazorpayClient: () => ({
      orders: {
        create: vi.fn(async ({ amount, receipt }: { amount: number; receipt: string }) => ({
          id: `order_${receipt}`,
          amount,
          currency: "INR",
        })),
      },
    }),
  };
});

function signPayment(orderId: string, paymentId: string, secret = TEST_SECRET) {
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

function signWebhook(body: string, secret = TEST_WEBHOOK_SECRET) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function uniquePayId(label: string) {
  return `pay_${label}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function uniqueEventId(label: string) {
  return `evt_${label}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

describe("Razorpay payments", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await updatePersistedPolicies({
      discountCeilingPct: 12,
      marginFloorPct: 18,
      orderCapPaise: 2500000,
      minAttachRatePct: 35,
      allowEvidenceCrossSell: true,
      requireBudgetFit: true,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("verifies payment signatures", () => {
    const orderId = "order_abc";
    const paymentId = "pay_xyz";
    const signature = signPayment(orderId, paymentId);
    expect(verifyPaymentSignature(orderId, paymentId, signature, TEST_SECRET)).toBe(true);
    expect(verifyPaymentSignature(orderId, paymentId, "bad_signature", TEST_SECRET)).toBe(false);
  });

  it("creates checkout from persisted session/decision with server-side amount", async () => {
    const { sessionId } = await createBuyerSession(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );
    const { decisionId, result } = await runAgentForSession(sessionId);
    expect(result.status).toBe("ready");

    const checkout = await createCheckoutForSession(sessionId, decisionId);
    expect(checkout.amountPaise).toBe(749000);
    expect(checkout.razorpayOrderId).toContain("order_rf_");

    const order = await db.order.findUnique({ where: { id: checkout.orderId } });
    expect(order?.amountPaise).toBe(749000);
    expect(order?.decisionId).toBe(decisionId);

    const audit = await db.auditEvent.findMany({
      where: { sessionId, type: { in: ["ORDER_CREATED", "CHECKOUT_STARTED"] } },
    });
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it("captures payment only after signature verification", async () => {
    const { sessionId } = await createBuyerSession(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );
    const { decisionId } = await runAgentForSession(sessionId);
    const checkout = await createCheckoutForSession(sessionId, decisionId);

    const paymentId = uniquePayId("capture");
    const signature = signPayment(checkout.razorpayOrderId, paymentId);

    const result = await verifyAndCapturePayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });

    expect(result.status).toBe("CAPTURED");

    const payment = await db.payment.findFirst({ where: { orderId: checkout.orderId } });
    expect(payment?.status).toBe("CAPTURED");
    expect(payment?.razorpaySignatureVerified).toBe(true);
  });

  it("rejects invalid signatures and records verification failure", async () => {
    const { sessionId } = await createBuyerSession("Gift a portable speaker under ₹4,000");
    const { decisionId } = await runAgentForSession(sessionId);
    const checkout = await createCheckoutForSession(sessionId, decisionId);

    await expect(
      verifyAndCapturePayment({
        orderId: checkout.orderId,
        razorpayOrderId: checkout.razorpayOrderId,
        razorpayPaymentId: uniquePayId("bad"),
        razorpaySignature: "invalid",
      }),
    ).rejects.toThrow(/verification failed/i);

    const payment = await db.payment.findFirst({ where: { orderId: checkout.orderId } });
    expect(payment?.status).toBe("FAILED");
    expect(payment?.razorpaySignatureVerified).toBe(false);

    const audit = await db.auditEvent.findFirst({
      where: { sessionId, type: "PAYMENT_VERIFICATION_FAILED" },
    });
    expect(audit).not.toBeNull();
  });

  it("records failed payments without increasing GMV", async () => {
    const before = await getLedgerData();

    const { sessionId } = await createBuyerSession("Replace broken earbuds today, under ₹3,000");
    const { decisionId } = await runAgentForSession(sessionId);
    const checkout = await createCheckoutForSession(sessionId, decisionId);
    await recordPaymentFailure(checkout.orderId, "Card declined");

    const after = await getLedgerData();
    expect(after.weekGmv).toBe(before.weekGmv);

    const payment = await db.payment.findFirst({ where: { orderId: checkout.orderId } });
    expect(payment?.status).toBe("FAILED");
  });

  it("increases GMV exactly once for captured payments", async () => {
    const before = await getLedgerData();

    const { sessionId } = await createBuyerSession(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );
    const { decisionId } = await runAgentForSession(sessionId);
    const checkout = await createCheckoutForSession(sessionId, decisionId);
    const paymentId = uniquePayId("gmv_once");
    const signature = signPayment(checkout.razorpayOrderId, paymentId);

    await verifyAndCapturePayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });

    const mid = await getLedgerData();
    expect(mid.weekGmv - before.weekGmv).toBeCloseTo(7490, 0);

    await verifyAndCapturePayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });

    const after = await getLedgerData();
    expect(after.weekGmv).toBe(mid.weekGmv);
  });

  it("handles payment.captured webhook idempotently", async () => {
    const { sessionId } = await createBuyerSession(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );
    const { decisionId } = await runAgentForSession(sessionId);
    const checkout = await createCheckoutForSession(sessionId, decisionId);

    const paymentId = uniquePayId("webhook_capture");
    const eventId = uniqueEventId("capture");

    const body = JSON.stringify({
      id: eventId,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: checkout.razorpayOrderId,
            status: "captured",
          },
        },
      },
    });

    const signature = signWebhook(body);
    const first = await handleRazorpayWebhook(body, signature, TEST_WEBHOOK_SECRET);
    const second = await handleRazorpayWebhook(body, signature, TEST_WEBHOOK_SECRET);

    expect(first.processed).toBe(true);
    expect(second.processed).toBe(false);
    expect(second.reason).toBe("duplicate");

    const payments = await db.payment.findMany({
      where: { razorpayPaymentId: paymentId, status: "CAPTURED" },
    });
    expect(payments).toHaveLength(1);
  });

  it("handles payment.failed webhook", async () => {
    const { sessionId } = await createBuyerSession("Gift a portable speaker under ₹4,000");
    const { decisionId } = await runAgentForSession(sessionId);
    const checkout = await createCheckoutForSession(sessionId, decisionId);

    const body = JSON.stringify({
      id: uniqueEventId("failed"),
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: uniquePayId("webhook_failed"),
            order_id: checkout.razorpayOrderId,
            status: "failed",
            error_description: "Payment failed at gateway",
          },
        },
      },
    });

    const signature = signWebhook(body);
    const result = await handleRazorpayWebhook(body, signature, TEST_WEBHOOK_SECRET);
    expect(result.processed).toBe(true);

    const payment = await db.payment.findFirst({ where: { orderId: checkout.orderId } });
    expect(payment?.status).toBe("FAILED");
  });

  it("traces session → order → payment", async () => {
    const { sessionId } = await createBuyerSession(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );
    const { decisionId } = await runAgentForSession(sessionId);
    const checkout = await createCheckoutForSession(sessionId, decisionId);
    const paymentId = uniquePayId("trace");
    const signature = signPayment(checkout.razorpayOrderId, paymentId);
    await verifyAndCapturePayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });

    const order = await db.order.findUnique({
      where: { id: checkout.orderId },
      include: { payments: true, decision: true },
    });

    expect(order?.sessionId).toBe(sessionId);
    expect(order?.decisionId).toBe(decisionId);
    expect(order?.payments[0]?.status).toBe("CAPTURED");
  });
});
