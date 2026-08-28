import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "@/lib/auth/secret";

const BUYER_SCOPE = "buyer";
const MERCHANT_SCOPE = "merchant";
const ACCOUNT_SCOPE = "account";

function signScopedToken(scope: string, subject: string): string {
  const payload = `${scope}:${subject}`;
  const signature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  const encodedSubject = Buffer.from(subject, "utf8").toString("base64url");
  return `${encodedSubject}.${signature}`;
}

function verifyScopedToken(token: string, scope: string, subject: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [encodedSubject, signature] = parts;
  let decodedSubject: string;
  try {
    decodedSubject = Buffer.from(encodedSubject, "base64url").toString("utf8");
  } catch {
    return false;
  }

  if (decodedSubject !== subject) return false;

  const payload = `${scope}:${subject}`;
  const expected = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");

  try {
    const left = Buffer.from(signature, "base64url");
    const right = Buffer.from(expected, "base64url");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function signBuyerSessionToken(sessionId: string): string {
  return signScopedToken(BUYER_SCOPE, sessionId);
}

export function verifyBuyerSessionToken(token: string, sessionId: string): boolean {
  return verifyScopedToken(token, BUYER_SCOPE, sessionId);
}

export function verifyBuyerSessionTokenAny(token: string): string | null {
  const sessionId = readTokenSubject(token);
  if (!sessionId || !verifyBuyerSessionToken(token, sessionId)) return null;
  return sessionId;
}

export function signMerchantSessionToken(merchantId: string): string {
  return signScopedToken(MERCHANT_SCOPE, merchantId);
}

export function verifyMerchantSessionToken(token: string, merchantId: string): boolean {
  return verifyScopedToken(token, MERCHANT_SCOPE, merchantId);
}

/** Reads the signed subject from a token without verifying the signature. */
export function readTokenSubject(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    return Buffer.from(parts[0], "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function verifyMerchantSessionTokenAny(token: string): string | null {
  const merchantId = readTokenSubject(token);
  if (!merchantId || !verifyMerchantSessionToken(token, merchantId)) return null;
  return merchantId;
}

export function signAccountSessionToken(authSessionId: string): string {
  return signScopedToken(ACCOUNT_SCOPE, authSessionId);
}

export function verifyAccountSessionToken(token: string, authSessionId: string): boolean {
  return verifyScopedToken(token, ACCOUNT_SCOPE, authSessionId);
}

export function verifyAccountSessionTokenAny(token: string): string | null {
  const authSessionId = readTokenSubject(token);
  if (!authSessionId || !verifyAccountSessionToken(token, authSessionId)) return null;
  return authSessionId;
}
