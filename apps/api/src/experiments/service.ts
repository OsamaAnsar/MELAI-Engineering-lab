import { estimateCost, parseModelPricing, type ChatMessage } from "@melai/ai-core";
import {
  desc,
  eq,
  experimentRuns,
  experiments,
  inArray,
  models,
  promptVersions,
  providers,
  type Database,
  type RunRequestSnapshot,
} from "@melai/database";
import {
  resolveTemplate,
  MissingTemplateVariableError,
  type ExperimentDetail,
  type ExperimentSpec,
  type ExperimentSummary,
} from "@melai/shared";
import type { ExperimentEvents } from "./events.js";
import type { ProviderRegistry } from "../providers.js";
import { BadRequestError, NotFoundError } from "../errors.js";

export interface ExperimentDeps {
  db: Database;
  registry: ProviderRegistry;
  events: ExperimentEvents;
}

export { NotFoundError, BadRequestError };

type ModelRow = typeof models.$inferSelect & { providerName: string };

export interface RunPlan {
  experimentId: string;
  messages: ChatMessage[];
  config: ExperimentSpec["config"];
  runs: { runId: string; model: ModelRow }[];
}

async function loadModels(db: Database, ids: string[]): Promise<ModelRow[]> {
  return db
    .select({
      id: models.id,
      providerId: models.providerId,
      name: models.name,
      displayName: models.displayName,
      contextLength: models.contextLength,
      inputPricePerMtok: models.inputPricePerMtok,
      outputPricePerMtok: models.outputPricePerMtok,
      cachedInputPricePerMtok: models.cachedInputPricePerMtok,
      active: models.active,
      createdAt: models.createdAt,
      providerName: providers.name,
    })
    .from(models)
    .innerJoin(providers, eq(models.providerId, providers.id))
    .where(inArray(models.id, ids));
}

async function buildMessages(
  db: Database,
  promptVersionId: string,
  inputVariables: Record<string, string>,
): Promise<ChatMessage[]> {
  const pv = await db.query.promptVersions.findFirst({
    where: eq(promptVersions.id, promptVersionId),
  });
  if (!pv) throw new NotFoundError(`Prompt version ${promptVersionId} not found`);

  try {
    return [{ role: "user", content: resolveTemplate(pv.template, inputVariables) }];
  } catch (err) {
    if (err instanceof MissingTemplateVariableError) throw new BadRequestError(err.message);
    throw err;
  }
}

async function executeRun(
  deps: ExperimentDeps,
  experimentId: string,
  runId: string,
  model: ModelRow,
  messages: ChatMessage[],
  config: ExperimentSpec["config"],
): Promise<void> {
  deps.events.emit({ type: "run.started", experimentId, runId, modelId: model.id });

  const startedAt = new Date();
  const request: RunRequestSnapshot = {
    model: model.name,
    messages,
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
  };

  const provider = deps.registry.get(model.providerName);
  if (!provider) {
    await deps.db
      .update(experimentRuns)
      .set({
        status: "error",
        request,
        error: {
          name: "NoProviderError",
          message: `No credentials configured for provider "${model.providerName}"`,
        },
        startedAt,
        finishedAt: new Date(),
      })
      .where(eq(experimentRuns.id, runId));
    deps.events.emit({ type: "run.completed", experimentId, runId, status: "error" });
    return;
  }

  try {
    const result = await provider.generate({
      model: model.name,
      messages,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
    });

    const pricing = parseModelPricing({
      inputPerMTok: model.inputPricePerMtok,
      outputPerMTok: model.outputPricePerMtok,
      cachedInputPerMTok: model.cachedInputPricePerMtok,
    });
    const cost = pricing ? estimateCost(result.usage, pricing) : undefined;

    await deps.db
      .update(experimentRuns)
      .set({
        status: "success",
        request,
        responseText: result.text,
        finishReason: result.finishReason ?? null,
        inputTokens: result.usage.inputTokens ?? null,
        outputTokens: result.usage.outputTokens ?? null,
        cachedTokens: result.usage.cachedInputTokens ?? null,
        latencyMs: result.latencyMs,
        estimatedCostUsd: cost !== undefined ? cost.toFixed(6) : null,
        pricingSnapshot: pricing as unknown as Record<string, unknown> | null,
        rawMetadata: { providerMetrics: result.providerMetrics ?? null, raw: result.raw ?? null },
        startedAt,
        finishedAt: new Date(),
      })
      .where(eq(experimentRuns.id, runId));
    deps.events.emit({ type: "run.completed", experimentId, runId, status: "success" });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    await deps.db
      .update(experimentRuns)
      .set({
        status: "error",
        request,
        error: { name: e.name, message: e.message },
        startedAt,
        finishedAt: new Date(),
      })
      .where(eq(experimentRuns.id, runId));
    deps.events.emit({ type: "run.completed", experimentId, runId, status: "error" });
  }
}

