/**
 * The embedding-provider abstraction — parallel to {@link ModelProvider} in
 * types.ts, but for turning text into vectors instead of generating text.
 */

import type { ProviderKind } from "./types.js";

export interface EmbeddingRequest {
  /** Provider-specific model id, e.g. "text-embedding-3-small", "nomic-embed-text". */
  model: string;
  texts: string[];
  signal?: AbortSignal;
}

export interface EmbeddingUsage {
  tokens?: number;
}

export interface EmbeddingResult {
  /** One vector per input text, same order as `EmbeddingRequest.texts`. */
  vectors: number[][];
  model: string;
  provider: string;
  providerKind: ProviderKind;
  /** Wall-clock, measured by us around the call — not taken from the provider. */
  latencyMs: number;
  usage: EmbeddingUsage;
  /** Filled by a cost calculator from `usage` + a pricing table, never by the adapter. */
  estimatedCostUsd?: number;
  /** Untouched provider payload, for the Observability Lab to inspect. */
  raw?: Record<string, unknown>;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly kind: ProviderKind;
  embed(req: EmbeddingRequest): Promise<EmbeddingResult>;
  healthCheck(): Promise<boolean>;
}
