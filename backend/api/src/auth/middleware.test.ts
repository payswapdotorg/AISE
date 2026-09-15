/**
 * PROD-004 — the seam-layer tests: the FULL authorization matrix, the auth
 * endpoints, cookie discipline, logout/expiry, body-verbatim forwarding and
 * the secret-leak scan.
 *
 * THE MATRIX (the work order's evidence): anonymous / demo / signed-in ×
 * own / other / malformed × GET / POST over the path-scoped namespaces
 * (reality, identity) and the body-scoped namespaces (cases, interventions,
 * comparisons) — ≥3 namespaces, all through the real `handle()` pipeline.
 *
 * Determinism: in-memory stores, a mutable injected clock (fixed values),
 * fixed secrets and ids; no network, no wall clock, no randomness.
 */

import { describe, expect, test } from "bun:test";
import { createLogger, type Logger } from "../lib/log";
import { InMemoryIdentityStore } from "../identity/store";
import { IdentityService } from "../identity/service";
import { FIXED_NOW } from "../identity/testkit";
import type { AuthConfig, AuthMode } from "./config";
import { ensureDemoTenant, DEMO_ORGANIZATION_ID, DEMO_PROJECT_IDS } from "./demo";
import {
  createAuthLayer,
  createDegradedAuthLayer,
  decideUnscopedAccess,
  extractBodyScope,
  extractPathScope,
  readSessionCookie,
  readSessionToken,
  type AuthLayer,
} from "./middleware";
import { InMemorySessionStore } from "./store";
import { mintSessionToken } from "./token";
import { SESSION_COOKIE_NAME } from "./model";

const SECRET = "test-auth-secret-fixed-for-middleware-tests";
const DEMO_PRINCIPAL = "demo-evaluator";
const ALICE = "user-alice";
const ALICE_ORG = "org-alice";
const ALICE_PROJECT = "proj-alice-1";
const FOREIGN_ORG = "org-mallory";
const FOREIGN_PROJECT = "project-mallory-1";

/** A mutable injected clock (fixed values only — never the wall clock). */
function makeClock(initial: string = FIXED_NOW): { clock: () => string; set: (iso: string) => void } {
  let now = initial;
  return { clock: (): string => now, set: (iso: string): void => {
    now = iso;
  } };
}

interface World {
  readonly layer: AuthLayer;
  readonly sessions: InMemorySessionStore;
  readonly identity: InMemoryIdentityStore;
  readonly service: IdentityService;
  readonly clockSet: (iso: string) => void;
  readonly logLines: readonly string[];
}

async function authWorld(overrides: {
  readonly mode?: AuthMode;
  readonly ttlSeconds?: number;
  readonly clock?: () => string;
} = {}): Promise<World> {
  const { clock, set } = makeClock();
  const identity = new InMemoryIdentityStore();
  const service = new IdentityService({ store: identity, clock: overrides.clock ?? clock });
  // The demo tenant (real identity-library state, idempotent acts).
  await ensureDemoTenant({ service, demoPrincipalId: DEMO_PRINCIPAL });
  // Alice's tenant (a signed-in USER with her own project).
  await service.registerPrincipal({ principalId: ALICE, displayName: "Alice (local)" });
  await service.createOrganization({
    organizationId: ALICE_ORG,
    name: "Alice Co",
    founder: { principalId: ALICE, permissions: ["identity:admin", "identity:write"] },
  });
  await service.createProject({
    organizationId: ALICE_ORG,
    projectId: ALICE_PROJECT,
    name: "Alice One",
    actor: ALICE,
  });
  // Mallory's tenant (the foreign tenant nobody in this matrix may touch).
  await service.registerPrincipal({ principalId: "user-mallory", displayName: "Mallory" });
  await service.createOrganization({
    organizationId: FOREIGN_ORG,
    name: "Mallory Industries",
    founder: { principalId: "user-mallory", permissions: ["identity:admin"] },
  });
  await service.createProject({
    organizationId: FOREIGN_ORG,
    projectId: FOREIGN_PROJECT,
    name: "Mallory's project",
    actor: "user-mallory",
  });
  const config: AuthConfig = {
    enabled: true,
    mode: overrides.mode ?? "demo-open",
    secret: SECRET,
    sessionTtlSeconds: overrides.ttlSeconds ?? 3_600,
    demoPrincipalId: DEMO_PRINCIPAL,
  };
  const sessions = new InMemorySessionStore();
  const lines: string[] = [];
  const logger: Logger = createLogger("debug", (line) => {
    lines.push(line);
  });
  const layer = createAuthLayer({
    config,
    store: sessions,
    directory: identity,
    identity: service,
    clock: overrides.clock ?? clock,
    logger,
  });
  return { layer, sessions, identity, service, clockSet: set, logLines: lines };
}

