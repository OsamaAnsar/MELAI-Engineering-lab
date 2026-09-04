import { defineConfig, devices } from "@playwright/test";

const WEB = "http://localhost:3000";
const API_PORT = 4000;
const WEB_PORT = 3000;

/**
 * End-to-end happy path against the real stack (API + web + in-process PGlite,
 * seeded by global-setup). Uses the built-in `mock` provider, so it needs no
 * API keys and no Docker.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @melai/api dev",
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @melai/web dev",
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      timeout: 60_000,
    },
  ],
});
