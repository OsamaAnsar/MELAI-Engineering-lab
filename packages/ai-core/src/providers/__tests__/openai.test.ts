import { describe, expect, test } from "vitest";
import { OpenAIProvider } from "../openai.js";
import { stubFetch, stubStreamFetch, type StubRoute } from "../testing.js";
import type { GenerationChunk, GenerationRequest } from "../../types.js";

const COMPLETION_OK = {
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 1_726_000_000,
  model: "gpt-4.1",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Doc B adds a refund clause." },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 1200,
    completion_tokens: 40,
    total_tokens: 1240,
    prompt_tokens_details: { cached_tokens: 200 },
    completion_tokens_details: { reasoning_tokens: 0 },
  },
};

function providerWith(routes: StubRoute[]): OpenAIProvider {
  return new OpenAIProvider({ apiKey: "test-key", maxRetries: 0, fetch: stubFetch(routes) });
}

const req = (overrides: Partial<GenerationRequest> = {}): GenerationRequest => ({
  model: "gpt-4.1",
  messages: [{ role: "user", content: "What changed between the docs?" }],
  ...overrides,
});

describe("OpenAIProvider.generate — ModelProvider contract", () => {
  test("normalizes the OpenAI response, subtracting cached tokens from input", async () => {
    const provider = providerWith([{ match: /\/v1\/chat\/completions$/, body: COMPLETION_OK }]);

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
      model: "gpt-4.1",
      provider: "openai",
      providerKind: "cloud",
      // prompt_tokens 1200 includes 200 cached -> full-price input is 1000
      usage: { inputTokens: 1000, outputTokens: 40, cachedInputTokens: 200 },
      finishReason: "stop",
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("preserves the raw provider payload", async () => {
    const provider = providerWith([{ match: /\/v1\/chat\/completions$/, body: COMPLETION_OK }]);
    const result = await provider.generate(req());
    expect((result.raw as { id?: string }).id).toBe("chatcmpl-1");
  });

  test("maps finish_reason 'length' and omits cached when absent", async () => {
    const provider = providerWith([
      {
        match: /\/v1\/chat\/completions$/,
        body: {
          ...COMPLETION_OK,
          choices: [{ ...COMPLETION_OK.choices[0], finish_reason: "length" }],
          usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        },
      },
    ]);
    const result = await provider.generate(req());
    expect(result.finishReason).toBe("length");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 2 });
  });

  test("wraps an API error in a thrown Error carrying the status", async () => {
    const provider = providerWith([
      {
        match: /\/v1\/chat\/completions$/,
        status: 401,
        body: { error: { message: "Incorrect API key", type: "invalid_request_error" } },
      },
    ]);
    await expect(provider.generate(req())).rejects.toThrow(/401/);
  });

  test("rejects an aborted request", async () => {
    const provider = providerWith([{ match: /\/v1\/chat\/completions$/, body: COMPLETION_OK }]);
    await expect(provider.generate(req({ signal: AbortSignal.abort() }))).rejects.toThrow();
  });
});

describe("OpenAIProvider.stream", () => {
  const chunk = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
  const base = { id: "chatcmpl-1", object: "chat.completion.chunk", created: 1, model: "gpt-4.1" };
  const SSE =
    chunk({
      ...base,
      choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
    }) +
    chunk({ ...base, choices: [{ index: 0, delta: { content: "Doc B " }, finish_reason: null }] }) +
    chunk({
      ...base,
      choices: [{ index: 0, delta: { content: "adds a refund clause." }, finish_reason: null }],
    }) +
    chunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) +
    chunk({
      ...base,
      choices: [],
      usage: {
        prompt_tokens: 1200,
        completion_tokens: 40,
        total_tokens: 1240,
        prompt_tokens_details: { cached_tokens: 200 },
      },
    }) +
    "data: [DONE]\n\n";

  test("yields text deltas then a final usage chunk (with cached subtracted)", async () => {
    const provider = new OpenAIProvider({
      apiKey: "k",
      maxRetries: 0,
      fetch: stubStreamFetch(SSE),
    });

    const chunks: GenerationChunk[] = [];
    for await (const c of provider.stream(req())) chunks.push(c);

    expect(chunks.map((c) => c.textDelta).join("")).toBe("Doc B adds a refund clause.");
    expect(chunks.at(-1)?.usage).toEqual({
      inputTokens: 1000,
      outputTokens: 40,
      cachedInputTokens: 200,
    });
  });
});

describe("OpenAIProvider.healthCheck", () => {
  test("true when the models endpoint responds", async () => {
    const provider = providerWith([
      {
        match: /\/v1\/models/,
        body: { object: "list", data: [{ id: "gpt-4.1", object: "model" }] },
      },
    ]);
    expect(await provider.healthCheck()).toBe(true);
  });

  test("false when the models endpoint errors", async () => {
    const provider = providerWith([{ match: /\/v1\/models/, status: 500, body: { error: {} } }]);
    expect(await provider.healthCheck()).toBe(false);
  });
});
