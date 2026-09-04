import Link from "next/link";
import { api, type DocumentSummary, type RetrievalRunSummary } from "../../lib/api-client";
import { timeAgo } from "../../lib/format";

export const dynamic = "force-dynamic";

export default async function RagPage() {
  let documents: DocumentSummary[] = [];
  let retrievalRuns: RetrievalRunSummary[] = [];
  let error: string | null = null;
  try {
    [documents, retrievalRuns] = await Promise.all([
      api.documents().then((r) => r.documents),
      api.retrievalRuns().then((r) => r.retrievalRuns),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to reach the API";
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">RAG Lab</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Chunk a document, embed it, then compare BM25, vector and hybrid retrieval side by side.
          </p>
        </div>
        <Link
          href="/rag/documents/new"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          New document
        </Link>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}. Is the API running?
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-500">Documents</h2>
            {documents.length === 0 ? (
              <p className="text-sm text-zinc-500">No documents yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {documents.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/rag/documents/${d.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <span className="font-medium">{d.name}</span>
                      <span className="text-xs text-zinc-400">
                        {d.content.length.toLocaleString()} chars
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-500">Recent retrieval runs</h2>
            {retrievalRuns.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No runs yet — chunk a document to get started.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {retrievalRuns.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/rag/runs/${r.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <span className="font-medium">{r.query}</span>
                      <span className="flex items-center gap-3 text-xs text-zinc-500">
                        <span className="text-zinc-400">{r.documentName}</span>
                        {r.pending > 0 ? (
                          <span className="text-amber-600">{r.pending} running</span>
                        ) : null}
                        <span className="text-emerald-600">{r.succeeded} ok</span>
                        {r.failed > 0 ? (
                          <span className="text-red-600">{r.failed} failed</span>
                        ) : null}
                        <span>{timeAgo(r.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
