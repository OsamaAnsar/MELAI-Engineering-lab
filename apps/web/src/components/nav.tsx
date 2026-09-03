import Link from "next/link";

const LIVE = [
  { href: "/", label: "Dashboard" },
  { href: "/experiments", label: "Experiments" },
  { href: "/models", label: "Models" },
];

const SOON = ["RAG", "Agents", "Prompts", "Evals", "Traces"];

export function Nav() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3 text-sm">
        <Link href="/" className="font-semibold tracking-tight">
          MELAI<span className="text-zinc-400"> Lab</span>
        </Link>
        <div className="flex items-center gap-4">
          {LIVE.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto hidden items-center gap-3 text-zinc-300 dark:text-zinc-600 sm:flex">
          {SOON.map((label) => (
            <span key={label} title="coming soon">
              {label}
            </span>
          ))}
        </div>
      </nav>
    </header>
  );
}
