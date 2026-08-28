import { rupeesToPaise } from "@/lib/format";
import { createStructuredIntent, type StructuredIntent } from "./structured-intent";
import type { Product } from "./types";

const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/earbud|buds|in-ear/i, "earbuds"],
  [/speaker|bluetooth speaker|soundbar/i, "speaker"],
  [/headphone|over-ear|headset/i, "headphones"],
  [/backpack|bag|pack/i, "outdoor"],
  [/case|shell/i, "accessory"],
];

const SORT_DESC_PATTERNS =
  /most expensive first|highest price|high to low|price descending|descending price|expensive to cheapest|most expensive to cheapest/i;
const SORT_ASC_PATTERNS =
  /cheapest first|lowest price|low to high|price ascending|ascending price|cheapest to most expensive|from cheapest/i;
const SORT_BY_PRICE_PATTERNS =
  /sorted by price|sort by price|sorted cheapest|sort cheapest|by price|price order/i;

function parseDiscovery(text: string): Partial<StructuredIntent["discovery"]> {
  const discovery: Partial<StructuredIntent["discovery"]> = {};

  const exactCountMatch =
    text.match(/\bshow me\s+(\d+)\b/i) ??
    text.match(/\bgive me\s+(\d+)\b/i) ??
    text.match(/\b(\d+)\s+(options|products|earbuds|headphones|speakers|items)\b/i);
  if (exactCountMatch) {
    discovery.resultCount = Number(exactCountMatch[1]);
    discovery.minResults = Number(exactCountMatch[1]);
  }

  const atLeastMatch = text.match(/\bat least\s+(\d+)\b/i) ?? text.match(/\b(\d+)\s+or more\b/i);
  if (atLeastMatch) {
    discovery.minResults = Number(atLeastMatch[1]);
    discovery.resultCount = null;
  }

  if (/\bsome\b/i.test(text) && !discovery.resultCount && !discovery.minResults) {
    discovery.minResults = 3;
    discovery.resultCount = null;
  }

  if (SORT_BY_PRICE_PATTERNS.test(text) || SORT_ASC_PATTERNS.test(text) || SORT_DESC_PATTERNS.test(text)) {
    discovery.sortBy = "price";
    discovery.sortOrder = SORT_DESC_PATTERNS.test(text) ? "desc" : "asc";
  }

  return discovery;
}

function parseBudget(text: string): number | null {
  const underMatch = text.match(/under\s+(?:₹|rs\.?\s*)\s*([\d,]+)/i);
  if (underMatch) {
    return Number(underMatch[1].replaceAll(",", ""));
  }
  const budgetMatch = text.match(/(?:₹|rs\.?\s*)\s*([\d,]+)/i) ?? text.match(/\b(\d{3,6})\b/);
  return budgetMatch ? Number(budgetMatch[1].replaceAll(",", "")) : null;
}

/**
 * Phase 3A deterministic intent parser.
 * Converts natural language into generic StructuredIntent without Northline-specific fields.
 * Phase 3B will replace this with an LLM-backed parser using the same output contract.
 */
export function parseIntent(raw: string): StructuredIntent {
  const text = raw.trim();
  const budgetInr = parseBudget(text);
  const discountMatch = text.match(/(\d{1,2})\s*%/);
  const discovery = parseDiscovery(text);

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
    discovery,
  });
}

export function findProduct(catalog: Product[], sku: string) {
  return catalog.find((item) => item.sku === sku) ?? null;
}

export function marginPct(price: number, cost: number) {
  return ((price - cost) / price) * 100;
}
