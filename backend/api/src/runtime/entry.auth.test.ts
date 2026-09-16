/**
 * PROD-004 — the runtime entry's AUTH integration tests (entry.ts × auth/**).
 *
 * These prove the SEAM-LEVEL contract of the additive auth wiring, through
 * the FULL production pipeline (CORS → auth layer → routing core → /readyz
 * augmentation → error envelope):
 *
 *   - DISABLED (AISE_AUTH unset or 0) the pipeline is byte-identical to the
 *     pre-auth contract: /readyz carries no auth key, /v1/auth/** is the
 *     core's honest 404, and every battery response is identical between
 *     "unset" and "explicitly 0";
 *   - ENABLED (AISE_AUTH=1 + AUTH_SECRET) the layer comes alive at the
 *     seam: /readyz reports {status:"enabled",mode}, anonymous /v1 reads
 *     follow AISE_AUTH_MODE (demo-open serves the demo tenant's content,
 *     writes are always 401), the demo cookie round-trips through the
 *     pipeline, cross-tenant sessions are refused 403, logout kills the
 *     server-side session;
 *   - ENABLED BUT UNBUILDABLE (AISE_AUTH=1 without AUTH_SECRET) the boot
 *     honesty holds: /healthz stays 200, /readyz flips to the documented
 *     503 envelope with the issues, every /v1 request fails 503 with
 *     auth_not_configured, and failFast refuses to boot at all;
 *   - the secret-leak discipline holds at the seam: AUTH_SECRET and the
 *     session token appear in no response body and no log line.
 *
 * Determinism: fixed env records, fixed request ids, scratch data dirs
 * (mkdtemp, always removed). The pipeline's internal clock is the real one
 * (the production discipline), but no assertion depends on it — sessions
 * use the 7-day default TTL.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { createLogger, type Logger } from "../lib/log";
import type { EnvRecord, EnvSource } from "../lib/config";
import { createRuntimeHandler, RuntimeBootError } from "./entry";

const scratchDirs: string[] = [];

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "aise-runtime-auth-test-"));
  scratchDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const AUTH_SECRET = "runtime-auth-test-secret-DO-NOT-LEAK";
const DEMO_ORG = "org-northwind";
const DEMO_PRINCIPAL = "demo-evaluator";

function baseEnv(overrides: EnvRecord = {}): EnvRecord {
  return {
    HOST: "127.0.0.1",
    PORT: "8080",
    LOG_LEVEL: "debug",
    AISE_DATA_DIR: scratchDir(),
    ...overrides,
  };
}

interface RuntimeWorld {
  readonly handler: (request: Request) => Promise<Response>;
  readonly logLines: readonly string[];
}

/** A runtime handler over a FRESH scratch data dir, capturing every log line. */
function runtimeWorld(env: EnvRecord): RuntimeWorld {
  const lines: string[] = [];
  const logger: Logger = createLogger("debug", (line) => {
    lines.push(line);
  });
  const envSource: EnvSource = () => env;
  return { handler: createRuntimeHandler({ envSource, logger }), logLines: lines };
}

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://api.aise.example${path}`, {
    method: "GET",
    headers: { "x-request-id": path.replace(/[^a-z0-9]/gi, "-").slice(0, 30), ...headers },
  });
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://api.aise.example${path}`, {
    method: "POST",
    headers: {
      "x-request-id": path.replace(/[^a-z0-9]/gi, "-").slice(0, 30),
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function del(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://api.aise.example${path}`, {
    method: "DELETE",
    headers: { "x-request-id": path.replace(/[^a-z0-9]/gi, "-").slice(0, 30), ...headers },
  });
}

/** The set-cookie value of a response (null when absent). */
function cookieOf(response: Response): string | null {
  return response.headers.get("set-cookie");
}

/**
 * Synchronize the boot-time demo bootstrap: POST /v1/auth/demo awaits the
 * SAME memoized promise the boot kicked off, so a 200 here proves the demo
 * tenant has landed in the identity registry.
 */
