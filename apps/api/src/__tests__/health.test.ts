import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

test("GET /health returns ok", async () => {
  const res = await app.inject({ method: "GET", url: "/health" });

  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.status).toBe("ok");
  expect(body.service).toBe("@melai/api");
  expect(body.deps.aiCore).toBe("@melai/ai-core");
  expect(typeof body.time).toBe("string");
});
