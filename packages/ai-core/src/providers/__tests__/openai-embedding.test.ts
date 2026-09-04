import { describe, expect, test } from "vitest";
import { OpenAIEmbeddingProvider } from "../openai.js";
import { stubFetch, type StubRoute } from "../testing.js";

const EMBED_OK = {
  object: "list",
  model: "text-embedding-3-small",
  data: [
    { object: "embedding", index: 1, embedding: [0.4, 0.5] },
    { object: "embedding", index: 0, embedding: [0.1, 0.2] },
  ],
  usage: { prompt_tokens: 10, total_tokens: 10 },
};

function providerWith(routes: StubRoute[]): OpenAIEmbeddingProvider {
  return new OpenAIEmbeddingProvider({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: stubFetch(routes),
  });
}

describe("OpenAIEmbeddingProvider.embed", () => {
  test("normalizes the response and re-orders vectors by index", async () => {
    const result = await providerWith([{ match: /\/v1\/embeddings$/, body: EMBED_OK }]).embed({
      model: "text-embedding-3-small",
      texts: ["refunds", "policy"],
    });

    expect(result).toMatchObject({
      model: "text-embedding-3-small",
      provider: "openai",
      providerKind: "cloud",
      usage: { tokens: 10 },
    });
    expect(result.vectors).toEqual([
      [0.1, 0.2],
      [0.4, 0.5],
    ]);
  });

  test("requests dimensions:768 by default so it matches the fixed pgvector column", async () => {
    let capturedBody: unknown;
    const captureFetch: typeof fetch = async (input, init) => {
      capturedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
      return new Response(JSON.stringify(EMBED_OK), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const provider = new OpenAIEmbeddingProvider({
      apiKey: "test-key",
      maxRetries: 0,
      fetch: captureFetch,
    });

    await provider.embed({ model: "text-embedding-3-small", texts: ["x"] });

    expect((capturedBody as { dimensions?: number }).dimensions).toBe(768);
  });

  test("throws a descriptive error on a non-2xx response", async () => {
    const provider = providerWith([
      { match: /\/v1\/embeddings$/, status: 401, body: { error: { message: "bad key" } } },
    ]);
    await expect(provider.embed({ model: "text-embedding-3-small", texts: ["x"] })).rejects.toThrow(
      /OpenAI API error/,
    );
  });

  test("healthCheck reflects the /v1/models response", async () => {
    const healthy = providerWith([{ match: /\/v1\/models$/, body: { data: [] } }]);
    expect(await healthy.healthCheck()).toBe(true);

    const unhealthy = providerWith([{ match: /\/v1\/models$/, status: 500 }]);
    expect(await unhealthy.healthCheck()).toBe(false);
  });
});
