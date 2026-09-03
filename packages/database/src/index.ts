export const PACKAGE_NAME = "@melai/database";

export { getDatabaseUrl } from "./env.js";
export { createDatabase, type Database, type DatabaseHandle } from "./client.js";
export {
  schema,
  providers,
  models,
  prompts,
  promptVersions,
  experiments,
  experimentRuns,
  providerKind,
  runStatus,
  type RunRequestSnapshot,
  type RunError,
} from "./schema.js";

export { eq, and, or, desc, asc, sql, inArray } from "drizzle-orm";
