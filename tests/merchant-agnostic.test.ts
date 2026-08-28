import { describe, expect, it } from "vitest";
import { buildDemoPrompts } from "@/lib/agent/demo-prompts";
import type { Product } from "@/lib/agent/types";
import { buildPolicyCopy } from "@/lib/policy/copy";

const sampleProduct = (overrides: Partial<Product> = {}): Product => ({
  id: "p1",
  sku: "sample-primary",
  name: "Sample Primary Product",
  blurb: "A sample product",
  price: 1000,
  pricePaise: 100000,
  cost: 600,
  costPaise: 60000,
  category: "electronics",
  tags: ["sample"],
  metadata: { catalogRole: "primary" },
  inventory: 10,
  active: true,
  image: "/products/placeholder.png",
  imageAlt: "Sample product",
  attachSku: "sample-attach",
  attachRate: 0.3,
  ...overrides,
});

describe("merchant-agnostic presentation helpers", () => {
  it("builds policy copy from live policy values", () => {
    const copy = buildPolicyCopy({
      merchant: "Demo Store",
      maxDiscountPct: 15,
      minMarginPct: 20,
      maxOrderInr: 10000,
      minAttachRatePct: 40,
      allowCrossSell: true,
      requireBudgetFit: true,
    });

    expect(copy.some((item) => item.rule.includes("15%"))).toBe(true);
    expect(copy.some((item) => item.rule.includes("20%"))).toBe(true);
    expect(copy.some((item) => item.why.length > 0)).toBe(true);
    expect(copy.join(" ").toLowerCase()).not.toContain("halo");
  });

  it("builds demo prompts from catalog without hardcoded merchant names", () => {
    const catalog = [
      sampleProduct(),
      sampleProduct({
        id: "p2",
        sku: "sample-attach",
        name: "Sample Attach Product",
        category: "accessory",
        metadata: { catalogRole: "attach" },
        attachSku: undefined,
        attachRate: undefined,
      }),
    ];

    const prompts = buildDemoPrompts(catalog, { maxDiscountPct: 12 });
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.some((prompt) => prompt.id === "policy-block")).toBe(true);
    expect(prompts.map((prompt) => prompt.text).join(" ").toLowerCase()).not.toContain("northline");
  });
});
