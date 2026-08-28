import type { AgentDecision, SessionStatus } from "@prisma/client";
import { runAgentWithParsed } from "@/lib/agent/run-agent";
import type { AgentResult, Product } from "@/lib/agent/types";
import { recordAuditEvent } from "@/lib/audit";
import { db } from "@/lib/db";
import { rupeesToPaise } from "@/lib/format";
import { getRazorpayClient, getPublicRazorpayKeyId, isRazorpayConfigured } from "@/lib/razorpay/client";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { getMerchantPoliciesForAgent } from "@/lib/services/policies";
import { evaluateRecovery, isRecoveryContext, nextAttemptNumber } from "@/lib/services/recovery";
import { loadStructuredIntentFromSession } from "@/lib/services/sessions";

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

const STALE_DECISION_MESSAGE =
  "This offer is no longer valid. Run the agent again for an updated decision.";

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

function freshProductIds(fresh: AgentResult, catalog: Product[]) {
  const freshPrimaryId = fresh.primary
    ? (catalog.find((product) => product.sku === fresh.primary!.sku)?.id ?? null)
    : null;
  const freshAttachId = fresh.attach
    ? (catalog.find((product) => product.sku === fresh.attach!.sku)?.id ?? null)
    : null;
  return { freshPrimaryId, freshAttachId };
}

export function assertDecisionAlignedWithFreshAgent(
  decision: DecisionSnapshot,
  fresh: AgentResult,
  catalog: Product[],
): void {
  if (decision.supersededAt) {
    throw new CheckoutError(
      "This decision is no longer active. Run the agent again for an updated decision.",
      409,
    );
  }

  if (fresh.status !== "ready") {
    throw new CheckoutError("Policy re-check blocked this purchase", 403);
  }

  const { freshPrimaryId, freshAttachId } = freshProductIds(fresh, catalog);
  const freshSubtotalPaise = rupeesToPaise(fresh.subtotal);

  if (decision.primaryProductId !== freshPrimaryId) {
    throw new CheckoutError(STALE_DECISION_MESSAGE, 409);
  }
  if (decision.attachProductId !== freshAttachId) {
    throw new CheckoutError(STALE_DECISION_MESSAGE, 409);
  }
  if (decision.subtotalPaise !== freshSubtotalPaise) {
    throw new CheckoutError(STALE_DECISION_MESSAGE, 409);
  }
  if (decision.discountPct !== fresh.discountPct) {
    throw new CheckoutError(STALE_DECISION_MESSAGE, 409);
  }
  if (decision.quantity !== fresh.intent.quantity) {
    throw new CheckoutError(STALE_DECISION_MESSAGE, 409);
  }
}

export async function assertNoDuplicateCheckout(
  sessionId: string,
  decisionId: string,
  sessionStatus: SessionStatus,
): Promise<void> {
  if (sessionStatus === "PAYMENT_CAPTURED") {
    throw new CheckoutError("This session has already been paid.", 409);
  }

  if (sessionStatus === "PAYMENT_PENDING") {
    throw new CheckoutError("A payment is already in progress for this session.", 409);
  }

  const blockingOrder = await db.order.findFirst({
    where: {
      sessionId,
      decisionId,
      status: { notIn: ["CANCELLED"] },
      OR: [
        { status: "PAID" },
        {
          status: "CREATED",
          payments: { some: { status: "PENDING" } },
        },
      ],
    },
  });

  if (blockingOrder) {
    throw new CheckoutError("An active or completed order already exists for this decision.", 409);
  }
}

export async function createCheckoutForSession(sessionId: string, decisionId: string) {
  if (!isRazorpayConfigured()) {
    throw new CheckoutError("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.", 503);
  }

  const session = await db.buyerSession.findUnique({
    where: { id: sessionId },
    include: {
      intent: true,
      decisions: {
        where: { id: decisionId },
        take: 1,
      },
    },
  });

  if (!session || !session.intent) {
    throw new CheckoutError("Session not found", 404);
  }

  const decision = session.decisions[0];
  if (!decision) {
    throw new CheckoutError("Decision not found", 404);
  }

  if (!decision.policyAllowed || decision.status !== "READY") {
    throw new CheckoutError("Purchase is not allowed by merchant policy", 403);
  }

  if (decision.supersededAt) {
    throw new CheckoutError(
      "This decision is no longer active. Run the agent again for an updated decision.",
      409,
    );
  }

  await assertNoDuplicateCheckout(sessionId, decisionId, session.status);

  const recovering = await isRecoveryContext(sessionId, decisionId);
  const attemptNumber = await nextAttemptNumber(sessionId, decisionId);

  if (recovering) {
    const recovery = await evaluateRecovery(sessionId, decisionId, { recordAudit: true });
    if (recovery.status === "blocked") {
      throw new CheckoutError(recovery.reason, 403);
    }
    if (recovery.status === "re_evaluate") {
      throw new CheckoutError(recovery.reason, 409);
    }
  }

  const intent = loadStructuredIntentFromSession(session);
  const policies = await getMerchantPoliciesForAgent(session.merchantId);
  const catalog = await getAvailableCatalog(session.merchantId);
  const fresh = runAgentWithParsed(intent, policies, catalog);

  assertDecisionAlignedWithFreshAgent(decision, fresh, catalog);

  const amountPaise = decision.subtotalPaise;
  if (amountPaise < 100) {
    throw new CheckoutError("Order amount is invalid", 400);
  }

  const order = await db.order.create({
    data: {
      sessionId,
      decisionId,
      amountPaise,
      currency: "INR",
      status: "CREATED",
      attemptNumber,
    },
  });

  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      status: "PENDING",
    },
  });

  await recordAuditEvent(sessionId, "ORDER_CREATED", "system", {
    orderId: order.id,
    decisionId,
    amountPaise,
  });

  const client = getRazorpayClient();
  const razorpayOrder = await client.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: `rf_${order.id}`,
    notes: {
      sessionId,
      decisionId,
      orderId: order.id,
    },
  });

  await db.order.update({
    where: { id: order.id },
    data: { razorpayOrderId: razorpayOrder.id },
  });

  await db.buyerSession.update({
    where: { id: sessionId },
    data: { status: "PAYMENT_PENDING" },
  });

  await recordAuditEvent(sessionId, "CHECKOUT_STARTED", "system", {
    orderId: order.id,
    paymentId: payment.id,
    razorpayOrderId: razorpayOrder.id,
    amountPaise,
    attemptNumber,
    isRecovery: recovering,
  });

  if (recovering) {
    await recordAuditEvent(sessionId, "RECOVERY_ATTEMPTED", "system", {
      orderId: order.id,
      paymentId: payment.id,
      decisionId,
      attemptNumber,
    });
  }

  return {
    keyId: getPublicRazorpayKeyId(),
    orderId: order.id,
    paymentId: payment.id,
    razorpayOrderId: razorpayOrder.id,
    amountPaise,
    currency: "INR" as const,
  };
}
