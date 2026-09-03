# Working agreement for this repo

This project is built from a written master plan (see `docs/` once added). Core rules:

- **Architecture before code.** Propose schema / interfaces / API / tasks and get approval before
  large changes.
- **The repo stays runnable and green after every task.** `pnpm test` and `pnpm typecheck` pass.
- **Never fabricate numbers.** Token counts, latencies, costs and eval scores must come from real
  runs, never invented.
- **Strong typing.** No `any` (ESLint enforces). Validate all external data with Zod.
- **Provider SDKs stay behind interfaces** (`packages/ai-core`). Domain logic never imports a
  vendor SDK directly.
- **Every experiment is reproducible** — persist the fully-resolved request, config, model, prompt
  version, and the pricing used at run time.
- No Kubernetes / microservices / Kafka / Redis unless there is an immediate, demonstrated need.

## Commands

```bash
pnpm dev          # turbo run dev  (web + api)
pnpm build        # turbo run build
pnpm test         # turbo run test
pnpm typecheck    # turbo run typecheck
pnpm lint         # turbo run lint
pnpm format       # prettier --write .
```

## Package manager

pnpm workspaces + Turborepo. Internal packages are consumed as TypeScript source
(`exports` -> `./src/index.ts`); `apps/web` lists them in `transpilePackages`.
