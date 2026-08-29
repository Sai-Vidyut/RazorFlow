import { expect, test } from "@playwright/test";
import { prepareE2EBaseline, runDeskAgentWithIntent, ensureVerifiedBuyerForCheckout } from "./helpers/baseline";
import { isRazorpayConfigured } from "./helpers/env";
import {
  captureCurrentDeskSaleViaApi,
  installRazorpayDismissMock,
  installRazorpaySuccessMock,
  prepareCapturedDeskSale,
} from "./helpers/desk-payment";

test.describe("Desk post-payment UX", () => {
  test.beforeEach(async ({ page }) => {
    await prepareE2EBaseline(page);
  });

  test("successful payment shows completed transaction and hides Authorize", async ({ page }) => {
    test.skip(!isRazorpayConfigured(), "Requires Razorpay test keys");

    await installRazorpaySuccessMock(page);
    await runDeskAgentWithIntent(page);
    await ensureVerifiedBuyerForCheckout(page);
    await page.getByTestId("authorize").click();

    await expect(page.getByTestId("transaction-completed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("payment-success")).toContainText("Payment captured");
    await expect(page.getByTestId("authorize")).toHaveCount(0);
    await expect(page.getByTestId("simulate-decline")).toHaveCount(0);
    await expect(page.getByTestId("completed-order-id")).toContainText("RF-");
  });

  test("completed sale persists after returning to /desk", async ({ page }) => {
    test.skip(!isRazorpayConfigured(), "Requires Razorpay test keys");

    await prepareCapturedDeskSale(page);
    await page.reload();

    await expect(page.getByTestId("transaction-completed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("authorize")).toHaveCount(0);
    await expect(page.getByTestId("product-name")).toHaveText("Northline Halo ANC");
  });

  test("Start new sale resets the completed transaction", async ({ page }) => {
    test.skip(!isRazorpayConfigured(), "Requires Razorpay test keys");

    await prepareCapturedDeskSale(page);
    await page.reload();
    await expect(page.getByTestId("transaction-completed")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("start-new-sale").click();
    await expect(page.getByTestId("transaction-completed")).toHaveCount(0);
    await expect(page.getByTestId("authorize")).toBeVisible();
    await expect(page.getByTestId("authorize")).toBeDisabled();
  });

  test("failed payment is not marked captured", async ({ page }) => {
    test.skip(!isRazorpayConfigured(), "Requires Razorpay test keys");

    await runDeskAgentWithIntent(page);
    await ensureVerifiedBuyerForCheckout(page);
    await page.getByTestId("simulate-decline").click();

    await expect(page.getByTestId("payment-failed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("transaction-completed")).toHaveCount(0);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("payment-not-completed")).toBeVisible();
    await expect(page.getByTestId("authorize")).toHaveCount(0);
  });

  test("dismissed checkout keeps sale available for retry", async ({ page }) => {
    test.skip(!isRazorpayConfigured(), "Requires Razorpay test keys");

    await installRazorpayDismissMock(page);
    await runDeskAgentWithIntent(page);
    await ensureVerifiedBuyerForCheckout(page);
    await page.getByTestId("authorize").click();

    await expect(page.getByTestId("payment-not-completed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("transaction-completed")).toHaveCount(0);
    await page.getByTestId("try-payment-again").click();
    await expect(page.getByTestId("authorize")).toBeEnabled();
  });

  test("completed transaction cannot be authorized twice", async ({ page }) => {
    test.skip(!isRazorpayConfigured(), "Requires Razorpay test keys");

    await prepareCapturedDeskSale(page);
    await page.reload();
    await expect(page.getByTestId("transaction-completed")).toBeVisible({ timeout: 15_000 });

    await captureCurrentDeskSaleViaApi(page).catch(() => null);
    await expect(page.getByTestId("authorize")).toHaveCount(0);
  });
});
