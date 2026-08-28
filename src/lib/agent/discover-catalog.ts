import { rankProducts } from "./match-catalog";
import type { StructuredIntent } from "./structured-intent";
import type { Product } from "./types";

export const DEFAULT_MULTI_RESULT_COUNT = 4;

function passesPriceFilters(product: Product, intent: StructuredIntent): boolean {
  if (intent.constraints.maxPricePaise != null && product.pricePaise > intent.constraints.maxPricePaise) {
    return false;
  }
  if (intent.constraints.minPricePaise != null && product.pricePaise < intent.constraints.minPricePaise) {
    return false;
  }
  return true;
}

function passesCategoryFilter(product: Product, intent: StructuredIntent): boolean {
  if (!intent.category) return true;
  const category = intent.category.toLowerCase();
  const productCategory = product.category.toLowerCase();
  return (
    productCategory === category ||
    productCategory.includes(category) ||
    category.includes(productCategory)
  );
}

function sortProducts(products: Product[], intent: StructuredIntent): Product[] {
  const sorted = [...products];
  if (intent.discovery.sortBy === "price") {
    sorted.sort((a, b) =>
      intent.discovery.sortOrder === "desc" ? b.pricePaise - a.pricePaise : a.pricePaise - b.pricePaise,
    );
  }
  return sorted;
}

function resolveTakeCount(intent: StructuredIntent, availableCount: number): number {
  if (intent.discovery.resultCount != null) {
    return Math.min(intent.discovery.resultCount, availableCount);
  }
  if (intent.discovery.minResults > 1) {
    return Math.min(Math.max(intent.discovery.minResults, DEFAULT_MULTI_RESULT_COUNT), availableCount);
  }
  return Math.min(1, availableCount);
}

export function isMultiProductDiscovery(intent: StructuredIntent): boolean {
  return intent.discovery.resultCount != null || intent.discovery.minResults > 1;
}

export function discoverProducts(intent: StructuredIntent, catalog: Product[]): Product[] {
  const ranked = rankProducts(intent, catalog).filter((entry) => entry.score >= 0);
  let products = ranked.map((entry) => entry.product);

  products = products.filter(
    (product) => product.active && product.inventory > 0 && passesPriceFilters(product, intent),
  );

  if (intent.category) {
    const categoryMatches = products.filter((product) => passesCategoryFilter(product, intent));
    if (categoryMatches.length > 0) {
      products = categoryMatches;
    }
  }

  products = sortProducts(products, intent);

  const take = resolveTakeCount(intent, products.length);
  return products.slice(0, take);
}
