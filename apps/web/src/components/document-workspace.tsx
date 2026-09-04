"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  api,
  type ChunkDetail,
  type ChunkingStrategy,
  type DocumentSummary,
  type EmbeddingModelSummary,
  type RetrievalConfigSummary,
  type RetrievalMethod,
} from "../lib/api-client";

function groupByProvider(models: EmbeddingModelSummary[]): [string, EmbeddingModelSummary[]][] {
  const map = new Map<string, EmbeddingModelSummary[]>();
  for (const m of models) {
    const list = map.get(m.provider) ?? [];
    list.push(m);
    map.set(m.provider, list);
  }
  return [...map.entries()];
}

const METHOD_LABEL: Record<RetrievalMethod, string> = {
  bm25: "BM25 (lexical)",
  vector: "Vector (semantic)",
  hybrid_rrf: "Hybrid (BM25 + vector, RRF)",
};

export function DocumentWorkspace({
  document,
  embeddingModels,
}: {
  document: DocumentSummary;
  embeddingModels: EmbeddingModelSummary[];
}) {
  const router = useRouter();
  const grouped = useMemo(() => groupByProvider(embeddingModels), [embeddingModels]);

  // --- chunking ---
  const [strategy, setStrategy] = useState<ChunkingStrategy>("sentence");
  const [chunkSize, setChunkSize] = useState(512);
  const [overlap, setOverlap] = useState(64);
  const [maxChunkSize, setMaxChunkSize] = useState(512);
  const [chunking, setChunking] = useState(false);
  const [chunkError, setChunkError] = useState<string | null>(null);
  const [chunkingConfigId, setChunkingConfigId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkDetail[]>([]);

  async function runChunking() {
    setChunking(true);
    setChunkError(null);
    try {
      const params = strategy === "fixed" ? { chunkSize, overlap } : { maxChunkSize };
      const config = await api.createChunkingConfig({
        name: `${strategy}-${Date.now()}`,
        strategy,
        params,
      });
      const { chunks: rows } = await api.chunkDocument(document.id, config.id);
      setChunkingConfigId(config.id);
      setChunks(rows);
    } catch (err) {
      setChunkError(err instanceof ApiError ? err.message : "Failed to chunk the document");
    } finally {
      setChunking(false);
    }
  }

  // --- embedding ---
  const [embeddingModelId, setEmbeddingModelId] = useState<string | null>(null);
  const [embedding, setEmbedding] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [embeddedCount, setEmbeddedCount] = useState<number | null>(null);
  const [embeddedModelId, setEmbeddedModelId] = useState<string | null>(null);

  async function runEmbedding() {
    if (!chunkingConfigId || !embeddingModelId) return;
    setEmbedding(true);
    setEmbedError(null);
    try {
      const { embedded } = await api.embedChunkingConfig(chunkingConfigId, embeddingModelId);
      setEmbeddedCount(embedded);
      setEmbeddedModelId(embeddingModelId);
    } catch (err) {
      setEmbedError(err instanceof ApiError ? err.message : "Failed to embed the chunks");
    } finally {
      setEmbedding(false);
    }
  }

  // --- retrieval configs to compare ---
  const [method, setMethod] = useState<RetrievalMethod>("bm25");
  const [rrfK, setRrfK] = useState(60);
  const [addingConfig, setAddingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [addedConfigs, setAddedConfigs] = useState<RetrievalConfigSummary[]>([]);

  const needsEmbedding = method === "vector" || method === "hybrid_rrf";
  const canAddConfig = !needsEmbedding || embeddedModelId !== null;

  async function addRetrievalConfig() {
    setAddingConfig(true);
    setConfigError(null);
    try {
      const params =
        method === "bm25"
          ? {}
          : method === "vector"
            ? { embeddingModelId: embeddedModelId }
            : { embeddingModelId: embeddedModelId, rrfK };
      const config = await api.createRetrievalConfig({
        name: `${method}-${Date.now()}`,
        method,
        params,
      });
      setAddedConfigs((prev) => [...prev, config]);
    } catch (err) {
      setConfigError(err instanceof ApiError ? err.message : "Failed to add the retrieval config");
    } finally {
      setAddingConfig(false);
    }
  }

  function removeConfig(id: string) {
    setAddedConfigs((prev) => prev.filter((c) => c.id !== id));
  }

  // --- run ---
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const canRun = chunkingConfigId !== null && addedConfigs.length > 0 && query.trim().length > 0;

  async function startRun() {
    if (!chunkingConfigId) return;
    setRunning(true);
    setRunError(null);
    try {
      const run = await api.startRetrievalRun({
        query,
        documentId: document.id,
        chunkingConfigId,
        topK,
        retrievalConfigIds: addedConfigs.map((c) => c.id),
      });
      router.push(`/rag/runs/${run.id}`);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : "Failed to start the retrieval run");
      setRunning(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{document.name}</h1>
        <details className="mt-2 text-sm text-zinc-500">
          <summary className="cursor-pointer">
            {document.content.length.toLocaleString()} chars — view content
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
            {document.content}
          </pre>
        </details>
      </div>

      {/* 1. Chunking */}
      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">1. Chunk</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1 text-sm">
            <span className="block font-medium">Strategy</span>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as ChunkingStrategy)}
              className="rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="sentence">Sentence-aware</option>
              <option value="fixed">Fixed size</option>
            </select>
          </label>
          {strategy === "fixed" ? (
            <>
              <label className="space-y-1 text-sm">
                <span className="block font-medium">Chunk size</span>
                <input
                  type="number"
                  min={1}
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Number(e.target.value))}
                  className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="block font-medium">Overlap</span>
                <input
                  type="number"
                  min={0}
                  value={overlap}
                  onChange={(e) => setOverlap(Number(e.target.value))}
                  className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
            </>
          ) : (
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Max chunk size</span>
              <input
                type="number"
                min={1}
                value={maxChunkSize}
                onChange={(e) => setMaxChunkSize(Number(e.target.value))}
                className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          )}
          <button
            type="button"
            onClick={runChunking}
            disabled={chunking}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-700"
          >
            {chunking
              ? "Chunking…"
              : chunks.length > 0
                ? "Re-chunk (new config)"
                : "Chunk document"}
          </button>
        </div>
        {chunkError ? <p className="text-sm text-red-600">{chunkError}</p> : null}
        {chunks.length > 0 ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-zinc-500">
              {chunks.length} chunk{chunks.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-2 max-h-56 space-y-1 overflow-auto text-xs">
              {chunks.map((c) => (
                <li key={c.id} className="rounded bg-zinc-50 p-2 dark:bg-zinc-900">
                  <span className="text-zinc-400">
                    #{c.index} · {c.tokenCount} tok
                  </span>{" "}
                  {c.content.length > 140 ? `${c.content.slice(0, 140)}…` : c.content}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {/* 2. Embedding */}
      <section
        className={`space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 ${
          chunks.length === 0 ? "opacity-40" : ""
        }`}
      >
        <h2 className="text-sm font-semibold">2. Embed (needed for vector / hybrid retrieval)</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1 text-sm">
            <span className="block font-medium">Embedding model</span>
            <select
              disabled={chunks.length === 0}
              value={embeddingModelId ?? ""}
              onChange={(e) => setEmbeddingModelId(e.target.value || null)}
              className="min-w-56 rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Select a model…</option>
              {grouped.map(([provider, models]) => (
                <optgroup key={provider} label={provider}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={runEmbedding}
            disabled={chunks.length === 0 || !chunkingConfigId || !embeddingModelId || embedding}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-700"
          >
            {embedding ? "Embedding…" : "Embed chunks"}
          </button>
        </div>
        {embedError ? <p className="text-sm text-red-600">{embedError}</p> : null}
        {embeddedCount !== null ? (
          <p className="text-sm text-emerald-600">{embeddedCount} chunk(s) embedded.</p>
        ) : null}
      </section>

      {/* 3. Retrieval configs to compare */}
      <section
        className={`space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 ${
          chunks.length === 0 ? "opacity-40" : ""
        }`}
      >
        <h2 className="text-sm font-semibold">3. Add retrieval methods to compare</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1 text-sm">
            <span className="block font-medium">Method</span>
            <select
              disabled={chunks.length === 0}
              value={method}
              onChange={(e) => setMethod(e.target.value as RetrievalMethod)}
              className="min-w-56 rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="bm25">{METHOD_LABEL.bm25}</option>
              <option value="vector">{METHOD_LABEL.vector}</option>
              <option value="hybrid_rrf">{METHOD_LABEL.hybrid_rrf}</option>
            </select>
          </label>
          {method === "hybrid_rrf" ? (
            <label className="space-y-1 text-sm">
              <span className="block font-medium">RRF k</span>
              <input
                type="number"
                min={1}
                value={rrfK}
                onChange={(e) => setRrfK(Number(e.target.value))}
                className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          ) : null}
          <button
            type="button"
            onClick={addRetrievalConfig}
            disabled={chunks.length === 0 || !canAddConfig || addingConfig}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-700"
          >
            {addingConfig ? "Adding…" : "Add"}
          </button>
        </div>
        {needsEmbedding && !embeddedModelId ? (
          <p className="text-xs text-amber-600">Embed the chunks first to use this method.</p>
        ) : null}
        {configError ? <p className="text-sm text-red-600">{configError}</p> : null}
        {addedConfigs.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {addedConfigs.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => removeConfig(c.id)}
                title="Remove"
                className="rounded-md border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-sm text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {METHOD_LABEL[c.method]} ×
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* 4. Run */}
      <section
        className={`space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 ${
          addedConfigs.length === 0 ? "opacity-40" : ""
        }`}
      >
        <h2 className="text-sm font-semibold">4. Run</h2>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Query</span>
          <textarea
            disabled={addedConfigs.length === 0}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={2}
            placeholder="What is the refund window?"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Top K</span>
          <input
            type="number"
            min={1}
            max={50}
            disabled={addedConfigs.length === 0}
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        {runError ? <p className="text-sm text-red-600">{runError}</p> : null}
        <button
          type="button"
          onClick={startRun}
          disabled={!canRun || running}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {running ? "Starting…" : "Run retrieval"}
        </button>
      </section>
    </div>
  );
}
