import type { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { db } from "@/lib/db";
import { getRazorpayKeySecret } from "@/lib/razorpay/client";
import { verifyPaymentSignature, verifyWebhookSignature } from "@/lib/razorpay/verify";
import { countPriorFailedAttempts } from "@/lib/services/recovery";
import { getLedgerData } from "@/lib/services/ledger";
import { buildCapturedPaymentView } from "@/lib/services/desk-session-state";

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

type VerifyInput = {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};

export async function verifyAndCapturePayment(input: VerifyInput) {
  const secret = getRazorpayKeySecret();
  if (!secret) {
    throw new PaymentError("Razorpay is not configured", 503);
  }

  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      session: true,
      decision: { include: { primaryProduct: true } },
      lineItems: {
        include: { product: true },
      },
    },
  });

  if (!order) {
    throw new PaymentError("Order not found", 404);
  }

  if (!order.razorpayOrderId || order.razorpayOrderId !== input.razorpayOrderId) {
    throw new PaymentError("Razorpay order mismatch", 400);
  }

  const payment = order.payments[0];
  if (!payment) {
    throw new PaymentError("Payment record not found", 404);
  }

  if (payment.status === "CAPTURED" && payment.razorpaySignatureVerified) {
    return buildVerifyCaptureResponse(order, payment, true);
  }

  await recordAuditEvent(order.sessionId, "PAYMENT_VERIFICATION_ATTEMPTED", "system", {
    orderId: order.id,
    paymentId: payment.id,
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
  });

  const valid = verifyPaymentSignature(
    input.razorpayOrderId,
    input.razorpayPaymentId,
    input.razorpaySignature,
    secret,
  );

  if (!valid) {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        razorpayPaymentId: input.razorpayPaymentId,
        razorpaySignatureVerified: false,
        failureReason: "Signature verification failed",
      },
    });
    await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    await db.buyerSession.update({ where: { id: order.sessionId }, data: { status: "PAYMENT_FAILED" } });

    await recordAuditEvent(order.sessionId, "PAYMENT_VERIFICATION_FAILED", "system", {
      orderId: order.id,
      paymentId: payment.id,
      razorpayPaymentId: input.razorpayPaymentId,
    });

    throw new PaymentError("Payment signature verification failed", 400);
  }

  const capturedAt = new Date();
  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: "CAPTURED",
      razorpayPaymentId: input.razorpayPaymentId,
      razorpaySignatureVerified: true,
      capturedAt,
      failureReason: null,
    },
  });
  await db.order.update({ where: { id: order.id }, data: { status: "PAID" } });
  await db.buyerSession.update({ where: { id: order.sessionId }, data: { status: "PAYMENT_CAPTURED" } });

  await recordAuditEvent(order.sessionId, "PAYMENT_VERIFIED", "system", {
    orderId: order.id,
    paymentId: payment.id,
    razorpayPaymentId: input.razorpayPaymentId,
  });
  await recordAuditEvent(order.sessionId, "PAYMENT_CAPTURED", "system", {
    orderId: order.id,
    paymentId: payment.id,
    amountPaise: order.amountPaise,
    razorpayPaymentId: input.razorpayPaymentId,
  });

  const priorFailed = await countPriorFailedAttempts(order.sessionId, order.decisionId);
  if (priorFailed > 0 || order.attemptNumber > 1) {
    await recordAuditEvent(order.sessionId, "RECOVERY_SUCCEEDED", "system", {
      orderId: order.id,
      paymentId: payment.id,
      decisionId: order.decisionId,
      attemptNumber: order.attemptNumber,
      amountPaise: order.amountPaise,
    });
  }

  return buildVerifyCaptureResponse(
    order,
    {
      id: payment.id,
      razorpayPaymentId: input.razorpayPaymentId,
      capturedAt,
    },
    false,
  );
}

function buildVerifyCaptureResponse(
  order: {
    id: string;
    amountPaise: number;
    lineItems: Array<{ product: { name: string } }>;
    decision: { primaryProduct: { name: string } | null } | null;
  },
  payment: {
    id: string;
    razorpayPaymentId: string | null;
    capturedAt: Date | null;
  },
  alreadyCaptured: boolean,
) {
  const productNames =
    order.lineItems.length > 0
      ? order.lineItems.map((line) => line.product.name)
      : order.decision?.primaryProduct
        ? [order.decision.primaryProduct.name]
        : [];

  if (productNames.length === 0 || !payment.razorpayPaymentId || !payment.capturedAt) {
    throw new PaymentError("Captured payment details are incomplete", 500);
  }

  return {
    orderId: order.id,
    paymentId: payment.id,
    status: "CAPTURED" as const,
    alreadyCaptured,
    capturedPayment: buildCapturedPaymentView({
      orderId: order.id,
      paymentId: payment.id,
      razorpayPaymentId: payment.razorpayPaymentId,
      amountPaise: order.amountPaise,
      capturedAt: payment.capturedAt.toISOString(),
      productNames,
    }),
  };
}

