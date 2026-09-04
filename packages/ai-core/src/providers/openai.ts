import OpenAI from "openai";
import type {
  FinishReason,
  GenerationChunk,
  GenerationRequest,
  GenerationResult,
  ModelProvider,
  TokenUsage,
} from "../types.js";
import type { EmbeddingProvider, EmbeddingRequest, EmbeddingResult } from "../embedding-types.js";

export interface OpenAIProviderOptions {
  apiKey: string;
  baseURL?: string;
  maxRetries?: number;
  /** Injectable transport — tests pass a stub instead of a live connection. */
  fetch?: typeof fetch;
}

const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

function mapFinishReason(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    default:
      return "other";
  }
}

/**
 * OpenAI reports `prompt_tokens` *including* any cache hits, so we subtract the
 * cached portion to keep `inputTokens` meaning "full-price input" — the same
 * convention every adapter in this package follows.
 */
function normalizeUsage(usage: OpenAI.CompletionUsage | null | undefined): TokenUsage {
  if (!usage) return {};
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: Math.max(0, (usage.prompt_tokens ?? 0) - cached),
    outputTokens: usage.completion_tokens ?? undefined,
    cachedInputTokens: cached > 0 ? cached : undefined,
  };
}

function toError(err: unknown): Error {
  if (err instanceof OpenAI.APIError) {
    const status = typeof err.status === "number" ? ` ${err.status}` : "";
    return new Error(`OpenAI API error${status}: ${err.message}`, { cause: err });
  }
  return err instanceof Error ? err : new Error(String(err));
}

export class OpenAIProvider implements ModelProvider {
  readonly id = "openai";
  readonly kind = "cloud" as const;

  readonly #client: OpenAI;

  constructor(options: OpenAIProviderOptions) {
    this.#client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      maxRetries: options.maxRetries ?? 2,
      fetch: options.fetch,
    });
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const start = performance.now();

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await this.#client.chat.completions.create(
        {
          model: req.model,
          messages: req.messages,
          max_completion_tokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          temperature: req.temperature,
        },
        { signal: req.signal },
      );
    } catch (err) {
      throw toError(err);
    }

    const latencyMs = Math.round(performance.now() - start);
    const choice = completion.choices[0];

    return {
      text: choice?.message.content ?? "",
      model: completion.model,
      provider: this.id,
      providerKind: this.kind,
      latencyMs,
      usage: normalizeUsage(completion.usage),
      finishReason: mapFinishReason(choice?.finish_reason),
      raw: completion as unknown as Record<string, unknown>,
    };
  }

  async *stream(req: GenerationRequest): AsyncIterable<GenerationChunk> {
    let stream: Awaited<ReturnType<typeof this.createStream>>;
    try {
      stream = await this.createStream(req);
    } catch (err) {
      throw toError(err);
    }

    let finalUsage: TokenUsage = {};
    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta.content;
        if (delta) yield { textDelta: delta };
        if (chunk.usage) finalUsage = normalizeUsage(chunk.usage);
      }
    } catch (err) {
      throw toError(err);
    }

    yield { textDelta: "", usage: finalUsage };
  }

  private createStream(req: GenerationRequest) {
    return this.#client.chat.completions.create(
      {
        model: req.model,
        messages: req.messages,
        max_completion_tokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: req.temperature,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: req.signal },
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.#client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}

/** Requests `dimensions: 768` so its output shares the fixed pgvector column width with Ollama's nomic-embed-text. */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id = "openai";
  readonly kind = "cloud" as const;

  readonly #client: OpenAI;
  readonly #dimensions: number;

  constructor(options: OpenAIProviderOptions & { dimensions?: number }) {
    this.#client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      maxRetries: options.maxRetries ?? 2,
      fetch: options.fetch,
    });
    this.#dimensions = options.dimensions ?? 768;
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResult> {
    const start = performance.now();

    let res: OpenAI.CreateEmbeddingResponse;
    try {
      res = await this.#client.embeddings.create(
        {
          model: req.model,
          input: req.texts,
          dimensions: this.#dimensions,
          // Explicit, so the SDK returns plain float arrays instead of its
          // default base64-on-the-wire encoding (decoded client-side).
          encoding_format: "float",
        },
        { signal: req.signal },
      );
    } catch (err) {
      throw toError(err);
    }

    return {
      vectors: res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
      model: res.model,
      provider: this.id,
      providerKind: this.kind,
      latencyMs: Math.round(performance.now() - start),
      usage: { tokens: res.usage.total_tokens },
      raw: res as unknown as Record<string, unknown>,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.#client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
