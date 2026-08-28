import type { Product } from "./types";
import type { StructuredIntent } from "./structured-intent";

export type RankedProduct = {
  product: Product;
  score: number;
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function categoriesMatch(intentCategory: string, productCategory: string): boolean {
  const intent = normalizeToken(intentCategory);
  const product = normalizeToken(productCategory);
  return intent === product || product.includes(intent) || intent.includes(product);
}

function metadataFeatures(product: Product): string[] {
  const raw = product.metadata.features;
  if (!Array.isArray(raw)) return [];
  return raw.map(String).map(normalizeToken);
}

function metadataUseCases(product: Product): string[] {
  const raw = product.metadata.useCases;
  if (!Array.isArray(raw)) return [];
  return raw.map(String).map(normalizeToken);
}

function catalogRole(product: Product): string | null {
  const role = product.metadata.catalogRole;
  return typeof role === "string" ? normalizeToken(role) : null;
}

function productHaystack(product: Product): string {
  const metadataText = Object.entries(product.metadata)
    .filter(([key]) => !["catalogRole"].includes(key))
    .map(([, value]) => JSON.stringify(value))
    .join(" ");
  return normalizeToken(
    [product.name, product.blurb, product.category, product.tags.join(" "), metadataText].join(" "),
  );
}

function tokenMatchesHaystack(token: string, haystack: string): boolean {
  const normalized = normalizeToken(token);
  if (!normalized) return false;
  return haystack.includes(normalized);
}

function queryMatchesProduct(intent: StructuredIntent, product: Product): boolean {
  const query = normalizeToken(intent.query);
  const sku = normalizeToken(product.sku);
  const name = normalizeToken(product.name);
  return query.includes(sku) || query.includes(name) || name.split(/\s+/).some((part) => part.length > 3 && query.includes(part));
}

function productMatchesFeature(product: Product, feature: string): boolean {
  const token = normalizeToken(feature);
  if (product.tags.map(normalizeToken).includes(token)) return true;
  if (metadataFeatures(product).includes(token)) return true;
  return tokenMatchesHaystack(token, productHaystack(product));
}

function productMatchesUseCase(product: Product, useCase: string): boolean {
  const token = normalizeToken(useCase);
  if (metadataUseCases(product).includes(token)) return true;
  return tokenMatchesHaystack(token, productHaystack(product));
}

export function scoreProduct(product: Product, intent: StructuredIntent, catalog: Product[]): number {
  let score = 0;

  const role = catalogRole(product);
  const attachOnly = role === "attach";
  const directMatch = queryMatchesProduct(intent, product);

  if (attachOnly && !directMatch) {
    score -= 20;
  }

  if (intent.category && categoriesMatch(intent.category, product.category)) {
    score += 8;
  }

  for (const feature of intent.preferences.features) {
    if (productMatchesFeature(product, feature)) score += 5;
  }

  for (const keyword of intent.preferences.keywords) {
    if (tokenMatchesHaystack(keyword, productHaystack(product))) score += 3;
  }

  if (intent.useCase && productMatchesUseCase(product, intent.useCase)) {
    score += 4;
  }

  const pricePaise = product.pricePaise;
  if (intent.constraints.maxPricePaise != null) {
    if (pricePaise > intent.constraints.maxPricePaise) {
      return -100;
    }
    if (pricePaise <= intent.constraints.maxPricePaise) score += 4;
  }

  if (intent.constraints.minPricePaise != null && pricePaise >= intent.constraints.minPricePaise) {
    score += 2;
  }

  if (directMatch) score += 15;

  const attachTargetSkus = new Set(
    catalog.filter((item) => item.attachSku).map((item) => normalizeToken(item.attachSku!)),
  );
  if (!directMatch && attachTargetSkus.has(normalizeToken(product.sku))) {
    score -= 3;
  }

  return score;
}

export function rankProducts(intent: StructuredIntent, catalog: Product[]): RankedProduct[] {
  const eligible = catalog.filter((product) => product.active && product.inventory > 0);

  return eligible
    .map((product) => ({
      product,
      score: scoreProduct(product, intent, catalog),
    }))
    .sort((a, b) => b.score - a.score || a.product.sku.localeCompare(b.product.sku));
}

export function recommendationReason(product: Product, intent: StructuredIntent): string {
  if (queryMatchesProduct(intent, product)) {
    return `Recommended because the buyer request matches ${product.name}.`;
  }
  if (intent.category && categoriesMatch(intent.category, product.category)) {
    return `Recommended because it matches the requested category (${product.category}).`;
  }
  if (intent.preferences.features.some((feature) => productMatchesFeature(product, feature))) {
    return "Recommended because product attributes align with the buyer preferences.";
  }
  if (intent.constraints.maxPricePaise != null && product.pricePaise <= intent.constraints.maxPricePaise) {
    return "Recommended because it satisfies the stated price constraint.";
  }
  return "Recommended because it is the best available match in the merchant catalog.";
}
