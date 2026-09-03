import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { MockProvider } from "@melai/ai-core";
import {
  experimentRuns,
  experiments,
  models,
  promptVersions,
  prompts,
  providers,
  type Database,
} from "@melai/database";
import { createTestDatabase, type TestDatabaseHandle } from "@melai/database/testing";
import { buildApp } from "../app.js";
import { registryFromMap } from "../providers.js";

let handle: TestDatabaseHandle;
let app: FastifyInstance;

// PGlite and postgres-js Drizzle clients share an API over the same wire protocol;
// the service is written against the production (postgres-js) type.
const asDb = (db: TestDatabaseHandle["db"]): Database => db as unknown as Database;

const mock = (id: string, kind?: "cloud" | "local") =>
  new MockProvider({
    id,
    kind,
    response: `from ${id}`,
    usage: { inputTokens: 12, outputTokens: 4 },
  });

const registry = registryFromMap(
  new Map([
    ["anthropic", mock("anthropic")],
    ["openai", mock("openai")],
    ["ollama", mock("ollama", "local")],
  ]),
);

/** Poll the detail endpoint until no run is still pending/running. */
async function waitForDone(
  a: FastifyInstance,
  id: string,
  tries = 100,
): Promise<Record<string, unknown>> {
  for (let i = 0; i < tries; i++) {
    const res = await a.inject({ method: "GET", url: `/experiments/${id}` });
    const body = res.json();
    if (!body.pending) return body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`experiment ${id} did not finish`);
}

const seeded = { anthropicModelId: "", ollamaModelId: "", promptVersionId: "" };

