import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Seed baseline from prisma/seed.ts — reset before each E2E to avoid cross-test policy drift. */
export const SEED_POLICIES = {
  maxDiscountPct: 12,
  minMarginPct: 18,
  maxOrderInr: 50000,
  minAttachRatePct: 35,
  allowCrossSell: true,
  requireBudgetFit: true,
} as const;

export const STAFF_EMAIL = "staff@northlineaudio.com";
export const BUYER_EMAIL = "buyer@example.com";
export const TEST_PASSWORD = "NorthlineTest1!";
/** Stable desk intent that resolves to halo-anc despite catalog ties and Gemini variance. */
export const HALO_FLIGHT_INTENT = "halo-anc Halo ANC for a 14-hour flight, budget ₹8,500";

async function resolveBuyerSessionId(request: APIRequestContext): Promise<string> {
  const ctxRes = await request.get("/api/desk/context");
  if (ctxRes.ok()) {
    const ctx = (await ctxRes.json()) as { auth?: { sessionId?: string | null } };
    if (ctx.auth?.sessionId) {
      return ctx.auth.sessionId;
    }
  }

  const sessionRes = await request.post("/api/sessions", {
    data: { rawRequest: HALO_FLIGHT_INTENT },
  });
  if (!sessionRes.ok()) {
    throw new Error(`Session creation failed: ${sessionRes.status()}`);
  }
  return ((await sessionRes.json()) as { sessionId: string }).sessionId;
}

async function registerAccountViaApi(
  request: APIRequestContext,
  email: string,
  sessionId?: string,
): Promise<"created" | "exists"> {
  const response = await request.post("/api/auth/register", {
    data: {
      email,
      password: TEST_PASSWORD,
      passwordConfirmation: TEST_PASSWORD,
      sessionId,
    },
  });
  if (response.status() === 409) {
    return "exists";
  }
  if (!response.ok()) {
    throw new Error(`Registration failed: ${response.status()}`);
  }
  return "created";
}

async function verifyLatestEmailViaApi(request: APIRequestContext, email: string) {
  const devVerify = await request.post("/api/auth/dev/verify-email", { data: { email } });
  if (devVerify.ok()) return;
  if (devVerify.status() === 400) return;

  const codeResponse = await request.post("/api/auth/dev/verification-code", { data: { email } });
  if (!codeResponse.ok()) {
    throw new Error(
      `Dev verification failed (${devVerify.status()} / ${codeResponse.status()}). ` +
        "Playwright must start its own dev server with RAZORFLOW_USE_DEV_EMAIL=1 (see playwright.config.ts).",
    );
  }
  const { code } = (await codeResponse.json()) as { code: string };
  const verify = await request.post("/api/auth/verify-code", { data: { code } });
  if (!verify.ok() && verify.status() !== 400) {
    throw new Error(`Verify code failed: ${verify.status()}`);
  }
}