export async function recordPaymentFailure(orderId: string, reason: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!order) {
    throw new PaymentError("Order not found", 404);
  }

  const payment = order.payments[0];
  if (!payment) {
    throw new PaymentError("Payment record not found", 404);
  }

  if (payment.status === "CAPTURED") {
    throw new PaymentError("Payment is already captured", 409);
  }

  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: "FAILED",
      failureReason: reason,
      razorpaySignatureVerified: false,
    },
  });
  await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
  await db.buyerSession.update({ where: { id: order.sessionId }, data: { status: "PAYMENT_FAILED" } });

  await recordAuditEvent(order.sessionId, "PAYMENT_FAILED", "system", {
    orderId: order.id,
    paymentId: payment.id,
    reason,
  });

  if (order.attemptNumber > 1) {
    await recordAuditEvent(order.sessionId, "RECOVERY_FAILED", "system", {
      orderId: order.id,
      paymentId: payment.id,
      decisionId: order.decisionId,
      attemptNumber: order.attemptNumber,
      reason,
    });
  }

  return { orderId: order.id, paymentId: payment.id, status: "FAILED" as const };
}

export async function abandonCheckout(orderId: string, reason = "Checkout closed before payment completed.") {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      decision: true,
    },
  });

  if (!order) {
    throw new PaymentError("Order not found", 404);
  }

  const payment = order.payments[0];
  if (!payment) {
    throw new PaymentError("Payment record not found", 404);
  }

  if (payment.status === "CAPTURED") {
    throw new PaymentError("Payment is already captured", 409);
  }

  if (order.status === "CANCELLED" && payment.status === "CANCELLED") {
    return { orderId: order.id, paymentId: payment.id, status: "CANCELLED" as const, alreadyAbandoned: true };
  }

  if (payment.status === "FAILED") {
    throw new PaymentError("Checkout already ended with a payment failure", 409);
  }

  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: "CANCELLED",
      failureReason: null,
      razorpaySignatureVerified: false,
    },
  });
  await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });

  const sessionStatus =
    order.decision.status === "READY"
      ? "DECISION_MADE"
      : order.decision.status === "BLOCKED"
        ? "BLOCKED"
        : "EMPTY";

  await db.buyerSession.update({
    where: { id: order.sessionId },
    data: { status: sessionStatus },
  });

  await recordAuditEvent(order.sessionId, "CHECKOUT_ABANDONED", "buyer", {
    orderId: order.id,
    paymentId: payment.id,
    decisionId: order.decisionId,
    reason,
  });

  return { orderId: order.id, paymentId: payment.id, status: "CANCELLED" as const, alreadyAbandoned: false };
}

export async function abandonPendingCheckoutForSession(sessionId: string, reason: string) {
  const pendingOrder = await db.order.findFirst({
    where: {
      sessionId,
      status: "CREATED",
      payments: { some: { status: "PENDING" } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!pendingOrder) return null;
  return abandonCheckout(pendingOrder.id, reason);
}

type RazorpayWebhookPayload = {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        status?: string;
        error_description?: string;
      };
    };
  };
};

