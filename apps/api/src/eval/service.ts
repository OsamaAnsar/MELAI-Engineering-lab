import {
  and,
  asc,
  chunks,
  count,
  datasetCases,
  datasets,
  desc,
  documents,
  eq,
  evalCaseResults,
  evalConfigs,
  evalRuns,
  retrievalConfigs,
  type Database,
  type EvalSubject,
  type ScorerSpec,
  type ScoreValue,
} from "@melai/database";
import { hitRate, ndcgAtK, precisionAtK, recallAtK, reciprocalRank } from "@melai/ai-core/eval";
import {
  caseSchemaForTarget,
  type DatasetDetail,
  type DatasetSpec,
  type DatasetSummary,
  type EvalConfigSpec,
  type EvalConfigSummary,
  type EvalRunDetail,
  type EvalRunSpec,
  type EvalRunSummary,
} from "@melai/shared";
import { BadRequestError, NotFoundError } from "../errors.js";
import type { EmbeddingProviderRegistry } from "../embeddings.js";
import { retrieveForQuery } from "../rag/service.js";
import type { EvalEvents } from "./events.js";

export interface EvalDeps {
  db: Database;
  embeddingRegistry: EmbeddingProviderRegistry;
  events: EvalEvents;
}

// --- datasets ---

export async function createDataset(
  deps: Pick<EvalDeps, "db">,
  spec: DatasetSpec,
): Promise<DatasetSummary> {
  const [dataset] = await deps.db
    .insert(datasets)
    .values({ name: spec.name, target: spec.target, description: spec.description ?? null })
    .returning();
  if (!dataset) throw new Error("Failed to create dataset");
  return { ...dataset, caseCount: 0, createdAt: dataset.createdAt.toISOString() };
}

