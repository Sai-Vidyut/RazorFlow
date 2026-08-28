import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NORTLINE_CATALOG_PRODUCT_COUNT } from "../prisma/northline-catalog";
import { runAgentWithParsed } from "@/lib/agent/run-agent";
import { parseIntent } from "@/lib/agent/parse-intent";
import { createStructuredIntent } from "@/lib/agent/structured-intent";
import { rankProducts } from "@/lib/agent/match-catalog";
import { db } from "@/lib/db";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { createBuyerSession } from "@/lib/services/sessions";
import { runAgentForSession } from "@/lib/services/agent-run";
import { getLedgerData } from "@/lib/services/ledger";
import { getMerchantPoliciesForAgent, updatePersistedPolicies } from "@/lib/services/policies";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { policyToMerchantPolicies } from "@/lib/policy/map";

const prisma = new PrismaClient();

const defaultPolicy = {
  discountCeilingPct: 12,
  marginFloorPct: 18,
  orderCapPaise: 2500000,
  minAttachRatePct: 35,
  allowEvidenceCrossSell: true,
  requireBudgetFit: true,
};

describe("RazorFlow persistence slice", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await updatePersistedPolicies(defaultPolicy);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connects to PostgreSQL", async () => {
    const result = await db.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`;
    expect(result[0]?.ok).toBe(1);
  });

  it("has seeded merchant, catalog, and policies", async () => {
    const merchant = await db.merchant.findFirst({ where: { id: getConfiguredDemoMerchantId() }, include: { policy: true } });
    expect(merchant).not.toBeNull();
    expect(merchant?.policy?.discountCeilingPct).toBe(12);

    const products = await db.product.count({ where: { merchantId: merchant!.id } });
    expect(products).toBe(NORTLINE_CATALOG_PRODUCT_COUNT);
  });

  it("creates a session and persists structured intent", async () => {
    const rawRequest = "ANC headphones for a 14-hour flight, budget ₹8,500";
    const { sessionId, intent } = await createBuyerSession(rawRequest);

    expect(sessionId).toBeTruthy();
    expect(intent.maxBudgetInr).toBe(8500);
    expect(intent.features).toContain("anc");

    const stored = await db.buyerIntent.findUnique({ where: { sessionId } });
    expect(stored?.structuredIntent).toBeTruthy();

    const audit = await db.auditEvent.findMany({ where: { sessionId } });
    expect(audit.some((event) => event.type === "SESSION_CREATED")).toBe(true);
    expect(audit.some((event) => event.type === "INTENT_PARSED")).toBe(true);
  });

  it("runs agent server-side and persists decision + audit events", async () => {
    const { sessionId } = await createBuyerSession(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );

    const { decisionId, result } = await runAgentForSession(sessionId);
    expect(decisionId).toBeTruthy();
    expect(result.status).toBe("ready");
    expect(result.primary?.sku).toBe("halo-anc");
    expect(result.attach?.sku).toBe("halo-case");

    const decision = await db.agentDecision.findUnique({ where: { id: decisionId } });
    expect(decision?.policyAllowed).toBe(true);
    expect(decision?.subtotalPaise).toBe(749000);

    const audit = await db.auditEvent.findMany({ where: { sessionId } });
    expect(audit.some((event) => event.type === "RECOMMENDATION_MADE")).toBe(true);
    expect(audit.some((event) => event.type === "POLICY_EVALUATED")).toBe(true);
    expect(audit.some((event) => event.type === "DECISION_RECORDED")).toBe(true);
  });

  it("persists policy updates and affects agent behavior", async () => {
    await updatePersistedPolicies(defaultPolicy);

    const { sessionId } = await createBuyerSession("Northline Halo ANC at 25% off");
    const blocked = await runAgentForSession(sessionId);
    expect(blocked.result.status).toBe("blocked");

    await updatePersistedPolicies({
      ...defaultPolicy,
      discountCeilingPct: 30,
      marginFloorPct: 5,
    });

    const { sessionId: sessionId2 } = await createBuyerSession("Northline Halo ANC at 25% off");
    const allowed = await runAgentForSession(sessionId2);
    expect(allowed.result.status).toBe("ready");

    await updatePersistedPolicies(defaultPolicy);
  });

  it("aggregates ledger data from persisted sessions", async () => {
    const { sessionId } = await createBuyerSession("Gift a portable speaker under ₹4,000");
    await runAgentForSession(sessionId);

    const ledger = await getLedgerData();
    expect(ledger.funnel[0].count).toBeGreaterThan(0);
    expect(ledger.sessions.some((row) => row.id === sessionId)).toBe(true);
    expect(ledger.weekGmv).toBeGreaterThanOrEqual(0);
  });

  it("integration: session → agent → ledger", async () => {
    const { sessionId } = await createBuyerSession(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );
    await runAgentForSession(sessionId);

    const ledger = await getLedgerData();
    const row = ledger.sessions.find((item) => item.id === sessionId);
    expect(row).toBeDefined();
    expect(row?.policy).toBe("Allowed");
    expect(row?.decision).toContain("Northline Halo ANC");
  });
});

describe("deterministic agent with database catalog", () => {
  it("loads catalog and policies from PostgreSQL", async () => {
    await updatePersistedPolicies(defaultPolicy);

    const merchant = await db.merchant.findFirst({
      where: { id: getConfiguredDemoMerchantId() },
      include: { policy: true },
    });
    const catalog = await getAvailableCatalog(merchant!.id);
    const policies = policyToMerchantPolicies(merchant!.policy!, merchant!.name);
    const intent = parseIntent("Northline Halo ANC at 25% off");
    const result = runAgentWithParsed(intent, policies, catalog);
    expect(result.status).toBe("blocked");
  });

  it("uses updated policy values from the database", async () => {
    await updatePersistedPolicies(defaultPolicy);

    const policies = await getMerchantPoliciesForAgent(getConfiguredDemoMerchantId());
    expect(policies.maxDiscountPct).toBe(12);
  });
});

describe("Phase 3A generic catalog matching", () => {
  const merchantId = getConfiguredDemoMerchantId();
  const trailSku = "trailpro-backpack-test";
  const zeroInventorySku = "zero-inventory-test";
  const inactiveSku = "inactive-product-test";

  beforeAll(async () => {
    await updatePersistedPolicies(defaultPolicy);
    await db.product.upsert({
      where: { merchantId_sku: { merchantId, sku: trailSku } },
      update: {
        name: "TrailPro Waterproof Backpack",
        description: "Lightweight waterproof backpack for hiking and travel",
        category: "outdoor",
        pricePaise: 459900,
        costPaise: 280000,
        inventory: 25,
        active: true,
        tags: ["backpack", "outdoor", "hiking"],
        metadata: {
          waterproof: true,
          capacityLiters: 35,
          weightKg: 0.8,
          features: ["waterproof", "lightweight"],
          useCases: ["hiking", "travel"],
          catalogRole: "primary",
        },
        image: "/products/halo-case.png",
        imageAlt: "TrailPro waterproof backpack",
      },
      create: {
        merchantId,
        sku: trailSku,
        name: "TrailPro Waterproof Backpack",
        description: "Lightweight waterproof backpack for hiking and travel",
        category: "outdoor",
        pricePaise: 459900,
        costPaise: 280000,
        inventory: 25,
        active: true,
        tags: ["backpack", "outdoor", "hiking"],
        metadata: {
          waterproof: true,
          capacityLiters: 35,
          weightKg: 0.8,
          features: ["waterproof", "lightweight"],
          useCases: ["hiking", "travel"],
          catalogRole: "primary",
        },
        image: "/products/halo-case.png",
        imageAlt: "TrailPro waterproof backpack",
      },
    });

    await db.product.upsert({
      where: { merchantId_sku: { merchantId, sku: zeroInventorySku } },
      update: {
        name: "Zero Stock Test Pack",
        description: "Should never be recommended",
        category: "outdoor",
        pricePaise: 100000,
        costPaise: 50000,
        inventory: 0,
        active: true,
        tags: ["backpack"],
        metadata: { features: ["waterproof"], catalogRole: "primary" },
        image: "/products/halo-case.png",
        imageAlt: "Zero stock pack",
      },
      create: {
        merchantId,
        sku: zeroInventorySku,
        name: "Zero Stock Test Pack",
        description: "Should never be recommended",
        category: "outdoor",
        pricePaise: 100000,
        costPaise: 50000,
        inventory: 0,
        active: true,
        tags: ["backpack"],
        metadata: { features: ["waterproof"], catalogRole: "primary" },
        image: "/products/halo-case.png",
        imageAlt: "Zero stock pack",
      },
    });

    await db.product.upsert({
      where: { merchantId_sku: { merchantId, sku: inactiveSku } },
      update: {
        name: "Inactive Test Pack",
        description: "Inactive product should never be recommended",
        category: "outdoor",
        pricePaise: 100000,
        costPaise: 50000,
        inventory: 10,
        active: false,
        tags: ["backpack"],
        metadata: { features: ["waterproof"], catalogRole: "primary" },
        image: "/products/halo-case.png",
        imageAlt: "Inactive pack",
      },
      create: {
        merchantId,
        sku: inactiveSku,
        name: "Inactive Test Pack",
        description: "Inactive product should never be recommended",
        category: "outdoor",
        pricePaise: 100000,
        costPaise: 50000,
        inventory: 10,
        active: false,
        tags: ["backpack"],
        metadata: { features: ["waterproof"], catalogRole: "primary" },
        image: "/products/halo-case.png",
        imageAlt: "Inactive pack",
      },
    });
  });

  afterAll(async () => {
    await db.product.deleteMany({
      where: { sku: { in: [trailSku, zeroInventorySku, inactiveSku] } },
    });
  });

  it("selects a new outdoor category product from structured intent without code changes", async () => {
    const catalog = await getAvailableCatalog(merchantId);
    const policies = await getMerchantPoliciesForAgent(merchantId);
    const intent = createStructuredIntent({
      query: "Need a waterproof backpack for hiking under ₹5,000",
      category: "outdoor",
      constraints: {
        maxPricePaise: 500000,
        minPricePaise: null,
        maxDiscountPct: null,
      },
      preferences: {
        features: ["waterproof", "lightweight"],
        keywords: ["backpack", "hiking"],
      },
      useCase: "hiking",
      quantity: 1,
    });

    const result = runAgentWithParsed(intent, policies, catalog);
    expect(result.status).toBe("ready");
    expect(result.primary?.sku).toBe(trailSku);
  });

  it("does not recommend zero-inventory or inactive products", async () => {
    const catalog = await getAvailableCatalog(merchantId);
    const intent = createStructuredIntent({
      query: "waterproof backpack",
      category: "outdoor",
      constraints: { maxPricePaise: null, minPricePaise: null, maxDiscountPct: null },
      preferences: { features: ["waterproof"], keywords: ["backpack"] },
      useCase: "hiking",
      quantity: 1,
    });

    const ranked = rankProducts(intent, catalog);
    expect(ranked.some((item) => item.product.sku === zeroInventorySku)).toBe(false);
    expect(ranked.some((item) => item.product.sku === inactiveSku)).toBe(false);
  });

  it("respects max price constraints via ranking and policy", async () => {
    const catalog = await getAvailableCatalog(merchantId);
    const intent = createStructuredIntent({
      query: "premium waterproof backpack",
      category: "outdoor",
      constraints: { maxPricePaise: 100000, minPricePaise: null, maxDiscountPct: null },
      preferences: { features: ["waterproof"], keywords: ["backpack"] },
      useCase: null,
      quantity: 1,
    });

    const result = runAgentWithParsed(intent, await getMerchantPoliciesForAgent(merchantId), catalog);
    if (result.status === "ready") {
      expect(result.primary!.pricePaise).toBeLessThanOrEqual(100000);
    } else {
      expect(result.status).toBe("empty");
    }
  });
});
