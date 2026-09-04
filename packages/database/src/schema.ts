import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const providerKind = pgEnum("provider_kind", ["cloud", "local"]);
export const runStatus = pgEnum("run_status", ["pending", "running", "success", "error"]);
export const chunkingStrategy = pgEnum("chunking_strategy", ["fixed", "sentence"]);
export const retrievalMethod = pgEnum("retrieval_method", ["bm25", "vector", "hybrid_rrf"]);

/**
 * Fixed width for the `embeddings.vector` column. Ollama's `nomic-embed-text`
 * (the zero-cost local path) natively outputs 768 dimensions; OpenAI's
 * `text-embedding-3-small` supports a `dimensions` request parameter that
 * truncates its native 1536 down to any smaller size via Matryoshka
 * representation learning. Standardizing on 768 lets both providers write
 * into the same pgvector column. Mixing embedding models of different native
 * dimensions is a known M2 limitation, not supported.
 */
export const EMBEDDING_DIMENSIONS = 768;

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** A model backend family: anthropic, openai, ollama, ... */
export const providers = pgTable("providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  kind: providerKind("kind").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt,
});

/** A concrete model, with its list pricing (per 1M tokens; null = unknown). */
export const models = pgTable(
  "models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    contextLength: integer("context_length"),
    inputPricePerMtok: numeric("input_price_per_mtok", { precision: 12, scale: 6 }),
    outputPricePerMtok: numeric("output_price_per_mtok", { precision: 12, scale: 6 }),
    cachedInputPricePerMtok: numeric("cached_input_price_per_mtok", { precision: 12, scale: 6 }),
    active: boolean("active").notNull().default(true),
    createdAt,
  },
  (t) => [unique("models_provider_name_uq").on(t.providerId, t.name)],
);

export const prompts = pgTable("prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt,
});

/** Immutable: editing a prompt creates a new version row. */
export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    template: text("template").notNull(),
    variables: jsonb("variables").$type<string[]>().notNull().default([]),
    createdAt,
  },
  (t) => [unique("prompt_versions_prompt_version_uq").on(t.promptId, t.version)],
);

/** A prompt version + resolved inputs + config, run against a set of models. */
export const experiments = pgTable("experiments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  promptVersionId: uuid("prompt_version_id")
    .notNull()
    .references(() => promptVersions.id),
  inputVariables: jsonb("input_variables").$type<Record<string, string>>().notNull().default({}),
  config: jsonb("config").$type<{ temperature: number; maxOutputTokens: number }>().notNull(),
  createdAt,
});

export interface RunRequestSnapshot {
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
  maxOutputTokens?: number;
}

export interface RunError {
  name: string;
  message: string;
}

/** One (experiment, model) execution. Stores everything needed to reproduce and to recompute cost. */
export const experimentRuns = pgTable(
  "experiment_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id),
    status: runStatus("status").notNull().default("pending"),
    request: jsonb("request").$type<RunRequestSnapshot>(),
    responseText: text("response_text"),
    finishReason: text("finish_reason"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cachedTokens: integer("cached_tokens"),
    latencyMs: integer("latency_ms"),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }),
    pricingSnapshot: jsonb("pricing_snapshot").$type<Record<string, unknown>>(),
    error: jsonb("error").$type<RunError>(),
    rawMetadata: jsonb("raw_metadata").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [index("experiment_runs_experiment_id_idx").on(t.experimentId)],
);

/** A text corpus, pasted or uploaded, that chunking/retrieval configs run over. */
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  createdAt,
});

/** A named chunking strategy + params (e.g. fixed size 512 / overlap 64). */
export const chunkingConfigs = pgTable("chunking_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  strategy: chunkingStrategy("strategy").notNull(),
  params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
  createdAt,
});

/** One (document, chunkingConfig) run's output. Computed once, cached. */
export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkingConfigId: uuid("chunking_config_id")
      .notNull()
      .references(() => chunkingConfigs.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull(),
    createdAt,
  },
  (t) => [
    unique("chunks_document_config_index_uq").on(t.documentId, t.chunkingConfigId, t.index),
    index("chunks_document_config_idx").on(t.documentId, t.chunkingConfigId),
  ],
);

/** An embedding-capable model. Pricing is a single per-token rate (no input/output split). */
export const embeddingModels = pgTable(
  "embedding_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    dimensions: integer("dimensions").notNull(),
    pricePerMtok: numeric("price_per_mtok", { precision: 12, scale: 6 }),
    active: boolean("active").notNull().default(true),
    createdAt,
  },
  (t) => [unique("embedding_models_provider_name_uq").on(t.providerId, t.name)],
);

/** One (chunk, embeddingModel) vector. */
export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => chunks.id, { onDelete: "cascade" }),
    embeddingModelId: uuid("embedding_model_id")
      .notNull()
      .references(() => embeddingModels.id, { onDelete: "cascade" }),
    vector: vector("vector", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt,
  },
  (t) => [
    unique("embeddings_chunk_model_uq").on(t.chunkId, t.embeddingModelId),
    index("embeddings_chunk_id_idx").on(t.chunkId),
  ],
);

/** A named retrieval method (bm25 / vector / hybrid_rrf) + params. */
export const retrievalConfigs = pgTable("retrieval_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  method: retrievalMethod("method").notNull(),
  params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
  createdAt,
});

