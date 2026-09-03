import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { getDatabaseUrl } from "./env.js";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

async function run(): Promise<void> {
  const client = postgres(getDatabaseUrl(), { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });
    console.log("migrations applied");
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
