import type { RunStatus } from "./experiment";

/**
 * Wire shapes for the @melai/api HTTP responses. This is the single source of
 * truth: the API annotates its handlers against these, the web client imports
 * them. Dates are ISO strings (what JSON serialization produces).
 */

export type ProviderKind = "cloud" | "local";

export interface ModelSummary {
  id: string;
  name: string;
  displayName: string;
  provider: string;
  providerKind: ProviderKind;
  contextLength: number | null;
  inputPricePerMtok: string | null;
  outputPricePerMtok: string | null;
  cachedInputPricePerMtok: string | null;
  active: boolean;
}

export interface ProviderHealth {
  name: string;
  kind: ProviderKind;
  healthy: boolean;
  reason?: string;
}

export interface ExperimentSummary {
  id: string;
  name: string;
  createdAt: string;
  total: number;
  succeeded: number;
  failed: number;
  pending: number;
}

export interface RunModelInfo {
  id: string;
  name: string;
  displayName: string;
  provider: string;
  providerKind: ProviderKind;
}

export interface RunDetail {
  id: string;
  status: RunStatus;
  model: RunModelInfo;
  responseText: string | null;
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  latencyMs: number | null;
  estimatedCostUsd: number | null;
  pricingSnapshot: Record<string, unknown> | null;
  providerMetrics: Record<string, number> | null;
  raw: unknown;
  error: { name: string; message: string } | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ExperimentDetail {
  id: string;
  name: string;
  createdAt: string;
  inputVariables: Record<string, string>;
  config: { temperature: number; maxOutputTokens: number };
  prompt: { name: string; version: number; template: string };
  runs: RunDetail[];
  pending: boolean;
}

// --- RAG Lab (M2) ---

export type ChunkingStrategy = "fixed" | "sentence";
export type RetrievalMethod = "bm25" | "vector" | "hybrid_rrf";

export interface DocumentSummary {
  id: string;
  name: string;
  content: string;
}

export interface ChunkingConfigSummary {
  id: string;
  name: string;
  strategy: ChunkingStrategy;
  params: Record<string, unknown>;
}

export interface ChunkDetail {
  id: string;
  index: number;
  content: string;
  tokenCount: number;
}

export interface EmbeddingModelSummary {
  id: string;
  name: string;
  displayName: string;
  dimensions: number;
  pricePerMtok: string | null;
  provider: string;
  providerKind: ProviderKind;
}

export interface RetrievalConfigSummary {
  id: string;
  name: string;
  method: RetrievalMethod;
  params: Record<string, unknown>;
}

/** One ranked candidate; bm25/vector fields are populated for hybrid_rrf's per-method breakdown. */
export interface RetrievalCandidateDto {
  chunkId: string;
  score: number;
  bm25Rank?: number;
  bm25Score?: number;
  vectorRank?: number;
  vectorScore?: number;
}

export interface RetrievalResultDetail {
  id: string;
  status: RunStatus;
  retrievalConfig: { id: string; name: string; method: RetrievalMethod };
  results: RetrievalCandidateDto[] | null;
  latencyMs: number | null;
  error: { name: string; message: string } | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RetrievalRunDetail {
  id: string;
  query: string;
  topK: number;
  createdAt: string;
  document: { id: string; name: string };
  chunkingConfig: { id: string; name: string; strategy: ChunkingStrategy };
  results: RetrievalResultDetail[];
  pending: boolean;
}

export interface RetrievalRunSummary {
  id: string;
  query: string;
  documentName: string;
  createdAt: string;
  total: number;
  succeeded: number;
  failed: number;
  pending: number;
}
