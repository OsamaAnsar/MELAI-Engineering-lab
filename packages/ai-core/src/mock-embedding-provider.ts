import type { EmbeddingProvider, EmbeddingRequest, EmbeddingResult } from "./embedding-types.js";
import type { ProviderKind } from "./types.js";

export interface MockEmbeddingProviderOptions {
  id?: string;
  kind?: ProviderKind;
  /** Vector width. Default 768, matching the fixed pgvector column width. */
  dimensions?: number;
  /** Deterministic latency reported on the result (ms). Default 0. */
  latencyMs?: number;
  /** When set, embed() rejects with this. */
  failWith?: Error;
  /** What healthCheck() resolves to. Default true. */
  healthy?: boolean;
}

// FNV-1a: a fast, well-distributed non-cryptographic hash — enough to seed a PRNG.
function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// mulberry32: a tiny seeded PRNG, deterministic for a given seed.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same text always produces the same unit-length vector; different text is effectively random. */
function deterministicVector(text: string, dimensions: number): number[] {
  const rand = mulberry32(hashSeed(text));
  const vector = Array.from({ length: dimensions }, () => rand() * 2 - 1);
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? vector : vector.map((v) => v / norm);
}

/**
 * A deterministic in-memory {@link EmbeddingProvider}. Lets the RAG Lab's
 * chunking/embedding/retrieval pipeline run and be tested with no API keys,
 * no Ollama and no network — same role {@link MockProvider} plays for
 * generation.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly kind: ProviderKind;

  readonly #dimensions: number;
  readonly #latencyMs: number;
  readonly #failWith: Error | undefined;
  readonly #healthy: boolean;

  constructor(options: MockEmbeddingProviderOptions = {}) {
    this.id = options.id ?? "mock";
    this.kind = options.kind ?? "cloud";
    this.#dimensions = options.dimensions ?? 768;
    this.#latencyMs = options.latencyMs ?? 0;
    this.#failWith = options.failWith;
    this.#healthy = options.healthy ?? true;
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResult> {
    if (this.#failWith) throw this.#failWith;
    req.signal?.throwIfAborted();

    return {
      vectors: req.texts.map((text) => deterministicVector(text, this.#dimensions)),
      model: req.model,
      provider: this.id,
      providerKind: this.kind,
      latencyMs: this.#latencyMs,
      usage: {
        tokens: req.texts.reduce((n, t) => n + t.trim().split(/\s+/).filter(Boolean).length, 0),
      },
      raw: { mock: true },
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.#healthy;
  }
}
