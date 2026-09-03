import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, api } from "./api-client.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: init.status ?? (init.ok === false ? 500 : 200),
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("api client", () => {
  test("GETs the expected path and returns the parsed body", async () => {
    const spy = mockFetch({ models: [{ id: "m1" }] });
    const result = await api.models();

    expect(result).toEqual({ models: [{ id: "m1" }] });
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0]![0])).toMatch(/\/models$/);
  });

  test("throws ApiError with status + server-provided detail on a non-2xx response", async () => {
    mockFetch({ error: "boom" }, { status: 503 });
    await expect(api.providerHealth()).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
      message: "boom",
    });
  });

  test("ApiError still throws when the error body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(api.experiments()).rejects.toBeInstanceOf(ApiError);
  });

  test("startExperiment POSTs the spec as JSON to /experiments", async () => {
    const spy = mockFetch({ id: "exp1", runs: [] }, { status: 202 });
    const spec = {
      name: "t",
      promptVersionId: "pv1",
      inputVariables: { a: "1" },
      config: { temperature: 0.2, maxOutputTokens: 128 },
      modelIds: ["m1"],
    };
    await api.startExperiment(spec);

    const [, init] = spy.mock.calls[0]!;
    expect(String(spy.mock.calls[0]![0])).toMatch(/\/experiments$/);
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(init!.body))).toEqual(spec);
  });
});
