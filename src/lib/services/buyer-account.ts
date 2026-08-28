import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Prisma, type BuyerAccount } from "@prisma/client";
import { getSessionSecret } from "@/lib/auth/secret";
import {
  resolveAccountCapability,
  type BuyerCapability,
} from "@/lib/auth/capability";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/auth/password";
import { sendPasswordResetEmail, sendVerificationCodeEmail } from "@/lib/email/provider";
import { db } from "@/lib/db";
import {
  getIdentityForSession,
  normalizeEmail,
  type BuyerIdentityView,
} from "@/lib/services/buyer-identity";

const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const ACCOUNT_AUTH_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashToken(rawToken: string): string {
  return createHash("sha256")
    .update(`${rawToken}:${getSessionSecret()}`)
    .digest("hex");
}

function hashVerificationCode(code: string): string {
  return createHash("sha256")
    .update(`${code}:${getSessionSecret()}`)
    .digest("hex");
}

function verifyCodeHash(code: string, codeHash: string): boolean {
  const computed = hashVerificationCode(code.trim());
  if (computed.length !== codeHash.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(codeHash));
}

function generateVerificationCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export type AccountView = {
  id: string;
  merchantId: string;
  email: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  capability: BuyerCapability;
};

function toAccountView(account: BuyerAccount, capability: BuyerCapability): AccountView {
  return {
    id: account.id,
    merchantId: account.merchantId,
    email: account.email,
    emailVerified: account.emailVerifiedAt != null,
    emailVerifiedAt: account.emailVerifiedAt?.toISOString() ?? null,
    capability,
  };
}

async function syncIdentityAfterVerification(account: BuyerAccount, verifiedAt: Date): Promise<void> {
  const capability = await resolveAccountCapability(account.merchantId, account);
  const portalAccess = capability === "staff" || capability === "admin";
  await db.buyerIdentity.updateMany({
    where: { accountId: account.id },
    data: {
      emailVerifiedAt: verifiedAt,
      isStaff: portalAccess,
    },
  });
}

