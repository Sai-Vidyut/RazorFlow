import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { createCheckoutForSession } from "@/lib/services/checkout";
import { getAdminOverview } from "@/lib/services/admin-dashboard";
import { getAdminInsights } from "@/lib/services/admin-insights";
import { listAdminActivity } from "@/lib/services/admin-activity";
import {
  queryCommerceMetrics,
  queryProductPerformance,
} from "@/lib/services/admin-metrics";
import { createAdminProduct, updateAdminProduct } from "@/lib/services/admin-products";
import { runAgentForSession } from "@/lib/services/agent-run";
import {
  recordPaymentFailure,
  verifyAndCapturePayment,
} from "@/lib/services/payments";
import { createBuyerSession } from "@/lib/services/sessions";
import { db } from "@/lib/db";
import { clearMerchantTransactionalData } from "./helpers/merchant-data";

const prisma = new PrismaClient();
const MERCHANT_ID = getConfiguredDemoMerchantId();
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

function uniquePayId(label: string) {
  return `pay_${label}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

describe("Admin data-driven metrics", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await clearMerchantTransactionalData(MERCHANT_ID);
  });

  afterAll(async () => {
    await clearMerchantTransactionalData(MERCHANT_ID);
    await prisma.$disconnect();
  });

  it("reports zero commerce metrics on an empty merchant database", async () => {
    await clearMerchantTransactionalData(MERCHANT_ID);

    const overview = await getAdminOverview(MERCHANT_ID);
    const insights = await getAdminInsights(MERCHANT_ID);
    const activity = await listAdminActivity(MERCHANT_ID, { limit: 20 });

    expect(overview.commerce.gmvInr).toBe(0);
    expect(overview.commerce.orderCount).toBe(0);
    expect(overview.commerce.capturedPayments).toBe(0);
    expect(overview.commerce.failedPayments).toBe(0);
    expect(overview.commerce.pendingPayments).toBe(0);
    expect(overview.commerce.conversionRate).toBeNull();
    expect(overview.agent.decisions).toBe(0);
    expect(overview.agent.offersGenerated).toBe(0);
    expect(overview.recentActivity).toHaveLength(0);

    expect(insights.funnel.buyerSessions).toBe(0);
    expect(insights.products).toHaveLength(0);
    expect(insights.agent.conversionRate).toBeNull();
    expect(activity.total).toBe(0);
  });

  it("increments funnel metrics after one real buyer session", async () => {
    await clearMerchantTransactionalData(MERCHANT_ID);

    await createBuyerSession("ANC headphones for a 14-hour flight, budget ₹8,500");

    const insights = await getAdminInsights(MERCHANT_ID);
    const activity = await listAdminActivity(MERCHANT_ID, { filter: "all", limit: 10 });

    expect(insights.funnel.buyerSessions).toBe(1);
    expect(insights.funnel.agentDecisions).toBe(0);
    expect(activity.total).toBeGreaterThan(0);
    expect(activity.items.some((item) => item.type === "SESSION_CREATED")).toBe(true);
  });

  it("increments recommendation metrics after one agent decision", async () => {
    await clearMerchantTransactionalData(MERCHANT_ID);

    const { sessionId } = await createBuyerSession(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );
    await runAgentForSession(sessionId);

    const overview = await getAdminOverview(MERCHANT_ID);
    const performance = await queryProductPerformance(MERCHANT_ID);

    expect(overview.agent.decisions).toBe(1);
    expect(overview.agent.offersGenerated).toBe(1);
    expect(performance.some((row) => row.sku === "halo-anc" && row.timesRecommended === 1)).toBe(true);
  });

  it("increases GMV only after a captured payment", async () => {
    await clearMerchantTransactionalData(MERCHANT_ID);

    const before = await queryCommerceMetrics(MERCHANT_ID);
    expect(before.gmvInr).toBe(0);

    const { sessionId } = await createBuyerSession(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );
    const { decisionId } = await runAgentForSession(sessionId);
    const checkout = await createCheckoutForSession(sessionId, decisionId);
    const paymentId = uniquePayId("gmv");
    await verifyAndCapturePayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signPayment(checkout.razorpayOrderId, paymentId),
    });

    const after = await queryCommerceMetrics(MERCHANT_ID);
    expect(after.gmvInr).toBeGreaterThan(0);
    expect(after.capturedPayments).toBe(1);
    expect(after.orderCount).toBe(1);
  });

  it("records failed payments without increasing GMV", async () => {
    await clearMerchantTransactionalData(MERCHANT_ID);

    const { sessionId } = await createBuyerSession(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );
    const { decisionId } = await runAgentForSession(sessionId);
    const checkout = await createCheckoutForSession(sessionId, decisionId);
    await recordPaymentFailure(checkout.orderId, "Card declined");

    const metrics = await queryCommerceMetrics(MERCHANT_ID);
    expect(metrics.gmvInr).toBe(0);
    expect(metrics.capturedPayments).toBe(0);
    expect(metrics.failedPayments).toBe(1);
  });

  it("attributes product purchase revenue to the primary product", async () => {
    await clearMerchantTransactionalData(MERCHANT_ID);

    const { sessionId } = await createBuyerSession(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );
    const { decisionId } = await runAgentForSession(sessionId);
    const checkout = await createCheckoutForSession(sessionId, decisionId);
    const paymentId = uniquePayId("product");
    await verifyAndCapturePayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signPayment(checkout.razorpayOrderId, paymentId),
    });

    const performance = await queryProductPerformance(MERCHANT_ID);
    const halo = performance.find((row) => row.sku === "halo-anc");
    expect(halo?.timesPurchased).toBe(1);
    expect(halo?.revenueInr).toBeGreaterThan(0);
  });

  it("creates activity only from real application events", async () => {
    await clearMerchantTransactionalData(MERCHANT_ID);

    const { sessionId } = await createBuyerSession("Gift speaker under ₹4,000");
    await runAgentForSession(sessionId);

    const activity = await listAdminActivity(MERCHANT_ID, { filter: "all", limit: 20 });
    expect(activity.total).toBeGreaterThan(0);
    expect(activity.items.some((item) => item.type === "INTENT_PARSED")).toBe(true);
    expect(activity.items.some((item) => item.type === "DECISION_RECORDED")).toBe(true);
  });

  it("excludes deactivated or zero-inventory products from agent catalog immediately", async () => {
    const sku = `catalog-live-${Date.now()}`;
    const product = await createAdminProduct(MERCHANT_ID, {
      name: "Catalog Live Test",
      sku,
      description: "Temporary catalog validation product",
      category: "test",
      priceInr: 1500,
      inventory: 5,
      tags: ["test"],
      image: "/products/halo-anc.png",
      imageAlt: "Catalog test",
    });

    try {
      let catalog = await getAvailableCatalog(MERCHANT_ID);
      expect(catalog.some((item) => item.sku === sku)).toBe(true);

      await updateAdminProduct(MERCHANT_ID, product.id, { inventory: 0 });
      catalog = await getAvailableCatalog(MERCHANT_ID);
      expect(catalog.some((item) => item.sku === sku)).toBe(false);

      await updateAdminProduct(MERCHANT_ID, product.id, { inventory: 3, active: true });
      catalog = await getAvailableCatalog(MERCHANT_ID);
      expect(catalog.some((item) => item.sku === sku)).toBe(true);

      await updateAdminProduct(MERCHANT_ID, product.id, { active: false });
      catalog = await getAvailableCatalog(MERCHANT_ID);
      expect(catalog.some((item) => item.sku === sku)).toBe(false);
    } finally {
      await db.auditEvent.deleteMany({
        where: {
          merchantId: MERCHANT_ID,
          type: {
            in: [
              "PRODUCT_CREATED",
              "PRODUCT_UPDATED",
              "PRODUCT_ACTIVATED",
              "PRODUCT_DEACTIVATED",
              "PRODUCT_INVENTORY_CHANGED",
              "PRODUCT_PRICE_CHANGED",
            ],
          },
        },
      });
      await db.product.deleteMany({ where: { id: product.id } });
    }
  });
});
