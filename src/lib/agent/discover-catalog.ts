import { rupeesToPaise } from "@/lib/format";
import { parseBudgetInr } from "./budget-parse";
import { parseExclusionReferences } from "./exclusion-parse";
import {
  inferCategoryFromQuery,
  normalizeIntentCategory,
  productMatchesCategory,
  type CatalogCategory,
} from "./category-match";
import {
  isBrowseDiscovery,
  resolveTakeCount,
} from "./intent-discovery-policy";
import {
  excludedSkusFromIntent,
  findExactProductMatch,
  mergeExclusions,
  queryForExactProductMatch,
  reconcileIntentForExactProduct,
  resolveIntentExclusions,
} from "./resolve-exact-product";
import { rankProducts } from "./match-catalog";
import { createStructuredIntent, type StructuredIntent } from "./structured-intent";
import type { Product } from "./types";

export {
  DEFAULT_MULTI_RESULT_COUNT,
  MAX_DISCOVERY_RESULTS,
} from "./intent-discovery-policy";

export type DiscoveryMeta = {
  products: Product[];
  totalMatches: number;
  returnedCount: number;
  requestedCount: number | null;
  sortBy: StructuredIntent["discovery"]["sortBy"];
  sortOrder: StructuredIntent["discovery"]["sortOrder"];
  category: CatalogCategory | null;
  intent: StructuredIntent;
};

function resolveIntentCategory(intent: StructuredIntent): CatalogCategory | null {
  return normalizeIntentCategory(intent.category) ?? inferCategoryFromQuery(intent.query);
}

/**
 * Supplement Gemini structured intent with query-derived hard constraints only when missing.
 * Never relaxes stricter Gemini values.
 */
export function resolveEffectiveIntent(intent: StructuredIntent): StructuredIntent {
  let maxPricePaise = intent.constraints.maxPricePaise;
  if (maxPricePaise == null) {
    const parsedInr = parseBudgetInr(intent.query);
    if (parsedInr != null) {
      maxPricePaise = rupeesToPaise(parsedInr);
    }
  }

  let exclusions = intent.exclusions;
  if (exclusions.length === 0) {
    exclusions = parseExclusionReferences(intent.query).map((reference) => ({
      reference,
      resolvedSku: null as string | null,
    }));
  } else {
    const parsedExclusions = parseExclusionReferences(intent.query).map((reference) => ({
      reference,
      resolvedSku: null as string | null,
    }));
    exclusions = mergeExclusions(intent.exclusions, parsedExclusions);
  }

  const budgetChanged = maxPricePaise !== intent.constraints.maxPricePaise;
  const exclusionsChanged =
    exclusions.length !== intent.exclusions.length ||
    exclusions.some((entry, index) => entry.reference !== intent.exclusions[index]?.reference);

  if (!budgetChanged && !exclusionsChanged) return intent;

  return createStructuredIntent({
    query: intent.query,
    category: intent.category,
    constraints: {
      ...intent.constraints,
      maxPricePaise,
    },
    preferences: intent.preferences,
    useCase: intent.useCase,
    quantity: intent.quantity,
    discovery: intent.discovery,
    exclusions,
  });
}

/** Reconcile Gemini/deterministic intent with catalog entities before discovery. */
export function prepareIntentForDiscovery(rawIntent: StructuredIntent, catalog: Product[]): StructuredIntent {
  const withConstraints = resolveEffectiveIntent(rawIntent);
  const reconciled = reconcileIntentForExactProduct(withConstraints, catalog);
  return resolveIntentExclusions(reconciled, catalog);
}

function passesPriceFilters(product: Product, intent: StructuredIntent): boolean {
  if (intent.constraints.maxPricePaise != null && product.pricePaise > intent.constraints.maxPricePaise) {
    return false;
  }
  if (intent.constraints.minPricePaise != null && product.pricePaise < intent.constraints.minPricePaise) {
    return false;
  }
  return true;
}

function filterAvailable(catalog: Product[]): Product[] {
  return catalog.filter((product) => product.active && product.inventory > 0);
}

