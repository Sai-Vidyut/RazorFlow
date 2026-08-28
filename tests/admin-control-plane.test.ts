import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { GET as activityRoute } from "@/app/api/admin/activity/route";
import { GET as insightsRoute } from "@/app/api/admin/insights/route";
import { GET as ordersRoute } from "@/app/api/admin/orders/route";
import { GET as paymentsRoute } from "@/app/api/admin/payments/route";
import { GET as getPoliciesRoute, PUT as putPoliciesRoute } from "@/app/api/admin/policies/route";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { getAdminInsights } from "@/lib/services/admin-insights";
import { listAdminActivity } from "@/lib/services/admin-activity";
import { listAdminOrders } from "@/lib/services/admin-orders";
import { listAdminPayments } from "@/lib/services/admin-payments";
import { db } from "@/lib/db";
import { merchantAuthHeaders, unauthorizedHeaders } from "./helpers/auth";
import { createStaffAuthContext } from "./helpers/staff-auth";

const prisma = new PrismaClient();
const MERCHANT_ID = getConfiguredDemoMerchantId();
let staffHeaders: HeadersInit;

describe("Phase 4C admin control plane", () => {
  beforeAll(async () => {
    await prisma.$connect();
    const staff = await createStaffAuthContext();
    staffHeaders = staff.headers;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects unauthenticated admin section APIs", async () => {
    const routes = [
      ordersRoute(new Request("http://localhost/api/admin/orders", { headers: unauthorizedHeaders() })),
      paymentsRoute(new Request("http://localhost/api/admin/payments", { headers: unauthorizedHeaders() })),
      getPoliciesRoute(new Request("http://localhost/api/admin/policies", { headers: unauthorizedHeaders() })),
      insightsRoute(new Request("http://localhost/api/admin/insights", { headers: unauthorizedHeaders() })),
      activityRoute(new Request("http://localhost/api/admin/activity", { headers: unauthorizedHeaders() })),
    ];
    const responses = await Promise.all(routes);
    for (const response of responses) {
      expect(response.status).toBe(401);
    }
  });

  it("returns merchant-scoped orders without cost exposure", async () => {
    const response = await ordersRoute(
      new Request("http://localhost/api/admin/orders", { headers: staffHeaders }),
    );
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toMatch(/costPaise|"cost":/);

    const orders = await listAdminOrders(MERCHANT_ID);
    expect(Array.isArray(orders)).toBe(true);
  });

  it("returns merchant-scoped payments", async () => {
    const response = await paymentsRoute(
      new Request("http://localhost/api/admin/payments", { headers: staffHeaders }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { payments: unknown[] };
    expect(Array.isArray(payload.payments)).toBe(true);

    const payments = await listAdminPayments(MERCHANT_ID);
    expect(Array.isArray(payments)).toBe(true);
  });

  it("loads and validates admin policy updates with audit event", async () => {
    const getResponse = await getPoliciesRoute(
      new Request("http://localhost/api/admin/policies", { headers: staffHeaders }),
    );
    expect(getResponse.status).toBe(200);
    const current = (await getResponse.json()) as {
      policies: { maxDiscountPct: number; minMarginPct: number; maxOrderInr: number };
    };

    const invalid = await putPoliciesRoute(
      new Request("http://localhost/api/admin/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...staffHeaders },
        body: JSON.stringify({ ...current.policies, maxDiscountPct: 150 }),
      }),
    );
    expect(invalid.status).toBe(400);

    const valid = await putPoliciesRoute(
      new Request("http://localhost/api/admin/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...staffHeaders },
        body: JSON.stringify(current.policies),
      }),
    );
    expect(valid.status).toBe(200);

    const audit = await db.auditEvent.findFirst({
      where: { merchantId: MERCHANT_ID, type: "POLICY_UPDATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
  });

  it("computes insights from PostgreSQL with explicit notes for sparse data", async () => {
    const response = await insightsRoute(
      new Request("http://localhost/api/admin/insights", { headers: staffHeaders }),
    );
    expect(response.status).toBe(200);

    const insights = await getAdminInsights(MERCHANT_ID);
    expect(insights.revenue.gmvInr).toBeGreaterThanOrEqual(0);
    expect(insights.funnel.buyerSessions).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(insights.products)).toBe(true);
    expect(Array.isArray(insights.notes)).toBe(true);
  });

  it("filters activity by category without exposing secrets", async () => {
    const all = await listAdminActivity(MERCHANT_ID, { filter: "all", limit: 10 });
    const products = await listAdminActivity(MERCHANT_ID, { filter: "products", limit: 10 });

    expect(all.total).toBeGreaterThanOrEqual(products.total);
    for (const item of all.items) {
      expect(JSON.stringify(item)).not.toMatch(/secret|signature|api[_-]?key|token|password/i);
    }

    const response = await activityRoute(
      new Request("http://localhost/api/admin/activity?filter=payments&limit=10", {
        headers: staffHeaders,
      }),
    );
    expect(response.status).toBe(200);
  });

  it("handles empty-state metrics without fabricating values", async () => {
    const emptyMerchantId = `empty-merchant-${Date.now()}`;
    await db.merchant.create({
      data: {
        id: emptyMerchantId,
        name: "Empty Merchant",
        policy: {
          create: {
            discountCeilingPct: 10,
            marginFloorPct: 15,
            orderCapPaise: 1000000,
            minAttachRatePct: 30,
            allowEvidenceCrossSell: true,
            requireBudgetFit: true,
          },
        },
      },
    });

    try {
      const insights = await getAdminInsights(emptyMerchantId);
      expect(insights.revenue.gmvInr).toBe(0);
      expect(insights.funnel.buyerSessions).toBe(0);
      expect(insights.revenue.averageOrderValueInr).toBeNull();
      expect(insights.agent.conversionRate).toBeNull();
    } finally {
      await db.auditEvent.deleteMany({ where: { merchantId: emptyMerchantId } });
      await db.policy.deleteMany({ where: { merchantId: emptyMerchantId } });
      await db.merchant.deleteMany({ where: { id: emptyMerchantId } });
    }
  });
});
