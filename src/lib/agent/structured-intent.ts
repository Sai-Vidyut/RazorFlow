import type { Prisma } from "@prisma/client";

export const STRUCTURED_INTENT_VERSION = 1 as const;

export type IntentDiscovery = {
  resultCount: number | null;
  minResults: number;
  sortBy: "price" | "score" | null;
  sortOrder: "asc" | "desc";
};

/** Buyer-requested product exclusion; resolvedSku is filled deterministically against the catalog. */
export type IntentExclusion = {
  reference: string;
  resolvedSku: string | null;
};

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
  discovery: IntentDiscovery;
  exclusions: IntentExclusion[];
};

export const DEFAULT_INTENT_DISCOVERY: IntentDiscovery = {
  resultCount: null,
  minResults: 1,
  sortBy: null,
  sortOrder: "asc",
};

export function createStructuredIntent(
  partial: Omit<StructuredIntent, "version" | "discovery" | "exclusions"> & {
    version?: typeof STRUCTURED_INTENT_VERSION;
    discovery?: Partial<IntentDiscovery>;
    exclusions?: IntentExclusion[];
  },
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
    discovery: {
      ...DEFAULT_INTENT_DISCOVERY,
      ...partial.discovery,
    },
    exclusions: (partial.exclusions ?? []).map((exclusion) => ({
      reference: exclusion.reference,
      resolvedSku: exclusion.resolvedSku,
    })),
  };
}

export function structuredIntentFromDb(value: Prisma.JsonValue): StructuredIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid structured intent stored in database");
  }

  const record = value as Record<string, unknown>;
  const constraints = (record.constraints ?? {}) as Record<string, unknown>;
  const preferences = (record.preferences ?? {}) as Record<string, unknown>;
  const discovery = (record.discovery ?? {}) as Record<string, unknown>;
  const exclusions = Array.isArray(record.exclusions) ? record.exclusions : [];

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
    discovery: {
      resultCount: toNullableInt(discovery.resultCount),
      minResults: toNullableInt(discovery.minResults) ?? DEFAULT_INTENT_DISCOVERY.minResults,
      sortBy:
        discovery.sortBy === "price" || discovery.sortBy === "score"
          ? discovery.sortBy
          : DEFAULT_INTENT_DISCOVERY.sortBy,
      sortOrder: discovery.sortOrder === "desc" ? "desc" : "asc",
    },
    exclusions: exclusions
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
        const row = entry as Record<string, unknown>;
        const reference = String(row.reference ?? "").trim();
        if (!reference) return null;
        return {
          reference,
          resolvedSku: row.resolvedSku == null ? null : String(row.resolvedSku),
        };
      })
      .filter((entry): entry is IntentExclusion => entry != null),
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
