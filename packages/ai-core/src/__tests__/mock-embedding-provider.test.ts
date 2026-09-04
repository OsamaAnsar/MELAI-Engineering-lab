import { describe, expect, test } from "vitest";
import { MockEmbeddingProvider } from "../mock-embedding-provider.js";

describe("MockEmbeddingProvider", () => {
  test("returns one vector per input text, at the configured dimension", async () => {
    const provider = new MockEmbeddingProvider({ dimensions: 16 });
    const result = await provider.embed({ model: "mock-embed", texts: ["a", "b", "c"] });
    expect(result.vectors).toHaveLength(3);
    for (const v of result.vectors) expect(v).toHaveLength(16);
  });

  test("is deterministic: identical text produces an identical vector", async () => {
    const provider = new MockEmbeddingProvider();
    const [v1] = (await provider.embed({ model: "m", texts: ["hello world"] })).vectors;
    const [v2] = (await provider.embed({ model: "m", texts: ["hello world"] })).vectors;
    expect(v1).toEqual(v2);
  });

  test("different text produces a different vector", async () => {
    const provider = new MockEmbeddingProvider();
    const [v1] = (await provider.embed({ model: "m", texts: ["hello"] })).vectors;
    const [v2] = (await provider.embed({ model: "m", texts: ["goodbye"] })).vectors;
    expect(v1).not.toEqual(v2);
  });

  test("vectors are unit length", async () => {
    const provider = new MockEmbeddingProvider({ dimensions: 8 });
    const [v] = (await provider.embed({ model: "m", texts: ["some text"] })).vectors;
    const norm = Math.sqrt(v!.reduce((sum, x) => sum + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  test("marks itself local-free by default kind and zero-cost fields untouched", async () => {
    const provider = new MockEmbeddingProvider();
    const result = await provider.embed({ model: "m", texts: ["x"] });
    expect(result.provider).toBe("mock");
    expect(result.estimatedCostUsd).toBeUndefined();
  });

  test("counts usage tokens as whitespace words across all texts", async () => {
    const provider = new MockEmbeddingProvider();
    const result = await provider.embed({ model: "m", texts: ["one two", "three"] });
    expect(result.usage.tokens).toBe(3);
  });

  test("rejects with failWith when configured", async () => {
    const err = new Error("boom");
    const provider = new MockEmbeddingProvider({ failWith: err });
    await expect(provider.embed({ model: "m", texts: ["x"] })).rejects.toBe(err);
  });

  test("healthCheck resolves to the configured value", async () => {
    expect(await new MockEmbeddingProvider({ healthy: false }).healthCheck()).toBe(false);
    expect(await new MockEmbeddingProvider().healthCheck()).toBe(true);
  });
});
