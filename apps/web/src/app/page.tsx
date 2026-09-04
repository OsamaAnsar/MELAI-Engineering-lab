import Link from "next/link";

import {
  api,
  type ExperimentSummary,
  type ModelSummary,
  type ProviderHealth,
} from "../lib/api-client";
import { timeAgo } from "../lib/format";

export const dynamic = "force-dynamic";

const LABS = [
  {
    href: "/models",
    title: "Models",
    body: "The models available to run against, and which providers are reachable.",
    ready: true,
  },
  {
    href: "/experiments",
    title: "Experiments",
    body: "Run one prompt against several models and compare answers, latency, tokens and cost.",
    ready: true,
  },
  {
    href: "/rag",
    title: "RAG Lab",
    body: "Chunk, embed, and compare BM25, vector and hybrid retrieval side by side.",
    ready: true,
  },
  { href: "#", title: "Evaluation Lab", body: "Score pipelines against datasets.", ready: false },
];

type Snapshot =
  | {
      ok: true;
      experiments: ExperimentSummary[];
      models: ModelSummary[];
      health: ProviderHealth[];
    }
  | { ok: false; error: string };

async function loadSnapshot(): Promise<Snapshot> {
  try {
    const [{ experiments }, { models }, { providers }] = await Promise.all([
      api.experiments(),
      api.models(),
      api.providerHealth(),
    ]);
    return { ok: true, experiments, models, health: providers };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reach the API" };
  }
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
      {hint ? <div className="mt-0.5 text-xs text-zinc-400">{hint}</div> : null}
    </div>
  );
}

function Stats({ experiments, models, health }: Extract<Snapshot, { ok: true }>) {
  const runs = experiments.reduce((n, e) => n + e.total, 0);
  const failed = experiments.reduce((n, e) => n + e.failed, 0);
  const online = health.filter((p) => p.healthy).length;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Experiments" value={String(experiments.length)} />
      <Stat label="Runs" value={String(runs)} hint={failed > 0 ? `${failed} failed` : undefined} />
      <Stat label="Models" value={String(models.length)} />
      <Stat label="Providers online" value={`${online}/${health.length}`} />
    </div>
  );
}

function RecentExperiments({ experiments }: { experiments: ExperimentSummary[] }) {
  const recent = experiments.slice(0, 5);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-500">Recent experiments</h2>
        <Link
          href="/experiments"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          View all →
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-zinc-500">
          None yet.{" "}
          <Link href="/experiments/new" className="underline">
            Run one
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {recent.map((e) => (
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
    </section>
  );
}

export default async function Home() {
  const snap = await loadSnapshot();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">MELAI Engineering Lab</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Observe, compare, evaluate and debug AI systems — not black boxes.
        </p>
      </div>

      {snap.ok ? (
        <>
          <Stats {...snap} />
          <RecentExperiments experiments={snap.experiments} />
        </>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {snap.error}. Start the API with <code>pnpm dev</code> (or{" "}
          <code>pnpm --filter @melai/api dev</code>).
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Labs</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {LABS.map((card) => {
            const inner = (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{card.title}</h3>
                  {!card.ready ? <span className="text-xs text-zinc-400">soon</span> : null}
                </div>
                <p className="mt-1 text-sm text-zinc-500">{card.body}</p>
              </>
            );
            return card.ready ? (
              <Link
                key={card.title}
                href={card.href}
                className="rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={card.title}
                className="rounded-lg border border-dashed border-zinc-200 p-4 opacity-60 dark:border-zinc-800"
              >
                {inner}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
