import { chromium, type Browser, type FullConfig } from "@playwright/test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provision } from "./localSupabase";

export default async function setup(config: FullConfig) {
  if (config.workers !== 1) throw new Error("This isolated financial fixture requires one Playwright worker");
  process.umask(0o077);
  const directory = mkdtempSync(join(tmpdir(), "tapup-browser-"));
  const accounts = await provision();
  let browser: Browser | undefined;
  try {
    browser = process.env.TAPUP_E2E_CDP_URL
      ? await chromium.connectOverCDP(process.env.TAPUP_E2E_CDP_URL)
      : await chromium.launch({ headless: config.projects[0].use.headless ?? true });
    const sessions = [];
    for (const account of [accounts.owner, accounts.customer, accounts.stranger]) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        // WHY: Authenticate once per run, even after failures restart a worker. Keep passwords out of recorded traces.
        await page.goto("http://127.0.0.1:3100/login");
        await page.getByLabel("Email address").fill(account.email);
        await page.getByLabel("Password", { exact: true }).fill(account.password);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        try { await page.waitForURL(account === accounts.owner ? "**/shop/sell" : "**/me", { timeout: 15_000 }); }
        catch { throw new Error("Real browser login failed; inspect local app health and sign-in rate-limit window. No credentials recorded."); }
        sessions.push(await context.storageState());
      } finally { await context.close(); }
    }
    const file = join(directory, "sessions.json");
    writeFileSync(file, JSON.stringify({ accounts: {
      owner: { id: accounts.owner.id }, customer: { id: accounts.customer.id }, stranger: { id: accounts.stranger.id },
      shopId: accounts.shopId, customerId: accounts.customerId,
    }, sessions }), { mode: 0o600 });
    process.env.TAPUP_E2E_FIXTURE_FILE = file;
  } catch (error) {
    await accounts.cleanup(); rmSync(directory, { recursive: true }); throw error;
  } finally { await browser?.close(); }
  return async () => { try { await accounts.cleanup(); } finally { rmSync(directory, { recursive: true }); } };
}
