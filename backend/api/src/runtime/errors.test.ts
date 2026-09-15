/**
 * The stable error envelope (runtime/errors.ts) — PROD-003.
 *
 * Every error response served through the deployed entry must carry
 * {error:{code,message,requestId}} with the status and headers preserved and
 * the internal extras (issues/detail/format) kept losslessly. Translation is
 * conservative: only the documented internal error shape is re-enveloped.
 *
 * Determinism: pure functions over fixed inputs — no clock, no randomness,
 * no I/O.
 */

import { describe, expect, test } from "bun:test";
import { errorResponse, humanizeCode, translateErrorResponse } from "./errors";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

describe("humanizeCode", () => {
  test("snake_case codes become capitalized sentences", () => {
    expect(humanizeCode("not_found")).toBe("Not found.");
    expect(humanizeCode("method_not_allowed")).toBe("Method not allowed.");
    expect(humanizeCode("session_not_found")).toBe("Session not found.");
    expect(humanizeCode("internal_error")).toBe("Internal error.");
    expect(humanizeCode("invalid_import_id")).toBe("Invalid import id.");
  });

  test("degenerate inputs pass through deterministically", () => {
    expect(humanizeCode("")).toBe("");
    expect(humanizeCode("___")).toBe("___");
    expect(humanizeCode("ready")).toBe("Ready.");
  });
});

describe("errorResponse (runtime-originated errors)", () => {
  test("builds the documented envelope with the correlation id and headers", async () => {
    const response = errorResponse(404, "not_found", "No such route.", "req-1", {
      allow: "GET",
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-request-id")).toBe("req-1");
    expect(response.headers.get("allow")).toBe("GET");
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "No such route.", requestId: "req-1" },
    });
  });
});

describe("translateErrorResponse", () => {
  test("re-envelopes the internal error shape: code → envelope, extras preserved, ok dropped", async () => {
    const core = jsonResponse(
      400,
      { ok: false, error: "invalid_request", issues: ["payload: expected an object"] },
      { "x-request-id": "req-2" },
    );
    const translated = await translateErrorResponse(core);
    expect(translated.status).toBe(400);
    expect(translated.headers.get("x-request-id")).toBe("req-2");
    expect(translated.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await translated.json()).toEqual({
      error: {
        code: "invalid_request",
        message: "Invalid request.",
        requestId: "req-2",
      },
      issues: ["payload: expected an object"],
    });
  });

  test("preserves the 405 `allow` header and any extra fields (format/detail)", async () => {
    const core = jsonResponse(
      405,
      { ok: false, error: "method_not_allowed" },
      { "x-request-id": "req-3", allow: "GET" },
    );
    const translated = await translateErrorResponse(core);
    expect(translated.status).toBe(405);
    expect(translated.headers.get("allow")).toBe("GET");
    const body = (await translated.json()) as { error: { code: string } };
    expect(body.error.code).toBe("method_not_allowed");
  });

  test("success responses (< 400) pass through untouched", async () => {
    const core = jsonResponse(200, { ok: true }, { "x-request-id": "req-4" });
    const same = await translateErrorResponse(core);
    expect(same).toBe(core);
  });

  test("non-JSON error bodies pass through byte-for-byte", async () => {
    const core = new Response("plain teapot", {
      status: 418,
      headers: { "content-type": "text/plain" },
    });
    const same = await translateErrorResponse(core);
    expect(same.status).toBe(418);
    expect(await same.text()).toBe("plain teapot");
  });

  test("JSON error bodies that are NOT the internal shape pass through unchanged", async () => {
    const core = jsonResponse(403, { error: "forbidden" }); // no ok:false
    const translated = await translateErrorResponse(core);
    expect(await translated.json()).toEqual({ error: "forbidden" });

    const enveloped = jsonResponse(503, {
      error: { code: "not_ready", message: "Service configuration is not ready." },
      issues: ["PORT: expected an integer between 1 and 65535"],
    });
    const passthrough = await translateErrorResponse(enveloped);
    expect(await passthrough.json()).toEqual({
      error: { code: "not_ready", message: "Service configuration is not ready." },
      issues: ["PORT: expected an integer between 1 and 65535"],
    });
  });

  test("unparseable JSON error bodies pass through unchanged", async () => {
    const core = new Response("{not json", {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    const translated = await translateErrorResponse(core);
    expect(translated.status).toBe(500);
    expect(await translated.text()).toBe("{not json");
  });

  test("missing x-request-id omits requestId from the envelope (still documented-shape)", async () => {
    const core = jsonResponse(404, { ok: false, error: "not_found" });
    const translated = await translateErrorResponse(core);
    const body = (await translated.json()) as { error: { code: string; requestId?: string } };
    expect(body.error.code).toBe("not_found");
    expect(body.error.requestId).toBeUndefined();
  });
});
