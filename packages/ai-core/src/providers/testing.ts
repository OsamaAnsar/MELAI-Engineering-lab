export interface StubRoute {
  /** Matched against the request URL. */
  match: RegExp;
  status?: number;
  /** JSON-serialized as the response body. Omit for an empty body. */
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * A `fetch` implementation that answers by URL pattern — a fake HTTP transport
 * for provider adapters. Lets a contract test drive an adapter with canned
 * provider responses and error statuses, no network involved.
 */
export function stubFetch(routes: StubRoute[]): typeof fetch {
  const impl = async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes.find((r) => r.match.test(url));
    if (!route) {
      return new Response(JSON.stringify({ error: "no stub route", url }), { status: 501 });
    }
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json", ...route.headers },
    });
  };
  return impl as typeof fetch;
}

/**
 * A `fetch` that streams a fixed body — SSE by default, or another content type
 * (e.g. `application/x-ndjson` for Ollama).
 */
export function stubStreamFetch(body: string, contentType = "text/event-stream"): typeof fetch {
  const impl = async (): Promise<Response> =>
    new Response(body, { status: 200, headers: { "content-type": contentType } });
  return impl as typeof fetch;
}