/** One query, scoped to a document's chunk set, run against a set of retrieval configs. */
export const retrievalRuns = pgTable("retrieval_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  query: text("query").notNull(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  chunkingConfigId: uuid("chunking_config_id")
    .notNull()
    .references(() => chunkingConfigs.id),
  topK: integer("top_k").notNull().default(5),
  createdAt,
});

/** One ranked candidate in a retrieval result, with the per-method score breakdown for hybrid. */
export interface RetrievalCandidate {
  chunkId: string;
  score: number;
  bm25Rank?: number;
  bm25Score?: number;
  vectorRank?: number;
  vectorScore?: number;
}

/** One (retrievalRun, retrievalConfig) execution. Mirrors experiment_runs. */
export const retrievalRunResults = pgTable(
  "retrieval_run_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    retrievalRunId: uuid("retrieval_run_id")
      .notNull()
      .references(() => retrievalRuns.id, { onDelete: "cascade" }),
    retrievalConfigId: uuid("retrieval_config_id")
      .notNull()
      .references(() => retrievalConfigs.id),
    status: runStatus("status").notNull().default("pending"),
    results: jsonb("results").$type<RetrievalCandidate[]>(),
    latencyMs: integer("latency_ms"),
    error: jsonb("error").$type<RunError>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [index("retrieval_run_results_run_id_idx").on(t.retrievalRunId)],
);

export const providersRelations = relations(providers, ({ many }) => ({
  models: many(models),
  embeddingModels: many(embeddingModels),
}));

export const modelsRelations = relations(models, ({ one, many }) => ({
  provider: one(providers, { fields: [models.providerId], references: [providers.id] }),
  runs: many(experimentRuns),
}));

export const promptsRelations = relations(prompts, ({ many }) => ({
  versions: many(promptVersions),
}));

export const promptVersionsRelations = relations(promptVersions, ({ one, many }) => ({
  prompt: one(prompts, { fields: [promptVersions.promptId], references: [prompts.id] }),
  experiments: many(experiments),
}));

export const experimentsRelations = relations(experiments, ({ one, many }) => ({
  promptVersion: one(promptVersions, {
    fields: [experiments.promptVersionId],
    references: [promptVersions.id],
  }),
  runs: many(experimentRuns),
}));

export const experimentRunsRelations = relations(experimentRuns, ({ one }) => ({
  experiment: one(experiments, {
    fields: [experimentRuns.experimentId],
    references: [experiments.id],
  }),
  model: one(models, { fields: [experimentRuns.modelId], references: [models.id] }),
}));

export const documentsRelations = relations(documents, ({ many }) => ({
  chunks: many(chunks),
  retrievalRuns: many(retrievalRuns),
}));

export const chunkingConfigsRelations = relations(chunkingConfigs, ({ many }) => ({
  chunks: many(chunks),
  retrievalRuns: many(retrievalRuns),
}));

export const chunksRelations = relations(chunks, ({ one, many }) => ({
  document: one(documents, { fields: [chunks.documentId], references: [documents.id] }),
  chunkingConfig: one(chunkingConfigs, {
    fields: [chunks.chunkingConfigId],
    references: [chunkingConfigs.id],
  }),
  embeddings: many(embeddings),
}));

export const embeddingModelsRelations = relations(embeddingModels, ({ one, many }) => ({
  provider: one(providers, { fields: [embeddingModels.providerId], references: [providers.id] }),
  embeddings: many(embeddings),
}));

export const embeddingsRelations = relations(embeddings, ({ one }) => ({
  chunk: one(chunks, { fields: [embeddings.chunkId], references: [chunks.id] }),
  embeddingModel: one(embeddingModels, {
    fields: [embeddings.embeddingModelId],
    references: [embeddingModels.id],
  }),
}));

export const retrievalConfigsRelations = relations(retrievalConfigs, ({ many }) => ({
  results: many(retrievalRunResults),
}));

export const retrievalRunsRelations = relations(retrievalRuns, ({ one, many }) => ({
  document: one(documents, { fields: [retrievalRuns.documentId], references: [documents.id] }),
  chunkingConfig: one(chunkingConfigs, {
    fields: [retrievalRuns.chunkingConfigId],
    references: [chunkingConfigs.id],
  }),
  results: many(retrievalRunResults),
}));

export const retrievalRunResultsRelations = relations(retrievalRunResults, ({ one }) => ({
  retrievalRun: one(retrievalRuns, {
    fields: [retrievalRunResults.retrievalRunId],
    references: [retrievalRuns.id],
  }),
  retrievalConfig: one(retrievalConfigs, {
    fields: [retrievalRunResults.retrievalConfigId],
    references: [retrievalConfigs.id],
  }),
}));

export const schema = {
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
  providersRelations,
  modelsRelations,
  promptsRelations,
  promptVersionsRelations,
  experimentsRelations,
  experimentRunsRelations,
  documentsRelations,
  chunkingConfigsRelations,
  chunksRelations,
  embeddingModelsRelations,
  embeddingsRelations,
  retrievalConfigsRelations,
  retrievalRunsRelations,
  retrievalRunResultsRelations,
};