/** Inserts the experiment + one pending run per model. Does NOT execute anything. */
export async function createExperiment(
  deps: ExperimentDeps,
  spec: ExperimentSpec,
): Promise<{ id: string; plan: RunPlan }> {
  const messages = await buildMessages(deps.db, spec.promptVersionId, spec.inputVariables);

  const modelRows = await loadModels(deps.db, spec.modelIds);
  const missing = spec.modelIds.filter((id) => !modelRows.some((m) => m.id === id));
  if (missing.length > 0) throw new BadRequestError(`Unknown model id(s): ${missing.join(", ")}`);

  const [experiment] = await deps.db
    .insert(experiments)
    .values({
      name: spec.name,
      promptVersionId: spec.promptVersionId,
      inputVariables: spec.inputVariables,
      config: spec.config,
    })
    .returning({ id: experiments.id });
  if (!experiment) throw new Error("Failed to create experiment");

  const runRows = await deps.db
    .insert(experimentRuns)
    .values(modelRows.map((m) => ({ experimentId: experiment.id, modelId: m.id })))
    .returning({ id: experimentRuns.id, modelId: experimentRuns.modelId });

  const runs = runRows.flatMap((r) => {
    const model = modelRows.find((m) => m.id === r.modelId);
    return model ? [{ runId: r.id, model }] : [];
  });

  return {
    id: experiment.id,
    plan: { experimentId: experiment.id, messages, config: spec.config, runs },
  };
}

/** Executes every run in the plan concurrently, then emits `experiment.done`. */
export async function runExperiment(deps: ExperimentDeps, plan: RunPlan): Promise<void> {
  await Promise.allSettled(
    plan.runs.map((r) =>
      executeRun(deps, plan.experimentId, r.runId, r.model, plan.messages, plan.config),
    ),
  );
  deps.events.emit({ type: "experiment.done", experimentId: plan.experimentId });
}

export async function getExperiment(
  deps: ExperimentDeps,
  id: string,
): Promise<ExperimentDetail | null> {
  const experiment = await deps.db.query.experiments.findFirst({
    where: eq(experiments.id, id),
    with: {
      promptVersion: { with: { prompt: true } },
      runs: { with: { model: { with: { provider: true } } } },
    },
  });
  if (!experiment) return null;

  return {
    id: experiment.id,
    name: experiment.name,
    createdAt: experiment.createdAt.toISOString(),
    inputVariables: experiment.inputVariables,
    config: experiment.config,
    prompt: {
      name: experiment.promptVersion.prompt.name,
      version: experiment.promptVersion.version,
      template: experiment.promptVersion.template,
    },
    runs: experiment.runs.map((run) => {
      const rawMeta = run.rawMetadata;
      return {
        id: run.id,
        status: run.status,
        model: {
          id: run.model.id,
          name: run.model.name,
          displayName: run.model.displayName,
          provider: run.model.provider.name,
          providerKind: run.model.provider.kind,
        },
        responseText: run.responseText,
        finishReason: run.finishReason,
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
        cachedTokens: run.cachedTokens,
        latencyMs: run.latencyMs,
        // numeric columns are strings on postgres-js, numbers on pglite — normalize.
        estimatedCostUsd: run.estimatedCostUsd != null ? Number(run.estimatedCostUsd) : null,
        pricingSnapshot: run.pricingSnapshot,
        providerMetrics:
          rawMeta && typeof rawMeta === "object" && "providerMetrics" in rawMeta
            ? (rawMeta.providerMetrics as Record<string, number> | null)
            : null,
        raw: rawMeta && typeof rawMeta === "object" && "raw" in rawMeta ? rawMeta.raw : null,
        error: run.error,
        startedAt: run.startedAt ? run.startedAt.toISOString() : null,
        finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
      };
    }),
    pending: experiment.runs.some((r) => r.status === "pending" || r.status === "running"),
  };
}

export async function listExperiments(
  deps: ExperimentDeps,
  limit = 50,
): Promise<ExperimentSummary[]> {
  const rows = await deps.db.query.experiments.findMany({
    orderBy: desc(experiments.createdAt),
    limit,
    with: { runs: { columns: { status: true } } },
  });
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    createdAt: e.createdAt.toISOString(),
    total: e.runs.length,
    succeeded: e.runs.filter((r) => r.status === "success").length,
    failed: e.runs.filter((r) => r.status === "error").length,
    pending: e.runs.filter((r) => r.status === "pending" || r.status === "running").length,
  }));
}

/** Builds the spec for re-running an experiment, or null if it doesn't exist. */
export async function prepareRerun(
  deps: ExperimentDeps,
  id: string,
): Promise<ExperimentSpec | null> {
  const experiment = await deps.db.query.experiments.findFirst({
    where: eq(experiments.id, id),
    with: { runs: { columns: { modelId: true } } },
  });
  if (!experiment) return null;

  return {
    name: `${experiment.name} (rerun)`,
    promptVersionId: experiment.promptVersionId,
    inputVariables: experiment.inputVariables,
    config: experiment.config,
    modelIds: [...new Set(experiment.runs.map((r) => r.modelId))],
  };
}
