/**
 * The CORS layer (runtime/cors.ts) — the allow/deny matrix (PROD-003).
 *
 * Same-origin by default; AISE_CORS_ORIGINS is the explicit cross-origin
 * opt-in; arbitrary origins are never echoed; preflights are answered at the
 * seam. Deterministic: pure functions over a fixed allowlist and requests.
 */

import { describe, expect, test } from "bun:test";
import { createCorsLayer } from "./cors";

const ALLOWLIST = ["http://localhost:5173", "https://aise.example.com"];

function layer(): ReturnType<typeof createCorsLayer> {
  return createCorsLayer(ALLOWLIST);
}

function request(
  path: string,
  init: { method?: string; origin?: string; requestMethod?: string; requestHeaders?: string } = {},
): Request {
  const headers: Record<string, string> = {};
  if (init.origin !== undefined) {
    headers["origin"] = init.origin;
  }
  if (init.requestMethod !== undefined) {
    headers["access-control-request-method"] = init.requestMethod;
  }
  if (init.requestHeaders !== undefined) {
    headers["access-control-request-headers"] = init.requestHeaders;
  }
  return new Request(`https://api.aise.example${path}`, {
    method: init.method ?? "GET",
    headers,
  });
}

function coreResponse(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "x-request-id": "req-1" },
  });
}

describe("simple requests (no preflight)", () => {
  test("no Origin header → no CORS headers (same-origin/non-browser traffic)", () => {
    const response = layer().decorate(request("/healthz"), coreResponse());
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.status).toBe(200);
  });

  test("same-origin Origin (equals the request's own origin) → no CORS headers", () => {
    const response = layer().decorate(request("/healthz", { origin: "https://api.aise.example" }), coreResponse());
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("allowlisted Origin → echoed exactly, with vary and exposed correlation header", () => {
    const response = layer().decorate(request("/healthz", { origin: "http://localhost:5173" }), coreResponse());
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(response.headers.get("vary")).toBe("origin");
    expect(response.headers.get("access-control-expose-headers")).toBe("x-request-id");
    expect(response.headers.get("x-request-id")).toBe("req-1");
  });

  test("non-allowlisted Origin → NO CORS headers, never echoed", () => {
    for (const origin of [
      "https://evil.example",
      "http://localhost:5174",
      "https://api.aise.example.evil.com",
      "null",
      "not an origin",
    ]) {
      const response = layer().decorate(request("/healthz", { origin }), coreResponse());
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  test("the response body and status are preserved by decoration", async () => {
    const response = layer().decorate(request("/v1/sdk", { origin: "https://aise.example.com" }), coreResponse());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("preflight (OPTIONS + access-control-request-method)", () => {
  test("allowlisted Origin → 204 with the allow headers; no body", async () => {
    const preflight = layer().handlePreflight(
      request("/v1/capture/sync", {
        method: "OPTIONS",
        origin: "http://localhost:5173",
        requestMethod: "POST",
        requestHeaders: "content-type",
      }),
    );
    expect(preflight).not.toBeNull();
    expect(preflight!.status).toBe(204);
    expect(await preflight!.text()).toBe("");
    expect(preflight!.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(preflight!.headers.get("access-control-allow-methods")).toBe("GET, POST, HEAD, OPTIONS");
    expect(preflight!.headers.get("access-control-allow-headers")).toBe(
      "content-type, x-request-id",
    );
    expect(preflight!.headers.get("access-control-max-age")).toBe("86400");
    // No credentials mode: the API has no cookie/bearer authn today.
    expect(preflight!.headers.get("access-control-allow-credentials")).toBeNull();
  });

  test("non-allowlisted Origin → 204 with NO CORS headers (deny; nothing echoed)", () => {
    for (const origin of ["https://evil.example", "null", "https://aise.example.com/typo"]) {
      const preflight = layer().handlePreflight(
        request("/v1/capture/sync", { method: "OPTIONS", origin, requestMethod: "POST" }),
      );
      expect(preflight).not.toBeNull();
      expect(preflight!.status).toBe(204);
      expect(preflight!.headers.get("access-control-allow-origin")).toBeNull();
      expect(preflight!.headers.get("access-control-allow-methods")).toBeNull();
    }
  });

  test("same-origin preflight → no CORS headers (nothing to allow)", () => {
    const preflight = layer().handlePreflight(
      request("/v1/gaps", {
        method: "OPTIONS",
        origin: "https://api.aise.example",
        requestMethod: "POST",
      }),
    );
    expect(preflight).not.toBeNull();
    expect(preflight!.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("OPTIONS without access-control-request-method is NOT a preflight (returns null)", () => {
    expect(layer().handlePreflight(request("/healthz", { method: "OPTIONS" }))).toBeNull();
    expect(
      layer().handlePreflight(request("/healthz", { method: "OPTIONS", origin: "http://localhost:5173" })),
    ).toBeNull();
  });

  test("non-OPTIONS methods are never prefights (returns null)", () => {
    expect(
      layer().handlePreflight(request("/v1/gaps", { method: "POST", origin: "http://localhost:5173", requestMethod: "POST" })),
    ).toBeNull();
  });
});

describe("allowlist normalization", () => {
  test("an empty allowlist is same-origin-only: every cross-origin request is denied", () => {
    const strict = createCorsLayer([]);
    const response = strict.decorate(request("/healthz", { origin: "http://localhost:5173" }), coreResponse());
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const preflight = strict.handlePreflight(
      request("/v1/gaps", { method: "OPTIONS", origin: "http://localhost:5173", requestMethod: "POST" }),
    );
    expect(preflight!.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("Origin matching is exact after normalization (scheme/host/port all matter)", () => {
    const ports = createCorsLayer(["http://localhost:5173"]);
    const differentPort = ports.decorate(request("/healthz", { origin: "http://localhost:5174" }), coreResponse());
    expect(differentPort.headers.get("access-control-allow-origin")).toBeNull();
    const differentScheme = ports.decorate(request("/healthz", { origin: "https://localhost:5173" }), coreResponse());
    expect(differentScheme.headers.get("access-control-allow-origin")).toBeNull();
  });
});
