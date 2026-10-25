import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { checked, localAdmin, type Accounts } from "./localSupabase";
export { checked } from "./localSupabase";
import type jsQR from "jsqr";
import { products } from "../lib/products";

export const product = products[0];
const origin = "http://127.0.0.1:3100";
export type World = Accounts & { ownerPage: Page; customerPage: Page; strangerPage: Page; expectedProblems: RegExp[]; problems: string[] };

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export const test = base.extend<{ world: World }, { accounts: Accounts; sessions: StorageState[] }>({
  browser: [async ({ playwright, headless, launchOptions }, provide) => {
    const browser = process.env.TAPUP_E2E_CDP_URL
      ? await playwright.chromium.connectOverCDP(process.env.TAPUP_E2E_CDP_URL)
      : await playwright.chromium.launch({ ...launchOptions, headless });
    try { await provide(browser); } finally { await browser.close(); }
  }, { scope: "worker" }],
  accounts: [async ({}, provide) => {
    const state = JSON.parse(readFileSync(process.env.TAPUP_E2E_FIXTURE_FILE!, "utf8"));
    await provide({ ...state.accounts, admin: localAdmin() });
  }, { scope: "worker" }],
  sessions: [async ({}, provide) => {
    const state = JSON.parse(readFileSync(process.env.TAPUP_E2E_FIXTURE_FILE!, "utf8"));
    await provide(state.sessions);
  }, { scope: "worker" }],
  world: async ({ browser, accounts, sessions }, provide, info) => {
    // WHY: Reset only this worker's newly created synthetic shop, so each test starts independently.
    // Auth sessions are reused from real UI logins to avoid testing the login rate limit accidentally.
    await checked(await accounts.admin.from("sales").delete().eq("shop_id", accounts.shopId));
    await checked(await accounts.admin.from("shop_customers").update({ credit_limit_cents: 0 }).eq("id", accounts.customerId));
    const pages: Page[] = [];
    const problems: string[] = [];
    const observations: string[] = [];
    const networkChecks: Promise<void>[] = [];
    let closing = false;
    const expectedProblems: RegExp[] = [];
    const contexts: BrowserContext[] = [];
    for (const [index, session] of sessions.entries()) {
      const context = await browser.newContext({ storageState: session,
        viewport: info.project.use.viewport, isMobile: info.project.use.isMobile, hasTouch: info.project.use.hasTouch,
        ...(!process.env.TAPUP_E2E_CDP_URL ? { recordVideo: { dir: info.outputPath(`video-${index}`) } } : {}) });
      contexts.push(context);
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      const page = await context.newPage();
      page.on("pageerror", (error) => problems.push(`Uncaught page exception: ${error.message.replace(/https?:\/\/\S+/g, "[URL]")}`));
      page.on("console", (message) => { if (["error", "warning"].includes(message.type())) problems.push(`Browser ${message.type()}: ${message.text().replace(/https?:\/\/\S+/g, "[URL]")}`); });
      page.on("requestfailed", (request) => { networkChecks.push((async () => {
        const path = new URL(request.url()).pathname.replace(/\/pay\/[^/]+/, "/pay/[token]");
        const message = `Failed request: ${request.method()} ${path} ${request.failure()?.errorText}`;
        const response = await request.response();
        // WHY: Next's completed HTTP200 Flight streams may be cancelled by navigation/teardown.
        // Keep these observations, while actual transport failures without a response still fail the test.
        if (request.failure()?.errorText === "net::ERR_ABORTED" && (closing || response?.ok())) {
          observations.push(`${closing ? "Teardown" : "Completed HTTP200 action"}: ${message}`);
        } else problems.push(message);
      })()); });
      page.on("response", (response) => { if (response.status() >= 400) problems.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
      pages.push(page);
    }
    const world = { ...accounts, ownerPage: pages[0], customerPage: pages[1], strangerPage: pages[2], expectedProblems, problems };
    try { await provide(world); } finally {
      closing = true;
      for (const [i, context] of contexts.entries()) {
        if (info.status !== info.expectedStatus) await pages[i].screenshot({ path: info.outputPath(`failure-${i}.png`), fullPage: true });
        const trace = info.outputPath(`trace-${i}.zip`);
        await context.tracing.stop({ path: trace });
        await info.attach(`trace-${i}`, { path: trace, contentType: "application/zip" });
        const video = pages[i].video();
        await context.close();
        if (video) {
          if (info.status !== info.expectedStatus) await info.attach(`failure-video-${i}`, { path: await video.path(), contentType: "video/webm" });
          else await video.delete();
        }
      }
      for (const file of readdirSync(info.outputDir).filter((name) => /^(owner-dashboard|customer-buying-power|repayment-).*\.png$/.test(name))) {
        await info.attach(file, { path: info.outputPath(file), contentType: "image/png" });
      }
      await Promise.all(networkChecks);
      await info.attach("browser-diagnostics", { body: JSON.stringify({ problems, observations }, null, 2), contentType: "application/json" });
      expect(problems.filter((problem) => !expectedProblems.some((pattern) => pattern.test(problem))), "Unexpected browser errors/warnings/network failures").toEqual([]);
    }
  },
});
export { expect };

export async function newSale(world: World, qty = 1) {
  const page = world.ownerPage;
  await page.goto(`${origin}/shop/sell`);
  await expect(page.getByRole("heading", { name: "Browser Demo Shop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Charge customer", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: `Add ${product.name} to sale`, exact: true }).click();
  await expect(page.getByRole("button", { name: `Decrease ${product.name} quantity`, exact: true })).toBeDisabled();
  for (let i = 1; i < qty; i++) await page.getByRole("button", { name: `Increase ${product.name} quantity`, exact: true }).click();
  await page.getByRole("button", { name: "Charge customer", exact: true }).click();
  const qr = page.getByLabel("QR code for customer payment");
  await expect(qr).toBeVisible();
  const image = await qr.locator("..").screenshot();
  // WHY: Decode the actual screenshot, rather than reading React state or a database token.
  // The scanner bundled with html5-qrcode rejects some valid images; jsQR independently verifies these pixels.
  const decoder = await page.context().newPage();
  await decoder.goto("about:blank");
  await decoder.addScriptTag({ path: "node_modules/jsqr/dist/jsQR.js" });
  const url = await decoder.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return (window as unknown as { jsQR: typeof jsQR }).jsQR(pixels.data, pixels.width, pixels.height)?.data ?? null;
  }, image.toString("base64"));
  await decoder.close();
  if (!url) throw new Error("The displayed payment QR could not be decoded");
  expect(new URL(url).origin).toBe(origin);
  const rows = await checked(await world.admin.from("sales").select("id,total_cents,status").eq("shop_id", world.shopId).order("created_at", { ascending: false }).limit(1));
  expect(rows[0].total_cents).toBe(product.priceCents * qty);
  expect(rows[0].status).toBe("pending");
  return { id: rows[0].id as string, url, total: product.priceCents * qty };
}

export async function saleState(world: World, id: string) {
  return checked(await world.admin.from("sales").select("id,status,total_cents,tab_cents,paid_now_cents,paid_now_confirmed_at,shop_customer_id").eq("id", id).single());
}

export async function choosePayment(world: World, url: string, method: "Cash" | "Demo card / wallet") {
  // WHY: Chromium may cancel the form's Flight request on Next's redirect. Accept only this
  // navigation cancellation, with the /me destination and persisted financial state asserted by the caller.
  world.expectedProblems.push(/^Failed request: POST \/pay\/\[token\] net::ERR_ABORTED$/);
  await world.customerPage.goto(url);
  await world.customerPage.getByRole("button", { name: method, exact: true }).click();
  await expect(world.customerPage).toHaveURL(/\/me$/);
}
