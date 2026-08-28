import { PrismaClient } from "@prisma/client";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { requestEmailVerification, verifyEmailCode } from "@/lib/services/buyer-identity";

const prisma = new PrismaClient();

export async function verifyIdentityDirectly(options: {
  sessionId: string;
  email: string;
  merchantId?: string;
  staff?: boolean;
}) {
  const merchantId = options.merchantId ?? getConfiguredDemoMerchantId();
  const email = options.email.trim().toLowerCase();

  let isStaff = options.staff ?? false;
  if (options.staff === undefined) {
    const row = await prisma.merchantStaffEmail.findUnique({
      where: { merchantId_email: { merchantId, email } },
    });
    isStaff = Boolean(row);
  }

  return prisma.buyerIdentity.upsert({
    where: { sessionId: options.sessionId },
    update: {
      email,
      emailVerifiedAt: new Date(),
      isStaff,
    },
    create: {
      sessionId: options.sessionId,
      merchantId,
      email,
      emailVerifiedAt: new Date(),
      isStaff,
    },
  });
}

export async function verifyIdentityThroughApi(
  sessionId: string,
  email: string,
  merchantId?: string,
) {
  const merchant = merchantId ?? getConfiguredDemoMerchantId();
  const requested = await requestEmailVerification(sessionId, merchant, email);
  const code = requested.devVerificationCode;
  if (!code) {
    throw new Error("Dev verification code unavailable in this environment");
  }
  return verifyEmailCode(sessionId, merchant, code);
}

export async function seedStaffAllowlist(
  merchantId: string,
  emails: string[],
) {
  for (const email of emails) {
    await prisma.merchantStaffEmail.upsert({
      where: { merchantId_email: { merchantId, email: email.toLowerCase() } },
      update: {},
      create: { merchantId, email: email.toLowerCase() },
    });
  }
}

export { prisma as identityTestPrisma };
