import { api, type ModelSummary, type ProviderHealth } from "../../lib/api-client";

export const dynamic = "force-dynamic";

function price(perMtok: string | null): string {
  if (perMtok === null) return "—";
  const n = Number(perMtok);
  return n === 0 ? "free" : `$${n.toFixed(2)}`;
}

function KindBadge({ kind }: { kind: "cloud" | "local" }) {
  const styles =
    kind === "local"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${styles}`}>{kind}</span>;
}

function HealthDot({ healthy }: { healthy: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${healthy ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
      aria-label={healthy ? "healthy" : "unavailable"}
    />
  );
}

async function load(): Promise<
  { ok: true; models: ModelSummary[]; health: ProviderHealth[] } | { ok: false; error: string }
> {
  try {
    const [{ models }, { providers }] = await Promise.all([api.models(), api.providerHealth()]);
    return { ok: true, models, health: providers };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reach the API" };
  }
}

export default async function ModelsPage() {
  const data = await load();

  if (!data.ok) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {data.error}. Is the API running on{" "}
          <code>{process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}</code>?
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
        <p className="mt-1 text-sm text-zinc-500">
          The models available to run experiments against, and whether each provider is reachable.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-500">Providers</h2>
        <div className="flex flex-wrap gap-3">
          {data.health.map((p) => (
            <div
              key={p.name}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-800"
            >
              <HealthDot healthy={p.healthy} />
              <span className="font-medium">{p.name}</span>
              <KindBadge kind={p.kind} />
              {p.reason ? <span className="text-xs text-zinc-400">{p.reason}</span> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium">Provider</th>
              <th className="px-4 py-2 font-medium">Context</th>
              <th className="px-4 py-2 text-right font-medium">Input /1M</th>
              <th className="px-4 py-2 text-right font-medium">Output /1M</th>
              <th className="px-4 py-2 text-right font-medium">Cached /1M</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.models.map((m) => (
              <tr key={m.id} className={m.active ? "" : "opacity-50"}>
                <td className="px-4 py-2 font-medium">{m.displayName}</td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    {m.provider}
                    <KindBadge kind={m.providerKind} />
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-500">
                  {m.contextLength ? m.contextLength.toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{price(m.inputPricePerMtok)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{price(m.outputPricePerMtok)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {price(m.cachedInputPricePerMtok)}
                </td>
              </tr>
            ))}
            {data.models.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                  No models. Run <code>pnpm db:seed</code>.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
