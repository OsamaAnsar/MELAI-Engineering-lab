import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { MockEmbeddingProvider } from "@melai/ai-core";
import {
  chunkingConfigs,
  chunks,
  documents,
  embeddingModels,
  embeddings,
  providers,
  retrievalConfigs,
  retrievalRunResults,
  retrievalRuns,
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

const seeded = { embeddingModelId: "" };

async function waitForDone(
  a: FastifyInstance,
  id: string,
  tries = 100,
): Promise<Record<string, unknown>> {
  for (let i = 0; i < tries; i++) {
    const res = await a.inject({ method: "GET", url: `/retrieval-runs/${id}` });
    const body = res.json();
    if (!body.pending) return body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`retrieval run ${id} did not finish`);
}

const DOC_CONTENT =
  "Refunds are issued within 30 days of purchase. " +
  "Shipping takes 5 to 7 business days for domestic orders. " +
  "International orders may take up to 3 weeks to arrive. " +
  "Contact support for order tracking questions.";

async function setupDocumentAndChunks() {
  const doc = (
    await app.inject({
      method: "POST",
      url: "/documents",
      payload: { name: "policy.md", content: DOC_CONTENT },
    })
  ).json();

  const config = (
    await app.inject({
      method: "POST",
      url: "/chunking-configs",
      payload: { name: "sentence-default", strategy: "sentence", params: { maxChunkSize: 60 } },
    })
  ).json();

  const chunked = (
    await app.inject({
      method: "POST",
      url: `/documents/${doc.id}/chunk`,
      payload: { chunkingConfigId: config.id },
    })
  ).json();

  return { doc, config, chunkCount: chunked.chunks.length };
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
  await db.delete(retrievalRunResults);
  await db.delete(retrievalRuns);
  await db.delete(retrievalConfigs);
  await db.delete(embeddings);
  await db.delete(chunks);
  await db.delete(chunkingConfigs);
  await db.delete(documents);
  await db.delete(embeddingModels);
  await db.delete(providers);

  const [provider] = await db.insert(providers).values({ name: "mock", kind: "cloud" }).returning();
  const [embeddingModel] = await db
    .insert(embeddingModels)
    .values({
      providerId: provider!.id,
      name: "mock-embed",
      displayName: "Mock (embed)",
      dimensions: 768,
    })
    .returning();
  seeded.embeddingModelId = embeddingModel!.id;
});

