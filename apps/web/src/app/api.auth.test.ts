/**
 * PROD-004 — the web api seam's AUTH client tests (injected fetch stubs
 * only: no network, no timers, deterministic — same discipline as the
 * PROD-002 api seam tests).
 *
 * Covered: the whoami session probe's four honest answers (signed-in /
 * signed-out / inactive / error), the display-only principal validation,
 * the sign-in / enter-demo / sign-out clients (request shapes + outcome
 * mapping), and isUnauthorized (the 401 signal that re-arms the gate).
 */

import { describe, expect, test } from "bun:test";
import {
  enterDemoSession,
  isUnauthorized,
  probeAuth,
  signInPrincipal,
  signOutSession,
  validateSessionPrincipal,
  type FetchLike,
  type SessionPrincipal,
} from "./api";

/** One recorded outgoing request (for asserting the wire shape). */
interface RecordedCall {
  readonly input: string;
  readonly init: RequestInit | undefined;
}

/**
 * A fetch stub answering each path+method with canned behavior, recording
 * every call. Routes key on `<METHOD> <path>`.
 */
function stubFetch(
  routes: Readonly<
    Record<string, { readonly status?: number; readonly body?: unknown } | "throw">
  >,
  calls: RecordedCall[] = [],
): FetchLike {
  return async (input: string, init?: RequestInit) => {
    calls.push({ input, init });
    const method = (init?.method ?? "GET").toUpperCase();
    const route = routes[`${method} ${input}`] ?? routes[input];
    if (route === undefined) {
      return new Response(JSON.stringify({ ok: false, error: "not_stubbed" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    if (route === "throw") {
      throw new TypeError("network is down");
    }
    return new Response(JSON.stringify(route.body ?? { ok: true }), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
}

const PRINCIPAL: SessionPrincipal = {
  displayName: "Alice (local)",
  roleLabel: "Founder",
  kind: "user",
};

describe("validateSessionPrincipal (display-only vocabulary)", () => {
  test("a genuine payload passes with exactly the three display fields", () => {
    expect(validateSessionPrincipal({ ...PRINCIPAL })).toEqual(PRINCIPAL);
    expect(
      validateSessionPrincipal({ displayName: "Demo Evaluator", roleLabel: "Founder", kind: "demo" }),
    ).toEqual({ displayName: "Demo Evaluator", roleLabel: "Founder", kind: "demo" });
  });

  test("anything else is a typed invalid-shape error (never coerced)", () => {
    for (const junk of [
      null,
      "string",
      42,
      [],
      {},
      { ...PRINCIPAL, kind: "admin" },
      { ...PRINCIPAL, kind: undefined },
      { displayName: 7, roleLabel: "Founder", kind: "user" },
      { displayName: "A", roleLabel: "", kind: "demo" },
    ]) {
      expect(() => validateSessionPrincipal(junk)).toThrow();
    }
  });
});

describe("isUnauthorized (the gate re-arm signal)", () => {
  test("true only for http failures carrying 401", () => {
    expect(isUnauthorized({ kind: "http", status: 401, detail: "HTTP 401" })).toBe(true);
    expect(isUnauthorized({ kind: "http", status: 403, detail: "HTTP 403" })).toBe(false);
    expect(isUnauthorized({ kind: "network", detail: "down" })).toBe(false);
    expect(isUnauthorized({ kind: "invalid", detail: "shape" })).toBe(false);
  });
});

describe("probeAuth (GET /v1/auth/whoami — the four honest answers)", () => {
  test("200 with a session → signed-in carrying the display principal", async () => {
    const probe = await probeAuth(
      stubFetch({ "GET /v1/auth/whoami": { body: { ok: true, principal: PRINCIPAL } } }),
    );
    expect(probe).toEqual({ kind: "signed-in", principal: PRINCIPAL });
  });

  test("401 → signed-out (the auth layer is active; the gate renders)", async () => {
    const probe = await probeAuth(
      stubFetch({ "GET /v1/auth/whoami": { status: 401, body: { ok: false } } }),
    );
    expect(probe).toEqual({ kind: "signed-out" });
  });

  test("404 → inactive (this deployment runs without the auth layer)", async () => {
    const probe = await probeAuth(
      stubFetch({ "GET /v1/auth/whoami": { status: 404, body: { ok: false } } }),
    );
    expect(probe).toEqual({ kind: "inactive" });
  });

  test("network failure → error (never a silent bypass into the surfaces)", async () => {
    const probe = await probeAuth(stubFetch({ "GET /v1/auth/whoami": "throw" }));
    expect(probe.kind).toBe("error");
    if (probe.kind === "error") {
      expect(probe.failure.kind).toBe("network");
    }
  });

  test("5xx → error with the typed failure; a non-envelope 200 → error", async () => {
    const failing = await probeAuth(
      stubFetch({ "GET /v1/auth/whoami": { status: 503, body: { ok: false } } }),
    );
    expect(failing.kind).toBe("error");
    if (failing.kind === "error" && failing.failure.kind === "http") {
      expect(failing.failure.status).toBe(503);
    }
    const notEnvelope = await probeAuth(
      stubFetch({ "GET /v1/auth/whoami": { body: { hello: 1 } } }),
    );
    expect(notEnvelope.kind).toBe("error");
    if (notEnvelope.kind === "error") {
      expect(notEnvelope.failure.kind).toBe("invalid");
    }
  });

  test("a 200 whose principal payload is not display-shaped → error, never a guess", async () => {
    const probe = await probeAuth(
      stubFetch({ "GET /v1/auth/whoami": { body: { ok: true, principal: { kind: "admin" } } } }),
    );
    expect(probe.kind).toBe("error");
    if (probe.kind === "error") {
      expect(probe.failure.kind).toBe("invalid");
    }
  });
});

describe("signInPrincipal (POST /v1/auth/sessions)", () => {
  test("sends the principal id as JSON and returns the display principal", async () => {
    const calls: RecordedCall[] = [];
    const result = await signInPrincipal(
      stubFetch(
        { "POST /v1/auth/sessions": { body: { ok: true, principal: PRINCIPAL } } },
        calls,
      ),
      "user-alice",
    );
    expect(result).toEqual({ ok: true, principal: PRINCIPAL });
    expect(calls.length).toBe(1);
    expect(calls[0]?.input).toBe("/v1/auth/sessions");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe("application/json");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ principalId: "user-alice" }));
  });

  test("401 (unregistered principal) → the typed http failure the gate renders", async () => {
    const result = await signInPrincipal(
      stubFetch({ "POST /v1/auth/sessions": { status: 401, body: { ok: false } } }),
      "ghost",
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.status).toBe(401);
    }
  });

  test("an unexpected response shape → the typed invalid failure (never coerced)", async () => {
    const result = await signInPrincipal(
      stubFetch({ "POST /v1/auth/sessions": { body: { ok: true } } }),
      "user-alice",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("invalid");
    }
  });
});

describe("enterDemoSession (POST /v1/auth/demo)", () => {
  test("posts with no body and returns the demo display principal", async () => {
    const calls: RecordedCall[] = [];
    const result = await enterDemoSession(
      stubFetch(
        {
          "POST /v1/auth/demo": {
            body: {
              ok: true,
              principal: { displayName: "Demo Evaluator", roleLabel: "Founder", kind: "demo" },
            },
          },
        },
        calls,
      ),
    );
    expect(result).toEqual({
      ok: true,
      principal: { displayName: "Demo Evaluator", roleLabel: "Founder", kind: "demo" },
    });
    expect(calls[0]?.input).toBe("/v1/auth/demo");
    expect(calls[0]?.init?.method).toBe("POST");
  });

  test("failures are typed and never thrown (the gate renders them)", async () => {
    const result = await enterDemoSession(
      stubFetch({ "POST /v1/auth/demo": { status: 503, body: { ok: false } } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "http") {
      expect(result.failure.status).toBe(503);
    }
  });
});

describe("signOutSession (DELETE /v1/auth/sessions/current)", () => {
  test("issues the DELETE and reports success", async () => {
    const calls: RecordedCall[] = [];
    const result = await signOutSession(
      stubFetch({ "DELETE /v1/auth/sessions/current": { body: { ok: true } } }, calls),
    );
    expect(result).toEqual({ ok: true });
    expect(calls[0]?.input).toBe("/v1/auth/sessions/current");
    expect(calls[0]?.init?.method).toBe("DELETE");
  });

  test("failures are typed and never thrown", async () => {
    const result = await signOutSession(
      stubFetch({ "DELETE /v1/auth/sessions/current": "throw" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("network");
    }
  });
});
