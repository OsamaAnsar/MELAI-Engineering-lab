import { api, ApiError, type ExperimentDetail } from "../../../lib/api-client";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  pending: "text-zinc-400",
  running: "text-amber-600",
  success: "text-emerald-600",
  error: "text-red-600",
};

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let experiment: ExperimentDetail | null = null;
  let error: string | null = null;
  try {
    experiment = await api.experiment(id);
  } catch (err) {
    error =
      err instanceof ApiError && err.status === 404
        ? "Experiment not found"
        : "Failed to reach the API";
  }

  if (error || !experiment) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Experiment</h1>
        <p className="mt-4 text-sm text-zinc-500">{error ?? "Not found"}.</p>
      </div>
    );
  }

  const exp = experiment;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{exp.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          temperature {exp.config.temperature} · max {exp.config.maxOutputTokens} tokens
        </p>
        {exp.pending ? (
          <p className="mt-2 text-sm text-amber-600">
            Running… reload to see progress. (Live updates land in the next step.)
          </p>
        ) : null}
      </div>

      <section className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <div className="text-xs uppercase tracking-wide text-zinc-400">
          Prompt · {exp.prompt.name} v{exp.prompt.version}
        </div>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-sm">{exp.prompt.template}</pre>
        {Object.keys(exp.inputVariables).length > 0 ? (
          <div className="mt-2 text-xs text-zinc-500">
            {Object.entries(exp.inputVariables).map(([k, v]) => (
              <span key={k} className="mr-3">
                <span className="font-mono">{k}</span>={v}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        {exp.runs.map((run) => (
          <div key={run.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {run.model.displayName}{" "}
                <span className="text-xs text-zinc-400">({run.model.provider})</span>
              </span>
              <span className={`text-xs font-medium ${STATUS_STYLE[run.status] ?? ""}`}>
                {run.status}
              </span>
            </div>

            {run.status === "success" ? (
              <>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-sm">
                  {run.responseText}
                </pre>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500 tabular-nums">
                  <span>{run.latencyMs}ms</span>
                  <span>
                    {run.inputTokens ?? "?"} in / {run.outputTokens ?? "?"} out
                  </span>
                  <span>
                    {run.estimatedCostUsd === null
                      ? "cost n/a"
                      : run.estimatedCostUsd === 0
                        ? "free"
                        : `$${run.estimatedCostUsd.toFixed(6)}`}
                  </span>
                  {run.providerMetrics?.tokensPerSecond ? (
                    <span>{run.providerMetrics.tokensPerSecond} tok/s</span>
                  ) : null}
                </div>
              </>
            ) : run.status === "error" ? (
              <p className="mt-2 text-sm text-red-600">
                {run.error?.name}: {run.error?.message}
              </p>
            ) : (
              <p className="mt-2 text-sm text-zinc-400">waiting…</p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
