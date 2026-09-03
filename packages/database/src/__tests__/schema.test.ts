import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  experimentRuns,
  experiments,
  models,
  promptVersions,
  prompts,
  providers,
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
