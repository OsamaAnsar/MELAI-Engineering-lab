import { estimateCost, parseModelPricing, type ChatMessage } from "@melai/ai-core";
import {
  and,
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
import { resolveTemplate, MissingTemplateVariableError, type ExperimentSpec } from "@melai/shared";
import type { ProviderRegistry } from "../providers.js";

export interface ExperimentDeps {
  db: Database;
  registry: ProviderRegistry;
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

type ModelRow = typeof models.$inferSelect & { providerName: string };

async function loadModels(db: Database, ids: string[]): Promise<ModelRow[]> {
  const rows = await db
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
  return rows;
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
    if (err instanceof MissingTemplateVariableError) {
      throw new BadRequestError(err.message);
    }
    throw err;
  }
}

async function executeRun(
  deps: ExperimentDeps,
  runId: string,
  model: ModelRow,
  messages: ChatMessage[],
  config: ExperimentSpec["config"],
): Promise<void> {
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
  }
}

export async function createAndRunExperiment(
  deps: ExperimentDeps,
  spec: ExperimentSpec,
): Promise<{ id: string }> {
  const messages = await buildMessages(deps.db, spec.promptVersionId, spec.inputVariables);

  const modelRows = await loadModels(deps.db, spec.modelIds);
  const missing = spec.modelIds.filter((id) => !modelRows.some((m) => m.id === id));
  if (missing.length > 0) {
    throw new BadRequestError(`Unknown model id(s): ${missing.join(", ")}`);
  }

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

  await Promise.allSettled(
    runRows.map((run) => {
      const model = modelRows.find((m) => m.id === run.modelId);
      if (!model) return Promise.resolve();
      return executeRun(deps, run.id, model, messages, spec.config);
    }),
  );

  return { id: experiment.id };
}

export async function getExperiment(deps: ExperimentDeps, id: string) {
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
    createdAt: experiment.createdAt,
    inputVariables: experiment.inputVariables,
    config: experiment.config,
    prompt: {
      name: experiment.promptVersion.prompt.name,
      version: experiment.promptVersion.version,
      template: experiment.promptVersion.template,
    },
    runs: experiment.runs.map((run) => ({
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
      // numeric columns come back as strings on postgres-js and as numbers on
      // pglite — normalize to a number at the API boundary.
      estimatedCostUsd: run.estimatedCostUsd != null ? Number(run.estimatedCostUsd) : null,
      pricingSnapshot: run.pricingSnapshot,
      providerMetrics:
        run.rawMetadata &&
        typeof run.rawMetadata === "object" &&
        "providerMetrics" in run.rawMetadata
          ? run.rawMetadata.providerMetrics
          : null,
      error: run.error,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    })),
  };
}

export async function listExperiments(deps: ExperimentDeps, limit = 50) {
  const rows = await deps.db.query.experiments.findMany({
    orderBy: desc(experiments.createdAt),
    limit,
    with: { runs: { columns: { status: true } } },
  });
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    createdAt: e.createdAt,
    total: e.runs.length,
    succeeded: e.runs.filter((r) => r.status === "success").length,
    failed: e.runs.filter((r) => r.status === "error").length,
  }));
}

export async function rerunExperiment(
  deps: ExperimentDeps,
  id: string,
): Promise<{ id: string } | null> {
  const experiment = await deps.db.query.experiments.findFirst({
    where: eq(experiments.id, id),
    with: { runs: { columns: { modelId: true } } },
  });
  if (!experiment) return null;

  const modelIds = [...new Set(experiment.runs.map((r) => r.modelId))];

  return createAndRunExperiment(deps, {
    name: `${experiment.name} (rerun)`,
    promptVersionId: experiment.promptVersionId,
    inputVariables: experiment.inputVariables,
    config: experiment.config,
    modelIds,
  });
}

/** Kept exported so a future SSE route can reuse the "still-running?" check. */
export async function experimentExists(deps: ExperimentDeps, id: string): Promise<boolean> {
  const row = await deps.db
    .select({ id: experiments.id })
    .from(experiments)
    .where(and(eq(experiments.id, id)))
    .limit(1);
  return row.length > 0;
}
