import type { FastifyPluginAsync } from "fastify";
import { desc, eq, promptVersions, prompts } from "@melai/database";
import { templateVariables } from "@melai/shared";
import { z } from "zod";
import type { ExperimentDeps } from "../experiments/service.js";

const createPromptBody = z.object({ name: z.string().min(1).max(200) });
const createVersionBody = z.object({ template: z.string().min(1).max(20_000) });
const idParams = z.object({ id: z.string().uuid() });

export function promptRoutes(deps: Pick<ExperimentDeps, "db">): FastifyPluginAsync {
  return async (app) => {
    app.post("/prompts", async (request, reply) => {
      const body = createPromptBody.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ error: "Invalid body", issues: body.error.issues });

      const [prompt] = await deps.db.insert(prompts).values({ name: body.data.name }).returning();
      return reply.code(201).send(prompt);
    });

    app.get("/prompts", async () => {
      const rows = await deps.db.query.prompts.findMany({ orderBy: desc(prompts.createdAt) });
      return { prompts: rows };
    });

    app.get("/prompts/:id", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });

      const prompt = await deps.db.query.prompts.findFirst({
        where: eq(prompts.id, params.data.id),
        with: { versions: { orderBy: desc(promptVersions.version) } },
      });
      if (!prompt) return reply.code(404).send({ error: "Prompt not found" });
      return prompt;
    });

    app.post("/prompts/:id/versions", async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Invalid id" });

      const body = createVersionBody.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ error: "Invalid body", issues: body.error.issues });

      const prompt = await deps.db.query.prompts.findFirst({
        where: eq(prompts.id, params.data.id),
      });
      if (!prompt) return reply.code(404).send({ error: "Prompt not found" });

      const latest = await deps.db.query.promptVersions.findFirst({
        where: eq(promptVersions.promptId, prompt.id),
        orderBy: desc(promptVersions.version),
        columns: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      const [version] = await deps.db
        .insert(promptVersions)
        .values({
          promptId: prompt.id,
          version: nextVersion,
          template: body.data.template,
          variables: templateVariables(body.data.template),
        })
        .returning();
      return reply.code(201).send(version);
    });
  };
}
