import {
  ApiError,
  api,
  type ChunkDetail,
  type RetrievalRunDetail,
} from "../../../../lib/api-client";
import { RetrievalResults } from "../../../../components/retrieval-results";

export const dynamic = "force-dynamic";

export default async function RetrievalRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let run: RetrievalRunDetail | null = null;
  let chunkById: Record<string, ChunkDetail> = {};
  let error: string | null = null;
  try {
    run = await api.retrievalRun(id);
    // chunkDocument is idempotent — this just fetches the already-computed chunks
    // so the results view can render chunk content next to each ranked candidate.
    const { chunks } = await api.chunkDocument(run.document.id, run.chunkingConfig.id);
    chunkById = Object.fromEntries(chunks.map((c) => [c.id, c]));
  } catch (err) {
    error =
      err instanceof ApiError && err.status === 404
        ? "Retrieval run not found"
        : "Failed to reach the API";
  }

  if (error || !run) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Retrieval run</h1>
        <p className="mt-4 text-sm text-zinc-500">{error ?? "Not found"}.</p>
      </div>
    );
  }

  return <RetrievalResults initial={run} chunkById={chunkById} />;
}
