import { describe, expect, test } from "vitest";
import { OllamaEmbeddingProvider } from "../ollama.js";
import { stubFetch, type StubRoute } from "../testing.js";

const EMBED_OK = {
  model: "nomic-embed-text",
  embeddings: [
    [0.1, 0.2, 0.3],
    [0.4, 0.5, 0.6],
  ],
  total_duration: 1_000_000_000,
  load_duration: 100_000_000,
  prompt_eval_count: 12,
};

function providerWith(routes: StubRoute[]): OllamaEmbeddingProvider {
  return new OllamaEmbeddingProvider({ fetch: stubFetch(routes) });
}

describe("OllamaEmbeddingProvider.embed", () => {
  test("normalizes the response and marks it local + zero cost", async () => {
    const result = await providerWith([{ match: /\/api\/embed$/, body: EMBED_OK }]).embed({
      model: "nomic-embed-text",
      texts: ["refunds", "policy"],
    });

    expect(result).toMatchObject({
      model: "nomic-embed-text",
      provider: "ollama",
      providerKind: "local",
      estimatedCostUsd: 0,
      usage: { tokens: 12 },
    });
    expect(result.vectors).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("wraps a transport failure with a descriptive error", async () => {
    const provider = providerWith([
      { match: /\/api\/embed$/, status: 500, body: { error: "boom" } },
    ]);
    await expect(provider.embed({ model: "nomic-embed-text", texts: ["x"] })).rejects.toThrow(
      /Ollama error/,
    );
  });

  test("healthCheck reflects the /api/tags response", async () => {
    const healthy = new OllamaEmbeddingProvider({
      fetch: stubFetch([{ match: /\/api\/tags$/, body: { models: [] } }]),
    });
    expect(await healthy.healthCheck()).toBe(true);

    const unhealthy = new OllamaEmbeddingProvider({
      fetch: stubFetch([{ match: /\/api\/tags$/, status: 500 }]),
    });
    expect(await unhealthy.healthCheck()).toBe(false);
  });
});
