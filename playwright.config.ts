import { defineConfig } from "@playwright/test";

// WHY: Raw local traces contain test-session cookies. Keep all artifacts private until sanitized.
process.umask(0o077);

export default defineConfig({
  globalSetup: "./e2e/setup.ts",
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: process.env.TAPUP_E2E_OUTPUT_DIR ?? "test-results",
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    screenshot: "only-on-failure",
    // WHY: The fixture records only after login, so traces never capture passwords.
    trace: "off",
    video: "retain-on-failure",
    ...(process.env.TAPUP_E2E_CDP_URL ? {
      // WHY: CDP uses the shared visible Chromium; video is captured by the browser service.
      video: "off",
    } : {}),
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "node scripts/start-e2e.mjs",
    url: "http://127.0.0.1:3100/api/health",
    timeout: 180_000,
    stdout: "pipe",
    reuseExistingServer: process.env.TAPUP_E2E_REUSE_SERVER === "1",
  },
});
