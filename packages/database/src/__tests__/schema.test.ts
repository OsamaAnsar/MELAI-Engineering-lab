import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  chunkingConfigs,
  chunks,
  datasetCases,
  datasets,
  documents,
  embeddingModels,
  embeddings,
  evalCaseResults,
  evalConfigs,
  evalRuns,
  experimentRuns,
  experiments,
  models,
  promptVersions,
  prompts,
  providers,
  retrievalConfigs,
  retrievalRunResults,
  retrievalRuns,
} from "../schema.js";
import { createTestDatabase, type TestDatabaseHandle } from "../testing/pglite.js";

let handle: TestDatabaseHandle;

beforeAll(async () => {
  handle = await createTestDatabase();
});

afterAll(async () => {
  await handle.close();
});

describe("schema round-trip (PGlite)", () => {
  test("persists an experiment run across the full FK chain", async () => {
    const { db } = handle;

    const [provider] = await db
      .insert(providers)
      .values({ name: "anthropic", kind: "cloud" })
      .returning();

    const [model] = await db
      .insert(models)
      .values({
        providerId: provider!.id,
        name: "claude-sonnet-4-5",
        displayName: "Claude Sonnet 4.5",
        inputPricePerMtok: "3.000000",
        outputPricePerMtok: "15.000000",
      })
      .returning();

    const [prompt] = await db.insert(prompts).values({ name: "compare-docs" }).returning();

    const [pv] = await db
      .insert(promptVersions)
      .values({
        promptId: prompt!.id,
        version: 1,
        template: "Answer {{question}} using only {{sources}}.",
        variables: ["question", "sources"],
      })
      .returning();

    const [experiment] = await db
      .insert(experiments)
      .values({
        name: "baseline",
        promptVersionId: pv!.id,
        inputVariables: { question: "What changed?", sources: "doc-a, doc-b" },
        config: { temperature: 0.2, maxOutputTokens: 512 },
      })
      .returning();

    const [run] = await db
      .insert(experimentRuns)
      .values({
        experimentId: experiment!.id,
        modelId: model!.id,
        status: "success",
        request: {
          model: "claude-sonnet-4-5",
          messages: [{ role: "user", content: "What changed?" }],
          temperature: 0.2,
        },
        responseText: "Doc B adds a refund clause.",
        finishReason: "stop",
        inputTokens: 1200,
        outputTokens: 40,
        cachedTokens: 0,
        latencyMs: 830,
        estimatedCostUsd: "0.004200",
        pricingSnapshot: { inputPerMTok: "3.000000", outputPerMTok: "15.000000" },
        startedAt: new Date(),
        finishedAt: new Date(),
      })
      .returning();

    expect(run!.status).toBe("success");

    const fetched = await db.query.experimentRuns.findFirst({
      where: eq(experimentRuns.id, run!.id),
    });

    expect(fetched?.responseText).toBe("Doc B adds a refund clause.");
    expect(fetched?.inputTokens).toBe(1200);
    expect(fetched?.request?.messages[0]?.content).toBe("What changed?");
    expect(fetched?.estimatedCostUsd).toBe("0.004200");
  });

  test("enforces the (provider_id, name) unique constraint on models", async () => {
    const { db } = handle;
    const [provider] = await db
      .insert(providers)
      .values({ name: "openai", kind: "cloud" })
      .returning();

    await db
      .insert(models)
      .values({ providerId: provider!.id, name: "gpt-4.1", displayName: "GPT-4.1" });

    await expect(
      db.insert(models).values({ providerId: provider!.id, name: "gpt-4.1", displayName: "dup" }),
    ).rejects.toThrow();
  });

  test("cascades run deletion when its experiment is removed", async () => {
    const { db } = handle;
    const [provider] = await db
      .insert(providers)
      .values({ name: "ollama", kind: "local" })
      .returning();
    const [model] = await db
      .insert(models)
      .values({ providerId: provider!.id, name: "qwen2.5:7b", displayName: "Qwen 7B" })
      .returning();
    const [prompt] = await db.insert(prompts).values({ name: "p" }).returning();
    const [pv] = await db
      .insert(promptVersions)
      .values({ promptId: prompt!.id, version: 1, template: "hi" })
      .returning();
    const [experiment] = await db
      .insert(experiments)
      .values({
        name: "x",
        promptVersionId: pv!.id,
        config: { temperature: 0, maxOutputTokens: 1 },
      })
      .returning();
    await db.insert(experimentRuns).values({ experimentId: experiment!.id, modelId: model!.id });

    await db.delete(experiments).where(eq(experiments.id, experiment!.id));

    const remaining = await db.query.experimentRuns.findMany({
      where: eq(experimentRuns.experimentId, experiment!.id),
    });
    expect(remaining).toHaveLength(0);
  });
});

