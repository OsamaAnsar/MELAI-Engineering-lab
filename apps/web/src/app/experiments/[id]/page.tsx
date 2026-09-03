import { api, ApiError, type ExperimentDetail } from "../../../lib/api-client";
import { ExperimentResults } from "../../../components/experiment-results";

export const dynamic = "force-dynamic";

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let experiment: ExperimentDetail | null = null;
  let error: string | null = null;
  try {
    experiment = await api.experiment(id);
  } catch (err) {
    error =
      err instanceof ApiError && err.status === 404
        ? "Experiment not found"
        : "Failed to reach the API";
  }

  if (error || !experiment) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Experiment</h1>
        <p className="mt-4 text-sm text-zinc-500">{error ?? "Not found"}.</p>
      </div>
    );
  }

  return <ExperimentResults initial={experiment} />;
}
