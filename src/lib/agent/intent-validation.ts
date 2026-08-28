import {
  createStructuredIntent,
  STRUCTURED_INTENT_VERSION,
  type StructuredIntent,
} from "./structured-intent";

export class StructuredIntentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredIntentValidationError";
  }
}

/** JSON Schema passed to Gemini structured output. Excludes version; validation adds it. */
export const GEMINI_STRUCTURED_INTENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["query", "category", "constraints", "preferences", "useCase", "quantity", "exclusions"],
  properties: {
    query: {
      type: "string",
      description: "The buyer request in concise natural language.",
    },
    category: {
      type: ["string", "null"],
      description: "Product category or type mentioned by the buyer, if any.",
    },
    constraints: {
      type: "object",
      additionalProperties: false,
      required: ["maxPricePaise", "minPricePaise", "maxDiscountPct"],
      properties: {
        maxPricePaise: {
          type: ["integer", "null"],
          description: "Maximum budget in paise (INR). Example: ₹15,000 => 1500000.",
        },
        minPricePaise: {
          type: ["integer", "null"],
          description: "Minimum budget in paise, if stated.",
        },
        maxDiscountPct: {
          type: ["integer", "null"],
          description: "Requested discount percentage, if explicitly stated.",
        },
      },
    },
    preferences: {
      type: "object",
      additionalProperties: false,
      required: ["features", "keywords"],
      properties: {
        features: {
          type: "array",
          items: { type: "string" },
          description: "Hard or soft product features the buyer wants.",
        },
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Soft preference keywords such as good, comfortable, premium, or use-context terms.",
        },
      },
    },
    useCase: {
      type: ["string", "null"],
      description: "Primary use case such as travel, gift, commute, or gym.",
    },
    quantity: {
      type: "integer",
      description: "Requested quantity. Default to 1 when not stated.",
    },
    discovery: {
      type: "object",
      additionalProperties: false,
      properties: {
        resultCount: {
          type: ["integer", "null"],
          description: "Exact number of products to browse when stated (e.g. show me 3 headphones).",
        },
        minResults: {
          type: "integer",
          description: "Minimum browse count when the buyer asks for several options.",
        },
        sortBy: {
          type: ["string", "null"],
          enum: ["price", "score", null],
          description: "Sort field when the buyer asks for cheapest, most expensive, or relevance.",
        },
        sortOrder: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Ascending for cheapest-first; descending for most expensive first.",
        },
      },
    },
    exclusions: {
      type: "array",
      description:
        "Products the buyer explicitly wants excluded (except, not, without, anything but, other than, no, don't show).",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["reference"],
        properties: {
          reference: {
            type: "string",
            description: "Product name or distinctive phrase to exclude, as stated by the buyer.",
          },
        },
      },
    },
  },
} as const;

export function validateStructuredIntent(raw: unknown, rawRequest: string): StructuredIntent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new StructuredIntentValidationError("Structured intent must be a JSON object");
  }

  const record = raw as Record<string, unknown>;
  const constraints = readObject(record.constraints, "constraints");
  const preferences = readObject(record.preferences, "preferences");

  const query = sanitizeText(record.query) || rawRequest.trim();
  if (!query) {
    throw new StructuredIntentValidationError("Structured intent query is empty");
  }

  const category = record.category == null ? null : sanitizeText(record.category);
  const useCase = record.useCase == null ? null : sanitizeText(record.useCase);
  const quantity = sanitizeQuantity(record.quantity);

  const maxPricePaise = sanitizeNullableInt(constraints.maxPricePaise, "constraints.maxPricePaise");
  const minPricePaise = sanitizeNullableInt(constraints.minPricePaise, "constraints.minPricePaise");
  const maxDiscountPct = sanitizeNullableInt(constraints.maxDiscountPct, "constraints.maxDiscountPct");

  if (maxPricePaise != null && maxPricePaise < 0) {
    throw new StructuredIntentValidationError("constraints.maxPricePaise must be non-negative");
  }
  if (minPricePaise != null && minPricePaise < 0) {
    throw new StructuredIntentValidationError("constraints.minPricePaise must be non-negative");
  }
  if (maxDiscountPct != null && (maxDiscountPct < 0 || maxDiscountPct > 100)) {
    throw new StructuredIntentValidationError("constraints.maxDiscountPct must be between 0 and 100");
  }
  if (maxPricePaise != null && minPricePaise != null && minPricePaise > maxPricePaise) {
    throw new StructuredIntentValidationError("constraints.minPricePaise cannot exceed maxPricePaise");
  }

  return createStructuredIntent({
    version: STRUCTURED_INTENT_VERSION,
    query,
    category,
    constraints: {
      maxPricePaise,
      minPricePaise,
      maxDiscountPct,
    },
    preferences: {
      features: sanitizeStringList(preferences.features, 12),
      keywords: sanitizeStringList(preferences.keywords, 12),
    },
    useCase,
    quantity,
    discovery: readDiscovery(record.discovery),
    exclusions: readExclusions(record.exclusions),
  });
}

function readExclusions(value: unknown): Array<{ reference: string; resolvedSku: null }> {
  if (!Array.isArray(value)) return [];
  const exclusions: Array<{ reference: string; resolvedSku: null }> = [];
  const seen = new Set<string>();

  for (const entry of value.slice(0, 8)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const reference = sanitizeText(record.reference);
    if (!reference || reference.length < 3) continue;
    const key = reference.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    exclusions.push({ reference, resolvedSku: null });
  }

  return exclusions;
}

function readDiscovery(value: unknown): Partial<StructuredIntent["discovery"]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const sortBy = record.sortBy;
  return {
    resultCount: sanitizeNullableInt(record.resultCount, "discovery.resultCount"),
    minResults: sanitizeNullableInt(record.minResults, "discovery.minResults") ?? undefined,
    sortBy: sortBy === "price" || sortBy === "score" ? sortBy : null,
    sortOrder: record.sortOrder === "desc" ? "desc" : "asc",
  };
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StructuredIntentValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function sanitizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 500);
}

function sanitizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => sanitizeText(item).toLowerCase()).filter(Boolean))].slice(
    0,
    maxItems,
  );
}

function sanitizeQuantity(value: unknown): number {
  const quantity = sanitizeNullableInt(value, "quantity") ?? 1;
  if (quantity < 1 || quantity > 99) {
    throw new StructuredIntentValidationError("quantity must be between 1 and 99");
  }
  return quantity;
}

function sanitizeNullableInt(value: unknown, label: string): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new StructuredIntentValidationError(`${label} must be an integer or null`);
  }
  return value;
}
