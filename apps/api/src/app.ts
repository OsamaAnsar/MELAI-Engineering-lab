import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { ExperimentEvents } from "./experiments/events.js";
import type { ExperimentDeps } from "./experiments/service.js";
import { RetrievalEvents } from "./rag/events.js";
import type { RagDeps } from "./rag/service.js";
import { EvalEvents } from "./eval/events.js";
import type { EvalDeps } from "./eval/service.js";
import type { EmbeddingProviderRegistry } from "./embeddings.js";
import { healthRoutes } from "./routes/health.js";
import { experimentRoutes } from "./routes/experiments.js";
import { registryRoutes } from "./routes/registry.js";
import { promptRoutes } from "./routes/prompts.js";
import { ragRoutes } from "./routes/rag.js";
import { evalRoutes } from "./routes/eval.js";

export type AppDeps = Omit<ExperimentDeps, "events"> & {
  embeddingRegistry: EmbeddingProviderRegistry;
};

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === "test" ? "silent" : "info" },
  });

  const fullDeps: ExperimentDeps = {
    db: deps.db,
    registry: deps.registry,
    events: new ExperimentEvents(),
  };
  const ragDeps: RagDeps = {
    db: deps.db,
    embeddingRegistry: deps.embeddingRegistry,
    events: new RetrievalEvents(),
  };
  const evalDeps: EvalDeps = {
    db: deps.db,
    embeddingRegistry: deps.embeddingRegistry,
    events: new EvalEvents(),
  };

  await app.register(cors, { origin: true });
  await app.register(healthRoutes(fullDeps));
  await app.register(registryRoutes(fullDeps));
  await app.register(promptRoutes(fullDeps));
  await app.register(experimentRoutes(fullDeps));
  await app.register(ragRoutes(ragDeps));
  await app.register(evalRoutes(evalDeps));

  return app;
}
