/**
 * Typed client for the @melai/api service. The response shapes live in
 * @melai/shared and are re-exported here so existing call sites keep importing
 * them from "../lib/api-client".
 */

import type {
  ExperimentDetail,
  ExperimentSpec,
  ExperimentSummary,
  ModelSummary,
  ProviderHealth,
} from "@melai/shared";

export type {
  ExperimentDetail,
  ExperimentSpec,
  ExperimentSummary,
  ModelSummary,
  ProviderHealth,
  ProviderKind,
  RunDetail,
  RunModelInfo,
} from "@melai/shared";
export type { RunStatus } from "@melai/shared";

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

// --- endpoints ---

export const api = {
  models: () => request<{ models: ModelSummary[] }>("/models"),
  providerHealth: () => request<{ providers: ProviderHealth[] }>("/providers/health"),

  experiments: () => request<{ experiments: ExperimentSummary[] }>("/experiments"),
  experiment: (id: string) => request<ExperimentDetail>(`/experiments/${id}`),
  startExperiment: (spec: ExperimentSpec) =>
    request<ExperimentDetail>("/experiments", { method: "POST", body: JSON.stringify(spec) }),
  rerunExperiment: (id: string) =>
    request<ExperimentDetail>(`/experiments/${id}/rerun`, { method: "POST" }),

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
