import { createHmac, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { GET as adminRecoveryRoute } from "@/app/api/admin/recovery/route";
import { POST as abandonRoute } from "@/app/api/payments/abandon/route";
import { db } from "@/lib/db";
import { queryCommerceMetrics } from "@/lib/services/admin-metrics";
import { runAgentForSession } from "@/lib/services/agent-run";
import { createCheckoutForSession } from "@/lib/services/checkout";
import { clearMerchantTransactionalData } from "@/lib/services/merchant-transactional";
import { abandonCheckout, verifyAndCapturePayment } from "@/lib/services/payments";
import { createBuyerSession } from "@/lib/services/sessions";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { buyerAuthHeaders, merchantAuthHeaders, unauthorizedHeaders } from "./helpers/auth";

const prisma = new PrismaClient();
const TEST_SECRET = "test_razorpay_secret";
const MERCHANT_ID = getConfiguredDemoMerchantId();

vi.mock("@/lib/razorpay/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/razorpay/client")>("@/lib/razorpay/client");
  return {
    ...actual,
    isRazorpayConfigured: () => true,
    getRazorpayKeySecret: () => TEST_SECRET,
    getPublicRazorpayKeyId: () => "rzp_test_key",
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

function signPayment(orderId: string, paymentId: string) {
  return createHmac("sha256", TEST_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
}

function uniquePayId(label: string) {
  return `pay_${label}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

async function readyDecision() {
  const { sessionId } = await createBuyerSession("ANC headphones for a 14-hour flight, budget ₹8,500");
  const { decisionId } = await runAgentForSession(sessionId);
  return { sessionId, decisionId };
}

describe("Phase 7 demo hardening and integrity", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await clearMerchantTransactionalData(MERCHANT_ID);
    await db.processedWebhook.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("abandons checkout without recording a payment failure", async () => {
    const { sessionId, decisionId } = await readyDecision();
    const checkout = await createCheckoutForSession(sessionId, decisionId);

    const result = await abandonCheckout(checkout.orderId);
    expect(result.status).toBe("CANCELLED");

    const order = await db.order.findUniqueOrThrow({ where: { id: checkout.orderId } });
    const payment = await db.payment.findFirstOrThrow({ where: { orderId: checkout.orderId } });
    const session = await db.buyerSession.findUniqueOrThrow({ where: { id: sessionId } });

    expect(order.status).toBe("CANCELLED");
    expect(payment.status).toBe("CANCELLED");
    expect(session.status).toBe("DECISION_MADE");

    const failedAudit = await db.auditEvent.findFirst({
      where: { sessionId, type: "PAYMENT_FAILED" },
    });
    const abandonedAudit = await db.auditEvent.findFirst({
      where: { sessionId, type: "CHECKOUT_ABANDONED" },
    });
    expect(failedAudit).toBeNull();
    expect(abandonedAudit).not.toBeNull();
  });

  it("allows a new checkout after abandon", async () => {
    const { sessionId, decisionId } = await readyDecision();
    const first = await createCheckoutForSession(sessionId, decisionId);
    await abandonCheckout(first.orderId);

    const retry = await createCheckoutForSession(sessionId, decisionId);
    expect(retry.orderId).not.toBe(first.orderId);
    const retryOrder = await db.order.findUnique({ where: { id: retry.orderId } });
    expect(retryOrder?.attemptNumber).toBe(2);
  });

  it("abandons pending checkout when agent re-runs", async () => {
    const { sessionId, decisionId } = await readyDecision();
    await createCheckoutForSession(sessionId, decisionId);

    const second = await runAgentForSession(sessionId);
    expect(second.decisionId).not.toBe(decisionId);

    const pending = await db.payment.count({ where: { status: "PENDING" } });
    expect(pending).toBe(0);

    const abandoned = await db.auditEvent.findFirst({
      where: { sessionId, type: "CHECKOUT_ABANDONED" },
    });
    expect(abandoned).not.toBeNull();
  });

  it("excludes unverified captures from GMV", async () => {
    const { sessionId, decisionId } = await readyDecision();
    const checkout = await createCheckoutForSession(sessionId, decisionId);

    await db.payment.updateMany({
      where: { orderId: checkout.orderId },
      data: {
        status: "CAPTURED",
        razorpaySignatureVerified: false,
        capturedAt: new Date(),
      },
    });
    await db.order.update({ where: { id: checkout.orderId }, data: { status: "PAID" } });

    const metrics = await queryCommerceMetrics(MERCHANT_ID);
    expect(metrics.gmvInr).toBe(0);
    expect(metrics.capturedPayments).toBe(0);
  });

  it("counts verified capture once in GMV", async () => {
    const { sessionId, decisionId } = await readyDecision();
    const checkout = await createCheckoutForSession(sessionId, decisionId);
    const paymentId = uniquePayId("gmv_once");
    await verifyAndCapturePayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signPayment(checkout.razorpayOrderId, paymentId),
    });

    const metrics = await queryCommerceMetrics(MERCHANT_ID);
    expect(metrics.gmvInr).toBeCloseTo(7490, 0);
    expect(metrics.capturedPayments).toBe(1);
    expect(metrics.failedPayments).toBe(0);
    expect(metrics.pendingPayments).toBe(0);
  });

  it("rejects abandon via API without buyer authorization", async () => {
    const { sessionId, decisionId } = await readyDecision();
    const checkout = await createCheckoutForSession(sessionId, decisionId);

    const response = await abandonRoute(
      new Request("http://localhost/api/payments/abandon", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...unauthorizedHeaders() },
        body: JSON.stringify({ orderId: checkout.orderId }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects admin recovery without merchant authorization", async () => {
    const response = await adminRecoveryRoute(
      new Request("http://localhost/api/admin/recovery", { headers: unauthorizedHeaders() }),
    );
    expect(response.status).toBe(401);
  });

  it("allows authorized abandon via API", async () => {
    const { sessionId, decisionId } = await readyDecision();
    const checkout = await createCheckoutForSession(sessionId, decisionId);

    const response = await abandonRoute(
      new Request("http://localhost/api/payments/abandon", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buyerAuthHeaders(sessionId),
        },
        body: JSON.stringify({ orderId: checkout.orderId }),
      }),
    );
    expect(response.status).toBe(200);
  });
});
