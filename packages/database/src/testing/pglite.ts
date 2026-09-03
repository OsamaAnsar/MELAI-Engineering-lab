import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { schema } from "../schema.js";

const migrationsFolder = fileURLToPath(new URL("../../migrations", import.meta.url));

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

export interface TestDatabaseHandle {
  db: TestDatabase;
  close: () => Promise<void>;
}

/**
 * An in-process Postgres (PGlite, WASM) with all migrations applied.
 * Used by tests so they need no Docker and no running database.
 */
export async function createTestDatabase(): Promise<TestDatabaseHandle> {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder });
  return {
    db,
    close: () => pg.close(),
  };
}
