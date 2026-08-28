import { db } from "@/lib/db";
import { formatAuditEvent, merchantAuditWhere, type AdminActivityItem } from "@/lib/services/admin-audit";
import {
  queryAgentMetrics,
  queryCommerceMetrics,
} from "@/lib/services/admin-metrics";
import { resolveMerchantById } from "@/lib/services/merchant";

/**
 * Default low-stock threshold until merchant-configurable inventory alerts are added.
 * A product is low-stock when: active, inventory > 0, inventory <= this threshold.
 */
export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

const RECENT_ACTIVITY_LIMIT = 8;

export type { AdminActivityItem };

export type AdminOverviewData = {
  merchant: {
    id: string;
    name: string;
  };
  commerce: Awaited<ReturnType<typeof queryCommerceMetrics>>;
  catalog: {
    activeCount: number;
    inactiveCount: number;
    zeroInventoryCount: number;
    lowStockCount: number;
    totalInventoryUnits: number;
    lowStockThreshold: number;
  };
  agent: Awaited<ReturnType<typeof queryAgentMetrics>>;
  recentActivity: AdminActivityItem[];
};

export async function getAdminOverview(merchantId: string): Promise<AdminOverviewData> {
  const merchant = await resolveMerchantById(merchantId);
  const lowStockThreshold = DEFAULT_LOW_STOCK_THRESHOLD;

  const [
    commerce,
    agent,
    activeCount,
    inactiveCount,
    zeroInventoryCount,
    lowStockCount,
    inventoryAgg,
    recentEvents,
  ] = await Promise.all([
    queryCommerceMetrics(merchantId),
    queryAgentMetrics(merchantId),
    db.product.count({ where: { merchantId, active: true } }),
    db.product.count({ where: { merchantId, active: false } }),
    db.product.count({ where: { merchantId, active: true, inventory: 0 } }),
    db.product.count({
      where: {
        merchantId,
        active: true,
        inventory: { gt: 0, lte: lowStockThreshold },
      },
    }),
    db.product.aggregate({
      where: { merchantId, active: true },
      _sum: { inventory: true },
    }),
    db.auditEvent.findMany({
      where: merchantAuditWhere(merchantId),
      orderBy: { createdAt: "desc" },
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        type: true,
        data: true,
        createdAt: true,
        sessionId: true,
        actor: true,
      },
    }),
  ]);

  return {
    merchant: {
      id: merchant.id,
      name: merchant.name,
    },
    commerce,
    catalog: {
      activeCount,
      inactiveCount,
      zeroInventoryCount,
      lowStockCount,
      totalInventoryUnits: inventoryAgg._sum.inventory ?? 0,
      lowStockThreshold,
    },
    agent,
    recentActivity: recentEvents.map(formatAuditEvent),
  };
}
