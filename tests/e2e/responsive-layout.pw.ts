import { expect, test } from "@playwright/test";

const viewports = [390, 768, 1280, 1600];

test("login and signup layouts fit mobile, tablet, and desktop viewports", async ({ page }) => {
  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();

    const layout = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      const main = document.querySelector<HTMLElement>(".app-content > main");
      const panel = document.querySelector<HTMLElement>(".auth-panel");
      if (!shell || !main || !panel) throw new Error("Expected shared app and auth layout elements");
      return {
        documentWidth: document.documentElement.scrollWidth,
        shellWidth: shell.getBoundingClientRect().width,
        mainWidth: main.getBoundingClientRect().width,
        panelWidth: panel.getBoundingClientRect().width,
      };
    });

    expect(layout.documentWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(width);
    expect(layout.shellWidth).toBe(Math.min(width, 1440));
    expect(layout.mainWidth).toBe(Math.min(width, 1280));
    if (width >= 768) expect(layout.panelWidth).toBeLessThanOrEqual(576);

    // WHY: The shop dashboards need responsive layouts even though this test runs without an Auth database.
    const dashboardLayout = await page.evaluate(() => {
      const content = document.querySelector<HTMLElement>(".app-content");
      if (!content) throw new Error("Expected shared app content");
      const host = document.createElement("main");
      const sale = document.createElement("div");
      sale.className = "sale-workspace";
      const basket = document.createElement("div");
      basket.className = "sale-basket";
      sale.append(document.createElement("div"), document.createElement("div"), basket);
      const customers = document.createElement("div");
      customers.className = "grid grid-cols-1 gap-2 lg:grid-cols-2";
      const buyingPower = document.createElement("div");
      buyingPower.className = "grid grid-cols-1 gap-4 xl:grid-cols-2";
      host.append(sale, customers, buyingPower);
      content.append(host);
      const columns = (element: HTMLElement) => getComputedStyle(element).gridTemplateColumns
        .trim().split(/\s+/).filter(Boolean).length;
      const result = {
        saleColumns: getComputedStyle(sale).display === "grid" ? columns(sale) : 1,
        basketArea: getComputedStyle(basket).gridArea,
        customerColumns: columns(customers),
        buyingPowerColumns: columns(buyingPower),
        documentWidth: document.documentElement.scrollWidth,
      };
      host.remove();
      return result;
    });
    expect(dashboardLayout.saleColumns).toBe(width >= 1024 ? 2 : 1);
    expect(dashboardLayout.basketArea).toBe(width >= 1024 ? "basket" : "auto");
    expect(dashboardLayout.customerColumns).toBe(width >= 1024 ? 2 : 1);
    expect(dashboardLayout.buyingPowerColumns).toBe(width >= 1280 ? 2 : 1);
    expect(dashboardLayout.documentWidth, `dashboard layout overflow at ${width}px`).toBeLessThanOrEqual(width);

    await page.goto("/signup?step=details&role=customer");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeVisible();
    const signupOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(signupOverflow, `signup overflows horizontally at ${width}px`).toBe(false);
  }
});
