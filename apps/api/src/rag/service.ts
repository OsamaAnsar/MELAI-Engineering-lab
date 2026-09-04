import {
  and,
  asc,
  chunkingConfigs,
  chunks,
  desc,
  documents,
  eq,
  embeddingModels,
  embeddings,
  inArray,
  providers,
  retrievalConfigs,
  retrievalRunResults,
  retrievalRuns,
  type Database,
  type RetrievalCandidate,
} from "@melai/database";
import {
  Bm25Index,
  chunkBySentence,
  chunkFixed,
  reciprocalRankFusion,
  toRanked,
  vectorSearch,
  type Bm25Match,
  type VectorMatch,
} from "@melai/ai-core/retrieval";
import {
  bm25ParamsSchema,
  fixedChunkParamsSchema,
  hybridRrfParamsSchema,
  sentenceChunkParamsSchema,
  vectorParamsSchema,
  type ChunkDetail,
  type ChunkingConfigSpec,
  type ChunkingConfigSummary,
  type DocumentSummary,
  type EmbeddingModelSummary,
  type RetrievalConfigSpec,
  type RetrievalConfigSummary,
  type RetrievalRunDetail,
  type RetrievalRunSpec,
  type RetrievalRunSummary,
} from "@melai/shared";
import { BadRequestError, NotFoundError } from "../errors.js";
import type { EmbeddingProviderRegistry } from "../embeddings.js";
import type { RetrievalEvents } from "./events.js";

export interface RagDeps {
  db: Database;
  embeddingRegistry: EmbeddingProviderRegistry;
  events: RetrievalEvents;
}

// --- documents ---

export async function createDocument(
  deps: Pick<RagDeps, "db">,
  input: { name: string; content: string },
): Promise<DocumentSummary> {
  const [document] = await deps.db.insert(documents).values(input).returning();
  if (!document) throw new Error("Failed to create document");
  return document;
}

export async function listDocuments(deps: Pick<RagDeps, "db">): Promise<DocumentSummary[]> {
  return deps.db.query.documents.findMany({ orderBy: desc(documents.createdAt) });
}

export async function getDocument(
  deps: Pick<RagDeps, "db">,
  id: string,
): Promise<DocumentSummary | null> {
  return (await deps.db.query.documents.findFirst({ where: eq(documents.id, id) })) ?? null;
}

// --- chunking ---

/** Validates `spec.params` against the schema for `spec.strategy` before insert. */
export async function createChunkingConfig(
  deps: Pick<RagDeps, "db">,
  spec: ChunkingConfigSpec,
): Promise<ChunkingConfigSummary> {
  const paramsSchema =
    spec.strategy === "fixed" ? fixedChunkParamsSchema : sentenceChunkParamsSchema;
  const params = paramsSchema.safeParse(spec.params);
  if (!params.success) {
    throw new BadRequestError(`Invalid ${spec.strategy} chunking params: ${params.error.message}`);
  }

  const [config] = await deps.db
    .insert(chunkingConfigs)
    .values({ name: spec.name, strategy: spec.strategy, params: params.data })
    .returning();
  if (!config) throw new Error("Failed to create chunking config");
  return config;
}

/**
 * Runs a chunking config over a document, persisting the result. Idempotent:
 * if this (document, config) pair was already chunked, returns the cached rows.
 */
export async function chunkDocument(
  deps: Pick<RagDeps, "db">,
  documentId: string,
  chunkingConfigId: string,
): Promise<ChunkDetail[]> {
  const document = await getDocument(deps, documentId);
  if (!document) throw new NotFoundError(`Document ${documentId} not found`);

  const config = await deps.db.query.chunkingConfigs.findFirst({
    where: eq(chunkingConfigs.id, chunkingConfigId),
  });
  if (!config) throw new NotFoundError(`Chunking config ${chunkingConfigId} not found`);

  const existing = await deps.db.query.chunks.findMany({
    where: and(eq(chunks.documentId, documentId), eq(chunks.chunkingConfigId, chunkingConfigId)),
    orderBy: asc(chunks.index),
  });
  if (existing.length > 0) return existing;

  const computed =
    config.strategy === "fixed"
      ? chunkFixed(document.content, fixedChunkParamsSchema.parse(config.params))
      : chunkBySentence(document.content, sentenceChunkParamsSchema.parse(config.params));
  if (computed.length === 0) return [];

  return deps.db
    .insert(chunks)
    .values(
      computed.map((c) => ({
        documentId,
        chunkingConfigId,
        index: c.index,
        content: c.content,
        tokenCount: c.tokenCount,
      })),
    )
    .returning();
}

// --- embedding ---

