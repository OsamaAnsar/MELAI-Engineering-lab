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
