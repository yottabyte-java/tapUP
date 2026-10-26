import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // WHY: Serialize Docker-backed PostgreSQL suites so their temporary databases and lock-wait assertions do not contend.
    maxWorkers: 1,
    // WHY: Browser tests run in Playwright against real Auth/PostgREST, not the unit runner.
    exclude: [...configDefaults.exclude, "e2e/**"],
    // WHY: Keep the requested test command green until the planned test files arrive.
    passWithNoTests: true,
  },
});
