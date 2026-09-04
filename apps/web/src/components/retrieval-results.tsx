"use client";

import { useCallback, useEffect, useState } from "react";
import {
  API_BASE,
  api,
  type ChunkDetail,
  type RetrievalCandidateDto,
  type RetrievalResultDetail,
  type RetrievalRunDetail,
} from "../lib/api-client";
import { barWidths, formatLatency } from "../lib/metrics";

const STATUS: Record<string, string> = {
  pending: "text-zinc-400",
  running: "text-amber-600 animate-pulse",
  success: "text-emerald-600",
  error: "text-red-600",
};

const METHOD_LABEL: Record<string, string> = {
  bm25: "BM25",
  vector: "Vector",
  hybrid_rrf: "Hybrid (RRF)",
};

function Bar({ width, value }: { width: number; value: string }) {
  return (
    <div className="text-xs">
      <div className="flex justify-between text-zinc-500">
        <span>score</span>
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

function CandidateRow({
  candidate,
  chunk,
  scoreWidth,
}: {
  candidate: RetrievalCandidateDto;
  chunk: ChunkDetail | undefined;
  scoreWidth: number;
}) {
  const breakdown: string[] = [];
  if (candidate.bm25Rank !== undefined) {
    breakdown.push(`BM25 #${candidate.bm25Rank} (${candidate.bm25Score?.toFixed(2)})`);
  }
  if (candidate.vectorRank !== undefined) {
    breakdown.push(`Vector #${candidate.vectorRank} (${candidate.vectorScore?.toFixed(3)})`);
  }

  return (
    <li className="space-y-1.5 rounded-md border border-zinc-200 p-2.5 dark:border-zinc-800">
      <pre className="max-h-24 overflow-auto whitespace-pre-wrap text-xs">
        {chunk
          ? chunk.content.length > 220
            ? `${chunk.content.slice(0, 220)}…`
            : chunk.content
          : "…"}
      </pre>
      <Bar width={scoreWidth} value={candidate.score.toFixed(4)} />
      {breakdown.length > 0 ? (
        <div className="text-xs text-zinc-400">{breakdown.join(" · ")}</div>
      ) : null}
    </li>
  );
}

function ResultColumn({
  result,
  chunkById,
}: {
  result: RetrievalResultDetail;
  chunkById: Record<string, ChunkDetail>;
}) {
  const scores = (result.results ?? []).map((c) => c.score);
  const widths = barWidths(scores);

  return (
    <div className="flex w-96 shrink-0 flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{result.retrievalConfig.name}</div>
          <div className="text-xs text-zinc-400">
            {METHOD_LABEL[result.retrievalConfig.method] ?? result.retrievalConfig.method}
          </div>
        </div>
        <span className={`text-xs font-medium ${STATUS[result.status] ?? ""}`}>
          {result.status}
        </span>
      </div>

      {result.status === "success" ? (
        <>
          <ul className="space-y-2">
            {(result.results ?? []).map((candidate, i) => (
              <CandidateRow
                key={candidate.chunkId}
                candidate={candidate}
                chunk={chunkById[candidate.chunkId]}
                scoreWidth={widths[i] ?? 0}
              />
            ))}
          </ul>
          <div className="text-xs text-zinc-500">{formatLatency(result.latencyMs)}</div>
        </>
      ) : result.status === "error" ? (
        <p className="text-sm text-red-600">
          {result.error?.name}: {result.error?.message}
        </p>
      ) : (
        <p className="text-sm text-zinc-400">waiting…</p>
      )}
    </div>
  );
}

export function RetrievalResults({
  initial,
  chunkById,
}: {
  initial: RetrievalRunDetail;
  chunkById: Record<string, ChunkDetail>;
}) {
  const [detail, setDetail] = useState<RetrievalRunDetail>(initial);

  const refresh = useCallback(async () => {
    try {
      setDetail(await api.retrievalRun(initial.id));
    } catch {
      // keep the last good snapshot
    }
  }, [initial.id]);

  useEffect(() => {
    if (!initial.pending) return;
    const es = new EventSource(`${API_BASE}/retrieval-runs/${initial.id}/stream`);
    es.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string };
      if (message.type === "result.started" || message.type === "result.completed") void refresh();
      if (message.type === "retrieval_run.done") {
        void refresh();
        es.close();
      }
    };
    return () => es.close();
  }, [initial.id, initial.pending, refresh]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{detail.query}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {detail.document.name} · {detail.chunkingConfig.name} ({detail.chunkingConfig.strategy}) ·
          top {detail.topK}
          {detail.pending ? <span className="ml-2 text-amber-600">· running…</span> : null}
        </p>
      </div>

      <section className="flex gap-4 overflow-x-auto pb-2">
        {detail.results.map((result) => (
          <ResultColumn key={result.id} result={result} chunkById={chunkById} />
        ))}
      </section>
    </div>
  );
}
