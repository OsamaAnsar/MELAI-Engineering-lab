import type {
  FinishReason,
  GenerationChunk,
  GenerationRequest,
  GenerationResult,
  ModelProvider,
  ProviderKind,
  TokenUsage,
} from "./types.js";

type Responder = string | ((req: GenerationRequest) => string);
type Usager = TokenUsage | ((req: GenerationRequest) => TokenUsage);

export interface MockProviderOptions {
  id?: string;
  kind?: ProviderKind;
  /** Text to return, or a function of the request. Default: echoes the last user message. */
  response?: Responder;
  /** Deterministic latency reported on the result (ms). Default 0. */
  latencyMs?: number;
  /** Usage to report, or a function of the request. Default: rough word counts. */
  usage?: Usager;
  finishReason?: FinishReason;
  /** When set, generate() and stream() reject with this. */
  failWith?: Error;
  /** What healthCheck() resolves to. Default true. */
  healthy?: boolean;
}

function lastUserMessage(req: GenerationRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i];
    if (m && m.role === "user") return m.content;
  }
  return "";
}

function roughUsage(req: GenerationRequest, responseText: string): TokenUsage {
  const words = (text: string) => (text.trim() === "" ? 0 : text.trim().split(/\s+/).length);
  return {
    inputTokens: req.messages.reduce((n, m) => n + words(m.content), 0),
    outputTokens: words(responseText),
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("Aborted"));
      },
      { once: true },
    );
  });
}

/**
 * A deterministic in-memory {@link ModelProvider}. Lets the API, the experiment
 * runner and the UI be tested with no API keys, no Ollama and no network.
 */
export class MockProvider implements ModelProvider {
  readonly id: string;
  readonly kind: ProviderKind;

  readonly #response: Responder;
  readonly #latencyMs: number;
  readonly #usage: Usager | undefined;
  readonly #finishReason: FinishReason;
  readonly #failWith: Error | undefined;
  readonly #healthy: boolean;

  constructor(options: MockProviderOptions = {}) {
    this.id = options.id ?? "mock";
    this.kind = options.kind ?? "cloud";
    this.#response = options.response ?? ((req) => lastUserMessage(req));
    this.#latencyMs = options.latencyMs ?? 0;
    this.#usage = options.usage;
    this.#finishReason = options.finishReason ?? "stop";
    this.#failWith = options.failWith;
    this.#healthy = options.healthy ?? true;
  }

  #resolve(req: GenerationRequest): { text: string; usage: TokenUsage } {
    const text = typeof this.#response === "function" ? this.#response(req) : this.#response;
    const usage =
      this.#usage === undefined
        ? roughUsage(req, text)
        : typeof this.#usage === "function"
          ? this.#usage(req)
          : this.#usage;
    return { text, usage };
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    if (this.#failWith) throw this.#failWith;
    await sleep(this.#latencyMs, req.signal);

    const { text, usage } = this.#resolve(req);
    return {
      text,
      model: req.model,
      provider: this.id,
      providerKind: this.kind,
      latencyMs: this.#latencyMs,
      usage,
      finishReason: this.#finishReason,
      raw: { mock: true },
    };
  }

  async *stream(req: GenerationRequest): AsyncIterable<GenerationChunk> {
    if (this.#failWith) throw this.#failWith;

    const { text, usage } = this.#resolve(req);
    const parts = text.match(/\S+\s*|\s+/g) ?? [];
    const perPart = parts.length > 0 ? this.#latencyMs / parts.length : 0;

    for (const part of parts) {
      await sleep(perPart, req.signal);
      yield { textDelta: part };
    }
    yield { textDelta: "", usage };
  }

  async healthCheck(): Promise<boolean> {
    return this.#healthy;
  }
}