/* ---------------- request helpers ---------------- */

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://api.aise.example${path}`, { method: "GET", headers });
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://api.aise.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deleteRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://api.aise.example${path}`, { method: "DELETE", headers });
}

/** Mint a caller's session cookie through the REAL endpoints. */
async function sessionCookie(world: World, who: "demo" | "alice"): Promise<string> {
  const request = who === "demo" ? post("/v1/auth/demo", {}) : post("/v1/auth/sessions", { principalId: ALICE });
  const outcome = await world.layer.handle(request, "req-mint");
  expect(outcome.kind).toBe("response");
  if (outcome.kind !== "response") {
    throw new Error("unreachable");
  }
  expect(outcome.response.status).toBe(200);
  const cookie = outcome.response.headers.get("set-cookie");
  expect(cookie).not.toBeNull();
  return cookie ?? "";
}

function tokenOf(cookie: string): string {
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

function withCookie(cookie: string): Record<string, string> {
  return { cookie };
}

async function bodyOf(response: Response): Promise<string> {
  return await response.text();
}

/* ---------------- the matrix ---------------- */

/**
 * The namespace rows. PATH namespaces address the tenant in the route
 * (reality projects, identity organizations — the documented route shapes);
 * BODY namespaces address it in the JSON mutation body's top-level
 * projectId (cases, interventions, comparisons — the generic signal).
 */
const PATH_NAMESPACES = [
  {
    name: "reality (path-scoped project)",
    demoId: DEMO_PROJECT_IDS[0] ?? "proj-riverside-refit",
    aliceOwnId: ALICE_PROJECT,
    foreignId: FOREIGN_PROJECT,
    read: (projectId: string, headers: Record<string, string> = {}) =>
      get(`/v1/reality/projects/${projectId}/layers`, headers),
    write: (projectId: string, headers: Record<string, string> = {}) =>
      post(`/v1/reality/projects/${projectId}/layers`, {}, headers),
  },
  {
    name: "identity (path-scoped organization)",
    demoId: DEMO_ORGANIZATION_ID,
    aliceOwnId: ALICE_ORG,
    foreignId: FOREIGN_ORG,
    read: (organizationId: string, headers: Record<string, string> = {}) =>
      get(`/v1/identity/organizations/${organizationId}/projects`, headers),
    write: (organizationId: string, headers: Record<string, string> = {}) =>
      post(`/v1/identity/organizations/${organizationId}/projects`, { name: "x" }, headers),
  },
] as const;

const BODY_NAMESPACES = [
  {
    name: "cases (body-scoped projectId)",
    demoId: DEMO_PROJECT_IDS[0] ?? "proj-riverside-refit",
    aliceOwnId: ALICE_PROJECT,
    write: (projectId: string, headers: Record<string, string> = {}) =>
      post("/v1/cases", { projectId, title: "matrix case" }, headers),
  },
  {
    name: "interventions (body-scoped projectId)",
    demoId: DEMO_PROJECT_IDS[1] ?? "project-zurich-hq",
    aliceOwnId: ALICE_PROJECT,
    write: (projectId: string, headers: Record<string, string> = {}) =>
      post("/v1/interventions", { projectId, summary: "matrix intervention" }, headers),
  },
  {
    name: "comparisons (body-scoped projectId)",
    demoId: DEMO_PROJECT_IDS[0] ?? "proj-riverside-refit",
    aliceOwnId: ALICE_PROJECT,
    write: (projectId: string, headers: Record<string, string> = {}) =>
      post("/v1/comparisons", { projectId, label: "matrix comparison" }, headers),
  },
] as const;

const DEMO_PROJECT = DEMO_PROJECT_IDS[0] ?? "proj-riverside-refit";

describe("THE AUTHORIZATION MATRIX — path-scoped namespaces (GET + POST)", () => {
  for (const namespace of PATH_NAMESPACES) {
    describe(namespace.name, () => {
      test("anonymous + demo-open: demo-tenant GET passes, foreign GET is 401, any POST is 401", async () => {
        const world = await authWorld();
        const demoRead = await world.layer.handle(namespace.read(namespace.demoId), "req-1");
        expect(demoRead.kind).toBe("pass");
        const foreignRead = await world.layer.handle(namespace.read(namespace.foreignId), "req-2");
        expect(foreignRead.kind).toBe("response");
        if (foreignRead.kind === "response") {
          expect(foreignRead.response.status).toBe(401);
          expect(await bodyOf(foreignRead.response)).toContain("authentication_required");
        }
        const demoWrite = await world.layer.handle(namespace.write(namespace.demoId), "req-3");
        expect(demoWrite.kind).toBe("response");
        if (demoWrite.kind === "response") {
          expect(demoWrite.response.status).toBe(401);
          expect(await bodyOf(demoWrite.response)).toContain("authentication_required");
        }
      });

      test("demo session: demo-tenant GET/POST pass; foreign tenant GET/POST are 403 cross_tenant", async () => {
        const world = await authWorld();
        const cookie = await sessionCookie(world, "demo");
        const headers = withCookie(cookie);
        const demoRead = await world.layer.handle(namespace.read(namespace.demoId, headers), "req-4");
        expect(demoRead.kind).toBe("pass");
        const demoWrite = await world.layer.handle(namespace.write(namespace.demoId, headers), "req-5");
        expect(demoWrite.kind).toBe("pass");
        for (const [label, request] of [
          ["GET", namespace.read(namespace.foreignId, headers)],
          ["POST", namespace.write(namespace.foreignId, headers)],
        ] as const) {
          const outcome = await world.layer.handle(request, `req-6-${label}`);
          expect(outcome.kind).toBe("response");
          if (outcome.kind === "response") {
            expect(outcome.response.status).toBe(403);
            const body = await bodyOf(outcome.response);
            expect(body).toContain("cross_tenant");
          }
        }
      });

      test("signed-in user: own-tenant GET/POST pass; other-tenant GET/POST are 403 cross_tenant", async () => {
        const world = await authWorld();
        const cookie = await sessionCookie(world, "alice");
        const headers = withCookie(cookie);
        const ownRead = await world.layer.handle(namespace.read(namespace.aliceOwnId, headers), "req-7");
        expect(ownRead.kind).toBe("pass");
        const ownWrite = await world.layer.handle(namespace.write(namespace.aliceOwnId, headers), "req-8");
        expect(ownWrite.kind).toBe("pass");
        for (const [label, request] of [
          ["GET", namespace.read(namespace.demoId, headers)],
          ["POST", namespace.write(namespace.demoId, headers)],
        ] as const) {
          const outcome = await world.layer.handle(request, `req-9-${label}`);
          expect(outcome.kind).toBe("response");
          if (outcome.kind === "response") {
            expect(outcome.response.status).toBe(403);
            expect(await bodyOf(outcome.response)).toContain("cross_tenant");
          }
        }
      });

      test("malformed ids are 400 for everyone (GET and POST, anonymous and sessioned)", async () => {
        const world = await authWorld();
        const cookie = await sessionCookie(world, "demo");
        for (const [who, headers] of [
          ["anonymous", {}],
          ["demo", withCookie(cookie)],
        ] as const) {
          const long = "x".repeat(257);
          for (const request of [namespace.read(long, headers), namespace.write(long, headers)]) {
            const outcome = await world.layer.handle(request, `req-10-${who}`);
            expect(outcome.kind).toBe("response");
            if (outcome.kind === "response") {
              expect(outcome.response.status).toBe(400);
              const body = await bodyOf(outcome.response);
              expect(body).toContain(namespace.name.startsWith("reality") ? "invalid_project_id" : "invalid_organization_id");
            }
          }
        }
      });
    });
  }
});

describe("THE AUTHORIZATION MATRIX — body-scoped namespaces (POST)", () => {
  for (const namespace of BODY_NAMESPACES) {
    describe(namespace.name, () => {
      test("anonymous POST is 401 regardless of the target (writes always need a session)", async () => {
        const world = await authWorld();
        for (const projectId of [namespace.demoId, FOREIGN_PROJECT]) {
          const outcome = await world.layer.handle(namespace.write(projectId), "req-11");
          expect(outcome.kind).toBe("response");
          if (outcome.kind === "response") {
            expect(outcome.response.status).toBe(401);
            expect(await bodyOf(outcome.response)).toContain("authentication_required");
          }
        }
      });

      test("demo session: demo-tenant POST passes; foreign-tenant POST is 403 cross_tenant", async () => {
        const world = await authWorld();
        const cookie = await sessionCookie(world, "demo");
        const headers = withCookie(cookie);
        const allowed = await world.layer.handle(namespace.write(namespace.demoId, headers), "req-12");
        expect(allowed.kind).toBe("pass");
        const refused = await world.layer.handle(namespace.write(FOREIGN_PROJECT, headers), "req-13");
        expect(refused.kind).toBe("response");
        if (refused.kind === "response") {
          expect(refused.response.status).toBe(403);
          expect(await bodyOf(refused.response)).toContain("cross_tenant");
        }
      });

      test("signed-in user: own-tenant POST passes; other-tenant POST is 403 cross_tenant", async () => {
        const world = await authWorld();
        const cookie = await sessionCookie(world, "alice");
        const headers = withCookie(cookie);
        const allowed = await world.layer.handle(namespace.write(namespace.aliceOwnId, headers), "req-14");
        expect(allowed.kind).toBe("pass");
        const refused = await world.layer.handle(namespace.write(namespace.demoId, headers), "req-15");
        expect(refused.kind).toBe("response");
        if (refused.kind === "response") {
          expect(refused.response.status).toBe(403);
          expect(await bodyOf(refused.response)).toContain("cross_tenant");
        }
      });

      test("a malformed projectId in the body is 400; a non-JSON body passes the scope check untouched", async () => {
        const world = await authWorld();
        const cookie = await sessionCookie(world, "demo");
        const malformed = await world.layer.handle(namespace.write("x".repeat(257)), "req-16");
        expect(malformed.kind).toBe("response");
        if (malformed.kind === "response") {
          expect(malformed.response.status).toBe(400);
          expect(await bodyOf(malformed.response)).toContain("invalid_project_id");
        }
        // A body that is not JSON never yields a scope (the core owns its
        // own parse errors); the request passes the seam unmodified.
        const nonJson = await world.layer.handle(
          new Request("https://api.aise.example/v1/cases", {
            method: "POST",
            headers: { "content-type": "text/plain", ...withCookie(cookie) },
            body: "not json",
          }),
          "req-17",
        );
        expect(nonJson.kind).toBe("pass");
      });
    });
  }
});

describe("THE AUTHORIZATION MATRIX — unscoped + health routes", () => {
  test("anonymous demo-open GET of an unscoped discovery route passes; `required` mode refuses it", async () => {
    const open = await authWorld();
    expect((await open.layer.handle(get("/v1/adoption"), "req-18")).kind).toBe("pass");
    const strict = await authWorld({ mode: "required" });
    const outcome = await strict.layer.handle(get("/v1/adoption"), "req-19");
    expect(outcome.kind).toBe("response");
    if (outcome.kind === "response") {
      expect(outcome.response.status).toBe(401);
    }
  });

  test("anonymous GET of a demo-tenant LIST route (unscoped) passes in demo-open", async () => {
    const world = await authWorld();
    expect((await world.layer.handle(get("/v1/reality/projects"), "req-20")).kind).toBe("pass");
  });

  test("/healthz and /readyz pass through UNAUTHENTICATED and untouched (same request object)", async () => {
    const world = await authWorld();
    for (const path of ["/healthz", "/readyz"]) {
      const request = get(path);
      const outcome = await world.layer.handle(request, "req-21");
      expect(outcome).toEqual({ kind: "pass", request });
    }
  });

  test("non-/v1 paths pass through (the layer owns /v1 only)", async () => {
    const world = await authWorld();
    const request = get("/favicon.ico");
    const outcome = await world.layer.handle(request, "req-22");
    expect(outcome).toEqual({ kind: "pass", request });
  });
});

describe("the auth endpoints", () => {
  test("POST /v1/auth/sessions: registered principal → 200 + display-only payload + cookie", async () => {
    const world = await authWorld();
    const outcome = await world.layer.handle(post("/v1/auth/sessions", { principalId: ALICE }), "req-23");
    expect(outcome.kind).toBe("response");
    if (outcome.kind !== "response") {
      throw new Error("unreachable");
    }
    expect(outcome.response.status).toBe(200);
    const payload = JSON.parse(await bodyOf(outcome.response)) as Record<string, unknown>;
    expect(payload.ok).toBe(true);
    // DISPLAY-ONLY vocabulary: exactly these three fields, nothing else.
    expect(Object.keys(payload.principal as Record<string, unknown>).sort()).toEqual([
      "displayName",
      "kind",
      "roleLabel",
    ]);
    expect((payload.principal as Record<string, unknown>).kind).toBe("user");
    expect((payload.principal as Record<string, unknown>).roleLabel).toBe("Founder");
  });

  test("POST /v1/auth/sessions: unknown principal → 401; malformed body → 400; bad shape → 400", async () => {
    const world = await authWorld();
    const unknown = await world.layer.handle(
      post("/v1/auth/sessions", { principalId: "ghost" }),
      "req-24",
    );
    expect(unknown.kind).toBe("response");
    if (unknown.kind === "response") {
      expect(unknown.response.status).toBe(401);
      expect(await bodyOf(unknown.response)).toContain("unknown_principal");
    }
    const malformed = await world.layer.handle(
      post("/v1/auth/sessions", "{not json", ),
      "req-25",
    );
    expect(malformed.kind).toBe("response");
    if (malformed.kind === "response") {
      expect(malformed.response.status).toBe(400);
      expect(await bodyOf(malformed.response)).toContain("malformed_json");
    }
    const badShape = await world.layer.handle(post("/v1/auth/sessions", { principalId: "" }), "req-26");
    expect(badShape.kind).toBe("response");
    if (badShape.kind === "response") {
      expect(badShape.response.status).toBe(400);
      expect(await bodyOf(badShape.response)).toContain("invalid_principal_id");
    }
  });

  test("POST /v1/auth/demo: mints the contained demo session (demo kind, Founder label)", async () => {
    const world = await authWorld();
    const outcome = await world.layer.handle(post("/v1/auth/demo", {}), "req-27");
    expect(outcome.kind).toBe("response");
    if (outcome.kind !== "response") {
      throw new Error("unreachable");
    }
    expect(outcome.response.status).toBe(200);
    const payload = JSON.parse(await bodyOf(outcome.response)) as Record<string, unknown>;
    expect(payload.ok).toBe(true);
    const principal = payload.principal as Record<string, unknown>;
    expect(principal.kind).toBe("demo");
    expect(principal.displayName).toBe("Demo Evaluator");
    expect(principal.roleLabel).toBe("Founder");
  });

  test("GET /v1/auth/whoami: sessioned → the display payload; anonymous → 401; HEAD is allowed", async () => {
    const world = await authWorld();
    const cookie = await sessionCookie(world, "alice");
    const who = await world.layer.handle(get("/v1/auth/whoami", withCookie(cookie)), "req-28");
    expect(who.kind).toBe("response");
    if (who.kind === "response") {
      expect(who.response.status).toBe(200);
      const payload = JSON.parse(await bodyOf(who.response)) as Record<string, unknown>;
      expect((payload.principal as Record<string, unknown>).displayName).toBe("Alice (local)");
    }
    const anonymous = await world.layer.handle(get("/v1/auth/whoami"), "req-29");
    expect(anonymous.kind).toBe("response");
    if (anonymous.kind === "response") {
      expect(anonymous.response.status).toBe(401);
    }
    const head = await world.layer.handle(
      new Request("https://api.aise.example/v1/auth/whoami", {
        method: "HEAD",
        headers: withCookie(cookie),
      }),
      "req-30",
    );
    expect(head.kind).toBe("response");
    if (head.kind === "response") {
      expect(head.response.status).toBe(200);
    }
  });

  test("wrong methods on the auth endpoints keep the 405 discipline with Allow headers", async () => {
    const world = await authWorld();
    for (const [request, allow] of [
      [get("/v1/auth/sessions"), "POST"],
      [post("/v1/auth/whoami", {}), "GET, HEAD"],
      [get("/v1/auth/demo"), "POST"],
      [get("/v1/auth/sessions/current"), "DELETE"],
    ] as const) {
      const outcome = await world.layer.handle(request, "req-31");
      expect(outcome.kind).toBe("response");
      if (outcome.kind === "response") {
        expect(outcome.response.status).toBe(405);
        expect(await bodyOf(outcome.response)).toContain("method_not_allowed");
        expect(outcome.response.headers.get("allow")).toBe(allow);
      }
    }
  });

  test("an unknown auth path is an honest 404 (the core would say the same)", async () => {
    const world = await authWorld();
    const outcome = await world.layer.handle(get("/v1/auth/nope"), "req-32");
    expect(outcome.kind).toBe("response");
    if (outcome.kind === "response") {
      expect(outcome.response.status).toBe(404);
    }
  });
});

describe("cookie + token transport discipline", () => {
  test("the session cookie is httpOnly + sameSite=strict + Path=/ + Max-Age=TTL, Secure on https", async () => {
    const world = await authWorld({ ttlSeconds: 900 });
    const cookie = await sessionCookie(world, "alice");
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=900");
    expect(cookie).toContain("Secure"); // https origin
  });

  test("plain http origins omit the Secure flag (local dev honesty)", async () => {
    const world = await authWorld();
    const outcome = await world.layer.handle(
      new Request("http://127.0.0.1:8080/v1/auth/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ principalId: ALICE }),
      }),
      "req-33",
    );
    expect(outcome.kind).toBe("response");
    if (outcome.kind === "response") {
      const cookie = outcome.response.headers.get("set-cookie") ?? "";
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).not.toContain("Secure");
    }
  });

  test("Authorization: Bearer transports the token for CLI callers", async () => {
    const world = await authWorld();
    const cookie = await sessionCookie(world, "alice");
    const token = tokenOf(cookie);
    const outcome = await world.layer.handle(
      get("/v1/auth/whoami", { authorization: `Bearer ${token}` }),
      "req-34",
    );
    expect(outcome.kind).toBe("response");
    if (outcome.kind === "response") {
      expect(outcome.response.status).toBe(200);
    }
  });

  test("the cookie wins over the bearer header; empty values are ignored", async () => {
    const world = await authWorld();
    const cookie = await sessionCookie(world, "alice");
    const both = await world.layer.handle(
      get("/v1/auth/whoami", { cookie, authorization: "Bearer v1.junk.junk.junk" }),
      "req-35",
    );
    expect(both.kind === "response" && both.response.status).toBe(200);
    const emptyBearer = await world.layer.handle(
      get("/v1/auth/whoami", { authorization: "Bearer " }),
      "req-36",
    );
    expect(emptyBearer.kind === "response" && emptyBearer.response.status).toBe(401);
  });
});

