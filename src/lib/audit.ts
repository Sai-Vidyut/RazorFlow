import type { AuditEventType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function recordAuditEvent(
  sessionId: string,
  type: AuditEventType,
  actor: string,
  data: Prisma.InputJsonValue,
) {
  return db.auditEvent.create({
    data: {
      sessionId,
      type,
      actor,
      data,
    },
  });
}

export async function recordMerchantAuditEvent(
  merchantId: string,
  type: AuditEventType,
  actor: string,
  data: Prisma.InputJsonValue,
) {
  return db.auditEvent.create({
    data: {
      merchantId,
      type,
      actor,
      data,
    },
  });
}

export async function recordAuditEvents(
  events: Array<{
    sessionId: string;
    type: AuditEventType;
    actor: string;
    data: Prisma.InputJsonValue;
  }>,
) {
  return db.auditEvent.createMany({ data: events });
}
