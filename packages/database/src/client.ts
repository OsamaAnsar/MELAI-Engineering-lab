import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema.js";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export interface DatabaseHandle {
  db: Database;
  /** Close the underlying connection pool. */
  close: () => Promise<void>;
}

/** Creates a Drizzle client over a real Postgres connection. */
export function createDatabase(
  connectionString: string,
  options?: { max?: number },
): DatabaseHandle {
  const client = postgres(connectionString, {
    max: options?.max ?? 10,
    // Keeps this compatible with the PGlite-over-socket dev DB; harmless on real Postgres.
    prepare: false,
  });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}
