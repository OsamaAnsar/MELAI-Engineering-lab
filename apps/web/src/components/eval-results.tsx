"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, api, type EvalCaseResultDto, type EvalRunDetail } from "../lib/api-client";
import { formatLatency } from "../lib/metrics";

const STATUS: Record<string, string> = {
  pending: "text-zinc-400",
  running: "text-amber-600 animate-pulse",
  success: "text-emerald-600",
  error: "text-red-600",
};

function fmt(n: number): string {
  return n.toFixed(3);
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function CaseRow({ result, scorerKinds }: { result: EvalCaseResultDto; scorerKinds: string[] }) {
  const query = String((result.case.input as { query?: string }).query ?? "");
  return (
    <tr className="border-t border-zinc-100 dark:border-zinc-800">
      <td className="py-2 pr-3 align-top">
        <div className="font-medium">{result.case.label ?? query}</div>
        {result.case.label ? <div className="text-xs text-zinc-500">{query}</div> : null}
        {result.status === "error" ? (
          <div className="text-xs text-red-600">{result.error?.message}</div>
        ) : null}
      </td>
      {scorerKinds.map((kind) => {
        const score = result.scores?.[kind];
        return (
          <td key={kind} className="py-2 pr-3 text-right align-top tabular-nums">
            {score ? (
              <span className={score.pass === false ? "text-red-600" : undefined}>
                {fmt(score.value)}
              </span>
            ) : (
              <span className="text-zinc-300">—</span>
            )}
          </td>
        );
      })}
      <td className="py-2 text-right align-top text-xs text-zinc-400">
        {result.status === "success" ? formatLatency(result.latencyMs) : result.status}
      </td>
    </tr>
  );
}

export function EvalResults({ initial }: { initial: EvalRunDetail }) {
  const [detail, setDetail] = useState<EvalRunDetail>(initial);
  const [failuresOnly, setFailuresOnly] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDetail(await api.evalRun(initial.id));
    } catch {
      // keep the last good snapshot
    }
  }, [initial.id]);

  useEffect(() => {
    if (!initial.pending) return;
    const es = new EventSource(`${API_BASE}/eval-runs/${initial.id}/stream`);
    es.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string };
      if (message.type === "case.started" || message.type === "case.completed") void refresh();
      if (message.type === "eval_run.done") {
        void refresh();
        es.close();
      }
    };
    return () => es.close();
  }, [initial.id, initial.pending, refresh]);

  const scorerKinds = useMemo(
    () => detail.evalConfig.scorers.map((s) => s.kind),
    [detail.evalConfig.scorers],
  );

  const rows = failuresOnly
    ? detail.results.filter(
        (r) =>
          r.status === "error" ||
          Object.values(r.scores ?? {}).some((s) => s.value < 1 || s.pass === false),
      )
    : detail.results;

  const succeeded = detail.results.filter((r) => r.status === "success").length;

  return (
    <div className="space-y-6">
      <div>
        <Header detail={detail} />
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {scorerKinds.map((kind) => (
          <Tile
            key={kind}
            label={kind}
            value={detail.aggregate ? fmt(detail.aggregate[kind] ?? 0) : "—"}
          />
        ))}
        <Tile label="cases scored" value={`${succeeded}/${detail.results.length}`} />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-500">Per case</h2>
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={failuresOnly}
              onChange={(e) => setFailuresOnly(e.target.checked)}
            />
            below-perfect only
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-500">
                <th className="pb-1 text-left font-medium">case</th>
                {scorerKinds.map((kind) => (
                  <th key={kind} className="pb-1 pr-3 text-right font-medium">
                    {kind}
                  </th>
                ))}
                <th className="pb-1 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <CaseRow key={r.id} result={r} scorerKinds={scorerKinds} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Header({ detail }: { detail: EvalRunDetail }) {
  const subject = detail.subject as { topK?: number };
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {detail.dataset.name} · {detail.evalConfig.name} · top {subject.topK ?? "?"}
        {detail.pending ? <span className="ml-2 text-amber-600">· running…</span> : null}
        {!detail.pending ? (
          <span className={`ml-2 text-xs ${STATUS[detail.status] ?? ""}`}>{detail.status}</span>
        ) : null}
      </p>
    </>
  );
}