async function invalidateVerificationCodes(accountId: string): Promise<void> {
  await db.accountVerificationCode.updateMany({
    where: { accountId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}

async function createAndSendVerificationCode(account: BuyerAccount): Promise<void> {
  if (account.emailVerifiedAt) {
    return;
  }

  const latestSent = await db.accountVerificationCode.findFirst({
    where: { accountId: account.id },
    orderBy: { createdAt: "desc" },
  });
  if (
    latestSent &&
    Date.now() - latestSent.createdAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS
  ) {
    throw new AccountError(
      "Please wait before requesting another code.",
      429,
      "RESEND_COOLDOWN",
    );
  }

  await invalidateVerificationCodes(account.id);

  const code = generateVerificationCode();
  await db.accountVerificationCode.create({
    data: {
      accountId: account.id,
      codeHash: hashVerificationCode(code),
      expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
    },
  });

  await sendVerificationCodeEmail(account.email, code);
}

async function invalidateAccountTokens(accountId: string, purpose: "PASSWORD_RESET") {
  await db.accountToken.updateMany({
    where: { accountId, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}

async function createAccountToken(accountId: string, purpose: "PASSWORD_RESET") {
  await invalidateAccountTokens(accountId, purpose);
  const rawToken = generateRawToken();
  await db.accountToken.create({
    data: {
      accountId,
      purpose,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    },
  });
  return rawToken;
}

export async function linkAccountToBuyerSession(
  account: BuyerAccount,
  sessionId: string,
  merchantId: string,
): Promise<BuyerIdentityView> {
  const session = await db.buyerSession.findUnique({
    where: { id: sessionId },
    select: { merchantId: true },
  });
  if (!session || session.merchantId !== merchantId) {
    throw new AccountError("Session not found for this merchant", 404, "SESSION_NOT_FOUND");
  }

  const capability = await resolveAccountCapability(merchantId, account);
  const portalAccess = capability === "staff" || capability === "admin";

  await db.buyerIdentity.upsert({
    where: { sessionId },
    update: {
      accountId: account.id,
      email: account.email,
      emailVerifiedAt: account.emailVerifiedAt,
      isStaff: portalAccess,
    },
    create: {
      sessionId,
      merchantId,
      accountId: account.id,
      email: account.email,
      emailVerifiedAt: account.emailVerifiedAt,
      isStaff: portalAccess,
    },
  });

  const view = await getIdentityForSession(sessionId);
  if (!view) {
    throw new AccountError("Identity could not be loaded", 500);
  }
  return view;
}

/** Returns sessionId only when the buyer session exists for this merchant. */
export async function resolveValidBuyerSessionId(
  merchantId: string,
  sessionId: string | null | undefined,
): Promise<string | undefined> {
  const trimmed = sessionId?.trim();
  if (!trimmed) return undefined;

  const session = await db.buyerSession.findUnique({
    where: { id: trimmed },
    select: { merchantId: true },
  });
  if (!session || session.merchantId !== merchantId) return undefined;
  return trimmed;
}

export async function createAccountAuthSession(accountId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + ACCOUNT_AUTH_TTL_MS);
  const row = await db.accountAuthSession.create({
    data: { accountId, expiresAt },
  });
  return row.id;
}

export async function resolveAccountAuthSession(authSessionId: string): Promise<BuyerAccount | null> {
  const row = await db.accountAuthSession.findUnique({
    where: { id: authSessionId },
    include: { account: true },
  });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) {
      await db.accountAuthSession.delete({ where: { id: authSessionId } }).catch(() => undefined);
    }
    return null;
  }
  return row.account;
}

export async function revokeAccountAuthSession(authSessionId: string): Promise<void> {
  await db.accountAuthSession.deleteMany({ where: { id: authSessionId } });
}

export async function registerAccount(input: {
  merchantId: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  buyerSessionId?: string | null;
}): Promise<{ account: AccountView }> {
  const emailNormalized = normalizeEmail(input.email);
  if (!isValidEmail(emailNormalized)) {
    throw new AccountError("Enter a valid email address", 400, "INVALID_EMAIL");
  }
  if (input.password !== input.passwordConfirmation) {
    throw new AccountError("Passwords do not match", 400, "PASSWORD_MISMATCH");
  }

  try {
    validatePasswordStrength(input.password);
  } catch (cause) {
    throw new AccountError(
      cause instanceof Error ? cause.message : "Invalid password",
      400,
      "INVALID_PASSWORD",
    );
  }

  const existing = await db.buyerAccount.findUnique({
    where: {
      merchantId_emailNormalized: {
        merchantId: input.merchantId,
        emailNormalized,
      },
    },
  });
  if (existing) {
    if (existing.emailVerifiedAt) {
      throw new AccountError(
        "An account already exists for this email. Log in instead.",
        409,
        "REGISTRATION_FAILED",
      );
    }
    throw new AccountError(
      "Unable to create account. Check your details or sign in.",
      409,
      "REGISTRATION_FAILED",
    );
  }

  const passwordHash = await hashPassword(input.password);
  let account: BuyerAccount;
  try {
    account = await db.buyerAccount.create({
      data: {
        merchantId: input.merchantId,
        email: emailNormalized,
        emailNormalized,
        passwordHash,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AccountError(
        "Unable to create account. Check your details or sign in.",
        409,
        "REGISTRATION_FAILED",
      );
    }
    throw error;
  }

  try {
    await createAndSendVerificationCode(account);

    if (input.buyerSessionId) {
      await linkAccountToBuyerSession(account, input.buyerSessionId, input.merchantId);
    }
  } catch (error) {
    await db.buyerAccount.delete({ where: { id: account.id } }).catch(() => undefined);
    throw error;
  }

  return { account: toAccountView(account, "anonymous") };
}

export async function loginAccount(input: {
  merchantId: string;
  email: string;
  password: string;
  buyerSessionId?: string | null;
}): Promise<{ account: AccountView; identity: BuyerIdentityView | null }> {
  const emailNormalized = normalizeEmail(input.email);
  const account = await db.buyerAccount.findUnique({
    where: {
      merchantId_emailNormalized: {
        merchantId: input.merchantId,
        emailNormalized,
      },
    },
  });

  const invalid = !account || !(await verifyPassword(input.password, account.passwordHash));
  if (invalid) {
    throw new AccountError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  const capability = await resolveAccountCapability(input.merchantId, account);
  let identity: BuyerIdentityView | null = null;

  if (input.buyerSessionId) {
    identity = await linkAccountToBuyerSession(account, input.buyerSessionId, input.merchantId);
  }

  return {
    account: toAccountView(account, capability),
    identity,
  };
}

export async function verifyEmailWithCode(accountId: string, rawCode: string): Promise<AccountView> {
  const existingAccount = await db.buyerAccount.findUnique({ where: { id: accountId } });
  if (!existingAccount) {
    throw new AccountError("Account not found", 404);
  }
  if (existingAccount.emailVerifiedAt) {
    const capability = await resolveAccountCapability(existingAccount.merchantId, existingAccount);
    return toAccountView(existingAccount, capability);
  }

  const code = rawCode.trim();
  if (!/^\d{6}$/.test(code)) {
    throw new AccountError("Enter the 6-digit verification code", 400, "INVALID_CODE");
  }

  const row = await db.accountVerificationCode.findFirst({
    where: { accountId, consumedAt: null },
    orderBy: { createdAt: "desc" },
    include: { account: true },
  });

  if (!row) {
    throw new AccountError("Request a verification code first", 400, "NO_CODE");
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new AccountError("Verification code expired. Request a new one.", 400, "CODE_EXPIRED");
  }
  if (!verifyCodeHash(code, row.codeHash)) {
    throw new AccountError("Verification code is incorrect", 400, "CODE_INVALID");
  }

  const verifiedAt = new Date();
  await db.$transaction([
    db.accountVerificationCode.update({
      where: { id: row.id },
      data: { consumedAt: verifiedAt },
    }),
    db.buyerAccount.update({
      where: { id: row.accountId },
      data: { emailVerifiedAt: verifiedAt },
    }),
  ]);

  const account = await db.buyerAccount.findUniqueOrThrow({ where: { id: row.accountId } });
  await syncIdentityAfterVerification(account, verifiedAt);

  const capability = await resolveAccountCapability(account.merchantId, account);
  return toAccountView(account, capability);
}

export async function resendVerificationCode(accountId: string): Promise<{ sent: boolean }> {
  const account = await db.buyerAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    throw new AccountError("Account not found", 404);
  }
  if (account.emailVerifiedAt) {
    return { sent: false };
  }

  await createAndSendVerificationCode(account);
  return { sent: true };
}

export async function changeAccountEmail(input: {
  accountId: string;
  newEmail: string;
}): Promise<AccountView> {
  const emailNormalized = normalizeEmail(input.newEmail);
  if (!isValidEmail(emailNormalized)) {
    throw new AccountError("Enter a valid email address", 400, "INVALID_EMAIL");
  }

  const account = await db.buyerAccount.findUnique({ where: { id: input.accountId } });
  if (!account) {
    throw new AccountError("Account not found", 404);
  }

  if (emailNormalized === account.emailNormalized) {
    throw new AccountError("Enter a different email address", 400, "SAME_EMAIL");
  }

  const taken = await db.buyerAccount.findUnique({
    where: {
      merchantId_emailNormalized: {
        merchantId: account.merchantId,
        emailNormalized,
      },
    },
  });
  if (taken) {
    throw new AccountError("Unable to update email. Try another address.", 409, "EMAIL_UNAVAILABLE");
  }

  const updated = await db.buyerAccount.update({
    where: { id: account.id },
    data: {
      email: emailNormalized,
      emailNormalized,
      emailVerifiedAt: null,
    },
  });

  await invalidateVerificationCodes(account.id);
  await db.buyerIdentity.updateMany({
    where: { accountId: account.id },
    data: {
      email: emailNormalized,
      emailVerifiedAt: null,
      isStaff: false,
    },
  });

  await createAndSendVerificationCode(updated);

  return toAccountView(updated, "anonymous");
}

export async function requestPasswordReset(input: {
  merchantId: string;
  email: string;
}): Promise<void> {
  const emailNormalized = normalizeEmail(input.email);
  const account = await db.buyerAccount.findUnique({
    where: {
      merchantId_emailNormalized: {
        merchantId: input.merchantId,
        emailNormalized,
      },
    },
  });

  if (!account) return;

  const rawToken = await createAccountToken(account.id, "PASSWORD_RESET");
  await sendPasswordResetEmail(account.email, rawToken);
}

export async function resetPasswordWithToken(input: {
  token: string;
  password: string;
  passwordConfirmation: string;
}): Promise<void> {
  if (input.password !== input.passwordConfirmation) {
    throw new AccountError("Passwords do not match", 400, "PASSWORD_MISMATCH");
  }

  try {
    validatePasswordStrength(input.password);
  } catch (cause) {
    throw new AccountError(
      cause instanceof Error ? cause.message : "Invalid password",
      400,
      "INVALID_PASSWORD",
    );
  }

  const tokenHash = hashToken(input.token.trim());
  const row = await db.accountToken.findFirst({
    where: {
      tokenHash,
      purpose: "PASSWORD_RESET",
      consumedAt: null,
    },
    include: { account: true },
  });

  if (!row) {
    throw new AccountError("Reset link is invalid or has already been used", 400, "INVALID_TOKEN");
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new AccountError("Reset link has expired", 400, "TOKEN_EXPIRED");
  }

  const passwordHash = await hashPassword(input.password);
  const consumedAt = new Date();

  await db.$transaction([
    db.accountToken.update({
      where: { id: row.id },
      data: { consumedAt },
    }),
    db.buyerAccount.update({
      where: { id: row.accountId },
      data: { passwordHash },
    }),
    db.accountAuthSession.deleteMany({ where: { accountId: row.accountId } }),
  ]);
}

export async function getAccountView(accountId: string): Promise<AccountView | null> {
  const account = await db.buyerAccount.findUnique({ where: { id: accountId } });
  if (!account) return null;
  const capability = await resolveAccountCapability(account.merchantId, account);
  return toAccountView(account, capability);
}

export async function deleteTestAccountsForMerchant(merchantId: string): Promise<void> {
  const testAccounts = await db.buyerAccount.findMany({
    where: {
      merchantId,
      OR: [
        { emailNormalized: { endsWith: "@example.com" } },
        { emailNormalized: { endsWith: "@northlineaudio.com" } },
      ],
    },
    select: { id: true },
  });
  const accountIds = testAccounts.map((row) => row.id);
  if (accountIds.length === 0) return;

  await db.accountVerificationCode.deleteMany({ where: { accountId: { in: accountIds } } });
  await db.accountToken.deleteMany({ where: { accountId: { in: accountIds } } });
  await db.accountAuthSession.deleteMany({ where: { accountId: { in: accountIds } } });
  await db.buyerAccount.deleteMany({ where: { id: { in: accountIds } } });
}

/** @deprecated Link-based verification removed in Phase 12. Use verifyEmailWithCode. */
export async function verifyEmailWithToken(rawToken: string): Promise<AccountView> {
  void rawToken;
  throw new AccountError("Use the verification code from your email", 410, "DEPRECATED");
}

export { resolveAccountCapability };
