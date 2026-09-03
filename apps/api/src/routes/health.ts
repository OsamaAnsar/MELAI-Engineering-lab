import type { FastifyPluginAsync } from "fastify";
import { sql } from "@melai/database";
import type { ExperimentDeps } from "../experiments/service.js";

export function healthRoutes(deps: Pick<ExperimentDeps, "db">): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async () => {
      let db = false;
      try {
        await deps.db.execute(sql`select 1`);
        db = true;
      } catch {
        db = false;
      }

      return {
        status: db ? ("ok" as const) : ("degraded" as const),
        service: "@melai/api",
        checks: { db },
        time: new Date().toISOString(),
      };
    });
  };
}
