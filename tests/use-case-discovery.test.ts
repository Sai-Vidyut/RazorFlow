import { describe, expect, it } from "vitest";
import { discoverProducts, discoverProductsWithMeta } from "@/lib/agent/discover-catalog";
import { runAgentWithParsed } from "@/lib/agent/run-agent";
import { createStructuredIntent, type StructuredIntent } from "@/lib/agent/structured-intent";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { getMerchantPoliciesForAgent } from "@/lib/services/policies";

/** Simulates Gemini output after semantic category inference — not live API. */
function inferredIntent(
  query: string,
  fields: {
    category?: string | null;
    maxPriceInr?: number | null;
    useCase?: string | null;
    keywords?: string[];
    mode?: "browse" | "single" | null;
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
      mode: fields.mode ?? "browse",
      resultCount: null,
      minResults: 1,
      sortBy: null,
      sortOrder: "asc",
    },
    exclusions: [],
  });
}

describe("use-case semantic category discovery", () => {
  it("long flights under 10k with inferred headphones category returns headphones only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      inferredIntent("I want something for long flights under 10k", {
        category: "headphones",
        maxPriceInr: 10_000,
        useCase: "flight",
        keywords: ["travel"],
      }),
      catalog,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.category === "headphones" && product.price <= 10_000)).toBe(
      true,
    );
    expect(results.some((product) => product.category === "accessory")).toBe(false);
  });

  it("gym use case with inferred earbuds category returns earbuds only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      inferredIntent("something for the gym under 5k", {
        category: "earbuds",
        maxPriceInr: 5000,
        useCase: "gym",
      }),
      catalog,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.category === "earbuds")).toBe(true);
  });

  it("charging earbuds request with accessory category returns accessories only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      inferredIntent("something to charge my earbuds under 2k", {
        category: "accessory",
        maxPriceInr: 2000,
        useCase: null,
      }),
      catalog,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.category === "accessory")).toBe(true);
    expect(results.some((product) => product.category === "earbuds")).toBe(false);
  });

  it("headphone protection request with accessory category returns accessories only", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      inferredIntent("something to protect my headphones", {
        category: "accessory",
        useCase: null,
      }),
      catalog,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.category === "accessory")).toBe(true);
  });

  it("genuinely ambiguous request with null category returns empty catalog browse", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const meta = discoverProductsWithMeta(
      inferredIntent("show me something good under 10k", {
        category: null,
        maxPriceInr: 10_000,
        keywords: ["good"],
      }),
      catalog,
    );
    expect(meta.products).toEqual([]);
    expect(meta.returnedCount).toBe(0);
  });

  it("ambiguous request produces safe empty agent state with category guidance", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const policies = await getMerchantPoliciesForAgent(getConfiguredDemoMerchantId());
    const result = runAgentWithParsed(
      inferredIntent("show me something good under 10k", {
        category: null,
        maxPriceInr: 10_000,
        keywords: ["good"],
      }),
      policies,
      catalog,
    );
    expect(result.status).toBe("empty");
    expect(result.primary).toBeNull();
    expect(result.results).toEqual([]);
    expect(result.explanations[0]?.reason).toMatch(/Could not determine a product category/i);
    expect(result.explanations[0]?.reason).toMatch(/₹10,000/i);
  });

  it("null category never returns cross-category accessories when budget is set", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const results = discoverProducts(
      inferredIntent("I want something for long flights under 10k", {
        category: null,
        maxPriceInr: 10_000,
        useCase: "flight",
        keywords: ["long flights"],
      }),
      catalog,
    );
    expect(results).toEqual([]);
  });
});
