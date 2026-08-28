-- Phase 4B: merchant-scoped product audit events

ALTER TYPE "AuditEventType" ADD VALUE 'PRODUCT_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE 'PRODUCT_UPDATED';
ALTER TYPE "AuditEventType" ADD VALUE 'PRODUCT_ACTIVATED';
ALTER TYPE "AuditEventType" ADD VALUE 'PRODUCT_DEACTIVATED';
ALTER TYPE "AuditEventType" ADD VALUE 'PRODUCT_INVENTORY_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE 'PRODUCT_PRICE_CHANGED';

ALTER TABLE "AuditEvent" ADD COLUMN "merchantId" TEXT;

ALTER TABLE "AuditEvent" ALTER COLUMN "sessionId" DROP NOT NULL;

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AuditEvent_merchantId_idx" ON "AuditEvent"("merchantId");
