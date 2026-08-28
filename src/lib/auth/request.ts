import { cookies } from "next/headers";
import { AuthError } from "@/lib/auth/errors";
import { VerificationRequiredError } from "@/lib/auth/identity-errors";
import {
  isAdminCapability,
  isStaffOrAdmin,
} from "@/lib/auth/capability";
import {
  ACCOUNT_SESSION_COOKIE,
  BUYER_SESSION_COOKIE,
  MERCHANT_SESSION_COOKIE,
  parseCookieHeader,
} from "@/lib/auth/cookies";
import {
  readTokenSubject,
  verifyAccountSessionTokenAny,
  verifyBuyerSessionToken,
  verifyBuyerSessionTokenAny,
  verifyMerchantSessionToken,
} from "@/lib/auth/tokens";
import { db } from "@/lib/db";
import {
  getAccountView,
  linkAccountToBuyerSession,
  resolveAccountAuthSession,
  resolveValidBuyerSessionId,
  type AccountView,
} from "@/lib/services/buyer-account";
import { getIdentityForSession, type BuyerIdentityView } from "@/lib/services/buyer-identity";
import { resolveDemoMerchant } from "@/lib/services/merchant";

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

async function readCookieValue(name: string, request: Request): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const fromStore = cookieStore.get(name)?.value;
    if (fromStore) return fromStore;
  } catch {
    // Outside Next.js request scope (direct route handler tests).
  }

  return parseCookieHeader(request.headers.get("cookie"), name) ?? readBearerToken(request);
}

async function readBuyerToken(request: Request): Promise<string | null> {
  return readCookieValue(BUYER_SESSION_COOKIE, request);
}

async function readMerchantToken(request: Request): Promise<string | null> {
  return readCookieValue(MERCHANT_SESSION_COOKIE, request);
}

async function readAccountToken(request: Request): Promise<string | null> {
  return readCookieValue(ACCOUNT_SESSION_COOKIE, request);
}

export async function resolveAccountSessionId(request: Request): Promise<string | null> {
  const token = await readAccountToken(request);
  if (!token) return null;
  return verifyAccountSessionTokenAny(token);
}

export async function resolveAuthenticatedAccount(request: Request): Promise<AccountView | null> {
  const authSessionId = await resolveAccountSessionId(request);
  if (!authSessionId) return null;

  const account = await resolveAccountAuthSession(authSessionId);
  if (!account) return null;

  const merchant = await resolveDemoMerchant();
  if (account.merchantId !== merchant.id) return null;

  return getAccountView(account.id);
}

export async function requireAuthenticatedAccount(request: Request): Promise<AccountView> {
  const account = await resolveAuthenticatedAccount(request);
  if (!account) {
    throw new AuthError("Unauthorized account session", 401, "ACCOUNT_REQUIRED");
  }
  return account;
}

export async function resolveBuyerSessionId(request: Request): Promise<string | null> {
  const token = await readBuyerToken(request);
  if (!token) return null;
  return verifyBuyerSessionTokenAny(token);
}

export async function requireBuyerSession(request: Request, sessionId: string): Promise<void> {
  const token = await readBuyerToken(request);
  if (!token || !verifyBuyerSessionToken(token, sessionId)) {
    throw new AuthError("Unauthorized buyer session", 401);
  }

  const merchant = await resolveDemoMerchant();
  const session = await db.buyerSession.findUnique({
    where: { id: sessionId },
    select: { merchantId: true },
  });
  if (!session || session.merchantId !== merchant.id) {
    throw new AuthError("Session not found for this merchant", 404);
  }
}

export async function requireVerifiedBuyerSession(
  request: Request,
  sessionId: string,
): Promise<BuyerIdentityView> {
  await requireBuyerSession(request, sessionId);

  const account = await resolveAuthenticatedAccount(request);
  if (!account?.emailVerified) {
    throw new VerificationRequiredError();
  }

  let identity = await getIdentityForSession(sessionId);
  if (!identity?.emailVerified) {
    const row = await db.buyerAccount.findUnique({ where: { id: account.id } });
    if (row) {
      identity = await linkAccountToBuyerSession(row, sessionId, account.merchantId);
    }
  }

  if (!identity?.emailVerified) {
    throw new VerificationRequiredError();
  }

  return identity;
}

