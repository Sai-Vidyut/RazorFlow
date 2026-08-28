import type { PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  formatAuditEvent,
  merchantAuditWhere,
  privacySafeSessionRef,
  type AdminActivityItem,
} from "@/lib/services/admin-audit";

export class AdminPaymentError extends Error {
  constructor(
    message: string,
    readonly status: number = 404,
  ) {
    super(message);
    this.name = "AdminPaymentError";
  }
}

export type AdminPaymentFilter = "all" | "captured" | "failed" | "pending";

export type AdminPaymentListItem = {
  id: string;
  orderId: string;
  amountInr: number;
  status: PaymentStatus;
  razorpayPaymentId: string | null;
  createdAt: string;
  capturedAt: string | null;
  failureReason: string | null;
};

export type AdminPaymentDetail = AdminPaymentListItem & {
  sessionRef: string;
  sessionId: string;
  orderStatus: string;
  products: string;
  auditEvents: AdminActivityItem[];
};

function paymentStatusFilter(filter: AdminPaymentFilter): PaymentStatus | undefined {
  switch (filter) {
    case "captured":
      return "CAPTURED";
    case "failed":
      return "FAILED";
    case "pending":
      return "PENDING";
    default:
      return undefined;
  }
}

function productBundleLabel(
  primary: { name: string } | null,
  attach: { name: string } | null,
): string {
  if (!primary) return "No product";
  if (attach) return `${primary.name} + ${attach.name}`;
  return primary.name;
}

export async function listAdminPayments(
  merchantId: string,
  filter: AdminPaymentFilter = "all",
): Promise<AdminPaymentListItem[]> {
  const status = paymentStatusFilter(filter);

  const payments = await db.payment.findMany({
    where: {
      ...(status ? { status } : {}),
      order: { session: { merchantId } },
    },
    include: { order: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return payments.map((payment) => ({
    id: payment.id,
    orderId: payment.orderId,
    amountInr: payment.order.amountPaise / 100,
    status: payment.status,
    razorpayPaymentId: payment.razorpayPaymentId,
    createdAt: payment.createdAt.toISOString(),
    capturedAt: payment.capturedAt?.toISOString() ?? null,
    failureReason: payment.failureReason,
  }));
}

export async function getAdminPaymentDetail(
  merchantId: string,
  paymentId: string,
): Promise<AdminPaymentDetail> {
  const payment = await db.payment.findFirst({
    where: {
      id: paymentId,
      order: { session: { merchantId } },
    },
    include: {
      order: {
        include: {
          session: true,
          decision: {
            include: {
              primaryProduct: true,
              attachProduct: true,
            },
          },
        },
      },
    },
  });

  if (!payment) {
    throw new AdminPaymentError("Payment not found", 404);
  }

  const auditEvents = await db.auditEvent.findMany({
    where: {
      sessionId: payment.order.sessionId,
      ...merchantAuditWhere(merchantId),
      type: {
        in: [
          "PAYMENT_VERIFICATION_ATTEMPTED",
          "PAYMENT_VERIFIED",
          "PAYMENT_CAPTURED",
          "PAYMENT_FAILED",
          "PAYMENT_VERIFICATION_FAILED",
          "WEBHOOK_RECEIVED",
          "CHECKOUT_STARTED",
          "ORDER_CREATED",
        ],
      },
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
    id: payment.id,
    orderId: payment.orderId,
    amountInr: payment.order.amountPaise / 100,
    status: payment.status,
    razorpayPaymentId: payment.razorpayPaymentId,
    createdAt: payment.createdAt.toISOString(),
    capturedAt: payment.capturedAt?.toISOString() ?? null,
    failureReason: payment.failureReason,
    sessionRef: privacySafeSessionRef(payment.order.sessionId, payment.order.session.rawRequest),
    sessionId: payment.order.sessionId,
    orderStatus: payment.order.status,
    products: productBundleLabel(
      payment.order.decision.primaryProduct,
      payment.order.decision.attachProduct,
    ),
    auditEvents: auditEvents.map(formatAuditEvent),
  };
}
