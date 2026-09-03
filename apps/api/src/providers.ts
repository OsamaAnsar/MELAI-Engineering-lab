import { MockProvider, type ModelProvider } from "@melai/ai-core";
import { AnthropicProvider, OllamaProvider, OpenAIProvider } from "@melai/ai-core/providers";
import type { Env } from "./env.js";

/** Looks up a live {@link ModelProvider} by provider name ("anthropic" | "openai" | "ollama"). */
export interface ProviderRegistry {
  get(providerName: string): ModelProvider | undefined;
}

export function registryFromMap(map: Map<string, ModelProvider>): ProviderRegistry {
  return { get: (name) => map.get(name) };
}

/**
 * Builds the registry from environment credentials. A cloud provider is only
 * registered when its key is present, so a run against it fails with a clear
 * "no credentials" error rather than a network error. Ollama is always local.
 */
export function makeProviderRegistry(env: Env): ProviderRegistry {
  const map = new Map<string, ModelProvider>();

  if (env.ANTHROPIC_API_KEY) {
    map.set("anthropic", new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY }));
  }
  if (env.OPENAI_API_KEY) {
    map.set("openai", new OpenAIProvider({ apiKey: env.OPENAI_API_KEY }));
  }
  map.set("ollama", new OllamaProvider({ host: env.OLLAMA_BASE_URL }));

  // Always available: a deterministic echo model so the lab works with zero config.
  map.set(
    "mock",
    new MockProvider({
      id: "mock",
      latencyMs: 120,
      response: (req) =>
        `Mock response to: "${req.messages
          .map((m) => m.content)
          .join(" ")
          .slice(0, 200)}"`,
    }),
  );

  return registryFromMap(map);
}
