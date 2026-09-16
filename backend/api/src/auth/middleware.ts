/**
 * PROD-004 — the auth/tenant-safety middleware at the runtime seam.
 *
 * PIPELINE POSITION (runtime/entry.ts): CORS preflight → THIS LAYER → the
 * routing core (server.ts, never touched) → /readyz augmentation → the
 * stable error envelope → CORS decoration. The layer is constructed ONLY
 * when `AISE_AUTH=1` (additive integration; disabled ⇒ byte-identical
 * behavior).
 *
 * WHAT IT OWNS:
 *
 *  - THE AUTH ENDPOINTS under `/v1/auth/**` (intercepted BEFORE the core —
 *    the core has no auth routes and would 404 them):
 *      POST   /v1/auth/sessions          sign in as a REGISTERED principal
 *                                        (passwordless local mode: the
 *                                        identity model carries no
 *                                        credentials and the auth layer
 *                                        refuses to invent a second
 *                                        authority — see docs/INSTALL.md
 *                                        §Auth)
 *      POST   /v1/auth/demo              "Enter demo": mint the controlled
 *                                        demo session (demo.ts containment)
 *      GET    /v1/auth/whoami            display-only principal info
 *      DELETE /v1/auth/sessions/current  logout (deletes the server-side
 *                                        session, clears the cookie)
 *  - THE ENFORCEMENT of every other `/v1/**` request: session resolution
 *    (opaque HMAC token via httpOnly/sameSite=strict cookie or
 *    `Authorization: Bearer`) + the typed tenant predicate over the
 *    request's tenant scope (the path parameters of the documented route
 *    shapes + the top-level projectId/organizationId of JSON mutation
 *    bodies). Refusals use the runtime's stable error envelope.
 *
 * WHAT IT NEVER DOES: identity policy (the frozen identity library owns
 * that — this layer only authenticates and scopes), client-visible
 * principal data beyond display name + role label + demo flag, token
 * payloads beyond id + expiry, and any logging of secrets or tokens (the
 * secret-leak discipline is matrix-tested).
 *
 * Determinism: the clock is injected; session ids are content-derived
 * (sha-256 over secret+principal+timestamp+counter — no Math.random); the
 * same inputs produce byte-identical sessions, cookies and decisions.
 */

import { IdentityService } from "../identity";
import { sha256Hex } from "../lib/hash";
import { jsonResponse } from "../lib/http";
import type { Logger } from "../lib/log";
import { errorResponse } from "../runtime/errors";
import type { AuthConfig } from "./config";
import {
  DEMO_ORGANIZATION_ID,
  memoizedDemoBootstrap,
  type DemoBootstrapReport,
} from "./demo";
import type {
  ResolvedPrincipal,
  SessionRecord,
  TenantDecision,
  TenantScope,
} from "./model";
import { SESSION_COOKIE_NAME } from "./model";
import { decideTenantAccess, resolvePrincipal, type PrincipalDirectory } from "./principal";
import {
  sweepExpiredSessions,
  type SessionStore,
  type SessionSweepReport,
} from "./store";
import { mintSessionToken, verifySessionToken } from "./token";

/* ------------------------------------------------------------------ */
/* Public surface                                                       */
/* ------------------------------------------------------------------ */

/** What the layer decided for one request. */
export type AuthOutcome =
  /** Serve this response (envelope, auth endpoint answer, Set-Cookie…). */
  | { readonly kind: "response"; readonly response: Response }
  /** Pass this (possibly rebuilt) request to the routing core. */
  | { readonly kind: "pass"; readonly request: Request };

export interface AuthLayerDeps {
  readonly config: AuthConfig;
  readonly store: SessionStore;
  /** The identity library's registry (a structural subset of its store). */
  readonly directory: PrincipalDirectory;
  /** The identity policy engine (the demo bootstrap acts run through it). */
  readonly identity: IdentityService;
  /** Sole source of every timestamp (determinism pin). */
  readonly clock: () => string;
  readonly logger: Logger;
}

export interface AuthLayer {
  handle(request: Request, requestId: string): Promise<AuthOutcome>;
  /** The deterministic expiry sweep (boot + on-access are the policies). */
  sweep(): Promise<SessionSweepReport>;
  /** The memoized demo-tenant bootstrap (awaited by the demo entry + tests). */
  ensureDemo(): Promise<DemoBootstrapReport>;
}

/* ------------------------------------------------------------------ */
/* Cookie + token transport                                             */
/* ------------------------------------------------------------------ */

