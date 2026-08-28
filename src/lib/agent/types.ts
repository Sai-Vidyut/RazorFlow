import type { StructuredIntent } from "./structured-intent";

export type Product = {
  id?: string;
  sku: string;
  name: string;
  blurb: string;
  price: number;
  pricePaise: number;
  cost: number;
  costPaise: number;
  category: string;
  tags: string[];
  metadata: Record<string, unknown>;
  inventory: number;
  active: boolean;
  image: string;
  imageAlt: string;
  attachSku?: string;
  attachRate?: number;
};

/** Client-safe product shape — never includes merchant cost fields. */
export type PublicProduct = Omit<Product, "cost" | "costPaise">;

export type PolicyVerdict = {
  id: string;
  label: string;
  result: "allowed" | "blocked";
  detail: string;
};

export type AgentExplanation = {
  decision: string;
  reason: string;
  evidence: string;
};

/** @deprecated Use StructuredIntent — kept as alias for gradual import migration */
export type ParsedIntent = StructuredIntent;

export type DiscoverySummary = {
  totalMatches: number;
  returnedCount: number;
  requestedCount: number | null;
  sortBy: StructuredIntent["discovery"]["sortBy"];
  sortOrder: StructuredIntent["discovery"]["sortOrder"];
  category: string | null;
};

export type AgentResult = {
  status: "ready" | "blocked" | "empty";
  intent: StructuredIntent;
  primary: Product | null;
  attach: Product | null;
  results: Product[];
  discoverySummary: DiscoverySummary | null;
  discountPct: number;
  subtotal: number;
  marginPct: number;
  aovLift: number;
  explanations: AgentExplanation[];
  policies: PolicyVerdict[];
  blockedReason: string | null;
};

export type MerchantPolicies = {
  merchant: string;
  maxDiscountPct: number;
  minMarginPct: number;
  maxOrderInr: number;
  minAttachRatePct: number;
  allowCrossSell: boolean;
  requireBudgetFit: boolean;
};
