import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { MockEmbeddingProvider } from "@melai/ai-core";
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
  providers,
  retrievalConfigs,
  type Database,
} from "@melai/database";
import { createTestDatabase, type TestDatabaseHandle } from "@melai/database/testing";
import { buildApp } from "../app.js";
import { registryFromMap } from "../providers.js";
import { embeddingRegistryFromMap } from "../embeddings.js";

let handle: TestDatabaseHandle;
let app: FastifyInstance;

const asDb = (db: TestDatabaseHandle["db"]): Database => db as unknown as Database;
const registry = registryFromMap(new Map());
const embeddingRegistry = embeddingRegistryFromMap(
  new Map([["mock", new MockEmbeddingProvider({ id: "mock", dimensions: 768 })]]),
);

const DOC_CONTENT = [
  "Refunds are processed within 14 business days of an approved request.",
  "Expedited shipping arrives in 2 business days for an additional fee.",
  "Accidental damage is not covered by the limited warranty.",
].join("\n\n");

async function post(url: string, payload: object) {
  const res = await app.inject({ method: "POST", url, payload });
  return { status: res.statusCode, body: res.json() };
}

async function setup() {
  const doc = (await post("/documents", { name: "policy.md", content: DOC_CONTENT })).body;
  const chunking = (
    await post("/chunking-configs", {
      name: "sentence",
      strategy: "sentence",
      params: { maxChunkSize: 80 },
    })
  ).body;
  await post(`/documents/${doc.id}/chunk`, { chunkingConfigId: chunking.id });
  const bm25 = (await post("/retrieval-configs", { name: "bm25", method: "bm25" })).body;
  return { doc, chunking, bm25 };
}

async function makeDataset() {
  const ds = (await post("/datasets", { name: "policy-eval", target: "retrieval" })).body;
  await post(`/datasets/${ds.id}/cases`, {
    cases: [
      {
        label: "refunds",
        input: { query: "How long do refunds take?" },
        expected: { relevantText: ["within 14 business days"] },
      },
      {
        label: "expedited",
        input: { query: "When does expedited shipping arrive?" },
        expected: { relevantText: ["2 business days for an additional fee"] },
      },
      {
        label: "warranty",
        input: { query: "Is accidental damage covered?" },
        expected: { relevantText: ["Accidental damage is not covered"] },
      },
    ],
  });
  return ds;
}

async function makeEvalConfig() {
  return (
    await post("/eval-configs", {
      name: "recall + mrr + hit",
      target: "retrieval",
      scorers: [
        { kind: "recall_at_k", params: { k: 3 } },
        { kind: "mrr" },
        { kind: "hit_rate", params: { k: 3 } },
      ],
    })
  ).body;
}

async function waitForRun(id: string, tries = 100): Promise<Record<string, unknown>> {
  for (let i = 0; i < tries; i++) {
    const body = (await app.inject({ method: "GET", url: `/eval-runs/${id}` })).json();
    if (!body.pending) return body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`eval run ${id} did not finish`);
}

