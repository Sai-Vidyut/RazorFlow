import type { Product } from "@/lib/agent/types";

export type DemoPrompt = {
  id: string;
  label: string;
  text: string;
};

type PromptPolicies = {
  maxDiscountPct: number;
};

function formatBudgetInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function shortProductLabel(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return parts.slice(-2).join(" ");
}

/**
 * Picks the best primary catalog item for showcase/demo prompts.
 */
export function pickPrimaryCatalogProduct(catalog: Product[]): Product | undefined {
  if (catalog.length === 0) return undefined;

  const primaries = catalog.filter((product) => product.metadata?.catalogRole === "primary");
  const pool = primaries.length > 0 ? primaries : catalog;

  return [...pool].sort((left, right) => right.pricePaise - left.pricePaise)[0];
}

/**
 * Builds desk sample prompts from the active catalog and merchant policies.
 * No merchant-specific product names are embedded here.
 */
export function buildDemoPrompts(catalog: Product[], policies: PromptPolicies): DemoPrompt[] {
  if (catalog.length === 0) {
    return [
      {
        id: "generic",
        label: "Sample request",
        text: "Looking for a product under ₹5,000 with free delivery",
      },
    ];
  }

  const primary = pickPrimaryCatalogProduct(catalog);
  if (!primary) return [];

  const secondary = catalog.find((product) => product.sku !== primary.sku) ?? catalog[1];
  const prompts: DemoPrompt[] = [];
  const budgetAmount = Math.ceil(primary.price * 1.12);

  prompts.push({
    id: "budget-fit",
    label: primary.category ? `Shop ${primary.category}` : "Budget fit",
    text: `${primary.name} under ${formatBudgetInr(budgetAmount)}`,
  });

  if (secondary) {
    const secondaryBudget = Math.ceil(secondary.price * 1.15);
    prompts.push({
      id: "category-browse",
      label: secondary.category ? `Browse ${secondary.category}` : "Browse catalog",
      text: `Looking for ${secondary.category ?? "products"} under ${formatBudgetInr(secondaryBudget)}`,
    });
  }

  const blockDiscount = Math.min(policies.maxDiscountPct + 13, 40);
  if (blockDiscount > policies.maxDiscountPct) {
    const shortLabel = shortProductLabel(primary.name);
    prompts.push({
      id: "policy-block",
      label: `${blockDiscount}% off ${shortLabel.split(" ")[0]}`,
      text: `${primary.name} at ${blockDiscount}% off`,
    });
  }

  return prompts;
}

/** @deprecated Use buildDemoPrompts with live catalog — kept for gradual migration */
export const demoPrompts: DemoPrompt[] = [];
