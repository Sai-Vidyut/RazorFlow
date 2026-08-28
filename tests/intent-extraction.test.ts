import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentWithParsed } from "@/lib/agent/run-agent";
import { parseIntent } from "@/lib/agent/parse-intent";
import { createStructuredIntent } from "@/lib/agent/structured-intent";
import {
  validateStructuredIntent,
  StructuredIntentValidationError,
} from "@/lib/agent/intent-validation";
import { extractIntent, setIntentProviderForTests } from "@/lib/agent/intent";
import type { IntentProvider } from "@/lib/agent/intent-types";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { getMerchantPoliciesForAgent } from "@/lib/services/policies";

describe("StructuredIntent validation", () => {
  it("validates a complete intent payload", () => {
    const intent = validateStructuredIntent(
      {
        query: "wireless headphones under ₹15,000",
        category: "headphones",
        constraints: {
          maxPricePaise: 1500000,
          minPricePaise: null,
          maxDiscountPct: null,
        },
        preferences: {
          features: ["wireless", "noise-cancelling"],
          keywords: ["flight"],
        },
        useCase: "travel",
        quantity: 1,
      },
      "fallback query",
    );

    expect(intent.constraints.maxPricePaise).toBe(1500000);
    expect(intent.preferences.features).toEqual(["wireless", "noise-cancelling"]);
    expect(intent.version).toBe(1);
  });

  it("rejects invalid discount percentages", () => {
    expect(() =>
      validateStructuredIntent(
        {
          query: "test",
          category: null,
          constraints: { maxPricePaise: null, minPricePaise: null, maxDiscountPct: 120 },
          preferences: { features: [], keywords: [] },
          useCase: null,
          quantity: 1,
        },
        "test",
      ),
    ).toThrow(StructuredIntentValidationError);
  });

  it("falls back to rawRequest when query is empty", () => {
    const intent = validateStructuredIntent(
      {
        query: "",
        category: null,
        constraints: { maxPricePaise: null, minPricePaise: null, maxDiscountPct: null },
        preferences: { features: [], keywords: [] },
        useCase: null,
        quantity: 1,
      },
      "Buyer typed this",
    );

    expect(intent.query).toBe("Buyer typed this");
  });
});

describe("extractIntent provider boundary", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    setIntentProviderForTests(null);
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    setIntentProviderForTests(null);
    if (originalKey) {
      process.env.GEMINI_API_KEY = originalKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("uses deterministic fallback when GEMINI_API_KEY is missing", async () => {
    const result = await extractIntent("ANC headphones for a 14-hour flight, budget ₹8,500");
    expect(result.source).toBe("deterministic-fallback");
    expect(result.fallbackReason).toBe("gemini_not_configured");
    expect(result.intent.constraints.maxPricePaise).toBe(850000);
    expect(result.intent.preferences.features).toContain("anc");
  });

  it("uses Gemini provider when configured and valid", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const mockProvider: IntentProvider = {
      extractIntent: vi.fn(async () =>
        createStructuredIntent({
          query: "I need headphones under ₹15,000",
          category: "headphones",
          constraints: {
            maxPricePaise: 1500000,
            minPricePaise: null,
            maxDiscountPct: null,
          },
          preferences: {
            features: ["wireless", "noise-cancelling"],
            keywords: ["flight"],
          },
          useCase: "travel",
          quantity: 1,
        }),
      ),
    };
    setIntentProviderForTests(mockProvider);

    const result = await extractIntent("I need headphones under ₹15,000");
    expect(result.source).toBe("gemini");
    expect(result.intent.constraints.maxPricePaise).toBe(1500000);
    expect(result.intent.preferences.features).toContain("noise-cancelling");
  });

  it("falls back when Gemini returns invalid output", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const mockProvider: IntentProvider = {
      extractIntent: vi.fn(async () => {
        throw new StructuredIntentValidationError("invalid gemini payload");
      }),
    };
    setIntentProviderForTests(mockProvider);

    const result = await extractIntent("Gift a portable speaker under ₹4,000");
    expect(result.source).toBe("deterministic-fallback");
    expect(result.fallbackReason).toBe("gemini_validation_failed");
    expect(result.intent.constraints.maxPricePaise).toBe(400000);
  });

  it("falls back when Gemini API fails", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const mockProvider: IntentProvider = {
      extractIntent: vi.fn(async () => {
        throw new Error("network down");
      }),
    };
    setIntentProviderForTests(mockProvider);

    const result = await extractIntent("Replace broken earbuds today, under ₹3,000");
    expect(result.source).toBe("deterministic-fallback");
    expect(result.fallbackReason).toBe("gemini_unavailable");
  });

  it("does not invent unsupported constraints in deterministic fallback for ambiguous text", async () => {
    const result = await extractIntent("Something nice for my commute");
    expect(result.intent.constraints.maxPricePaise).toBeNull();
    expect(result.intent.constraints.maxDiscountPct).toBeNull();
    expect(result.intent.category).toBeNull();
  });

  it("extracts multiple constraints in deterministic fallback", async () => {
    const result = await extractIntent("Northline Halo ANC at 25% off for travel");
    expect(result.intent.constraints.maxDiscountPct).toBe(25);
    expect(result.intent.preferences.features).toContain("anc");
    expect(result.intent.preferences.keywords).toContain("travel");
  });
});

describe("matcher still works with extracted intents", () => {
  it("matches Northline Halo from flight ANC structured intent", async () => {
    const merchantId = getConfiguredDemoMerchantId();
    const catalog = await getAvailableCatalog(merchantId);
    const policies = await getMerchantPoliciesForAgent(merchantId);
    const intent = parseIntent("ANC headphones for a 14-hour flight, budget ₹8,500");
    const result = runAgentWithParsed(intent, policies, catalog);
    expect(result.status).toBe("ready");
    expect(result.primary?.sku).toBe("halo-anc");
  });

  it("matches Gemini-shaped structured intent for budget and features", async () => {
    const merchantId = getConfiguredDemoMerchantId();
    const catalog = await getAvailableCatalog(merchantId);
    const policies = await getMerchantPoliciesForAgent(merchantId);
    const intent = createStructuredIntent({
      query: "Comfortable wireless headphones for a long flight under ₹15,000 with noise cancellation",
      category: "headphones",
      constraints: {
        maxPricePaise: 1500000,
        minPricePaise: null,
        maxDiscountPct: null,
      },
      preferences: {
        features: ["wireless", "noise-cancelling"],
        keywords: ["flight", "travel"],
      },
      useCase: "travel",
      quantity: 1,
    });

    const result = runAgentWithParsed(intent, policies, catalog);
    expect(result.status).toBe("ready");
    expect(result.primary?.sku).toBe("halo-anc");
  });
});