export async function listEmbeddingModels(
  deps: Pick<RagDeps, "db">,
): Promise<EmbeddingModelSummary[]> {
  return deps.db
    .select({
      id: embeddingModels.id,
      name: embeddingModels.name,
      displayName: embeddingModels.displayName,
      dimensions: embeddingModels.dimensions,
      pricePerMtok: embeddingModels.pricePerMtok,
      provider: providers.name,
      providerKind: providers.kind,
    })
    .from(embeddingModels)
    .innerJoin(providers, eq(embeddingModels.providerId, providers.id))
    .orderBy(asc(embeddingModels.displayName));
}

/**
 * Embeds every not-yet-embedded chunk of a chunking config with one embedding
 * model. Idempotent per (chunk, embeddingModel) pair.
 */
export async function embedChunks(
  deps: Pick<RagDeps, "db" | "embeddingRegistry">,
  chunkingConfigId: string,
  embeddingModelId: string,
) {
  const embeddingModel = await deps.db.query.embeddingModels.findFirst({
    where: eq(embeddingModels.id, embeddingModelId),
    with: { provider: true },
  });
  if (!embeddingModel) throw new NotFoundError(`Embedding model ${embeddingModelId} not found`);

  const chunkRows = await deps.db.query.chunks.findMany({
    where: eq(chunks.chunkingConfigId, chunkingConfigId),
    orderBy: asc(chunks.index),
  });
  if (chunkRows.length === 0) {
    throw new BadRequestError("No chunks to embed — chunk the document first");
  }

  const existing = await deps.db.query.embeddings.findMany({
    where: and(
      inArray(
        embeddings.chunkId,
        chunkRows.map((c) => c.id),
      ),
      eq(embeddings.embeddingModelId, embeddingModelId),
    ),
  });
  const alreadyEmbedded = new Set(existing.map((e) => e.chunkId));
  const toEmbed = chunkRows.filter((c) => !alreadyEmbedded.has(c.id));
  if (toEmbed.length === 0) return existing;

  const provider = deps.embeddingRegistry.get(embeddingModel.provider.name);
  if (!provider) {
    throw new BadRequestError(
      `No credentials configured for embedding provider "${embeddingModel.provider.name}"`,
    );
  }

  const result = await provider.embed({
    model: embeddingModel.name,
    texts: toEmbed.map((c) => c.content),
  });

  const inserted = await deps.db
    .insert(embeddings)
    .values(
      toEmbed.map((chunk, i) => ({
        chunkId: chunk.id,
        embeddingModelId,
        vector: result.vectors[i]!,
      })),
    )
    .returning();

  return [...existing, ...inserted];
}

// --- retrieval configs ---

/** Validates `spec.params` against the schema for `spec.method` before insert. */
export async function createRetrievalConfig(
  deps: Pick<RagDeps, "db">,
  spec: RetrievalConfigSpec,
): Promise<RetrievalConfigSummary> {
  const paramsSchema =
    spec.method === "bm25"
      ? bm25ParamsSchema
      : spec.method === "vector"
        ? vectorParamsSchema
        : hybridRrfParamsSchema;
  const params = paramsSchema.safeParse(spec.params);
  if (!params.success) {
    throw new BadRequestError(`Invalid ${spec.method} retrieval params: ${params.error.message}`);
  }

  const [config] = await deps.db
    .insert(retrievalConfigs)
    .values({ name: spec.name, method: spec.method, params: params.data })
    .returning();
  if (!config) throw new Error("Failed to create retrieval config");
  return config;
}

// --- retrieval runs ---

export interface RetrievalRunPlan {
  retrievalRunId: string;
  query: string;
  documentId: string;
  chunkingConfigId: string;
  topK: number;
  resultIds: { resultId: string; retrievalConfigId: string }[];
}

