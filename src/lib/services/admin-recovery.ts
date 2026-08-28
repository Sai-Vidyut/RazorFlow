import { db } from "@/lib/db";
import {
  formatAuditEvent,
  merchantAuditWhere,
  privacySafeSessionRef,
  type AdminActivityItem,
} from "@/lib/services/admin-audit";
import { getPaymentAttemptsForDecision } from "@/lib/services/recovery";

export type RecoveryFilter = "all" | "candidate" | "recovered" | "in_progress";

export type RecoveryState = "candidate" | "recovered" | "in_progress";

export type AdminRecoveryListItem = {
  id: string;
  decisionId: string;
  sessionId: string;
  sessionRef: string;
  products: string;
  amountInr: number;
  amountAtRiskInr: number;
  recoveryState: RecoveryState;
  failedAttempts: number;
  lastFailureReason: string | null;
  lastFailedAt: string | null;
  recoveredAt: string | null;
  latestOrderId: string;
};

export type AdminRecoveryDetail = {
  decisionId: string;
  sessionId: string;
  sessionRef: string;
  products: string;
  amountInr: number;
  recoveryState: RecoveryState;
  paymentAttempts: Array<{
    orderId: string;
    paymentId: string;
    attemptNumber: number;
    paymentStatus: string;
    orderStatus: string;
    amountInr: number;
    failureReason: string | null;
    capturedAt: string | null;
    createdAt: string;
  }>;
  auditEvents: AdminActivityItem[];
};

function productBundleLabel(
  primary: { name: string } | null,
  attach: { name: string } | null,
): string {
  if (!primary) return "No product";
  if (attach) return `${primary.name} + ${attach.name}`;
  return primary.name;
}

function deriveRecoveryState(
  orders: Array<{ status: string; payments: Array<{ status: string }> }>,
): RecoveryState {
  const hasPaid = orders.some((order) => order.status === "PAID");
  if (hasPaid) return "recovered";

  const hasPending = orders.some(
    (order) =>
      (order.status === "CREATED" || order.status === "PENDING") &&
      order.payments.some((payment) => payment.status === "PENDING"),
  );
  if (hasPending) return "in_progress";

  return "candidate";
}

