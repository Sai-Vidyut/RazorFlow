import { expect, test } from "@playwright/test";
import { isRazorpayConfigured } from "./helpers/env";
import { authenticateMerchant, ensureVerifiedBuyerForCheckout, prepareE2EBaseline, SEED_POLICIES } from "./helpers/baseline";

test.describe("Phase 7 journey regression", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await prepareE2EBaseline(page);
  });

  test("policy rejection blocks checkout with no payment state", async ({ page }) => {
    await page.goto("/desk");
    await page.getByTestId("demo-prompt-policy-block").click();
    await page.getByTestId("run-agent").click();
    await expect(page.getByTestId("policy-result")).toContainText(/above the \d+% ceiling/i, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("authorize")).toBeDisabled();
  });

  test("admin policy change is reflected on next agent run", async ({ page }) => {
    await authenticateMerchant(page.request);
    const current = await page.request.get("/api/admin/policies");
    expect(current.ok()).toBeTruthy();
    const payload = (await current.json()) as { policies: Record<string, unknown> };

    try {
      const save = await page.request.put("/api/admin/policies", {
        data: { ...payload.policies, maxDiscountPct: 5 },
      });
      expect(save.ok()).toBeTruthy();

      await expect
        .poll(async () => {
          const verify = await page.request.get("/api/admin/policies");
          const verified = (await verify.json()) as { policies: { maxDiscountPct: number } };
          return verified.policies.maxDiscountPct;
        })
        .toBe(5);

      await page.goto("/desk");
      await page.getByTestId("demo-prompt-policy-block").click();
      await page.getByTestId("run-agent").click();
      await expect(page.getByTestId("policy-result")).toContainText(/above the 5% ceiling/i, {
        timeout: 15_000,
      });
      await expect(page.getByTestId("authorize")).toBeDisabled();
    } finally {
      await page.request.put("/api/admin/policies", {
        data: { ...payload.policies, ...SEED_POLICIES },
      });
    }
  });

  test("recovery blocked shows unavailable state", async ({ page }) => {
    test.skip(!isRazorpayConfigured(), "Requires Razorpay test keys");

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
  });
});