describe("RAG schema round-trip (PGlite)", () => {
  test("persists a retrieval run across the full FK chain, including a pgvector embedding", async () => {
    const { db } = handle;

    const [provider] = await db
      .insert(providers)
      .values({ name: "ollama-embed", kind: "local" })
      .returning();

    const [embeddingModel] = await db
      .insert(embeddingModels)
      .values({
        providerId: provider!.id,
        name: "nomic-embed-text",
        displayName: "Nomic Embed Text",
        dimensions: 768,
      })
      .returning();

    const [document] = await db
      .insert(documents)
      .values({ name: "refund-policy.md", content: "Refunds are issued within 30 days." })
      .returning();

    const [chunkingConfig] = await db
      .insert(chunkingConfigs)
      .values({ name: "fixed-256", strategy: "fixed", params: { chunkSize: 256, overlap: 32 } })
      .returning();

    const [chunk] = await db
      .insert(chunks)
      .values({
        documentId: document!.id,
        chunkingConfigId: chunkingConfig!.id,
        index: 0,
        content: "Refunds are issued within 30 days.",
        tokenCount: 8,
      })
      .returning();

    const fakeVector = Array.from({ length: 768 }, (_, i) => i / 768);
    const [embedding] = await db
      .insert(embeddings)
      .values({ chunkId: chunk!.id, embeddingModelId: embeddingModel!.id, vector: fakeVector })
      .returning();
    expect(embedding!.vector).toHaveLength(768);
    expect(embedding!.vector[0]).toBeCloseTo(0);
    expect(embedding!.vector[767]).toBeCloseTo(767 / 768);

    const [retrievalConfig] = await db
      .insert(retrievalConfigs)
      .values({ name: "hybrid-default", method: "hybrid_rrf", params: { rrfK: 60 } })
      .returning();

    const [run] = await db
      .insert(retrievalRuns)
      .values({
        query: "What is the refund window?",
        documentId: document!.id,
        chunkingConfigId: chunkingConfig!.id,
      })
      .returning();

    const [result] = await db
      .insert(retrievalRunResults)
      .values({
        retrievalRunId: run!.id,
        retrievalConfigId: retrievalConfig!.id,
        status: "success",
        results: [{ chunkId: chunk!.id, score: 0.91, bm25Rank: 1, bm25Score: 4.2, vectorRank: 2 }],
        latencyMs: 12,
        startedAt: new Date(),
        finishedAt: new Date(),
      })
      .returning();

    expect(result!.status).toBe("success");

    const fetched = await db.query.retrievalRunResults.findFirst({
      where: eq(retrievalRunResults.id, result!.id),
    });
    expect(fetched?.results?.[0]?.chunkId).toBe(chunk!.id);
    expect(fetched?.results?.[0]?.score).toBe(0.91);
  });

  test("enforces the (document_id, chunking_config_id, index) unique constraint on chunks", async () => {
    const { db } = handle;
    const [document] = await db
      .insert(documents)
      .values({ name: "dup-test.md", content: "x" })
      .returning();
    const [chunkingConfig] = await db
      .insert(chunkingConfigs)
      .values({ name: "dup-config", strategy: "sentence" })
      .returning();

    await db.insert(chunks).values({
      documentId: document!.id,
      chunkingConfigId: chunkingConfig!.id,
      index: 0,
      content: "a",
      tokenCount: 1,
    });

    await expect(
      db.insert(chunks).values({
        documentId: document!.id,
        chunkingConfigId: chunkingConfig!.id,
        index: 0,
        content: "b",
        tokenCount: 1,
      }),
    ).rejects.toThrow();
  });

  test("cascades chunk and embedding deletion when the document is removed", async () => {
    const { db } = handle;
    const [provider] = await db
      .insert(providers)
      .values({ name: "cascade-embed", kind: "local" })
      .returning();
    const [embeddingModel] = await db
      .insert(embeddingModels)
      .values({
        providerId: provider!.id,
        name: "cascade-model",
        displayName: "Cascade Model",
        dimensions: 768,
      })
      .returning();
    const [document] = await db
      .insert(documents)
      .values({ name: "cascade.md", content: "x" })
      .returning();
    const [chunkingConfig] = await db
      .insert(chunkingConfigs)
      .values({ name: "cascade-config", strategy: "fixed" })
      .returning();
    const [chunk] = await db
      .insert(chunks)
      .values({
        documentId: document!.id,
        chunkingConfigId: chunkingConfig!.id,
        index: 0,
        content: "x",
        tokenCount: 1,
      })
      .returning();
    await db.insert(embeddings).values({
      chunkId: chunk!.id,
      embeddingModelId: embeddingModel!.id,
      vector: Array.from({ length: 768 }, () => 0),
    });

    await db.delete(documents).where(eq(documents.id, document!.id));

    const remainingChunks = await db.query.chunks.findMany({
      where: eq(chunks.documentId, document!.id),
    });
    expect(remainingChunks).toHaveLength(0);

    const remainingEmbeddings = await db.query.embeddings.findMany({
      where: eq(embeddings.chunkId, chunk!.id),
    });
    expect(remainingEmbeddings).toHaveLength(0);
  });

  test("cascades result deletion when its retrieval run is removed", async () => {
    const { db } = handle;
    const [document] = await db
      .insert(documents)
      .values({ name: "run-cascade.md", content: "x" })
      .returning();
    const [chunkingConfig] = await db
      .insert(chunkingConfigs)
      .values({ name: "run-cascade-config", strategy: "fixed" })
      .returning();
    const [retrievalConfig] = await db
      .insert(retrievalConfigs)
      .values({ name: "run-cascade-retrieval", method: "bm25" })
      .returning();
    const [run] = await db
      .insert(retrievalRuns)
      .values({ query: "x", documentId: document!.id, chunkingConfigId: chunkingConfig!.id })
      .returning();
    await db
      .insert(retrievalRunResults)
      .values({ retrievalRunId: run!.id, retrievalConfigId: retrievalConfig!.id });

    await db.delete(retrievalRuns).where(eq(retrievalRuns.id, run!.id));

    const remaining = await db.query.retrievalRunResults.findMany({
      where: eq(retrievalRunResults.retrievalRunId, run!.id),
    });
    expect(remaining).toHaveLength(0);
  });
});

