import { db } from "@/lib/db";
import {
  activityFilterTypes,
  formatAuditEvent,
  merchantAuditWhere,
  type AdminActivityFilter,
  type AdminActivityItem,
} from "@/lib/services/admin-audit";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type AdminActivityPage = {
  items: AdminActivityItem[];
  total: number;
  limit: number;
  offset: number;
  filter: AdminActivityFilter;
};

export function parseActivityLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

export function parseActivityOffset(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

export function parseActivityFilter(value: string | null): AdminActivityFilter {
  const allowed: AdminActivityFilter[] = [
    "all",
    "products",
    "policies",
    "orders",
    "payments",
    "agent",
    "system",
  ];
  if (value && allowed.includes(value as AdminActivityFilter)) {
    return value as AdminActivityFilter;
  }
  return "all";
}

export async function listAdminActivity(
  merchantId: string,
  options: {
    filter?: AdminActivityFilter;
    limit?: number;
    offset?: number;
  } = {},
): Promise<AdminActivityPage> {
  const filter = options.filter ?? "all";
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  const types = activityFilterTypes(filter);

  const where = {
    ...merchantAuditWhere(merchantId),
    ...(types ? { type: { in: types } } : {}),
  };

  const [total, events] = await Promise.all([
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
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
    items: events.map(formatAuditEvent),
    total,
    limit,
    offset,
    filter,
  };
}
