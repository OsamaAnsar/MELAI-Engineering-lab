import Link from "next/link";

const CARDS = [
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
  { href: "#", title: "RAG Lab", body: "Compare retrieval pipelines side by side.", ready: false },
  { href: "#", title: "Evaluation Lab", body: "Score pipelines against datasets.", ready: false },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">MELAI Engineering Lab</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Observe, compare, evaluate and debug AI systems — not black boxes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((card) => {
          const inner = (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-medium">{card.title}</h2>
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
    </div>
  );
}
