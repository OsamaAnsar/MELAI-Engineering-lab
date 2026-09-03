import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { experimentRoutes } from "./routes/experiments.js";
import { registryRoutes } from "./routes/registry.js";
import { promptRoutes } from "./routes/prompts.js";
import type { ExperimentDeps } from "./experiments/service.js";

export async function buildApp(deps: ExperimentDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === "test" ? "silent" : "info" },
  });

  await app.register(cors, { origin: true });
  await app.register(healthRoutes(deps));
  await app.register(registryRoutes(deps));
  await app.register(promptRoutes(deps));
  await app.register(experimentRoutes(deps));

  return app;
}
