import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

// WHY: Raw browser artifacts can contain test-session state, so keep output private until reviewed.
process.umask(0o077);

const outputDir = process.env.TAPUP_E2E_OUTPUT_DIR ?? "test-results";
const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  // WHY: The main user journey suite provisions isolated local Auth accounts and session states.
  globalSetup: "./e2e/setup.ts",
  testDir: ".",
  testMatch: ["e2e/**/*.spec.ts", "tests/e2e/**/*.pw.ts"],
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir,
  reporter: [
    ["list"],
    ["json", { outputFile: resolve(outputDir, "results.json") }],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "only-on-failure",
    // WHY: Keep credentials and authenticated pages out of automatic traces.
    trace: "off",
    video: "retain-on-failure",
    ...(process.env.TAPUP_E2E_CDP_URL ? {
      // WHY: The shared CDP browser owns its video capture and does not support Playwright video output.
      video: "off" as const,
    } : {}),
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    // WHY: The startup script rejects non-loopback Supabase status before building or serving the app.
    command: "node scripts/start-e2e.mjs",
    url: `${baseURL}/api/health`,
    timeout: 180_000,
    stdout: "pipe",
    reuseExistingServer: process.env.TAPUP_E2E_REUSE_SERVER === "1",
    env: {
      TAPUP_E2E: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "playwright-local-only-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "playwright-local-only-service-role-key",
      LENDER_API_KEY: "playwright-local-only-lender-key",
    },
  },
});
