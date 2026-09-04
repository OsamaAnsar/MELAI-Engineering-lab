import { MockEmbeddingProvider, type EmbeddingProvider } from "@melai/ai-core";
import { OllamaEmbeddingProvider, OpenAIEmbeddingProvider } from "@melai/ai-core/providers";
import type { Env } from "./env.js";

/** Looks up a live {@link EmbeddingProvider} by provider name ("openai" | "ollama" | "mock"). */
export interface EmbeddingProviderRegistry {
  get(providerName: string): EmbeddingProvider | undefined;
}

export function embeddingRegistryFromMap(
  map: Map<string, EmbeddingProvider>,
): EmbeddingProviderRegistry {
  return { get: (name) => map.get(name) };
}

/**
 * Builds the embedding registry from environment credentials — same shape as
 * {@link makeProviderRegistry} in providers.ts. Anthropic has no embeddings
 * API, so it never appears here.
 */
export function makeEmbeddingProviderRegistry(env: Env): EmbeddingProviderRegistry {
  const map = new Map<string, EmbeddingProvider>();

  if (env.OPENAI_API_KEY) {
    map.set("openai", new OpenAIEmbeddingProvider({ apiKey: env.OPENAI_API_KEY }));
  }
  map.set("ollama", new OllamaEmbeddingProvider({ host: env.OLLAMA_BASE_URL }));

  // Always available: deterministic zero-cost embeddings so the RAG lab works with zero config.
  map.set("mock", new MockEmbeddingProvider({ id: "mock", latencyMs: 80 }));

  return embeddingRegistryFromMap(map);
}
