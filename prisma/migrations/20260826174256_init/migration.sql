-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('headphones', 'earbuds', 'speaker', 'accessory');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('CREATED', 'INTENT_PARSED', 'DECISION_MADE', 'BLOCKED', 'EMPTY', 'AUTHORIZED', 'PAYMENT_PENDING', 'PAYMENT_CAPTURED', 'PAYMENT_FAILED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CREATED', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('SESSION_CREATED', 'INTENT_PARSED', 'RECOMMENDATION_MADE', 'CROSS_SELL_PROPOSED', 'POLICY_EVALUATED', 'POLICY_BLOCKED', 'POLICY_ALLOWED', 'DECISION_RECORDED');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('READY', 'BLOCKED', 'EMPTY');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "costPaise" INTEGER NOT NULL,
    "inventory" INTEGER NOT NULL DEFAULT 100,
    "attachSku" TEXT,
    "attachRate" DOUBLE PRECISION,
    "tags" TEXT[],
    "image" TEXT NOT NULL,
    "imageAlt" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "discountCeilingPct" INTEGER NOT NULL,
    "marginFloorPct" INTEGER NOT NULL,
    "orderCapPaise" INTEGER NOT NULL,
    "allowEvidenceCrossSell" BOOLEAN NOT NULL DEFAULT true,
    "requireBudgetFit" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerSession" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'CREATED',
    "rawRequest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerIntent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "budgetMaxPaise" INTEGER,
    "category" "ProductCategory",
    "wantsAnc" BOOLEAN NOT NULL DEFAULT false,
    "useCase" TEXT,
    "requestedDiscountPct" INTEGER,
    "rawStructuredData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDecision" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "primaryProductId" TEXT,
    "attachProductId" TEXT,
    "subtotalPaise" INTEGER NOT NULL,
    "marginPct" DOUBLE PRECISION NOT NULL,
    "attachRevenuePaise" INTEGER NOT NULL,
    "recommendationReason" TEXT NOT NULL,
    "policyAllowed" BOOLEAN NOT NULL,
    "policyReason" TEXT,
    "discountPct" INTEGER NOT NULL DEFAULT 0,
    "status" "DecisionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "razorpayOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "razorpayPaymentId" TEXT,
    "razorpaySignatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "AuditEventType" NOT NULL,
    "actor" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_merchantId_idx" ON "Product"("merchantId");

-- CreateIndex
CREATE INDEX "Product_active_idx" ON "Product"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Product_merchantId_sku_key" ON "Product"("merchantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_merchantId_key" ON "Policy"("merchantId");

-- CreateIndex
CREATE INDEX "Policy_merchantId_idx" ON "Policy"("merchantId");

-- CreateIndex
CREATE INDEX "BuyerSession_merchantId_idx" ON "BuyerSession"("merchantId");

-- CreateIndex
CREATE INDEX "BuyerSession_createdAt_idx" ON "BuyerSession"("createdAt");

-- CreateIndex
CREATE INDEX "BuyerSession_status_idx" ON "BuyerSession"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerIntent_sessionId_key" ON "BuyerIntent"("sessionId");

-- CreateIndex
CREATE INDEX "BuyerIntent_sessionId_idx" ON "BuyerIntent"("sessionId");

-- CreateIndex
CREATE INDEX "AgentDecision_sessionId_idx" ON "AgentDecision"("sessionId");

-- CreateIndex
CREATE INDEX "AgentDecision_createdAt_idx" ON "AgentDecision"("createdAt");

-- CreateIndex
CREATE INDEX "AgentDecision_policyAllowed_idx" ON "AgentDecision"("policyAllowed");

-- CreateIndex
CREATE INDEX "Order_sessionId_idx" ON "Order"("sessionId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_sessionId_idx" ON "AuditEvent"("sessionId");

-- CreateIndex
CREATE INDEX "AuditEvent_type_idx" ON "AuditEvent"("type");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerSession" ADD CONSTRAINT "BuyerSession_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerIntent" ADD CONSTRAINT "BuyerIntent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BuyerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDecision" ADD CONSTRAINT "AgentDecision_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BuyerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDecision" ADD CONSTRAINT "AgentDecision_primaryProductId_fkey" FOREIGN KEY ("primaryProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDecision" ADD CONSTRAINT "AgentDecision_attachProductId_fkey" FOREIGN KEY ("attachProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BuyerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BuyerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
