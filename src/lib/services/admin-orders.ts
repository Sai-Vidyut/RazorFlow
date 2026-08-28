import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  formatAuditEvent,
  merchantAuditWhere,
  privacySafeSessionRef,
  type AdminActivityItem,
} from "@/lib/services/admin-audit";

export class AdminOrderError extends Error {
  constructor(
    message: string,
    readonly status: number = 404,
  ) {
    super(message);
    this.name = "AdminOrderError";
  }
}

export type AdminOrderFilter = "all" | "pending" | "paid" | "failed";

export type AdminOrderListItem = {
  id: string;
  createdAt: string;
  sessionRef: string;
  sessionId: string;
  products: string;
  quantity: number;
  amountInr: number;
  orderStatus: OrderStatus;
  paymentStatus: "Captured" | "Failed" | "Pending" | "None";
};

export type AdminOrderDetail = {
  id: string;
  createdAt: string;
  sessionRef: string;
  sessionId: string;
  orderStatus: OrderStatus;
  amountInr: number;
  currency: string;
  razorpayOrderId: string | null;
  products: {
    primary: { name: string; sku: string } | null;
    attach: { name: string; sku: string } | null;
  };
  quantity: number;
  subtotalInr: number;
  discountPct: number;
  decision: {
    status: string;
    policyAllowed: boolean;
    policyReason: string | null;
    recommendationReason: string;
    marginPct: number;
  };
  payment: {
    id: string | null;
    status: PaymentStatus | "None";
    razorpayPaymentId: string | null;
    failureReason: string | null;
    capturedAt: string | null;
  };
  auditEvents: AdminActivityItem[];
};

function orderStatusWhere(filter: AdminOrderFilter) {
  switch (filter) {
    case "pending":
      return { status: { in: ["PENDING", "CREATED"] as OrderStatus[] } };
    case "paid":
      return { status: "PAID" as const };
    case "failed":
      return { status: "FAILED" as const };
    default:
      return {};
  }
}

function derivePaymentStatus(
  payments: Array<{ status: PaymentStatus }>,
): AdminOrderListItem["paymentStatus"] {
  if (payments.some((payment) => payment.status === "CAPTURED")) return "Captured";
  if (payments.some((payment) => payment.status === "FAILED")) return "Failed";
  if (payments.some((payment) => payment.status === "PENDING" || payment.status === "AUTHORIZED")) {
    return "Pending";
  }
  return "None";
}

function productBundleLabel(
  primary: { name: string } | null,
  attach: { name: string } | null,
): string {
  if (!primary) return "No product";
  if (attach) return `${primary.name} + ${attach.name}`;
  return primary.name;
}

export async function listAdminOrders(
  merchantId: string,
  filter: AdminOrderFilter = "all",
): Promise<AdminOrderListItem[]> {
  const statusWhere = orderStatusWhere(filter);

  const orders = await db.order.findMany({
    where: {
      session: { merchantId },
      ...statusWhere,
    },
    include: {
      session: true,
      payments: true,
      decision: {
        include: {
          primaryProduct: true,
          attachProduct: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return orders.map((order) => ({
    id: order.id,
    createdAt: order.createdAt.toISOString(),
    sessionRef: privacySafeSessionRef(order.sessionId, order.session.rawRequest),
    sessionId: order.sessionId,
    products: productBundleLabel(order.decision.primaryProduct, order.decision.attachProduct),
    quantity: order.decision.quantity,
    amountInr: order.amountPaise / 100,
    orderStatus: order.status,
    paymentStatus: derivePaymentStatus(order.payments),
  }));
}

export async function getAdminOrderDetail(
  merchantId: string,
  orderId: string,
): Promise<AdminOrderDetail> {
  const order = await db.order.findFirst({
    where: { id: orderId, session: { merchantId } },
    include: {
      session: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      decision: {
        include: {
          primaryProduct: true,
          attachProduct: true,
        },
      },
    },
  });

  if (!order) {
    throw new AdminOrderError("Order not found", 404);
  }

  const payment = order.payments[0] ?? null;

  const auditEvents = await db.auditEvent.findMany({
    where: {
      sessionId: order.sessionId,
      ...merchantAuditWhere(merchantId),
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      data: true,
      createdAt: true,
      sessionId: true,
      actor: true,
    },
  });

  return {
    id: order.id,
    createdAt: order.createdAt.toISOString(),
    sessionRef: privacySafeSessionRef(order.sessionId, order.session.rawRequest),
    sessionId: order.sessionId,
    orderStatus: order.status,
    amountInr: order.amountPaise / 100,
    currency: order.currency,
    razorpayOrderId: order.razorpayOrderId,
    products: {
      primary: order.decision.primaryProduct
        ? { name: order.decision.primaryProduct.name, sku: order.decision.primaryProduct.sku }
        : null,
      attach: order.decision.attachProduct
        ? { name: order.decision.attachProduct.name, sku: order.decision.attachProduct.sku }
        : null,
    },
    quantity: order.decision.quantity,
    subtotalInr: order.decision.subtotalPaise / 100,
    discountPct: order.decision.discountPct,
    decision: {
      status: order.decision.status,
      policyAllowed: order.decision.policyAllowed,
      policyReason: order.decision.policyReason,
      recommendationReason: order.decision.recommendationReason,
      marginPct: order.decision.marginPct,
    },
    payment: {
      id: payment?.id ?? null,
      status: payment?.status ?? "None",
      razorpayPaymentId: payment?.razorpayPaymentId ?? null,
      failureReason: payment?.failureReason ?? null,
      capturedAt: payment?.capturedAt?.toISOString() ?? null,
    },
    auditEvents: auditEvents.map(formatAuditEvent),
  };
}
