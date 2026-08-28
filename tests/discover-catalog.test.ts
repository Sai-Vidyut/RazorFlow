import { describe, expect, it } from "vitest";
import { productMatchesCategory } from "@/lib/agent/category-match";
import {
  discoverProducts,
  discoverProductsWithMeta,
  isMultiProductDiscovery,
} from "@/lib/agent/discover-catalog";
import { parseIntent } from "@/lib/agent/parse-intent";
import { findExactProductMatch } from "@/lib/agent/resolve-exact-product";
import { runAgentWithParsed } from "@/lib/agent/run-agent";
import { validateStructuredIntent } from "@/lib/agent/intent-validation";
import { createStructuredIntent } from "@/lib/agent/structured-intent";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { getMerchantPoliciesForAgent } from "@/lib/services/policies";

function skus(products: { sku: string }[]) {
  return products.map((product) => product.sku);
}

describe("budget hard constraints", () => {
  it("good headphones under 3k never returns above-budget products", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("good headphones under 3k");
    expect(intent.constraints.maxPricePaise).toBe(300_000);
    const results = discoverProducts(intent, catalog);
    expect(results.every((product) => product.category === "headphones" && product.price <= 3000)).toBe(
      true,
    );
    expect(results.some((product) => product.sku === "bassline-over")).toBe(false);
    expect(results.some((product) => product.sku === "commute-lite")).toBe(true);
  });

  it("show me headphones under 3k returns only in-budget headphones", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me headphones under 3k"), catalog);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
    expect(results.every((product) => product.price <= 3000)).toBe(true);
  });

  it("show me 3 headphones under 5k returns only in-budget headphones", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me 3 headphones under 5k"), catalog);
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
    expect(results.every((product) => product.price <= 5000)).toBe(true);
  });

  it("show me earbuds under 1000 returns only in-budget earbuds", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me earbuds under 1000"), catalog);
    expect(results.every((product) => product.category === "earbuds" && product.price <= 1000)).toBe(
      true,
    );
    expect(results.some((product) => product.sku === "daily-wired")).toBe(true);
  });

  it("show me earbuds under 500 returns empty when none qualify", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me earbuds under 500"), catalog);
    expect(results).toEqual([]);
  });

  it("Northline Halo ANC under 5000 returns empty without substitution", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const policies = await getMerchantPoliciesForAgent(getConfiguredDemoMerchantId());
    const result = runAgentWithParsed(parseIntent("Northline Halo ANC under 5000"), policies, catalog);
    expect(result.status).toBe("empty");
    expect(result.results).toEqual([]);
    expect(result.primary).toBeNull();
    expect(result.explanations[0]?.reason).toMatch(/under ₹5,000/i);
  });

  it("at least N does not override budget when fewer match", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me at least 3 headphones under 3k"), catalog);
    expect(results.every((product) => product.price <= 3000)).toBe(true);
    expect(results.length).toBeLessThan(3);
  });

  it("show me headphones under 5k sorted cheapest first filters then sorts", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me headphones under 5k sorted cheapest first"), catalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.category === "headphones" && product.price <= 5000)).toBe(
      true,
    );
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index]!.pricePaise).toBeGreaterThanOrEqual(results[index - 1]!.pricePaise);
    }
  });

  it("run-agent empty message names category and budget", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const policies = await getMerchantPoliciesForAgent(getConfiguredDemoMerchantId());
    const result = runAgentWithParsed(parseIntent("good headphones under 2k"), policies, catalog);
    expect(result.status).toBe("empty");
    expect(result.explanations[0]?.reason).toBe("No headphones available under ₹2,000.");
    expect(result.primary).toBeNull();
    expect(result.results).toEqual([]);
  });
});

