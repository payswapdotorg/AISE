/**
 * Bounded expensive operations — PROD-013 (cost guards / operational safety).
 *
 * This module wires the PROD-007 fixed-window limiter (`consumeRateLimit`
 * — built in PROD-007, wired NOWHERE until now) into the runtime entry's
 * request pipeline as a guard layer between the auth layer and the routing
 * core (the same pipeline position pattern as the auth layer; server.ts is
 * never touched).
 *
 * THE ROUTE SET (deliberate; every entry names a route that performs heavy
 * compute or external I/O):
 *
 *   POST /v1/boq/imports…        BOQ source ingestion (XLSX = ZIP inflate +
 *                                XML parse, CSV parse, PDF buffering) and
 *                                the DERIVED compute POSTs under the prefix:
 *                                normalization (dictionary derivation over
 *                                every item row), mappings (the deterministic
 *                                BOQ-to-reality matcher over a graph
 *                                snapshot) and manual mapping versions.
 *   POST /v1/reconstruction/jobs… reconstruction job creation and the /run
 *                                trigger — the provider-dispatch surface
 *                                (potentially external I/O; the geometry
 *                                pipeline is the heaviest compute in the API).
 *   POST /v1/capture/assets/…    raw content-addressed asset upload (whole
 *                                body buffered, sha-256 over every byte,
 *                                blob write).
 *   POST /v1/capture/sync        SyncBatch ingestion (JSON body buffered,
 *                                manifest verification over every asset).
 *   POST /v1/artifacts           artifact upload (an R2 PUT — external I/O
 *                                against the metered storage backend).
 *
 * Deliberately NOT bounded (record-keeping CRUD with light compute —
 * cases/, interventions/, executions/, identity/, gaps/, comparisons/):
 * their handlers append typed records; bounding them would add limiter
 * cost without protecting any free-tier resource. The set is data
 * (`EXPENSIVE_ROUTE_RULES`) — review it when a route's cost changes.
 *
 * BOUNDS: per-principal (session cookie hash, else client IP, else
 * "anonymous") AND a per-instance global bound. Either exhausted → the
 * request is refused with a TYPED 429 in the EXISTING stable error
 * envelope (runtime/errors.ts — no new error shape) plus the observable
 * `x-ratelimit-limit` / `x-ratelimit-remaining` / `x-ratelimit-reset`
 * headers and the standard `retry-after`. DELIBERATE: only the 429
 * response carries the headers — successful responses pass through the
 * core byte-identical (the zero-config discipline: existing flows without
 * 429s must be byte-identical, and response headers are response bytes).
 *
 * BACKING: the limiter runs over a `RedisClientPort` — the METERED
 * Upstash client when the PROD-007 pair is configured (shared window
 * counters across instances; every counter increment is itself metered as
 * a redis command — honest), else a fresh in-memory client PER HANDLER
 * INSTANCE (per-instance counting only — documented honestly; a
 * multi-instance deployment without Redis bounds per instance, not in
 * aggregate).
 *
 * DEGRADATION: `consumeRateLimit` fails OPEN on a Redis typed failure
 * (degraded: true — the PROD-007 design: the limiter protects shared
 * transient resources and is explicitly NOT a security boundary). This
 * guard logs each degraded allowance as a structured warn (never silent)
 * and lets the request through.
 *
 * ZERO-CONFIG DISCIPLINE: all `AISE_RATELIMIT_*` variables are optional
 * with conservative defaults (window 60s; 60 per principal per window;
 * 600 per instance globally) chosen so the documented golden journey
 * (a handful of expensive POSTs per evaluator session) NEVER sees a 429
 * while a hammering client is stopped within one window.
 *
 * Determinism: the layer takes an INJECTED clock (epoch ms) and an
 * injected limiter client; no I/O of its own beyond the limiter call; no
 * randomness; no secrets — the principal identifier is a sha-256 digest
 * of the session cookie (the cookie VALUE is a credential and never
 * appears in a key, a log line or a response).
 */

