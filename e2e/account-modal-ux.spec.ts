import { expect, test } from "@playwright/test";
import { prepareE2EBaseline, TEST_PASSWORD } from "./helpers/baseline";

async function openCreateAccountModal(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const loginButton = page.getByRole("banner").getByRole("button", { name: "Log in" });
  await loginButton.waitFor({ state: "visible", timeout: 10_000 });
  await loginButton.click({ force: true });
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Log in" }).waitFor({ timeout: 10_000 });
  await dialog.getByRole("button", { name: /Create one/i }).click();
  await dialog.getByRole("heading", { name: "Create account" }).waitFor({ timeout: 10_000 });
  return dialog;
}

async function openLoginModal(page: import("@playwright/test").Page) {
  await page.goto("/");
  const loginButton = page.getByRole("banner").getByRole("button", { name: "Log in" });
  await loginButton.waitFor({ state: "visible", timeout: 10_000 });
  await loginButton.click({ force: true });
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Log in" }).waitFor({ timeout: 10_000 });
  return dialog;
}

test.describe("Account modal UX", () => {
  test.beforeEach(async ({ page }) => {
    await prepareE2EBaseline(page);
  });

  test("duplicate registration displays a specific already exists message", async ({ page }) => {
    const email = `duplicate-ux-${Date.now()}@example.com`;
    const register = await page.request.post("/api/auth/register", {
      data: {
        email,
        password: TEST_PASSWORD,
        passwordConfirmation: TEST_PASSWORD,
      },
    });
    expect(register.ok()).toBeTruthy();

    const dialog = await openCreateAccountModal(page);
    await dialog.locator('input[type="email"]').fill(email);
    await dialog.getByTestId("auth-register-password").fill(TEST_PASSWORD);
    await dialog.getByTestId("auth-register-password-confirm").fill(TEST_PASSWORD);
    await dialog.getByRole("button", { name: "Create account" }).click();

    await expect(dialog.getByRole("alert")).toContainText(
      "An account already exists for this email. Log in instead.",
    );
    await expect(dialog.getByRole("button", { name: "Log in instead" })).toBeVisible();
  });

  test("register password visibility toggles and preserves value", async ({ page }) => {
    const dialog = await openCreateAccountModal(page);
    const password = dialog.getByTestId("auth-register-password");
    const toggle = dialog.getByTestId("auth-register-password-toggle");

    await password.fill("NorthlineTest1!");
    await expect(password).toHaveAttribute("type", "password");
    await toggle.click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("NorthlineTest1!");
    await toggle.click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue("NorthlineTest1!");
  });

  test("confirm password visibility is independent from password visibility", async ({ page }) => {
    const dialog = await openCreateAccountModal(page);
    const password = dialog.getByTestId("auth-register-password");
    const confirm = dialog.getByTestId("auth-register-password-confirm");
    const passwordToggle = dialog.getByTestId("auth-register-password-toggle");
    const confirmToggle = dialog.getByTestId("auth-register-password-confirm-toggle");

    await password.fill("NorthlineTest1!");
    await confirm.fill("NorthlineTest1!");
    await passwordToggle.click();

    await expect(password).toHaveAttribute("type", "text");
    await expect(confirm).toHaveAttribute("type", "password");

    await confirmToggle.click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(confirm).toHaveAttribute("type", "text");
  });

  test("login password visibility works", async ({ page }) => {
    const dialog = await openLoginModal(page);
    const password = dialog.getByTestId("auth-login-password");
    const toggle = dialog.getByTestId("auth-login-password-toggle");

    await password.fill("NorthlineTest1!");
    await toggle.click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("NorthlineTest1!");
  });

  test("reset password visibility works for both fields", async ({ page }) => {
    await page.goto("/reset-password?token=e2e-ui-test-token");
    const password = page.getByTestId("reset-password-new");
    const confirm = page.getByTestId("reset-password-confirm");
    const passwordToggle = page.getByTestId("reset-password-new-toggle");
    const confirmToggle = page.getByTestId("reset-password-confirm-toggle");

    await password.fill("ResetPass123!");
    await confirm.fill("ResetPass123!");
    await passwordToggle.click();

    await expect(password).toHaveAttribute("type", "text");
    await expect(confirm).toHaveAttribute("type", "password");
    await expect(password).toHaveValue("ResetPass123!");

    await confirmToggle.click();
    await expect(confirm).toHaveAttribute("type", "text");
    await expect(confirm).toHaveValue("ResetPass123!");
  });
});
