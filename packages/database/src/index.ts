export const PACKAGE_NAME = "@melai/database";

export { getDatabaseUrl } from "./env.js";
export { createDatabase, type Database, type DatabaseHandle } from "./client.js";
export { createPgliteDatabase } from "./pglite.js";
export {
  schema,
  providers,
  models,
  prompts,
  promptVersions,
  experiments,
  experimentRuns,
  documents,
  chunkingConfigs,
  chunks,
  embeddingModels,
  embeddings,
  retrievalConfigs,
  retrievalRuns,
  retrievalRunResults,
  providerKind,
  runStatus,
  chunkingStrategy,
  retrievalMethod,
  EMBEDDING_DIMENSIONS,
  type RunRequestSnapshot,
  type RunError,
  type RetrievalCandidate,
} from "./schema.js";

export { eq, and, or, desc, asc, sql, inArray } from "drizzle-orm";