async function awaitDemoBootstrap(
  handler: (request: Request) => Promise<Response>,
): Promise<string> {
  const response = await handler(post("/v1/auth/demo", {}));
  expect(response.status).toBe(200);
  const cookie = cookieOf(response);
  expect(cookie).not.toBeNull();
  return cookie ?? "";
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Disabled: the additive pass-through                                  */
/* ------------------------------------------------------------------ */

describe("auth DISABLED — the pipeline is byte-identical to the pre-auth contract", () => {
  test("AISE_AUTH unset: /v1/auth/** is the core's honest 404 (no auth surface exists)", async () => {
    const { handler } = runtimeWorld(baseEnv());
    const response = await handler(get("/v1/auth/whoami"));
    expect(response.status).toBe(404);
    const body = await bodyOf(response);
    expect(body).toEqual({
      error: { code: "not_found", message: "Not found.", requestId: expect.any(String) },
    });
  });

  test("AISE_AUTH=0 behaves identically to unset across the route battery", async () => {
    const unset = runtimeWorld(baseEnv());
    const zero = runtimeWorld(baseEnv({ AISE_AUTH: "0" }));
    // ROUTE-CHOICE DISCIPLINE: the battery sticks to routes that never
    // trigger the core's MODULE-LEVEL lazy default wiring (the per-namespace
    // memoized store singletons in server.ts — cases/adoption/identity/
    // reality/…). Hitting those here would pin the singleton to THIS test's
    // scratch data dir and silently break OTHER files' lazy-wiring tests,
    // depending on the runner's file order. /healthz, /readyz, the core's
    // 404 for /v1/auth/** and the capture routes (whose gateway the runtime
    // factory ALWAYS injects eagerly) are all order-independent.
    const battery: readonly Request[] = [
      get("/healthz"),
      get("/readyz"),
      get("/v1/auth/whoami"),
      get("/v1/capture/sessions/never-synced"),
      post("/v1/capture/sync", "{definitely-not-json"),
    ];
    for (const request of battery) {
      const a = await unset.handler(new Request(request.url, request));
      const b = await zero.handler(new Request(request.url, request));
      expect(b.status).toBe(a.status);
      expect(await b.text()).toBe(await a.text());
    }
  });

  test("/readyz keeps the pre-auth auth-silence: no auth key (artifacts is PROD-006's orthogonal key)", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "0" }));
    const response = await handler(get("/readyz"));
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(body).toEqual({
      ok: true,
      providers: { worldsculpt: "disabled" },
      // PROD-006 (merged after PROD-004): the artifact backend status is
      // always reported — orthogonal to the auth layer. The auth contract
      // this test pins is the ABSENCE of the `auth` key when disabled.
      artifacts: { backend: "local-fs", status: "available" },
    });
  });

  test("anonymous /v1 writes are NOT gated when the layer is off (the core answers)", async () => {
    const { handler } = runtimeWorld(baseEnv());
    // A WRITE through an ungated namespace whose gateway the factory
    // injected (never a lazily-memoized domain store — see the battery's
    // route-choice discipline above): the capture router's own 400 proves
    // the mutation reached the CORE, not an auth refusal.
    const response = await handler(post("/v1/capture/sync", "{definitely-not-json"));
    expect(response.status).toBe(400);
    const body = await bodyOf(response);
    // The runtime's error-envelope translation wraps the capture router's
    // typed refusal: {error:{code:"malformed_json",…}} — the CORE answered.
    expect((body["error"] as Record<string, unknown>)["code"]).toBe("malformed_json");
  });
});

/* ------------------------------------------------------------------ */
/* Enabled: the seam contract through the full pipeline                 */
/* ------------------------------------------------------------------ */

