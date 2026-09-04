import { execSync } from "node:child_process";

/** Seeds the PGlite dev database before the e2e run (idempotent upsert). */
export default function globalSetup(): void {
  execSync("pnpm --filter @melai/database db:seed", { stdio: "inherit" });
}
