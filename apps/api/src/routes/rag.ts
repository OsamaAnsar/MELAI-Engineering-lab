import type { FastifyPluginAsync } from "fastify";
import {
  chunkingConfigSpecSchema,
  retrievalConfigSpecSchema,
  retrievalRunSpecSchema,
} from "@melai/shared";
import { z } from "zod";
import {
  chunkDocument,
  createChunkingConfig,
  createDocument,
  createRetrievalConfig,
  createRetrievalRun,
  embedChunks,
  getDocument,
  getRetrievalRun,
  listDocuments,
  listEmbeddingModels,
  listRetrievalRuns,
  runRetrievalRun,
  type RagDeps,
} from "../rag/service.js";
import { BadRequestError, NotFoundError } from "../errors.js";

const idParams = z.object({ id: z.string().uuid() });
const createDocumentBody = z.object({
  name: z.string().min(1).max(200),
  content: z.string().min(1).max(200_000),
});
const chunkDocumentBody = z.object({ chunkingConfigId: z.string().uuid() });
const embedBody = z.object({ embeddingModelId: z.string().uuid() });

export function ragRoutes(deps: RagDeps): FastifyPluginAsync {
  return async (app) => {
    app.post("/documents", async (request, reply) => {
      const body = createDocumentBody.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ error: "Invalid body", issues: body.error.issues });
      return reply.code(201).send(await createDocument(deps, body.data));
    });

    app.get("/documents", async () => ({ documents: await listDocuments(deps) }));

    app.get("/documents/:id", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });
      const document = await getDocument(deps, params.data.id);
      if (!document) return reply.code(404).send({ error: "Document not found" });
      return document;
    });

    app.post("/chunking-configs", async (request, reply) => {
      const body = chunkingConfigSpecSchema.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ error: "Invalid body", issues: body.error.issues });
      try {
        return reply.code(201).send(await createChunkingConfig(deps, body.data));
      } catch (err) {
        if (err instanceof BadRequestError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    });

    app.post("/documents/:id/chunk", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });
      const body = chunkDocumentBody.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ error: "Invalid body", issues: body.error.issues });

      try {
        const chunks = await chunkDocument(deps, params.data.id, body.data.chunkingConfigId);
        return { chunks };
      } catch (err) {
        if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
        throw err;
      }
    });

    app.get("/embedding-models", async () => ({
      embeddingModels: await listEmbeddingModels(deps),
    }));

    app.post("/chunking-configs/:id/embed", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });
      const body = embedBody.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ error: "Invalid body", issues: body.error.issues });

      try {
        const rows = await embedChunks(deps, params.data.id, body.data.embeddingModelId);
        return { embedded: rows.length };
      } catch (err) {
        if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
        if (err instanceof BadRequestError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    });

    app.post("/retrieval-configs", async (request, reply) => {
      const body = retrievalConfigSpecSchema.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ error: "Invalid body", issues: body.error.issues });
      try {
        return reply.code(201).send(await createRetrievalConfig(deps, body.data));
      } catch (err) {
        if (err instanceof BadRequestError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    });

    /** Starts a retrieval run. Returns 202 with pending results; progress via the stream route. */
    app.post("/retrieval-runs", async (request, reply) => {
      const parsed = retrievalRunSpecSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid retrieval run spec", issues: parsed.error.issues });
      }

      try {
        const { id, plan } = await createRetrievalRun(deps, parsed.data);
        void runRetrievalRun(deps, plan).catch((err) =>
          app.log.error(err, "runRetrievalRun failed"),
        );
        return reply.code(202).send(await getRetrievalRun(deps, id));
      } catch (err) {
        if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
        if (err instanceof BadRequestError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    });

    app.get("/retrieval-runs", async () => ({ retrievalRuns: await listRetrievalRuns(deps) }));

    app.get("/retrieval-runs/:id", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });

      const run = await getRetrievalRun(deps, params.data.id);
      if (!run) return reply.code(404).send({ error: "Retrieval run not found" });
      return run;
    });

    /** Server-Sent Events: result.started / result.completed / retrieval_run.done, then closes. */
    app.get("/retrieval-runs/:id/stream", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });
      const { id } = params.data;

      const snapshot = await getRetrievalRun(deps, id);
      if (!snapshot) return reply.code(404).send({ error: "Retrieval run not found" });

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      const send = (event: unknown) => raw.write(`data: ${JSON.stringify(event)}\n\n`);
      send({ type: "snapshot", retrievalRun: snapshot });

      if (!snapshot.pending) {
        send({ type: "retrieval_run.done", retrievalRunId: id });
        raw.end();
        return;
      }

      const unsubscribe = deps.events.subscribe(id, (event) => {
        send(event);
        if (event.type === "retrieval_run.done") {
          unsubscribe();
          raw.end();
        }
      });
      request.raw.on("close", unsubscribe);
    });
  };
}
