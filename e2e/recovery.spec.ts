import { expect, test } from "@playwright/test";
import { isRazorpayConfigured } from "./helpers/env";
import { ensureVerifiedBuyerForCheckout, prepareE2EBaseline, authenticateStaff, expectAdminNavLinkVisible } from "./helpers/baseline";

test.describe("Revenue recovery E2E", () => {
  test.beforeEach(async ({ page }) => {
    await prepareE2EBaseline(page);
  });

  test("desk failed payment can recover with successful retry", async ({ page }) => {
    test.skip(!isRazorpayConfigured(), "Requires Razorpay test keys for checkout order creation");

    await page.goto("/desk");
    await page.getByTestId("run-agent").click();
    await expect(page.getByTestId("authorize")).toBeEnabled({ timeout: 15_000 });
    await ensureVerifiedBuyerForCheckout(page);
    await page.getByTestId("simulate-decline").click();
    await expect(page.getByTestId("payment-failed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Your basket is unchanged.")).toBeVisible();
    await page.getByTestId("retry-payment").click();
    await expect(page.getByTestId("authorize")).toHaveText(/Collecting payment/i, {
      timeout: 15_000,
    });
  });

  test("shows recovery unavailable when policy blocks retry", async ({ page }) => {
    test.skip(!isRazorpayConfigured(), "Requires Razorpay test keys for checkout order creation");

    await page.route("**/api/recovery/evaluate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          evaluation: {
            status: "blocked",
            reason: "This basket no longer satisfies the merchant pricing policy.",
            changes: [],
            policyBlocked: true,
            attemptNumber: 2,
            priorFailedAttempts: 1,
          },
        }),
      });
    });

    await page.goto("/desk");
    await page.getByTestId("run-agent").click();
    await expect(page.getByTestId("authorize")).toBeEnabled({ timeout: 15_000 });
    await ensureVerifiedBuyerForCheckout(page);
    await page.getByTestId("simulate-decline").click();
    await expect(page.getByTestId("payment-failed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Recovery unavailable")).toBeVisible();
    await expect(page.getByTestId("retry-payment")).toHaveCount(0);
  });

  test("admin recovery page loads with metrics strip", async ({ page }) => {
    await authenticateStaff(page.request);
    await page.goto("/admin/recovery");
    await expect(page.getByRole("heading", { name: "Recovery", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Failed payment amount")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Recovery candidates")).toBeVisible();
    await expectAdminNavLinkVisible(page, "Recovery");
  });
});
