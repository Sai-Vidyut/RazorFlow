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

const SYSTEM_INSTRUCTION = `You extract structured buyer intent from natural-language commerce requests.

Return ONLY valid JSON matching the schema. No markdown. No product recommendations. Never output SKUs or invent catalog rows.

## Extraction priority (highest first)
1. Exact product/entity references in the query (e.g. "Northline Halo ANC", "Halo ANC", "Drift buds") — preserve in query; do not broaden to category unless no product is named.
2. Category — explicit product-type words OR confidently inferred from use case (see below).
3. Hard constraints: maxPricePaise/minPricePaise (normalize to paise: ₹3,000 = 300000; under 3k = 300000; below ₹3000 = 300000; less than 3000 = 300000; max 3000 = 300000; within 3k = 300000; budget of 3000 = 300000; 3 thousand = 300000).
4. exclusions[] — phrases to exclude (except, excluding, not, without, anything but, other than, don't show, do not include, leave out, I don't want). Put the product phrase only, not the cue word.
5. discovery.mode — "browse" for show/list/compare/multiple options/some; "single" for best/recommend/one top pick (unless an exact count is given).
6. discovery.resultCount / discovery.minResults — exact N, at least N, N or more.
7. discovery.sortBy + discovery.sortOrder — price asc for cheapest/low to high/cheapest first; price desc for most expensive/high to low/expensive to cheap.
8. Soft preferences only: preferences.keywords (good, best, premium, cheap), preferences.features (anc, wireless), useCase (travel, flight, gym, commute, gift).

## Semantic category inference (Gemini responsibility — not SKU selection)
Set category when the product domain is clear from the request, even if the buyer did not name a category literally.

Confident examples:
- long flights / air travel / plane trips → headphones
- gym / workout / running (listen while exercising) → earbuds
- desk listening / home office music → headphones or speakers from context
- charge my earbuds / charging case → accessory
- protect my headphones / carry case → accessory

Leave category null ONLY when genuinely ambiguous, e.g. "something good under 10k" with no product domain or use case that implies one.

Do NOT guess category when uncertain. The catalog will not browse all products without a category.

## Hard vs soft
Hard constraints MUST be extracted when stated. Soft preferences MUST NOT become hard filters.
If uncertain about budget or exclusions, leave null — do not invent them.

You do NOT select products. The deterministic catalog engine enforces category, budget, exclusions, and inventory.`;

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