async function loginViaApi(request: APIRequestContext, email: string, sessionId?: string) {
  const response = await request.post("/api/auth/login", {
    data: { email, password: TEST_PASSWORD, sessionId },
  });
  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()}`);
  }
}

async function ensureVerifiedAccountViaApi(
  request: APIRequestContext,
  email: string,
  sessionId: string,
) {
  await registerAccountViaApi(request, email, sessionId);
  await loginViaApi(request, email, sessionId);

  async function isVerified() {
    const session = await request.get("/api/auth/session");
    const payload = (await session.json()) as {
      emailVerified?: boolean;
      account?: { emailVerified?: boolean };
    };
    return Boolean(payload.emailVerified || payload.account?.emailVerified);
  }

  if (await isVerified()) {
    return;
  }

  try {
    await verifyLatestEmailViaApi(request, email);
  } catch {
    const resend = await request.post("/api/auth/resend-verification");
    if (!resend.ok() && resend.status() !== 429) {
      throw new Error(`Resend verification failed: ${resend.status()}`);
    }
    await verifyLatestEmailViaApi(request, email);
  }

  await loginViaApi(request, email, sessionId);
  if (!(await isVerified())) {
    throw new Error(`Account ${email} is still unverified after verification flow`);
  }
}

/** Creates a buyer session and verifies staff email for admin API access. */
export async function authenticateStaff(request: APIRequestContext) {
  const sessionId = await resolveBuyerSessionId(request);
  await ensureVerifiedAccountViaApi(request, STAFF_EMAIL, sessionId);
}

/** Ensures staff auth on the active desk page session (for UI assertions). */
export async function authenticateStaffOnPage(page: Page) {
  await page.goto("/desk");
  let sessionId = await resolveBuyerSessionId(page.request);
  if (!sessionId) {
    const created = await page.request.post("/api/sessions", {
      data: { rawRequest: "Staff desk access for E2E" },
    });
    if (!created.ok()) {
      throw new Error(`Desk session creation failed: ${created.status()}`);
    }
    sessionId = ((await created.json()) as { sessionId: string }).sessionId;
  }
  await ensureVerifiedAccountViaApi(page.request, STAFF_EMAIL, sessionId);
  await page.reload();
}

/** @deprecated Use authenticateStaff — merchant cookie auth was replaced by staff identity. */
export async function authenticateMerchant(request: APIRequestContext) {
  await authenticateStaff(request);
}

export async function resetSeedPolicies(request: APIRequestContext) {
  await authenticateStaff(request);
  const current = await request.get("/api/admin/policies");
  if (!current.ok()) {
    throw new Error(`Could not load policies: ${current.status()}`);
  }
  const payload = (await current.json()) as {
    policies: Record<string, unknown>;
  };
  const response = await request.put("/api/admin/policies", {
    data: { ...payload.policies, ...SEED_POLICIES },
  });
  if (!response.ok()) {
    throw new Error(`Could not reset policies: ${response.status()}`);
  }
}

export async function prepareE2EBaseline(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
}

/** Fill intent, run agent, and add primary recommendation to cart for checkout. */
export async function runDeskAgentWithIntent(
  page: Page,
  intent: string = HALO_FLIGHT_INTENT,
) {
  await page.goto("/desk");
  const input = page.getByTestId("intent-input");
  await expect(input).toBeVisible();
  await expect(input).not.toHaveValue("");
  await input.fill(intent);
  await expect(input).toHaveValue(intent);
  await page.getByTestId("run-agent").click();
  await expect(page.getByTestId("product-name")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("add-to-cart-halo-anc").click();
  await expect(page.getByTestId("cart-badge")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("authorize")).toBeEnabled({ timeout: 10_000 });
}

export async function ensureVerifiedBuyerForCheckout(
  page: Page,
  email: string = `buyer-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
) {
  const sessionId = await resolveBuyerSessionId(page.request);
  await ensureVerifiedAccountViaApi(page.request, email, sessionId);
}

export async function completeDeskAccountAuthUi(page: Page, email: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Log in" }).waitFor({ timeout: 10_000 });
  await dialog.getByRole("button", { name: /Create one/i }).click();
  await dialog.getByRole("heading", { name: "Create account" }).waitFor({ timeout: 10_000 });
  await dialog.locator('input[type="email"]').fill(email);
  await dialog.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await dialog.locator('input[type="password"]').nth(1).fill(TEST_PASSWORD);
  await dialog.getByRole("button", { name: "Create account" }).last().click();
  await dialog.getByRole("heading", { name: "Verify your email" }).waitFor({ timeout: 10_000 });
  const codeResponse = await page.request.post("/api/auth/dev/verification-code", { data: { email } });
  expect(codeResponse.ok()).toBeTruthy();
  const { code } = (await codeResponse.json()) as { code: string };
  await dialog.getByTestId("auth-verification-code").fill(code);
  await dialog.getByRole("button", { name: "Verify email" }).click();
  await expect(dialog.getByRole("heading", { name: "Email verified" })).toBeVisible({
    timeout: 10_000,
  });
  await dialog.getByRole("button", { name: "Continue" }).click();
}

const deskAdminLink = (page: Page) => page.locator('a.rf-workspace-switch[href="/admin"]');

export async function expectAdminNavLinkVisible(page: Page, linkName: string) {
  const sidebarNav = page.getByRole("navigation", { name: "Admin" });
  if (await sidebarNav.isVisible().catch(() => false)) {
    await expect(sidebarNav.getByRole("link", { name: linkName })).toBeVisible();
    return;
  }
  const menuButton = page.getByRole("button", { name: /Open admin menu/i });
  await menuButton.click();
  const mobileNav = page.getByRole("navigation", { name: "Admin mobile navigation" });
  await mobileNav.waitFor({ state: "visible", timeout: 10_000 });
  await expect(mobileNav.getByRole("link", { name: linkName })).toBeVisible();
}

export { deskAdminLink };
