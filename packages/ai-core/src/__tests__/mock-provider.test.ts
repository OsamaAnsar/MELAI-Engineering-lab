import { describe, expect, test } from "vitest";
import { MockProvider } from "../mock-provider.js";
import type { GenerationChunk, GenerationRequest } from "../types.js";

const req = (overrides: Partial<GenerationRequest> = {}): GenerationRequest => ({
  model: "mock-model",
  messages: [{ role: "user", content: "hello there" }],
  ...overrides,
});

describe("MockProvider.generate", () => {
  test("returns a well-formed GenerationResult", async () => {
    const p = new MockProvider({
      id: "mock",
      response: "hi",
      usage: { inputTokens: 10, outputTokens: 1 },
    });

    const result = await p.generate(req());

    expect(result).toMatchObject({
      text: "hi",
      model: "mock-model",
      provider: "mock",
      providerKind: "cloud",
      usage: { inputTokens: 10, outputTokens: 1 },
      finishReason: "stop",
      latencyMs: 0,
      raw: { mock: true },
    });
  });

  test("defaults to echoing the last user message, with rough word-count usage", async () => {
    const result = await new MockProvider().generate(
      req({ messages: [{ role: "user", content: "one two three" }] }),
    );
    expect(result.text).toBe("one two three");
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 3 });
  });

  test("response and usage can be functions of the request", async () => {
    const p = new MockProvider({
      response: (r) => `saw ${r.messages.length} messages`,
      usage: (r) => ({ outputTokens: r.messages.length }),
    });
    const result = await p.generate(req());
    expect(result.text).toBe("saw 1 messages");
    expect(result.usage).toEqual({ outputTokens: 1 });
  });

  test("reports the configured latency deterministically", async () => {
    const result = await new MockProvider({ latencyMs: 25 }).generate(req());
    expect(result.latencyMs).toBe(25);
  });

  test("failWith makes generate reject", async () => {
    const p = new MockProvider({ failWith: new Error("provider exploded") });
    await expect(p.generate(req())).rejects.toThrow("provider exploded");
  });

  test("respects an already-aborted signal", async () => {
    const p = new MockProvider({ latencyMs: 1_000 });
    await expect(p.generate(req({ signal: AbortSignal.abort() }))).rejects.toThrow(/abort/i);
  });

  test("respects a signal aborted mid-flight", async () => {
    const p = new MockProvider({ latencyMs: 1_000 });
    const controller = new AbortController();
    const promise = p.generate(req({ signal: controller.signal }));
    controller.abort();
    await expect(promise).rejects.toThrow(/abort/i);
  });
});

describe("MockProvider.stream", () => {
  test("yields the full text, then a final chunk carrying usage", async () => {
    const p = new MockProvider({ response: "alpha beta gamma", usage: { outputTokens: 3 } });

    const chunks: GenerationChunk[] = [];
    for await (const chunk of p.stream(req())) chunks.push(chunk);

    expect(chunks.map((c) => c.textDelta).join("")).toBe("alpha beta gamma");
    expect(chunks.at(-1)).toEqual({ textDelta: "", usage: { outputTokens: 3 } });
  });

  test("failWith makes stream reject", async () => {
    const p = new MockProvider({ failWith: new Error("no stream") });
    await expect(async () => {
      for await (const _ of p.stream(req())) {
        void _;
      }
    }).rejects.toThrow("no stream");
  });
});

describe("MockProvider.healthCheck", () => {
  test("reflects the healthy option", async () => {
    expect(await new MockProvider().healthCheck()).toBe(true);
    expect(await new MockProvider({ healthy: false }).healthCheck()).toBe(false);
  });
});
