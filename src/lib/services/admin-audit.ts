import type { AuditEventType, Prisma } from "@prisma/client";

export const ACTIVITY_LABELS: Partial<Record<AuditEventType, string>> = {
  SESSION_CREATED: "Session created",
  INTENT_PARSED: "Intent parsed",
  INTENT_GEMINI_SUCCEEDED: "Intent extracted",
  INTENT_GEMINI_FAILED: "Intent extraction failed",
  INTENT_DETERMINISTIC_FALLBACK: "Intent fallback used",
  RECOMMENDATION_MADE: "Agent recommendation",
  CROSS_SELL_PROPOSED: "Cross-sell proposed",
  POLICY_EVALUATED: "Policy evaluated",
  POLICY_ALLOWED: "Policy allowed",
  POLICY_BLOCKED: "Policy blocked",
  DECISION_RECORDED: "Agent decision recorded",
  ORDER_CREATED: "Order created",
  CHECKOUT_STARTED: "Checkout started",
  CHECKOUT_ABANDONED: "Checkout abandoned",
  PAYMENT_VERIFICATION_ATTEMPTED: "Payment verification attempted",
  PAYMENT_VERIFIED: "Payment verified",
  PAYMENT_CAPTURED: "Payment captured",
  PAYMENT_FAILED: "Payment failed",
  PAYMENT_VERIFICATION_FAILED: "Payment verification failed",
  WEBHOOK_RECEIVED: "Webhook received",
  RECOVERY_EVALUATED: "Recovery evaluated",
  RECOVERY_ALLOWED: "Recovery allowed",
  RECOVERY_BLOCKED: "Recovery blocked",
  RECOVERY_ATTEMPTED: "Recovery attempted",
  RECOVERY_SUCCEEDED: "Recovery succeeded",
  RECOVERY_FAILED: "Recovery failed",
  PRODUCT_CREATED: "Product created",
  PRODUCT_UPDATED: "Product updated",
  PRODUCT_ACTIVATED: "Product activated",
  PRODUCT_DEACTIVATED: "Product deactivated",
  PRODUCT_INVENTORY_CHANGED: "Inventory updated",
  PRODUCT_PRICE_CHANGED: "Price updated",
  POLICY_UPDATED: "Policy updated",
};

export type AdminActivityItem = {
  id: string;
  type: AuditEventType;
  label: string;
  detail: string;
  when: string;
  sessionId: string | null;
  actor: string;
  metadata: Record<string, string | number | boolean>;
};

export type AdminActivityFilter =
  | "all"
  | "products"
  | "policies"
  | "orders"
  | "payments"
  | "agent"
  | "system";

const PRODUCT_TYPES: AuditEventType[] = [
  "PRODUCT_CREATED",
  "PRODUCT_UPDATED",
  "PRODUCT_ACTIVATED",
  "PRODUCT_DEACTIVATED",
  "PRODUCT_INVENTORY_CHANGED",
  "PRODUCT_PRICE_CHANGED",
];

const POLICY_TYPES: AuditEventType[] = ["POLICY_UPDATED", "POLICY_EVALUATED", "POLICY_ALLOWED", "POLICY_BLOCKED"];

const ORDER_TYPES: AuditEventType[] = ["ORDER_CREATED", "CHECKOUT_STARTED", "CHECKOUT_ABANDONED"];

const PAYMENT_TYPES: AuditEventType[] = [
  "PAYMENT_VERIFICATION_ATTEMPTED",
  "PAYMENT_VERIFIED",
  "PAYMENT_CAPTURED",
  "PAYMENT_FAILED",
  "PAYMENT_VERIFICATION_FAILED",
  "RECOVERY_EVALUATED",
  "RECOVERY_ALLOWED",
  "RECOVERY_BLOCKED",
  "RECOVERY_ATTEMPTED",
  "RECOVERY_SUCCEEDED",
  "RECOVERY_FAILED",
  "WEBHOOK_RECEIVED",
];

const AGENT_TYPES: AuditEventType[] = [
  "INTENT_PARSED",
  "INTENT_GEMINI_SUCCEEDED",
  "INTENT_GEMINI_FAILED",
  "INTENT_DETERMINISTIC_FALLBACK",
  "RECOMMENDATION_MADE",
  "CROSS_SELL_PROPOSED",
  "DECISION_RECORDED",
  "POLICY_EVALUATED",
  "POLICY_ALLOWED",
  "POLICY_BLOCKED",
];

const SYSTEM_TYPES: AuditEventType[] = ["SESSION_CREATED", "WEBHOOK_RECEIVED"];

export function merchantAuditWhere(merchantId: string): Prisma.AuditEventWhereInput {
  return {
    OR: [{ session: { merchantId } }, { merchantId }],
  };
}

export function activityFilterTypes(filter: AdminActivityFilter): AuditEventType[] | null {
  switch (filter) {
    case "products":
      return PRODUCT_TYPES;
    case "policies":
      return POLICY_TYPES;
    case "orders":
      return ORDER_TYPES;
    case "payments":
      return PAYMENT_TYPES;
    case "agent":
      return AGENT_TYPES;
    case "system":
      return SYSTEM_TYPES;
    default:
      return null;
  }
}

