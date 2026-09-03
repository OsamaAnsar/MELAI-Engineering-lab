import { describe, expect, test } from "vitest";
import { AnthropicProvider } from "../anthropic.js";
import { stubFetch, stubStreamFetch, type StubRoute } from "../testing.js";
import type { GenerationChunk, GenerationRequest } from "../../types.js";

const MESSAGE_OK = {
  id: "msg_01",
  type: "message",
  role: "assistant",
  model: "claude-opus-5",
  content: [{ type: "text", text: "Doc B adds a refund clause." }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: {
    input_tokens: 1200,
    output_tokens: 40,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
};

function providerWith(routes: StubRoute[]): AnthropicProvider {
  return new AnthropicProvider({ apiKey: "test-key", maxRetries: 0, fetch: stubFetch(routes) });
}

const req = (overrides: Partial<GenerationRequest> = {}): GenerationRequest => ({
  model: "claude-opus-5",
  messages: [{ role: "user", content: "What changed between the docs?" }],
  ...overrides,
});

describe("AnthropicProvider.generate — ModelProvider contract", () => {
  test("normalizes the Anthropic response into a GenerationResult", async () => {
    const provider = providerWith([{ match: /\/v1\/messages$/, body: MESSAGE_OK }]);

    const result = await provider.generate(
      req({
        messages: [
          { role: "system", content: "Be terse." },
          { role: "user", content: "What changed between the docs?" },
        ],
        temperature: 0.2,
        maxOutputTokens: 256,
      }),
    );

    expect(result).toMatchObject({
      text: "Doc B adds a refund clause.",
      model: "claude-opus-5",
      provider: "anthropic",
      providerKind: "cloud",
      usage: { inputTokens: 1200, outputTokens: 40, cachedInputTokens: 0 },
      finishReason: "stop",
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("preserves the raw provider payload", async () => {
    const provider = providerWith([{ match: /\/v1\/messages$/, body: MESSAGE_OK }]);
    const result = await provider.generate(req());
    expect((result.raw as { id?: string }).id).toBe("msg_01");
  });

  test("maps stop_reason 'max_tokens' to finishReason 'length'", async () => {
    const provider = providerWith([
      { match: /\/v1\/messages$/, body: { ...MESSAGE_OK, stop_reason: "max_tokens" } },
    ]);
    expect((await provider.generate(req())).finishReason).toBe("length");
  });

  test("wraps an API error in a thrown Error carrying the status", async () => {
    const provider = providerWith([
      {
        match: /\/v1\/messages$/,
        status: 401,
        body: {
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        },
      },
    ]);
    await expect(provider.generate(req())).rejects.toThrow(/401/);
  });

  test("rejects an aborted request", async () => {
    const provider = providerWith([{ match: /\/v1\/messages$/, body: MESSAGE_OK }]);
    await expect(provider.generate(req({ signal: AbortSignal.abort() }))).rejects.toThrow();
  });
});

describe("AnthropicProvider.stream", () => {
  const SSE = [
    {
      type: "message_start",
      message: {
        id: "msg_stream",
        type: "message",
        role: "assistant",
        model: "claude-opus-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1200, output_tokens: 0 },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Doc B " } },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "adds a refund clause." },
    },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 40 } },
    { type: "message_stop" },
  ]
    .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join("");

  test("yields text deltas then a final usage chunk", async () => {
    const provider = new AnthropicProvider({
      apiKey: "k",
      maxRetries: 0,
      fetch: stubStreamFetch(SSE),
    });

    const chunks: GenerationChunk[] = [];
    for await (const chunk of provider.stream(req())) chunks.push(chunk);

    expect(chunks.map((c) => c.textDelta).join("")).toBe("Doc B adds a refund clause.");
    expect(chunks.at(-1)?.usage?.outputTokens).toBe(40);
  });
});

describe("AnthropicProvider.healthCheck", () => {
  test("true when the models endpoint responds", async () => {
    const provider = providerWith([
      {
        match: /\/v1\/models/,
        body: { data: [{ id: "claude-opus-5", type: "model" }], has_more: false },
      },
    ]);
    expect(await provider.healthCheck()).toBe(true);
  });

  test("false when the models endpoint errors", async () => {
    const provider = providerWith([{ match: /\/v1\/models/, status: 500, body: { error: {} } }]);
    expect(await provider.healthCheck()).toBe(false);
  });
});
