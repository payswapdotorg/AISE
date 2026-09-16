/**
 * PROD-013 — the expensive-operation guard tests (guards.ts).
 *
 * Proves the GUARD CONTRACT:
 *
 *   - TUNING: parseRateLimitTuning honors valid `AISE_RATELIMIT_*` values
 *     and falls back to the documented conservative defaults on malformed
 *     or out-of-range values (mirroring tools/env-schema.ts exactly);
 *   - THE ROUTE SET: EXPENSIVE_ROUTE_RULES matches exactly the documented
 *     heavy-compute / external-I/O POSTs (BOQ imports + derived compute,
 *     reconstruction jobs + run, capture assets + sync, the artifact
 *     upload) — prefix rules require the path boundary, non-matching
 *     methods and routes never match;
 *   - PRINCIPALS: session cookie → sha-256 digest (never the raw cookie),
 *     else first x-forwarded-for hop / x-real-ip (digested), else the
 *     shared "anonymous" bucket;
 *   - BOUNDS: per-principal AND per-instance-global; either refusal is the
 *     TYPED 429 in the EXISTING stable error envelope plus the observable
 *     x-ratelimit-limit / -remaining / -reset headers and retry-after;
 *     non-matching routes pass through as the SAME Request object (zero
 *     overhead, byte-identical);
 *   - WINDOW RESET: the fixed window rolls with the injected clock;
 *   - DEGRADATION: a failing limiter client fails OPEN (the PROD-007
 *     contract) with a structured warn — never a throw, never a 500;
 *   - LOG DISCIPLINE: warns carry digests and numbers only — the cookie
 *     VALUE (a credential) appears in no log line.
 *
 * Determinism: fixed epoch clock shared by guard + memory client, captured
 * log lines, fake principals only — no Fs, no network, no randomness.
 */

import { describe, expect, test } from "bun:test";
import { createLogger, type Logger } from "../lib/log";
import { sha256Hex } from "../lib/hash";
import { MemoryRedisClient } from "../redis/client-memory";
import {
  redisFailure,
  type RedisClientPort,
  type RedisDeleteResult,
  type RedisExpireResult,
  type RedisGetResult,
  type RedisIncrementResult,
  type RedisSetResult,
} from "../redis/model";
import {
  CostGuard,
  derivePrincipal,
  EXPENSIVE_ROUTE_RULES,
  findExpensiveRoute,
  matchesExpensiveRoute,
  parseRateLimitTuning,
  principalLogLabel,
  RATELIMIT_GLOBAL_MAX_DEFAULT,
  RATELIMIT_MAX_DEFAULT,
  RATELIMIT_WINDOW_SECONDS_DEFAULT,
  type RateLimitTuning,
} from "./guards";

/* ------------------------------------------------------------------ */
/* World                                                                */
/* ------------------------------------------------------------------ */

const T0 = 1_700_000_000_000;

const FAILING_FAILURE = redisFailure("unavailable", "failing client (deterministic test stub)");

/** EVERY operation answers one typed failure (the limiter must fail open). */
class FailingRedisClient implements RedisClientPort {
  readonly mode = "memory" as const;

  async get(): Promise<RedisGetResult> {
    return { ok: false, failure: FAILING_FAILURE };
  }

  async set(): Promise<RedisSetResult> {
    return { ok: false, failure: FAILING_FAILURE };
  }

  async delete(): Promise<RedisDeleteResult> {
    return { ok: false, failure: FAILING_FAILURE };
  }

  async expire(): Promise<RedisExpireResult> {
    return { ok: false, failure: FAILING_FAILURE };
  }

  async increment(): Promise<RedisIncrementResult> {
    return { ok: false, failure: FAILING_FAILURE };
  }
}

interface GuardWorld {
  readonly guard: CostGuard;
  readonly lines: readonly string[];
  advance(ms: number): void;
}

