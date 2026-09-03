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
} from "drizzle-orm/pg-core";

export const providerKind = pgEnum("provider_kind", ["cloud", "local"]);
export const runStatus = pgEnum("run_status", ["pending", "running", "success", "error"]);

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

export const providersRelations = relations(providers, ({ many }) => ({
  models: many(models),
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

export const schema = {
  providers,
  models,
  prompts,
  promptVersions,
  experiments,
  experimentRuns,
  providersRelations,
  modelsRelations,
  promptsRelations,
  promptVersionsRelations,
  experimentsRelations,
  experimentRunsRelations,
};