/** The session cookie attributes (httpOnly + sameSite=strict, always). */
function sessionCookie(token: string, ttlSeconds: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${String(ttlSeconds)}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** The logout cookie (expires immediately). */
function clearedSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${
    secure ? "; Secure" : ""
  }`;
}

/** Parse the `cookie` header for the session cookie (null when absent). */
export function readSessionCookie(cookieHeader: string | null): string | null {
  if (cookieHeader === null) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const equals = trimmed.indexOf("=");
    if (equals <= 0) {
      continue;
    }
    if (trimmed.slice(0, equals) === SESSION_COOKIE_NAME) {
      return trimmed.slice(equals + 1);
    }
  }
  return null;
}

/** The presented token: the session cookie, or the Authorization bearer. */
export function readSessionToken(request: Request): string | null {
  const cookie = readSessionCookie(request.headers.get("cookie"));
  if (cookie !== null && cookie.length > 0) {
    return cookie;
  }
  const authorization = request.headers.get("authorization");
  if (authorization !== null && authorization.toLowerCase().startsWith("bearer ")) {
    const bearer = authorization.slice(7).trim();
    if (bearer.length > 0) {
      return bearer;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Tenant-scope extraction (the typed predicate's inputs)              */
/* ------------------------------------------------------------------ */

function decodeSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/**
 * The documented path shapes that address a tenant parameter:
 * `/v1/reality/projects/:projectId/**` and
 * `/v1/identity/organizations/:organizationId/**` (the route tables of the
 * frozen reality + identity routers, consumed — never re-modeled). Every
 * other path addresses no tenant scope and gets authentication-only
 * enforcement. A path segment that is not valid percent-encoding is
 * malformed (the core would reject it too — the seam refuses it first,
 * with the empty id that fails the shape check).
 */
export function extractPathScope(pathname: string): TenantScope | null {
  const segments = pathname.split("/").filter((segment) => segment !== "");
  if (segments[0] !== "v1") {
    return null;
  }
  if (segments.length >= 4 && segments[1] === "reality" && segments[2] === "projects") {
    const decoded = decodeSegment(segments[3] ?? "");
    return decoded === null
      ? { kind: "project", projectId: "" }
      : { kind: "project", projectId: decoded };
  }
  if (segments.length >= 4 && segments[1] === "identity" && segments[2] === "organizations") {
    const decoded = decodeSegment(segments[3] ?? "");
    return decoded === null
      ? { kind: "organization", organizationId: "" }
      : { kind: "organization", organizationId: decoded };
  }
  return null;
}

/** The write verbs (every method a mutation can arrive on). */
function isWriteVerb(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

/**
 * PROD-010 (auth-seam carve-out): does this request address EXACTLY the
 * identity router's create-project act — POST /v1/identity/organizations/
 * :orgId/projects (router-consistent segmentation; a trailing slash is the
 * same route)? When true, the enforcement loop below skips ONLY the BODY
 * scope: the create payload's top-level `projectId` names the NEW project
 * being registered, not an addressed tenant (the path's organization is the
 * tenant, and it stays fully checked; anonymous 401 and the cross-tenant
 * path-A-body-B property on every OTHER route stay enforced). Pure
 * predicate — no parsing, no I/O; exported for the route-shape matrix.
 */
export function isIdentityCreateProjectAct(method: string, path: string): boolean {
  if (method.toUpperCase() !== "POST") {
    return false;
  }
  const segments = path.split("/").filter((segment) => segment !== "");
  return (
    segments.length === 5 &&
    segments[0] === "v1" &&
    segments[1] === "identity" &&
    segments[2] === "organizations" &&
    segments[4] === "projects"
  );
}

/**
 * The top-level `projectId`/`organizationId` of a JSON mutation body — the
 * generic, domain-agnostic scope signal (cases, interventions, missions,
 * comparisons… carry their project in the body). Only TOP-LEVEL string
 * fields are considered; nested domain shapes stay the domain modules'
 * own contract.
 */
export function extractBodyScope(payload: unknown): TenantScope | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record["projectId"] === "string") {
    return { kind: "project", projectId: record["projectId"] };
  }
  if (typeof record["organizationId"] === "string") {
    return { kind: "organization", organizationId: record["organizationId"] };
  }
  return null;
}

