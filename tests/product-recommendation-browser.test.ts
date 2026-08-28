import { describe, expect, it } from "vitest";
import { parseIntent } from "@/lib/agent/parse-intent";
import { isSequentialBrowseMode } from "@/components/desk/product-recommendation-browser";
import type { AgentResult } from "@/lib/agent/types";

function mockResult(results: AgentResult["results"]): AgentResult {
  return {
    status: "ready",
    intent: parseIntent("show me 3 earbuds"),
    primary: results[0] ?? null,
    attach: null,
    results,
    discoverySummary: {
      totalMatches: results.length,
      returnedCount: results.length,
      requestedCount: 3,
      sortBy: null,
      sortOrder: "asc",
      category: "earbuds",
    },
    discountPct: 0,
    subtotal: results[0]?.price ?? 0,
    marginPct: 20,
    aovLift: 0,
    explanations: [],
    policies: [],
    blockedReason: null,
  };
}

describe("sequential recommendation browser mode", () => {
  it("activates only when multiple results exist", () => {
    const single = mockResult([
      {
        sku: "a",
        name: "A",
        blurb: "",
        price: 100,
        pricePaise: 10000,
        cost: 50,
        costPaise: 5000,
        category: "earbuds",
        tags: [],
        metadata: {},
        inventory: 1,
        active: true,
        image: "/a.svg",
        imageAlt: "A",
      },
    ]);
    expect(isSequentialBrowseMode(single)).toBe(false);

    const multi = mockResult([
      ...single.results,
      { ...single.results[0]!, sku: "b", name: "B" },
    ]);
    expect(isSequentialBrowseMode(multi)).toBe(true);
  });
});
