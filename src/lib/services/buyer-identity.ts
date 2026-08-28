import { createHash, randomInt } from "node:crypto";
import { getSessionSecret } from "@/lib/auth/secret";
import {
  resolveAccountCapability,
  type BuyerCapability,
} from "@/lib/auth/capability";
import { db } from "@/lib/db";

export type { BuyerCapability };

const VERIFICATION_TTL_MS = 15 * 60 * 1000;

export type BuyerIdentityView = {
  sessionId: string;
  merchantId: string;
  email: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  capability: BuyerCapability;
};

export class IdentityError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code?: string,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashVerificationCode(code: string): string {
  return createHash("sha256")
    .update(`${code}:${getSessionSecret()}`)
    .digest("hex");
}

function generateVerificationCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

export function exposeDevVerificationCode(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function isStaffEmail(merchantId: string, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const row = await db.merchantStaffEmail.findUnique({
    where: { merchantId_email: { merchantId, email: normalized } },
  });
  return Boolean(row);
}

export async function getIdentityForSession(sessionId: string): Promise<BuyerIdentityView | null> {
  const identity = await db.buyerIdentity.findUnique({
    where: { sessionId },
    select: {
      sessionId: true,
      merchantId: true,
      email: true,
      emailVerifiedAt: true,
      isStaff: true,
      account: {
        select: {
          emailVerifiedAt: true,
          emailNormalized: true,
        },
      },
    },
  });

  if (!identity) return null;

  const emailVerified =
    identity.emailVerifiedAt != null || identity.account?.emailVerifiedAt != null;

  let capability: BuyerCapability = "anonymous";
  if (emailVerified && identity.account) {
    capability = await resolveAccountCapability(identity.merchantId, {
      emailNormalized: identity.account.emailNormalized,
      emailVerifiedAt: identity.account.emailVerifiedAt,
    });
  } else if (emailVerified) {
    capability = identity.isStaff ? "staff" : "buyer";
  }

  return {
    sessionId: identity.sessionId,
    merchantId: identity.merchantId,
    email: identity.email,
    emailVerified,
    emailVerifiedAt:
      identity.emailVerifiedAt?.toISOString() ??
      identity.account?.emailVerifiedAt?.toISOString() ??
      null,
    capability,
  };
}

/** @deprecated Legacy session OTP flow — API returns 410. */
export async function requestEmailVerification(
  sessionId: string,
  merchantId: string,
  rawEmail: string,
): Promise<{ email: string; devVerificationCode?: string }> {
  void sessionId;
  void merchantId;
  void rawEmail;
  throw new IdentityError("Use account registration verification", 410, "DEPRECATED");
}

/** @deprecated Legacy session OTP flow — API returns 410. */
export async function verifyEmailCode(
  sessionId: string,
  merchantId: string,
  rawCode: string,
): Promise<BuyerIdentityView> {
  void sessionId;
  void merchantId;
  void rawCode;
  throw new IdentityError("Use account verification code", 410, "DEPRECATED");
}
