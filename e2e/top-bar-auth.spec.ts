import { expect, test } from "@playwright/test";
import { authenticateStaffOnPage, prepareE2EBaseline } from "./helpers/baseline";

test.describe("Top bar auth", () => {
  test.beforeEach(async ({ page }) => {
    await prepareE2EBaseline(page);
  });

  test("anonymous top bar shows Log in only", async ({ page }) => {
    await page.goto("/desk");
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("button", { name: "Log in" })).toBeVisible();
    await expect(banner.getByRole("button", { name: "Create account" })).toHaveCount(0);
    await expect(banner.getByText(/Session/i)).toHaveCount(0);
    await expect(banner.getByRole("link", { name: "Admin" })).toHaveCount(0);
  });

  test("login modal contains create account action", async ({ page }) => {
    await page.goto("/desk");
    await page.getByRole("banner").getByRole("button", { name: "Log in" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: /Create one/i })).toBeVisible();
  });

  test("staff sees Admin link after authentication", async ({ page }) => {
    await authenticateStaffOnPage(page);
    await expect(page.getByRole("banner").getByRole("link", { name: "Admin" })).toBeVisible({
      timeout: 15_000,
    });
  });
});
