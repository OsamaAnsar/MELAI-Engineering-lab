import { configDefaults, defineConfig } from "vitest/config";

// The e2e/ specs run under Playwright, not Vitest.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
