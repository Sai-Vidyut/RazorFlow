import { db } from "@/lib/db";
import { resolveDemoMerchant } from "@/lib/services/merchant";

export type LedgerSessionRow = {
  id: string;
  when: string;
  session: string;
  intent: string;
  decision: string;
  policy: "Allowed" | "Blocked";
  payment: "Captured" | "Failed" | "Blocked" | "Pending";
  impact: number;
};

export type LedgerFunnelStep = {
  id: string;
  label: string;
  hint: string;
  count: number;
};

export type LedgerData = {
  weekGmv: number;
  weekDelta: number | null;
  sparkline: number[];
  attachRevenue: number;
  policyBlocks: number;
  policyEvaluated: number;
  funnel: LedgerFunnelStep[];
  sessions: LedgerSessionRow[];
};

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sessionLabel(rawRequest: string) {
  const trimmed = rawRequest.trim();
  if (trimmed.length <= 32) return trimmed;
  return `${trimmed.slice(0, 29)}…`;
}

function paymentStatusForSession(
  sessionStatus: string,
  hasCapturedPayment: boolean,
  hasFailedPayment: boolean,
  policyAllowed: boolean,
): LedgerSessionRow["payment"] {
  if (hasCapturedPayment) return "Captured";
  if (hasFailedPayment) return "Failed";
  if (!policyAllowed) return "Blocked";
  if (sessionStatus === "PAYMENT_PENDING") return "Pending";
  return "Pending";
}

export async function getLedgerData(): Promise<LedgerData> {
  const merchant = await resolveDemoMerchant();
  const now = new Date();
  const weekStart = startOfWeek(now);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  const [
    capturedPaymentsThisWeek,
    capturedPaymentsPrevWeek,
    sessions,
    policyBlockCount,
    policyEvaluatedCount,
    attachRevenueAgg,
  ] = await Promise.all([
    db.payment.findMany({
      where: {
        status: "CAPTURED",
        razorpaySignatureVerified: true,
        capturedAt: { gte: weekStart },
        order: { session: { merchantId: merchant.id } },
      },
      include: { order: true },
    }),
    db.payment.findMany({
      where: {
        status: "CAPTURED",
        razorpaySignatureVerified: true,
        capturedAt: { gte: prevWeekStart, lt: weekStart },
        order: { session: { merchantId: merchant.id } },
      },
      include: { order: true },
    }),
    db.buyerSession.findMany({
      where: { merchantId: merchant.id },
      include: {
        intent: true,
        decisions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            primaryProduct: true,
            attachProduct: true,
          },
        },
        orders: {
          include: { payments: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.agentDecision.count({
      where: { session: { merchantId: merchant.id }, policyAllowed: false },
    }),
    db.auditEvent.count({
      where: {
        session: { merchantId: merchant.id },
        type: "POLICY_EVALUATED",
      },
    }),
    db.agentDecision.aggregate({
      where: {
        session: {
          merchantId: merchant.id,
          orders: { some: { payments: { some: { status: "CAPTURED" } } } },
        },
        policyAllowed: true,
        attachRevenuePaise: { gt: 0 },
      },
      _sum: { attachRevenuePaise: true },
    }),
  ]);

  const weekGmvPaise = capturedPaymentsThisWeek.reduce((sum, p) => sum + p.order.amountPaise, 0);
  const prevWeekGmvPaise = capturedPaymentsPrevWeek.reduce((sum, p) => sum + p.order.amountPaise, 0);

  let weekDelta: number | null = null;
  if (prevWeekGmvPaise > 0) {
    weekDelta = (weekGmvPaise - prevWeekGmvPaise) / prevWeekGmvPaise;
  } else if (weekGmvPaise > 0) {
    weekDelta = 1;
  }

  const sparkline: number[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const dayStart = startOfDay(now);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayPayments = capturedPaymentsThisWeek.filter(
      (p) => p.capturedAt && p.capturedAt >= dayStart && p.capturedAt < dayEnd,
    );
    const dayGmvRupees = dayPayments.reduce((sum, p) => sum + p.order.amountPaise, 0) / 100;
    sparkline.push(dayGmvRupees);
  }

  const intentCount = sessions.length;
  const decisionCount = sessions.filter((s) => s.decisions.length > 0).length;
  const allowedCount = sessions.filter((s) => s.decisions[0]?.policyAllowed).length;
  const paymentProcessedCount = sessions.filter((s) =>
    s.orders.some((o) => o.payments.some((p) => p.status === "CAPTURED" || p.status === "FAILED")),
  ).length;
  const impactCount = sessions.filter((s) =>
    s.orders.some((o) => o.payments.some((p) => p.status === "CAPTURED")) &&
    (s.decisions[0]?.attachRevenuePaise ?? 0) > 0,
  ).length;

  const funnel: LedgerFunnelStep[] = [
    {
      id: "intent",
      label: "Intent captured",
      hint: "Buyer sessions parsed",
      count: intentCount,
    },
    {
      id: "policy",
      label: "Policy evaluated",
      hint: "Guardrails applied",
      count: policyEvaluatedCount,
    },
    {
      id: "decision",
      label: "Decisioned",
      hint: "Allowed or blocked",
      count: decisionCount,
    },
    {
      id: "pay",
      label: "Payment processed",
      hint: "Authorized or captured",
      count: paymentProcessedCount,
    },
    {
      id: "impact",
      label: "Impact recorded",
      hint: "Ledger updated",
      count: impactCount,
    },
  ];

  const ledgerSessions: LedgerSessionRow[] = sessions.map((session) => {
    const decision = session.decisions[0];
    const hasCaptured = session.orders.some((o) => o.payments.some((p) => p.status === "CAPTURED"));
    const hasFailed = session.orders.some((o) => o.payments.some((p) => p.status === "FAILED"));
    const policyAllowed = decision?.policyAllowed ?? false;

    let decisionLabel = "No decision";
    if (decision?.primaryProduct) {
      decisionLabel = decision.attachProduct
        ? `${decision.primaryProduct.name} + ${decision.attachProduct.name}`
        : decision.primaryProduct.name;
    } else if (decision?.status === "EMPTY") {
      decisionLabel = "No catalog fit";
    } else if (decision?.status === "BLOCKED") {
      decisionLabel = "Offer blocked";
    }

    return {
      id: session.id,
      when: session.createdAt.toISOString(),
      session: sessionLabel(session.rawRequest),
      intent: session.rawRequest,
      decision: decisionLabel,
      policy: policyAllowed ? "Allowed" : "Blocked",
      payment: paymentStatusForSession(session.status, hasCaptured, hasFailed, policyAllowed),
      impact: decision ? decision.attachRevenuePaise / 100 : 0,
    };
  });

  return {
    weekGmv: weekGmvPaise / 100,
    weekDelta,
    sparkline,
    attachRevenue: (attachRevenueAgg._sum.attachRevenuePaise ?? 0) / 100,
    policyBlocks: policyBlockCount,
    policyEvaluated: policyEvaluatedCount,
    funnel,
    sessions: ledgerSessions,
  };
}

export async function getLandingMetrics() {
  const ledger = await getLedgerData();
  return {
    weekGmv: ledger.weekGmv,
    attachRevenue: ledger.attachRevenue,
    policyBlocks: ledger.policyBlocks,
    policyEvaluated: ledger.policyEvaluated,
  };
}