export function sanitizeActivityData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const record = data as Record<string, unknown>;
  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (/secret|signature|api[_-]?key|token|password|razorpay/i.test(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      safe[key] = value;
    }
  }

  return safe;
}

export function activityDetail(type: AuditEventType, data: Record<string, unknown>): string {
  switch (type) {
    case "RECOMMENDATION_MADE":
      return typeof data.productName === "string" ? data.productName : "Product recommended";
    case "DECISION_RECORDED":
      return typeof data.status === "string" ? `Decision ${data.status}` : "Decision saved";
    case "ORDER_CREATED":
      return typeof data.amountPaise === "number"
        ? `Order amount ₹${Math.round(data.amountPaise / 100)}`
        : "Order opened";
    case "CHECKOUT_STARTED":
      return typeof data.amountPaise === "number"
        ? `Checkout ₹${Math.round(data.amountPaise / 100)}`
        : "Checkout initiated";
    case "CHECKOUT_ABANDONED":
      return typeof data.reason === "string" ? data.reason : "Checkout closed before payment";
    case "PAYMENT_CAPTURED":
      return typeof data.amountPaise === "number"
        ? `Captured ₹${Math.round(data.amountPaise / 100)}`
        : "Payment captured";
    case "PAYMENT_FAILED":
      return typeof data.reason === "string" ? data.reason : "Payment failed";
    case "RECOVERY_EVALUATED":
      return typeof data.status === "string" ? `Recovery ${data.status}` : "Recovery evaluated";
    case "RECOVERY_ALLOWED":
      return typeof data.attemptNumber === "number"
        ? `Attempt ${data.attemptNumber} allowed`
        : "Recovery allowed";
    case "RECOVERY_BLOCKED":
      return typeof data.reason === "string" ? data.reason : "Recovery blocked";
    case "RECOVERY_ATTEMPTED":
      return typeof data.attemptNumber === "number"
        ? `Recovery attempt ${data.attemptNumber}`
        : "Recovery attempted";
    case "RECOVERY_SUCCEEDED":
      return typeof data.amountPaise === "number"
        ? `Recovered ₹${Math.round(data.amountPaise / 100)}`
        : "Recovery succeeded";
    case "RECOVERY_FAILED":
      return typeof data.reason === "string" ? data.reason : "Recovery failed";
    case "POLICY_BLOCKED":
      return typeof data.reason === "string" ? data.reason : "Offer blocked by policy";
    case "POLICY_ALLOWED":
      return "Offer allowed by policy";
    case "POLICY_EVALUATED":
      return data.allowed === true ? "Guardrails passed" : "Guardrails evaluated";
    case "POLICY_UPDATED":
      return "Merchant guardrails changed";
    case "PRODUCT_CREATED":
      return typeof data.name === "string" ? data.name : "New catalog item";
    case "PRODUCT_UPDATED":
      return typeof data.sku === "string" ? `SKU ${data.sku}` : "Catalog item updated";
    case "PRODUCT_ACTIVATED":
      return typeof data.name === "string" ? `${data.name} is active` : "Product activated";
    case "PRODUCT_DEACTIVATED":
      return typeof data.name === "string" ? `${data.name} is inactive` : "Product deactivated";
    case "PRODUCT_INVENTORY_CHANGED":
      return typeof data.nextInventory === "number"
        ? `Inventory set to ${data.nextInventory}`
        : "Inventory updated";
    case "PRODUCT_PRICE_CHANGED":
      return typeof data.nextPricePaise === "number"
        ? `Price set to ₹${Math.round(Number(data.nextPricePaise) / 100)}`
        : "Price updated";
    default:
      return ACTIVITY_LABELS[type] ?? type.replaceAll("_", " ").toLowerCase();
  }
}

export function formatAuditEvent(event: {
  id: string;
  type: AuditEventType;
  data: unknown;
  createdAt: Date;
  sessionId: string | null;
  actor: string;
}): AdminActivityItem {
  const safeData = sanitizeActivityData(event.data);
  const metadata: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(safeData)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      metadata[key] = value;
    }
  }

  return {
    id: event.id,
    type: event.type,
    label: ACTIVITY_LABELS[event.type] ?? event.type.replaceAll("_", " "),
    detail: activityDetail(event.type, safeData),
    when: event.createdAt.toISOString(),
    sessionId: event.sessionId,
    actor: event.actor,
    metadata,
  };
}

export function privacySafeSessionRef(sessionId: string | null, rawRequest?: string | null): string {
  if (rawRequest?.trim()) {
    const trimmed = rawRequest.trim();
    return trimmed.length <= 28 ? trimmed : `${trimmed.slice(0, 25)}…`;
  }
  if (!sessionId) return "—";
  return `Session ${sessionId.slice(0, 8)}…`;
}
