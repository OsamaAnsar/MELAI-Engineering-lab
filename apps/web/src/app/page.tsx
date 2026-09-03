const LABS = [
  { name: "Model Lab", status: "in progress" },
  { name: "RAG Lab", status: "planned" },
  { name: "Evaluation Lab", status: "planned" },
  { name: "Agent Lab", status: "planned" },
  { name: "Prompt Lab", status: "planned" },
  { name: "Observability Lab", status: "planned" },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">MELAI Engineering Lab</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Observe, compare, evaluate and debug AI systems — not black boxes.
        </p>
      </div>

      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {LABS.map((lab) => (
          <li key={lab.name} className="flex items-center justify-between px-4 py-3">
            <span className="font-medium">{lab.name}</span>
            <span className="text-sm text-zinc-500">{lab.status}</span>
          </li>
        ))}
      </ul>

      <p className="text-sm text-zinc-500">
        Milestone 1 — Model Comparison Lab. Scaffold only; nothing wired up yet.
      </p>
    </main>
  );
}