beforeAll(async () => {
  handle = await createTestDatabase();
  app = await buildApp({ db: asDb(handle.db), registry, embeddingRegistry });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

beforeEach(async () => {
  const { db } = handle;
  await db.delete(evalCaseResults);
  await db.delete(evalRuns);
  await db.delete(evalConfigs);
  await db.delete(datasetCases);
  await db.delete(datasets);
  await db.delete(retrievalConfigs);
  await db.delete(embeddings);
  await db.delete(chunks);
  await db.delete(chunkingConfigs);
  await db.delete(documents);
  await db.delete(embeddingModels);
  await db.delete(providers);
});

describe("datasets", () => {
  test("creates a dataset, adds cases, lists with a case count", async () => {
    const ds = await makeDataset();
    expect(ds).toMatchObject({ name: "policy-eval", target: "retrieval", caseCount: 0 });

    const detail = (await app.inject({ method: "GET", url: `/datasets/${ds.id}` })).json();
    expect(detail.cases).toHaveLength(3);
    expect(detail.cases[0].input.query).toBe("How long do refunds take?");

    const list = (await app.inject({ method: "GET", url: "/datasets" })).json();
    expect(list.datasets.find((d: { id: string }) => d.id === ds.id).caseCount).toBe(3);
  });

  test("rejects a retrieval case with an empty relevantText", async () => {
    const ds = await makeDataset();
    const res = await post(`/datasets/${ds.id}/cases`, {
      cases: [{ input: { query: "q" }, expected: { relevantText: [] } }],
    });
    expect(res.status).toBe(400);
  });
});

describe("eval runs", () => {
  test("runs a retrieval eval and aggregates each scorer as a mean", async () => {
    const { doc, chunking, bm25 } = await setup();
    const ds = await makeDataset();
    const config = await makeEvalConfig();

    const accepted = await post("/eval-runs", {
      name: "bm25 baseline",
      datasetId: ds.id,
      evalConfigId: config.id,
      subject: {
        kind: "retrieval",
        documentId: doc.id,
        chunkingConfigId: chunking.id,
        retrievalConfigId: bm25.id,
        topK: 3,
      },
    });
    expect(accepted.status).toBe(202);
    expect(accepted.body.pending).toBe(true);
    expect(accepted.body.results).toHaveLength(3);

    const done = await waitForRun(accepted.body.id);
    expect(done.status).toBe("success");

    const aggregate = done.aggregate as Record<string, number>;
    expect(Object.keys(aggregate).sort()).toEqual(["hit_rate", "mrr", "recall_at_k"]);
    for (const v of Object.values(aggregate)) expect(v).toBeGreaterThanOrEqual(0);

    const results = done.results as {
      status: string;
      case: { label: string };
      scores: Record<string, { value: number }>;
      output: { relevantChunkIds: string[] };
    }[];
    const refund = results.find((r) => r.case.label === "refunds")!;
    expect(refund.status).toBe("success");
    expect(refund.output.relevantChunkIds).toHaveLength(1);
    expect(refund.scores.recall_at_k!.value).toBe(1);
    expect(refund.scores.hit_rate!.value).toBe(1);
  });

  test("404s when the subject document does not exist", async () => {
    const ds = await makeDataset();
    const config = await makeEvalConfig();
    const res = await post("/eval-runs", {
      name: "x",
      datasetId: ds.id,
      evalConfigId: config.id,
      subject: {
        kind: "retrieval",
        documentId: "00000000-0000-0000-0000-000000000000",
        chunkingConfigId: "00000000-0000-0000-0000-000000000000",
        retrievalConfigId: "00000000-0000-0000-0000-000000000000",
        topK: 3,
      },
    });
    expect(res.status).toBe(404);
  });

  test("400s when the dataset has no cases", async () => {
    const { doc, chunking, bm25 } = await setup();
    const ds = (await post("/datasets", { name: "empty", target: "retrieval" })).body;
    const config = await makeEvalConfig();
    const res = await post("/eval-runs", {
      name: "x",
      datasetId: ds.id,
      evalConfigId: config.id,
      subject: {
        kind: "retrieval",
        documentId: doc.id,
        chunkingConfigId: chunking.id,
        retrievalConfigId: bm25.id,
        topK: 3,
      },
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /eval-runs/:id/stream (SSE)", () => {
  test("emits a snapshot then eval_run.done", async () => {
    const { doc, chunking, bm25 } = await setup();
    const ds = await makeDataset();
    const config = await makeEvalConfig();

    const sseApp = await buildApp({ db: asDb(handle.db), registry, embeddingRegistry });
    await sseApp.listen({ port: 0, host: "127.0.0.1" });
    const address = sseApp.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const accepted = (
        await sseApp.inject({
          method: "POST",
          url: "/eval-runs",
          payload: {
            name: "sse",
            datasetId: ds.id,
            evalConfigId: config.id,
            subject: {
              kind: "retrieval",
              documentId: doc.id,
              chunkingConfigId: chunking.id,
              retrievalConfigId: bm25.id,
              topK: 3,
            },
          },
        })
      ).json();

      const res = await fetch(`http://127.0.0.1:${port}/eval-runs/${accepted.id}/stream`);
      const text = await res.text();
      const events = text
        .split("\n\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice("data: ".length)) as { type: string });

      const types = events.map((e) => e.type);
      expect(types[0]).toBe("snapshot");
      expect(types).toContain("eval_run.done");
    } finally {
      await sseApp.close();
    }
  });
});
