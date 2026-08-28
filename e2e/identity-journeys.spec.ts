import { expect, test } from "@playwright/test";
import { isRazorpayConfigured } from "./helpers/env";
import {
  BUYER_EMAIL,
  completeDeskAccountAuthUi,
  ensureVerifiedBuyerForCheckout,
  prepareE2EBaseline,
  STAFF_EMAIL,
  TEST_PASSWORD,
} from "./helpers/baseline";

test.describe("Phase 11 account journeys", () => {
  test.beforeEach(async ({ page }) => {
    await prepareE2EBaseline(page);
  });

  test("desk recommend → authorize → account auth → checkout continues", async ({ page }) => {
    test.skip(!isRazorpayConfigured(), "Requires Razorpay test keys for checkout order creation");

    await page.goto("/desk");
    await page.getByTestId("intent-input").fill(
      "ANC headphones for a 14-hour flight, budget ₹8,500",
    );
    await page.getByTestId("run-agent").click();
    await expect(page.getByTestId("product-name")).toHaveText("Northline Halo ANC", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("authorize")).toBeEnabled({ timeout: 15_000 });

    await page.getByTestId("simulate-decline").click();
    await completeDeskAccountAuthUi(page, `e2e-buyer-${Date.now()}@example.com`);

    await expect(page.getByTestId("payment-failed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Your basket is unchanged.")).toBeVisible({ timeout: 15_000 });
  });

  test("verified buyer does not see Admin and cannot open admin portal", async ({ page }) => {
    await page.goto("/desk");
    await page.getByTestId("run-agent").click();
    await expect(page.getByTestId("product-name")).toHaveText("Northline Halo ANC", {
      timeout: 15_000,
    });

    await ensureVerifiedBuyerForCheckout(page, `verified-buyer-${Date.now()}@example.com`);
    await page.goto("/desk");
    await expect(page.getByRole("banner").getByRole("link", { name: "Admin" })).toHaveCount(0);

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin unavailable" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("verified staff sees Admin and admin portal opens", async ({ page }) => {
    await page.goto("/desk");
    await page.getByTestId("run-agent").click();
    await expect(page.getByTestId("product-name")).toHaveText("Northline Halo ANC", {
      timeout: 15_000,
    });

    const ctx = await page.request.get("/api/desk/context");
    const sessionId = ((await ctx.json()) as { auth?: { sessionId?: string } }).auth?.sessionId;
    expect(sessionId).toBeTruthy();
    await page.request.post("/api/auth/register", {
      data: {
        email: STAFF_EMAIL,
        password: TEST_PASSWORD,
        passwordConfirmation: TEST_PASSWORD,
        sessionId,
      },
    }).catch(() => undefined);
    await page.request.post("/api/auth/dev/verify-email", { data: { email: STAFF_EMAIL } }).catch(() => undefined);
    const loginRes = await page.request.post("/api/auth/login", {
      data: { email: STAFF_EMAIL, password: TEST_PASSWORD, sessionId },
    });
    expect(loginRes.ok()).toBeTruthy();

    await page.goto("/desk");
    await expect(page.getByRole("banner").getByRole("link", { name: "Admin" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("banner").getByRole("link", { name: "Admin" }).click();
    await page.waitForURL(/\/admin/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