export async function listDatasets(deps: Pick<EvalDeps, "db">): Promise<DatasetSummary[]> {
  const rows = await deps.db
    .select({
      id: datasets.id,
      name: datasets.name,
      target: datasets.target,
      description: datasets.description,
      createdAt: datasets.createdAt,
      caseCount: count(datasetCases.id),
    })
    .from(datasets)
    .leftJoin(datasetCases, eq(datasetCases.datasetId, datasets.id))
    .groupBy(datasets.id)
    .orderBy(desc(datasets.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function getDataset(
  deps: Pick<EvalDeps, "db">,
  id: string,
): Promise<DatasetDetail | null> {
  const dataset = await deps.db.query.datasets.findFirst({
    where: eq(datasets.id, id),
    with: { cases: { orderBy: asc(datasetCases.createdAt) } },
  });
  if (!dataset) return null;
  return {
    id: dataset.id,
    name: dataset.name,
    target: dataset.target,
    description: dataset.description,
    createdAt: dataset.createdAt.toISOString(),
    cases: dataset.cases.map((c) => ({
      id: c.id,
      label: c.label,
      input: c.input,
      expected: c.expected,
    })),
  };
}

/** Validates every case against the dataset target's schema, then inserts. */
export async function addCases(
  deps: Pick<EvalDeps, "db">,
  datasetId: string,
  rawCases: unknown[],
): Promise<DatasetDetail> {
  const dataset = await deps.db.query.datasets.findFirst({ where: eq(datasets.id, datasetId) });
  if (!dataset) throw new NotFoundError(`Dataset ${datasetId} not found`);

  const schema = caseSchemaForTarget(dataset.target);
  const parsed = rawCases.map((c, i) => {
    const result = schema.safeParse(c);
    if (!result.success) {
      throw new BadRequestError(`Case ${i} is invalid for a ${dataset.target} dataset`);
    }
    return result.data;
  });

  await deps.db.insert(datasetCases).values(
    parsed.map((c) => ({
      datasetId,
      label: c.label ?? null,
      input: c.input,
      expected: c.expected,
    })),
  );

  const detail = await getDataset(deps, datasetId);
  if (!detail) throw new Error("Dataset vanished after inserting cases");
  return detail;
}

// --- eval configs ---

export async function createEvalConfig(
  deps: Pick<EvalDeps, "db">,
  spec: EvalConfigSpec,
): Promise<EvalConfigSummary> {
  const [config] = await deps.db
    .insert(evalConfigs)
    .values({ name: spec.name, target: spec.target, scorers: spec.scorers })
    .returning();
  if (!config) throw new Error("Failed to create eval config");
  return {
    id: config.id,
    name: config.name,
    target: config.target,
    scorers: config.scorers.map((s) => ({ kind: s.kind, params: s.params ?? {} })),
    judgeModel: null,
  };
}

export async function listEvalConfigs(deps: Pick<EvalDeps, "db">): Promise<EvalConfigSummary[]> {
  const rows = await deps.db.query.evalConfigs.findMany({
    orderBy: desc(evalConfigs.createdAt),
    with: { judgeModel: true },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    target: c.target,
    scorers: c.scorers.map((s) => ({ kind: s.kind, params: s.params ?? {} })),
    judgeModel: c.judgeModel
      ? { id: c.judgeModel.id, displayName: c.judgeModel.displayName }
      : null,
  }));
}

// --- eval runs ---

export interface EvalRunPlan {
  evalRunId: string;
  subject: Extract<EvalSubject, { kind: "retrieval" }>;
  scorers: ScorerSpec[];
  cases: { caseResultId: string; query: string; relevantText: string[] }[];
}

export async function createEvalRun(
  deps: Pick<EvalDeps, "db">,
  spec: EvalRunSpec,
): Promise<{ id: string; plan: EvalRunPlan }> {
  const dataset = await deps.db.query.datasets.findFirst({
    where: eq(datasets.id, spec.datasetId),
    with: { cases: { orderBy: asc(datasetCases.createdAt) } },
  });
  if (!dataset) throw new NotFoundError(`Dataset ${spec.datasetId} not found`);
  if (dataset.target !== "retrieval") {
    throw new BadRequestError("Only retrieval datasets are supported so far");
  }
  if (dataset.cases.length === 0) throw new BadRequestError("This dataset has no cases");

  const config = await deps.db.query.evalConfigs.findFirst({
    where: eq(evalConfigs.id, spec.evalConfigId),
  });
  if (!config) throw new NotFoundError(`Eval config ${spec.evalConfigId} not found`);
  if (config.target !== dataset.target) {
    throw new BadRequestError(
      `Eval config target "${config.target}" does not match dataset target "${dataset.target}"`,
    );
  }

  const { documentId, chunkingConfigId, retrievalConfigId } = spec.subject;
  const document = await deps.db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!document) throw new NotFoundError(`Document ${documentId} not found`);
  const chunkRows = await deps.db.query.chunks.findMany({
    where: and(eq(chunks.documentId, documentId), eq(chunks.chunkingConfigId, chunkingConfigId)),
  });
  if (chunkRows.length === 0) {
    throw new BadRequestError("This document has not been chunked with this chunking config yet");
  }
  const retrievalConfig = await deps.db.query.retrievalConfigs.findFirst({
    where: eq(retrievalConfigs.id, retrievalConfigId),
  });
  if (!retrievalConfig) throw new NotFoundError(`Retrieval config ${retrievalConfigId} not found`);

  const [run] = await deps.db
    .insert(evalRuns)
    .values({
      name: spec.name,
      datasetId: spec.datasetId,
      evalConfigId: spec.evalConfigId,
      target: dataset.target,
      subject: spec.subject,
    })
    .returning({ id: evalRuns.id });
  if (!run) throw new Error("Failed to create eval run");

  const caseResultRows = await deps.db
    .insert(evalCaseResults)
    .values(dataset.cases.map((c) => ({ evalRunId: run.id, datasetCaseId: c.id })))
    .returning({ id: evalCaseResults.id, datasetCaseId: evalCaseResults.datasetCaseId });

  const caseById = new Map(dataset.cases.map((c) => [c.id, c]));

  return {
    id: run.id,
    plan: {
      evalRunId: run.id,
      subject: spec.subject,
      scorers: config.scorers,
      cases: caseResultRows.map((r) => {
        const datasetCase = caseById.get(r.datasetCaseId)!;
        return {
          caseResultId: r.id,
          query: String((datasetCase.input as { query?: unknown }).query ?? ""),
          relevantText: ((datasetCase.expected as { relevantText?: unknown }).relevantText ??
            []) as string[],
        };
      }),
    },
  };
}

function resolveRelevantChunkIds(
  chunkRows: { id: string; content: string }[],
  relevantText: string[],
): Set<string> {
  const needles = relevantText.map((t) => t.toLowerCase());
  return new Set(
    chunkRows
      .filter((c) => needles.some((n) => c.content.toLowerCase().includes(n)))
      .map((c) => c.id),
  );
}

function score(scorer: ScorerSpec, retrievedIds: string[], relevantIds: Set<string>): ScoreValue {
  const k = Number((scorer.params as { k?: unknown })?.k ?? 10);
  switch (scorer.kind) {
    case "recall_at_k":
      return { value: recallAtK(retrievedIds, relevantIds, k) };
    case "precision_at_k":
      return { value: precisionAtK(retrievedIds, relevantIds, k) };
    case "mrr":
      return { value: reciprocalRank(retrievedIds, relevantIds) };
    case "ndcg": {
      const grades = Object.fromEntries([...relevantIds].map((id) => [id, 1]));
      return { value: ndcgAtK(retrievedIds, grades, k) };
    }
    case "hit_rate": {
      const value = hitRate(retrievedIds, relevantIds, k);
      return { value, pass: value === 1 };
    }
    default:
      throw new BadRequestError(`Unknown retrieval scorer "${scorer.kind}"`);
  }
}

/** Runs every case sequentially, scoring it, then writes the mean of each scorer as the aggregate. */
export async function runEvalRun(deps: EvalDeps, plan: EvalRunPlan): Promise<void> {
  const start = performance.now();
  const startedAt = new Date();
  await deps.db
    .update(evalRuns)
    .set({ status: "running", startedAt })
    .where(eq(evalRuns.id, plan.evalRunId));

  const { documentId, chunkingConfigId, retrievalConfigId, topK } = plan.subject;
  const chunkRows = await deps.db.query.chunks.findMany({
    where: and(eq(chunks.documentId, documentId), eq(chunks.chunkingConfigId, chunkingConfigId)),
    orderBy: asc(chunks.index),
  });

  const perScorer = new Map<string, number[]>();
  let succeeded = 0;

  for (const c of plan.cases) {
    deps.events.emit({
      type: "case.started",
      evalRunId: plan.evalRunId,
      caseResultId: c.caseResultId,
    });
    const caseStart = performance.now();
    try {
      const candidates = await retrieveForQuery(deps, {
        retrievalConfigId,
        documentId,
        chunkingConfigId,
        query: c.query,
        topK,
      });
      const retrievedIds = candidates.map((x) => x.chunkId);
      const relevantIds = resolveRelevantChunkIds(chunkRows, c.relevantText);

      const scores: Record<string, ScoreValue> = {};
      for (const scorer of plan.scorers) {
        const value = score(scorer, retrievedIds, relevantIds);
        scores[scorer.kind] = value;
        perScorer.set(scorer.kind, [...(perScorer.get(scorer.kind) ?? []), value.value]);
      }

      await deps.db
        .update(evalCaseResults)
        .set({
          status: "success",
          output: {
            retrieved: candidates.map((x) => ({ chunkId: x.chunkId, score: x.score })),
            relevantChunkIds: [...relevantIds],
          },
          scores,
          latencyMs: Math.round(performance.now() - caseStart),
        })
        .where(eq(evalCaseResults.id, c.caseResultId));
      succeeded++;
      deps.events.emit({
        type: "case.completed",
        evalRunId: plan.evalRunId,
        caseResultId: c.caseResultId,
        status: "success",
      });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      await deps.db
        .update(evalCaseResults)
        .set({
          status: "error",
          error: { name: e.name, message: e.message },
          latencyMs: Math.round(performance.now() - caseStart),
        })
        .where(eq(evalCaseResults.id, c.caseResultId));
      deps.events.emit({
        type: "case.completed",
        evalRunId: plan.evalRunId,
        caseResultId: c.caseResultId,
        status: "error",
      });
    }
  }

  const aggregate: Record<string, number> = {};
  for (const [kind, values] of perScorer) {
    aggregate[kind] = values.reduce((a, b) => a + b, 0) / values.length;
  }

  await deps.db
    .update(evalRuns)
    .set({
      status: succeeded > 0 ? "success" : "error",
      aggregate: succeeded > 0 ? aggregate : null,
      latencyMs: Math.round(performance.now() - start),
      finishedAt: new Date(),
    })
    .where(eq(evalRuns.id, plan.evalRunId));

  deps.events.emit({ type: "eval_run.done", evalRunId: plan.evalRunId });
}

export async function getEvalRun(
  deps: Pick<EvalDeps, "db">,
  id: string,
): Promise<EvalRunDetail | null> {
  const run = await deps.db.query.evalRuns.findFirst({
    where: eq(evalRuns.id, id),
    with: {
      dataset: true,
      evalConfig: true,
      caseResults: { with: { datasetCase: true } },
    },
  });
  if (!run) return null;

  return {
    id: run.id,
    name: run.name,
    target: run.target,
    createdAt: run.createdAt.toISOString(),
    dataset: { id: run.dataset.id, name: run.dataset.name },
    evalConfig: {
      id: run.evalConfig.id,
      name: run.evalConfig.name,
      scorers: run.evalConfig.scorers.map((s) => ({ kind: s.kind, params: s.params ?? {} })),
    },
    subject: run.subject as unknown as Record<string, unknown>,
    status: run.status,
    aggregate: run.aggregate,
    results: run.caseResults.map((r) => ({
      id: r.id,
      status: r.status,
      case: {
        id: r.datasetCase.id,
        label: r.datasetCase.label,
        input: r.datasetCase.input,
        expected: r.datasetCase.expected,
      },
      output: r.output,
      scores: r.scores,
      latencyMs: r.latencyMs,
      error: r.error,
    })),
    pending: run.status === "pending" || run.status === "running",
  };
}

export async function listEvalRuns(
  deps: Pick<EvalDeps, "db">,
  limit = 50,
): Promise<EvalRunSummary[]> {
  const rows = await deps.db.query.evalRuns.findMany({
    orderBy: desc(evalRuns.createdAt),
    limit,
    with: { dataset: true, caseResults: { columns: { status: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    datasetName: r.dataset.name,
    target: r.target,
    createdAt: r.createdAt.toISOString(),
    status: r.status,
    aggregate: r.aggregate,
    total: r.caseResults.length,
    succeeded: r.caseResults.filter((x) => x.status === "success").length,
    failed: r.caseResults.filter((x) => x.status === "error").length,
    pending: r.caseResults.filter((x) => x.status === "pending" || x.status === "running").length,
  }));
}
