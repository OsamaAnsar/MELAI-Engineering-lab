import Link from "next/link";
import {
  ApiError,
  api,
  type ChunkingConfigSummary,
  type DatasetDetail,
  type DocumentSummary,
  type EvalConfigSummary,
  type RetrievalConfigSummary,
} from "../../../../lib/api-client";
import { EvalRunPanel } from "../../../../components/eval-run-panel";

export const dynamic = "force-dynamic";

export default async function DatasetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let dataset: DatasetDetail | null = null;
  let documents: DocumentSummary[] = [];
  let chunkingConfigs: ChunkingConfigSummary[] = [];
  let retrievalConfigs: RetrievalConfigSummary[] = [];
  let evalConfigs: EvalConfigSummary[] = [];
  let error: string | null = null;
  try {
    [dataset, documents, chunkingConfigs, retrievalConfigs, evalConfigs] = await Promise.all([
      api.dataset(id),
      api.documents().then((r) => r.documents),
      api.chunkingConfigs().then((r) => r.chunkingConfigs),
      api.retrievalConfigs().then((r) => r.retrievalConfigs),
      api.evalConfigs().then((r) => r.evalConfigs),
    ]);
  } catch (err) {
    error =
      err instanceof ApiError && err.status === 404
        ? "Dataset not found"
        : "Failed to reach the API";
  }

  if (error || !dataset) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dataset</h1>
        <p className="mt-4 text-sm text-zinc-500">{error ?? "Not found"}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/eval" className="text-xs text-zinc-500 hover:underline">
          ← Evaluation Lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{dataset.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {dataset.target} · {dataset.cases.length} cases
        </p>
      </div>

      <EvalRunPanel
        datasetId={dataset.id}
        datasetName={dataset.name}
        documents={documents}
        chunkingConfigs={chunkingConfigs}
        retrievalConfigs={retrievalConfigs}
        evalConfigs={evalConfigs}
      />

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-500">Cases</h2>
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {dataset.cases.map((c) => (
            <li key={c.id} className="px-4 py-3 text-sm">
              <div className="font-medium">
                {String((c.input as { query?: string }).query ?? "")}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                relevant:{" "}
                {((c.expected as { relevantText?: string[] }).relevantText ?? []).join(" · ")}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
