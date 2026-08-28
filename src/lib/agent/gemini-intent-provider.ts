import { GoogleGenAI } from "@google/genai";
import {
  GEMINI_STRUCTURED_INTENT_JSON_SCHEMA,
  StructuredIntentValidationError,
  validateStructuredIntent,
} from "@/lib/agent/intent-validation";
import type { IntentProvider } from "@/lib/agent/intent-types";
import type { StructuredIntent } from "@/lib/agent/structured-intent";
import {
  GEMINI_REQUEST_TIMEOUT_MS,
  getGeminiApiKey,
  getGeminiModel,
} from "@/lib/gemini/config";

const SYSTEM_INSTRUCTION = `You extract buyer intent from natural-language commerce requests.

Return only structured buyer intent according to the provided schema.

Never invent products, prices, inventory, discounts, policies, or payment decisions.

Only extract information supported by the buyer's request.

If information is absent or uncertain, leave the relevant field empty or null according to the schema.

The merchant catalog is the source of truth for products.

The deterministic policy engine is the source of truth for financial authorization.

Do not recommend products. Do not output markdown or explanations.`;

export class GeminiIntentProvider implements IntentProvider {
  constructor(
    private readonly client: GoogleGenAI,
    private readonly model: string,
  ) {}

  async extractIntent(rawRequest: string): Promise<StructuredIntent> {
    const query = rawRequest.trim();
    if (!query) {
      throw new StructuredIntentValidationError("Buyer request is empty");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: query,
        config: {
          abortSignal: controller.signal,
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseJsonSchema: GEMINI_STRUCTURED_INTENT_JSON_SCHEMA,
          temperature: 0.1,
        },
      });

      const text = response.text?.trim();
      if (!text) {
        throw new StructuredIntentValidationError("Gemini returned an empty response");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new StructuredIntentValidationError("Gemini response was not valid JSON");
      }

      return validateStructuredIntent(parsed, query);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createGeminiIntentProvider(): GeminiIntentProvider {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Gemini API key is not configured");
  }

  return new GeminiIntentProvider(new GoogleGenAI({ apiKey }), getGeminiModel());
}
