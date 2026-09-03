import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatMessage,
  FinishReason,
  GenerationChunk,
  GenerationRequest,
  GenerationResult,
  ModelProvider,
} from "../types.js";

export interface AnthropicProviderOptions {
  apiKey: string;
  baseURL?: string;
  maxRetries?: number;
  /** Injectable transport — tests pass a stub instead of a live connection. */
  fetch?: typeof fetch;
}

const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

/**
 * Anthropic wants the system prompt as a top-level string and only user/assistant
 * turns in `messages`, so we lift every system message out and concatenate them.
 */
function splitSystem(messages: ChatMessage[]): {
  system: string | undefined;
  turns: Anthropic.MessageParam[];
} {
  const systemParts: string[] = [];
  const turns: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "system") systemParts.push(m.content);
    else turns.push({ role: m.role, content: m.content });
  }
  return { system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined, turns };
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function mapStopReason(reason: Anthropic.Message["stop_reason"]): FinishReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "refusal":
      return "content_filter";
    default:
      return "other";
  }
}

function toError(err: unknown): Error {
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === "number" ? ` ${err.status}` : "";
    return new Error(`Anthropic API error${status}: ${err.message}`, { cause: err });
  }
  return err instanceof Error ? err : new Error(String(err));
}

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  readonly kind = "cloud" as const;

  readonly #client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.#client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      maxRetries: options.maxRetries ?? 2,
      fetch: options.fetch,
    });
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const { system, turns } = splitSystem(req.messages);
    const start = performance.now();

    let message: Anthropic.Message;
    try {
      message = await this.#client.messages.create(
        {
          model: req.model,
          max_tokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          temperature: req.temperature,
          system,
          messages: turns,
        },
        { signal: req.signal },
      );
    } catch (err) {
      throw toError(err);
    }

    const latencyMs = Math.round(performance.now() - start);

    return {
      text: extractText(message),
      model: message.model,
      provider: this.id,
      providerKind: this.kind,
      latencyMs,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cachedInputTokens: message.usage.cache_read_input_tokens ?? undefined,
      },
      finishReason: mapStopReason(message.stop_reason),
      raw: message as unknown as Record<string, unknown>,
    };
  }

  async *stream(req: GenerationRequest): AsyncIterable<GenerationChunk> {
    const { system, turns } = splitSystem(req.messages);

    const stream = this.#client.messages.stream(
      {
        model: req.model,
        max_tokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: req.temperature,
        system,
        messages: turns,
      },
      { signal: req.signal },
    );

    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { textDelta: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      yield {
        textDelta: "",
        usage: {
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
          cachedInputTokens: final.usage.cache_read_input_tokens ?? undefined,
        },
      };
    } catch (err) {
      throw toError(err);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.#client.models.list({ limit: 1 });
      return true;
    } catch {
      return false;
    }
  }
}
