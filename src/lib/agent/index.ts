export type {
  AgentExplanation,
  AgentResult,
  MerchantPolicies,
  ParsedIntent,
  PolicyVerdict,
  Product,
} from "./types";
export type { StructuredIntent } from "./structured-intent";
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
export { rankProducts, scoreProduct, recommendationReason } from "./match-catalog";
export { buildDemoPrompts, type DemoPrompt } from "./demo-prompts";
export { findProduct, marginPct } from "./parse-intent";
