/**
 * Admin Portal metric definitions.
 *
 * Every value is computed from PostgreSQL at request time.
 * No hardcoded fallbacks, random values, or demo transaction seed data.
 */
import { db } from "@/lib/db";
import { merchantAuditWhere } from "@/lib/services/admin-audit";

export const ADMIN_METRIC_DEFINITIONS = {
  gmvInr:
    "Sum of Order.amountPaise for Payment.status = CAPTURED with verified capture path only.",
  orderCount: "Count of Order rows for this merchant.",
  capturedPayments: "Count of Payment rows with status = CAPTURED.",
  failedPayments: "Count of Payment rows with status = FAILED.",
  pendingPayments: "Count of Payment rows with status = PENDING.",
  conversionRate:
    "Captured payments ÷ CHECKOUT_STARTED audit events. Null when no checkout attempts exist.",
  agentDecisions:
    "Count of AgentDecision rows where supersededAt IS NULL for this merchant.",
  offersGenerated:
    "Count of non-superseded AgentDecision rows with a primaryProductId (agent issued an offer).",
  policyBlocks:
    "Count of non-superseded AgentDecision rows where policyAllowed = false.",
  checkoutAttempts: "Count of AuditEvent rows with type = CHECKOUT_STARTED.",
  attachRate:
    "Non-superseded policy-allowed decisions with attachProductId ÷ non-superseded policy-allowed decisions with primaryProductId. Null when none eligible.",
  timesRecommended:
    "Non-superseded AgentDecision rows where primaryProductId matches the product.",
  timesPurchased: "Order rows with status = PAID whose decision.primaryProductId matches the product.",
  productRevenueInr:
    "Sum of Order.amountPaise for PAID orders attributed to the product as primary.",
} as const;

export type CommerceMetrics = {
  gmvInr: number;
  orderCount: number;
  capturedPayments: number;
  failedPayments: number;
  pendingPayments: number;
  conversionRate: number | null;
};

export type AgentMetrics = {
  decisions: number;
  offersGenerated: number;
  policyBlocks: number;
  checkoutAttempts: number;
  paymentFailures: number;
};

export type ProductPerformanceRow = {
  productId: string;
  sku: string;
  name: string;
  timesRecommended: number;
  timesPurchased: number;
  revenueInr: number;
};

function merchantOrderScope(merchantId: string) {
  return { session: { merchantId } };
}

export async function queryCommerceMetrics(merchantId: string): Promise<CommerceMetrics> {
  const merchantScope = merchantOrderScope(merchantId);

  const [capturedPayments, orderCount, failedPayments, pendingPayments, checkoutAttempts] =
    await Promise.all([
      db.payment.findMany({
        where: {
          status: "CAPTURED",
          razorpaySignatureVerified: true,
          order: merchantScope,
        },
        include: { order: true },
      }),
      db.order.count({ where: merchantScope }),
      db.payment.count({ where: { status: "FAILED", order: merchantScope } }),
      db.payment.count({ where: { status: "PENDING", order: merchantScope } }),
      db.auditEvent.count({
        where: { ...merchantAuditWhere(merchantId), type: "CHECKOUT_STARTED" },
      }),
    ]);

  const gmvPaise = capturedPayments.reduce((sum, payment) => sum + payment.order.amountPaise, 0);
  const capturedCount = capturedPayments.length;

  let conversionRate: number | null = null;
  if (checkoutAttempts > 0) {
    conversionRate = capturedCount / checkoutAttempts;
  }

  return {
    gmvInr: gmvPaise / 100,
    orderCount,
    capturedPayments: capturedCount,
    failedPayments,
    pendingPayments,
    conversionRate,
  };
}

export async function queryAgentMetrics(merchantId: string): Promise<AgentMetrics> {
  const [decisions, offersGenerated, policyBlocks, checkoutAttempts, paymentFailures] =
    await Promise.all([
      db.agentDecision.count({
        where: { session: { merchantId }, supersededAt: null },
      }),
      db.agentDecision.count({
        where: {
          session: { merchantId },
          supersededAt: null,
          primaryProductId: { not: null },
        },
      }),
      db.agentDecision.count({
        where: { session: { merchantId }, policyAllowed: false, supersededAt: null },
      }),
      db.auditEvent.count({
        where: { ...merchantAuditWhere(merchantId), type: "CHECKOUT_STARTED" },
      }),
      db.payment.count({
        where: { status: "FAILED", order: merchantOrderScope(merchantId) },
      }),
    ]);

  return {
    decisions,
    offersGenerated,
    policyBlocks,
    checkoutAttempts,
    paymentFailures,
  };
}

export async function queryAttachRate(merchantId: string): Promise<number | null> {
  const [decisionsWithAttach, eligibleDecisions] = await Promise.all([
    db.agentDecision.count({
      where: {
        session: { merchantId },
        supersededAt: null,
        policyAllowed: true,
        primaryProductId: { not: null },
        attachProductId: { not: null },
      },
    }),
    db.agentDecision.count({
      where: {
        session: { merchantId },
        supersededAt: null,
        policyAllowed: true,
        primaryProductId: { not: null },
      },
    }),
  ]);

  if (eligibleDecisions === 0) return null;
  return decisionsWithAttach / eligibleDecisions;
}

export async function queryProductPerformance(
  merchantId: string,
): Promise<ProductPerformanceRow[]> {
  const products = await db.product.findMany({
    where: { merchantId },
    select: { id: true, sku: true, name: true },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(
    products.map(async (product) => {
      const [timesRecommended, purchasedOrders] = await Promise.all([
        db.agentDecision.count({
          where: {
            primaryProductId: product.id,
            session: { merchantId },
            supersededAt: null,
          },
        }),
        db.order.findMany({
          where: {
            status: "PAID",
            session: { merchantId },
            decision: { primaryProductId: product.id },
          },
          select: { amountPaise: true },
        }),
      ]);

      const revenuePaise = purchasedOrders.reduce((sum, order) => sum + order.amountPaise, 0);

      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        timesRecommended,
        timesPurchased: purchasedOrders.length,
        revenueInr: revenuePaise / 100,
      };
    }),
  );

  return rows.filter(
    (row) => row.timesRecommended > 0 || row.timesPurchased > 0 || row.revenueInr > 0,
  );
}
