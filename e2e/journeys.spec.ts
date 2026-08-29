import { expect, test } from "@playwright/test";
import { isRazorpayConfigured } from "./helpers/env";
import {
  authenticateStaff,
  ensureVerifiedBuyerForCheckout,
  expectAdminNavLinkVisible,
  prepareE2EBaseline,
  runDeskAgentWithIntent,
} from "./helpers/baseline";

test.describe("RazorFlow journeys", () => {
  test.beforeEach(async ({ page }) => {
    await prepareE2EBaseline(page);
  });

  test("landing tells the governed sale story", async ({ page }) => {
    const isMobile = test.info().project.use.isMobile;
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Turn buyer intent into a governed sale/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the desk" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agent decision" })).toBeVisible();
    await expect(page.getByText("Recommended")).toBeVisible();
    if (!isMobile) {
      await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Ledger" })).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Desk" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Policies" })).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Admin" })).toHaveCount(0);
    }
    await expect(page.getByRole("banner").getByRole("button", { name: "Log in" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("button", { name: "Create account" })).toHaveCount(0);
    await expect(page.locator("#content").getByRole("button", { name: "Create account" })).toHaveCount(0);
    await page.getByRole("link", { name: "Open the desk" }).click();
    await page.waitForURL(/\/desk/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/desk/);
  });

  test("desk recommends Halo and reaches checkout boundary", async ({ page }) => {
    await runDeskAgentWithIntent(page);
    await expect(page.getByTestId("product-name")).toHaveText("Northline Halo ANC", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("suggested-accessory")).toBeVisible();
    await expect(page.getByText(/high attach rate/i)).toBeVisible();
    await expect(page.getByTestId("policy-result")).toContainText(/Allowed/i);
    await expect(page.getByTestId("cart-summary")).toContainText("Northline Halo ANC");

    if (isRazorpayConfigured()) {
      await ensureVerifiedBuyerForCheckout(page);
      // Server creates a real order, then the explicit simulated-decline path records failure.
      await page.getByTestId("simulate-decline").click();
      await expect(page.getByTestId("payment-failed")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("retry-payment")).toBeVisible({ timeout: 15_000 });
    } else {
      // Checkout cannot start without credentials; failure is returned by the server.
      await ensureVerifiedBuyerForCheckout(page);
      await page.getByTestId("authorize").click();
      await expect(page.getByTestId("payment-failed")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("alert").filter({ hasText: /Razorpay is not configured/i })).toBeVisible();
    }
  });

  test("discount above the ceiling is blocked", async ({ page }) => {
    await page.goto("/desk");
    await page.getByTestId("demo-prompt-policy-block").click();
    await page.getByTestId("run-agent").click();
    await expect(page.getByTestId("policy-result")).toContainText(/above the \d+% ceiling/i, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("authorize")).toBeDisabled();
  });

  test("failed payment can be retried", async ({ page }) => {
    test.skip(!isRazorpayConfigured(), "Requires Razorpay test keys for checkout order creation");

    await runDeskAgentWithIntent(page);
    await expect(page.getByTestId("authorize")).toBeEnabled({ timeout: 15_000 });
    await ensureVerifiedBuyerForCheckout(page);
    await page.getByTestId("simulate-decline").click();
    await expect(page.getByTestId("payment-failed")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("retry-payment").click();
    await expect(page.getByTestId("authorize")).toHaveText(/Collecting payment|Authorize/i, {
      timeout: 15_000,
    });
  });

  test.describe("admin portal (staff)", () => {
    test.beforeEach(async ({ page }) => {
      await authenticateStaff(page.request);
    });

  test("admin portal loads overview for the merchant", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    const sidebarNav = page.getByRole("navigation", { name: "Admin" });
    if (await sidebarNav.isVisible().catch(() => false)) {
      await expect(sidebarNav).toBeVisible();
      await expect(page.getByRole("link", { name: "Orders" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Policies" })).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: /Open admin menu/i })).toBeVisible();
      await expectAdminNavLinkVisible(page, "Orders");
    }
    await expect(page.getByRole("heading", { name: "Catalog health" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Commerce activity" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Agent activity" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("admin orders and policies pages load real sections", async ({ page }) => {
    await page.goto("/admin/orders");
    await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.goto("/admin/policies");
    await expect(page.getByRole("heading", { name: "Policies", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Discount ceiling (%)")).toBeVisible();
  });

  test("admin products page lists catalog and supports add flow", async ({ page }) => {
    await page.goto("/admin/products");
    await expect(page.getByRole("heading", { name: "Products", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Add product" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByText("Northline Halo ANC")).toBeVisible();
  });
  });
});