describe("Evaluation schema round-trip (PGlite)", () => {
  test("persists an eval run and case result across the full FK chain", async () => {
    const { db } = handle;

    const [dataset] = await db
      .insert(datasets)
      .values({
        name: "support-policy-retrieval",
        target: "retrieval",
        description: "example",
      })
      .returning();

    const [datasetCase] = await db
      .insert(datasetCases)
      .values({
        datasetId: dataset!.id,
        label: "refund timing",
        input: { query: "How long do refunds take?" },
        expected: { relevantText: ["within 14 business days"] },
      })
      .returning();

    const [evalConfig] = await db
      .insert(evalConfigs)
      .values({
        name: "recall + mrr",
        target: "retrieval",
        scorers: [{ kind: "recall_at_k", params: { k: 5 } }, { kind: "mrr" }],
      })
      .returning();

    const [document] = await db
      .insert(documents)
      .values({ name: "policy.md", content: "Refunds are processed within 14 business days." })
      .returning();
    const [chunkingConfig] = await db
      .insert(chunkingConfigs)
      .values({ name: "fixed-256", strategy: "fixed" })
      .returning();
    const [retrievalConfig] = await db
      .insert(retrievalConfigs)
      .values({ name: "bm25", method: "bm25" })
      .returning();

    const [evalRun] = await db
      .insert(evalRuns)
      .values({
        name: "bm25 baseline",
        datasetId: dataset!.id,
        evalConfigId: evalConfig!.id,
        target: "retrieval",
        subject: {
          kind: "retrieval",
          documentId: document!.id,
          chunkingConfigId: chunkingConfig!.id,
          retrievalConfigId: retrievalConfig!.id,
          topK: 5,
        },
        status: "success",
        aggregate: { recall_at_k: 0.8, mrr: 0.65 },
        latencyMs: 42,
        startedAt: new Date(),
        finishedAt: new Date(),
      })
      .returning();

    const [caseResult] = await db
      .insert(evalCaseResults)
      .values({
        evalRunId: evalRun!.id,
        datasetCaseId: datasetCase!.id,
        status: "success",
        output: { candidates: [{ chunkId: "c1", score: 0.9 }] },
        scores: {
          recall_at_k: { value: 1, pass: true },
          mrr: { value: 1 },
        },
        latencyMs: 8,
      })
      .returning();

    expect(caseResult!.status).toBe("success");

    const fetched = await db.query.evalRuns.findFirst({
      where: eq(evalRuns.id, evalRun!.id),
      with: { caseResults: true, dataset: true, evalConfig: true },
    });
    expect(fetched?.aggregate?.recall_at_k).toBe(0.8);
    expect(fetched?.subject.kind).toBe("retrieval");
    expect(fetched?.dataset.name).toBe("support-policy-retrieval");
    expect(fetched?.caseResults[0]?.scores?.recall_at_k?.value).toBe(1);
  });

  test("cascades case and case-result deletion when the dataset is removed", async () => {
    const { db } = handle;
    const [dataset] = await db
      .insert(datasets)
      .values({ name: "cascade-eval", target: "retrieval" })
      .returning();
    const [datasetCase] = await db
      .insert(datasetCases)
      .values({ datasetId: dataset!.id, input: { query: "x" } })
      .returning();
    const [evalConfig] = await db
      .insert(evalConfigs)
      .values({ name: "c", target: "retrieval", scorers: [{ kind: "mrr" }] })
      .returning();
    const [document] = await db
      .insert(documents)
      .values({ name: "c.md", content: "x" })
      .returning();
    const [chunkingConfig] = await db
      .insert(chunkingConfigs)
      .values({ name: "c", strategy: "fixed" })
      .returning();
    const [retrievalConfig] = await db
      .insert(retrievalConfigs)
      .values({ name: "c", method: "bm25" })
      .returning();
    const [evalRun] = await db
      .insert(evalRuns)
      .values({
        name: "r",
        datasetId: dataset!.id,
        evalConfigId: evalConfig!.id,
        target: "retrieval",
        subject: {
          kind: "retrieval",
          documentId: document!.id,
          chunkingConfigId: chunkingConfig!.id,
          retrievalConfigId: retrievalConfig!.id,
          topK: 5,
        },
      })
      .returning();
    await db
      .insert(evalCaseResults)
      .values({ evalRunId: evalRun!.id, datasetCaseId: datasetCase!.id });

    await db.delete(datasets).where(eq(datasets.id, dataset!.id));

    const remainingCases = await db.query.datasetCases.findMany({
      where: eq(datasetCases.datasetId, dataset!.id),
    });
    expect(remainingCases).toHaveLength(0);

    const remainingResults = await db.query.evalCaseResults.findMany({
      where: eq(evalCaseResults.evalRunId, evalRun!.id),
    });
    expect(remainingResults).toHaveLength(0);
  });

  test("nulls the judge model reference when the model is deleted", async () => {
    const { db } = handle;
    const [provider] = await db
      .insert(providers)
      .values({ name: "judge-provider", kind: "cloud" })
      .returning();
    const [model] = await db
      .insert(models)
      .values({ providerId: provider!.id, name: "judge-model", displayName: "Judge" })
      .returning();
    const [evalConfig] = await db
      .insert(evalConfigs)
      .values({
        name: "judged",
        target: "generation",
        scorers: [{ kind: "llm_judge" }],
        judgeModelId: model!.id,
        judgeRubric: "Score 1-5 for factual accuracy.",
      })
      .returning();

    await db.delete(models).where(eq(models.id, model!.id));

    const fetched = await db.query.evalConfigs.findFirst({
      where: eq(evalConfigs.id, evalConfig!.id),
    });
    expect(fetched?.judgeModelId).toBeNull();
    expect(fetched?.judgeRubric).toBe("Score 1-5 for factual accuracy.");
  });
});
