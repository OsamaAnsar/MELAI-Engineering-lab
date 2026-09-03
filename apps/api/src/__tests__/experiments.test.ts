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

// PGlite and postgres-js Drizzle clients are the same API over the same wire
// protocol; the service is written against the production (postgres-js) type.
const asDb = (db: TestDatabaseHandle["db"]): Database => db as unknown as Database;

const registry = registryFromMap(
  new Map([
    [
      "anthropic",
      new MockProvider({
        id: "anthropic",
        response: "from anthropic",
        usage: { inputTokens: 12, outputTokens: 4 },
      }),
    ],
    [
      "openai",
      new MockProvider({
        id: "openai",
        response: "from openai",
        usage: { inputTokens: 10, outputTokens: 3 },
      }),
    ],
    [
      "ollama",
      new MockProvider({
        id: "ollama",
        kind: "local",
        response: "from ollama",
        usage: { inputTokens: 8, outputTokens: 2 },
      }),
    ],
  ]),
);

const seeded = {
  anthropicModelId: "",
  ollamaModelId: "",
  promptVersionId: "",
};

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

describe("registry + prompt routes", () => {
  test("GET /models returns seeded models with their provider", async () => {
    const res = await app.inject({ method: "GET", url: "/models" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.models).toHaveLength(2);
    expect(body.models.map((m: { name: string }) => m.name).sort()).toEqual([
      "claude-opus-5",
      "qwen2.5:7b",
    ]);
  });

  test("POST /prompts then POST /prompts/:id/versions increments the version", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/prompts",
      payload: { name: "greet" },
    });
    expect(created.statusCode).toBe(201);
    const promptId = created.json().id;

    const v1 = await app.inject({
      method: "POST",
      url: `/prompts/${promptId}/versions`,
      payload: { template: "Hello {{name}}" },
    });
    expect(v1.statusCode).toBe(201);
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
  test("runs every model, persists metrics, computes cost from pricing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/experiments",
      payload: {
        name: "baseline",
        promptVersionId: seeded.promptVersionId,
        inputVariables: { topic: "refund policy" },
        config: { temperature: 0.1, maxOutputTokens: 128 },
        modelIds: [seeded.anthropicModelId, seeded.ollamaModelId],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.runs).toHaveLength(2);

    for (const run of body.runs) {
      expect(run.status).toBe("success");
      expect(typeof run.responseText).toBe("string");
      expect(run.latencyMs).toBeGreaterThanOrEqual(0);
    }

    const anthropicRun = body.runs.find(
      (r: { model: { name: string } }) => r.model.name === "claude-opus-5",
    );
    // input 12, output 4 -> 12/1e6*5 + 4/1e6*25 = 0.00016
    expect(anthropicRun.estimatedCostUsd).toBeCloseTo(0.00016, 9);
    expect(anthropicRun.inputTokens).toBe(12);

    const ollamaRun = body.runs.find(
      (r: { model: { name: string } }) => r.model.name === "qwen2.5:7b",
    );
    expect(ollamaRun.estimatedCostUsd).toBe(0);
    expect(ollamaRun.model.providerKind).toBe("local");
  });

  test("records a per-run error without failing the others", async () => {
    const failRegistry = registryFromMap(
      new Map([
        ["anthropic", new MockProvider({ failWith: new Error("boom") })],
        ["ollama", new MockProvider({ id: "ollama", response: "ok" })],
      ]),
    );
    const failApp = await buildApp({ db: asDb(handle.db), registry: failRegistry });

    const res = await failApp.inject({
      method: "POST",
      url: "/experiments",
      payload: {
        name: "mixed",
        promptVersionId: seeded.promptVersionId,
        inputVariables: { topic: "x" },
        modelIds: [seeded.anthropicModelId, seeded.ollamaModelId],
      },
    });

    const runs = res.json().runs;
    const byName = Object.fromEntries(
      runs.map((r: { model: { name: string } }) => [r.model.name, r]),
    );
    expect(byName["claude-opus-5"].status).toBe("error");
    expect(byName["claude-opus-5"].error.message).toContain("boom");
    expect(byName["qwen2.5:7b"].status).toBe("success");

    await failApp.close();
  });

  test("400 when a template variable is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/experiments",
      payload: {
        name: "bad",
        promptVersionId: seeded.promptVersionId,
        inputVariables: {},
        modelIds: [seeded.anthropicModelId],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("topic");
  });

  test("400 on an invalid spec", async () => {
    const res = await app.inject({ method: "POST", url: "/experiments", payload: { name: "" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /experiments and rerun", () => {
  test("detail and history reflect a completed experiment; rerun makes a new one", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/experiments",
      payload: {
        name: "run-me",
        promptVersionId: seeded.promptVersionId,
        inputVariables: { topic: "t" },
        modelIds: [seeded.anthropicModelId],
      },
    });
    const id = created.json().id;

    const detail = await app.inject({ method: "GET", url: `/experiments/${id}` });
    expect(detail.json().prompt.template).toBe("Summarize: {{topic}}");

    const history = await app.inject({ method: "GET", url: "/experiments" });
    expect(history.json().experiments[0]).toMatchObject({ id, total: 1, succeeded: 1 });

    const rerun = await app.inject({ method: "POST", url: `/experiments/${id}/rerun` });
    expect(rerun.statusCode).toBe(201);
    expect(rerun.json().id).not.toBe(id);
    expect(rerun.json().name).toBe("run-me (rerun)");
  });

  test("404 for an unknown experiment", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/experiments/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /health", () => {
  test("reports the db check", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json()).toMatchObject({ status: "ok", checks: { db: true } });
  });
});
