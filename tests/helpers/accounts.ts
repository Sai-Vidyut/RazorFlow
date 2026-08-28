import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { signAccountSessionToken } from "@/lib/auth/tokens";
import {
  clearDevOutbox,
  extractVerificationCodeFromEmail,
  findLatestDevEmailTo,
} from "@/lib/email/dev-outbox";
import {
  AccountError,
  createAccountAuthSession,
  loginAccount,
  registerAccount,
  verifyEmailWithCode,
} from "@/lib/services/buyer-account";
import { db } from "@/lib/db";
import { buyerAuthHeaders } from "./auth";

export const TEST_PASSWORD = "NorthlineTest1!";

export function accountAuthHeaders(authSessionId: string): HeadersInit {
  const token = signAccountSessionToken(authSessionId);
  return {
    Cookie: `rf_account_session=${encodeURIComponent(token)}`,
    Authorization: `Bearer ${token}`,
  };
}

export function combinedAuthHeaders(sessionId: string, authSessionId: string): HeadersInit {
  const buyer = buyerAuthHeaders(sessionId) as Record<string, string>;
  const account = accountAuthHeaders(authSessionId) as Record<string, string>;
  return {
    Cookie: `${buyer.Cookie}; ${account.Cookie}`,
    Authorization: account.Authorization,
  };
}

function verificationCodeForEmail(email: string): string {
  const message = findLatestDevEmailTo(email);
  if (!message) {
    throw new Error(`No verification email captured for ${email}`);
  }
  const code = extractVerificationCodeFromEmail(message.html);
  if (!code) {
    throw new Error("Verification code missing from dev email");
  }
  return code;
}

export async function registerAndVerifyAccount(options: {
  email: string;
  password?: string;
  merchantId?: string;
  sessionId?: string;
}) {
  clearDevOutbox();
  const merchantId = options.merchantId ?? getConfiguredDemoMerchantId();
  const password = options.password ?? TEST_PASSWORD;
  const email = options.email.trim().toLowerCase();

  let accountId: string;
  try {
    const { account } = await registerAccount({
      merchantId,
      email,
      password,
      passwordConfirmation: password,
      buyerSessionId: options.sessionId,
    });
    accountId = account.id;
    const code = verificationCodeForEmail(email);
    await verifyEmailWithCode(accountId, code);
  } catch (error) {
    if (!(error instanceof AccountError) || error.status !== 409) {
      throw error;
    }
    const existing = await db.buyerAccount.findUnique({
      where: { merchantId_emailNormalized: { merchantId, emailNormalized: email } },
    });
    if (!existing?.emailVerifiedAt) {
      const code = verificationCodeForEmail(email);
      await verifyEmailWithCode(existing!.id, code);
    }
    accountId = existing!.id;
  }

  const authSessionId = await createAccountAuthSession(accountId);
  const refreshed = options.sessionId
    ? await loginAccount({
        merchantId,
        email,
        password,
        buyerSessionId: options.sessionId,
      })
    : null;

  return {
    accountId,
    authSessionId,
    identity: refreshed?.identity ?? null,
    sessionId: options.sessionId ?? null,
  };
}

export async function loginVerifiedAccount(options: {
  email: string;
  password?: string;
  merchantId?: string;
  sessionId?: string;
}) {
  const merchantId = options.merchantId ?? getConfiguredDemoMerchantId();
  const password = options.password ?? TEST_PASSWORD;
  const { account, identity } = await loginAccount({
    merchantId,
    email: options.email,
    password,
    buyerSessionId: options.sessionId,
  });
  const authSessionId = await createAccountAuthSession(account.id);
  return { account, authSessionId, identity };
}

export { clearDevOutbox, verificationCodeForEmail };
