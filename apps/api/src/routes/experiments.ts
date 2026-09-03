import type { FastifyPluginAsync } from "fastify";
import { experimentSpecSchema } from "@melai/shared";
import { z } from "zod";
import {
  BadRequestError,
  NotFoundError,
  createExperiment,
  getExperiment,
  listExperiments,
  prepareRerun,
  runExperiment,
  type ExperimentDeps,
} from "../experiments/service.js";

const idParams = z.object({ id: z.string().uuid() });

export function experimentRoutes(deps: ExperimentDeps): FastifyPluginAsync {
  return async (app) => {
    /** Starts an experiment. Returns 202 with pending runs; progress via the stream route. */
    app.post("/experiments", async (request, reply) => {
      const parsed = experimentSpecSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid experiment spec", issues: parsed.error.issues });
      }

      try {
        const { id, plan } = await createExperiment(deps, parsed.data);
        void runExperiment(deps, plan).catch((err) => app.log.error(err, "runExperiment failed"));
        return reply.code(202).send(await getExperiment(deps, id));
      } catch (err) {
        if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
        if (err instanceof BadRequestError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    });

    app.get("/experiments", async () => ({ experiments: await listExperiments(deps) }));

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

      const spec = await prepareRerun(deps, params.data.id);
      if (!spec) return reply.code(404).send({ error: "Experiment not found" });

      const { id, plan } = await createExperiment(deps, spec);
      void runExperiment(deps, plan).catch((err) => app.log.error(err, "rerun failed"));
      return reply.code(202).send(await getExperiment(deps, id));
    });

    /** Server-Sent Events: run.started / run.completed / experiment.done, then closes. */
    app.get("/experiments/:id/stream", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });
      const { id } = params.data;

      const snapshot = await getExperiment(deps, id);
      if (!snapshot) return reply.code(404).send({ error: "Experiment not found" });

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      const send = (event: unknown) => raw.write(`data: ${JSON.stringify(event)}\n\n`);
      send({ type: "snapshot", experiment: snapshot });

      if (!snapshot.pending) {
        send({ type: "experiment.done", experimentId: id });
        raw.end();
        return;
      }

      const unsubscribe = deps.events.subscribe(id, (event) => {
        send(event);
        if (event.type === "experiment.done") {
          unsubscribe();
          raw.end();
        }
      });
      request.raw.on("close", unsubscribe);
    });
  };
}
