import { defineConfig, devices } from "@playwright/test";

const WEB = "http://localhost:3000";
const API_PORT = 4000;
const WEB_PORT = 3000;

/**
 * End-to-end happy path against the real stack. The API web server seeds an
 * in-process PGlite database before it boots (`db:seed && dev`, one shell so it
 * is sequential — PGlite is single-writer), so the run needs no API keys and no
 * Docker.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @melai/database db:seed && pnpm --filter @melai/api dev",
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      timeout: 90_000,
      env: { DB_DRIVER: "pglite" },
    },
    {
      command: "pnpm --filter @melai/web dev",
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      timeout: 90_000,
    },
  ],
});
