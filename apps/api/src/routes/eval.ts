import type { FastifyPluginAsync } from "fastify";
import {
  addCasesSpecSchema,
  datasetSpecSchema,
  evalConfigSpecSchema,
  evalRunSpecSchema,
} from "@melai/shared";
import { z } from "zod";
import {
  addCases,
  createDataset,
  createEvalConfig,
  createEvalRun,
  getDataset,
  getEvalRun,
  listDatasets,
  listEvalConfigs,
  listEvalRuns,
  runEvalRun,
  type EvalDeps,
} from "../eval/service.js";
import { BadRequestError, NotFoundError } from "../errors.js";

const idParams = z.object({ id: z.string().uuid() });

export function evalRoutes(deps: EvalDeps): FastifyPluginAsync {
  return async (app) => {
    app.post("/datasets", async (request, reply) => {
      const body = datasetSpecSchema.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ error: "Invalid body", issues: body.error.issues });
      return reply.code(201).send(await createDataset(deps, body.data));
    });

    app.get("/datasets", async () => ({ datasets: await listDatasets(deps) }));

    app.get("/datasets/:id", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });
      const dataset = await getDataset(deps, params.data.id);
      if (!dataset) return reply.code(404).send({ error: "Dataset not found" });
      return dataset;
    });

    app.post("/datasets/:id/cases", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });
      const body = addCasesSpecSchema.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ error: "Invalid body", issues: body.error.issues });
      try {
        return reply.code(201).send(await addCases(deps, params.data.id, body.data.cases));
      } catch (err) {
        if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
        if (err instanceof BadRequestError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    });

    app.post("/eval-configs", async (request, reply) => {
      const body = evalConfigSpecSchema.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ error: "Invalid body", issues: body.error.issues });
      return reply.code(201).send(await createEvalConfig(deps, body.data));
    });

    app.get("/eval-configs", async () => ({ evalConfigs: await listEvalConfigs(deps) }));

    /** Starts an eval run. Returns 202 with pending case results; progress via the stream route. */
    app.post("/eval-runs", async (request, reply) => {
      const parsed = evalRunSpecSchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "Invalid eval run spec", issues: parsed.error.issues });
      try {
        const { id, plan } = await createEvalRun(deps, parsed.data);
        void runEvalRun(deps, plan).catch((err) => app.log.error(err, "runEvalRun failed"));
        return reply.code(202).send(await getEvalRun(deps, id));
      } catch (err) {
        if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
        if (err instanceof BadRequestError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    });

    app.get("/eval-runs", async () => ({ evalRuns: await listEvalRuns(deps) }));

    app.get("/eval-runs/:id", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });
      const run = await getEvalRun(deps, params.data.id);
      if (!run) return reply.code(404).send({ error: "Eval run not found" });
      return run;
    });

    /** Server-Sent Events: case.started / case.completed / eval_run.done, then closes. */
    app.get("/eval-runs/:id/stream", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });
      const { id } = params.data;

      const snapshot = await getEvalRun(deps, id);
      if (!snapshot) return reply.code(404).send({ error: "Eval run not found" });

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      const send = (event: unknown) => raw.write(`data: ${JSON.stringify(event)}\n\n`);
      send({ type: "snapshot", evalRun: snapshot });

      if (!snapshot.pending) {
        send({ type: "eval_run.done", evalRunId: id });
        raw.end();
        return;
      }

      const unsubscribe = deps.events.subscribe(id, (event) => {
        send(event);
        if (event.type === "eval_run.done") {
          unsubscribe();
          raw.end();
        }
      });
      request.raw.on("close", unsubscribe);
    });
  };
}
