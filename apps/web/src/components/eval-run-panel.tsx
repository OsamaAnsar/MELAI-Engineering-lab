"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  api,
  type ChunkingConfigSummary,
  type DocumentSummary,
  type EvalConfigSummary,
  type RetrievalConfigSummary,
} from "../lib/api-client";

const SCORERS = ["recall_at_k", "precision_at_k", "mrr", "ndcg", "hit_rate"] as const;
type Scorer = (typeof SCORERS)[number];

export function EvalRunPanel({
  datasetId,
  datasetName,
  documents,
  chunkingConfigs,
  retrievalConfigs,
  evalConfigs,
}: {
  datasetId: string;
  datasetName: string;
  documents: DocumentSummary[];
  chunkingConfigs: ChunkingConfigSummary[];
  retrievalConfigs: RetrievalConfigSummary[];
  evalConfigs: EvalConfigSummary[];
}) {
  const router = useRouter();
  const retrievalEvalConfigs = useMemo(
    () => evalConfigs.filter((c) => c.target === "retrieval"),
    [evalConfigs],
  );

  const [documentId, setDocumentId] = useState(documents[0]?.id ?? "");
  const [chunkingConfigId, setChunkingConfigId] = useState(chunkingConfigs[0]?.id ?? "");
  const [retrievalConfigId, setRetrievalConfigId] = useState(retrievalConfigs[0]?.id ?? "");
  const [topK, setTopK] = useState(5);
  const [k, setK] = useState(5);
  const [selectedScorers, setSelectedScorers] = useState<Scorer[]>([
    "recall_at_k",
    "mrr",
    "hit_rate",
  ]);
  const [evalConfigId, setEvalConfigId] = useState<string>("__new__");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing =
    documents.length === 0
      ? "Create a document in the RAG Lab first."
      : chunkingConfigs.length === 0
        ? "Create a chunking config in the RAG Lab first."
        : retrievalConfigs.length === 0
          ? "Create a retrieval config in the RAG Lab first."
          : null;

  const canSubmit =
    !missing &&
    !submitting &&
    documentId &&
    chunkingConfigId &&
    retrievalConfigId &&
    (evalConfigId !== "__new__" || selectedScorers.length > 0);

  function toggleScorer(s: Scorer) {
    setSelectedScorers((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function run() {
    setSubmitting(true);
    setError(null);
    try {
      let configId = evalConfigId;
      if (configId === "__new__") {
        const created = await api.createEvalConfig({
          name: `${selectedScorers.join(" + ")} (k=${k})`,
          target: "retrieval",
          scorers: selectedScorers.map((kind) =>
            kind === "mrr" ? ({ kind, params: {} } as const) : ({ kind, params: { k } } as const),
          ),
        });
        configId = created.id;
      }
      const runRow = await api.startEvalRun({
        name: `${datasetName} — run`,
        datasetId,
        evalConfigId: configId,
        subject: { kind: "retrieval", documentId, chunkingConfigId, retrievalConfigId, topK },
      });
      router.push(`/eval/runs/${runRow.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start the eval run");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-medium">Run an evaluation</h2>

      {missing ? (
        <p className="text-sm text-zinc-500">{missing}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Document" value={documentId} onChange={setDocumentId}>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select label="Chunking config" value={chunkingConfigId} onChange={setChunkingConfigId}>
              {chunkingConfigs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.strategy})
                </option>
              ))}
            </Select>
            <Select
              label="Retrieval config"
              value={retrievalConfigId}
              onChange={setRetrievalConfigId}
            >
              {retrievalConfigs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.method})
                </option>
              ))}
            </Select>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">top K</span>
              <input
                type="number"
                min={1}
                max={50}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>

          <Select label="Scoring" value={evalConfigId} onChange={setEvalConfigId}>
            <option value="__new__">New — pick scorers below</option>
            {retrievalEvalConfigs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          {evalConfigId === "__new__" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {SCORERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleScorer(s)}
                    className={`rounded-md border px-2.5 py-1 text-xs ${
                      selectedScorers.includes(s)
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">k (for @k metrics)</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={k}
                  onChange={(e) => setK(Number(e.target.value))}
                  className="w-28 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={run}
            disabled={!canSubmit}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {submitting ? "Starting…" : "Run evaluation"}
          </button>
        </>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        {children}
      </select>
    </label>
  );
}