export async function createRetrievalRun(
  deps: Pick<RagDeps, "db">,
  spec: RetrievalRunSpec,
): Promise<{ id: string; plan: RetrievalRunPlan }> {
  const document = await getDocument(deps, spec.documentId);
  if (!document) throw new NotFoundError(`Document ${spec.documentId} not found`);

  const chunkRows = await deps.db.query.chunks.findMany({
    where: and(
      eq(chunks.documentId, spec.documentId),
      eq(chunks.chunkingConfigId, spec.chunkingConfigId),
    ),
  });
  if (chunkRows.length === 0) {
    throw new BadRequestError("This document has not been chunked with this chunking config yet");
  }

  const configRows = await deps.db.query.retrievalConfigs.findMany({
    where: inArray(retrievalConfigs.id, spec.retrievalConfigIds),
  });
  const missing = spec.retrievalConfigIds.filter((id) => !configRows.some((c) => c.id === id));
  if (missing.length > 0)
    throw new BadRequestError(`Unknown retrieval config id(s): ${missing.join(", ")}`);

  const [run] = await deps.db
    .insert(retrievalRuns)
    .values({
      query: spec.query,
      documentId: spec.documentId,
      chunkingConfigId: spec.chunkingConfigId,
      topK: spec.topK,
    })
    .returning({ id: retrievalRuns.id });
  if (!run) throw new Error("Failed to create retrieval run");

  const resultRows = await deps.db
    .insert(retrievalRunResults)
    .values(configRows.map((c) => ({ retrievalRunId: run.id, retrievalConfigId: c.id })))
    .returning({
      id: retrievalRunResults.id,
      retrievalConfigId: retrievalRunResults.retrievalConfigId,
    });

  return {
    id: run.id,
    plan: {
      retrievalRunId: run.id,
      query: spec.query,
      documentId: spec.documentId,
      chunkingConfigId: spec.chunkingConfigId,
      topK: spec.topK,
      resultIds: resultRows.map((r) => ({
        resultId: r.id,
        retrievalConfigId: r.retrievalConfigId,
      })),
    },
  };
}

function buildHybridCandidates(
  bm25Matches: Bm25Match[],
  vectorMatches: VectorMatch[],
  rrfK: number,
  topK: number,
): RetrievalCandidate[] {
  const bm25Ranked = toRanked(bm25Matches);
  const vectorRanked = toRanked(vectorMatches);
  const fused = reciprocalRankFusion([bm25Ranked, vectorRanked], rrfK);

  const bm25RankById = new Map(bm25Ranked.map((r) => [r.id, r.rank]));
  const bm25ScoreById = new Map(bm25Matches.map((m) => [m.id, m.score]));
  const vectorRankById = new Map(vectorRanked.map((r) => [r.id, r.rank]));
  const vectorScoreById = new Map(vectorMatches.map((m) => [m.id, m.score]));

  return fused.slice(0, topK).map((f) => ({
    chunkId: f.id,
    score: f.score,
    bm25Rank: bm25RankById.get(f.id),
    bm25Score: bm25ScoreById.get(f.id),
    vectorRank: vectorRankById.get(f.id),
    vectorScore: vectorScoreById.get(f.id),
  }));
}

async function executeRetrieval(
  deps: Pick<RagDeps, "db" | "embeddingRegistry" | "events">,
  plan: RetrievalRunPlan,
  resultId: string,
  retrievalConfigId: string,
): Promise<void> {
  deps.events.emit({
    type: "result.started",
    retrievalRunId: plan.retrievalRunId,
    resultId,
    retrievalConfigId,
  });

  const startedAt = new Date();
  const start = performance.now();

  try {
    const config = await deps.db.query.retrievalConfigs.findFirst({
      where: eq(retrievalConfigs.id, retrievalConfigId),
    });
    if (!config) throw new NotFoundError(`Retrieval config ${retrievalConfigId} not found`);

    const chunkRows = await deps.db.query.chunks.findMany({
      where: and(
        eq(chunks.documentId, plan.documentId),
        eq(chunks.chunkingConfigId, plan.chunkingConfigId),
      ),
      orderBy: asc(chunks.index),
    });

    let results: RetrievalCandidate[];

    if (config.method === "bm25") {
      const { k1, b } = bm25ParamsSchema.parse(config.params);
      const index = new Bm25Index(
        chunkRows.map((c) => ({ id: c.id, content: c.content })),
        { k1, b },
      );
      results = index
        .search(plan.query, plan.topK)
        .map((m, i) => ({ chunkId: m.id, score: m.score, bm25Rank: i + 1, bm25Score: m.score }));
    } else {
      const { embeddingModelId, rrfK } =
        config.method === "vector"
          ? { ...vectorParamsSchema.parse(config.params), rrfK: undefined }
          : hybridRrfParamsSchema.parse(config.params);

      const embeddingModel = await deps.db.query.embeddingModels.findFirst({
        where: eq(embeddingModels.id, embeddingModelId),
        with: { provider: true },
      });
      if (!embeddingModel) throw new NotFoundError(`Embedding model ${embeddingModelId} not found`);

      const provider = deps.embeddingRegistry.get(embeddingModel.provider.name);
      if (!provider) {
        throw new BadRequestError(
          `No credentials configured for embedding provider "${embeddingModel.provider.name}"`,
        );
      }

      const embeddingRows = await deps.db.query.embeddings.findMany({
        where: and(
          inArray(
            embeddings.chunkId,
            chunkRows.map((c) => c.id),
          ),
          eq(embeddings.embeddingModelId, embeddingModelId),
        ),
      });
      if (embeddingRows.length < chunkRows.length) {
        throw new BadRequestError(
          "Not every chunk is embedded with this model yet — embed the chunking config first",
        );
      }
      const vectorByChunkId = new Map(embeddingRows.map((e) => [e.chunkId, e.vector]));

      const { vectors: queryVectors } = await provider.embed({
        model: embeddingModel.name,
        texts: [plan.query],
      });
      const queryVector = queryVectors[0]!;

      const candidates = chunkRows.map((c) => ({ id: c.id, vector: vectorByChunkId.get(c.id)! }));

      if (config.method === "vector") {
        results = vectorSearch(queryVector, candidates, plan.topK).map((m, i) => ({
          chunkId: m.id,
          score: m.score,
          vectorRank: i + 1,
          vectorScore: m.score,
        }));
      } else {
        const bm25Matches = new Bm25Index(
          chunkRows.map((c) => ({ id: c.id, content: c.content })),
        ).search(plan.query, chunkRows.length);
        const vectorMatches = vectorSearch(queryVector, candidates, chunkRows.length);
        results = buildHybridCandidates(bm25Matches, vectorMatches, rrfK ?? 60, plan.topK);
      }
    }

    await deps.db
      .update(retrievalRunResults)
      .set({
        status: "success",
        results,
        latencyMs: Math.round(performance.now() - start),
        startedAt,
        finishedAt: new Date(),
      })
      .where(eq(retrievalRunResults.id, resultId));
    deps.events.emit({
      type: "result.completed",
      retrievalRunId: plan.retrievalRunId,
      resultId,
      status: "success",
    });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    await deps.db
      .update(retrievalRunResults)
      .set({
        status: "error",
        error: { name: e.name, message: e.message },
        latencyMs: Math.round(performance.now() - start),
        startedAt,
        finishedAt: new Date(),
      })
      .where(eq(retrievalRunResults.id, resultId));
    deps.events.emit({
      type: "result.completed",
      retrievalRunId: plan.retrievalRunId,
      resultId,
      status: "error",
    });
  }
}

