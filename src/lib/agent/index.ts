export type {
  AgentExplanation,
  AgentResult,
  DiscoverySummary,
  MerchantPolicies,
  ParsedIntent,
  PolicyVerdict,
  Product,
} from "./types";
export type { StructuredIntent, IntentExclusion } from "./structured-intent";
export type { IntentProvider, IntentExtractionResult } from "./intent-types";
export {
  createStructuredIntent,
  intentDisplayNeed,
  intentMaxBudgetInr,
  structuredIntentFromDb,
  structuredIntentToJson,
} from "./structured-intent";
export {
  validateStructuredIntent,
  StructuredIntentValidationError,
  GEMINI_STRUCTURED_INTENT_JSON_SCHEMA,
} from "./intent-validation";
export { extractIntent, parseIntent, setIntentProviderForTests } from "./intent";
export { GeminiIntentProvider, createGeminiIntentProvider } from "./gemini-intent-provider";
export { runAgentWithParsed } from "./run-agent";
export { parseBudgetInr } from "./budget-parse";
export { parseExclusionReferences, stripExclusionClauses } from "./exclusion-parse";
export { discoverProducts, discoverProductsWithMeta, isMultiProductDiscovery, resolveEffectiveIntent, prepareIntentForDiscovery, DEFAULT_MULTI_RESULT_COUNT, MAX_DISCOVERY_RESULTS } from "./discover-catalog";
export { normalizeIntentCategory, productMatchesCategory, inferCategoryFromQuery } from "./category-match";
export { rankProducts, scoreProduct, recommendationReason } from "./match-catalog";
export { buildDemoPrompts, type DemoPrompt } from "./demo-prompts";
export { findExactProductMatch, reconcileIntentForExactProduct, queryForExactProductMatch, resolveExclusionReference, resolveIntentExclusions, excludedSkusFromIntent } from "./resolve-exact-product";
export { findProduct, marginPct } from "./parse-intent";
