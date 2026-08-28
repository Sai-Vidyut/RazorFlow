import type { StructuredIntent } from "./structured-intent";

export const DEFAULT_MULTI_RESULT_COUNT = 4;
export const MAX_DISCOVERY_RESULTS = 12;

export type DiscoveryMode = "browse" | "single";

const SINGLE_KEYWORDS = new Set(["best", "top", "recommend", "recommendation", "top pick"]);

/**
 * Resolve browse vs single-recommendation mode from structured intent fields.
 * Does not inspect raw query text — Gemini (or the fallback parser) must populate discovery.
 */
export function resolveDiscoveryMode(intent: StructuredIntent): DiscoveryMode {
  if (intent.discovery.mode === "browse" || intent.discovery.mode === "single") {
    return intent.discovery.mode;
  }

  if (intent.discovery.resultCount != null && intent.discovery.resultCount > 1) {
    return "browse";
  }

  if (intent.discovery.minResults > 1) {
    return "browse";
  }

  if (intent.discovery.sortBy != null && intent.category) {
    return "browse";
  }

  if (intent.preferences.keywords.some((keyword) => SINGLE_KEYWORDS.has(keyword))) {
    return "single";
  }

  if (
    intent.useCase &&
    intent.discovery.resultCount == null &&
    intent.discovery.minResults <= 1 &&
    intent.discovery.sortBy == null
  ) {
    return "single";
  }

  if (intent.category) {
    return "browse";
  }

  return "single";
}

/** How many products to return after hard filters, ranking, and sorting. */
export function resolveTakeCount(intent: StructuredIntent, availableCount: number): number {
  if (availableCount === 0) return 0;

  if (intent.discovery.resultCount != null) {
    return Math.min(intent.discovery.resultCount, availableCount);
  }

  if (resolveDiscoveryMode(intent) === "single") {
    return 1;
  }

  if (intent.discovery.minResults > 1) {
    return Math.min(availableCount, MAX_DISCOVERY_RESULTS);
  }

  return Math.min(availableCount, DEFAULT_MULTI_RESULT_COUNT);
}

export function isBrowseDiscovery(intent: StructuredIntent, resultCount = 1): boolean {
  if (resultCount > 1) return true;
  if (intent.discovery.resultCount != null && intent.discovery.resultCount > 1) return true;
  if (intent.discovery.minResults > 1) return true;
  return resolveDiscoveryMode(intent) === "browse";
}
