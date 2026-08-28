import type { DecisionStatus, Prisma, SessionStatus } from "@prisma/client";
import type { AgentResult, PublicProduct } from "@/lib/agent/types";
import { runAgentWithParsed } from "@/lib/agent/run-agent";
import { recordAuditEvents } from "@/lib/audit";
import { db } from "@/lib/db";
import { rupeesToPaise } from "@/lib/format";
import { toPublicProduct } from "@/lib/services/catalog-map";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { abandonPendingCheckoutForSession } from "@/lib/services/payments";
import { getMerchantPoliciesForAgent } from "@/lib/services/policies";
import { getSessionWithIntent, loadStructuredIntentFromSession } from "@/lib/services/sessions";

function decisionStatusToSessionStatus(status: AgentResult["status"]): SessionStatus {
  switch (status) {
    case "ready":
      return "DECISION_MADE";
    case "blocked":
      return "BLOCKED";
    case "empty":
      return "EMPTY";
    default:
      return "DECISION_MADE";
  }
}

function agentStatusToDecisionStatus(status: AgentResult["status"]): DecisionStatus {
  switch (status) {
    case "ready":
      return "READY";
    case "blocked":
      return "BLOCKED";
    case "empty":
      return "EMPTY";
  }
}

export async function runAgentForSession(sessionId: string) {
  const session = await getSessionWithIntent(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  if (session.status === "PAYMENT_CAPTURED") {
    throw new Error("This session already has a captured payment.");
  }

  if (session.status === "PAYMENT_PENDING") {
    await abandonPendingCheckoutForSession(
      sessionId,
      "Agent re-run closed an in-progress checkout.",
    );
  }

  const intent = loadStructuredIntentFromSession(session);
  const policies = await getMerchantPoliciesForAgent(session.merchantId);
  const catalog = await getAvailableCatalog(session.merchantId);
  const result = runAgentWithParsed(intent, policies, catalog);

  const primaryDb = result.primary
    ? catalog.find((p) => p.sku === result.primary!.sku)
    : null;
  const attachDb = result.attach ? catalog.find((p) => p.sku === result.attach!.sku) : null;

  await db.agentDecision.updateMany({
    where: { sessionId, supersededAt: null },
    data: { supersededAt: new Date() },
  });

  const decision = await db.agentDecision.create({
    data: {
      sessionId,
      primaryProductId: primaryDb?.id ?? null,
      attachProductId: attachDb?.id ?? null,
      subtotalPaise: rupeesToPaise(result.subtotal),
      marginPct: result.marginPct,
      attachRevenuePaise: rupeesToPaise(result.aovLift),
      recommendationReason: result.explanations[0]?.reason ?? "No recommendation",
      policyAllowed: result.status === "ready",
      policyReason: result.blockedReason,
      discountPct: result.discountPct,
      quantity: intent.quantity,
      status: agentStatusToDecisionStatus(result.status),
    },
    include: {
      primaryProduct: true,
      attachProduct: true,
    },
  });

  await db.buyerSession.update({
    where: { id: sessionId },
    data: { status: decisionStatusToSessionStatus(result.status) },
  });

  const auditEvents: Array<{
    sessionId: string;
    type:
      | "RECOMMENDATION_MADE"
      | "CROSS_SELL_PROPOSED"
      | "POLICY_EVALUATED"
      | "POLICY_BLOCKED"
      | "POLICY_ALLOWED"
      | "DECISION_RECORDED";
    actor: string;
    data: Prisma.InputJsonValue;
  }> = [];

  if (result.primary) {
    auditEvents.push({
      sessionId,
      type: "RECOMMENDATION_MADE",
      actor: "agent",
      data: {
        productSku: result.primary.sku,
        productName: result.primary.name,
        reason: result.explanations[0]?.reason ?? "",
      },
    });
  }

  if (result.attach) {
    auditEvents.push({
      sessionId,
      type: "CROSS_SELL_PROPOSED",
      actor: "agent",
      data: {
        attachSku: result.attach.sku,
        attachName: result.attach.name,
        attachRevenuePaise: rupeesToPaise(result.aovLift),
        reason: result.explanations.find((e) => e.decision === "Bundle suggested")?.reason ?? "",
      },
    });
  }

  auditEvents.push({
    sessionId,
    type: "POLICY_EVALUATED",
    actor: "policy_engine",
    data: {
      allowed: result.status === "ready",
      verdicts: result.policies.map((p) => ({
        id: p.id,
        label: p.label,
        result: p.result,
        detail: p.detail,
      })),
      marginFloorPassed: result.policies.find((p) => p.id === "margin")?.result !== "blocked",
      budgetFitPassed: result.policies.find((p) => p.id === "budget")?.result !== "blocked",
    },
  });

  auditEvents.push({
    sessionId,
    type: result.status === "ready" ? "POLICY_ALLOWED" : "POLICY_BLOCKED",
    actor: "policy_engine",
    data: {
      allowed: result.status === "ready",
      reason: result.blockedReason ?? "All guardrails satisfied",
    },
  });

  auditEvents.push({
    sessionId,
    type: "DECISION_RECORDED",
    actor: "system",
    data: {
      decisionId: decision.id,
      status: result.status,
      subtotalPaise: rupeesToPaise(result.subtotal),
      attachRevenuePaise: rupeesToPaise(result.aovLift),
    },
  });

  await recordAuditEvents(auditEvents);

  return {
    sessionId,
    decisionId: decision.id,
    result,
  };
}

export function agentResultToApiResponse(
  sessionId: string,
  decisionId: string,
  result: AgentResult,
) {
  return {
    sessionId,
    decisionId,
    status: result.status,
    intent: result.intent,
    primary: result.primary ? toPublicProduct(result.primary) : null,
    attach: result.attach ? toPublicProduct(result.attach) : null,
    results: result.results.map(toPublicProduct),
    discountPct: result.discountPct,
    subtotal: result.subtotal,
    marginPct: result.marginPct,
    aovLift: result.aovLift,
    explanations: result.explanations,
    policies: result.policies,
    blockedReason: result.blockedReason,
  };
}

export type AgentApiResponse = ReturnType<typeof agentResultToApiResponse> & {
  primary: PublicProduct | null;
  attach: PublicProduct | null;
};
