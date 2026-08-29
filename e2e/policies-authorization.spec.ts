import { expect, test } from "@playwright/test";
import {
  authenticateStaff,
  ensureVerifiedBuyerForCheckout,
  prepareE2EBaseline,
  runDeskAgentWithIntent,
} from "./helpers/baseline";

test.describe("Policy page authorization", () => {
  test.beforeEach(async ({ page }) => {
    await prepareE2EBaseline(page);
  });

  test("buyer is redirected away from /policies", async ({ page }) => {
    await page.goto("/desk");
    await runDeskAgentWithIntent(page);
    await ensureVerifiedBuyerForCheckout(page);

    await page.goto("/policies");
    await expect(page).toHaveURL(/\/desk/, { timeout: 10_000 });
    await expect(page.getByLabel("Discount ceiling")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Buyer intent" })).toBeVisible();
  });

  test("buyer cannot mutate policies through the legacy API", async ({ page }) => {
    await page.goto("/desk");
    await ensureVerifiedBuyerForCheckout(page);

    const response = await page.request.put("/api/policies", {
      data: {
        maxDiscountPct: 99,
        minMarginPct: 1,
        maxOrderInr: 999999,
        minAttachRatePct: 0,
        allowCrossSell: true,
        requireBudgetFit: false,
      },
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });

  test("staff can access admin policies and update settings", async ({ page }) => {
    await authenticateStaff(page.request);
    await page.goto("/policies");
    await expect(page).toHaveURL(/\/admin\/policies/, { timeout: 10_000 });
    await expect(page.getByLabel("Discount ceiling (%)")).toBeVisible();

    const current = await page.request.get("/api/admin/policies");
    expect(current.ok()).toBeTruthy();
    const payload = (await current.json()) as {
      policies: { maxDiscountPct: number };
    };

    const save = await page.request.put("/api/admin/policies", {
      data: payload.policies,
    });
    expect(save.ok()).toBeTruthy();
  });

  test("desk buyer does not see editable policy controls in the header", async ({ page }) => {
    await page.goto("/desk");
    await ensureVerifiedBuyerForCheckout(page);
    await expect(page.getByRole("link", { name: "Policies" })).toHaveCount(0);
  });
});
