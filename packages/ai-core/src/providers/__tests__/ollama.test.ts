import { describe, expect, test } from "vitest";
import { OllamaProvider } from "../ollama.js";
import { stubFetch, stubStreamFetch, type StubRoute } from "../testing.js";
import type { GenerationChunk, GenerationRequest } from "../../types.js";

const CHAT_OK = {
  model: "qwen2.5:7b-instruct",
  created_at: "2026-09-03T12:00:00Z",
  message: { role: "assistant", content: "Doc B adds a refund clause." },
  done: true,
  done_reason: "stop",
  total_duration: 2_400_000_000,
  load_duration: 300_000_000,
  prompt_eval_count: 1200,
  prompt_eval_duration: 500_000_000,
  eval_count: 40,
  eval_duration: 1_000_000_000,
};

function providerWith(routes: StubRoute[]): OllamaProvider {
  return new OllamaProvider({ fetch: stubFetch(routes) });
}

const req = (overrides: Partial<GenerationRequest> = {}): GenerationRequest => ({
  model: "qwen2.5:7b-instruct",
  messages: [{ role: "user", content: "What changed between the docs?" }],
  ...overrides,
});

describe("OllamaProvider.generate — ModelProvider contract", () => {
  test("normalizes the response and marks it local + zero cost", async () => {
    const result = await providerWith([{ match: /\/api\/chat$/, body: CHAT_OK }]).generate(req());

    expect(result).toMatchObject({
      text: "Doc B adds a refund clause.",
      model: "qwen2.5:7b-instruct",
      provider: "ollama",
      providerKind: "local",
      estimatedCostUsd: 0,
      usage: { inputTokens: 1200, outputTokens: 40 },
      finishReason: "stop",
    });
    expect(result.usage.cachedInputTokens).toBeUndefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("derives local telemetry from the nanosecond durations", async () => {
    const result = await providerWith([{ match: /\/api\/chat$/, body: CHAT_OK }]).generate(req());
    // 40 tokens over 1s = 40 tok/s; durations converted ns -> ms
    expect(result.providerMetrics).toEqual({
      tokensPerSecond: 40,
      loadMs: 300,
      promptEvalMs: 500,
      evalMs: 1000,
      totalMs: 2400,
    });
  });

  test("preserves the raw provider payload", async () => {
    const result = await providerWith([{ match: /\/api\/chat$/, body: CHAT_OK }]).generate(req());
    expect((result.raw as { done_reason?: string }).done_reason).toBe("stop");
  });

  test("wraps a server error in a thrown Error", async () => {
    const provider = providerWith([
      { match: /\/api\/chat$/, status: 500, body: { error: "model not found" } },
    ]);
    await expect(provider.generate(req())).rejects.toThrow(/Ollama error/);
  });

  test("rejects an aborted request", async () => {
    const provider = providerWith([{ match: /\/api\/chat$/, body: CHAT_OK }]);
    await expect(provider.generate(req({ signal: AbortSignal.abort() }))).rejects.toThrow();
  });
});

describe("OllamaProvider.stream", () => {
  const NDJSON =
    [
      {
        model: "qwen2.5:7b-instruct",
        message: { role: "assistant", content: "Doc B " },
        done: false,
      },
      {
        model: "qwen2.5:7b-instruct",
        message: { role: "assistant", content: "adds a refund clause." },
        done: false,
      },
      {
        model: "qwen2.5:7b-instruct",
        message: { role: "assistant", content: "" },
        done: true,
        done_reason: "stop",
        total_duration: 2_400_000_000,
        load_duration: 300_000_000,
        prompt_eval_count: 1200,
        prompt_eval_duration: 500_000_000,
        eval_count: 40,
        eval_duration: 1_000_000_000,
      },
    ]
      .map((o) => JSON.stringify(o))
      .join("\n") + "\n";

  test("yields text deltas then a final usage chunk", async () => {
    const provider = new OllamaProvider({
      fetch: stubStreamFetch(NDJSON, "application/x-ndjson"),
    });

    const chunks: GenerationChunk[] = [];
    for await (const c of provider.stream(req())) chunks.push(c);

    expect(chunks.map((c) => c.textDelta).join("")).toBe("Doc B adds a refund clause.");
    expect(chunks.at(-1)?.usage).toEqual({ inputTokens: 1200, outputTokens: 40 });
  });
});

describe("OllamaProvider.healthCheck", () => {
  test("true when /api/tags responds", async () => {
    const provider = providerWith([{ match: /\/api\/tags$/, body: { models: [] } }]);
    expect(await provider.healthCheck()).toBe(true);
  });

  test("false when /api/tags errors", async () => {
    const provider = providerWith([{ match: /\/api\/tags$/, status: 500, body: { error: "x" } }]);
    expect(await provider.healthCheck()).toBe(false);
  });
});
