import { Ollama, type AbortableAsyncIterator, type ChatResponse } from "ollama";
import type {
  FinishReason,
  GenerationChunk,
  GenerationRequest,
  GenerationResult,
  ModelProvider,
} from "../types.js";

export interface OllamaProviderOptions {
  /** Defaults to http://localhost:11434. */
  host?: string;
  /** Injectable transport — tests pass a stub instead of a live connection. */
  fetch?: typeof fetch;
}

const DEFAULT_HOST = "http://localhost:11434";
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

function mapDoneReason(reason: string | undefined): FinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    default:
      return "other";
  }
}

/** Ollama reports durations in nanoseconds; surface them as ready-to-display numbers. */
function localMetrics(res: ChatResponse): Record<string, number> {
  const nsToMs = (ns: number) => Math.round(ns / 1e6);
  const metrics: Record<string, number> = {};

  if (res.eval_count > 0 && res.eval_duration > 0) {
    metrics.tokensPerSecond = Math.round((res.eval_count / (res.eval_duration / 1e9)) * 10) / 10;
  }
  if (typeof res.load_duration === "number") metrics.loadMs = nsToMs(res.load_duration);
  if (typeof res.prompt_eval_duration === "number") {
    metrics.promptEvalMs = nsToMs(res.prompt_eval_duration);
  }
  if (typeof res.eval_duration === "number") metrics.evalMs = nsToMs(res.eval_duration);
  if (typeof res.total_duration === "number") metrics.totalMs = nsToMs(res.total_duration);

  return metrics;
}

function toError(err: unknown): Error {
  if (err instanceof Error) return new Error(`Ollama error: ${err.message}`, { cause: err });
  return new Error(`Ollama error: ${String(err)}`);
}

export class OllamaProvider implements ModelProvider {
  readonly id = "ollama";
  readonly kind = "local" as const;

  readonly #host: string;
  readonly #fetch: typeof fetch | undefined;

  constructor(options: OllamaProviderOptions = {}) {
    this.#host = options.host ?? DEFAULT_HOST;
    this.#fetch = options.fetch;
  }

  /** A fresh client per call so an abort only cancels that request. */
  #client(signal?: AbortSignal): Ollama {
    const client = new Ollama({ host: this.#host, fetch: this.#fetch });
    if (signal) {
      if (signal.aborted) client.abort();
      else signal.addEventListener("abort", () => client.abort(), { once: true });
    }
    return client;
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    req.signal?.throwIfAborted();
    const client = this.#client(req.signal);
    const start = performance.now();

    let res: ChatResponse;
    try {
      res = await client.chat({
        model: req.model,
        messages: req.messages,
        stream: false,
        options: {
          temperature: req.temperature,
          num_predict: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        },
      });
    } catch (err) {
      throw toError(err);
    }

    return {
      text: res.message.content,
      model: res.model,
      provider: this.id,
      providerKind: this.kind,
      latencyMs: Math.round(performance.now() - start),
      usage: {
        inputTokens: res.prompt_eval_count,
        outputTokens: res.eval_count,
      },
      estimatedCostUsd: 0,
      finishReason: mapDoneReason(res.done_reason),
      providerMetrics: localMetrics(res),
      raw: res as unknown as Record<string, unknown>,
    };
  }

  async *stream(req: GenerationRequest): AsyncIterable<GenerationChunk> {
    req.signal?.throwIfAborted();
    const client = this.#client(req.signal);

    let iterator: AbortableAsyncIterator<ChatResponse>;
    try {
      iterator = await client.chat({
        model: req.model,
        messages: req.messages,
        stream: true,
        options: {
          temperature: req.temperature,
          num_predict: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        },
      });
    } catch (err) {
      throw toError(err);
    }

    try {
      for await (const part of iterator) {
        if (part.message?.content) yield { textDelta: part.message.content };
        if (part.done) {
          yield {
            textDelta: "",
            usage: { inputTokens: part.prompt_eval_count, outputTokens: part.eval_count },
          };
        }
      }
    } catch (err) {
      throw toError(err);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.#client().list();
      return true;
    } catch {
      return false;
    }
  }
}
