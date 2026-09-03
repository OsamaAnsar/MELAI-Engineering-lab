# MELAI Engineering Lab

An interactive lab to **observe, compare, evaluate and debug AI systems** — local vs cloud models,
prompts, retrieval strategies, rerankers, RAG pipelines, agents, tools, and evaluations — side by side.

> AI systems should be observable, measurable, and comparable — not black boxes.

## Status

Early development. **Milestone 1 — Model Comparison Lab**: run the same prompt against a local
(Ollama) model and cloud (Anthropic, OpenAI) models concurrently, and compare response, latency,
tokens, and cost as a reproducible experiment.

Later milestones: RAG Lab, Evaluation Lab, Agent Lab, local GPU observability, CLI + CI eval gates.

## Workspace layout

```
apps/
  web/        Next.js UI (thin client — never holds provider keys)
  api/        Fastify service — runs experiments, hosts provider adapters
packages/
  ai-core/    ModelProvider abstraction, GenerationResult, cost calculation
  shared/     framework-agnostic types and helpers
  database/   Postgres access (Drizzle) — schema lands in Milestone 1
```

## Getting started

Prerequisites: Node >= 22, pnpm, Docker (for Postgres), Ollama (for local models).

```bash
pnpm install
pnpm dev          # web + api
pnpm test         # all workspaces
pnpm typecheck
```

## License

MIT
