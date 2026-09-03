import type { FastifyPluginAsync } from "fastify";
import { experimentSpecSchema } from "@melai/shared";
import { z } from "zod";
import {
  BadRequestError,
  NotFoundError,
  createAndRunExperiment,
  getExperiment,
  listExperiments,
  rerunExperiment,
  type ExperimentDeps,
} from "../experiments/service.js";

const idParams = z.object({ id: z.string().uuid() });

export function experimentRoutes(deps: ExperimentDeps): FastifyPluginAsync {
  return async (app) => {
    app.post("/experiments", async (request, reply) => {
      const parsed = experimentSpecSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid experiment spec", issues: parsed.error.issues });
      }

      try {
        const { id } = await createAndRunExperiment(deps, parsed.data);
        return reply.code(201).send(await getExperiment(deps, id));
      } catch (err) {
        if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
        if (err instanceof BadRequestError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    });

    app.get("/experiments", async () => {
      return { experiments: await listExperiments(deps) };
    });

    app.get("/experiments/:id", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });

      const experiment = await getExperiment(deps, params.data.id);
      if (!experiment) return reply.code(404).send({ error: "Experiment not found" });
      return experiment;
    });

    app.post("/experiments/:id/rerun", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });

      const created = await rerunExperiment(deps, params.data.id);
      if (!created) return reply.code(404).send({ error: "Experiment not found" });
      return reply.code(201).send(await getExperiment(deps, created.id));
    });
  };
}
