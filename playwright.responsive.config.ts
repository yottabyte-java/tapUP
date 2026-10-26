import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:3101";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "responsive-layout.pw.ts",
  fullyParallel: false,
  reporter: "list",
  outputDir: "test-results",
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "off",
  },
  webServer: {
    // WHY: Dummy loopback-only credentials keep this isolated layout check off real Supabase data.
    command: "node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3101",
    url: `${baseURL}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      TAPUP_E2E: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "responsive-test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "responsive-test-service-role-key",
      LENDER_API_KEY: "responsive-test-lender-key",
    },
  },
});
