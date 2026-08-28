import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { GET as adminOverviewRoute } from "@/app/api/admin/overview/route";
import { POST as checkoutRoute } from "@/app/api/checkout/route";
import { POST as changeEmailRoute } from "@/app/api/auth/change-email/route";
import { POST as forgotPasswordRoute } from "@/app/api/auth/forgot-password/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { POST as resendVerificationRoute } from "@/app/api/auth/resend-verification/route";
import { POST as resetPasswordRoute } from "@/app/api/auth/reset-password/route";
import { POST as verifyCodeRoute } from "@/app/api/auth/verify-code/route";
import { GET as authSessionRoute } from "@/app/api/auth/session/route";
import {
  clearDevOutbox,
  extractUrlFromEmail,
  extractTokenFromUrl,
  findLatestDevEmailTo,
} from "@/lib/email/dev-outbox";
import { createCheckoutForSession } from "@/lib/services/checkout";
import { runAgentForSession } from "@/lib/services/agent-run";
import { createBuyerSession } from "@/lib/services/sessions";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { clearMerchantTransactionalData } from "@/lib/services/merchant-transactional";
import { deleteTestAccountsForMerchant } from "@/lib/services/buyer-account";
import { db } from "@/lib/db";
import {
  accountAuthHeaders,
  combinedAuthHeaders,
  registerAndVerifyAccount,
  TEST_PASSWORD,
  verificationCodeForEmail,
} from "./helpers/accounts";
import { buyerAuthHeaders, unauthorizedHeaders } from "./helpers/auth";
import { seedStaffAllowlist } from "./helpers/identity";
import { verifyPassword } from "@/lib/auth/password";
import {
  GET as staffRoute,
  POST as addStaffRoute,
  DELETE as removeStaffRoute,
} from "@/app/api/admin/staff/route";

const prisma = new PrismaClient();
const MERCHANT_ID = getConfiguredDemoMerchantId();
const BUYER_EMAIL = "buyer@example.com";
const STAFF_EMAIL = "staff@northlineaudio.com";
const ADMIN_EMAIL = "admin@example.com";

vi.mock("@/lib/razorpay/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/razorpay/client")>("@/lib/razorpay/client");
  return {
    ...actual,
    isRazorpayConfigured: () => true,
    getRazorpayKeySecret: () => "test_razorpay_secret",
    getPublicRazorpayKeyId: () => "rzp_test_key",
    getRazorpayClient: () => ({
      orders: {
        create: vi.fn(async ({ amount, receipt }: { amount: number; receipt: string }) => ({
          id: `order_${receipt}`,
          amount,
          currency: "INR",
        })),
      },
    }),
  };
});

async function readyCheckoutSession() {
  const { sessionId } = await createBuyerSession(
    "ANC headphones for a 14-hour flight, budget ₹8,500",
  );
  const { decisionId } = await runAgentForSession(sessionId);
  return { sessionId, decisionId };
}

