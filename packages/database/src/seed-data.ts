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

export interface SeedEmbeddingModel {
  name: string;
  displayName: string;
  /** Fixed at 768 for M2 — see EMBEDDING_DIMENSIONS in schema.ts. */
  dimensions: number;
  pricePerMtok: string | null;
}

export interface SeedProvider {
  name: string;
  kind: "cloud" | "local";
  config: Record<string, unknown>;
  models: SeedModel[];
  embeddingModels?: SeedEmbeddingModel[];
}

export interface SeedDocument {
  name: string;
  content: string;
}

export interface SeedDatasetCase {
  label: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
}

export interface SeedDataset {
  name: string;
  target: "retrieval" | "generation";
  description: string;
  cases: SeedDatasetCase[];
}

/**
 * A small example corpus so the Evaluation Lab has something to run against
 * out of the box. Paragraphs are deliberately distinct so retrieval has a
 * clear right answer per query.
 */
export const seedDocuments: SeedDocument[] = [
  {
    name: "MELAI Sample — Support Policy",
    content: [
      "Refunds are processed within 14 business days of an approved request. The amount is returned to the original payment method.",
      "Standard shipping takes 5 to 7 business days. Expedited shipping arrives in 2 business days for an additional fee.",
      "Hardware is covered by a 12-month limited warranty against manufacturing defects. Accidental damage is not covered.",
      "To delete your account, open Settings, choose Privacy, and select Delete account. Deletion is permanent after a 30-day grace period.",
      "You can export your data as a ZIP archive of JSON files from Settings, Privacy, Export data. The download link is valid for 24 hours.",
      "Support is available by email at help@example.com and by live chat on weekdays from 9am to 6pm UTC.",
    ].join("\n\n"),
  },
];

/**
 * A retrieval evaluation dataset over the sample document above. `relevantText`
 * is a list of substrings; a retrieved chunk counts as relevant when it
 * contains any of them (matching is done at eval time, not here).
 */
export const seedDatasets: SeedDataset[] = [
  {
    name: "Support Policy — retrieval eval",
    target: "retrieval",
    description: "Five factual questions against the MELAI sample support policy.",
    cases: [
      {
        label: "refund timing",
        input: { query: "How long do refunds take?" },
        expected: { relevantText: ["within 14 business days"] },
      },
      {
        label: "expedited shipping",
        input: { query: "When does expedited shipping arrive?" },
        expected: { relevantText: ["2 business days for an additional fee"] },
      },
      {
        label: "warranty exclusion",
        input: { query: "Is accidental damage covered by the warranty?" },
        expected: { relevantText: ["Accidental damage is not covered"] },
      },
      {
        label: "account deletion",
        input: { query: "How do I permanently delete my account?" },
        expected: { relevantText: ["Delete account", "30-day grace period"] },
      },
      {
        label: "data export format",
        input: { query: "What format is exported data in?" },
        expected: { relevantText: ["ZIP archive of JSON files"] },
      },
    ],
  },
];

export const seedProviders: SeedProvider[] = [
  {
    name: "anthropic",
    kind: "cloud",
    config: {},
    models: [
      {
        name: "claude-opus-5",
        displayName: "Claude Opus 5",
        contextLength: 1_000_000,
        inputPricePerMtok: "5.000000",
        outputPricePerMtok: "25.000000",
        cachedInputPricePerMtok: "0.500000",
      },
      {
        name: "claude-sonnet-5",
        displayName: "Claude Sonnet 5",
        contextLength: 1_000_000,
        inputPricePerMtok: "2.000000",
        outputPricePerMtok: "10.000000",
        cachedInputPricePerMtok: "0.200000",
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
    embeddingModels: [
      {
        name: "text-embedding-3-small",
        displayName: "text-embedding-3-small (truncated to 768d)",
        dimensions: 768,
        pricePerMtok: "0.020000",
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
    embeddingModels: [
      {
        name: "nomic-embed-text",
        displayName: "Nomic Embed Text (local)",
        dimensions: 768,
        pricePerMtok: "0.000000",
      },
    ],
  },
  {
    name: "mock",
    kind: "cloud",
    config: {},
    models: [
      {
        name: "mock-echo",
        displayName: "Mock (echo)",
        contextLength: 8_192,
        inputPricePerMtok: "1.000000",
        outputPricePerMtok: "3.000000",
        cachedInputPricePerMtok: null,
      },
    ],
    embeddingModels: [
      {
        name: "mock-embed",
        displayName: "Mock (embed)",
        dimensions: 768,
        pricePerMtok: "0.000000",
      },
    ],
  },
];
