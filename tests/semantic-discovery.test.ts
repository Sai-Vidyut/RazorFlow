import { describe, expect, it } from "vitest";
import { discoverProducts, discoverProductsWithMeta } from "@/lib/agent/discover-catalog";
import { parseIntent } from "@/lib/agent/parse-intent";
import { parseBudgetInr } from "@/lib/agent/budget-parse";
import { resolveDiscoveryMode, resolveTakeCount } from "@/lib/agent/intent-discovery-policy";
import { runAgentWithParsed } from "@/lib/agent/run-agent";
import { createStructuredIntent, type StructuredIntent } from "@/lib/agent/structured-intent";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { getMerchantPoliciesForAgent } from "@/lib/services/policies";
import type { Product } from "@/lib/agent/types";

/** Simulates Gemini structured output — tests deterministic enforcement, not live Gemini calls. */
function geminiStyleIntent(
  query: string,
  fields: {
    category?: string | null;
    maxPriceInr?: number | null;
    mode?: "browse" | "single" | null;
    resultCount?: number | null;
    minResults?: number;
    sortBy?: "price" | "score" | null;
    sortOrder?: "asc" | "desc";
    exclusions?: string[];
    keywords?: string[];
    useCase?: string | null;
  },
): StructuredIntent {
  return createStructuredIntent({
    query,
    category: fields.category ?? null,
    constraints: {
      maxPricePaise: fields.maxPriceInr != null ? fields.maxPriceInr * 100 : null,
      minPricePaise: null,
      maxDiscountPct: null,
    },
    preferences: {
      features: [],
      keywords: fields.keywords ?? [],
    },
    useCase: fields.useCase ?? null,
    quantity: 1,
    discovery: {
      mode: fields.mode ?? null,
      resultCount: fields.resultCount ?? null,
      minResults: fields.minResults ?? 1,
      sortBy: fields.sortBy ?? null,
      sortOrder: fields.sortOrder ?? "asc",
    },
    exclusions: (fields.exclusions ?? []).map((reference) => ({ reference, resolvedSku: null })),
  });
}

function assertAllHeadphonesUnder(products: Product[], maxInr: number) {
  expect(products.length).toBeGreaterThan(0);
  expect(products.every((p) => p.category === "headphones" && p.price <= maxInr)).toBe(true);
  expect(products.some((p) => p.category === "earbuds" || p.category === "soundbar")).toBe(false);
}

function assertAscendingByPrice(products: Product[]) {
  for (let i = 1; i < products.length; i += 1) {
    expect(products[i]!.pricePaise).toBeGreaterThanOrEqual(products[i - 1]!.pricePaise);
  }
}

function assertDescendingByPrice(products: Product[]) {
  for (let i = 1; i < products.length; i += 1) {
    expect(products[i]!.pricePaise).toBeLessThanOrEqual(products[i - 1]!.pricePaise);
  }
}