describe("tamper, expiry and logout", () => {
  test("a tampered token fails 401 session_invalid; a foreign-secret token fails the same", async () => {
    const world = await authWorld();
    const cookie = await sessionCookie(world, "alice");
    const token = tokenOf(cookie);
    const tampered = `${token.slice(0, -4)}beef`;
    for (const bad of [tampered, mintSessionToken("a-different-secret", "sess-x", 4_102_444_800_000)]) {
      const outcome = await world.layer.handle(
        get("/v1/auth/whoami", { authorization: `Bearer ${bad}` }),
        "req-37",
      );
      expect(outcome.kind === "response" && outcome.response.status).toBe(401);
      if (outcome.kind === "response") {
        expect(await bodyOf(outcome.response)).toContain("session_invalid");
      }
    }
  });

  test("an expired token fails 401 session_expired (verified BEFORE the store is consulted)", async () => {
    const world = await authWorld({ ttlSeconds: 60 });
    const cookie = await sessionCookie(world, "alice");
    world.clockSet("2027-01-01T00:00:00.000Z"); // far past the 60s TTL
    const outcome = await world.layer.handle(get("/v1/auth/whoami", withCookie(cookie)), "req-38");
    expect(outcome.kind === "response" && outcome.response.status).toBe(401);
    if (outcome.kind === "response") {
      expect(await bodyOf(outcome.response)).toContain("session_expired");
    }
  });

  test("a session whose STORE record expired is deleted on access (deterministic on-access cleanup)", async () => {
    const world = await authWorld();
    const cookie = await sessionCookie(world, "alice");
    const token = tokenOf(cookie);
    const sessionId = token.split(".")[1] ?? "";
    expect(await world.sessions.get(sessionId)).not.toBeNull();
    // Hand-expire the record in the store while the TOKEN still verifies:
    // rewrite the record with a past expiry, then present the same token.
    const record = await world.sessions.get(sessionId);
    expect(record).not.toBeNull();
    await world.sessions.put({
      ...(record as { sessionId: string; principalId: string; kind: "user" | "demo"; createdAt: string; expiresAt: string }),
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    const outcome = await world.layer.handle(
      get("/v1/auth/whoami", { authorization: `Bearer ${token}` }),
      "req-39",
    );
    expect(outcome.kind === "response" && outcome.response.status).toBe(401);
    if (outcome.kind === "response") {
      expect(await bodyOf(outcome.response)).toContain("session_expired");
    }
    expect(await world.sessions.get(sessionId)).toBeNull(); // deleted on access
  });

  test("logout deletes the server-side session, clears the cookie, and the token is dead afterwards", async () => {
    const world = await authWorld();
    const cookie = await sessionCookie(world, "alice");
    const token = tokenOf(cookie);
    const sessionId = token.split(".")[1] ?? "";
    expect(await world.sessions.get(sessionId)).not.toBeNull();
    const outcome = await world.layer.handle(deleteRequest("/v1/auth/sessions/current", withCookie(cookie)), "req-40");
    expect(outcome.kind).toBe("response");
    if (outcome.kind === "response") {
      expect(outcome.response.status).toBe(200);
      const cleared = outcome.response.headers.get("set-cookie") ?? "";
      expect(cleared).toContain(`${SESSION_COOKIE_NAME}=;`);
      expect(cleared).toContain("Max-Age=0");
      expect(cleared).toContain("HttpOnly");
    }
    expect(await world.sessions.get(sessionId)).toBeNull();
    const after = await world.layer.handle(
      get("/v1/auth/whoami", { authorization: `Bearer ${token}` }),
      "req-41",
    );
    expect(after.kind === "response" && after.response.status).toBe(401);
  });

  test("logout without a session is an honest 401 (and still clears the cookie)", async () => {
    const world = await authWorld();
    const outcome = await world.layer.handle(deleteRequest("/v1/auth/sessions/current"), "req-42");
    expect(outcome.kind === "response" && outcome.response.status).toBe(401);
    if (outcome.kind === "response") {
      expect(outcome.response.headers.get("set-cookie")).toContain("Max-Age=0");
    }
  });

  test("a session for a principal absent from the registry fails closed (unknown_principal)", async () => {
    const world = await authWorld();
    // Hand-craft a valid session for a principal that is NOT registered:
    // the token verifies and the store answers — the DIRECTORY refuses.
    const sessionId = "sess-ghost-record";
    await world.sessions.put({
      sessionId,
      principalId: "ghost",
      kind: "user",
      createdAt: FIXED_NOW,
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    const token = mintSessionToken(SECRET, sessionId, Date.parse("2027-01-01T00:00:00.000Z"));
    const outcome = await world.layer.handle(
      get("/v1/auth/whoami", { authorization: `Bearer ${token}` }),
      "req-43",
    );
    expect(outcome.kind === "response" && outcome.response.status).toBe(401);
    if (outcome.kind === "response") {
      expect(await bodyOf(outcome.response)).toContain("unknown_principal");
    }
  });

  test("session ids are deterministic (same secret+clock+counter) and distinct per mint", async () => {
    const first = await authWorld();
    const second = await authWorld();
    const cookieA = await sessionCookie(first, "alice");
    const cookieB = await sessionCookie(second, "alice");
    expect(tokenOf(cookieA)).toBe(tokenOf(cookieB)); // same inputs → same id
    const cookieC = await sessionCookie(first, "alice"); // counter advances
    expect(tokenOf(cookieC)).not.toBe(tokenOf(cookieA));
  });
});

describe("body-verbatim forwarding (the core sees the same bytes)", () => {
  test("a passing JSON mutation is forwarded with its body VERBATIM and headers preserved", async () => {
    const world = await authWorld();
    const cookie = await sessionCookie(world, "demo");
    const bodyText = JSON.stringify({ projectId: DEMO_PROJECT, title: "verbatim", extra: { deep: [1, 2, 3] } });
    const outcome = await world.layer.handle(
      new Request("https://api.aise.example/v1/cases", {
        method: "POST",
        headers: { "content-type": "application/json", "x-custom": "kept", ...withCookie(cookie) },
        body: bodyText,
      }),
      "req-44",
    );
    expect(outcome.kind).toBe("pass");
    if (outcome.kind === "pass") {
      expect(await outcome.request.text()).toBe(bodyText);
      expect(outcome.request.method).toBe("POST");
      expect(outcome.request.headers.get("x-custom")).toBe("kept");
    }
  });

  test("a path-scoped GET is forwarded as the SAME request object (no rebuild)", async () => {
    const world = await authWorld();
    const request = get(`/v1/reality/projects/${DEMO_PROJECT}/layers`);
    const outcome = await world.layer.handle(request, "req-45");
    expect(outcome).toEqual({ kind: "pass", request });
  });
});

describe("the secret-leak scan (tokens and AUTH_SECRET never leak)", () => {
  test("no response body and no log line ever carries AUTH_SECRET or a session token", async () => {
    const world = await authWorld();
    const bodies: string[] = [];
    const headers: string[] = [];
    const cookie = await sessionCookie(world, "alice");
    const token = tokenOf(cookie);
    const battery: Request[] = [
      get(`/v1/reality/projects/${DEMO_PROJECT}/layers`),
      get(`/v1/reality/projects/${FOREIGN_PROJECT}/layers`),
      post("/v1/cases", { projectId: FOREIGN_PROJECT }),
      get("/v1/auth/whoami", withCookie(cookie)),
      post("/v1/auth/sessions", { principalId: "ghost" }),
      post("/v1/auth/demo", {}),
      deleteRequest("/v1/auth/sessions/current", withCookie(cookie)),
      get("/v1/auth/whoami", { authorization: "Bearer v1.junk.junk.junk" }),
      get(`/v1/identity/organizations/${"x".repeat(257)}/projects`),
      get("/v1/auth/nope"),
    ];
    for (const [index, request] of battery.entries()) {
      const outcome = await world.layer.handle(request, `req-leak-${index}`);
      if (outcome.kind === "response") {
        bodies.push(await bodyOf(outcome.response));
        headers.push(outcome.response.headers.get("set-cookie") ?? "");
      }
    }
    for (const body of bodies) {
      expect(body).not.toContain(SECRET);
      expect(body).not.toContain(token);
      expect(body).not.toContain("aise_session=");
    }
    // The token appears ONLY inside the set-cookie header values.
    for (const header of headers) {
      if (header.includes(token)) {
        expect(header.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);
      }
    }
    for (const line of world.logLines) {
      expect(line).not.toContain(SECRET);
      expect(line).not.toContain(token);
    }
  });
});

describe("scope extraction (the predicate's typed inputs)", () => {
  test("extractPathScope: the two documented route shapes; everything else is unscoped", () => {
    expect(extractPathScope("/v1/reality/projects/p1/layers")).toEqual({
      kind: "project",
      projectId: "p1",
    });
    expect(extractPathScope("/v1/identity/organizations/o1/audit")).toEqual({
      kind: "organization",
      organizationId: "o1",
    });
    expect(extractPathScope("/v1/reality/projects/p1")).toEqual({ kind: "project", projectId: "p1" });
    expect(extractPathScope("/v1/cases")).toBeNull();
    expect(extractPathScope("/v1/reality/projects")).toBeNull();
    expect(extractPathScope("/healthz")).toBeNull();
    expect(extractPathScope("/v1/auth/whoami")).toBeNull();
  });

  test("extractPathScope: percent-encoded ids decode; broken encoding is malformed (empty id)", () => {
    expect(extractPathScope("/v1/reality/projects/proj%20with%20space/layers")).toEqual({
      kind: "project",
      projectId: "proj with space",
    });
    expect(extractPathScope("/v1/reality/projects/broken%zz/layers")).toEqual({
      kind: "project",
      projectId: "",
    });
  });

  test("extractBodyScope: top-level projectId/organizationId only (projectId wins)", () => {
    expect(extractBodyScope({ projectId: "p1" })).toEqual({ kind: "project", projectId: "p1" });
    expect(extractBodyScope({ organizationId: "o1" })).toEqual({
      kind: "organization",
      organizationId: "o1",
    });
    expect(extractBodyScope({ projectId: "p1", organizationId: "o1" })).toEqual({
      kind: "project",
      projectId: "p1",
    });
    expect(extractBodyScope({ project: { projectId: "nested" } })).toBeNull();
    expect(extractBodyScope({ projectId: 42 })).toBeNull();
    expect(extractBodyScope("string")).toBeNull();
    expect(extractBodyScope(null)).toBeNull();
    expect(extractBodyScope([1, 2])).toBeNull();
    expect(extractBodyScope({})).toBeNull();
  });

  test("readSessionCookie / readSessionToken: cookie parsing and precedence", () => {
    expect(readSessionCookie(null)).toBeNull();
    expect(readSessionCookie("other=x; aise_session=tok; more=y")).toBe("tok");
    expect(readSessionCookie("aise_session=")).toBe("");
    expect(readSessionCookie("noise")).toBeNull();
    const withCookie = new Request("https://x.example/", {
      headers: { cookie: "aise_session=abc" },
    });
    expect(readSessionToken(withCookie)).toBe("abc");
    const withBearer = new Request("https://x.example/", {
      headers: { authorization: "Bearer def" },
    });
    expect(readSessionToken(withBearer)).toBe("def");
    expect(readSessionToken(new Request("https://x.example/"))).toBeNull();
  });

  test("decideUnscopedAccess: the authentication-only rule for unscoped routes", () => {
    const principal = {
      principalId: "p",
      displayName: "P",
      kind: "user" as const,
      organizationIds: [],
      roleLabel: "Member",
    };
    expect(decideUnscopedAccess(principal, "POST", "required")).toEqual({ allowed: true });
    expect(decideUnscopedAccess(null, "GET", "demo-open")).toEqual({ allowed: true });
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const decision = decideUnscopedAccess(null, method, "demo-open");
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.status).toBe(401);
      }
    }
    const readRequired = decideUnscopedAccess(null, "GET", "required");
    expect(readRequired.allowed).toBe(false);
    if (!readRequired.allowed) {
      expect(readRequired.status).toBe(401);
    }
  });
});

describe("the degraded layer (enabled but unbuildable)", () => {
  test("every /v1 request fails 503 with the issues; /healthz and /readyz pass honestly", async () => {
    const layer = createDegradedAuthLayer({
      code: "auth_not_configured",
      issues: ["AUTH_SECRET: required when AISE_AUTH=1 — set it to a long random string (see docs/INSTALL.md §Auth)"],
    });
    const refused = await layer.handle(get("/v1/cases"), "req-46");
    expect(refused.kind).toBe("response");
    if (refused.kind === "response") {
      expect(refused.response.status).toBe(503);
      const body = await bodyOf(refused.response);
      expect(body).toContain("auth_not_configured");
      expect(body).toContain("AUTH_SECRET");
    }
    for (const path of ["/healthz", "/readyz"]) {
      const request = get(path);
      expect(await layer.handle(request, "req-47")).toEqual({ kind: "pass", request });
    }
    expect(await layer.sweep()).toEqual({ considered: 0, removedSessionIds: [] });
    await expect(layer.ensureDemo()).rejects.toThrow("auth layer unavailable");
  });
});

describe("the boot sweep (deterministic expiry cleanup)", () => {
  test("sweep() removes exactly the expired sessions through the layer's own clock", async () => {
    const world = await authWorld({ ttlSeconds: 60 });
    await sessionCookie(world, "alice");
    world.clockSet("2027-01-01T00:00:00.000Z");
    const report = await world.layer.sweep();
    expect(report.considered).toBe(1);
    expect(report.removedSessionIds.length).toBe(1);
    const again = await world.layer.sweep();
    expect(again).toEqual({ considered: 0, removedSessionIds: [] });
  });
});
