import type { FastifyPluginAsync } from "fastify";
import { asc, eq, models, providers } from "@melai/database";
import type { ExperimentDeps } from "../experiments/service.js";

export function registryRoutes(deps: Pick<ExperimentDeps, "db" | "registry">): FastifyPluginAsync {
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

    app.get("/providers/health", async () => {
      const rows = await deps.db
        .select({ name: providers.name, kind: providers.kind })
        .from(providers)
        .orderBy(asc(providers.name));

      const checked = await Promise.all(
        rows.map(async (row) => {
          const provider = deps.registry.get(row.name);
          if (!provider) {
            return { name: row.name, kind: row.kind, healthy: false, reason: "not configured" };
          }
          try {
            return { name: row.name, kind: row.kind, healthy: await provider.healthCheck() };
          } catch {
            return {
              name: row.name,
              kind: row.kind,
              healthy: false,
              reason: "health check failed",
            };
          }
        }),
      );
      return { providers: checked };
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
