"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { templateVariables } from "@melai/shared";
import { ApiError, api, type ModelSummary } from "../lib/api-client";

function groupByProvider(models: ModelSummary[]): [string, ModelSummary[]][] {
  const map = new Map<string, ModelSummary[]>();
  for (const m of models) {
    const list = map.get(m.provider) ?? [];
    list.push(m);
    map.set(m.provider, list);
  }
  return [...map.entries()];
}

export function ExperimentBuilder({ models }: { models: ModelSummary[] }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [template, setTemplate] = useState("");
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [temperature, setTemperature] = useState(0.2);
  const [maxOutputTokens, setMaxOutputTokens] = useState(1024);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vars = useMemo(() => templateVariables(template), [template]);
  const grouped = useMemo(() => groupByProvider(models), [models]);

  const varsFilled = vars.every((v) => (varValues[v] ?? "").trim().length > 0);
  const canSubmit = template.trim().length > 0 && selected.size > 0 && varsFilled && !submitting;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const promptName = name.trim() || template.trim().slice(0, 60) || "Untitled";
      const { id: promptId } = await api.createPrompt(promptName);
      const version = await api.createPromptVersion(promptId, template);
      const experiment = await api.startExperiment({
        name: promptName,
        promptVersionId: version.id,
        inputVariables: Object.fromEntries(vars.map((v) => [v, varValues[v] ?? ""])),
        config: { temperature, maxOutputTokens },
        modelIds: [...selected],
      });
      router.push(`/experiments/${experiment.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start the experiment");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New experiment</h1>
        <p className="mt-1 text-sm text-zinc-500">
          One prompt, run against the models you pick. Use <code>{"{{name}}"}</code> for variables.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Name (optional)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. HNSW explainer"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Prompt</span>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={5}
          placeholder="Explain how HNSW neighbor selection works."
          className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {vars.length > 0 ? (
        <fieldset className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <legend className="px-1 text-xs font-medium text-zinc-500">Variables</legend>
          {vars.map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 font-mono text-zinc-500">{v}</span>
              <input
                value={varValues[v] ?? ""}
                onChange={(e) => setVarValues((prev) => ({ ...prev, [v]: e.target.value }))}
                className="flex-1 rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="space-y-2">
        <span className="text-sm font-medium">Models</span>
        {models.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No models available. Run <code>pnpm db:seed</code>.
          </p>
        ) : (
          grouped.map(([provider, list]) => (
            <div key={provider}>
              <div className="text-xs uppercase tracking-wide text-zinc-400">{provider}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {list.map((m) => {
                  const on = selected.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m.id)}
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        on
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                          : "border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {m.displayName}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Temperature: {temperature.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="block w-48"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Max output tokens</span>
          <input
            type="number"
            min={1}
            max={128000}
            value={maxOutputTokens}
            onChange={(e) => setMaxOutputTokens(Number(e.target.value))}
            className="block w-32 rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {submitting ? "Starting…" : "Run experiment"}
      </button>
    </div>
  );
}