describe("natural-language exclusions", () => {
  it("good headphones under 3k except Commute Lite returns empty", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      parseIntent("good headphones under 3k except northline commute lite"),
      catalog,
    );
    expect(results).toEqual([]);
  });

  it("headphones under 3k except Bassline Over stays in budget and excludes Bassline", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("headphones under 3k except Bassline Over"), catalog);
    expect(results.every((product) => product.price <= 3000)).toBe(true);
    expect(results.some((product) => product.sku === "bassline-over")).toBe(false);
    expect(results.some((product) => product.sku === "commute-lite")).toBe(true);
  });

  it("show me 3 headphones under 6k cheapest first except Commute Lite", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      parseIntent("show me 3 headphones under 6k, cheapest first, except Commute Lite"),
      catalog,
    );
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results.every((product) => product.category === "headphones" && product.price <= 6000)).toBe(
      true,
    );
    expect(results.some((product) => product.sku === "commute-lite")).toBe(false);
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index]!.pricePaise).toBeGreaterThanOrEqual(results[index - 1]!.pricePaise);
    }
  });

  it("show me earbuds but not Drift buds excludes drift-buds", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me earbuds but not Drift buds"), catalog);
    expect(results.every((product) => product.category === "earbuds")).toBe(true);
    expect(results.some((product) => product.sku === "drift-buds")).toBe(false);
    expect(results.length).toBeGreaterThan(0);
  });

  it("anything except Halo ANC excludes halo-anc from category browse", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = createStructuredIntent({
      query: "show me headphones anything except Halo ANC",
      category: "headphones",
      constraints: { maxPricePaise: null, minPricePaise: null, maxDiscountPct: null },
      preferences: { features: [], keywords: [] },
      useCase: null,
      quantity: 1,
      exclusions: [{ reference: "Halo ANC", resolvedSku: null }],
    });
    const results = discoverProducts(intent, catalog);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
    expect(results.some((product) => product.sku === "halo-anc")).toBe(false);
  });

  it("Northline Halo ANC under 9000 returns only Halo ANC", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("Northline Halo ANC under 9000"), catalog);
    expect(skus(results)).toEqual(["halo-anc"]);
  });

  it("show me headphones except Commute Lite omits commute-lite", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me headphones except Commute Lite"), catalog);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
    expect(results.some((product) => product.sku === "commute-lite")).toBe(false);
    expect(results.length).toBeGreaterThan(0);
  });

  it("Commute Lite except Commute Lite returns empty", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("Commute Lite except Commute Lite"), catalog);
    expect(results).toEqual([]);
  });

  it("ambiguous brand-only exclusion does not exclude all products", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = createStructuredIntent({
      query: "show me headphones except Northline",
      category: "headphones",
      constraints: { maxPricePaise: null, minPricePaise: null, maxDiscountPct: null },
      preferences: { features: [], keywords: [] },
      useCase: null,
      quantity: 1,
      exclusions: [{ reference: "Northline", resolvedSku: null }],
    });
    const meta = discoverProductsWithMeta(intent, catalog);
    expect(meta.intent.exclusions[0]?.resolvedSku).toBeNull();
    expect(meta.products.length).toBeGreaterThan(0);
  });

  it("run-agent empty message mentions budget and excluded product", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const policies = await getMerchantPoliciesForAgent(getConfiguredDemoMerchantId());
    const result = runAgentWithParsed(
      parseIntent("good headphones under 3k except northline commute lite"),
      policies,
      catalog,
    );
    expect(result.status).toBe("empty");
    expect(result.primary).toBeNull();
    expect(result.explanations[0]?.reason).toBe(
      "No headphones available under ₹3,000 after excluding Northline Commute Lite.",
    );
  });

  it("validateStructuredIntent preserves Gemini exclusions", () => {
    const intent = validateStructuredIntent(
      {
        query: "good headphones under 3k except Commute Lite",
        category: "headphones",
        constraints: { maxPricePaise: 300_000, minPricePaise: null, maxDiscountPct: null },
        preferences: { features: [], keywords: ["good"] },
        useCase: null,
        quantity: 1,
        exclusions: [{ reference: "Commute Lite" }],
      },
      "good headphones under 3k except Commute Lite",
    );
    expect(intent.exclusions).toEqual([{ reference: "Commute Lite", resolvedSku: null }]);
  });
});

