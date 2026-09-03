/**
 * Typed client for the @melai/api service. Response shapes mirror the API route
 * handlers (kept in sync by hand for now).
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    message?: string,
  ) {
    super(message ?? `API ${status} for ${path}`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      detail = ((await res.json()) as { error?: string }).error;
    } catch {
      detail = undefined;
    }
    throw new ApiError(res.status, path, detail);
  }
  return (await res.json()) as T;
}

// --- response types ---

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

export type RunStatus = "pending" | "running" | "success" | "error";

export interface RunDetail {
  id: string;
  status: RunStatus;
  model: {
    id: string;
    name: string;
    displayName: string;
    provider: string;
    providerKind: ProviderKind;
  };
  responseText: string | null;
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  latencyMs: number | null;
  estimatedCostUsd: number | null;
  providerMetrics: Record<string, number> | null;
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

export interface ExperimentSpec {
  name: string;
  promptVersionId: string;
  inputVariables: Record<string, string>;
  config: { temperature: number; maxOutputTokens: number };
  modelIds: string[];
}

// --- endpoints ---

export const api = {
  models: () => request<{ models: ModelSummary[] }>("/models"),
  providerHealth: () => request<{ providers: ProviderHealth[] }>("/providers/health"),

  experiments: () => request<{ experiments: ExperimentSummary[] }>("/experiments"),
  experiment: (id: string) => request<ExperimentDetail>(`/experiments/${id}`),
  startExperiment: (spec: ExperimentSpec) =>
    request<ExperimentDetail>("/experiments", { method: "POST", body: JSON.stringify(spec) }),

  createPrompt: (name: string) =>
    request<{ id: string; name: string }>("/prompts", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  createPromptVersion: (promptId: string, template: string) =>
    request<{ id: string; version: number; variables: string[] }>(`/prompts/${promptId}/versions`, {
      method: "POST",
      body: JSON.stringify({ template }),
    }),
};
