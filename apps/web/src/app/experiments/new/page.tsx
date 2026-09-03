import { api, type ModelSummary } from "../../../lib/api-client";
import { ExperimentBuilder } from "../../../components/experiment-builder";

export const dynamic = "force-dynamic";

export default async function NewExperimentPage() {
  let models: ModelSummary[] = [];
  let error: string | null = null;
  try {
    models = (await api.models()).models;
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to reach the API";
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New experiment</h1>
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}. Is the API running?
        </p>
      </div>
    );
  }

  return <ExperimentBuilder models={models} />;
}