/** Authentication-only rule for requests that address no tenant scope. */
export function decideUnscopedAccess(
  principal: ResolvedPrincipal | null,
  method: string,
  mode: AuthConfig["mode"],
): TenantDecision {
  if (principal !== null) {
    return { allowed: true };
  }
  if (isWriteVerb(method)) {
    return {
      allowed: false,
      code: "authentication_required",
      status: 401,
      detail:
        "authentication required: writes need a session (POST /v1/auth/sessions or POST /v1/auth/demo)",
    };
  }
  if (mode === "required") {
    return {
      allowed: false,
      code: "authentication_required",
      status: 401,
      detail: "authentication required: start a session (POST /v1/auth/sessions or POST /v1/auth/demo)",
    };
  }
  return { allowed: true };
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readTextBody(request: Request): Promise<string> {
  try {
    return await request.text();
  } catch {
    return "";
  }
}

function parseJson(text: string): { ok: true; payload: unknown } | { ok: false } {
  try {
    return { ok: true, payload: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/* ------------------------------------------------------------------ */
/* The enabled layer                                                    */
/* ------------------------------------------------------------------ */

export function createAuthLayer(deps: AuthLayerDeps): AuthLayer {
  const { config, store, directory, identity, logger } = deps;
  const ensureDemoTenantOnce = memoizedDemoBootstrap({
    service: identity,
    demoPrincipalId: config.demoPrincipalId,
    logger,
  });
  /** Monotonic session counter (same-instant mints stay distinct; deterministic). */
  let sessionCounter = 0;

  const nowMs = (): number => Date.parse(deps.clock());

  function refused(decision: Extract<TenantDecision, { allowed: false }>, requestId: string): Response {
    return errorResponse(decision.status, decision.code, decision.detail, requestId);
  }

  /** Mint a session (+ its cookie) for a principal. Deterministic. */
  async function mintSession(
    principalId: string,
    kind: "user" | "demo",
  ): Promise<{ record: SessionRecord; token: string }> {
    const createdAt = deps.clock();
    const expiresAtMs = nowMs() + config.sessionTtlSeconds * 1000;
    const expiresAt = new Date(expiresAtMs).toISOString();
    const counter = sessionCounter;
    sessionCounter += 1;
    const sessionId = `sess-${sha256Hex(
      `${config.secret}:${principalId}:${createdAt}:${String(counter)}`,
    ).slice(0, 32)}`;
    const record: SessionRecord = { sessionId, principalId, kind, createdAt, expiresAt };
    await store.put(record);
    const token = mintSessionToken(config.secret, sessionId, expiresAtMs);
    return { record, token };
  }

  /**
   * Resolve the presented token to a principal. Null principal + non-null
   * failure ⇒ the caller serves the 401 envelope; null + null ⇒ anonymous.
   */
  async function authenticate(
    request: Request,
    requestId: string,
  ): Promise<{ readonly principal: ResolvedPrincipal | null; readonly failure: Response | null }> {
    const token = readSessionToken(request);
    if (token === null) {
      return { principal: null, failure: null };
    }
    const verification = verifySessionToken(config.secret, token, nowMs());
    if (!verification.ok) {
      return {
        principal: null,
        failure: errorResponse(
          401,
          verification.reason === "expired_token" ? "session_expired" : "session_invalid",
          verification.reason === "expired_token"
            ? "The session has expired."
            : "The session token is invalid.",
          requestId,
        ),
      };
    }
    const record = await store.get(verification.payload.sessionId);
    if (record === null) {
      return {
        principal: null,
        failure: errorResponse(401, "session_invalid", "The session is no longer known.", requestId),
      };
    }
    if (Date.parse(record.expiresAt) <= nowMs()) {
      // On-access cleanup: the deterministic expiry rule, applied where it
      // is observed (the boot sweep is the other half).
      await store.delete(record.sessionId);
      return {
        principal: null,
        failure: errorResponse(401, "session_expired", "The session has expired.", requestId),
      };
    }
    const resolution = await resolvePrincipal(directory, {
      principalId: record.principalId,
      kind: record.kind,
    });
    if (!resolution.ok) {
      return {
        principal: null,
        failure: errorResponse(
          401,
          "unknown_principal",
          "The session's principal no longer exists.",
          requestId,
        ),
      };
    }
    return { principal: resolution.principal, failure: null };
  }

  /** The display-only principal payload (the whole client-visible vocabulary). */
  function principalPayload(principal: ResolvedPrincipal): Record<string, string> {
    return {
      displayName: principal.displayName,
      roleLabel: principal.roleLabel,
      kind: principal.kind,
    };
  }

  /* ---------------- the auth endpoints ---------------- */

  async function handleAuthEndpoint(
    request: Request,
    url: URL,
    requestId: string,
  ): Promise<Response> {
    const path = url.pathname;
    const method = request.method.toUpperCase();
    const secure = url.protocol === "https:";

    if (path === "/v1/auth/whoami") {
      if (method !== "GET" && method !== "HEAD") {
        return errorResponse(405, "method_not_allowed", "Method not allowed.", requestId, {
          allow: "GET, HEAD",
        });
      }
      const { principal, failure } = await authenticate(request, requestId);
      if (failure !== null) {
        return failure;
      }
      if (principal === null) {
        return errorResponse(
          401,
          "authentication_required",
          "No session is active on this request.",
          requestId,
        );
      }
      return jsonResponse(200, { ok: true, principal: principalPayload(principal) }, requestId);
    }

    if (path === "/v1/auth/sessions" && method === "POST") {
      const text = await readTextBody(request);
      const parsed = parseJson(text);
      if (!parsed.ok) {
        return errorResponse(400, "malformed_json", "The request body is not valid JSON.", requestId);
      }
      const principalId = isRecord(parsed.payload) ? parsed.payload["principalId"] : undefined;
      if (typeof principalId !== "string" || principalId.length < 1 || principalId.length > 256) {
        return errorResponse(
          400,
          "invalid_principal_id",
          "principalId must be a non-empty string (1..256 characters).",
          requestId,
        );
      }
      const record = await directory.getPrincipal(principalId);
      if (record === null) {
        return errorResponse(
          401,
          "unknown_principal",
          "Sign-in failed: the principal is not registered.",
          requestId,
        );
      }
      const session = await mintSession(principalId, "user");
      const resolution = await resolvePrincipal(directory, {
        principalId,
        kind: "user",
      });
      if (!resolution.ok) {
        return errorResponse(
          401,
          "unknown_principal",
          "Sign-in failed: the principal is not registered.",
          requestId,
        );
      }
      logger.info("session opened", { requestId, kind: "user" });
      return jsonResponse(
        200,
        { ok: true, principal: principalPayload(resolution.principal) },
        requestId,
        { "set-cookie": sessionCookie(session.token, config.sessionTtlSeconds, secure) },
      );
    }

    if (path === "/v1/auth/demo" && method === "POST") {
      await ensureDemoTenantOnce();
      const session = await mintSession(config.demoPrincipalId, "demo");
      const resolution = await resolvePrincipal(directory, {
        principalId: config.demoPrincipalId,
        kind: "demo",
      });
      if (!resolution.ok) {
        // The bootstrap just ensured the principal; this is unreachable in
        // practice but stays fail-closed instead of guessing.
        return errorResponse(
          401,
          "unknown_principal",
          "The demo principal could not be resolved.",
          requestId,
        );
      }
      logger.info("demo session opened", { requestId, kind: "demo" });
      return jsonResponse(
        200,
        { ok: true, principal: principalPayload(resolution.principal) },
        requestId,
        { "set-cookie": sessionCookie(session.token, config.sessionTtlSeconds, secure) },
      );
    }

    if (path === "/v1/auth/sessions/current" && method === "DELETE") {
      const token = readSessionToken(request);
      const verification =
        token === null ? null : verifySessionToken(config.secret, token, nowMs());
      if (verification === null || !verification.ok) {
        return errorResponse(
          401,
          "authentication_required",
          "No session is active on this request.",
          requestId,
          { "set-cookie": clearedSessionCookie(secure) },
        );
      }
      const record = await store.get(verification.payload.sessionId);
      if (record !== null) {
        await store.delete(verification.payload.sessionId);
      }
      logger.info("session closed", { requestId });
      return jsonResponse(200, { ok: true }, requestId, {
        "set-cookie": clearedSessionCookie(secure),
      });
    }

    // Known auth paths with wrong methods keep the core's 405 discipline;
    // unknown auth paths are an honest 404 (the core would say the same).
    if (path === "/v1/auth/sessions" || path === "/v1/auth/sessions/current") {
      return errorResponse(405, "method_not_allowed", "Method not allowed.", requestId, {
        allow: path === "/v1/auth/sessions" ? "POST" : "DELETE",
      });
    }
    if (path === "/v1/auth/demo") {
      return errorResponse(405, "method_not_allowed", "Method not allowed.", requestId, {
        allow: "POST",
      });
    }
    return errorResponse(404, "not_found", "Not found.", requestId);
  }

  /* ---------------- the enforcement pipeline ---------------- */

  return {
    sweep: (): Promise<SessionSweepReport> => sweepExpiredSessions(store, deps.clock()),

    ensureDemo: ensureDemoTenantOnce,

    async handle(request: Request, requestId: string): Promise<AuthOutcome> {
      const url = new URL(request.url);
      const path = url.pathname;

      // Anonymous reads stay honest: liveness/readiness never authenticate.
      // Non-/v1 paths are not this layer's concern (the core answers them).
      if (path === "/healthz" || path === "/readyz" || !path.startsWith("/v1/")) {
        return { kind: "pass", request };
      }

      // The auth endpoints are this layer's own surface.
      if (path === "/v1/auth" || path.startsWith("/v1/auth/")) {
        return { kind: "response", response: await handleAuthEndpoint(request, url, requestId) };
      }

      // Session resolution (any presented token is verified first — an
      // invalid token is a 401 even on routes anonymous reads could pass).
      const { principal, failure } = await authenticate(request, requestId);
      if (failure !== null) {
        return { kind: "response", response: failure };
      }

      // The path scope (the documented tenant-addressed route shapes).
      const pathScope = extractPathScope(path);

      // PROD-010 carve-out: on the identity create-project act the body's
      // top-level projectId is the NEW project being registered, not an
      // addressed tenant — the BODY scope is skipped (the path's
      // organization tenant check above/below is untouched, and every other
      // route keeps the full path+body property).
      const method = request.method.toUpperCase();
      const createProjectAct = isIdentityCreateProjectAct(method, path);

      // The body scope: writes with a JSON body that names a project or an
      // organization top-level. The body is read once and REBUILT VERBATIM
      // into the forwarded request (the core must see the same bytes).
      let forwarded = request;
      const contentType = request.headers.get("content-type") ?? "";
      let bodyScope: TenantScope | null = null;
      if (isWriteVerb(method) && contentType.includes("application/json")) {
        const text = await readTextBody(request);
        if (text.length > 0) {
          const parsed = parseJson(text);
          if (parsed.ok) {
            bodyScope = extractBodyScope(parsed.payload);
          }
          // Rebuild with the exact body text (method/headers preserved;
          // content-length recomputed by the runtime for the new body).
          forwarded = new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: text,
          });
        }
      }

      // Authentication-only rule for unscoped routes…
      if (pathScope === null && bodyScope === null) {
        const decision = decideUnscopedAccess(principal, method, config.mode);
        if (!decision.allowed) {
          return { kind: "response", response: refused(decision, requestId) };
        }
        return { kind: "pass", request: forwarded };
      }

      // …and the typed tenant predicate over every addressed scope (path
      // AND body must both pass — a mutation whose path addresses project A
      // while its body names project B is refused if EITHER crosses). The
      // create-project carve-out above removes ONLY the body scope on that
      // one route shape; the body itself is still rebuilt verbatim either
      // way (the core sees the same bytes).
      for (const scope of [pathScope, createProjectAct ? null : bodyScope]) {
        if (scope === null) {
          continue;
        }
        const decision = await decideTenantAccess({
          directory,
          principal,
          scope,
          method,
          mode: config.mode,
          demoOrganizationId: DEMO_ORGANIZATION_ID,
          now: deps.clock(),
        });
        if (!decision.allowed) {
          return { kind: "response", response: refused(decision, requestId) };
        }
      }
      return { kind: "pass", request: forwarded };
    },
  };
}

/* ------------------------------------------------------------------ */
/* The degraded layer (enabled but unbuildable — the boot-honesty twin   */
/* of the runtime's UnavailableCaptureStore)                            */
/* ------------------------------------------------------------------ */

/**
 * An auth layer for the enabled-but-broken boot: /healthz and /readyz stay
 * honest, non-/v1 paths pass, and EVERY /v1 request fails loudly with a
 * 503 envelope carrying the configuration issues (variable names and
 * expectations only — never values). `failFast` deployments never see this
 * (the factory throws RuntimeBootError instead).
 */
export function createDegradedAuthLayer(reason: {
  readonly code: "auth_not_configured" | "auth_store_unavailable";
  readonly issues: readonly string[];
}): AuthLayer {
  return {
    sweep: async () => ({ considered: 0, removedSessionIds: [] }),
    ensureDemo: async () => {
      throw new Error(`auth layer unavailable: ${reason.code}`);
    },
    async handle(request: Request, requestId: string): Promise<AuthOutcome> {
      const path = new URL(request.url).pathname;
      if (path === "/healthz" || path === "/readyz" || !path.startsWith("/v1/")) {
        return { kind: "pass", request };
      }
      const body: Record<string, unknown> = {
        error: {
          code: reason.code,
          message:
            reason.code === "auth_not_configured"
              ? "The auth layer is enabled but its configuration is invalid."
              : "The auth layer is enabled but its session store is unavailable.",
          requestId,
        },
        issues: [...reason.issues],
      };
      return {
        kind: "response",
        response: new Response(JSON.stringify(body), {
          status: 503,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "x-request-id": requestId,
          },
        }),
      };
    },
  };
}
