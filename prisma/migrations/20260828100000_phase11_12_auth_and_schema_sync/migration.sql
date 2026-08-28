-- Phase 11/12: buyer accounts, staff emails, and remaining schema sync

-- Enum extensions missing from prior migrations
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'CHECKOUT_ABANDONED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'RECOVERY_EVALUATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'RECOVERY_ALLOWED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'RECOVERY_BLOCKED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'RECOVERY_ATTEMPTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'RECOVERY_SUCCEEDED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'RECOVERY_FAILED';

-- Order retry counter
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "attemptNumber" INTEGER NOT NULL DEFAULT 1;

-- Account token purpose
DO $$ BEGIN
    CREATE TYPE "AccountTokenPurpose" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Buyer accounts and identity
CREATE TABLE IF NOT EXISTS "BuyerAccount" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BuyerIdentity" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "accountId" TEXT,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AccountVerificationCode" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountVerificationCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AccountAuthSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountAuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AccountToken" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "purpose" "AccountTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailVerificationChallenge" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MerchantStaffEmail" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantStaffEmail_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "BuyerIdentity_sessionId_key" ON "BuyerIdentity"("sessionId");
CREATE INDEX IF NOT EXISTS "BuyerIdentity_merchantId_email_idx" ON "BuyerIdentity"("merchantId", "email");
CREATE INDEX IF NOT EXISTS "BuyerIdentity_accountId_idx" ON "BuyerIdentity"("accountId");

CREATE UNIQUE INDEX IF NOT EXISTS "BuyerAccount_merchantId_emailNormalized_key" ON "BuyerAccount"("merchantId", "emailNormalized");
CREATE INDEX IF NOT EXISTS "BuyerAccount_merchantId_idx" ON "BuyerAccount"("merchantId");

CREATE INDEX IF NOT EXISTS "AccountVerificationCode_accountId_idx" ON "AccountVerificationCode"("accountId");
CREATE INDEX IF NOT EXISTS "AccountVerificationCode_expiresAt_idx" ON "AccountVerificationCode"("expiresAt");

CREATE INDEX IF NOT EXISTS "AccountAuthSession_accountId_idx" ON "AccountAuthSession"("accountId");
CREATE INDEX IF NOT EXISTS "AccountAuthSession_expiresAt_idx" ON "AccountAuthSession"("expiresAt");

CREATE INDEX IF NOT EXISTS "AccountToken_accountId_purpose_idx" ON "AccountToken"("accountId", "purpose");
CREATE INDEX IF NOT EXISTS "AccountToken_expiresAt_idx" ON "AccountToken"("expiresAt");

CREATE INDEX IF NOT EXISTS "EmailVerificationChallenge_identityId_idx" ON "EmailVerificationChallenge"("identityId");
CREATE INDEX IF NOT EXISTS "EmailVerificationChallenge_expiresAt_idx" ON "EmailVerificationChallenge"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "MerchantStaffEmail_merchantId_email_key" ON "MerchantStaffEmail"("merchantId", "email");
CREATE INDEX IF NOT EXISTS "MerchantStaffEmail_merchantId_idx" ON "MerchantStaffEmail"("merchantId");

-- Foreign keys (guarded for db-push environments)
DO $$ BEGIN
    ALTER TABLE "BuyerAccount" ADD CONSTRAINT "BuyerAccount_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "BuyerIdentity" ADD CONSTRAINT "BuyerIdentity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BuyerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "BuyerIdentity" ADD CONSTRAINT "BuyerIdentity_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "BuyerIdentity" ADD CONSTRAINT "BuyerIdentity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BuyerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "AccountVerificationCode" ADD CONSTRAINT "AccountVerificationCode_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BuyerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "AccountAuthSession" ADD CONSTRAINT "AccountAuthSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BuyerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BuyerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "EmailVerificationChallenge" ADD CONSTRAINT "EmailVerificationChallenge_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "BuyerIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "MerchantStaffEmail" ADD CONSTRAINT "MerchantStaffEmail_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