export async function listAdminRecovery(
  merchantId: string,
  filter: RecoveryFilter = "all",
): Promise<AdminRecoveryListItem[]> {
  const decisions = await db.agentDecision.findMany({
    where: {
      session: { merchantId },
      orders: { some: { payments: { some: { status: "FAILED" } } } },
    },
    include: {
      session: true,
      primaryProduct: true,
      attachProduct: true,
      orders: {
        orderBy: { createdAt: "asc" },
        include: { payments: { orderBy: { createdAt: "asc" } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const items: AdminRecoveryListItem[] = [];

  for (const decision of decisions) {
    const recoveryState = deriveRecoveryState(decision.orders);
    if (filter !== "all" && filter !== recoveryState) continue;

    const failedPayments = decision.orders.flatMap((order) =>
      order.payments
        .filter((payment) => payment.status === "FAILED")
        .map((payment) => ({ order, payment })),
    );
    if (failedPayments.length === 0) continue;

    const lastFailed = failedPayments[failedPayments.length - 1]!;
    const captured = decision.orders.flatMap((order) =>
      order.payments.filter((payment) => payment.status === "CAPTURED"),
    );
    const lastCaptured = captured[captured.length - 1];
    const latestOrder = decision.orders[decision.orders.length - 1]!;

    items.push({
      id: decision.id,
      decisionId: decision.id,
      sessionId: decision.sessionId,
      sessionRef: privacySafeSessionRef(decision.sessionId, decision.session.rawRequest),
      products: productBundleLabel(decision.primaryProduct, decision.attachProduct),
      amountInr: latestOrder.amountPaise / 100,
      amountAtRiskInr: recoveryState === "candidate" ? lastFailed.order.amountPaise / 100 : 0,
      recoveryState,
      failedAttempts: failedPayments.length,
      lastFailureReason: lastFailed.payment.failureReason,
      lastFailedAt: lastFailed.payment.createdAt.toISOString(),
      recoveredAt: lastCaptured?.capturedAt?.toISOString() ?? null,
      latestOrderId: latestOrder.id,
    });
  }

  return items.sort((a, b) => {
    const aTime = a.lastFailedAt ?? "";
    const bTime = b.lastFailedAt ?? "";
    return bTime.localeCompare(aTime);
  });
}

export async function getAdminRecoveryDetail(
  merchantId: string,
  decisionId: string,
): Promise<AdminRecoveryDetail | null> {
  const decision = await db.agentDecision.findFirst({
    where: { id: decisionId, session: { merchantId } },
    include: {
      session: true,
      primaryProduct: true,
      attachProduct: true,
      orders: {
        orderBy: { createdAt: "asc" },
        include: { payments: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  if (!decision) return null;

  const paymentAttempts = await getPaymentAttemptsForDecision(decision.sessionId, decision.id);
  const recoveryState = deriveRecoveryState(decision.orders);
  const latestOrder = decision.orders[decision.orders.length - 1];

  const auditEvents = await db.auditEvent.findMany({
    where: {
      sessionId: decision.sessionId,
      type: {
        in: [
          "PAYMENT_FAILED",
          "PAYMENT_CAPTURED",
          "RECOVERY_EVALUATED",
          "RECOVERY_ALLOWED",
          "RECOVERY_BLOCKED",
          "RECOVERY_ATTEMPTED",
          "RECOVERY_SUCCEEDED",
          "RECOVERY_FAILED",
          "CHECKOUT_STARTED",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return {
    decisionId: decision.id,
    sessionId: decision.sessionId,
    sessionRef: privacySafeSessionRef(decision.sessionId, decision.session.rawRequest),
    products: productBundleLabel(decision.primaryProduct, decision.attachProduct),
    amountInr: latestOrder ? latestOrder.amountPaise / 100 : 0,
    recoveryState,
    paymentAttempts: paymentAttempts.map((attempt) => ({
      orderId: attempt.orderId,
      paymentId: attempt.paymentId,
      attemptNumber: attempt.attemptNumber,
      paymentStatus: attempt.paymentStatus,
      orderStatus: attempt.orderStatus,
      amountInr: attempt.amountPaise / 100,
      failureReason: attempt.failureReason,
      capturedAt: attempt.capturedAt?.toISOString() ?? null,
      createdAt: attempt.createdAt.toISOString(),
    })),
    auditEvents: auditEvents.map(formatAuditEvent),
  };
}

export async function queryRecoveryMetrics(merchantId: string) {
  const merchantScope = merchantAuditWhere(merchantId);

  const [
    failedPaymentAmountPaise,
    recoveryCandidates,
    recoveryAttempts,
    recoveredPayments,
    recoveredGmvPaise,
  ] = await Promise.all([
    db.payment
      .findMany({
        where: { status: "FAILED", order: { session: { merchantId } } },
        include: { order: true },
      })
      .then((rows) => rows.reduce((sum, row) => sum + row.order.amountPaise, 0)),
    db.agentDecision.count({
      where: {
        session: { merchantId },
        orders: { some: { status: "FAILED" } },
        NOT: { orders: { some: { status: "PAID" } } },
      },
    }),
    db.auditEvent.count({
      where: { ...merchantScope, type: "RECOVERY_ATTEMPTED" },
    }),
    db.auditEvent.count({
      where: { ...merchantScope, type: "RECOVERY_SUCCEEDED" },
    }),
    db.auditEvent
      .findMany({
        where: { ...merchantScope, type: "RECOVERY_SUCCEEDED" },
      })
      .then((rows) =>
        rows.reduce((sum, row) => {
          const data = row.data as { amountPaise?: number };
          return sum + (typeof data.amountPaise === "number" ? data.amountPaise : 0);
        }, 0),
      ),
  ]);

  const recoveryRate =
    recoveryAttempts > 0 ? recoveredPayments / recoveryAttempts : null;

  return {
    failedPaymentAmountInr: failedPaymentAmountPaise / 100,
    recoveryCandidates,
    recoveryAttempts,
    recoveredPayments,
    recoveredGmvInr: recoveredGmvPaise / 100,
    recoveryRate,
  };
}
