import type { FastifyPluginAsync } from "fastify";
import { asc, eq, models, providers } from "@melai/database";
import type { ExperimentDeps } from "../experiments/service.js";

export function registryRoutes(deps: Pick<ExperimentDeps, "db">): FastifyPluginAsync {
  return async (app) => {
    app.get("/providers", async () => {
      const rows = await deps.db
        .select({
          id: providers.id,
          name: providers.name,
          kind: providers.kind,
          createdAt: providers.createdAt,
        })
        .from(providers)
        .orderBy(asc(providers.name));
      return { providers: rows };
    });

    app.get("/models", async () => {
      const rows = await deps.db
        .select({
          id: models.id,
          name: models.name,
          displayName: models.displayName,
          provider: providers.name,
          providerKind: providers.kind,
          contextLength: models.contextLength,
          inputPricePerMtok: models.inputPricePerMtok,
          outputPricePerMtok: models.outputPricePerMtok,
          cachedInputPricePerMtok: models.cachedInputPricePerMtok,
          active: models.active,
        })
        .from(models)
        .innerJoin(providers, eq(models.providerId, providers.id))
        .orderBy(asc(providers.name), asc(models.displayName));
      return { models: rows };
    });
  };
}
