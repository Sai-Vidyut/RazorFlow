import { createHmac, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { createBuyerSession } from "@/lib/services/sessions";
import { runAgentForSession } from "@/lib/services/agent-run";
import { createCheckoutForSession, createCheckoutFromCart } from "@/lib/services/checkout";
import { addToCart } from "@/lib/services/cart";
import { queryRecoveryMetrics } from "@/lib/services/admin-recovery";
import { recordPaymentFailure, verifyAndCapturePayment } from "@/lib/services/payments";
import { evaluateRecovery, getPaymentAttemptsForDecision } from "@/lib/services/recovery";
import { updatePersistedPolicies } from "@/lib/services/policies";

const prisma = new PrismaClient();
const TEST_SECRET = "test_razorpay_secret";
const MERCHANT_ID = getConfiguredDemoMerchantId();
const HALO_ORIGINAL_PRICE_PAISE = 749000;

const defaultPolicy = {
  discountCeilingPct: 12,
  marginFloorPct: 18,
  orderCapPaise: 2500000,
  minAttachRatePct: 35,
  allowEvidenceCrossSell: true,
  requireBudgetFit: true,
};

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

async function readyFlightHeadphonesDecision() {
  const { sessionId } = await createBuyerSession(
    "ANC headphones for a 14-hour flight, budget ₹8,500",
  );
  const { decisionId, result } = await runAgentForSession(sessionId);
  expect(result.status).toBe("ready");
  return { sessionId, decisionId, result };
}

async function restoreCatalogAndPolicies() {
  await updatePersistedPolicies(defaultPolicy);
  await db.product.updateMany({
    where: { merchantId: MERCHANT_ID, sku: "halo-anc" },
    data: { pricePaise: HALO_ORIGINAL_PRICE_PAISE, inventory: 100, active: true },
  });
  await db.product.updateMany({
    where: { merchantId: MERCHANT_ID, sku: "halo-case" },
    data: { inventory: 100, active: true },
  });
}

describe("Revenue recovery (Phase 6)", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await restoreCatalogAndPolicies();
  });

  afterEach(async () => {
    await restoreCatalogAndPolicies();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("evaluates retryable recovery after cart checkout failure", async () => {
    const { sessionId } = await createBuyerSession(
      "halo-anc Halo ANC for a 14-hour flight, budget ₹8,500",
    );
    await runAgentForSession(sessionId);
    await addToCart(sessionId, "halo-anc");
    const checkout = await createCheckoutFromCart(sessionId);
    await recordPaymentFailure(checkout.orderId, "Card declined");

    const evaluation = await evaluateRecovery(sessionId, checkout.decisionId, { recordAudit: false });
    expect(evaluation.status).toBe("retryable");
  });

  it("evaluates retryable recovery after a failed payment", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();
    const checkout = await createCheckoutForSession(sessionId, decisionId);
    await recordPaymentFailure(checkout.orderId, "Card declined");

    const evaluation = await evaluateRecovery(sessionId, decisionId, { recordAudit: false });
    expect(evaluation.status).toBe("retryable");
    expect(evaluation.priorFailedAttempts).toBe(1);
    expect(evaluation.attemptNumber).toBe(2);
  });

  it("blocks recovery when policy margin floor is violated on re-check", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();
    const checkout = await createCheckoutForSession(sessionId, decisionId);
    await recordPaymentFailure(checkout.orderId, "Card declined");

    await updatePersistedPolicies({ ...defaultPolicy, marginFloorPct: 95 });

    const evaluation = await evaluateRecovery(sessionId, decisionId, { recordAudit: false });
    expect(evaluation.status).toBe("blocked");
    expect(evaluation.policyBlocked).toBe(true);
  });

  it("requires re-evaluation when inventory changes after failure", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();
    const checkout = await createCheckoutForSession(sessionId, decisionId);
    await recordPaymentFailure(checkout.orderId, "Card declined");

    await db.product.update({
      where: { merchantId_sku: { merchantId: MERCHANT_ID, sku: "halo-anc" } },
      data: { inventory: 0 },
    });

    const evaluation = await evaluateRecovery(sessionId, decisionId, { recordAudit: false });
    expect(evaluation.status).toBe("re_evaluate");
    expect(evaluation.changes.length).toBeGreaterThan(0);
  });

  it("blocks recovery when primary product is inactive", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();
    const checkout = await createCheckoutForSession(sessionId, decisionId);
    await recordPaymentFailure(checkout.orderId, "Card declined");

    await db.product.update({
      where: { merchantId_sku: { merchantId: MERCHANT_ID, sku: "halo-anc" } },
      data: { active: false },
    });

    const evaluation = await evaluateRecovery(sessionId, decisionId, { recordAudit: false });
    expect(["re_evaluate", "blocked"]).toContain(evaluation.status);
    expect(evaluation.changes.length).toBeGreaterThan(0);
  });

  it("records multiple payment attempts and succeeds on retry", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();

    const firstCheckout = await createCheckoutForSession(sessionId, decisionId);
    await recordPaymentFailure(firstCheckout.orderId, "Card declined");

    const retryCheckout = await createCheckoutForSession(sessionId, decisionId);
    const paymentId = uniquePayId("recovery_success");
    const signature = signPayment(retryCheckout.razorpayOrderId, paymentId);

    await verifyAndCapturePayment({
      orderId: retryCheckout.orderId,
      razorpayOrderId: retryCheckout.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });

    const attempts = await getPaymentAttemptsForDecision(sessionId, decisionId);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.paymentStatus).toBe("FAILED");
    expect(attempts[1]?.paymentStatus).toBe("CAPTURED");
    expect(attempts[0]?.attemptNumber).toBe(1);
    expect(attempts[1]?.attemptNumber).toBe(2);

    const recoverySucceeded = await db.auditEvent.findFirst({
      where: { sessionId, type: "RECOVERY_SUCCEEDED" },
    });
    expect(recoverySucceeded).not.toBeNull();
  });

  it("records recovery failure on a failed retry attempt", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();

    const firstCheckout = await createCheckoutForSession(sessionId, decisionId);
    await recordPaymentFailure(firstCheckout.orderId, "Card declined");

    const retryCheckout = await createCheckoutForSession(sessionId, decisionId);
    await recordPaymentFailure(retryCheckout.orderId, "Insufficient funds");

    const recoveryFailed = await db.auditEvent.findFirst({
      where: { sessionId, type: "RECOVERY_FAILED" },
    });
    expect(recoveryFailed).not.toBeNull();

    const retryOrder = await db.order.findUnique({ where: { id: retryCheckout.orderId } });
    expect(retryOrder?.attemptNumber).toBe(2);
    expect(retryOrder?.status).toBe("FAILED");
  });

  it("returns zero recovery metrics when no failed payments exist for merchant", async () => {
    const metrics = await queryRecoveryMetrics(MERCHANT_ID);
    expect(metrics.failedPaymentAmountInr).toBeGreaterThanOrEqual(0);
    expect(metrics.recoveryAttempts).toBeGreaterThanOrEqual(0);
    expect(metrics.recoveredPayments).toBeGreaterThanOrEqual(0);
  });
});