function guardWorld(
  tuning: Partial<RateLimitTuning> = {},
  clientOf?: (clock: () => number) => RedisClientPort,
): GuardWorld {
  let now = T0;
  const clock = (): number => now;
  const lines: string[] = [];
  const logger: Logger = createLogger("debug", (line) => {
    lines.push(line);
  });
  const defaults = parseRateLimitTuning({});
  const guard = new CostGuard({
    client: clientOf === undefined ? new MemoryRedisClient({ clock }) : clientOf(clock),
    tuning: { ...defaults, ...tuning },
    clock,
    logger,
  });
  return {
    guard,
    lines,
    advance: (ms: number): void => {
      now += ms;
    },
  };
}

function request(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string,
): Request {
  return new Request(`https://api.aise.example${path}`, {
    method,
    headers: { "x-request-id": `req-${method}-${path}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 40), ...headers },
    ...(body === undefined ? {} : { body }),
  });
}

function warnLines(w: GuardWorld): string[] {
  return w.lines.filter((line) => line.includes('"level":"warn"'));
}

/* ------------------------------------------------------------------ */
/* Tuning                                                               */
/* ------------------------------------------------------------------ */

describe("parseRateLimitTuning (documented conservative defaults, env-overridable)", () => {
  test("empty environment → window 60s, 60 per principal, 600 global", () => {
    expect(parseRateLimitTuning({})).toEqual({
      windowSeconds: 60,
      maxPerPrincipal: 60,
      maxGlobal: 600,
    });
    expect(RATELIMIT_WINDOW_SECONDS_DEFAULT).toBe(60);
    expect(RATELIMIT_MAX_DEFAULT).toBe(60);
    expect(RATELIMIT_GLOBAL_MAX_DEFAULT).toBe(600);
  });

  test("valid values are honored (whitespace-tolerant)", () => {
    expect(
      parseRateLimitTuning({
        AISE_RATELIMIT_WINDOW_SECONDS: " 120 ",
        AISE_RATELIMIT_MAX: "5",
        AISE_RATELIMIT_GLOBAL_MAX: "25",
      }),
    ).toEqual({ windowSeconds: 120, maxPerPrincipal: 5, maxGlobal: 25 });
  });

  test("malformed or out-of-range values fall back to the defaults (never throw)", () => {
    for (const bad of ["banana", "", "  ", "0", "-5", "2.5", "1e3"]) {
      expect(
        parseRateLimitTuning({
          AISE_RATELIMIT_WINDOW_SECONDS: bad,
          AISE_RATELIMIT_MAX: bad,
          AISE_RATELIMIT_GLOBAL_MAX: bad,
        }),
      ).toEqual({ windowSeconds: 60, maxPerPrincipal: 60, maxGlobal: 600 });
    }
    // Ceilings: window 30 days, budgets 100k (above is junk).
    expect(
      parseRateLimitTuning({
        AISE_RATELIMIT_WINDOW_SECONDS: "2592001",
        AISE_RATELIMIT_MAX: "100001",
        AISE_RATELIMIT_GLOBAL_MAX: "100001",
      }),
    ).toEqual({ windowSeconds: 60, maxPerPrincipal: 60, maxGlobal: 600 });
    // A sub-minute window IS valid tuning (burst protection).
    expect(parseRateLimitTuning({ AISE_RATELIMIT_WINDOW_SECONDS: "1" }).windowSeconds).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* The route set                                                        */
/* ------------------------------------------------------------------ */

describe("EXPENSIVE_ROUTE_RULES — the deliberate bounded set", () => {
  test("the rules carry stable ids and POST-only methods", () => {
    expect(EXPENSIVE_ROUTE_RULES.map((rule) => rule.id)).toEqual([
      "boq-import-family",
      "reconstruction-jobs",
      "capture-assets",
      "capture-sync",
      "artifacts-upload",
    ]);
    for (const rule of EXPENSIVE_ROUTE_RULES) {
      expect(rule.method).toBe("POST");
    }
  });

  test("the documented expensive POSTs all match, with the right rule ids", () => {
    // (56-c typecheck fix: 56-b annotated 3-tuples but supplied pairs —
    // the [path, id] shape this loop actually consumes.)
    const cases: readonly (readonly [string, string])[] = [
      // BOQ import upload + the derived compute under the prefix.
      ["/v1/boq/imports", "boq-import-family"],
      ["/v1/boq/imports/bqm-1234/normalization", "boq-import-family"],
      ["/v1/boq/imports/bqm-1234/mappings", "boq-import-family"],
      ["/v1/boq/imports/bqm-1234/mappings/manual", "boq-import-family"],
      // Reconstruction job creation + the run trigger.
      ["/v1/reconstruction/jobs", "reconstruction-jobs"],
      ["/v1/reconstruction/jobs/job-56/run", "reconstruction-jobs"],
      // Raw content-addressed asset upload.
      ["/v1/capture/assets", "capture-assets"],
      ["/v1/capture/assets/sha256-abc", "capture-assets"],
      // SyncBatch ingestion (exact — only the ingestion route is bounded).
      ["/v1/capture/sync", "capture-sync"],
      // The artifact upload (an R2 PUT).
      ["/v1/artifacts", "artifacts-upload"],
    ];
    for (const [path, id] of cases) {
      expect(findExpensiveRoute("POST", path)?.id ?? null).toBe(id);
    }
  });

  test("light CRUD, reads and sibling paths never match", () => {
    const never: readonly (readonly [string, string])[] = [
      ["GET", "/v1/boq/imports"],
      ["GET", "/v1/capture/assets/sha256-abc"],
      ["POST", "/v1/cases"],
      ["POST", "/v1/interventions"],
      ["POST", "/v1/gaps"],
      ["POST", "/v1/comparisons"],
      ["PUT", "/v1/artifacts"],
      ["DELETE", "/v1/reconstruction/jobs/job-56"],
      // The exact rules do not bleed into subpaths…
      ["POST", "/v1/capture/sync/extra"],
      ["POST", "/v1/artifacts/batch"],
      // …and prefix rules respect the path boundary.
      ["POST", "/v1/boq/importsXXXX"],
      ["POST", "/v1/reconstruction/jobsX"],
      ["POST", "/v1/capture/assetsX"],
    ];
    for (const [method, path] of never) {
      expect(findExpensiveRoute(method, path)).toBeNull();
    }
  });

  test("matchesExpensiveRoute: prefix rules require the exact path or a /-child", () => {
    const prefixRule = EXPENSIVE_ROUTE_RULES.find((rule) => rule.id === "capture-assets")!;
    expect(matchesExpensiveRoute(prefixRule, "POST", "/v1/capture/assets")).toBe(true);
    expect(matchesExpensiveRoute(prefixRule, "POST", "/v1/capture/assets/x")).toBe(true);
    expect(matchesExpensiveRoute(prefixRule, "POST", "/v1/capture/assetsx")).toBe(false);
    expect(matchesExpensiveRoute(prefixRule, "GET", "/v1/capture/assets")).toBe(false);
    const exactRule = EXPENSIVE_ROUTE_RULES.find((rule) => rule.id === "capture-sync")!;
    expect(matchesExpensiveRoute(exactRule, "POST", "/v1/capture/sync")).toBe(true);
    expect(matchesExpensiveRoute(exactRule, "POST", "/v1/capture/sync/x")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Principal derivation                                                 */
/* ------------------------------------------------------------------ */

describe("derivePrincipal — digests, never credentials", () => {
  test("session cookie → kind session, id is the sha-256 of the cookie value", () => {
    const cookieValue = "fake-session-cookie-DO-NOT-LEAK";
    const principal = derivePrincipal(
      request("GET", "/v1/anything", { cookie: `other=1; aise_session=${cookieValue}; x=2` }),
    );
    expect(principal.kind).toBe("session");
    expect(principal.id).toBe(sha256Hex(cookieValue));
    expect(principal.id).not.toContain(cookieValue);
  });

  test("no cookie → the FIRST x-forwarded-for hop, digested", () => {
    const principal = derivePrincipal(
      request("GET", "/x", { "x-forwarded-for": "203.0.113.9, 198.51.100.7, 10.0.0.1" }),
    );
    expect(principal.kind).toBe("ip");
    expect(principal.id).toBe(sha256Hex("203.0.113.9"));
  });

  test("no cookie, no forwarding header → x-real-ip, digested", () => {
    const principal = derivePrincipal(request("GET", "/x", { "x-real-ip": "198.51.100.42" }));
    expect(principal.kind).toBe("ip");
    expect(principal.id).toBe(sha256Hex("198.51.100.42"));
  });

  test("empty cookie value and empty proxy headers fall through honestly", () => {
    expect(derivePrincipal(request("GET", "/x", { cookie: "aise_session=" })).kind).toBe("anonymous");
    // A MALFORMED forwarding header (empty first hop) never guesses a later
    // hop — the shared anonymous bucket is the honest answer.
    expect(derivePrincipal(request("GET", "/x", { "x-forwarded-for": " , 198.51.100.7" })).kind).toBe("anonymous");
    expect(derivePrincipal(request("GET", "/x", { "x-real-ip": "   " })).kind).toBe("anonymous");
    expect(derivePrincipal(request("GET", "/x"))).toEqual({ kind: "anonymous", id: "anonymous" });
  });

  test("principalLogLabel is a short, non-reversible label", () => {
    const principal = derivePrincipal(
      request("GET", "/x", { cookie: "aise_session=fake-cookie" }),
    );
    const label = principalLogLabel(principal);
    expect(label).toBe(`session:${sha256Hex("fake-cookie").slice(0, 12)}`);
    expect(label).not.toContain("fake-cookie");
  });
});

/* ------------------------------------------------------------------ */
/* The guard layer                                                      */
/* ------------------------------------------------------------------ */

describe("CostGuard — pass-through and bounds", () => {
  test("non-matching routes pass through as the SAME Request object (zero overhead)", async () => {
    const w = guardWorld();
    const req = request("POST", "/v1/cases", {}, '{"ok":1}');
    const outcome = await w.guard.handle(req, "req-1");
    expect(outcome).toEqual({ kind: "pass", request: req });
    // No limiter state was created for the unmatched route.
    expect(w.lines.filter((line) => line.includes("rate_limit"))).toEqual([]);
  });

  test("expensive routes under the budget pass through untouched (body never read)", async () => {
    const w = guardWorld({ maxPerPrincipal: 5, maxGlobal: 10 });
    const req = request("POST", "/v1/capture/sync", {}, '{"batch":{}}');
    const outcome = await w.guard.handle(req, "req-2");
    expect(outcome.kind).toBe("pass");
    if (outcome.kind === "pass") {
      expect(outcome.request).toBe(req);
      // The body is still readable by the next pipeline stage.
      expect(await outcome.request.text()).toBe('{"batch":{}}');
    }
  });

  test("the per-principal budget: the max+1-th request is the typed 429 with observable headers", async () => {
    const w = guardWorld({ maxPerPrincipal: 2, maxGlobal: 100 });
    const headers = { "x-forwarded-for": "203.0.113.9" };
    expect((await w.guard.handle(request("POST", "/v1/capture/sync", headers), "r1")).kind).toBe("pass");
    expect((await w.guard.handle(request("POST", "/v1/capture/sync", headers), "r2")).kind).toBe("pass");
    const refused = await w.guard.handle(request("POST", "/v1/capture/sync", headers), "r3");
    expect(refused.kind).toBe("response");
    if (refused.kind === "response") {
      expect(refused.response.status).toBe(429);
      // The EXISTING stable error envelope — no new error shape.
      expect(await refused.response.json()).toEqual({
        error: {
          code: "rate_limited",
          message: expect.stringContaining("limit 2 per 60s window"),
          requestId: "r3",
        },
      });
      const limit = refused.response.headers.get("x-ratelimit-limit");
      const remaining = refused.response.headers.get("x-ratelimit-remaining");
      const reset = refused.response.headers.get("x-ratelimit-reset");
      const retryAfter = refused.response.headers.get("retry-after");
      expect(limit).toBe("2");
      expect(remaining).toBe("0");
      expect(reset).not.toBeNull();
      expect(Number(reset!)).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBe(reset);
      // The structured warn names the bound and the digest, never the IP.
      const warnLine = warnLines(w).find((line) => line.includes('"rate_limited"'));
      expect(warnLine).toBeDefined();
      expect(JSON.parse(warnLine!)).toMatchObject({
        requestId: "r3",
        route: "capture-sync",
        bound: "principal",
        limit: 2,
        windowSeconds: 60,
        retryAfterSeconds: Number(reset),
      });
      expect(warnLine!).not.toContain("203.0.113.9");
    }
  });

  test("principal isolation: a different principal has its own budget", async () => {
    const w = guardWorld({ maxPerPrincipal: 1, maxGlobal: 100 });
    const alice = { "x-forwarded-for": "203.0.113.9" };
    const bob = { "x-forwarded-for": "198.51.100.7" };
    expect((await w.guard.handle(request("POST", "/v1/artifacts", alice), "a1")).kind).toBe("pass");
    expect((await w.guard.handle(request("POST", "/v1/artifacts", alice), "a2")).kind).toBe("response");
    expect((await w.guard.handle(request("POST", "/v1/artifacts", bob), "b1")).kind).toBe("pass");
    expect((await w.guard.handle(request("POST", "/v1/artifacts", bob), "b2")).kind).toBe("response");
  });

  test("the per-instance global bound refuses even with per-principal budget left", async () => {
    const w = guardWorld({ maxPerPrincipal: 10, maxGlobal: 3 });
    const ip = (n: number): Record<string, string> => ({ "x-forwarded-for": `203.0.113.${n}` });
    expect((await w.guard.handle(request("POST", "/v1/capture/sync", ip(1)), "g1")).kind).toBe("pass");
    expect((await w.guard.handle(request("POST", "/v1/capture/sync", ip(2)), "g2")).kind).toBe("pass");
    expect((await w.guard.handle(request("POST", "/v1/capture/sync", ip(3)), "g3")).kind).toBe("pass");
    const refused = await w.guard.handle(request("POST", "/v1/capture/sync", ip(4)), "g4");
    expect(refused.kind).toBe("response");
    if (refused.kind === "response") {
      expect(refused.response.status).toBe(429);
      expect(refused.response.headers.get("x-ratelimit-limit")).toBe("3");
      const warnLine = warnLines(w).find((line) => line.includes('"bound":"global"'));
      expect(warnLine).toBeDefined();
      expect(JSON.parse(warnLine!)).toMatchObject({ route: "capture-sync", bound: "global" });
    }
  });

  test("the fixed window rolls: the budget is restored in the next window", async () => {
    const w = guardWorld({ maxPerPrincipal: 1, maxGlobal: 10, windowSeconds: 60 });
    const headers = { "x-forwarded-for": "203.0.113.9" };
    expect((await w.guard.handle(request("POST", "/v1/capture/sync", headers), "w1")).kind).toBe("pass");
    expect((await w.guard.handle(request("POST", "/v1/capture/sync", headers), "w2")).kind).toBe("response");
    w.advance(61_000); // past the window boundary
    expect((await w.guard.handle(request("POST", "/v1/capture/sync", headers), "w3")).kind).toBe("pass");
  });

  test("a failing limiter client fails OPEN with a structured warn (never a throw)", async () => {
    const w = guardWorld(
      { maxPerPrincipal: 1, maxGlobal: 1 },
      () => new FailingRedisClient(),
    );
    const outcome = await w.guard.handle(request("POST", "/v1/capture/sync"), "d1");
    expect(outcome.kind).toBe("pass");
    const degraded = warnLines(w).filter((line) => line.includes('"rate_limit_degraded"'));
    // Both bounds degraded open, each loudly.
    expect(degraded.length).toBe(2);
    for (const line of degraded) {
      expect(JSON.parse(line)).toMatchObject({
        requestId: "d1",
        route: "capture-sync",
        failureKind: "unavailable",
      });
    }
    // Non-matching routes never touch the limiter at all.
    expect((await w.guard.handle(request("GET", "/v1/cases"), "d2")).kind).toBe("pass");
  });

  test("the guard's tuning is pure data (the readiness/doc surface)", () => {
    const w = guardWorld({ maxPerPrincipal: 7, maxGlobal: 70, windowSeconds: 30 });
    expect(w.guard.limits).toEqual({ windowSeconds: 30, maxPerPrincipal: 7, maxGlobal: 70 });
  });
});