export async function handleRazorpayWebhook(rawBody: string, signature: string | null, webhookSecret: string) {
  if (!signature || !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    throw new PaymentError("Invalid webhook signature", 401);
  }

  const payload = JSON.parse(rawBody) as RazorpayWebhookPayload & { id?: string };
  const eventId = payload.id ?? `${payload.event}:${payload.payload?.payment?.entity?.id ?? rawBody.slice(0, 32)}`;

  const existing = await db.processedWebhook.findUnique({ where: { eventId } });
  if (existing) {
    return { processed: false, reason: "duplicate" as const };
  }

  const paymentEntity = payload.payload?.payment?.entity;
  if (!paymentEntity?.id || !paymentEntity.order_id) {
    return { processed: false, reason: "no_payment_entity" as const };
  }

  const order = await db.order.findUnique({
    where: { razorpayOrderId: paymentEntity.order_id },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!order) {
    return { processed: false, reason: "order_not_found" as const };
  }

  if (payload.event === "payment.captured") {
    const razorpayPaymentId = paymentEntity.id;
    const razorpayOrderId = paymentEntity.order_id;

    await db.$transaction(async (tx) => {
      const duplicate = await tx.processedWebhook.findUnique({ where: { eventId } });
      if (duplicate) return;

      await capturePaymentFromWebhook(order, razorpayPaymentId, tx);
      await tx.processedWebhook.create({
        data: {
          eventId,
          eventType: payload.event ?? "unknown",
        },
      });
    });

    const recorded = await db.processedWebhook.findUnique({ where: { eventId } });
    if (!recorded) {
      return { processed: false, reason: "duplicate" as const };
    }

    await recordAuditEvent(order.sessionId, "WEBHOOK_RECEIVED", "razorpay", {
      event: payload.event,
      eventId,
      razorpayPaymentId: paymentEntity.id,
      razorpayOrderId: paymentEntity.order_id,
    });

    return { processed: true, event: payload.event };
  }

  if (payload.event === "payment.failed") {
    const razorpayPaymentId = paymentEntity.id;

    await db.$transaction(async (tx) => {
      const duplicate = await tx.processedWebhook.findUnique({ where: { eventId } });
      if (duplicate) return;

      await failPaymentFromWebhook(
        order,
        razorpayPaymentId,
        paymentEntity.error_description ?? "Payment failed",
        tx,
      );
      await tx.processedWebhook.create({
        data: {
          eventId,
          eventType: payload.event ?? "unknown",
        },
      });
    });

    const recorded = await db.processedWebhook.findUnique({ where: { eventId } });
    if (!recorded) {
      return { processed: false, reason: "duplicate" as const };
    }

    await recordAuditEvent(order.sessionId, "WEBHOOK_RECEIVED", "razorpay", {
      event: payload.event,
      eventId,
      razorpayPaymentId: paymentEntity.id,
      razorpayOrderId: paymentEntity.order_id,
    });

    return { processed: true, event: payload.event };
  }

  return { processed: false, reason: "unsupported_event" as const };
}

type PaymentTx = Pick<typeof db, "payment" | "order" | "buyerSession">;

async function capturePaymentFromWebhook(
  order: {
    id: string;
    sessionId: string;
    decisionId: string;
    amountPaise: number;
    attemptNumber: number;
    payments: Array<{ id: string; status: PaymentStatus; razorpayPaymentId: string | null }>;
  },
  razorpayPaymentId: string,
  tx: PaymentTx = db,
) {
  const existingCaptured = await tx.payment.findFirst({
    where: { razorpayPaymentId, status: "CAPTURED" },
  });
  if (existingCaptured) return;

  const payment = order.payments[0];
  if (!payment) return;

  if (payment.status === "CAPTURED" && payment.razorpayPaymentId === razorpayPaymentId) return;

  const capturedAt = new Date();
  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: "CAPTURED",
      razorpayPaymentId,
      razorpaySignatureVerified: true,
      capturedAt,
      failureReason: null,
    },
  });
  await tx.order.update({ where: { id: order.id }, data: { status: "PAID" } });
  await tx.buyerSession.update({ where: { id: order.sessionId }, data: { status: "PAYMENT_CAPTURED" } });

  await recordAuditEvent(order.sessionId, "PAYMENT_CAPTURED", "webhook", {
    orderId: order.id,
    paymentId: payment.id,
    razorpayPaymentId,
    amountPaise: order.amountPaise,
  });

  const priorFailed = await countPriorFailedAttempts(order.sessionId, order.decisionId);
  if (priorFailed > 0 || order.attemptNumber > 1) {
    await recordAuditEvent(order.sessionId, "RECOVERY_SUCCEEDED", "webhook", {
      orderId: order.id,
      paymentId: payment.id,
      decisionId: order.decisionId,
      attemptNumber: order.attemptNumber,
      amountPaise: order.amountPaise,
    });
  }
}

async function failPaymentFromWebhook(
  order: {
    id: string;
    sessionId: string;
    decisionId: string;
    attemptNumber: number;
    payments: Array<{ id: string; status: PaymentStatus }>;
  },
  razorpayPaymentId: string,
  reason: string,
  tx: PaymentTx = db,
) {
  const payment = order.payments[0];
  if (!payment || payment.status === "CAPTURED") return;

  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: "FAILED",
      razorpayPaymentId,
      razorpaySignatureVerified: false,
      failureReason: reason,
    },
  });
  await tx.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
  await tx.buyerSession.update({ where: { id: order.sessionId }, data: { status: "PAYMENT_FAILED" } });

  await recordAuditEvent(order.sessionId, "PAYMENT_FAILED", "webhook", {
    orderId: order.id,
    paymentId: payment.id,
    razorpayPaymentId,
    reason,
  });

  if (order.attemptNumber > 1) {
    await recordAuditEvent(order.sessionId, "RECOVERY_FAILED", "webhook", {
      orderId: order.id,
      paymentId: payment.id,
      decisionId: order.decisionId,
      attemptNumber: order.attemptNumber,
      reason,
    });
  }
}

export async function getVerifiedGmvPaise() {
  const ledger = await getLedgerData();
  return Math.round(ledger.weekGmv * 100);
}

export type PaymentAuditMetadata = Prisma.InputJsonValue;