import { sha256Hex } from "../lib/hash";
import type { Logger } from "../lib/log";
import { errorResponse } from "../runtime/errors";
import { consumeRateLimit, type RateLimitDecision } from "../redis/ratelimit";
import type { RedisClientPort } from "../redis/model";
import { SESSION_COOKIE_NAME } from "../auth/model";

/* ------------------------------------------------------------------ */
/* Configuration                                                        */
/* ------------------------------------------------------------------ */

/** Default window: one minute (matches the PROD-007 limiter default). */
export const RATELIMIT_WINDOW_SECONDS_DEFAULT = 60;
/** Default per-principal budget per window (journey headroom ≈ 3-6x). */
export const RATELIMIT_MAX_DEFAULT = 60;
/** Default per-instance global budget per window. */
export const RATELIMIT_GLOBAL_MAX_DEFAULT = 600;

/** Tuning ceiling (a window above 30 days or a budget above 100k is junk). */
const WINDOW_MAX_SECONDS = 2_592_000;
const MAX_CEILING = 100_000;

/** Parsed, validated guard tuning (mirrors tools/env-schema.ts exactly). */
export interface RateLimitTuning {
  readonly windowSeconds: number;
  readonly maxPerPrincipal: number;
  readonly maxGlobal: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number, max: number): number {
  const trimmed = raw?.trim() ?? "";
  if (!/^\d+$/.test(trimmed)) {
    return fallback;
  }
  const value = Number.parseInt(trimmed, 10);
  return value >= 1 && value <= max ? value : fallback;
}

/**
 * Parse the `AISE_RATELIMIT_*` variables. Malformed values fall back to the
 * documented conservative defaults (the workspace env gate is the validator
 * of record). NOTE: these are DISTINCT from the PROD-007 redis family's
 * `AISE_REDIS_RATELIMIT_*` tuning pair (the family's own surface, still
 * unwired by its design) — this guard owns its variables and documents the
 * relationship in docs/COST-GUARDS.md.
 */