export type StaffSessionContext = {
  merchantId: string;
  sessionId: string | null;
  email: string;
  identity: BuyerIdentityView;
};

function identityFromAccount(account: AccountView, sessionId: string | null): BuyerIdentityView {
  return {
    sessionId: sessionId ?? "account-only",
    merchantId: account.merchantId,
    email: account.email,
    emailVerified: account.emailVerified,
    emailVerifiedAt: account.emailVerifiedAt,
    capability: account.capability,
  };
}

export async function requireStaffSession(request: Request): Promise<StaffSessionContext> {
  const merchant = await resolveDemoMerchant();
  const account = await resolveAuthenticatedAccount(request);
  if (!account) {
    throw new AuthError("Unauthorized", 401, "ACCOUNT_REQUIRED");
  }
  if (!account.emailVerified) {
    throw new AuthError("Staff access requires a verified email", 403, "STAFF_VERIFICATION_REQUIRED");
  }
  if (!isStaffOrAdmin(account.capability)) {
    throw new AuthError("Staff access required", 403, "STAFF_REQUIRED");
  }
  if (account.merchantId !== merchant.id) {
    throw new AuthError("Staff access required", 403, "STAFF_REQUIRED");
  }

  const rawSessionId = await resolveBuyerSessionId(request);
  const sessionId = await resolveValidBuyerSessionId(merchant.id, rawSessionId);

  if (sessionId) {
    const token = await readBuyerToken(request);
    if (token && verifyBuyerSessionToken(token, sessionId)) {
      let identity = await getIdentityForSession(sessionId);
      if (!identity?.emailVerified || !isStaffOrAdmin(identity.capability)) {
        const row = await db.buyerAccount.findUnique({ where: { id: account.id } });
        if (row) {
          identity = await linkAccountToBuyerSession(row, sessionId, merchant.id);
        }
      }
      if (identity?.emailVerified && isStaffOrAdmin(identity.capability)) {
        return {
          merchantId: merchant.id,
          sessionId,
          email: account.email,
          identity,
        };
      }
    }
  }

  return {
    merchantId: merchant.id,
    sessionId: null,
    email: account.email,
    identity: identityFromAccount(account, sessionId ?? null),
  };
}

export type AdminSessionContext = StaffSessionContext;

export async function requireAdminSession(request: Request): Promise<AdminSessionContext> {
  const context = await requireStaffSession(request);
  const account = await resolveAuthenticatedAccount(request);
  if (!account || !isAdminCapability(account.capability)) {
    throw new AuthError("Administrator access required", 403, "ADMIN_REQUIRED");
  }
  if (!isAdminCapability(context.identity.capability)) {
    throw new AuthError("Administrator access required", 403, "ADMIN_REQUIRED");
  }
  return context;
}

/** @deprecated Prefer requireStaffSession for admin routes. Kept for legacy merchant cookie flows. */
export async function requireMerchantSession(request: Request): Promise<string> {
  const merchant = await resolveDemoMerchant();
  const token = await readMerchantToken(request);
  if (!token || !verifyMerchantSessionToken(token, merchant.id)) {
    throw new AuthError("Unauthorized merchant session", 401);
  }
  return merchant.id;
}

export async function requireOrderBuyerSession(request: Request, orderId: string): Promise<string> {
  const merchant = await resolveDemoMerchant();
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { sessionId: true, session: { select: { merchantId: true } } },
  });

  if (!order) {
    throw new AuthError("Order not found", 404);
  }

  if (order.session.merchantId !== merchant.id) {
    throw new AuthError("Order not found for this merchant", 404);
  }

  await requireBuyerSession(request, order.sessionId);
  return order.sessionId;
}

export async function getSessionAuthState(request: Request): Promise<{
  sessionId: string | null;
  identity: BuyerIdentityView | null;
  account: AccountView | null;
}> {
  const account = await resolveAuthenticatedAccount(request);
  const sessionId = await resolveBuyerSessionId(request);
  if (!sessionId) {
    return { sessionId: null, identity: null, account };
  }

  try {
    await requireBuyerSession(request, sessionId);
  } catch {
    return { sessionId: null, identity: null, account };
  }

  const identity = await getIdentityForSession(sessionId);
  return { sessionId, identity, account };
}