describe("auth ENABLED — the layer comes alive at the runtime seam", () => {
  test("/readyz reports the auth layer with its mode; /healthz is unchanged liveness", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1", AUTH_SECRET }));
    const ready = await handler(get("/readyz"));
    expect(ready.status).toBe(200);
    const body = await bodyOf(ready);
    expect(body["auth"]).toEqual({ status: "enabled", mode: "demo-open" });
    const health = await handler(get("/healthz"));
    expect(await bodyOf(health)).toEqual({
      ok: true,
      service: "aise-api",
      version: pkg.version,
    });
  });

  test("anonymous /v1/auth/whoami is a 401 envelope through the pipeline", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1", AUTH_SECRET }));
    const response = await handler(get("/v1/auth/whoami"));
    expect(response.status).toBe(401);
    const body = await bodyOf(response);
    expect((body["error"] as Record<string, unknown>)["code"]).toBe("authentication_required");
  });

  test("POST /v1/auth/demo mints the demo session: cookie flags + display-only payload", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1", AUTH_SECRET }));
    const response = await handler(post("/v1/auth/demo", {}));
    expect(response.status).toBe(200);
    const cookie = cookieOf(response) ?? "";
    expect(cookie).toContain("aise_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    const body = await bodyOf(response);
    expect(body["principal"]).toEqual({
      displayName: "Demo Evaluator",
      roleLabel: "Founder",
      kind: "demo",
    });
  });

  test("the demo cookie authenticates whoami through the pipeline", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1", AUTH_SECRET }));
    const cookie = await awaitDemoBootstrap(handler);
    const response = await handler(get("/v1/auth/whoami", { cookie }));
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(body["principal"]).toEqual({
      displayName: "Demo Evaluator",
      roleLabel: "Founder",
      kind: "demo",
    });
  });

  test("anonymous demo-open READ of the demo tenant reaches the core and answers the demo content", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1", AUTH_SECRET }));
    await awaitDemoBootstrap(handler); // deterministic sync point
    const response = await handler(
      get(`/v1/identity/organizations/${DEMO_ORG}/projects?requester=${DEMO_PRINCIPAL}`),
    );
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    const projects = (body["projects"] as Array<Record<string, unknown>>).map(
      (project) => project["projectId"],
    );
    expect(projects.sort()).toEqual(["proj-riverside-refit", "project-zurich-hq"]);
  });

  test("anonymous demo-open read of a NON-demo tenant is 401 (evaluators see demo content only)", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1", AUTH_SECRET }));
    await awaitDemoBootstrap(handler);
    const response = await handler(
      get("/v1/identity/organizations/org-somebody-else/projects?requester=whoever"),
    );
    expect(response.status).toBe(401);
  });

  test("AISE_AUTH_MODE=required: the anonymous demo-tenant read becomes 401", async () => {
    const { handler } = runtimeWorld(
      baseEnv({ AISE_AUTH: "1", AUTH_SECRET, AISE_AUTH_MODE: "required" }),
    );
    await awaitDemoBootstrap(handler);
    const response = await handler(
      get(`/v1/identity/organizations/${DEMO_ORG}/projects?requester=${DEMO_PRINCIPAL}`),
    );
    expect(response.status).toBe(401);
  });

  test("anonymous writes are 401 regardless of the target (writes always need a session)", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1", AUTH_SECRET }));
    await awaitDemoBootstrap(handler);
    const response = await handler(
      post("/v1/cases", { projectId: "proj-riverside-refit", title: "anonymous write" }),
    );
    expect(response.status).toBe(401);
    const body = await bodyOf(response);
    expect((body["error"] as Record<string, unknown>)["code"]).toBe("authentication_required");
  });

  test("the demo session may write INSIDE its own tenant (passes the seam; the core accepts)", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1", AUTH_SECRET }));
    const cookie = await awaitDemoBootstrap(handler);
    // An org-scoped WRITE in the demo tenant, through a namespace whose
    // service the runtime factory SHARED with the core (the injected
    // identity routes — never a lazily-memoized domain singleton, see the
    // disabled battery's route-choice discipline): a 200 from the identity
    // core proves the sessioned tenant-scoped mutation crossed the seam.
    const response = await handler(
      post(
        `/v1/identity/organizations/${DEMO_ORG}/roles`,
        {
          roleId: "role-entry-proof",
          name: "Entry proof role",
          permissions: ["reality:read"],
          actor: DEMO_PRINCIPAL,
        },
        { cookie },
      ),
    );
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(body["ok"]).toBe(true);
    expect((body["role"] as Record<string, unknown>)["roleId"]).toBe("role-entry-proof");
    // The same write in a FOREIGN organization never reaches the core (an
    // unregistered org id is fail-closed for EVERY sessioned caller; the
    // registered-foreign-org cross_tenant refusal is proven by the runtime
    // cross-tenant test below, the middleware matrix and the live proof):
    const foreign = await handler(
      post(
        "/v1/identity/organizations/org-elsewhere/roles",
        {
          roleId: "role-entry-proof",
          name: "Entry proof role",
          permissions: ["reality:read"],
          actor: DEMO_PRINCIPAL,
        },
        { cookie },
      ),
    );
    expect(foreign.status).toBe(403);
    expect(((await bodyOf(foreign))["error"] as Record<string, unknown>)["code"]).toBe(
      "unregistered_organization",
    );
  });

  test("registry CREATION acts: project creation is the carve-out route (200 + verbatim project); org creation stays fail-closed", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1", AUTH_SECRET }));
    const cookie = await awaitDemoBootstrap(handler);
    // PROD-010 (pre-approved update — was the OLD defect's 403): creating a
    // project inside the demo tenant is the auth-seam carve-out route — the
    // create payload's projectId names the NEW project being registered, not
    // an addressed tenant — so the act now passes end-to-end through the
    // REAL runtime pipeline and the core registers the project verbatim.
    const project = await handler(
      post(
        `/v1/identity/organizations/${DEMO_ORG}/projects`,
        { projectId: "proj-entry-proof", name: "Entry proof", actor: DEMO_PRINCIPAL },
        { cookie },
      ),
    );
    expect(project.status).toBe(200);
    const projectBody = await bodyOf(project);
    expect(projectBody["ok"]).toBe(true);
    expect(projectBody["project"]).toMatchObject({
      organizationId: DEMO_ORG,
      projectId: "proj-entry-proof",
      name: "Entry proof",
    });
    // The registered project is immediately readable through the same seam.
    const listed = await handler(
      get(`/v1/identity/organizations/${DEMO_ORG}/projects?requester=${DEMO_PRINCIPAL}`, {
        cookie,
      }),
    );
    expect(listed.status).toBe(200);
    const listedIds = ((await bodyOf(listed))["projects"] as Array<Record<string, unknown>>).map(
      (entry) => entry["projectId"],
    );
    expect(listedIds).toContain("proj-entry-proof");
    // Creating an organization (its body names the not-yet-registered org id)
    // is UNCHANGED: still fail-closed 403 unregistered_organization.
    const organization = await handler(
      post(
        "/v1/identity/organizations",
        {
          organizationId: "org-entry-proof",
          name: "Entry proof org",
          founder: { principalId: DEMO_PRINCIPAL },
        },
        { cookie },
      ),
    );
    expect(organization.status).toBe(403);
    expect(((await bodyOf(organization))["error"] as Record<string, unknown>)["code"]).toBe(
      "unregistered_organization",
    );
  });

  test("cross-tenant: a registered principal outside the demo tenant is refused 403", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1", AUTH_SECRET }));
    const demoCookie = await awaitDemoBootstrap(handler);
    // Register another principal through the seam (an unscoped write — any
    // session may perform it; the demo session does).
    const registered = await handler(
      post(
        "/v1/identity/principals",
        { principalId: "user-entry-alice", displayName: "Alice (entry test)" },
        { cookie: demoCookie },
      ),
    );
    expect(registered.status).toBe(200);
    // Sign in as that principal.
    const signIn = await handler(post("/v1/auth/sessions", { principalId: "user-entry-alice" }));
    expect(signIn.status).toBe(200);
    const aliceCookie = cookieOf(signIn) ?? "";
    expect(aliceCookie).toContain("aise_session=");
    // The demo tenant is ANOTHER tenant for Alice: 403 cross_tenant.
    const cross = await handler(
      get(`/v1/identity/organizations/${DEMO_ORG}/projects?requester=user-entry-alice`, {
        cookie: aliceCookie,
      }),
    );
    expect(cross.status).toBe(403);
    const body = await bodyOf(cross);
    expect((body["error"] as Record<string, unknown>)["code"]).toBe("cross_tenant");
  });

  test("a malformed tenant id in the path is 400 invalid_project_id through the pipeline", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1", AUTH_SECRET }));
    await awaitDemoBootstrap(handler);
    const response = await handler(get(`/v1/reality/projects/${"x".repeat(257)}/layers`));
    expect(response.status).toBe(400);
    const body = await bodyOf(response);
    expect((body["error"] as Record<string, unknown>)["code"]).toBe("invalid_project_id");
  });

  test("logout deletes the server-side session through the pipeline; the cookie is dead after", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1", AUTH_SECRET }));
    const cookie = await awaitDemoBootstrap(handler);
    const logout = await handler(del("/v1/auth/sessions/current", { cookie }));
    expect(logout.status).toBe(200);
    expect(cookieOf(logout) ?? "").toContain("Max-Age=0");
    const after = await handler(get("/v1/auth/whoami", { cookie }));
    expect(after.status).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/* Enabled but unbuildable: fail-closed boot honesty                    */
/* ------------------------------------------------------------------ */

describe("auth ENABLED but unbuildable (missing AUTH_SECRET)", () => {
  test("every /v1 request fails 503 auth_not_configured with the issue; /healthz stays honest", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1" }));
    for (const request of [get("/v1/auth/whoami"), get("/v1/cases"), post("/v1/cases", {})]) {
      const response = await handler(new Request(request.url, request));
      expect(response.status).toBe(503);
      const body = await bodyOf(response);
      expect((body["error"] as Record<string, unknown>)["code"]).toBe("auth_not_configured");
      expect(JSON.stringify(body)).toContain("AUTH_SECRET: required when AISE_AUTH=1");
    }
    const health = await handler(get("/healthz"));
    expect(health.status).toBe(200);
    expect(await bodyOf(health)).toEqual({
      ok: true,
      service: "aise-api",
      version: pkg.version,
    });
  });

  test("/readyz flips to the documented 503 not_ready envelope with the auth issues merged", async () => {
    const { handler } = runtimeWorld(baseEnv({ AISE_AUTH: "1" }));
    const response = await handler(get("/readyz"));
    expect(response.status).toBe(503);
    const body = await bodyOf(response);
    expect((body["error"] as Record<string, unknown>)["code"]).toBe("not_ready");
    const issues = body["issues"] as string[];
    expect(issues.some((issue) => issue.startsWith("AUTH_SECRET:"))).toBe(true);
    expect(body["auth"]).toEqual({
      status: "unavailable",
      issues: [expect.stringContaining("AUTH_SECRET:")],
    });
  });

  test("failFast refuses to boot (RuntimeBootError carrying the AUTH_SECRET issue)", () => {
    const env = baseEnv({ AISE_AUTH: "1" });
    expect(() => createRuntimeHandler({ envSource: () => env, failFast: true })).toThrow(
      RuntimeBootError,
    );
    try {
      createRuntimeHandler({ envSource: () => env, failFast: true });
    } catch (error) {
      if (error instanceof RuntimeBootError) {
        expect(error.issues.some((issue) => issue.startsWith("AUTH_SECRET:"))).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* The seam-level secret-leak scan                                     */
/* ------------------------------------------------------------------ */

describe("the runtime secret-leak scan (auth enabled)", () => {
  test("no response body and no log line carries AUTH_SECRET or the session token", async () => {
    const { handler, logLines } = runtimeWorld(baseEnv({ AISE_AUTH: "1", AUTH_SECRET }));
    const bodies: string[] = [];
    const headers: string[] = [];
    const demo = await handler(post("/v1/auth/demo", {}));
    bodies.push(await demo.text());
    headers.push(demo.headers.get("set-cookie") ?? "");
    const cookie = demo.headers.get("set-cookie") ?? "";
    const token = cookie.match(/aise_session=([^;]+)/)?.[1] ?? "";
    expect(token.length).toBeGreaterThan(0);
    const battery: readonly Request[] = [
      get("/v1/auth/whoami"),
      get("/v1/auth/whoami", { cookie }),
      get("/v1/auth/whoami", { authorization: "Bearer v1.junk.junk.junk" }),
      get(`/v1/identity/organizations/${DEMO_ORG}/projects?requester=${DEMO_PRINCIPAL}`),
      get("/v1/identity/organizations/org-elsewhere/projects?requester=x"),
      post("/v1/cases", { projectId: "proj-riverside-refit" }),
      post("/v1/auth/sessions", { principalId: "ghost" }),
      del("/v1/auth/sessions/current", { cookie }),
      get("/readyz"),
      get("/healthz"),
    ];
    for (const request of battery) {
      const response = await handler(new Request(request.url, request));
      bodies.push(await response.text());
      headers.push(response.headers.get("set-cookie") ?? "");
    }
    for (const body of bodies) {
      expect(body).not.toContain(AUTH_SECRET);
      expect(body).not.toContain(token);
    }
    // The token appears ONLY inside set-cookie header values.
    for (const header of headers) {
      if (header.includes(token)) {
        expect(header.startsWith("aise_session=")).toBe(true);
      }
    }
    for (const line of logLines) {
      expect(line).not.toContain(AUTH_SECRET);
      expect(line).not.toContain(token);
    }
  });
});
