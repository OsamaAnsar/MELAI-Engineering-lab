/**
 * The provider abstraction. Every model backend (cloud or local) implements
 * {@link ModelProvider}; nothing outside this package imports a vendor SDK.
 *
 * Implementations land in Milestone 1 (Anthropic, OpenAI, Ollama, plus a
 * deterministic Mock used by tests).
 */

export type ProviderKind = "cloud" | "local";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerationRequest {
  /** Provider-specific model id, e.g. "claude-sonnet-5", "gpt-4.1", "qwen2.5:7b". */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Lets a "Run All" cancel in-flight calls. */
  signal?: AbortSignal;
}

/**
 * Normalised across providers:
 * - `inputTokens` is full-price input only (cache-discounted tokens excluded).
 * - `cachedInputTokens` is the count that received the cache discount.
 * Each adapter is responsible for mapping its vendor's reporting onto this shape.
 */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

export type FinishReason = "stop" | "length" | "content_filter" | "error" | "other";

export interface GenerationResult {
  text: string;
  model: string;
  provider: string;
  providerKind: ProviderKind;
  /** Wall-clock, measured by us around the call — not taken from the provider. */
  latencyMs: number;
  usage: TokenUsage;
  /** Filled by a cost calculator from `usage` + a pricing table, never by the adapter. */
  estimatedCostUsd?: number;
  finishReason?: FinishReason;
  /** Untouched provider payload, for the Observability Lab to inspect. */
  raw?: Record<string, unknown>;
}

export interface GenerationChunk {
  textDelta: string;
  /** Usually present only on the final chunk. */
  usage?: TokenUsage;
}

export interface ModelProvider {
  readonly id: string;
  readonly kind: ProviderKind;
  generate(req: GenerationRequest): Promise<GenerationResult>;
  stream?(req: GenerationRequest): AsyncIterable<GenerationChunk>;
  healthCheck(): Promise<boolean>;
}

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cachedInputPerMTok?: number;
}