function filterByCategory(products: Product[], category: CatalogCategory | null): Product[] {
  if (!category) return products;
  return products.filter((product) => productMatchesCategory(product, category));
}

function filterByBudget(products: Product[], intent: StructuredIntent): Product[] {
  return products.filter((product) => passesPriceFilters(product, intent));
}

function filterByExclusions(products: Product[], excludedSkus: Set<string>): Product[] {
  if (excludedSkus.size === 0) return products;
  return products.filter((product) => !excludedSkus.has(product.sku));
}

function rankWithinPool(intent: StructuredIntent, products: Product[], catalog: Product[]): Product[] {
  const eligible = products.filter((product) => passesPriceFilters(product, intent));
  if (eligible.length === 0) return [];

  const skuOrder = new Map(eligible.map((product, index) => [product.sku, index]));
  const ranked = rankProducts(intent, catalog)
    .filter(
      (entry) =>
        entry.score >= 0 &&
        skuOrder.has(entry.product.sku) &&
        passesPriceFilters(entry.product, intent),
    )
    .map((entry) => entry.product);

  if (ranked.length > 0) {
    return ranked;
  }

  return [...eligible].sort((a, b) => a.sku.localeCompare(b.sku));
}

function sortProducts(products: Product[], intent: StructuredIntent): Product[] {
  const sorted = [...products];
  if (intent.discovery.sortBy === "price") {
    sorted.sort((a, b) =>
      intent.discovery.sortOrder === "desc" ? b.pricePaise - a.pricePaise : a.pricePaise - b.pricePaise,
    );
    return sorted;
  }
  return sorted;
}

export function isMultiProductDiscovery(intent: StructuredIntent, resultCount = 1): boolean {
  return isBrowseDiscovery(intent, resultCount);
}

function emptyDiscoveryMeta(intent: StructuredIntent, category: CatalogCategory | null): DiscoveryMeta {
  return {
    products: [],
    totalMatches: 0,
    returnedCount: 0,
    requestedCount: intent.discovery.resultCount,
    sortBy: intent.discovery.sortBy,
    sortOrder: intent.discovery.sortOrder,
    category,
    intent,
  };
}

export function discoverProductsWithMeta(rawIntent: StructuredIntent, catalog: Product[]): DiscoveryMeta {
  const intent = prepareIntentForDiscovery(rawIntent, catalog);
  const excludedSkus = excludedSkusFromIntent(intent);
  const category = resolveIntentCategory(intent);

  const exact = findExactProductMatch(queryForExactProductMatch(intent.query), catalog);
  if (exact) {
    if (excludedSkus.has(exact.sku)) {
      return emptyDiscoveryMeta(intent, normalizeIntentCategory(exact.category));
    }

    const passesBudget = passesPriceFilters(exact, intent);
    const products = passesBudget ? [exact] : [];

    return {
      products,
      totalMatches: passesBudget ? 1 : 0,
      returnedCount: products.length,
      requestedCount: 1,
      sortBy: intent.discovery.sortBy,
      sortOrder: intent.discovery.sortOrder,
      category: normalizeIntentCategory(exact.category),
      intent,
    };
  }

  let pool = filterAvailable(catalog);
  pool = filterByCategory(pool, category);
  pool = filterByBudget(pool, intent);
  pool = filterByExclusions(pool, excludedSkus);

  const totalMatches = pool.length;

  let ordered = rankWithinPool(intent, pool, catalog);
  ordered = sortProducts(ordered, intent);

  const take = resolveTakeCount(intent, ordered.length);
  const products = ordered.slice(0, take);

  return {
    products,
    totalMatches,
    returnedCount: products.length,
    requestedCount: intent.discovery.resultCount,
    sortBy: intent.discovery.sortBy,
    sortOrder: intent.discovery.sortOrder,
    category,
    intent,
  };
}

export function discoverProducts(intent: StructuredIntent, catalog: Product[]): Product[] {
  return discoverProductsWithMeta(intent, catalog).products;
}
