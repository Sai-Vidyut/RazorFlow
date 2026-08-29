import type { AgentResult, PolicyVerdict } from "@/lib/agent/types";
import {
  formatOrderLabel,
  maskRazorpayPaymentId,
  primaryProductName,
  type CapturedPaymentView,
} from "@/lib/desk/payment-display";
import { db } from "@/lib/db";
import { agentResultToApiResponse } from "@/lib/services/agent-run";
import { dbProductToAgentProduct } from "@/lib/services/catalog-map";
import { loadStructuredIntentFromSession } from "@/lib/services/sessions";

export type DeskActiveSessionState = {
  sessionId: string;
  decisionId: string;
  orderId: string;
  intentQuery: string;
  phase: "captured";
  agent: ReturnType<typeof agentResultToApiResponse>;
  capturedPayment: CapturedPaymentView;
};

function policiesFromDecision(policyAllowed: boolean): PolicyVerdict[] {
  const result = policyAllowed ? ("allowed" as const) : ("blocked" as const);
  const detail = policyAllowed ? "Passed" : "Blocked";
  return [
    { id: "budget", label: "Budget fit", result, detail },
    { id: "margin", label: "Margin floor", result, detail },
    { id: "order-cap", label: "Order cap", result, detail },
    { id: "attach", label: "Cross-sell rule", result, detail },
  ];
}

function agentResultFromDecision(
  session: { intent: { structuredIntent: import("@prisma/client").Prisma.JsonValue } | null },
  decision: {
    primaryProduct: import("@prisma/client").Product | null;
    attachProduct: import("@prisma/client").Product | null;
    subtotalPaise: number;
    marginPct: number;
    attachRevenuePaise: number;
    recommendationReason: string;
    policyAllowed: boolean;
    policyReason: string | null;
    discountPct: number;
    status: string;
  },
): AgentResult {
  const intent = loadStructuredIntentFromSession(session);
  const primary = decision.primaryProduct ? dbProductToAgentProduct(decision.primaryProduct) : null;
  const attach = decision.attachProduct ? dbProductToAgentProduct(decision.attachProduct) : null;

  return {
    status: decision.status === "READY" ? "ready" : decision.status === "BLOCKED" ? "blocked" : "empty",
    intent,
    primary,
    attach,
    results: primary ? [primary] : [],
    discoverySummary: null,
    discountPct: decision.discountPct,
    subtotal: decision.subtotalPaise / 100,
    marginPct: decision.marginPct,
    aovLift: decision.attachRevenuePaise / 100,
    explanations: [
      {
        decision: "Recommended",
        reason: decision.recommendationReason,
        evidence: "",
      },
    ],
    policies: policiesFromDecision(decision.policyAllowed),
    blockedReason: decision.policyReason,
  };
}

export async function getDeskActiveSessionState(
  sessionId: string,
): Promise<DeskActiveSessionState | null> {
  const session = await db.buyerSession.findUnique({
    where: { id: sessionId },
    include: { intent: true },
  });

  if (!session || session.status !== "PAYMENT_CAPTURED") {
    return null;
  }

  const paidOrder = await db.order.findFirst({
    where: { sessionId, status: "PAID" },
    orderBy: { createdAt: "desc" },
    include: {
      decision: {
        include: {
          primaryProduct: true,
          attachProduct: true,
        },
      },
      payments: {
        where: { status: "CAPTURED", razorpaySignatureVerified: true },
        orderBy: { capturedAt: "desc" },
        take: 1,
      },
      lineItems: {
        include: { product: true },
      },
    },
  });

  if (!paidOrder?.decision) {
    return null;
  }

  const payment = paidOrder.payments[0];
  if (!payment?.razorpayPaymentId || !payment.capturedAt) {
    return null;
  }

  const productNames =
    paidOrder.lineItems.length > 0
      ? paidOrder.lineItems.map((line) => line.product.name)
      : paidOrder.decision.primaryProduct
        ? [paidOrder.decision.primaryProduct.name]
        : [];

  const agentResult = agentResultFromDecision(session, paidOrder.decision);
  const capturedPayment: CapturedPaymentView = {
    orderId: paidOrder.id,
    orderLabel: formatOrderLabel(paidOrder.id),
    paymentId: payment.id,
    razorpayPaymentId: payment.razorpayPaymentId,
    razorpayPaymentIdMasked: maskRazorpayPaymentId(payment.razorpayPaymentId),
    amountInr: paidOrder.amountPaise / 100,
    capturedAt: payment.capturedAt.toISOString(),
    productName: primaryProductName(productNames),
    status: "CAPTURED",
  };

  return {
    sessionId,
    decisionId: paidOrder.decisionId,
    orderId: paidOrder.id,
    intentQuery: session.rawRequest,
    phase: "captured",
    agent: agentResultToApiResponse(sessionId, paidOrder.decisionId, agentResult),
    capturedPayment,
  };
}

export function buildCapturedPaymentView(input: {
  orderId: string;
  paymentId: string;
  razorpayPaymentId: string;
  amountPaise: number;
  capturedAt: string;
  productNames: string[];
}): CapturedPaymentView {
  return {
    orderId: input.orderId,
    orderLabel: formatOrderLabel(input.orderId),
    paymentId: input.paymentId,
    razorpayPaymentId: input.razorpayPaymentId,
    razorpayPaymentIdMasked: maskRazorpayPaymentId(input.razorpayPaymentId),
    amountInr: input.amountPaise / 100,
    capturedAt: input.capturedAt,
    productName: primaryProductName(input.productNames),
    status: "CAPTURED",
  };
}
