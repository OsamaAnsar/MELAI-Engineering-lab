import { createDatabase } from "@melai/database";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { makeProviderRegistry } from "./providers.js";

async function main(): Promise<void> {
  const env = loadEnv();

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start the API (see .env.example).");
  }

  const { db } = createDatabase(env.DATABASE_URL);
  const registry = makeProviderRegistry(env);

  const app = await buildApp({ db, registry });
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
