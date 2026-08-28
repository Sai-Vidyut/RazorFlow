import {
  inferCategoryFromQuery,
  normalizeIntentCategory,
  productMatchesCategory,
  type CatalogCategory,
} from "./category-match";
import { rankProducts } from "./match-catalog";
import type { StructuredIntent } from "./structured-intent";
import type { Product } from "./types";

export const DEFAULT_MULTI_RESULT_COUNT = 4;
export const MAX_DISCOVERY_RESULTS = 12;

export type DiscoveryMeta = {
  products: Product[];
  totalMatches: number;
  returnedCount: number;
  requestedCount: number | null;
  sortBy: StructuredIntent["discovery"]["sortBy"];
  sortOrder: StructuredIntent["discovery"]["sortOrder"];
  category: CatalogCategory | null;
};

function resolveIntentCategory(intent: StructuredIntent): CatalogCategory | null {
  return normalizeIntentCategory(intent.category) ?? inferCategoryFromQuery(intent.query);
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

function rankWithinPool(intent: StructuredIntent, products: Product[], catalog: Product[]): Product[] {
  const skuOrder = new Map(products.map((product, index) => [product.sku, index]));
  const ranked = rankProducts(intent, catalog)
    .filter((entry) => entry.score >= 0 && skuOrder.has(entry.product.sku))
    .map((entry) => entry.product);

  if (ranked.length > 0) {
    return ranked;
  }

  return [...products].sort((a, b) => a.sku.localeCompare(b.sku));
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

function resolveTakeCount(intent: StructuredIntent, availableCount: number): number {
  if (availableCount === 0) return 0;

  if (intent.discovery.resultCount != null) {
    return Math.min(intent.discovery.resultCount, availableCount);
  }

  if (intent.discovery.minResults > 1) {
    return Math.min(availableCount, MAX_DISCOVERY_RESULTS);
  }

  if (intent.discovery.sortBy != null && intent.category) {
    return Math.min(availableCount, MAX_DISCOVERY_RESULTS);
  }

  return 1;
}

export function isMultiProductDiscovery(intent: StructuredIntent, resultCount = 1): boolean {
  if (intent.discovery.resultCount != null && intent.discovery.resultCount > 1) {
    return true;
  }
  if (intent.discovery.minResults > 1) {
    return true;
  }
  if (resultCount > 1) {
    return true;
  }
  return false;
}

export function discoverProductsWithMeta(intent: StructuredIntent, catalog: Product[]): DiscoveryMeta {
  const category = resolveIntentCategory(intent);

  let pool = filterAvailable(catalog);
  pool = filterByCategory(pool, category);
  pool = filterByBudget(pool, intent);

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
  };
}

export function discoverProducts(intent: StructuredIntent, catalog: Product[]): Product[] {
  return discoverProductsWithMeta(intent, catalog).products;
}
