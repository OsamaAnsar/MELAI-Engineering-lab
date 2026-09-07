import Link from "next/link";
import { api, type DatasetSummary, type EvalRunSummary } from "../../lib/api-client";
import { timeAgo } from "../../lib/format";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  return n.toFixed(3);
}

export default async function EvalPage() {
  let datasets: DatasetSummary[] = [];
  let evalRuns: EvalRunSummary[] = [];
  let error: string | null = null;
  try {
    [datasets, evalRuns] = await Promise.all([
      api.datasets().then((r) => r.datasets),
      api.evalRuns().then((r) => r.evalRuns),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to reach the API";
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Evaluation Lab</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Score a retrieval config against a dataset of queries — recall@k, precision@k, MRR,
            nDCG, hit-rate — instead of eyeballing one query.
          </p>
        </div>
        <Link
          href="/eval/datasets/new"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          New dataset
        </Link>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}. Is the API running?
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-500">Datasets</h2>
            {datasets.length === 0 ? (
              <p className="text-sm text-zinc-500">No datasets yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {datasets.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/eval/datasets/${d.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <span className="font-medium">{d.name}</span>
                      <span className="flex items-center gap-3 text-xs text-zinc-500">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                          {d.target}
                        </span>
                        <span>{d.caseCount} cases</span>
                        <span>{timeAgo(d.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-500">Recent eval runs</h2>
            {evalRuns.length === 0 ? (
              <p className="text-sm text-zinc-500">No runs yet — open a dataset and run one.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {evalRuns.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/eval/runs/${r.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <span className="font-medium">{r.name}</span>
                      <span className="flex items-center gap-3 text-xs text-zinc-500">
                        {r.aggregate
                          ? Object.entries(r.aggregate).map(([k, v]) => (
                              <span key={k} className="tabular-nums">
                                {k} {fmt(v)}
                              </span>
                            ))
                          : null}
                        {r.pending > 0 ? (
                          <span className="text-amber-600">{r.pending} running</span>
                        ) : null}
                        <span className="text-zinc-400">{r.datasetName}</span>
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
