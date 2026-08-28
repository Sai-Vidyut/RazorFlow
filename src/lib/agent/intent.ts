import { parseIntent as parseIntentDeterministic } from "@/lib/agent/parse-intent";
import { createGeminiIntentProvider } from "@/lib/agent/gemini-intent-provider";
import type { IntentExtractionResult, IntentProvider } from "@/lib/agent/intent-types";
import { StructuredIntentValidationError } from "@/lib/agent/intent-validation";
import { isGeminiConfigured, getGeminiModel } from "@/lib/gemini/config";

let providerOverride: IntentProvider | null = null;

export function setIntentProviderForTests(provider: IntentProvider | null) {
  providerOverride = provider;
}

function resolveGeminiProvider(): IntentProvider {
  if (providerOverride) return providerOverride;
  return createGeminiIntentProvider();
}

function fallbackResult(rawRequest: string, reason: string): IntentExtractionResult {
  return {
    intent: parseIntentDeterministic(rawRequest),
    source: "deterministic-fallback",
    fallbackReason: reason,
  };
}

/**
 * Single server-side intent extraction entry point.
 * Tries Gemini when configured; falls back to the Phase 3A deterministic parser.
 */
export async function extractIntent(rawRequest: string): Promise<IntentExtractionResult> {
  const query = rawRequest.trim();
  if (!query) {
    throw new Error("rawRequest is required");
  }

  if (!isGeminiConfigured()) {
    return fallbackResult(query, "gemini_not_configured");
  }

  try {
    const provider = resolveGeminiProvider();
    const intent = await provider.extractIntent(query);
    return {
      intent,
      source: "gemini",
      model: getGeminiModel(),
    };
  } catch (error) {
    const reason =
      error instanceof StructuredIntentValidationError
        ? "gemini_validation_failed"
        : isAbortError(error)
          ? "gemini_timeout"
          : "gemini_unavailable";

    return fallbackResult(query, reason);
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /aborted|timeout/i.test(error.message))
  );
}

export { parseIntentDeterministic as parseIntent };
