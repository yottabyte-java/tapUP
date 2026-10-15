import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // WHY: Keep the requested test command green until the planned test files arrive.
    passWithNoTests: true,
  },
});
