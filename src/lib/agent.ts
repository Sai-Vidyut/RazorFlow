// Backward-compatible re-exports for existing imports.
export {
  buildDemoPrompts,
  parseIntent,
  extractIntent,
  runAgentWithParsed,
  marginPct,
  findProduct,
  validateStructuredIntent,
  intentDisplayNeed,
  intentMaxBudgetInr,
  isMultiProductDiscovery,
  type AgentExplanation,
  type AgentResult,
  type ParsedIntent,
  type StructuredIntent,
  type PolicyVerdict,
  type Product,
} from "./agent/index";
