import Link from "next/link";
import { api, type ExperimentSummary } from "../../lib/api-client";
import { timeAgo } from "../../lib/format";

export const dynamic = "force-dynamic";

export default async function ExperimentsPage() {
  let experiments: ExperimentSummary[] = [];
  let error: string | null = null;
  try {
    experiments = (await api.experiments()).experiments;
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to reach the API";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Experiments</h1>
        <Link
          href="/experiments/new"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          New experiment
        </Link>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}. Is the API running?
        </p>
      ) : experiments.length === 0 ? (
        <p className="text-sm text-zinc-500">No experiments yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {experiments.map((e) => (
            <li key={e.id}>
              <Link
                href={`/experiments/${e.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span className="font-medium">{e.name}</span>
                <span className="flex items-center gap-3 text-xs text-zinc-500">
                  {e.pending > 0 ? (
                    <span className="text-amber-600">{e.pending} running</span>
                  ) : null}
                  <span className="text-emerald-600">{e.succeeded} ok</span>
                  {e.failed > 0 ? <span className="text-red-600">{e.failed} failed</span> : null}
                  <span>{timeAgo(e.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