describe("Buyer accounts and persistent auth", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedStaffAllowlist(MERCHANT_ID, [STAFF_EMAIL]);
  });

  afterAll(async () => {
    await clearMerchantTransactionalData(MERCHANT_ID);
    await deleteTestAccountsForMerchant(MERCHANT_ID);
    await prisma.$disconnect();
  });

  it("registers an account with hashed password", async () => {
    await deleteTestAccountsForMerchant(MERCHANT_ID);
    clearDevOutbox();
    const { sessionId } = await createBuyerSession("Gift speaker");

    const response = await registerRoute(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          ...buyerAuthHeaders(sessionId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: BUYER_EMAIL,
          password: TEST_PASSWORD,
          passwordConfirmation: TEST_PASSWORD,
          sessionId,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const account = await db.buyerAccount.findUnique({
      where: { merchantId_emailNormalized: { merchantId: MERCHANT_ID, emailNormalized: BUYER_EMAIL } },
    });
    expect(account).not.toBeNull();
    expect(account?.passwordHash).not.toBe(TEST_PASSWORD);
    expect(await verifyPassword(TEST_PASSWORD, account!.passwordHash)).toBe(true);
    expect(findLatestDevEmailTo(BUYER_EMAIL)).toBeDefined();
  });

  it("handles duplicate registration without revealing account existence details", async () => {
    const response = await registerRoute(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: BUYER_EMAIL,
          password: TEST_PASSWORD,
          passwordConfirmation: TEST_PASSWORD,
        }),
      }),
    );
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toMatch(/unable to create account/i);
  });

  it("logs in verified buyers and rejects incorrect passwords", async () => {
    const { sessionId, authSessionId } = await registerAndVerifyAccount({
      email: "login-buyer@example.com",
      sessionId: (await createBuyerSession("test")).sessionId,
    });

    const bad = await loginRoute(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "login-buyer@example.com", password: "WrongPass1!" }),
      }),
    );
    expect(bad.status).toBe(401);

    expect(sessionId).toBeTruthy();
    expect(authSessionId).toBeTruthy();

    const ok = await loginRoute(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          ...buyerAuthHeaders(sessionId!),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "login-buyer@example.com",
          password: TEST_PASSWORD,
          sessionId: sessionId!,
        }),
      }),
    );
    expect(ok.status).toBe(200);
    expect((await authSessionRoute(new Request("http://localhost/api/auth/session", {
      headers: combinedAuthHeaders(sessionId!, authSessionId!),
    }))).status).toBe(200);
  });

  it("blocks checkout for anonymous sessions", async () => {
    const { sessionId, decisionId } = await readyCheckoutSession();
    const response = await checkoutRoute(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        headers: {
          ...buyerAuthHeaders(sessionId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, decisionId }),
      }),
    );
    expect(response.status).toBe(403);
    const blockedPayload = (await response.json()) as { code?: string };
    expect(blockedPayload.code).toBe("VERIFICATION_REQUIRED");
  });

  it("links a verified account to the active desk session at checkout", async () => {
    const { sessionId, decisionId } = await readyCheckoutSession();
    const other = await createBuyerSession("registered elsewhere");
    const { authSessionId } = await registerAndVerifyAccount({
      email: "link-at-checkout@example.com",
      sessionId: other.sessionId,
    });

    const response = await checkoutRoute(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        headers: {
          ...combinedAuthHeaders(sessionId, authSessionId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, decisionId }),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("allows verified buyer checkout and preserves session decision", async () => {
    const { sessionId, decisionId } = await readyCheckoutSession();
    const { authSessionId } = await registerAndVerifyAccount({
      email: "checkout-buyer@example.com",
      sessionId,
    });

    const response = await checkoutRoute(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        headers: {
          ...combinedAuthHeaders(sessionId, authSessionId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, decisionId }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(createCheckoutForSession(sessionId, decisionId)).rejects.toMatchObject({ status: 409 });
  });

  it("verifies email with single-use code and rejects reuse/expiry", async () => {
    clearDevOutbox();
    await deleteTestAccountsForMerchant(MERCHANT_ID);
    const register = await registerRoute(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "verify-code@example.com",
          password: TEST_PASSWORD,
          passwordConfirmation: TEST_PASSWORD,
        }),
      }),
    );
    expect(register.status).toBe(200);
    const registerPayload = (await register.json()) as { account?: { id: string } };
    const accountId = registerPayload.account?.id;
    expect(accountId).toBeTruthy();

    const authSessionId = await (async () => {
      const { createAccountAuthSession } = await import("@/lib/services/buyer-account");
      return createAccountAuthSession(accountId!);
    })();

    const code = verificationCodeForEmail("verify-code@example.com");
    const ok = await verifyCodeRoute(
      new Request("http://localhost/api/auth/verify-code", {
        method: "POST",
        headers: {
          ...accountAuthHeaders(authSessionId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      }),
    );
    expect(ok.status).toBe(200);

    const reused = await verifyCodeRoute(
      new Request("http://localhost/api/auth/verify-code", {
        method: "POST",
        headers: {
          ...accountAuthHeaders(authSessionId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      }),
    );
    expect(reused.status).toBe(400);

    const account = await db.buyerAccount.findFirst({ where: { emailNormalized: "verify-code@example.com" } });
    await db.accountVerificationCode.create({
      data: {
        accountId: account!.id,
        codeHash: "0000000000000000000000000000000000000000000000000000000000000000",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const expired = await verifyCodeRoute(
      new Request("http://localhost/api/auth/verify-code", {
        method: "POST",
        headers: {
          ...accountAuthHeaders(authSessionId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: "999999" }),
      }),
    );
    expect(expired.status).toBe(400);
  });

  it("supports change email, resend verification, and password reset", async () => {
    clearDevOutbox();
    const register = await registerRoute(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "change-me@example.com",
          password: TEST_PASSWORD,
          passwordConfirmation: TEST_PASSWORD,
        }),
      }),
    );
    expect(register.status).toBe(200);

    const account = await db.buyerAccount.findFirst({ where: { emailNormalized: "change-me@example.com" } });
    const authSessionId = await (async () => {
      const { createAccountAuthSession } = await import("@/lib/services/buyer-account");
      return createAccountAuthSession(account!.id);
    })();

    await db.accountVerificationCode.updateMany({
      where: { accountId: account!.id },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });

    const resend = await resendVerificationRoute(
      new Request("http://localhost/api/auth/resend-verification", {
        method: "POST",
        headers: accountAuthHeaders(authSessionId),
      }),
    );
    expect(resend.status).toBe(200);

    await db.accountVerificationCode.updateMany({
      where: { accountId: account!.id },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });

    const changed = await changeEmailRoute(
      new Request("http://localhost/api/auth/change-email", {
        method: "POST",
        headers: {
          ...accountAuthHeaders(authSessionId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "changed-buyer@example.com" }),
      }),
    );
    expect(changed.status).toBe(200);
    expect(findLatestDevEmailTo("changed-buyer@example.com")).toBeDefined();

    await forgotPasswordRoute(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "changed-buyer@example.com" }),
      }),
    );
    const resetMessage = findLatestDevEmailTo("changed-buyer@example.com");
    const resetUrl = extractUrlFromEmail(resetMessage!.html, "/reset-password");
    const resetToken = extractTokenFromUrl(resetUrl!);
    const reset = await resetPasswordRoute(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: resetToken,
          password: "ResetPass123!",
          passwordConfirmation: "ResetPass123!",
        }),
      }),
    );
    expect(reset.status).toBe(200);
  });

  it("grants staff only through allowlist after verification", async () => {
    const { sessionId, authSessionId } = await registerAndVerifyAccount({
      email: STAFF_EMAIL,
      sessionId: (await createBuyerSession("staff desk")).sessionId,
    });

    expect(sessionId).toBeTruthy();
    expect(authSessionId).toBeTruthy();

    const staffOverview = await adminOverviewRoute(
      new Request("http://localhost/api/admin/overview", {
        headers: combinedAuthHeaders(sessionId!, authSessionId!),
      }),
    );
    expect(staffOverview.status).toBe(200);

    const domainSession = await createBuyerSession("domain only");
    const domainOnly = await registerAndVerifyAccount({
      email: "user@northlineaudio.com",
      sessionId: domainSession.sessionId,
    });
    const blocked = await adminOverviewRoute(
      new Request("http://localhost/api/admin/overview", {
        headers: combinedAuthHeaders(domainSession.sessionId, domainOnly.authSessionId),
      }),
    );
    expect(blocked.status).toBe(403);
  });

  it("logs in even when the buyer session cookie points to a stale session", async () => {
    const { sessionId } = await createBuyerSession("stale session login");
    await registerAndVerifyAccount({
      email: "stale-session-login@example.com",
      sessionId,
    });

    const staleLogin = await loginRoute(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "stale-session-login@example.com",
          password: TEST_PASSWORD,
          sessionId: "deleted-session-id",
        }),
      }),
    );
    expect(staleLogin.status).toBe(200);
  });

  it("logs out account sessions", async () => {
    const verified = await registerAndVerifyAccount({
      email: "logout@example.com",
      sessionId: (await createBuyerSession("logout")).sessionId,
    });
    const logout = await logoutRoute(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: accountAuthHeaders(verified.authSessionId),
      }),
    );
    expect(logout.status).toBe(200);
  });

  it("rejects admin routes for verified buyers without staff capability", async () => {
    const { sessionId, authSessionId } = await registerAndVerifyAccount({
      email: "non-staff@example.com",
      sessionId: (await createBuyerSession("buyer admin block")).sessionId,
    });
    expect(sessionId).toBeTruthy();
    expect(authSessionId).toBeTruthy();

    const response = await adminOverviewRoute(
      new Request("http://localhost/api/admin/overview", {
        headers: combinedAuthHeaders(sessionId!, authSessionId!),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("grants admin capability to INITIAL_ADMIN_EMAIL after verification", async () => {
    const { sessionId, authSessionId } = await registerAndVerifyAccount({
      email: ADMIN_EMAIL,
      sessionId: (await createBuyerSession("admin desk")).sessionId,
    });

    const session = await authSessionRoute(
      new Request("http://localhost/api/auth/session", {
        headers: combinedAuthHeaders(sessionId!, authSessionId!),
      }),
    );
    const payload = (await session.json()) as { account?: { capability?: string } };
    expect(payload.account?.capability).toBe("admin");
  });

  it("allows admin to manage staff and denies staff from staff management", async () => {
    const admin = await registerAndVerifyAccount({
      email: ADMIN_EMAIL,
      sessionId: (await createBuyerSession("admin staff mgmt")).sessionId,
    });
    const staffMember = await registerAndVerifyAccount({
      email: STAFF_EMAIL,
      sessionId: (await createBuyerSession("staff mgmt")).sessionId,
    });

    const list = await staffRoute(
      new Request("http://localhost/api/admin/staff", {
        headers: combinedAuthHeaders(admin.sessionId!, admin.authSessionId!),
      }),
    );
    expect(list.status).toBe(200);

    const add = await addStaffRoute(
      new Request("http://localhost/api/admin/staff", {
        method: "POST",
        headers: {
          ...combinedAuthHeaders(admin.sessionId!, admin.authSessionId!),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "new-staff@example.com" }),
      }),
    );
    expect(add.status).toBe(200);

    const staffBlocked = await staffRoute(
      new Request("http://localhost/api/admin/staff", {
        headers: combinedAuthHeaders(staffMember.sessionId!, staffMember.authSessionId!),
      }),
    );
    expect(staffBlocked.status).toBe(403);

    const created = (await add.json()) as { member?: { id: string } };
    const removed = await removeStaffRoute(
      new Request("http://localhost/api/admin/staff", {
        method: "DELETE",
        headers: {
          ...combinedAuthHeaders(admin.sessionId!, admin.authSessionId!),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: created.member?.id }),
      }),
    );
    expect(removed.status).toBe(200);
  });

  it("blocks unverified allowlisted staff from admin routes", async () => {
    clearDevOutbox();
    const staffEmail = `unverified-staff-${Date.now()}@example.com`;
    await registerRoute(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: staffEmail,
          password: TEST_PASSWORD,
          passwordConfirmation: TEST_PASSWORD,
        }),
      }),
    );
    await db.merchantStaffEmail.upsert({
      where: { merchantId_email: { merchantId: MERCHANT_ID, email: staffEmail } },
      update: {},
      create: { merchantId: MERCHANT_ID, email: staffEmail },
    });
    const account = await db.buyerAccount.findFirst({
      where: { emailNormalized: staffEmail },
    });
    const { createAccountAuthSession } = await import("@/lib/services/buyer-account");
    const authSessionId = await createAccountAuthSession(account!.id);
    const { sessionId } = await createBuyerSession("unverified staff");

    const response = await adminOverviewRoute(
      new Request("http://localhost/api/admin/overview", {
        headers: combinedAuthHeaders(sessionId, authSessionId),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("allows admin portal access with account session only", async () => {
    const admin = await registerAndVerifyAccount({
      email: ADMIN_EMAIL,
      sessionId: (await createBuyerSession("admin portal account only")).sessionId,
    });

    const response = await adminOverviewRoute(
      new Request("http://localhost/api/admin/overview", {
        headers: accountAuthHeaders(admin.authSessionId),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects unauthenticated admin routes", async () => {
    const response = await adminOverviewRoute(
      new Request("http://localhost/api/admin/overview", { headers: unauthorizedHeaders() }),
    );
    expect(response.status).toBe(401);
  });
});
