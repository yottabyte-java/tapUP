import { expect, test, type Page } from "@playwright/test";

const browserErrors = new Map<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    errors.push(`requestfailed: ${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), "unexpected browser errors or failed requests").toEqual([]);
});

test("welcome screen navigates to the real sign-in form", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The spaza tab, but with a record." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Neighbourhood spaza shop with a tapUP payment QR" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("welcome.png"), fullPage: true });

  await page.getByRole("link", { name: "I already have an account" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveAttribute("required", "");
  await expect(page.getByLabel("Password")).toHaveAttribute("required", "");
  await page.screenshot({ path: testInfo.outputPath("login.png"), fullPage: true });
});

test("shop-owner screens require an authenticated session", async ({ page }) => {
  await page.goto("/shop/sell");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