export function parseRateLimitTuning(env: Record<string, string | undefined>): RateLimitTuning {
  return {
    windowSeconds: parsePositiveInt(
      env.AISE_RATELIMIT_WINDOW_SECONDS,
      RATELIMIT_WINDOW_SECONDS_DEFAULT,
      WINDOW_MAX_SECONDS,
    ),
    maxPerPrincipal: parsePositiveInt(
      env.AISE_RATELIMIT_MAX,
      RATELIMIT_MAX_DEFAULT,
      MAX_CEILING,
    ),
    maxGlobal: parsePositiveInt(
      env.AISE_RATELIMIT_GLOBAL_MAX,
      RATELIMIT_GLOBAL_MAX_DEFAULT,
      MAX_CEILING,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* The route rules (data, not logic)                                    */
/* ------------------------------------------------------------------ */

/** One bounded expensive route: a method + an exact path or path prefix. */
export interface ExpensiveRouteRule {
  /** The rule's stable id (logs and tests refer to it). */
  readonly id: string;
  readonly method: "POST";
  /** Matches the path EXACTLY when `prefix` is false, as a prefix otherwise. */
  readonly path: string;
  readonly prefix: boolean;
}

/**
 * The bounded expensive-route set (see the module header for the full
 * justification of every entry and every deliberate omission).
 */
export const EXPENSIVE_ROUTE_RULES: readonly ExpensiveRouteRule[] = [
  // Covers POST /v1/boq/imports (upload), …/:id/normalization,
  // …/:id/mappings and …/:id/mappings/manual (derived compute).
  { id: "boq-import-family", method: "POST", path: "/v1/boq/imports", prefix: true },
  // Covers POST /v1/reconstruction/jobs (create) and …/jobs/:id/run.
  { id: "reconstruction-jobs", method: "POST", path: "/v1/reconstruction/jobs", prefix: true },
  // POST /v1/capture/assets/:contentId — raw content-addressed upload.
  { id: "capture-assets", method: "POST", path: "/v1/capture/assets", prefix: true },
  // POST /v1/capture/sync — exact (only the ingestion route is expensive).
  { id: "capture-sync", method: "POST", path: "/v1/capture/sync", prefix: false },
  // POST /v1/artifacts — the artifact upload (R2 PUT).
  { id: "artifacts-upload", method: "POST", path: "/v1/artifacts", prefix: false },
] as const;

/** Does a (method, pathname) pair match a rule? */
export function matchesExpensiveRoute(
  rule: ExpensiveRouteRule,
  method: string,
  pathname: string,
): boolean {
  if (method.toUpperCase() !== rule.method) {
    return false;
  }
  if (rule.prefix) {
    return pathname === rule.path || pathname.startsWith(`${rule.path}/`);
  }
  return pathname === rule.path;
}

/** The first rule matching (method, pathname), or null. */
export function findExpensiveRoute(
  method: string,
  pathname: string,
): ExpensiveRouteRule | null {
  for (const rule of EXPENSIVE_ROUTE_RULES) {
    if (matchesExpensiveRoute(rule, method, pathname)) {
      return rule;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Principal derivation                                                 */
/* ------------------------------------------------------------------ */

export type PrincipalKind = "session" | "ip" | "anonymous";

export interface PrincipalIdentifier {
  readonly kind: PrincipalKind;
  /** The limiter identifier: a DIGEST, never the raw cookie or IP value. */
  readonly id: string;
}

/** Parse a cookie header for one cookie's value (null when absent). */
function readCookie(cookieHeader: string | null, name: string): string | null {
  if (cookieHeader === null) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const equals = trimmed.indexOf("=");
    if (equals > 0 && trimmed.slice(0, equals) === name) {
      return trimmed.slice(equals + 1);
    }
  }
  return null;
}

/**
 * Derive the per-principal limiter identifier for one request:
 *   1. the auth session cookie (the auth layer's opaque HMAC token) → its
 *      sha-256 digest (the token itself is a credential and never becomes
 *      a key or a log field);
 *   2. else the client IP: the FIRST hop of `x-forwarded-for` (the proxy
 *      chain appends; the first value is the originating client) or
 *      `x-real-ip` → digested the same way (IPs are PII, not keys);
 *   3. else "anonymous" (no cookie, no proxy headers — e.g. same-origin
 *      local traffic): one shared bucket, honestly labeled.
 */
export function derivePrincipal(request: Request): PrincipalIdentifier {
  const cookie = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (cookie !== null && cookie !== "") {
    return { kind: "session", id: sha256Hex(cookie) };
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null) {
    const first = forwarded.split(",")[0]?.trim() ?? "";
    if (first !== "") {
      return { kind: "ip", id: sha256Hex(first) };
    }
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp !== null && realIp.trim() !== "") {
    return { kind: "ip", id: sha256Hex(realIp.trim()) };
  }
  return { kind: "anonymous", id: "anonymous" };
}

/** A short, non-reversible label for logs (never the identifier itself). */
export function principalLogLabel(principal: PrincipalIdentifier): string {
  return `${principal.kind}:${principal.id.slice(0, 12)}`;
}

/* ------------------------------------------------------------------ */
/* The guard layer                                                      */
/* ------------------------------------------------------------------ */

export interface CostGuardOptions {
  /** The limiter's backing client (metered Upstash, or per-instance memory). */
  readonly client: RedisClientPort;
  /** Guard tuning (see parseRateLimitTuning). */
  readonly tuning: RateLimitTuning;
  /** Injected clock (epoch ms) — window math is deterministic. */
  readonly clock: () => number;
  readonly logger: Logger;
}

/** What the layer decided for one request. */
export type CostGuardOutcome =
  /** Pass this request to the next pipeline stage untouched. */
  | { readonly kind: "pass"; readonly request: Request }
  /** Serve this 429 response (stable envelope + observable headers). */
  | { readonly kind: "response"; readonly response: Response };

/**
 * The expensive-operation guard. `handle` NEVER throws: limiter failures
 * degrade open (logged), everything else is a typed decision.
 */
export class CostGuard {
  private readonly client: RedisClientPort;
  private readonly tuning: RateLimitTuning;
  private readonly clock: () => number;
  private readonly logger: Logger;

  constructor(options: CostGuardOptions) {
    this.client = options.client;
    this.tuning = options.tuning;
    this.clock = options.clock;
    this.logger = options.logger;
  }

  /** The tuning this guard enforces (readiness/doc surface — pure data). */
  get limits(): RateLimitTuning {
    return this.tuning;
  }

  async handle(request: Request, requestId: string): Promise<CostGuardOutcome> {
    const url = new URL(request.url);
    const rule = findExpensiveRoute(request.method, url.pathname);
    if (rule === null) {
      // Not a bounded route: zero overhead, byte-identical pass-through.
      return { kind: "pass", request };
    }
    const principal = derivePrincipal(request);

    // The per-principal budget…
    const principalDecision = await consumeRateLimit(
      { client: this.client, windowSeconds: this.tuning.windowSeconds, max: this.tuning.maxPerPrincipal, clock: this.clock },
      { scope: `cost:${rule.id}:principal`, identifier: principal.id },
    );
    if (principalDecision.degraded) {
      this.logDegraded(requestId, rule, principal, principalDecision);
    }
    if (!principalDecision.allowed) {
      return {
        kind: "response",
        response: this.refused(requestId, rule, principal, principalDecision, "principal"),
      };
    }

    // …and the per-instance global bound. Either refusal wins.
    const globalDecision = await consumeRateLimit(
      { client: this.client, windowSeconds: this.tuning.windowSeconds, max: this.tuning.maxGlobal, clock: this.clock },
      { scope: `cost:${rule.id}:global`, identifier: "all" },
    );
    if (globalDecision.degraded) {
      this.logDegraded(requestId, rule, principal, globalDecision);
    }
    if (!globalDecision.allowed) {
      return {
        kind: "response",
        response: this.refused(requestId, rule, principal, globalDecision, "global"),
      };
    }

    return { kind: "pass", request };
  }

  private logDegraded(
    requestId: string,
    rule: ExpensiveRouteRule,
    principal: PrincipalIdentifier,
    decision: RateLimitDecision,
  ): void {
    // Fail-open degradation (the PROD-007 limiter contract): loud, once
    // per occurrence, names the failure KIND — never a credential.
    this.logger.warn("rate_limit_degraded", {
      requestId,
      route: rule.id,
      principal: principalLogLabel(principal),
      failureKind: decision.failure?.kind ?? null,
      detail: "the rate limiter's redis client failed — allowing the request (fail-open, not a security boundary)",
    });
  }

  private refused(
    requestId: string,
    rule: ExpensiveRouteRule,
    principal: PrincipalIdentifier,
    decision: RateLimitDecision,
    bound: "principal" | "global",
  ): Response {
    this.logger.warn("rate_limited", {
      requestId,
      route: rule.id,
      bound,
      principal: principalLogLabel(principal),
      limit: decision.limit,
      windowSeconds: decision.windowSeconds,
      retryAfterSeconds: decision.retryAfterSeconds,
    });
    return errorResponse(
      429,
      "rate_limited",
      `Too many requests to this operation (limit ${decision.limit} per ${decision.windowSeconds}s window) — retry after ${decision.retryAfterSeconds}s.`,
      requestId,
      {
        "retry-after": String(decision.retryAfterSeconds),
        "x-ratelimit-limit": String(decision.limit),
        "x-ratelimit-remaining": String(decision.remaining),
        "x-ratelimit-reset": String(decision.retryAfterSeconds),
      },
    );
  }
}
