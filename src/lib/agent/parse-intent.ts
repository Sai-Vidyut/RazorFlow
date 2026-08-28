import { rupeesToPaise } from "@/lib/format";
import { createStructuredIntent, type StructuredIntent } from "./structured-intent";
import type { Product } from "./types";

const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/earbud|buds|in-ear/i, "earbuds"],
  [/speaker|bluetooth speaker/i, "speaker"],
  [/headphone|over-ear|headset/i, "headphones"],
  [/backpack|bag|pack/i, "outdoor"],
  [/case|shell/i, "accessory"],
];

/**
 * Phase 3A deterministic intent parser.
 * Converts natural language into generic StructuredIntent without Northline-specific fields.
 * Phase 3B will replace this with an LLM-backed parser using the same output contract.
 */
export function parseIntent(raw: string): StructuredIntent {
  const text = raw.trim();
  const budgetMatch = text.match(/(?:₹|rs\.?\s*)\s*([\d,]+)/i) ?? text.match(/\b(\d{3,6})\b/);
  const discountMatch = text.match(/(\d{1,2})\s*%/);

  const features: string[] = [];
  const keywords: string[] = [];

  if (/anc|noise\s*cancell/i.test(text)) {
    features.push("anc", "noise-cancelling");
  }
  if (/wireless|bluetooth/i.test(text)) {
    features.push("wireless");
  }
  if (/waterproof/i.test(text)) {
    features.push("waterproof");
  }
  if (/lightweight|compact/i.test(text)) {
    features.push("lightweight");
  }
  if (/portable/i.test(text)) {
    features.push("portable");
  }

  if (/gift|present/i.test(text)) {
    keywords.push("gift");
  }
  if (/travel|flight/i.test(text)) {
    keywords.push("travel");
  }
  if (/hiking|trek/i.test(text)) {
    keywords.push("hiking");
  }

  let category: string | null = null;
  for (const [pattern, mappedCategory] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) {
      category = mappedCategory;
      break;
    }
  }

  const budgetInr = budgetMatch ? Number(budgetMatch[1].replaceAll(",", "")) : null;

  return createStructuredIntent({
    query: text,
    category,
    constraints: {
      maxPricePaise: budgetInr != null ? rupeesToPaise(budgetInr) : null,
      minPricePaise: null,
      maxDiscountPct: discountMatch ? Number(discountMatch[1]) : null,
    },
    preferences: {
      features: [...new Set(features)],
      keywords: [...new Set(keywords)],
    },
    useCase: /gift|present/i.test(text) ? "gift" : /travel|flight/i.test(text) ? "travel" : null,
    quantity: 1,
  });
}

export function findProduct(catalog: Product[], sku: string) {
  return catalog.find((item) => item.sku === sku) ?? null;
}

export function marginPct(price: number, cost: number) {
  return ((price - cost) / price) * 100;
}
