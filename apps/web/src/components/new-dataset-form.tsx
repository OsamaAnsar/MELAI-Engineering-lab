"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "../lib/api-client";

const EXAMPLE = JSON.stringify(
  [
    {
      label: "refund timing",
      input: { query: "How long do refunds take?" },
      expected: { relevantText: ["within 14 business days"] },
    },
    {
      label: "data export format",
      input: { query: "What format is exported data in?" },
      expected: { relevantText: ["ZIP archive of JSON files"] },
    },
  ],
  null,
  2,
);

export function NewDatasetForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [casesText, setCasesText] = useState(EXAMPLE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && casesText.trim().length > 0 && !submitting;

  async function submit() {
    setSubmitting(true);
    setError(null);

    let cases: unknown[];
    try {
      const parsed = JSON.parse(casesText);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Cases must be a non-empty JSON array");
      }
      cases = parsed;
    } catch (err) {
      setError(err instanceof Error ? `Invalid cases JSON: ${err.message}` : "Invalid cases JSON");
      setSubmitting(false);
      return;
    }

    try {
      const dataset = await api.createDataset({ name: name.trim(), target: "retrieval" });
      await api.addCases(dataset.id, cases);
      router.push(`/eval/datasets/${dataset.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create the dataset");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New retrieval dataset</h1>
        <p className="mt-1 text-sm text-zinc-500">
          A list of test cases. Each case is a query plus the substrings a correct chunk must
          contain.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Support Policy — retrieval eval"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Cases (JSON array)</span>
        <textarea
          value={casesText}
          onChange={(e) => setCasesText(e.target.value)}
          rows={18}
          spellCheck={false}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
        <span className="text-xs text-zinc-400">
          {`{ label?, input: { query }, expected: { relevantText: string[] } }`}
        </span>
      </label>

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
        {submitting ? "Creating…" : "Create dataset"}
      </button>
    </div>
  );
}
