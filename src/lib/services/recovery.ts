import type { AgentDecision, Product as DbProduct } from "@prisma/client";
import { runAgentWithParsed } from "@/lib/agent/run-agent";
import type { AgentResult, Product } from "@/lib/agent/types";
import { recordAuditEvent } from "@/lib/audit";
import { db } from "@/lib/db";
import { rupeesToPaise } from "@/lib/format";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { getMerchantPoliciesForAgent } from "@/lib/services/policies";
import { loadStructuredIntentFromSession } from "@/lib/services/sessions";

export type RecoveryStatus = "retryable" | "re_evaluate" | "blocked";

export type RecoveryEvaluation = {
  status: RecoveryStatus;
  reason: string;
  changes: string[];
  policyBlocked: boolean;
  attemptNumber: number;
  priorFailedAttempts: number;
};

type DecisionSnapshot = Pick<
  AgentDecision,
  | "primaryProductId"
  | "attachProductId"
  | "subtotalPaise"
  | "discountPct"
  | "quantity"
  | "policyAllowed"
  | "status"
  | "supersededAt"
>;

function catalogProductById(catalog: Product[], productId: string | null): Product | null {
  if (!productId) return null;
  return catalog.find((item) => item.id === productId) ?? null;
}

function describeProductState(
  label: string,
  product: Product | null,
  dbProduct: DbProduct | null,
  quantity: number,
): string[] {
  const issues: string[] = [];
  if (!product && !dbProduct) {
    issues.push(`${label} is no longer in the catalog`);
    return issues;
  }
  const live = product ?? null;
  if (!live) {
    issues.push(`${label} is unavailable`);
    return issues;
  }
  if (!live.active) {
    issues.push(`${label} (${live.name}) is inactive`);
  }
  if (live.inventory < quantity) {
    issues.push(
      `${label} (${live.name}) has ${live.inventory} in stock, ${quantity} requested`,
    );
  }
  return issues;
}

function diffDecisionFromFresh(
  decision: DecisionSnapshot,
  fresh: AgentResult,
  catalog: Product[],
): string[] {
  const changes: string[] = [];
  const freshPrimaryId = fresh.primary
    ? (catalog.find((item) => item.sku === fresh.primary!.sku)?.id ?? null)
    : null;
  const freshAttachId = fresh.attach
    ? (catalog.find((item) => item.sku === fresh.attach!.sku)?.id ?? null)
    : null;
  const freshSubtotalPaise = rupeesToPaise(fresh.subtotal);

  if (decision.primaryProductId !== freshPrimaryId) {
    changes.push("Primary product changed");
  }
  if (decision.attachProductId !== freshAttachId) {
    changes.push("Cross-sell offer changed");
  }
  if (decision.subtotalPaise !== freshSubtotalPaise) {
    changes.push("Basket total changed");
  }
  if (decision.discountPct !== fresh.discountPct) {
    changes.push("Discount changed");
  }
  if (decision.quantity !== fresh.intent.quantity) {
    changes.push("Quantity changed");
  }
  return changes;
}

export async function countPriorFailedAttempts(sessionId: string, decisionId: string): Promise<number> {
  return db.order.count({
    where: { sessionId, decisionId, status: "FAILED" },
  });
}

export async function nextAttemptNumber(sessionId: string, decisionId: string): Promise<number> {
  const prior = await db.order.count({ where: { sessionId, decisionId } });
  return prior + 1;
}

export async function isRecoveryContext(sessionId: string, decisionId: string): Promise<boolean> {
  const failedCount = await countPriorFailedAttempts(sessionId, decisionId);
  return failedCount > 0;
}

