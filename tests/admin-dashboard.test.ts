import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { GET as adminOverviewRoute } from "@/app/api/admin/overview/route";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { signMerchantSessionToken } from "@/lib/auth/tokens";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  getAdminOverview,
} from "@/lib/services/admin-dashboard";
import { db } from "@/lib/db";
import { merchantAuthHeaders, unauthorizedHeaders } from "./helpers/auth";
import { createStaffAuthContext } from "./helpers/staff-auth";

const prisma = new PrismaClient();
const MERCHANT_ID = getConfiguredDemoMerchantId();
const ISOLATION_MERCHANT_ID = `isolation-${Date.now()}`;
let staffHeaders: HeadersInit;

describe("Phase 4A admin dashboard", () => {
  beforeAll(async () => {
    await prisma.$connect();
    const staff = await createStaffAuthContext();
    staffHeaders = staff.headers;

    await db.merchant.upsert({
      where: { id: ISOLATION_MERCHANT_ID },
      create: { id: ISOLATION_MERCHANT_ID, name: "Isolation Test Merchant" },
      update: {},
    });
  });

  afterAll(async () => {
    await db.payment.deleteMany({
      where: { order: { session: { merchantId: ISOLATION_MERCHANT_ID } } },
    });
    await db.order.deleteMany({
      where: { session: { merchantId: ISOLATION_MERCHANT_ID } },
    });
    await db.agentDecision.deleteMany({
      where: { session: { merchantId: ISOLATION_MERCHANT_ID } },
    });
    await db.auditEvent.deleteMany({
      where: { merchantId: ISOLATION_MERCHANT_ID },
    });
    await db.buyerSession.deleteMany({ where: { merchantId: ISOLATION_MERCHANT_ID } });
    await db.product.deleteMany({ where: { merchantId: ISOLATION_MERCHANT_ID } });
    await db.merchant.deleteMany({ where: { id: ISOLATION_MERCHANT_ID } });
    await prisma.$disconnect();
  });

  it("rejects admin overview without merchant authorization", async () => {
    const response = await adminOverviewRoute(
      new Request("http://localhost/api/admin/overview", { headers: unauthorizedHeaders() }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects admin overview with a merchant token for another merchant id", async () => {
    const response = await adminOverviewRoute(
      new Request("http://localhost/api/admin/overview", {
        headers: {
          Cookie: `rf_merchant_session=${encodeURIComponent(signMerchantSessionToken(ISOLATION_MERCHANT_ID))}`,
        },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("allows authorized merchant access to admin overview", async () => {
    const response = await adminOverviewRoute(
      new Request("http://localhost/api/admin/overview", { headers: staffHeaders }),
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      merchant: { id: string; name: string };
      commerce: Record<string, number | null>;
      catalog: Record<string, number>;
      agent: Record<string, number>;
      recentActivity: unknown[];
    };

    expect(payload.merchant.id).toBe(MERCHANT_ID);
    expect(payload.commerce).toMatchObject({
      gmvInr: expect.any(Number),
      orderCount: expect.any(Number),
      capturedPayments: expect.any(Number),
      failedPayments: expect.any(Number),
      pendingPayments: expect.any(Number),
    });
    expect(payload.catalog.lowStockThreshold).toBe(DEFAULT_LOW_STOCK_THRESHOLD);
    expect(Array.isArray(payload.recentActivity)).toBe(true);
  });

  it("never exposes cost fields in admin overview API response", async () => {
    const response = await adminOverviewRoute(
      new Request("http://localhost/api/admin/overview", { headers: staffHeaders }),
    );
    const serialized = await response.text();

    expect(response.status).toBe(200);
    expect(serialized).not.toMatch(/costPaise|"cost":/);
    expect(serialized).not.toMatch(/GEMINI_API_KEY|api[_-]?key|secret|password/i);
  });

  it("scopes dashboard metrics to the authenticated merchant", async () => {
    const demoBefore = await getAdminOverview(MERCHANT_ID);

    const isolationSession = await db.buyerSession.create({
      data: {
        merchantId: ISOLATION_MERCHANT_ID,
        rawRequest: "isolation test session",
      },
    });

    const isolationDecision = await db.agentDecision.create({
      data: {
        sessionId: isolationSession.id,
        subtotalPaise: 42424200,
        marginPct: 20,
        attachRevenuePaise: 0,
        recommendationReason: "Isolation test decision",
        policyAllowed: true,
        status: "READY",
      },
    });

    const isolationOrder = await db.order.create({
      data: {
        sessionId: isolationSession.id,
        decisionId: isolationDecision.id,
        status: "PAID",
        amountPaise: 42424200,
        currency: "INR",
      },
    });

    await db.payment.create({
      data: {
        orderId: isolationOrder.id,
        status: "CAPTURED",
        capturedAt: new Date(),
        razorpaySignatureVerified: true,
      },
    });

    await db.product.create({
      data: {
        merchantId: ISOLATION_MERCHANT_ID,
        sku: `isolation-sku-${Date.now()}`,
        name: "Isolation Product",
        description: "Should not appear in demo overview",
        category: "test",
        pricePaise: 100000,
        costPaise: 50000,
        inventory: 0,
        tags: [],
        image: "/design/placeholder.png",
        imageAlt: "Isolation product",
        active: true,
      },
    });

    const demoAfter = await getAdminOverview(MERCHANT_ID);
    const isolationOverview = await getAdminOverview(ISOLATION_MERCHANT_ID);

    expect(isolationOverview.commerce.orderCount).toBe(1);
    expect(isolationOverview.commerce.capturedPayments).toBe(1);
    expect(isolationOverview.commerce.gmvInr).toBe(424242);
    expect(isolationOverview.catalog.activeCount).toBe(1);
    expect(isolationOverview.catalog.zeroInventoryCount).toBe(1);

    expect(demoAfter.commerce.orderCount).toBe(demoBefore.commerce.orderCount);
    expect(demoAfter.commerce.capturedPayments).toBe(demoBefore.commerce.capturedPayments);
    expect(demoAfter.commerce.gmvInr).toBe(demoBefore.commerce.gmvInr);
    expect(demoAfter.catalog.activeCount).toBe(demoBefore.catalog.activeCount);
  });

  it("computes product summary using the service low-stock threshold", async () => {
    const overview = await getAdminOverview(MERCHANT_ID);
    const lowStockProducts = await db.product.count({
      where: {
        merchantId: MERCHANT_ID,
        active: true,
        inventory: { gt: 0, lte: DEFAULT_LOW_STOCK_THRESHOLD },
      },
    });
    const zeroInventoryProducts = await db.product.count({
      where: { merchantId: MERCHANT_ID, active: true, inventory: 0 },
    });
    const activeProducts = await db.product.count({
      where: { merchantId: MERCHANT_ID, active: true },
    });

    expect(overview.catalog.activeCount).toBe(activeProducts);
    expect(overview.catalog.zeroInventoryCount).toBe(zeroInventoryProducts);
    expect(overview.catalog.lowStockCount).toBe(lowStockProducts);
    expect(overview.catalog.lowStockThreshold).toBe(DEFAULT_LOW_STOCK_THRESHOLD);
  });

  it("sanitizes recent activity and omits secret-like audit fields", async () => {
    const overview = await getAdminOverview(MERCHANT_ID);

    for (const item of overview.recentActivity) {
      expect(item).toHaveProperty("label");
      expect(item).toHaveProperty("detail");
      expect(item).toHaveProperty("when");
      expect(item).not.toHaveProperty("cost");
      expect(item).not.toHaveProperty("costPaise");
      expect(JSON.stringify(item)).not.toMatch(/secret|signature|api[_-]?key|token|password/i);
    }
  });
});
