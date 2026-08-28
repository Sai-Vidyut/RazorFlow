import type { StructuredIntent } from "./structured-intent";

export type IntentExtractionSource = "gemini" | "deterministic-fallback";

export type IntentExtractionResult = {
  intent: StructuredIntent;
  source: IntentExtractionSource;
  model?: string;
  fallbackReason?: string;
};

export interface IntentProvider {
  extractIntent(rawRequest: string): Promise<StructuredIntent>;
}

export type IntentExtractionAuditMetadata = {
  provider: IntentExtractionSource;
  model?: string;
  reason?: string;
};
