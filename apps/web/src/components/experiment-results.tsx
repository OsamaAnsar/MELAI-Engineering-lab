"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, api, type ExperimentDetail, type RunDetail } from "../lib/api-client";
import { barWidths, formatCost, formatLatency } from "../lib/metrics";

const STATUS: Record<string, string> = {
  pending: "text-zinc-400",
  running: "text-amber-600 animate-pulse",
  success: "text-emerald-600",
  error: "text-red-600",
};

function Bar({ label, width, value }: { label: string; width: number; value: string }) {
  return (
    <div className="text-xs">
      <div className="flex justify-between text-zinc-500">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="mt-0.5 h-1.5 rounded bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded bg-zinc-400 dark:bg-zinc-500"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function RunColumn({
  run,
  bars,
}: {
  run: RunDetail;
  bars: { latency: number; output: number; cost: number };
}) {
  return (
    <div className="flex w-80 shrink-0 flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{run.model.displayName}</div>
          <div className="text-xs text-zinc-400">
            {run.model.provider} · {run.model.providerKind}
          </div>
        </div>
        <span className={`text-xs font-medium ${STATUS[run.status] ?? ""}`}>{run.status}</span>
      </div>

      {run.status === "success" ? (
        <>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
            {run.responseText}
          </pre>
          <div className="space-y-1.5">
            <Bar label="latency" width={bars.latency} value={formatLatency(run.latencyMs)} />
            <Bar
              label="output tokens"
              width={bars.output}
              value={run.outputTokens?.toLocaleString() ?? "—"}
            />
            <Bar label="cost" width={bars.cost} value={formatCost(run.estimatedCostUsd)} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span>{run.inputTokens?.toLocaleString() ?? "?"} in</span>
            {run.finishReason ? <span>finish: {run.finishReason}</span> : null}
            {run.providerMetrics?.tokensPerSecond ? (
              <span>{run.providerMetrics.tokensPerSecond} tok/s</span>
            ) : null}
          </div>
          {run.raw != null ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-400">raw payload</summary>
              <pre className="mt-1 max-h-64 overflow-auto rounded bg-zinc-50 p-2 dark:bg-zinc-900">
                {JSON.stringify(run.raw, null, 2)}
              </pre>
            </details>
          ) : null}
        </>
      ) : run.status === "error" ? (
        <p className="text-sm text-red-600">
          {run.error?.name}: {run.error?.message}
        </p>
      ) : (
        <p className="text-sm text-zinc-400">waiting…</p>
      )}
    </div>
  );
}

export function ExperimentResults({ initial }: { initial: ExperimentDetail }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ExperimentDetail>(initial);
  const [rerunning, setRerunning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDetail(await api.experiment(initial.id));
    } catch {
      // keep the last good snapshot
    }
  }, [initial.id]);

  useEffect(() => {
    if (!initial.pending) return;
    const es = new EventSource(`${API_BASE}/experiments/${initial.id}/stream`);
    es.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string };
      if (message.type === "run.started" || message.type === "run.completed") void refresh();
      if (message.type === "experiment.done") {
        void refresh();
        es.close();
      }
    };
    return () => es.close();
  }, [initial.id, initial.pending, refresh]);

  async function rerun() {
    setRerunning(true);
    try {
      const next = await api.rerunExperiment(initial.id);
      router.push(`/experiments/${next.id}`);
    } catch {
      setRerunning(false);
    }
  }

  const latency = barWidths(detail.runs.map((r) => r.latencyMs));
  const output = barWidths(detail.runs.map((r) => r.outputTokens));
  const cost = barWidths(detail.runs.map((r) => r.estimatedCostUsd));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            temperature {detail.config.temperature} · max {detail.config.maxOutputTokens} tokens
            {detail.pending ? <span className="ml-2 text-amber-600">· running…</span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={rerun}
          disabled={rerunning || detail.pending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-700"
        >
          {rerunning ? "…" : "Rerun"}
        </button>
      </div>

      <section className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <div className="text-xs uppercase tracking-wide text-zinc-400">
          Prompt · {detail.prompt.name} v{detail.prompt.version}
        </div>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-sm">{detail.prompt.template}</pre>
        {Object.keys(detail.inputVariables).length > 0 ? (
          <div className="mt-2 text-xs text-zinc-500">
            {Object.entries(detail.inputVariables).map(([k, v]) => (
              <span key={k} className="mr-3">
                <span className="font-mono">{k}</span>={v}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="flex gap-4 overflow-x-auto pb-2">
        {detail.runs.map((run, i) => (
          <RunColumn
            key={run.id}
            run={run}
            bars={{ latency: latency[i] ?? 0, output: output[i] ?? 0, cost: cost[i] ?? 0 }}
          />
        ))}
      </section>
    </div>
  );
}
