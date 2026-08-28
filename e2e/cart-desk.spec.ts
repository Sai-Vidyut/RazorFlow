import { expect, test } from "@playwright/test";
import { prepareE2EBaseline } from "./helpers/baseline";

const MULTI_EARBUDS_INTENT = "show me 3 earbuds";

async function runAgentForMultiProduct(page: import("@playwright/test").Page) {
  await page.getByTestId("intent-input").fill(MULTI_EARBUDS_INTENT);
  await page.getByTestId("run-agent").click();
  await expect(page.getByTestId("run-agent")).toBeEnabled({ timeout: 15_000 });
  const browser = page.getByTestId("product-recommendation-browser");
  if (!(await browser.isVisible())) {
    return null;
  }
  return browser;
}

async function runAgentForHalo(page: import("@playwright/test").Page) {
  await page.getByTestId("intent-input").fill("halo-anc Halo ANC for a 14-hour flight, budget ₹8,500");
  await page.getByTestId("run-agent").click();
  await expect(page.getByTestId("run-agent")).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByTestId("product-name")).toHaveText("Northline Halo ANC", { timeout: 15_000 });
}

test.describe("Desk transaction cart", () => {
  test.beforeEach(async ({ page }) => {
    await prepareE2EBaseline(page);
  });

  test("cart lives in Transaction and /cart redirects to desk", async ({ page }) => {
    await page.goto("/desk");
    await expect(page.getByTestId("transaction-rail")).toBeVisible();
    await expect(page.getByTestId("transaction-cart")).toBeVisible();
    await expect(page.getByTestId("cart-empty-hint")).toHaveText("No items added yet.");
    await expect(page.getByTestId("authorize")).toBeDisabled();

    await page.goto("/cart");
    await page.waitForURL(/\/desk/, { timeout: 10_000 });
    await expect(page.getByTestId("transaction-cart")).toBeVisible();
  });

  test("browsing recommendations does not add to cart", async ({ page }) => {
    await page.goto("/desk");
    const browser = await runAgentForMultiProduct(page);
    if (!browser) {
      test.skip(true, "Agent returned a single recommendation for this intent");
      return;
    }
    await expect(page.getByTestId("cart-empty-hint")).toBeVisible();
    await page.getByTestId("next-product").click();
    await expect(page.getByTestId("option-indicator")).toContainText("Option 2 of");
    await expect(page.getByTestId("cart-empty-hint")).toBeVisible();
  });

  test("explicit add adds the visible recommendation to cart", async ({ page }) => {
    await page.goto("/desk");
    const browser = await runAgentForMultiProduct(page);
    if (!browser) {
      test.skip(true, "Agent returned a single recommendation for this intent");
      return;
    }

    const firstSku = await browser.locator("[data-active-sku]").getAttribute("data-active-sku");
    await page.getByTestId("next-product").click();
    await expect.poll(async () => browser.locator("[data-active-sku]").getAttribute("data-active-sku")).not.toBe(
      firstSku,
    );

    const activeSku = await browser.locator("[data-active-sku]").getAttribute("data-active-sku");
    const productName = (await browser.getByTestId("product-name").textContent())?.trim() ?? "";
    expect(activeSku).toBeTruthy();
    await browser.getByTestId(`add-to-cart-${activeSku}`).click();
    await expect(page.getByTestId("cart-summary")).toContainText(productName);
  });

  test("multiple products can be added independently", async ({ page }) => {
    await page.goto("/desk");
    const browser = await runAgentForMultiProduct(page);
    if (!browser) {
      test.skip(true, "Agent returned a single recommendation for this intent");
      return;
    }

    const firstSku = await browser.locator("[data-active-sku]").getAttribute("data-active-sku");
    expect(firstSku).toBeTruthy();
    await browser.getByTestId(`add-to-cart-${firstSku}`).click();
    await expect(page.getByTestId("cart-summary").locator("li")).toHaveCount(1);

    await page.getByTestId("next-product").click();
    await expect.poll(async () => browser.locator("[data-active-sku]").getAttribute("data-active-sku")).not.toBe(
      firstSku,
    );
    const secondSku = await browser.locator("[data-active-sku]").getAttribute("data-active-sku");
    expect(secondSku).toBeTruthy();
    await browser.getByTestId(`add-to-cart-${secondSku}`).click();
    await expect(page.getByTestId("cart-summary").locator("li")).toHaveCount(2);
  });

  test("quantity, remove, and totals update in Transaction", async ({ page }) => {
    await page.goto("/desk");
    await runAgentForHalo(page);
    await page.getByTestId("add-to-cart-halo-anc").click();
    await expect(page.getByTestId("cart-summary")).toContainText("Northline Halo ANC");
    await expect(page.getByTestId("cart-subtotal")).toBeVisible();
    await expect(page.getByTestId("checkout-total")).toBeVisible();

    await page.getByTestId("increase-qty-halo-anc").click();
    await expect(page.getByTestId("cart-qty-halo-anc")).toHaveText("2");

    await page.getByTestId("decrease-qty-halo-anc").click();
    await expect(page.getByTestId("cart-qty-halo-anc")).toHaveText("1");

    await page.getByTestId("remove-halo-anc").click();
    await expect(page.getByTestId("cart-empty-hint")).toBeVisible();
    await expect(page.getByTestId("checkout-total")).toHaveCount(0);
    await expect(page.getByTestId("authorize")).toBeDisabled();
  });

  test("mobile desk cart has touch targets without horizontal overflow", async ({ page }) => {
    test.skip(!test.info().project.use.isMobile, "Mobile project only");

    await page.goto("/desk");
    await runAgentForHalo(page);
    await page.getByTestId("add-to-cart-halo-anc").click();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);

    await expect(page.getByTestId("increase-qty-halo-anc")).toBeVisible();
    await expect(page.getByTestId("remove-halo-anc")).toBeVisible();
    await expect(page.getByTestId("authorize")).toBeVisible();
  });
});