beforeAll(async () => {
  handle = await createTestDatabase();
  app = await buildApp({ db: asDb(handle.db), registry });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

beforeEach(async () => {
  const { db } = handle;
  await db.delete(experimentRuns);
  await db.delete(experiments);
  await db.delete(models);
  await db.delete(promptVersions);
  await db.delete(prompts);
  await db.delete(providers);

  const provRows = await db
    .insert(providers)
    .values([
      { name: "anthropic", kind: "cloud" },
      { name: "openai", kind: "cloud" },
      { name: "ollama", kind: "local" },
    ])
    .returning();
  const byName = Object.fromEntries(provRows.map((p) => [p.name, p.id]));

  const modelRows = await db
    .insert(models)
    .values([
      {
        providerId: byName.anthropic!,
        name: "claude-opus-5",
        displayName: "Claude Opus 5",
        inputPricePerMtok: "5.000000",
        outputPricePerMtok: "25.000000",
      },
      {
        providerId: byName.ollama!,
        name: "qwen2.5:7b",
        displayName: "Qwen 7B (local)",
        inputPricePerMtok: "0.000000",
        outputPricePerMtok: "0.000000",
      },
    ])
    .returning();
  seeded.anthropicModelId = modelRows[0]!.id;
  seeded.ollamaModelId = modelRows[1]!.id;

  const [prompt] = await db.insert(prompts).values({ name: "compare" }).returning();
  const [pv] = await db
    .insert(promptVersions)
    .values({
      promptId: prompt!.id,
      version: 1,
      template: "Summarize: {{topic}}",
      variables: ["topic"],
    })
    .returning();
  seeded.promptVersionId = pv!.id;
});

const runPayload = (overrides: Record<string, unknown> = {}) => ({
  name: "baseline",
  promptVersionId: seeded.promptVersionId,
  inputVariables: { topic: "refund policy" },
  modelIds: [seeded.anthropicModelId, seeded.ollamaModelId],
  ...overrides,
});

describe("registry + prompt routes", () => {
  test("GET /models returns seeded models with their provider", async () => {
    const body = (await app.inject({ method: "GET", url: "/models" })).json();
    expect(body.models.map((m: { name: string }) => m.name).sort()).toEqual([
      "claude-opus-5",
      "qwen2.5:7b",
    ]);
  });

  test("POST /prompts then /versions increments the version and extracts variables", async () => {
    const promptId = (
      await app.inject({ method: "POST", url: "/prompts", payload: { name: "greet" } })
    ).json().id;

    const v1 = await app.inject({
      method: "POST",
      url: `/prompts/${promptId}/versions`,
      payload: { template: "Hello {{name}}" },
    });
    expect(v1.json()).toMatchObject({ version: 1, variables: ["name"] });

    const v2 = await app.inject({
      method: "POST",
      url: `/prompts/${promptId}/versions`,
      payload: { template: "Hi {{name}} and {{other}}" },
    });
    expect(v2.json()).toMatchObject({ version: 2, variables: ["name", "other"] });
  });
});

describe("POST /experiments", () => {
  test("returns 202 with pending runs, then finishes with metrics + cost", async () => {
    const res = await app.inject({ method: "POST", url: "/experiments", payload: runPayload() });
    expect(res.statusCode).toBe(202);
    const accepted = res.json();
    expect(accepted.pending).toBe(true);
    expect(accepted.runs).toHaveLength(2);
    expect(accepted.runs.every((r: { status: string }) => r.status === "pending")).toBe(true);

    const done = await waitForDone(app, accepted.id);
    const runs = done.runs as {
      status: string;
      model: { name: string; providerKind: string };
      estimatedCostUsd: number;
      inputTokens: number;
      latencyMs: number;
    }[];

    for (const run of runs) {
      expect(run.status).toBe("success");
      expect(run.latencyMs).toBeGreaterThanOrEqual(0);
    }

    const anthropic = runs.find((r) => r.model.name === "claude-opus-5")!;
    // 12/1e6*5 + 4/1e6*25 = 0.00016
    expect(anthropic.estimatedCostUsd).toBeCloseTo(0.00016, 9);
    expect(anthropic.inputTokens).toBe(12);

    const ollama = runs.find((r) => r.model.name === "qwen2.5:7b")!;
    expect(ollama.estimatedCostUsd).toBe(0);
    expect(ollama.model.providerKind).toBe("local");
  });

  test("records a per-run error without failing the others", async () => {
    const failApp = await buildApp({
      db: asDb(handle.db),
      registry: registryFromMap(
        new Map([
          ["anthropic", new MockProvider({ failWith: new Error("boom") })],
          ["ollama", mock("ollama", "local")],
        ]),
      ),
    });

    const accepted = (
      await failApp.inject({
        method: "POST",
        url: "/experiments",
        payload: runPayload({ name: "mixed" }),
      })
    ).json();
    const done = await waitForDone(failApp, accepted.id);

    const byName = Object.fromEntries(
      (done.runs as { model: { name: string } }[]).map((r) => [r.model.name, r]),
    ) as unknown as Record<string, { status: string; error: { message: string } }>;
    expect(byName["claude-opus-5"]!.status).toBe("error");
    expect(byName["claude-opus-5"]!.error.message).toContain("boom");
    expect(byName["qwen2.5:7b"]!.status).toBe("success");

    await failApp.close();
  });

  test("400 when a template variable is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/experiments",
      payload: runPayload({ inputVariables: {}, modelIds: [seeded.anthropicModelId] }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("topic");
  });

  test("400 on an invalid spec", async () => {
    const res = await app.inject({ method: "POST", url: "/experiments", payload: { name: "" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /experiments/:id/stream (SSE)", () => {
  test("emits a snapshot then experiment.done", async () => {
    const sseApp = await buildApp({ db: asDb(handle.db), registry });
    await sseApp.listen({ port: 0, host: "127.0.0.1" });
    const address = sseApp.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const accepted = (
        await sseApp.inject({
          method: "POST",
          url: "/experiments",
          payload: runPayload({ name: "streamed" }),
        })
      ).json();

      const res = await fetch(`http://127.0.0.1:${port}/experiments/${accepted.id}/stream`);
      const text = await res.text();
      const events = text
        .split("\n\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice("data: ".length)) as { type: string });

      const types = events.map((e) => e.type);
      expect(types[0]).toBe("snapshot");
      expect(types).toContain("experiment.done");
    } finally {
      await sseApp.close();
    }
  });
});

describe("GET /experiments, rerun, health", () => {
  test("history reflects a completed experiment; rerun makes a new one (202)", async () => {
    const accepted = (
      await app.inject({
        method: "POST",
        url: "/experiments",
        payload: runPayload({ name: "run-me", modelIds: [seeded.anthropicModelId] }),
      })
    ).json();
    await waitForDone(app, accepted.id);

    const history = (await app.inject({ method: "GET", url: "/experiments" })).json();
    expect(history.experiments[0]).toMatchObject({ id: accepted.id, total: 1, succeeded: 1 });

    const rerun = await app.inject({ method: "POST", url: `/experiments/${accepted.id}/rerun` });
    expect(rerun.statusCode).toBe(202);
    expect(rerun.json().id).not.toBe(accepted.id);
    expect(rerun.json().name).toBe("run-me (rerun)");
    await waitForDone(app, rerun.json().id);
  });

  test("404 for an unknown experiment", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/experiments/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(404);
  });

  test("GET /health reports the db check", async () => {
    expect((await app.inject({ method: "GET", url: "/health" })).json()).toMatchObject({
      status: "ok",
      checks: { db: true },
    });
  });
});
