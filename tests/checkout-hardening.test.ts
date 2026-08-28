import { createHmac, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { createBuyerSession } from "@/lib/services/sessions";
import { runAgentForSession } from "@/lib/services/agent-run";
import { CheckoutError, createCheckoutForSession } from "@/lib/services/checkout";
import { recordPaymentFailure, verifyAndCapturePayment } from "@/lib/services/payments";
import { getLedgerData } from "@/lib/services/ledger";
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

describe("Checkout hardening (Phase 3C P0)", () => {
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

  it("rejects checkout when product price changes after decision", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();

    await db.product.update({
      where: { merchantId_sku: { merchantId: MERCHANT_ID, sku: "halo-anc" } },
      data: { pricePaise: HALO_ORIGINAL_PRICE_PAISE + 50000 },
    });

    await expect(createCheckoutForSession(sessionId, decisionId)).rejects.toMatchObject({
      name: "CheckoutError",
      status: 409,
      message: expect.stringContaining("no longer valid"),
    } satisfies Partial<CheckoutError>);
  });

  it("rejects checkout when policy changes after decision", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();

    await updatePersistedPolicies({
      ...defaultPolicy,
      marginFloorPct: 95,
    });

    await expect(createCheckoutForSession(sessionId, decisionId)).rejects.toMatchObject({
      name: "CheckoutError",
      status: 403,
      message: expect.stringContaining("Policy re-check blocked"),
    } satisfies Partial<CheckoutError>);
  });

  it("rejects checkout when primary product changes after decision", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();

    await db.product.update({
      where: { merchantId_sku: { merchantId: MERCHANT_ID, sku: "halo-anc" } },
      data: { inventory: 0 },
    });

    await expect(createCheckoutForSession(sessionId, decisionId)).rejects.toMatchObject({
      name: "CheckoutError",
      status: 409,
      message: expect.stringContaining("no longer valid"),
    } satisfies Partial<CheckoutError>);
  });

  it("rejects checkout when attach product changes after decision", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();

    await updatePersistedPolicies({
      ...defaultPolicy,
      allowEvidenceCrossSell: false,
    });

    await expect(createCheckoutForSession(sessionId, decisionId)).rejects.toMatchObject({
      name: "CheckoutError",
      status: 409,
      message: expect.stringContaining("no longer valid"),
    } satisfies Partial<CheckoutError>);
  });

  it("rejects checkout when discount changes after decision", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();

    const intentRow = await db.buyerIntent.findUniqueOrThrow({ where: { sessionId } });
    const structured = intentRow.structuredIntent as Record<string, unknown>;
    const constraints = (structured.constraints ?? {}) as Record<string, unknown>;

    await db.buyerIntent.update({
      where: { sessionId },
      data: {
        structuredIntent: {
          ...structured,
          constraints: {
            ...constraints,
            maxDiscountPct: 10,
          },
        },
      },
    });

    await expect(createCheckoutForSession(sessionId, decisionId)).rejects.toMatchObject({
      name: "CheckoutError",
      status: 409,
      message: expect.stringContaining("no longer valid"),
    } satisfies Partial<CheckoutError>);
  });

  it("does not create two pending orders for the same session and decision", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();

    await createCheckoutForSession(sessionId, decisionId);

    await expect(createCheckoutForSession(sessionId, decisionId)).rejects.toMatchObject({
      name: "CheckoutError",
      status: 409,
    } satisfies Partial<CheckoutError>);

    const orders = await db.order.findMany({
      where: { sessionId, decisionId, status: "CREATED" },
      include: { payments: true },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0]?.payments.some((payment) => payment.status === "PENDING")).toBe(true);
  });

  it("rejects checkout after payment is captured", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();
    const checkout = await createCheckoutForSession(sessionId, decisionId);
    const paymentId = uniquePayId("paid_session");
    const signature = signPayment(checkout.razorpayOrderId, paymentId);

    await verifyAndCapturePayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });

    await expect(createCheckoutForSession(sessionId, decisionId)).rejects.toMatchObject({
      name: "CheckoutError",
      status: 409,
      message: expect.stringContaining("already been paid"),
    } satisfies Partial<CheckoutError>);
  });

  it("allows checkout retry after a failed payment", async () => {
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();

    const firstCheckout = await createCheckoutForSession(sessionId, decisionId);
    await recordPaymentFailure(firstCheckout.orderId, "Card declined");

    const retryCheckout = await createCheckoutForSession(sessionId, decisionId);
    expect(retryCheckout.orderId).not.toBe(firstCheckout.orderId);
    expect(retryCheckout.amountPaise).toBe(828000);

    const failedOrder = await db.order.findUnique({ where: { id: firstCheckout.orderId } });
    const retryOrder = await db.order.findUnique({ where: { id: retryCheckout.orderId } });
    expect(failedOrder?.status).toBe("FAILED");
    expect(retryOrder?.status).toBe("CREATED");
  });

  it("does not increase GMV from duplicate checkout attempts", async () => {
    const before = await getLedgerData();
    const { sessionId, decisionId } = await readyFlightHeadphonesDecision();

    const checkout = await createCheckoutForSession(sessionId, decisionId);
    await expect(createCheckoutForSession(sessionId, decisionId)).rejects.toBeInstanceOf(CheckoutError);

    const paymentId = uniquePayId("gmv_guard");
    const signature = signPayment(checkout.razorpayOrderId, paymentId);
    await verifyAndCapturePayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });

    const after = await getLedgerData();
    expect(after.weekGmv - before.weekGmv).toBeCloseTo(8280, 0);
  });
});