describe("documents + chunking", () => {
  test("creates a document and lists it", async () => {
    const created = (
      await app.inject({
        method: "POST",
        url: "/documents",
        payload: { name: "d.md", content: "hello world" },
      })
    ).json();
    expect(created).toMatchObject({ name: "d.md", content: "hello world" });

    const list = (await app.inject({ method: "GET", url: "/documents" })).json();
    expect(list.documents.map((d: { id: string }) => d.id)).toContain(created.id);
  });

  test("chunks a document and is idempotent on repeat calls", async () => {
    const { doc, config, chunkCount } = await setupDocumentAndChunks();
    expect(chunkCount).toBeGreaterThan(1);

    const again = (
      await app.inject({
        method: "POST",
        url: `/documents/${doc.id}/chunk`,
        payload: { chunkingConfigId: config.id },
      })
    ).json();
    expect(again.chunks).toHaveLength(chunkCount);
  });

  test("404 when chunking an unknown document", async () => {
    const config = (
      await app.inject({
        method: "POST",
        url: "/chunking-configs",
        payload: { name: "x", strategy: "fixed" },
      })
    ).json();
    const res = await app.inject({
      method: "POST",
      url: "/documents/00000000-0000-0000-0000-000000000000/chunk",
      payload: { chunkingConfigId: config.id },
    });
    expect(res.statusCode).toBe(404);
  });

  test("400 on invalid chunking params (overlap >= chunkSize)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/chunking-configs",
      payload: { name: "bad", strategy: "fixed", params: { chunkSize: 10, overlap: 10 } },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("embedding", () => {
  test("lists the seeded embedding model", async () => {
    const body = (await app.inject({ method: "GET", url: "/embedding-models" })).json();
    expect(body.embeddingModels.map((m: { name: string }) => m.name)).toContain("mock-embed");
  });

  test("embeds every chunk once, then is a no-op on repeat calls", async () => {
    const { config, chunkCount } = await setupDocumentAndChunks();

    const first = (
      await app.inject({
        method: "POST",
        url: `/chunking-configs/${config.id}/embed`,
        payload: { embeddingModelId: seeded.embeddingModelId },
      })
    ).json();
    expect(first.embedded).toBe(chunkCount);

    const second = (
      await app.inject({
        method: "POST",
        url: `/chunking-configs/${config.id}/embed`,
        payload: { embeddingModelId: seeded.embeddingModelId },
      })
    ).json();
    expect(second.embedded).toBe(chunkCount);
  });

  test("400 when embedding a config with no chunks", async () => {
    const config = (
      await app.inject({
        method: "POST",
        url: "/chunking-configs",
        payload: { name: "empty", strategy: "fixed" },
      })
    ).json();
    const res = await app.inject({
      method: "POST",
      url: `/chunking-configs/${config.id}/embed`,
      payload: { embeddingModelId: seeded.embeddingModelId },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /retrieval-runs", () => {
  test("bm25, vector and hybrid_rrf all return ranked, scored results", async () => {
    const { doc, config } = await setupDocumentAndChunks();
    await app.inject({
      method: "POST",
      url: `/chunking-configs/${config.id}/embed`,
      payload: { embeddingModelId: seeded.embeddingModelId },
    });

    const bm25Config = (
      await app.inject({
        method: "POST",
        url: "/retrieval-configs",
        payload: { name: "bm25-default", method: "bm25" },
      })
    ).json();
    const vectorConfig = (
      await app.inject({
        method: "POST",
        url: "/retrieval-configs",
        payload: {
          name: "vector-default",
          method: "vector",
          params: { embeddingModelId: seeded.embeddingModelId },
        },
      })
    ).json();
    const hybridConfig = (
      await app.inject({
        method: "POST",
        url: "/retrieval-configs",
        payload: {
          name: "hybrid-default",
          method: "hybrid_rrf",
          params: { embeddingModelId: seeded.embeddingModelId },
        },
      })
    ).json();

    const accepted = (
      await app.inject({
        method: "POST",
        url: "/retrieval-runs",
        payload: {
          query: "How long do refunds take?",
          documentId: doc.id,
          chunkingConfigId: config.id,
          topK: 3,
          retrievalConfigIds: [bm25Config.id, vectorConfig.id, hybridConfig.id],
        },
      })
    ).json();
    expect(accepted.pending).toBe(true);

    const done = await waitForDone(app, accepted.id);
    const results = done.results as {
      status: string;
      retrievalConfig: { method: string };
      results: { chunkId: string; score: number; bm25Rank?: number; vectorRank?: number }[];
    }[];

    expect(results).toHaveLength(3);
    for (const r of results) expect(r.status).toBe("success");

    const bm25Result = results.find((r) => r.retrievalConfig.method === "bm25")!;
    expect(bm25Result.results.length).toBeGreaterThan(0);
    expect(bm25Result.results[0]!.bm25Rank).toBe(1);

    const vectorResult = results.find((r) => r.retrievalConfig.method === "vector")!;
    expect(vectorResult.results.length).toBeGreaterThan(0);
    expect(vectorResult.results[0]!.vectorRank).toBe(1);

    const hybridResult = results.find((r) => r.retrievalConfig.method === "hybrid_rrf")!;
    expect(hybridResult.results.length).toBeGreaterThan(0);
    // Fused results carry a breakdown from at least one of the two constituent rankers.
    expect(
      hybridResult.results.some((c) => c.bm25Rank !== undefined || c.vectorRank !== undefined),
    ).toBe(true);
  });

  test("400 when the document has not been chunked with the given config", async () => {
    const doc = (
      await app.inject({
        method: "POST",
        url: "/documents",
        payload: { name: "unchunked.md", content: "x" },
      })
    ).json();
    const config = (
      await app.inject({
        method: "POST",
        url: "/chunking-configs",
        payload: { name: "unused", strategy: "fixed" },
      })
    ).json();
    const bm25Config = (
      await app.inject({
        method: "POST",
        url: "/retrieval-configs",
        payload: { name: "bm25", method: "bm25" },
      })
    ).json();

    const res = await app.inject({
      method: "POST",
      url: "/retrieval-runs",
      payload: {
        query: "x",
        documentId: doc.id,
        chunkingConfigId: config.id,
        retrievalConfigIds: [bm25Config.id],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  test("marks the result as an error when the chunks aren't embedded with the requested model", async () => {
    const { doc, config } = await setupDocumentAndChunks();
    // Note: no /embed call for this chunking config.
    const vectorConfig = (
      await app.inject({
        method: "POST",
        url: "/retrieval-configs",
        payload: {
          name: "vector-unembedded",
          method: "vector",
          params: { embeddingModelId: seeded.embeddingModelId },
        },
      })
    ).json();

    const accepted = (
      await app.inject({
        method: "POST",
        url: "/retrieval-runs",
        payload: {
          query: "refunds",
          documentId: doc.id,
          chunkingConfigId: config.id,
          retrievalConfigIds: [vectorConfig.id],
        },
      })
    ).json();
    const done = await waitForDone(app, accepted.id);
    const results = done.results as { status: string; error: { message: string } }[];
    expect(results[0]!.status).toBe("error");
    expect(results[0]!.error.message).toMatch(/not.*embedded/i);
  });
});

describe("GET /retrieval-runs/:id/stream (SSE)", () => {
  test("emits a snapshot then retrieval_run.done", async () => {
    const { doc, config } = await setupDocumentAndChunks();
    const bm25Config = (
      await app.inject({
        method: "POST",
        url: "/retrieval-configs",
        payload: { name: "bm25-sse", method: "bm25" },
      })
    ).json();

    const sseApp = await buildApp({ db: asDb(handle.db), registry, embeddingRegistry });
    await sseApp.listen({ port: 0, host: "127.0.0.1" });
    const address = sseApp.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const accepted = (
        await sseApp.inject({
          method: "POST",
          url: "/retrieval-runs",
          payload: {
            query: "refunds",
            documentId: doc.id,
            chunkingConfigId: config.id,
            retrievalConfigIds: [bm25Config.id],
          },
        })
      ).json();

      const res = await fetch(`http://127.0.0.1:${port}/retrieval-runs/${accepted.id}/stream`);
      const text = await res.text();
      const events = text
        .split("\n\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice("data: ".length)) as { type: string });

      const types = events.map((e) => e.type);
      expect(types[0]).toBe("snapshot");
      expect(types).toContain("retrieval_run.done");
    } finally {
      await sseApp.close();
    }
  });
});
