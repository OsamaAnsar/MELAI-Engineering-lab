/**
 * Seed fixtures for local development.
 *
 * Pricing is USD per 1,000,000 tokens and is INDICATIVE ONLY — verify against the
 * provider's current pricing page and adjust here (or later, in the Model Lab).
 * `null` means "unknown"; the cost calculator then reports no cost for that model.
 */

export interface SeedModel {
  name: string;
  displayName: string;
  contextLength: number | null;
  inputPricePerMtok: string | null;
  outputPricePerMtok: string | null;
  cachedInputPricePerMtok: string | null;
}

export interface SeedProvider {
  name: string;
  kind: "cloud" | "local";
  config: Record<string, unknown>;
  models: SeedModel[];
}

export const seedProviders: SeedProvider[] = [
  {
    name: "anthropic",
    kind: "cloud",
    config: {},
    models: [
      {
        name: "claude-sonnet-4-5",
        displayName: "Claude Sonnet 4.5",
        contextLength: 200_000,
        inputPricePerMtok: "3.000000",
        outputPricePerMtok: "15.000000",
        cachedInputPricePerMtok: "0.300000",
      },
    ],
  },
  {
    name: "openai",
    kind: "cloud",
    config: {},
    models: [
      {
        name: "gpt-4.1",
        displayName: "GPT-4.1",
        contextLength: 1_000_000,
        inputPricePerMtok: "2.000000",
        outputPricePerMtok: "8.000000",
        cachedInputPricePerMtok: "0.500000",
      },
    ],
  },
  {
    name: "ollama",
    kind: "local",
    config: { baseUrl: "http://localhost:11434" },
    models: [
      {
        name: "qwen2.5:7b-instruct",
        displayName: "Qwen2.5 7B Instruct (local)",
        contextLength: 32_768,
        inputPricePerMtok: "0.000000",
        outputPricePerMtok: "0.000000",
        cachedInputPricePerMtok: null,
      },
    ],
  },
];
