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

// --- endpoints ---

export const api = {
  models: () => request<{ models: ModelSummary[] }>("/models"),
  providerHealth: () => request<{ providers: ProviderHealth[] }>("/providers/health"),
  experiments: () => request<{ experiments: ExperimentSummary[] }>("/experiments"),
};
