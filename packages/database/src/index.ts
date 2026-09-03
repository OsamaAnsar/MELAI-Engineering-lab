import { z } from "zod";

export const PACKAGE_NAME = "@melai/database";

const DatabaseUrlSchema = z
  .string()
  .url()
  .refine((u) => u.startsWith("postgres://") || u.startsWith("postgresql://"), {
    message: "DATABASE_URL must be a postgres:// connection string",
  });

/** Reads and validates DATABASE_URL. The Drizzle client + schema land in Milestone 1, task 2. */
export function getDatabaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  return DatabaseUrlSchema.parse(source.DATABASE_URL);
}
