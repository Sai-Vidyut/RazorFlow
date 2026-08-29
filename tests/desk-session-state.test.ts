import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { createBuyerSession } from "@/lib/services/sessions";
import { runAgentForSession } from "@/lib/services/agent-run";
import { createCheckoutFromCart } from "@/lib/services/checkout";
import { getDeskActiveSessionState } from "@/lib/services/desk-session-state";
import { getDeskContext } from "@/lib/services/desk-context";
import { verifyAndCapturePayment } from "@/lib/services/payments";
import { updatePersistedPolicies } from "@/lib/services/policies";
import { addToCart } from "@/lib/services/cart";

const prisma = new PrismaClient();
const TEST_SECRET = "test_razorpay_secret";

vi.mock("@/lib/razorpay/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/razorpay/client")>("@/lib/razorpay/client");
  return {
    ...actual,
    isRazorpayConfigured: () => true,
    getRazorpayKeySecret: () => TEST_SECRET,
    getPublicRazorpayKeyId: () => "rzp_test_key",
    getRazorpayWebhookSecret: () => "test_webhook_secret",
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

describe("desk session payment state", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await updatePersistedPolicies({
      discountCeilingPct: 12,
      marginFloorPct: 18,
      orderCapPaise: 5000000,
      minAttachRatePct: 35,
      allowEvidenceCrossSell: true,
      requireBudgetFit: true,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns captured payment details from verify", async () => {
    const { sessionId } = await createBuyerSession(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );
    const { decisionId } = await runAgentForSession(sessionId);
    await addToCart(sessionId, "halo-anc", 1);
    const checkout = await createCheckoutFromCart(sessionId);
    const paymentId = `pay_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

    const result = await verifyAndCapturePayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signPayment(checkout.razorpayOrderId, paymentId),
    });

    expect(result.capturedPayment.status).toBe("CAPTURED");
    expect(result.capturedPayment.productName).toContain("Northline Halo ANC");
    expect(result.capturedPayment.orderLabel).toMatch(/^RF-/);
  });

  it("hydrates active captured session for desk context", async () => {
    const { sessionId } = await createBuyerSession(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );
    const { decisionId } = await runAgentForSession(sessionId);
    await addToCart(sessionId, "halo-anc", 1);
    const checkout = await createCheckoutFromCart(sessionId);
    const paymentId = `pay_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await verifyAndCapturePayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signPayment(checkout.razorpayOrderId, paymentId),
    });

    const active = await getDeskActiveSessionState(sessionId);
    expect(active?.phase).toBe("captured");
    expect(active?.capturedPayment.razorpayPaymentId).toBe(paymentId);

    const context = await getDeskContext({ sessionId });
    expect(context.activeSession?.capturedPayment.orderId).toBe(checkout.orderId);
    expect(context.activeSession?.agent.primary?.name).toContain("Northline Halo ANC");
  });
});
