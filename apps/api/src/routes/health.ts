import type { FastifyPluginAsync } from "fastify";
import { PACKAGE_NAME as AI_CORE } from "@melai/ai-core";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    return {
      status: "ok" as const,
      service: "@melai/api",
      deps: { aiCore: AI_CORE },
      time: new Date().toISOString(),
    };
  });
};
