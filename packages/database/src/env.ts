import { z } from "zod";

const DatabaseUrlSchema = z
  .string()
  .url()
  .refine((u) => u.startsWith("postgres://") || u.startsWith("postgresql://"), {
    message: "DATABASE_URL must be a postgres:// connection string",
  });

/** Reads and validates DATABASE_URL from the environment. */
export function getDatabaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  return DatabaseUrlSchema.parse(source.DATABASE_URL);
}
