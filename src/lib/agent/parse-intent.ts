import { rupeesToPaise } from "@/lib/format";
import { parseBudgetInr } from "./budget-parse";
import { parseExclusionReferences } from "./exclusion-parse";
import { inferCategoryFromQuery } from "./category-match";
import { createStructuredIntent, type StructuredIntent } from "./structured-intent";
import type { Product } from "./types";

/** Order matters: soundbar before speaker; earphones before generic patterns. */
const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/\bsoundbar|\btv soundbar/i, "soundbar"],
  [/earphone|earbud|in-ear|\bbuds\b|wireless earphone/i, "earbuds"],
  [/headphone|over-ear|headset|over ear/i, "headphones"],
  [/\bbluetooth speaker|\bportable speaker|\bspeakers?\b/i, "speaker"],
  [/backpack|bag|pack/i, "outdoor"],
  [/case|shell|cable|charger/i, "accessory"],
];

const SORT_DESC_PATTERNS =
  /most expensive first|highest price|high to low|price descending|descending price|expensive to cheapest|most expensive to cheapest|expensive first/i;
const SORT_ASC_PATTERNS =
  /cheapest first|lowest price|low to high|price ascending|ascending price|cheapest to most expensive|from cheapest|price wise|price-wise|sort.*price/i;
const SORT_BY_PRICE_PATTERNS =
  /sorted by price|sort by price|sorted cheapest|sort cheapest|by price|price order/i;

const BROWSE_CUES =
  /\b(options|sort them|sort these|compare|at least \d+|\d+\s+or more|some options|give me some|show me \d+|give me \d+|\d+\s+(options|products|items))\b/i;

const SINGLE_RECOMMENDATION =
  /\b(recommend|top pick|for a flight|for travel|for gift|for hiking)\b/i;

function parseDiscovery(text: string, category: string | null): Partial<StructuredIntent["discovery"]> {
  const discovery: Partial<StructuredIntent["discovery"]> = {};

  const exactCountMatch =
    text.match(/\bshow me\s+(\d+)\b/i) ??
    text.match(/\bgive me\s+(\d+)\b/i) ??
    text.match(/\b(\d+)\s+(options|products|earbuds|headphones|speakers|earphones|items)\b/i);
  if (exactCountMatch) {
    discovery.resultCount = Number(exactCountMatch[1]);
    discovery.minResults = Number(exactCountMatch[1]);
  }

  const atLeastMatch = text.match(/\bat least\s+(\d+)\b/i) ?? text.match(/\b(\d+)\s+or more\b/i);
  if (atLeastMatch) {
    discovery.minResults = Number(atLeastMatch[1]);
    discovery.resultCount = null;
  }

  if (/\bsome\b/i.test(text) && /\b(options|products|choices)\b/i.test(text)) {
    discovery.minResults = 3;
    discovery.resultCount = null;
  } else if (/\bsome\b/i.test(text) && category && !discovery.resultCount) {
    discovery.minResults = 3;
    discovery.resultCount = null;
  }

  if (SORT_BY_PRICE_PATTERNS.test(text) || SORT_ASC_PATTERNS.test(text) || SORT_DESC_PATTERNS.test(text)) {
    discovery.sortBy = "price";
    discovery.sortOrder = SORT_DESC_PATTERNS.test(text) ? "desc" : "asc";
  }

  if (
    category &&
    (discovery.sortBy === "price" || /\bsort them\b|\bsort these\b/i.test(text)) &&
    BROWSE_CUES.test(text)
  ) {
    if (!discovery.resultCount) {
      discovery.minResults = Math.max(discovery.minResults ?? 1, 3);
    }
  }

  if (category && discovery.sortBy === "price" && /\bsort them\b|\bprice wise\b|\bprice-wise\b/i.test(text)) {
    if (!discovery.resultCount) {
      discovery.minResults = Math.max(discovery.minResults ?? 1, 3);
    }
  }

  const wantsBrowse = BROWSE_CUES.test(text) || (discovery.sortBy === "price" && category != null);
  const wantsSingle =
    !wantsBrowse &&
    (SINGLE_RECOMMENDATION.test(text) || /\bthe best\b/i.test(text)) &&
    !/\d+\s+(earbuds|headphones|speakers|products|options)/i.test(text);

  if (wantsSingle) {
    discovery.mode = "single";
    discovery.resultCount = null;
    discovery.minResults = 1;
  } else if (
    category &&
    /\bshow me\b/i.test(text) &&
    !/\b(the best|recommend|top pick)\b/i.test(text) &&
    !discovery.resultCount
  ) {
    discovery.mode = "browse";
    discovery.minResults = Math.max(discovery.minResults ?? 1, 3);
  } else if (wantsBrowse || (category && discovery.sortBy === "price")) {
    discovery.mode = "browse";
  }

  return discovery;
}

export { parseBudgetInr } from "./budget-parse";

function parseBudget(text: string): number | null {
  return parseBudgetInr(text);
}

function parseCategory(text: string): string | null {
  for (const [pattern, mappedCategory] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) {
      return mappedCategory;
    }
  }
  return inferCategoryFromQuery(text);
}

/**
 * Phase 3A deterministic intent parser.
 * Converts natural language into generic StructuredIntent without Northline-specific fields.
 */
export function parseIntent(raw: string): StructuredIntent {
  const text = raw.trim();
  const budgetInr = parseBudget(text);
  const discountMatch = text.match(/(\d{1,2})\s*%/);
  const category = parseCategory(text);
  const discovery = parseDiscovery(text, category);
  const useCase = /gift|present/i.test(text) ? "gift" : /travel|flight/i.test(text) ? "travel" : null;

  if (discovery.mode == null) {
    if (useCase && !discovery.resultCount && (discovery.minResults ?? 1) <= 1) {
      discovery.mode = "single";
    } else if (category) {
      discovery.mode = "browse";
    }
  }

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
  if (/\b(best|recommend|top pick)\b/i.test(text)) {
    keywords.push("best");
  }
  if (/\bpremium\b/i.test(text)) {
    keywords.push("premium");
  }
  if (/\bcheap\b/i.test(text)) {
    keywords.push("cheap");
  }
  if (/\bgood\b/i.test(text)) {
    keywords.push("good");
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
    useCase,
    quantity: 1,
    discovery,
    exclusions: parseExclusionReferences(text).map((reference) => ({
      reference,
      resolvedSku: null,
    })),
  });
}

export function findProduct(catalog: Product[], sku: string) {
  return catalog.find((item) => item.sku === sku) ?? null;
}

export function marginPct(price: number, cost: number) {
  return ((price - cost) / price) * 100;
}
