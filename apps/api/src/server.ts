import { createDatabase, createPgliteDatabase } from "@melai/database";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { makeProviderRegistry } from "./providers.js";

async function main(): Promise<void> {
  const env = loadEnv();

  const { db } =
    env.DB_DRIVER === "pglite"
      ? await createPgliteDatabase()
      : (() => {
          if (!env.DATABASE_URL) {
            throw new Error("DATABASE_URL is required with DB_DRIVER=postgres (see .env.example).");
          }
          return createDatabase(env.DATABASE_URL);
        })();

  const registry = makeProviderRegistry(env);
  const app = await buildApp({ db, registry });
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  app.log.info(`db driver: ${env.DB_DRIVER}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
