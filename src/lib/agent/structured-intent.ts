import type { Prisma } from "@prisma/client";

export const STRUCTURED_INTENT_VERSION = 1 as const;

export type StructuredIntent = {
  version: typeof STRUCTURED_INTENT_VERSION;
  query: string;
  category: string | null;
  constraints: {
    maxPricePaise: number | null;
    minPricePaise: number | null;
    maxDiscountPct: number | null;
  };
  preferences: {
    features: string[];
    keywords: string[];
  };
  useCase: string | null;
  quantity: number;
};

export function createStructuredIntent(
  partial: Omit<StructuredIntent, "version"> & { version?: typeof STRUCTURED_INTENT_VERSION },
): StructuredIntent {
  return {
    version: STRUCTURED_INTENT_VERSION,
    query: partial.query,
    category: partial.category,
    constraints: {
      maxPricePaise: partial.constraints.maxPricePaise,
      minPricePaise: partial.constraints.minPricePaise,
      maxDiscountPct: partial.constraints.maxDiscountPct,
    },
    preferences: {
      features: [...partial.preferences.features],
      keywords: [...partial.preferences.keywords],
    },
    useCase: partial.useCase,
    quantity: partial.quantity > 0 ? partial.quantity : 1,
  };
}

export function structuredIntentFromDb(value: Prisma.JsonValue): StructuredIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid structured intent stored in database");
  }

  const record = value as Record<string, unknown>;
  const constraints = (record.constraints ?? {}) as Record<string, unknown>;
  const preferences = (record.preferences ?? {}) as Record<string, unknown>;

  return createStructuredIntent({
    query: String(record.query ?? ""),
    category: record.category == null ? null : String(record.category),
    constraints: {
      maxPricePaise: toNullableInt(constraints.maxPricePaise),
      minPricePaise: toNullableInt(constraints.minPricePaise),
      maxDiscountPct: toNullableInt(constraints.maxDiscountPct),
    },
    preferences: {
      features: toStringArray(preferences.features),
      keywords: toStringArray(preferences.keywords),
    },
    useCase: record.useCase == null ? null : String(record.useCase),
    quantity: toNullableInt(record.quantity) ?? 1,
  });
}

export function structuredIntentToJson(intent: StructuredIntent): Prisma.InputJsonValue {
  return intent as unknown as Prisma.InputJsonValue;
}

export function intentMaxBudgetInr(intent: StructuredIntent): number | null {
  return intent.constraints.maxPricePaise != null
    ? Math.round(intent.constraints.maxPricePaise / 100)
    : null;
}

export function intentDisplayNeed(intent: StructuredIntent): string {
  if (intent.preferences.features.length > 0) {
    return intent.preferences.features.slice(0, 2).join(", ");
  }
  if (intent.category) return intent.category;
  if (intent.useCase) return intent.useCase;
  return "Inferred from the request";
}

function toNullableInt(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}
