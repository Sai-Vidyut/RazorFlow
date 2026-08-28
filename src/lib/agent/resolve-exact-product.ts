import { stripExclusionClauses } from "./exclusion-parse";
import { createStructuredIntent, type IntentExclusion, type StructuredIntent } from "./structured-intent";
import type { Product } from "./types";

function normalizeMatchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[₹,]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function queryContainsPhrase(query: string, phrase: string): boolean {
  if (!phrase) return false;
  if (query.includes(phrase)) return true;
  const pattern = new RegExp(`(?:^|\\s)${escapeRegex(phrase)}(?:\\s|$)`);
  return pattern.test(query);
}

function productMatchPhrases(product: Product): string[] {
  const name = normalizeMatchText(product.name);
  const withoutBrand = name.replace(/^northline\s+/, "").trim();
  const phrases = new Set<string>();

  if (name.length >= 4) phrases.add(name);
  if (withoutBrand.length >= 4 && withoutBrand !== name) phrases.add(withoutBrand);

  const words = withoutBrand.split(" ").filter(Boolean);
  for (let size = 2; size <= Math.min(4, words.length); size += 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const phrase = words.slice(index, index + size).join(" ");
      if (phrase.length >= 5) phrases.add(phrase);
    }
  }

  return [...phrases].sort((left, right) => right.length - left.length);
}

function availableProducts(catalog: Product[]): Product[] {
  return catalog.filter((product) => product.active && product.inventory > 0);
}

function isUnsafeExclusionReference(reference: string): boolean {
  const normalized = normalizeMatchText(reference);
  if (normalized.length < 4) return true;
  if (normalized === "northline" || normalized === "north line") return true;
  if (/^(headphones|earbuds|earphones|speakers|soundbar|accessories)$/i.test(normalized)) return true;
  return false;
}

/**
 * Query text with exclusion clauses removed so excluded product names are not treated as the target.
 */
export function queryForExactProductMatch(query: string): string {
  return stripExclusionClauses(query);
}

/**
 * Deterministically resolves a unique catalog product from the buyer query.
 * Returns null when the request is ambiguous or category-only.
 */
export function findExactProductMatch(query: string, catalog: Product[]): Product | null {
  const normalizedQuery = normalizeMatchText(query);
  if (!normalizedQuery) return null;

  const pool = availableProducts(catalog);

  const skuMatches = pool.filter((product) => {
    const sku = product.sku.toLowerCase();
    return queryContainsPhrase(normalizedQuery, sku) || normalizedQuery.includes(sku);
  });
  if (skuMatches.length === 1) return skuMatches[0]!;
  if (skuMatches.length > 1) {
    return [...skuMatches].sort((left, right) => right.sku.length - left.sku.length)[0]!;
  }

  const fullNameMatches = pool
    .filter((product) => {
      const name = normalizeMatchText(product.name);
      return name.length >= 4 && normalizedQuery.includes(name);
    })
    .sort((left, right) => normalizeMatchText(right.name).length - normalizeMatchText(left.name).length);

  if (fullNameMatches.length === 1) return fullNameMatches[0]!;

  if (fullNameMatches.length > 1) {
    const longest = normalizeMatchText(fullNameMatches[0]!.name);
    const tied = fullNameMatches.filter(
      (product) => normalizeMatchText(product.name).length === longest.length,
    );
    if (tied.length === 1) return tied[0]!;
  }

  const phraseToProduct = new Map<string, Product>();
  for (const product of pool) {
    for (const phrase of productMatchPhrases(product)) {
      if (queryContainsPhrase(normalizedQuery, phrase)) {
        phraseToProduct.set(phrase, product);
      }
    }
  }

  const phrases = [...phraseToProduct.keys()].sort((left, right) => right.length - left.length);
  for (const phrase of phrases) {
    const owners = pool.filter((product) =>
      productMatchPhrases(product).some(
        (candidate) => candidate === phrase && queryContainsPhrase(normalizedQuery, candidate),
      ),
    );
    if (owners.length === 1) return owners[0]!;
  }

  return null;
}

/**
 * Resolve one exclusion reference to a unique catalog SKU, or null when ambiguous/unsafe.
 */
export function resolveExclusionReference(reference: string, catalog: Product[]): string | null {
  if (isUnsafeExclusionReference(reference)) return null;
  const product = findExactProductMatch(reference, catalog);
  return product?.sku ?? null;
}

function mergeExclusions(
  primary: IntentExclusion[],
  supplemental: IntentExclusion[],
): IntentExclusion[] {
  const merged = [...primary];
  const seen = new Set(primary.map((entry) => entry.reference.toLowerCase()));

  for (const entry of supplemental) {
    const key = entry.reference.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

/** Fill resolvedSku for each exclusion against the merchant catalog. Unresolved references are kept but not enforced. */
export function resolveIntentExclusions(intent: StructuredIntent, catalog: Product[]): StructuredIntent {
  const exclusions = intent.exclusions.map((entry) => ({
    reference: entry.reference,
    resolvedSku: entry.resolvedSku ?? resolveExclusionReference(entry.reference, catalog),
  }));

  const changed = exclusions.some(
    (entry, index) => entry.resolvedSku !== intent.exclusions[index]?.resolvedSku,
  );
  if (!changed) return intent;

  return createStructuredIntent({
    query: intent.query,
    category: intent.category,
    constraints: intent.constraints,
    preferences: intent.preferences,
    useCase: intent.useCase,
    quantity: intent.quantity,
    discovery: intent.discovery,
    exclusions,
  });
}

export function excludedSkusFromIntent(intent: StructuredIntent): Set<string> {
  return new Set(
    intent.exclusions
      .map((entry) => entry.resolvedSku)
      .filter((sku): sku is string => sku != null),
  );
}

/** When an exact product is named, narrow discovery to that SKU regardless of LLM category breadth. */
export function reconcileIntentForExactProduct(
  intent: StructuredIntent,
  catalog: Product[],
): StructuredIntent {
  const exact = findExactProductMatch(queryForExactProductMatch(intent.query), catalog);
  if (!exact) return intent;

  return createStructuredIntent({
    query: intent.query,
    category: exact.category,
    constraints: intent.constraints,
    preferences: intent.preferences,
    useCase: intent.useCase,
    quantity: intent.quantity,
    discovery: {
      ...intent.discovery,
      resultCount: 1,
      minResults: 1,
    },
    exclusions: intent.exclusions,
  });
}

export { mergeExclusions };
