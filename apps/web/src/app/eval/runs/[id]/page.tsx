import { ApiError, api, type EvalRunDetail } from "../../../../lib/api-client";
import { EvalResults } from "../../../../components/eval-results";

export const dynamic = "force-dynamic";

export default async function EvalRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let run: EvalRunDetail | null = null;
  let error: string | null = null;
  try {
    run = await api.evalRun(id);
  } catch (err) {
    error =
      err instanceof ApiError && err.status === 404
        ? "Eval run not found"
        : "Failed to reach the API";
  }

  if (error || !run) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eval run</h1>
        <p className="mt-4 text-sm text-zinc-500">{error ?? "Not found"}.</p>
      </div>
    );
  }

  return <EvalResults initial={run} />;
}
