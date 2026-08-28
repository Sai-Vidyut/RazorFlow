import { expect, test } from "@playwright/test";
import { isRazorpayConfigured } from "./helpers/env";
import { authenticateMerchant, ensureVerifiedBuyerForCheckout, prepareE2EBaseline, runDeskAgentWithIntent } from "./helpers/baseline";

async function fetchOverviewJson(page: import("@playwright/test").Page) {
  await authenticateMerchant(page.request);
  const response = await page.request.get("/api/admin/overview");
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{
    commerce: { orderCount: number; failedPayments: number; gmvInr: number };
    agent: { decisions: number; offersGenerated: number; checkoutAttempts: number };
    recentActivity: Array<{ type: string; label: string }>;
  }>;
}

async function fetchActivityJson(page: import("@playwright/test").Page, filter = "orders") {
  await authenticateMerchant(page.request);
  const response = await page.request.get(`/api/admin/activity?filter=${filter}&limit=20`);
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{
    items: Array<{ type: string; label: string }>;
  }>;
}

test.describe("Admin data-driven E2E", () => {
  test.beforeEach(async ({ page }) => {
    await prepareE2EBaseline(page);
  });

  test("desk commerce flow updates admin metrics and activity", async ({ page }) => {
    const baseline = await fetchOverviewJson(page);

    await runDeskAgentWithIntent(page);
    await expect(page.getByTestId("product-name")).toHaveText("Northline Halo ANC", {
      timeout: 15_000,
    });

    const afterAgent = await fetchOverviewJson(page);
    expect(afterAgent.agent.decisions).toBeGreaterThan(baseline.agent.decisions);
    expect(afterAgent.agent.offersGenerated).toBeGreaterThan(baseline.agent.offersGenerated);
    await expect
      .poll(async () => {
        const overview = await fetchOverviewJson(page);
        return overview.recentActivity.some((item) => item.type === "DECISION_RECORDED");
      })
      .toBe(true);

    if (isRazorpayConfigured()) {
      await expect(page.getByTestId("authorize")).toBeEnabled({ timeout: 15_000 });
      await ensureVerifiedBuyerForCheckout(page);
      await page.getByTestId("simulate-decline").click();
    } else {
      await expect(page.getByTestId("authorize")).toBeEnabled({ timeout: 15_000 });
      await ensureVerifiedBuyerForCheckout(page);
      await page.getByTestId("authorize").click();
    }

    await expect(page.getByTestId("payment-failed")).toBeVisible({ timeout: 15_000 });

    if (isRazorpayConfigured()) {
      await expect
        .poll(async () => (await fetchOverviewJson(page)).commerce.orderCount, { timeout: 20_000 })
        .toBeGreaterThan(afterAgent.commerce.orderCount);
      await expect
        .poll(async () => (await fetchOverviewJson(page)).agent.checkoutAttempts, { timeout: 20_000 })
        .toBeGreaterThan(afterAgent.agent.checkoutAttempts);

      const afterCheckout = await fetchOverviewJson(page);
      const orderActivity = await fetchActivityJson(page, "orders");
      expect(
        orderActivity.items.some(
          (item) => item.type === "CHECKOUT_STARTED" || item.type === "ORDER_CREATED",
        ),
      ).toBe(true);
      expect(afterCheckout.commerce.failedPayments).toBeGreaterThan(baseline.commerce.failedPayments);
    }

    await authenticateMerchant(page.request);
    await page.goto("/admin/activity");
    await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Agent decision recorded").first()).toBeVisible();
  });
});
