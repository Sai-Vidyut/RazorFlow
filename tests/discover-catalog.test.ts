import { describe, expect, it } from "vitest";
import { discoverProducts, isMultiProductDiscovery } from "@/lib/agent/discover-catalog";
import { parseIntent } from "@/lib/agent/parse-intent";
import { runAgentWithParsed } from "@/lib/agent/run-agent";
import { createStructuredIntent } from "@/lib/agent/structured-intent";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { getMerchantPoliciesForAgent } from "@/lib/services/policies";

describe("discover-catalog", () => {
  it("returns multiple earbuds when requested", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me 3 earbuds");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBe(3);
    expect(results.every((product) => product.category.toLowerCase().includes("earbud"))).toBe(true);
  });

  it("returns at least two headphone options", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("give me at least 2 options for headphones");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by max price and count", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me 5 options under ₹5000");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBeLessThanOrEqual(5);
    expect(results.every((product) => product.price <= 5000)).toBe(true);
  });

  it("sorts earbuds cheapest first", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me 5 earbuds sorted by price");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBe(5);
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i]!.pricePaise).toBeGreaterThanOrEqual(results[i - 1]!.pricePaise);
    }
  });

  it("sorts headphones most expensive first", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me headphones from most expensive to cheapest");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i]!.pricePaise).toBeLessThanOrEqual(results[i - 1]!.pricePaise);
    }
  });

  it("combines category, count, price, and sorting", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("give me 3 speakers under ₹5000 sorted cheapest first");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results.every((product) => product.price <= 5000)).toBe(true);
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i]!.pricePaise).toBeGreaterThanOrEqual(results[i - 1]!.pricePaise);
    }
  });

  it("keeps single-product mode for best recommendation phrasing", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("recommend me the best earbuds");
    expect(isMultiProductDiscovery(intent)).toBe(false);
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBe(1);
  });
});

describe("run-agent discovery integration", () => {
  it("does not include suggested attach in subtotal", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const policies = await getMerchantPoliciesForAgent(getConfiguredDemoMerchantId());
    const intent = parseIntent("halo-anc Halo ANC for a 14-hour flight, budget ₹8,500");
    const result = runAgentWithParsed(intent, policies, catalog);
    expect(result.status).toBe("ready");
    expect(result.attach?.sku).toBe("halo-case");
    expect(result.subtotal).toBe(result.primary!.price);
    expect(result.aovLift).toBe(result.attach!.price);
  });

  it("returns multiple results for multi-product intent", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const policies = await getMerchantPoliciesForAgent(getConfiguredDemoMerchantId());
    const intent = createStructuredIntent({
      query: "show me 3 earbuds",
      category: "earbuds",
      constraints: { maxPricePaise: null, minPricePaise: null, maxDiscountPct: null },
      preferences: { features: [], keywords: [] },
      useCase: null,
      quantity: 1,
      discovery: { resultCount: 3, minResults: 3, sortBy: null, sortOrder: "asc" },
    });
    const result = runAgentWithParsed(intent, policies, catalog);
    expect(result.status).toBe("ready");
    expect(result.results.length).toBe(3);
  });
});
