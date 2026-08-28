-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'ORDER_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE 'CHECKOUT_STARTED';
ALTER TYPE "AuditEventType" ADD VALUE 'PAYMENT_VERIFICATION_ATTEMPTED';
ALTER TYPE "AuditEventType" ADD VALUE 'PAYMENT_VERIFIED';
ALTER TYPE "AuditEventType" ADD VALUE 'PAYMENT_CAPTURED';
ALTER TYPE "AuditEventType" ADD VALUE 'PAYMENT_FAILED';
ALTER TYPE "AuditEventType" ADD VALUE 'PAYMENT_VERIFICATION_FAILED';
ALTER TYPE "AuditEventType" ADD VALUE 'WEBHOOK_RECEIVED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "decisionId" TEXT;

-- Backfill not required for empty demo database; new orders always set decisionId.
-- For existing rows without decisions, delete or assign manually before enforcing NOT NULL.

-- CreateTable
CREATE TABLE "ProcessedWebhook" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedWebhook_eventId_key" ON "ProcessedWebhook"("eventId");
CREATE UNIQUE INDEX "Order_razorpayOrderId_key" ON "Order"("razorpayOrderId");
CREATE UNIQUE INDEX "Payment_razorpayPaymentId_key" ON "Payment"("razorpayPaymentId");
CREATE INDEX "Order_decisionId_idx" ON "Order"("decisionId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "AgentDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Make decisionId required after schema sync on fresh installs
ALTER TABLE "Order" ALTER COLUMN "decisionId" SET NOT NULL;
