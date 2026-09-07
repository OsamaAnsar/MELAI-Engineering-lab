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
  datasets,
  datasetCases,
  evalConfigs,
  evalRuns,
  evalCaseResults,
  providerKind,
  runStatus,
  chunkingStrategy,
  retrievalMethod,
  evalTarget,
  EMBEDDING_DIMENSIONS,
  type RunRequestSnapshot,
  type RunError,
  type RetrievalCandidate,
  type ScorerSpec,
  type ScoreValue,
  type EvalSubject,
} from "./schema.js";

export { eq, and, or, desc, asc, sql, inArray, count } from "drizzle-orm";
