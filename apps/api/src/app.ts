import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { ExperimentEvents } from "./experiments/events.js";
import type { ExperimentDeps } from "./experiments/service.js";
import { healthRoutes } from "./routes/health.js";
import { experimentRoutes } from "./routes/experiments.js";
import { registryRoutes } from "./routes/registry.js";
import { promptRoutes } from "./routes/prompts.js";

export type AppDeps = Omit<ExperimentDeps, "events">;

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === "test" ? "silent" : "info" },
  });

  const fullDeps: ExperimentDeps = { ...deps, events: new ExperimentEvents() };

  await app.register(cors, { origin: true });
  await app.register(healthRoutes(fullDeps));
  await app.register(registryRoutes(fullDeps));
  await app.register(promptRoutes(fullDeps));
  await app.register(experimentRoutes(fullDeps));

  return app;
}
