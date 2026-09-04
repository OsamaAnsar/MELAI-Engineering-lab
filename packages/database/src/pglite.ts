import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database, DatabaseHandle } from "./client.js";
import { schema } from "./schema.js";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
const defaultDataDir = fileURLToPath(new URL("../.pglite", import.meta.url));

/**
 * A zero-Docker database: an in-process PGlite instance with migrations applied,
 * persisted under `packages/database/.pglite` (override with `dataDir`). Pass
 * `"memory://"` for an ephemeral database.
 *
 * PGlite and postgres-js Drizzle clients share an API over the same SQL dialect,
 * so the returned handle is typed as the production {@link Database}.
 */
export async function createPgliteDatabase(
  dataDir: string = defaultDataDir,
): Promise<DatabaseHandle> {
  const pg = new PGlite(dataDir, { extensions: { vector } });
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder });
  return {
    db: db as unknown as Database,
    close: () => pg.close(),
  };
}