export async function evaluateRecovery(
  sessionId: string,
  decisionId: string,
  options?: { recordAudit?: boolean },
): Promise<RecoveryEvaluation> {
  const recordAudit = options?.recordAudit ?? true;
  const priorFailedAttempts = await countPriorFailedAttempts(sessionId, decisionId);
  const attemptNumber = priorFailedAttempts + 1;

  const session = await db.buyerSession.findUnique({
    where: { id: sessionId },
    include: {
      intent: true,
      decisions: { where: { id: decisionId }, take: 1 },
    },
  });

  if (!session?.intent) {
    const result: RecoveryEvaluation = {
      status: "blocked",
      reason: "Session not found.",
      changes: [],
      policyBlocked: false,
      attemptNumber,
      priorFailedAttempts,
    };
    if (recordAudit) {
      await recordAuditEvent(sessionId, "RECOVERY_EVALUATED", "system", {
        decisionId,
        status: result.status,
        reason: result.reason,
      });
      await recordAuditEvent(sessionId, "RECOVERY_BLOCKED", "system", {
        decisionId,
        reason: result.reason,
      });
    }
    return result;
  }

  const decision = session.decisions[0];
  if (!decision) {
    const result: RecoveryEvaluation = {
      status: "blocked",
      reason: "Decision not found.",
      changes: [],
      policyBlocked: false,
      attemptNumber,
      priorFailedAttempts,
    };
    if (recordAudit) {
      await recordAuditEvent(sessionId, "RECOVERY_EVALUATED", "system", {
        decisionId,
        status: result.status,
        reason: result.reason,
      });
      await recordAuditEvent(sessionId, "RECOVERY_BLOCKED", "system", {
        decisionId,
        reason: result.reason,
      });
    }
    return result;
  }

  if (decision.supersededAt) {
    const result: RecoveryEvaluation = {
      status: "re_evaluate",
      reason: "This decision is no longer active. Run the agent again for an updated basket.",
      changes: ["Decision superseded"],
      policyBlocked: false,
      attemptNumber,
      priorFailedAttempts,
    };
    if (recordAudit) {
      await recordAuditEvent(sessionId, "RECOVERY_EVALUATED", "system", {
        decisionId,
        status: result.status,
        reason: result.reason,
        changes: result.changes,
      });
    }
    return result;
  }

  if (!decision.policyAllowed || decision.status !== "READY") {
    const result: RecoveryEvaluation = {
      status: "blocked",
      reason: decision.policyReason ?? "Purchase is not allowed by merchant policy.",
      changes: [],
      policyBlocked: true,
      attemptNumber,
      priorFailedAttempts,
    };
    if (recordAudit) {
      await recordAuditEvent(sessionId, "RECOVERY_EVALUATED", "system", {
        decisionId,
        status: result.status,
        reason: result.reason,
      });
      await recordAuditEvent(sessionId, "RECOVERY_BLOCKED", "system", {
        decisionId,
        reason: result.reason,
        policyBlocked: true,
      });
    }
    return result;
  }

  const intent = loadStructuredIntentFromSession(session);
  const policies = await getMerchantPoliciesForAgent(session.merchantId);
  const catalog = await getAvailableCatalog(session.merchantId);
  const fresh = runAgentWithParsed(intent, policies, catalog);

  const dbProducts = await db.product.findMany({
    where: {
      merchantId: session.merchantId,
      id: {
        in: [decision.primaryProductId, decision.attachProductId].filter(
          (id): id is string => Boolean(id),
        ),
      },
    },
  });
  const dbById = new Map(dbProducts.map((row) => [row.id, row]));

  const changes: string[] = [
    ...describeProductState(
      "Primary product",
      catalogProductById(catalog, decision.primaryProductId),
      decision.primaryProductId ? (dbById.get(decision.primaryProductId) ?? null) : null,
      decision.quantity,
    ),
    ...describeProductState(
      "Attach product",
      catalogProductById(catalog, decision.attachProductId),
      decision.attachProductId ? (dbById.get(decision.attachProductId) ?? null) : null,
      decision.quantity,
    ),
  ];

  if (fresh.status === "blocked") {
    const result: RecoveryEvaluation = {
      status: "blocked",
      reason: fresh.blockedReason ?? "Policy re-check blocked recovery.",
      changes: fresh.policies.filter((p) => p.result === "blocked").map((p) => p.detail),
      policyBlocked: true,
      attemptNumber,
      priorFailedAttempts,
    };
    if (recordAudit) {
      await recordAuditEvent(sessionId, "RECOVERY_EVALUATED", "system", {
        decisionId,
        status: result.status,
        reason: result.reason,
        changes: result.changes,
      });
      await recordAuditEvent(sessionId, "RECOVERY_BLOCKED", "system", {
        decisionId,
        reason: result.reason,
        policyBlocked: true,
      });
    }
    return result;
  }

  if (fresh.status !== "ready") {
    const result: RecoveryEvaluation = {
      status: "re_evaluate",
      reason: "Catalog or intent no longer produces a valid offer. Run the agent again.",
      changes: ["No ready offer"],
      policyBlocked: false,
      attemptNumber,
      priorFailedAttempts,
    };
    if (recordAudit) {
      await recordAuditEvent(sessionId, "RECOVERY_EVALUATED", "system", {
        decisionId,
        status: result.status,
        reason: result.reason,
        changes: result.changes,
      });
    }
    return result;
  }

  const alignmentChanges = diffDecisionFromFresh(decision, fresh, catalog);
  changes.push(...alignmentChanges);

  if (changes.length > 0) {
    const result: RecoveryEvaluation = {
      status: "re_evaluate",
      reason:
        "Basket availability or pricing changed since checkout. Re-check the basket before retrying payment.",
      changes,
      policyBlocked: false,
      attemptNumber,
      priorFailedAttempts,
    };
    if (recordAudit) {
      await recordAuditEvent(sessionId, "RECOVERY_EVALUATED", "system", {
        decisionId,
        status: result.status,
        reason: result.reason,
        changes: result.changes,
      });
    }
    return result;
  }

  const result: RecoveryEvaluation = {
    status: "retryable",
    reason: "Basket and policy checks passed. Payment can be retried.",
    changes: [],
    policyBlocked: false,
    attemptNumber,
    priorFailedAttempts,
  };

  if (recordAudit) {
    await recordAuditEvent(sessionId, "RECOVERY_EVALUATED", "system", {
      decisionId,
      status: result.status,
      reason: result.reason,
      attemptNumber: result.attemptNumber,
      priorFailedAttempts: result.priorFailedAttempts,
    });
    await recordAuditEvent(sessionId, "RECOVERY_ALLOWED", "system", {
      decisionId,
      attemptNumber: result.attemptNumber,
    });
  }

  return result;
}

export async function getPaymentAttemptsForDecision(sessionId: string, decisionId: string) {
  const orders = await db.order.findMany({
    where: { sessionId, decisionId },
    orderBy: { createdAt: "asc" },
    include: {
      payments: { orderBy: { createdAt: "asc" } },
    },
  });

  return orders.flatMap((order) =>
    order.payments.map((payment) => ({
      orderId: order.id,
      paymentId: payment.id,
      attemptNumber: order.attemptNumber,
      orderStatus: order.status,
      paymentStatus: payment.status,
      amountPaise: order.amountPaise,
      failureReason: payment.failureReason,
      capturedAt: payment.capturedAt,
      createdAt: payment.createdAt,
    })),
  );
}
