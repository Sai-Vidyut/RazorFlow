import {
  ADMIN_METRIC_DEFINITIONS,
  queryAttachRate,
  queryCommerceMetrics,
  queryAgentMetrics,
  queryProductPerformance,
  type ProductPerformanceRow,
} from "@/lib/services/admin-metrics";
import { db } from "@/lib/db";

export type AdminInsightsData = {
  definitions: typeof ADMIN_METRIC_DEFINITIONS;
  revenue: {
    gmvInr: number;
    capturedRevenueInr: number;
    averageOrderValueInr: number | null;
  };
  funnel: {
    buyerSessions: number;
    agentDecisions: number;
    checkoutStarts: number;
    successfulPayments: number;
    failedPayments: number;
  };
  agent: {
    offersGenerated: number;
    policyBlocks: number;
    attachRate: number | null;
    conversionRate: number | null;
  };
  products: ProductPerformanceRow[];
  notes: string[];
};

export async function getAdminInsights(merchantId: string): Promise<AdminInsightsData> {
  const notes: string[] = [];

  const [commerce, agentMetrics, attachRate, buyerSessions, products] = await Promise.all([
    queryCommerceMetrics(merchantId),
    queryAgentMetrics(merchantId),
    queryAttachRate(merchantId),
    db.buyerSession.count({ where: { merchantId } }),
    queryProductPerformance(merchantId),
  ]);

  let averageOrderValueInr: number | null = null;
  if (commerce.capturedPayments > 0) {
    averageOrderValueInr = commerce.gmvInr / commerce.capturedPayments;
  } else {
    notes.push("Average order value requires at least one captured payment.");
  }

  if (attachRate == null) {
    notes.push("Attach rate requires at least one policy-allowed agent decision with a primary product.");
  }

  if (commerce.conversionRate == null) {
    notes.push("Conversion rate requires at least one checkout attempt.");
  }

  if (products.length === 0) {
    notes.push("Product performance metrics appear after agent recommendations or captured orders.");
  }

  return {
    definitions: ADMIN_METRIC_DEFINITIONS,
    revenue: {
      gmvInr: commerce.gmvInr,
      capturedRevenueInr: commerce.gmvInr,
      averageOrderValueInr,
    },
    funnel: {
      buyerSessions,
      agentDecisions: agentMetrics.decisions,
      checkoutStarts: agentMetrics.checkoutAttempts,
      successfulPayments: commerce.capturedPayments,
      failedPayments: commerce.failedPayments,
    },
    agent: {
      offersGenerated: agentMetrics.offersGenerated,
      policyBlocks: agentMetrics.policyBlocks,
      attachRate,
      conversionRate: commerce.conversionRate,
    },
    products,
    notes,
  };
}