describe("exact product discovery", () => {
  it("A. Northline Halo ANC resolves to halo-anc only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("Northline Halo ANC"), catalog);
    expect(skus(results)).toEqual(["halo-anc"]);
  });

  it("B. Northline Halo ANC headphones resolves to halo-anc only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("Northline Halo ANC headphones"), catalog);
    expect(skus(results)).toEqual(["halo-anc"]);
  });

  it("C. Northline Halo ANC under budget with category word resolves to halo-anc only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      parseIntent("Northline Halo ANC under ₹8,389 headphones"),
      catalog,
    );
    expect(skus(results)).toEqual(["halo-anc"]);
  });

  it("D. Northline Halo ANC under ₹5,000 returns no matches", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("Northline Halo ANC under ₹5,000"), catalog);
    expect(results).toEqual([]);
  });

  it("L. Northline Drift buds resolves to drift-buds only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("Northline Drift buds"), catalog);
    expect(skus(results)).toEqual(["drift-buds"]);
  });

  it("M. Northline Drift buds earbuds resolves to drift-buds only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("Northline Drift buds earbuds"), catalog);
    expect(skus(results)).toEqual(["drift-buds"]);
  });

  it("N. Northline Halo ANC under ₹8,389 resolves to halo-anc only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("Northline Halo ANC under ₹8,389"), catalog);
    expect(skus(results)).toEqual(["halo-anc"]);
  });

  it("does not treat generic ANC as an exact product query", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    expect(findExactProductMatch("show me ANC headphones", catalog)).toBeNull();
  });

  it("distinctive keyword Halo ANC resolves to halo-anc only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("Halo ANC"), catalog);
    expect(skus(results)).toEqual(["halo-anc"]);
  });

  it("distinctive keyword Drift buds resolves to drift-buds only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("Drift buds"), catalog);
    expect(skus(results)).toEqual(["drift-buds"]);
  });

  it("exact product with browse language returns one result only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = createStructuredIntent({
      query: "show me Northline Halo ANC",
      category: "headphones",
      constraints: { maxPricePaise: null, minPricePaise: null, maxDiscountPct: null },
      preferences: { features: [], keywords: [] },
      useCase: null,
      quantity: 1,
      discovery: { resultCount: 4, minResults: 4, sortBy: "price", sortOrder: "asc" },
    });
    const results = discoverProducts(intent, catalog);
    expect(skus(results)).toEqual(["halo-anc"]);
  });

  it("exact product with show-me browse language and Gemini-style broad intent", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const policies = await getMerchantPoliciesForAgent(getConfiguredDemoMerchantId());
    const broadIntent = createStructuredIntent({
      query: "show me Northline Halo ANC headphones sorted by price",
      category: "headphones",
      constraints: { maxPricePaise: null, minPricePaise: null, maxDiscountPct: null },
      preferences: { features: [], keywords: [] },
      useCase: null,
      quantity: 1,
      discovery: { resultCount: 4, minResults: 4, sortBy: "price", sortOrder: "asc" },
    });
    const result = runAgentWithParsed(broadIntent, policies, catalog);
    expect(result.status).toBe("ready");
    expect(skus(result.results)).toEqual(["halo-anc"]);
  });

  it("wins over Gemini-style broad category intent", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const policies = await getMerchantPoliciesForAgent(getConfiguredDemoMerchantId());
    const broadIntent = createStructuredIntent({
      query: "Northline Halo ANC under ₹8,389 headphones",
      category: "headphones",
      constraints: {
        maxPricePaise: 838_900,
        minPricePaise: null,
        maxDiscountPct: null,
      },
      preferences: { features: [], keywords: [] },
      useCase: null,
      quantity: 1,
      discovery: { resultCount: null, minResults: 3, sortBy: null, sortOrder: "asc" },
    });
    const result = runAgentWithParsed(broadIntent, policies, catalog);
    expect(result.status).toBe("ready");
    expect(skus(result.results)).toEqual(["halo-anc"]);
    expect(result.results.length).toBe(1);
  });
});

describe("discover-catalog", () => {
  it("show me 4 headphones returns 4 headphone products", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me 4 headphones"), catalog);
    expect(results.length).toBe(4);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
  });

  it("show me headphones sorted by price sorts ascending", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me headphones sorted by price"), catalog);
    expect(results.length).toBeGreaterThan(1);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index]!.pricePaise).toBeGreaterThanOrEqual(results[index - 1]!.pricePaise);
    }
  });

  it("show me headphones most expensive first sorts descending", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me headphones most expensive first"), catalog);
    expect(results.length).toBeGreaterThan(1);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index]!.pricePaise).toBeLessThanOrEqual(results[index - 1]!.pricePaise);
    }
  });

  it("generic earphones query maps to earbuds category", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me earphones");
    expect(intent.category).toBe("earbuds");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.category === "earbuds")).toBe(true);
  });

  it("headphones query never returns soundbars", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me headphones"), catalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
    expect(results.some((product) => product.category === "soundbar")).toBe(false);
  });

  it("E. show me headphones returns headphone products only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me headphones"), catalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
    expect(results.some((product) => product.category === "earbuds")).toBe(false);
  });

  it("F. show me 3 headphones returns 3 headphone products", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me 3 headphones"), catalog);
    expect(results.length).toBe(3);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
  });

  it("G. show me at least 2 earbuds returns at least 2 earbuds", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me at least 2 earbuds"), catalog);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((product) => product.category === "earbuds")).toBe(true);
  });

  it("H. show me headphones cheapest first sorts ascending by price", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me headphones cheapest first"), catalog);
    expect(results.length).toBeGreaterThan(1);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index]!.pricePaise).toBeGreaterThanOrEqual(results[index - 1]!.pricePaise);
    }
  });

  it("I. show me 4 earbuds most expensive first returns 4 earbuds sorted descending", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me 4 earbuds most expensive first"), catalog);
    expect(results.length).toBe(4);
    expect(results.every((product) => product.category === "earbuds")).toBe(true);
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index]!.pricePaise).toBeLessThanOrEqual(results[index - 1]!.pricePaise);
    }
  });

  it("J. show me speakers returns speakers only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me speakers"), catalog);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.category === "speaker")).toBe(true);
  });

  it("K. show me 3 headphones under ₹10,000 cheapest first", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      parseIntent("show me 3 headphones under ₹10,000 cheapest first"),
      catalog,
    );
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results.every((product) => product.category === "headphones")).toBe(true);
    expect(results.every((product) => product.price <= 10_000)).toBe(true);
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index]!.pricePaise).toBeGreaterThanOrEqual(results[index - 1]!.pricePaise);
    }
  });

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
