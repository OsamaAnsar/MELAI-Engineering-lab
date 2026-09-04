"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "../lib/api-client";

export function NewDocumentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && content.trim().length > 0 && !submitting;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const document = await api.createDocument({ name: name.trim(), content });
      router.push(`/rag/documents/${document.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create the document");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New document</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Paste a corpus to chunk, embed, and run retrieval against.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. refund-policy.md"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Content</span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={16}
          placeholder="Paste the text to index…"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <span className="text-xs text-zinc-400">
          {content.trim().length.toLocaleString()} chars
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
        {submitting ? "Creating…" : "Create document"}
      </button>
    </div>
  );
}
