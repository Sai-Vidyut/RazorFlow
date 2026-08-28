import { describe, expect, it } from "vitest";
import { productMatchesCategory } from "@/lib/agent/category-match";
import {
  discoverProducts,
  discoverProductsWithMeta,
  isMultiProductDiscovery,
} from "@/lib/agent/discover-catalog";
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
    expect(results.every((product) => product.category === "earbuds")).toBe(true);
  });

  it("returns at least two headphone options", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("give me at least 2 options for headphones");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
  });

  it("filters by max price and count", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me 5 earphones under ₹5000");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBeLessThanOrEqual(5);
    expect(results.every((product) => product.category === "earbuds")).toBe(true);
    expect(results.every((product) => product.price <= 5000)).toBe(true);
  });

  it("sorts earbuds cheapest first", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me 5 earbuds sorted by price");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBe(5);
    expect(results.every((product) => product.category === "earbuds")).toBe(true);
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i]!.pricePaise).toBeGreaterThanOrEqual(results[i - 1]!.pricePaise);
    }
  });

  it("sorts headphones most expensive first", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me headphones from most expensive to cheapest");
    const meta = discoverProductsWithMeta(intent, catalog);
    expect(meta.products.length).toBeGreaterThan(0);
    expect(meta.products.every((product) => product.category === "headphones")).toBe(true);
    for (let i = 1; i < meta.products.length; i += 1) {
      expect(meta.products[i]!.pricePaise).toBeLessThanOrEqual(meta.products[i - 1]!.pricePaise);
    }
  });

  it("combines category, count, price, and sorting", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("give me 3 speakers under ₹5000 sorted cheapest first");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results.every((product) => product.category === "speaker")).toBe(true);
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

  it("maps earphones query to earbuds and excludes soundbars", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me the best earphones and sort them price wise");
    expect(intent.category).toBe("earbuds");
    expect(intent.discovery.sortBy).toBe("price");
    const meta = discoverProductsWithMeta(intent, catalog);
    expect(meta.products.length).toBeGreaterThan(1);
    expect(meta.products.every((product) => product.category === "earbuds")).toBe(true);
    expect(meta.products.some((product) => product.category === "soundbar")).toBe(false);
    expect(meta.products.some((product) => product.category === "speaker")).toBe(false);
  });

  it("never returns soundbars for explicit earbuds queries", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me earphones sorted by price");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => productMatchesCategory(product, "earbuds"))).toBe(true);
  });

  it("returns speaker products only for speaker queries", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me speakers");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.category === "speaker")).toBe(true);
  });

  it("returns headphones only for expensive headphones query", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me expensive headphones");
    const results = discoverProducts(intent, catalog);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
  });

  it("does not pad result count with unrelated categories", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me 20 earbuds");
    const meta = discoverProductsWithMeta(intent, catalog);
    expect(meta.returnedCount).toBeLessThan(20);
    expect(meta.products.every((product) => product.category === "earbuds")).toBe(true);
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
    expect(result.discoverySummary?.returnedCount).toBe(3);
  });

  it("returns discovery summary for sorted earphones browse", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const policies = await getMerchantPoliciesForAgent(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me earphones and sort by price");
    const result = runAgentWithParsed(intent, policies, catalog);
    expect(result.status).toBe("ready");
    expect(result.results.length).toBeGreaterThan(1);
    expect(result.discoverySummary?.sortBy).toBe("price");
    expect(result.discoverySummary?.category).toBe("earbuds");
  });
});