describe("semantic structured intent discovery", () => {
  it("1. headphones under 3k (Gemini-style)", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      geminiStyleIntent("headphones under 3k", { category: "headphones", maxPriceInr: 3000, mode: "browse" }),
      catalog,
    );
    assertAllHeadphonesUnder(results, 3000);
  });

  it("2. headphones below ₹3000 via fallback budget parser", async () => {
    expect(parseBudgetInr("headphones below ₹3000")).toBe(3000);
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("show me headphones below ₹3000"), catalog);
    assertAllHeadphonesUnder(results, 3000);
  });

  it("3. show me 3 headphones", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = geminiStyleIntent("show me 3 headphones", {
      category: "headphones",
      mode: "browse",
      resultCount: 3,
      minResults: 3,
    });
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBe(3);
    expect(results.every((p) => p.category === "headphones")).toBe(true);
  });

  it("4. give me at least 2 earbuds", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      geminiStyleIntent("give me at least 2 earbuds", {
        category: "earbuds",
        mode: "browse",
        minResults: 2,
      }),
      catalog,
    );
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((p) => p.category === "earbuds")).toBe(true);
  });

  it("5. cheapest headphones sorts ascending by price", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      geminiStyleIntent("cheapest headphones", {
        category: "headphones",
        mode: "browse",
        sortBy: "price",
        sortOrder: "asc",
      }),
      catalog,
    );
    expect(results.length).toBeGreaterThan(1);
    assertAscendingByPrice(results);
  });

  it("6. headphones from expensive to cheap sorts descending", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      geminiStyleIntent("headphones from expensive to cheap", {
        category: "headphones",
        mode: "browse",
        sortBy: "price",
        sortOrder: "desc",
      }),
      catalog,
    );
    expect(results.length).toBeGreaterThan(1);
    assertDescendingByPrice(results);
  });

  it("7. headphones under 5k cheapest first filters then sorts", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      geminiStyleIntent("headphones under 5k cheapest first", {
        category: "headphones",
        maxPriceInr: 5000,
        mode: "browse",
        sortBy: "price",
        sortOrder: "asc",
      }),
      catalog,
    );
    assertAllHeadphonesUnder(results, 5000);
    assertAscendingByPrice(results);
  });

  it("8. headphones except Commute Lite", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      geminiStyleIntent("headphones except Commute Lite", {
        category: "headphones",
        mode: "browse",
        exclusions: ["Commute Lite"],
      }),
      catalog,
    );
    expect(results.every((p) => p.category === "headphones")).toBe(true);
    expect(results.some((p) => p.sku === "commute-lite")).toBe(false);
  });

  it("9. headphones other than Commute Lite", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      geminiStyleIntent("headphones other than Commute Lite", {
        category: "headphones",
        mode: "browse",
        exclusions: ["Commute Lite"],
      }),
      catalog,
    );
    expect(results.some((p) => p.sku === "commute-lite")).toBe(false);
    expect(results.length).toBeGreaterThan(0);
  });

  it("10. Northline Halo ANC exact product", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(parseIntent("Northline Halo ANC"), catalog);
    expect(results.map((p) => p.sku)).toEqual(["halo-anc"]);
  });

  it("11. Halo ANC under 5k returns empty", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      geminiStyleIntent("Halo ANC under 5k", {
        category: "headphones",
        maxPriceInr: 5000,
        mode: "single",
      }),
      catalog,
    );
    expect(results).toEqual([]);
  });

  it("12. exact product with impossible budget stays empty without substitution", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const policies = await getMerchantPoliciesForAgent(getConfiguredDemoMerchantId());
    const result = runAgentWithParsed(parseIntent("Northline Halo ANC under 5000"), policies, catalog);
    expect(result.status).toBe("empty");
    expect(result.primary).toBeNull();
    expect(result.results).toEqual([]);
  });

  it("13. headphones request never returns earbuds or soundbars", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      geminiStyleIntent("show me headphones", { category: "headphones", mode: "browse" }),
      catalog,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.category === "headphones")).toBe(true);
  });

  it("14. zero qualifying products returns empty", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      geminiStyleIntent("headphones under 2k", { category: "headphones", maxPriceInr: 2000, mode: "browse" }),
      catalog,
    );
    expect(results).toEqual([]);
  });

  it("15. category budget browse returns multiple products", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const meta = discoverProductsWithMeta(
      geminiStyleIntent("show me headphones under 5k", {
        category: "headphones",
        maxPriceInr: 5000,
        mode: "browse",
      }),
      catalog,
    );
    expect(meta.returnedCount).toBeGreaterThan(1);
    expect(meta.products.every((p) => p.category === "headphones" && p.price <= 5000)).toBe(true);
  });

  it("16. browse result list never includes out-of-constraint products", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = geminiStyleIntent("show me 4 headphones under 6k, cheapest first, except Commute Lite", {
      category: "headphones",
      maxPriceInr: 6000,
      mode: "browse",
      resultCount: 4,
      sortBy: "price",
      sortOrder: "asc",
      exclusions: ["Commute Lite"],
    });
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBeLessThanOrEqual(4);
    expect(results.every((p) => p.category === "headphones" && p.price <= 6000)).toBe(true);
    expect(results.some((p) => p.sku === "commute-lite")).toBe(false);
    assertAscendingByPrice(results);
  });

  it("single recommendation mode returns one product", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = geminiStyleIntent("what are your best headphones?", {
      category: "headphones",
      mode: "single",
      keywords: ["best"],
    });
    expect(resolveDiscoveryMode(intent)).toBe("single");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBe(1);
  });

  it("resolveTakeCount respects browse default cap", () => {
    const browse = geminiStyleIntent("show me headphones", { category: "headphones", mode: "browse" });
    expect(resolveTakeCount(browse, 10)).toBe(4);
    const single = geminiStyleIntent("best headphones", { category: "headphones", mode: "single", keywords: ["best"] });
    expect(resolveTakeCount(single, 10)).toBe(1);
  });
});

describe("fallback parser browse mode", () => {
  it("show me headphones under 5k returns multiple via browse mode", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const intent = parseIntent("show me headphones under 5k");
    expect(resolveDiscoveryMode(intent)).toBe("browse");
    const results = discoverProducts(intent, catalog);
    expect(results.length).toBeGreaterThan(1);
    expect(results.every((p) => p.category === "headphones" && p.price <= 5000)).toBe(true);
  });

  it("recommend the best headphones returns single mode", async () => {
    const intent = parseIntent("recommend me the best headphones");
    expect(resolveDiscoveryMode(intent)).toBe("single");
  });
});