/** Executes every result in the plan concurrently, then emits retrieval_run.done. */
export async function runRetrievalRun(
  deps: Pick<RagDeps, "db" | "embeddingRegistry" | "events">,
  plan: RetrievalRunPlan,
): Promise<void> {
  await Promise.allSettled(
    plan.resultIds.map((r) => executeRetrieval(deps, plan, r.resultId, r.retrievalConfigId)),
  );
  deps.events.emit({ type: "retrieval_run.done", retrievalRunId: plan.retrievalRunId });
}

export async function getRetrievalRun(
  deps: Pick<RagDeps, "db">,
  id: string,
): Promise<RetrievalRunDetail | null> {
  const run = await deps.db.query.retrievalRuns.findFirst({
    where: eq(retrievalRuns.id, id),
    with: {
      document: true,
      chunkingConfig: true,
      results: { with: { retrievalConfig: true } },
    },
  });
  if (!run) return null;

  return {
    id: run.id,
    query: run.query,
    topK: run.topK,
    createdAt: run.createdAt.toISOString(),
    document: { id: run.document.id, name: run.document.name },
    chunkingConfig: {
      id: run.chunkingConfig.id,
      name: run.chunkingConfig.name,
      strategy: run.chunkingConfig.strategy,
    },
    results: run.results.map((r) => ({
      id: r.id,
      status: r.status,
      retrievalConfig: {
        id: r.retrievalConfig.id,
        name: r.retrievalConfig.name,
        method: r.retrievalConfig.method,
      },
      results: r.results,
      latencyMs: r.latencyMs,
      error: r.error,
      startedAt: r.startedAt ? r.startedAt.toISOString() : null,
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    })),
    pending: run.results.some((r) => r.status === "pending" || r.status === "running"),
  };
}

export async function listRetrievalRuns(
  deps: Pick<RagDeps, "db">,
  limit = 50,
): Promise<RetrievalRunSummary[]> {
  const rows = await deps.db.query.retrievalRuns.findMany({
    orderBy: desc(retrievalRuns.createdAt),
    limit,
    with: { document: true, results: { columns: { status: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    query: r.query,
    documentName: r.document.name,
    createdAt: r.createdAt.toISOString(),
    total: r.results.length,
    succeeded: r.results.filter((x) => x.status === "success").length,
    failed: r.results.filter((x) => x.status === "error").length,
    pending: r.results.filter((x) => x.status === "pending" || x.status === "running").length,
  }));
}
