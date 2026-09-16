/**
 * PROD-013 — the runtime entry's COST-GUARDS SEAM tests (entry.ts × cost/*).
 *
 * These prove the env-gated composition contract of the cost-guard layer
 * through the FULL production pipeline (nothing from cost/ is constructed
 * directly — the seam is the point), the PROD-011b precedent applied to
 * the cost family:
 *
 *   - REDIS MODE (AISE_REDIS_REST_URL + AISE_REDIS_REST_TOKEN both set):
 *     the mode log says ledger=redis + meteredRedis=true, and — the
 *     decisive wiring proof without any real Upstash dependency — every
 *     session REST command now flows through the METERED client: with a
 *     tiny AISE_QUOTA_REDIS_COMMANDS cap the pipeline drives the ledger to
 *     its cap and the NEXT session command is refused by the cost guard
 *     itself (the typed quota_exceeded failure, the warn lines, whoami
 *     401 — the store's documented fail-closed handling of a refused
 *     command). /readyz then reports the exhausted meter ADDITIVELY
 *     (per-field status exhausted + the cost-level aggregate) while the
 *     top-level ok stays true (a quota cap degrades an optional
 *     dimension; it does not invalidate the configuration);
 *   - FS/DEFAULT MODE (no new env vars): the mode log says ledger=memory
 *     (per-instance, honestly), the demo journey is byte-identical (mint
 *     200 + whoami 200), and NO quota/rate-limit/upload warn ever fires —
 *     the zero-config discipline. Malformed AISE_* cost values degrade to
 *     the documented defaults (never a crash, never a lying readiness);
 *   - HALF-CONFIGURED (exactly one of the Upstash pair): the cost family
 *     takes the memory twin with its own honest mode line (no duplicate
 *     half-configured nagging — the session-store seam already warns),
 *     and the demo journey still works on the Fs twin;
 *   - GUARD ORDER: the rate limiter sits BETWEEN auth and the core — an
 *     anonymous flood of expensive POSTs is answered by AUTH (401), never
 *     by the limiter (no rate_limit warn lines at all);
 *   - THE 429 CONTRACT through the pipeline: a minted principal hammering
 *     an expensive route gets the TYPED 429 in the stable envelope plus
 *     the observable x-ratelimit-* headers, while a normal CRUD route
 *     never sees a 429 (the route set is data, not a blanket);
 *   - THE 413 CONTRACT through the pipeline: an over-cap upload on a
 *     previously-uncapped ingestion route is refused BEFORE the body is
 *     buffered (typed payload_too_large envelope), while an under-cap
 *     body passes through to the core;
 *   - NAMES-NEVER-VALUES: the URL and the token appear in NO log line and
 *     NO response body — including the /readyz cost section.
 *
 * Determinism: fixed env records, fixed request ids, scratch data dirs
 * (mkdtemp, always removed). The unreachable endpoint uses RFC-2606's
 * reserved .invalid TLD (the DNS failure is the deterministic "Upstash is
 * unreachable" stand-in); the exhaustion loop is bounded and asserts the
 * INVARIANT (a typed refusal occurs and readiness reports it), robust to
 * the boot sweep's single command racing the first request.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, type Logger } from "../lib/log";
import type { EnvRecord, EnvSource } from "../lib/config";
import { createRuntimeHandler } from "./entry";

const scratchDirs: string[] = [];

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "aise-runtime-cost-seam-test-"));
  scratchDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const AUTH_SECRET = "runtime-cost-seam-test-secret-DO-NOT-LEAK";
/** RFC 2606 reserved — guaranteed non-resolvable, never a real endpoint. */
const UNREACHABLE_REDIS_URL = "https://aise-cost-seam-test.invalid";
const FAKE_REDIS_TOKEN = "aise-cost-seam-test-token-DO-NOT-LEAK";

function baseEnv(overrides: EnvRecord = {}): EnvRecord {
  return {
    HOST: "127.0.0.1",
    PORT: "8080",
    LOG_LEVEL: "debug",
    AISE_DATA_DIR: scratchDir(),
    AISE_AUTH: "1",
    AUTH_SECRET,
    AISE_AUTH_MODE: "demo-open",
    ...overrides,
  };
}

interface RuntimeWorld {
  readonly handler: (request: Request) => Promise<Response>;
  readonly logLines: readonly string[];
}

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

function post(
  path: string,
  options: {
    headers?: Record<string, string>;
    body?: string;
    requestId?: string;
  } = {},
): Request {
  return new Request(`https://api.aise.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": options.requestId ?? path.replace(/[^a-z0-9]/gi, "-").slice(0, 30),
      ...(options.headers ?? {}),
    },
    ...(options.body === undefined ? {} : { body: options.body }),
  });
}

function cookieOf(response: Response): string | null {
  return response.headers.get("set-cookie");
}

function hasLine(world: RuntimeWorld, needle: string): boolean {
  return world.logLines.some((line) => line.includes(needle));
}

/** Mint a demo session through the pipeline; returns the cookie header value. */
async function mintDemoSession(world: RuntimeWorld): Promise<string> {
  const mint = await world.handler(post("/v1/auth/demo", { requestId: "mint", body: "{}" }));
  expect(mint.status).toBe(200);
  const cookie = cookieOf(mint);
  expect(cookie).not.toBeNull();
  return cookie ?? "";
}

/* ------------------------------------------------------------------ */
/* Redis mode — the metered client is really in the path                */
/* ------------------------------------------------------------------ */

describe("cost-guards seam — REDIS MODE when the Upstash pair is complete", () => {
  test("the mode logs name redis + meteredRedis; the session store fail-closes against the unreachable endpoint", async () => {
    const world = runtimeWorld(
      baseEnv({
        AISE_REDIS_REST_URL: UNREACHABLE_REDIS_URL,
        AISE_REDIS_REST_TOKEN: FAKE_REDIS_TOKEN,
      }),
    );

    // The cost family's mode line: the shared-window ledger + the metered
    // client, honestly labeled.
    const costModeLogged = world.logLines.some(
      (line) =>
        line.includes('"cost_guards_mode"') &&
        line.includes('"ledger":"redis"') &&
        line.includes('"meteredRedis":true'),
    );
    expect(costModeLogged).toBe(true);

    // The session-store seam still selects redis (PROD-011b's mode line —
    // now over the METERED client).
    const sessionModeLogged = world.logLines.some(
      (line) => line.includes('"auth_session_store_mode"') && line.includes('"redis"'),
    );
    expect(sessionModeLogged).toBe(true);

    // The PROD-011b fail-closed proof still holds with the meter in the
    // path: mint 200 (put's typed failure is logged data), whoami 401.
    const mint = await world.handler(post("/v1/auth/demo", { requestId: "mint", body: "{}" }));
    expect(mint.status).toBe(200);
    const whoami = await world.handler(
      get("/v1/auth/whoami", { cookie: cookieOf(mint) ?? "" }),
    );
    expect(whoami.status).toBe(401);
    const storeFailureLogged = world.logLines.some((line) =>
      line.includes("redis_session_store_put_failed") ||
      line.includes("redis_session_store_get_failed"),
    );
    expect(storeFailureLogged).toBe(true);
  });

  test("quota exhaustion through the FULL pipeline: typed refusal, warn lines, /readyz reports it ADDITIVELY", async () => {
    // A deliberately tiny command cap: the boot sweep costs at most ONE
    // command (the index read fails unreachable → list() → []), the demo
    // mint costs THREE (set + index read + index write), so the mint can
    // never itself be refused; whoamis (ONE command each) then drive the
    // ledger across the threshold band and into the cap.
    const CAP = 8;
    const world = runtimeWorld(
      baseEnv({
        AISE_REDIS_REST_URL: UNREACHABLE_REDIS_URL,
        AISE_REDIS_REST_TOKEN: FAKE_REDIS_TOKEN,
        AISE_QUOTA_REDIS_COMMANDS: String(CAP),
      }),
    );

    const cookie = await mintDemoSession(world);

    // Drive the ledger to the cap. NOTE: against the unreachable endpoint
    // whoami is 401 from the FIRST call (the store fail-closes on the
    // typed get failure — the PROD-011b contract), so the 401 ALONE is
    // not the exhaustion signal; the COST-GUARD refusal is its own typed
    // evidence (the warn line + the variable-naming failure detail). The
    // loop is bounded and robust to the boot sweep's single command racing
    // the mint (the invariant — the refusal occurs and is visible — is
    // what is asserted, never an exact attempt index).
    let quotaRefusalSeen = false;
    let requests = 0;
    for (let attempt = 0; attempt < 10 && !quotaRefusalSeen; attempt++) {
      requests += 1;
      const whoami = await world.handler(
        get("/v1/auth/whoami", { cookie, "x-request-id": `whoami-${attempt}` }),
      );
      // Fail-closed either way: endpoint-unreachable (before the cap) or
      // cost-guard refusal (at/after the cap) — never a lying 200.
      expect(whoami.status).toBe(401);
      quotaRefusalSeen = world.logLines.some(
        (line) =>
          line.includes('"quota_redis_commands_refused"') &&
          line.includes(`"cap":${CAP}`),
      );
    }
    // The cost guard REFUSED a session command through the full pipeline.
    expect(quotaRefusalSeen).toBe(true);
    expect(requests).toBeGreaterThanOrEqual(1);
    // The refusal is typed with the variable NAME (never a value): the
    // store's warn carries the metered failure's detail.
    const namedVariable = world.logLines.some(
      (line) =>
        line.includes("redis_session_store_get_failed") &&
        line.includes("AISE_QUOTA_REDIS_COMMANDS"),
    );
    expect(namedVariable).toBe(true);

    // The threshold band was crossed on the way (ONE structured warn).
    expect(hasLine(world, '"quota_redis_commands_threshold"')).toBe(true);

    // /readyz reports the exhausted meter ADDITIVELY: the per-field status
    // and the cost-level aggregate say exhausted, the numbers are the
    // configured cap + the counted (refused) attempts, and the TOP-LEVEL
    // ok is untouched (config validity is not a quota question).
    const readyz = await world.handler(get("/readyz"));
    expect(readyz.status).toBe(200);
    const body = (await readyz.json()) as {
      ok: boolean;
      cost: {
        ledger: string;
        meters: {
          resource: string;
          metered: boolean;
          used: number;
          cap: number;
          remaining: number;
          status: string;
        }[];
        status: string;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.cost.ledger).toBe("redis");
    const redisMeter = body.cost.meters.find((m) => m.resource === "redis_commands");
    expect(redisMeter).toBeDefined();
    expect(redisMeter!.metered).toBe(true);
    expect(redisMeter!.cap).toBe(CAP);
    expect(redisMeter!.used).toBeGreaterThanOrEqual(CAP);
    expect(redisMeter!.remaining).toBe(0);
    expect(redisMeter!.status).toBe("exhausted");
    expect(body.cost.status).toBe("exhausted");
  });

  test("the secret-leak discipline: the URL and token appear in no log line and no response body", async () => {
    const world = runtimeWorld(
      baseEnv({
        AISE_REDIS_REST_URL: UNREACHABLE_REDIS_URL,
        AISE_REDIS_REST_TOKEN: FAKE_REDIS_TOKEN,
        AISE_QUOTA_REDIS_COMMANDS: "8",
      }),
    );
    const cookie = await mintDemoSession(world);
    // Drive to the quota refusal so the failure paths emit their lines too
    // (against the unreachable endpoint every whoami is a fail-closed 401;
    // the loop runs until the COST-GUARD refusal's own warn appears).
    for (let attempt = 0; attempt < 10; attempt++) {
      await world.handler(
        get("/v1/auth/whoami", { cookie, "x-request-id": `leak-${attempt}` }),
      );
      if (
        world.logLines.some((line) => line.includes('"quota_redis_commands_refused"'))
      ) {
        break;
      }
    }
    const readyz = await world.handler(get("/readyz"));
    const readyzBody = JSON.stringify(await readyz.json());

    for (const line of world.logLines) {
      expect(line.includes(UNREACHABLE_REDIS_URL)).toBe(false);
      expect(line.includes(FAKE_REDIS_TOKEN)).toBe(false);
    }
    expect(readyzBody.includes(UNREACHABLE_REDIS_URL)).toBe(false);
    expect(readyzBody.includes(FAKE_REDIS_TOKEN)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Default mode — zero-config, byte-identical existing flows            */
/* ------------------------------------------------------------------ */

describe("cost-guards seam — DEFAULT MODE when no cost env vars are set", () => {
  test("the mode log names memory (per-instance, honestly); the demo journey is unchanged; no cost warns", async () => {
    const world = runtimeWorld(baseEnv());

    const costModeLogged = world.logLines.some(
      (line) =>
        line.includes('"cost_guards_mode"') &&
        line.includes('"ledger":"memory"') &&
        line.includes('"meteredRedis":false'),
    );
    expect(costModeLogged).toBe(true);

    // The journey (the PROD-011b Fs proof): mint 200, whoami 200.
    const cookie = await mintDemoSession(world);
    const whoami = await world.handler(get("/v1/auth/whoami", { cookie }));
    expect(whoami.status).toBe(200);
    const body = (await whoami.json()) as Record<string, unknown>;
    expect(body).toEqual({
      ok: true,
      principal: expect.objectContaining({ kind: "demo" }),
    });

    // Zero-config honesty: not a single quota/rate-limit/upload warn line,
    // and the metered twin is NOT in the session path (fs mode).
    for (const needle of [
      "quota_",
      "rate_limited",
      "rate_limit_degraded",
      "payload_too_large",
      "quota_redis_commands_refused",
    ]) {
      expect(hasLine(world, needle)).toBe(false);
    }
    const sessionModeLogged = world.logLines.some(
      (line) => line.includes('"auth_session_store_mode"') && line.includes('"fs"'),
    );
    expect(sessionModeLogged).toBe(true);
  });

  test("malformed cost env values degrade to the documented defaults (never a crash, readiness stays honest)", async () => {
    const world = runtimeWorld(
      baseEnv({
        AISE_QUOTA_REDIS_COMMANDS: "banana",
        AISE_QUOTA_R2_BYTES: "-5",
        AISE_QUOTA_R2_OBJECTS: "1e6",
        AISE_QUOTA_THRESHOLD_PERCENT: "over-nine-thousand",
        AISE_RATELIMIT_WINDOW_SECONDS: "soon",
        AISE_RATELIMIT_MAX: "lots",
        AISE_RATELIMIT_GLOBAL_MAX: "all-of-them",
        AISE_MAX_UPLOAD_BYTES: "10MB",
      }),
    );
    // The journey still works.
    const cookie = await mintDemoSession(world);
    const whoami = await world.handler(get("/v1/auth/whoami", { cookie }));
    expect(whoami.status).toBe(200);

    // /readyz carries the DEFAULTS (the conservative documented posture).
    const readyz = await world.handler(get("/readyz"));
    expect(readyz.status).toBe(200);
    const body = (await readyz.json()) as {
      ok: boolean;
      cost: {
        ledger: string;
        thresholdPercent: number;
        meters: { resource: string; cap: number; used: number; status: string }[];
        rateLimit: { windowSeconds: number; maxPerPrincipal: number; maxGlobal: number };
        maxUploadBytes: number;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.cost.ledger).toBe("memory");
    expect(body.cost.thresholdPercent).toBe(80);
    expect(body.cost.rateLimit).toEqual({ windowSeconds: 60, maxPerPrincipal: 60, maxGlobal: 600 });
    expect(body.cost.maxUploadBytes).toBe(10_485_760);
    const caps = new Map(body.cost.meters.map((meter) => [meter.resource, meter.cap]));
    expect(caps.get("redis_commands")).toBe(400_000);
    expect(caps.get("r2_storage_bytes")).toBe(8_589_934_592);
    expect(caps.get("r2_objects")).toBe(100_000);
    for (const meter of body.cost.meters) {
      expect(meter.used).toBe(0);
      expect(meter.status).toBe("ok");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Half-configured — the cost family refuses to guess, without nagging  */
/* ------------------------------------------------------------------ */

describe("cost-guards seam — HALF-CONFIGURED Upstash pair", () => {
  test("URL without token: the memory twin, the session seam's warn, the journey works", async () => {
    const world = runtimeWorld(baseEnv({ AISE_REDIS_REST_URL: UNREACHABLE_REDIS_URL }));

    // The session-store seam owns the half-configured warning…
    expect(hasLine(world, "auth_session_store_redis_group_half_configured")).toBe(true);
    // …the cost family takes the memory twin with its honest mode line…
    const costModeLogged = world.logLines.some(
      (line) =>
        line.includes('"cost_guards_mode"') &&
        line.includes('"ledger":"memory"') &&
        line.includes('"meteredRedis":false'),
    );
    expect(costModeLogged).toBe(true);
    // …and does NOT duplicate the half-configured nagging (one warn owner).
    const duplicated = world.logLines.some(
      (line) => line.includes("cost_guards") && line.includes("half_configured"),
    );
    expect(duplicated).toBe(false);

    const cookie = await mintDemoSession(world);
    const whoami = await world.handler(get("/v1/auth/whoami", { cookie }));
    expect(whoami.status).toBe(200);
  });

  test("token without URL: same memory twin; the token value never appears in any log line", async () => {
    const world = runtimeWorld(baseEnv({ AISE_REDIS_REST_TOKEN: FAKE_REDIS_TOKEN }));

    expect(hasLine(world, "auth_session_store_redis_group_half_configured")).toBe(true);
    const costModeLogged = world.logLines.some(
      (line) =>
        line.includes('"cost_guards_mode"') &&
        line.includes('"ledger":"memory"') &&
        line.includes('"meteredRedis":false'),
    );
    expect(costModeLogged).toBe(true);

    const cookie = await mintDemoSession(world);
    const whoami = await world.handler(get("/v1/auth/whoami", { cookie }));
    expect(whoami.status).toBe(200);
    for (const line of world.logLines) {
      expect(line.includes(FAKE_REDIS_TOKEN)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Guard order — auth first, the limiter between auth and the core      */
/* ------------------------------------------------------------------ */

describe("cost-guards seam — the limiter sits between auth and the core", () => {
  test("an anonymous flood of expensive POSTs is answered by AUTH (401), never by the limiter", async () => {
    const world = runtimeWorld(
      baseEnv({ AISE_RATELIMIT_MAX: "2", AISE_RATELIMIT_GLOBAL_MAX: "3" }),
    );
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await world.handler(
        post("/v1/capture/sync", { requestId: `anon-${attempt}`, body: '{"batch":{}}' }),
      );
      // Unscoped writes need a session — the auth layer refuses BEFORE
      // the guard is ever consulted (the layering pin).
      expect(response.status).toBe(401);
    }
    // And the limiter never ran: no warn, no counted state.
    expect(hasLine(world, '"rate_limited"')).toBe(false);
    expect(hasLine(world, "rate_limit_degraded")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The 429 contract through the pipeline                                */
/* ------------------------------------------------------------------ */

describe("cost-guards seam — the typed 429 on an expensive route", () => {
  test("a minted principal hammering /v1/capture/sync: pass, pass, then the typed 429 with observable headers", async () => {
    const world = runtimeWorld(
      baseEnv({ AISE_RATELIMIT_MAX: "2", AISE_RATELIMIT_GLOBAL_MAX: "100" }),
    );
    const cookie = await mintDemoSession(world);

    const first = await world.handler(
      post("/v1/capture/sync", { headers: { cookie }, requestId: "sync-1", body: '{"batch":{}}' }),
    );
    expect(first.status).not.toBe(429);
    const second = await world.handler(
      post("/v1/capture/sync", { headers: { cookie }, requestId: "sync-2", body: '{"batch":{}}' }),
    );
    expect(second.status).not.toBe(429);

    const refused = await world.handler(
      post("/v1/capture/sync", { headers: { cookie }, requestId: "sync-3", body: '{"batch":{}}' }),
    );
    expect(refused.status).toBe(429);
    // The EXISTING stable error envelope — no new error shape.
    const body = (await refused.json()) as { error: { code: string; message: string; requestId: string } };
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.requestId).toBe("sync-3");
    expect(body.error.message).toContain("limit 2 per 60s window");
    // The observable headers.
    expect(refused.headers.get("x-ratelimit-limit")).toBe("2");
    expect(refused.headers.get("x-ratelimit-remaining")).toBe("0");
    const reset = refused.headers.get("x-ratelimit-reset");
    expect(reset).not.toBeNull();
    expect(Number(reset!)).toBeGreaterThanOrEqual(1);
    expect(refused.headers.get("retry-after")).toBe(reset);
    // The structured warn (digest principal label, numbers only).
    const warnLine = world.logLines.find((line) => line.includes('"rate_limited"'));
    expect(warnLine).toBeDefined();
    expect(JSON.parse(warnLine!)).toMatchObject({
      requestId: "sync-3",
      route: "capture-sync",
      bound: "principal",
      limit: 2,
    });
    // The cookie VALUE (a credential) is in no log line.
    for (const line of world.logLines) {
      expect(line.includes(cookie)).toBe(false);
    }

    // A NORMAL route is never bounded (the route set is data): the same
    // principal may keep making light CRUD calls.
    for (let attempt = 0; attempt < 5; attempt++) {
      const cases = await world.handler(
        post("/v1/cases", { headers: { cookie }, requestId: `case-${attempt}`, body: '{"title":"seam"}' }),
      );
      expect(cases.status).not.toBe(429);
      expect(cases.status).not.toBe(413);
    }
    expect(hasLine(world, '"rate_limited"')).toBe(true); // exactly the one above
  });
});

/* ------------------------------------------------------------------ */
/* The 413 contract through the pipeline                                */
/* ------------------------------------------------------------------ */

describe("cost-guards seam — the typed 413 upload cap on a previously-uncapped route", () => {
  test("an over-cap POST /v1/boq/imports is refused before the body is buffered; an under-cap body passes", async () => {
    const world = runtimeWorld(baseEnv({ AISE_MAX_UPLOAD_BYTES: "16" }));
    const cookie = await mintDemoSession(world);

    // Over-cap (content-length 32 > 16): the typed 413 stable envelope.
    const refused = await world.handler(
      new Request("https://api.aise.example/v1/boq/imports", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "content-length": "32",
          cookie,
          "x-request-id": "boq-over",
        },
        body: "x".repeat(32),
      }),
    );
    expect(refused.status).toBe(413);
    const body = (await refused.json()) as { error: { code: string; message: string; requestId: string } };
    expect(body.error.code).toBe("payload_too_large");
    expect(body.error.requestId).toBe("boq-over");
    expect(body.error.message).toContain("cap of 16 bytes");
    expect(body.error.message).toContain("AISE_MAX_UPLOAD_BYTES");

    // Under-cap (8 bytes): the cap passes the request to the core (which
    // answers with its OWN contract — anything but 413/429 here).
    const passed = await world.handler(
      new Request("https://api.aise.example/v1/boq/imports", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          cookie,
          "x-request-id": "boq-under",
        },
        body: "tinydata",
      }),
    );
    expect(passed.status).not.toBe(413);
    expect(passed.status).not.toBe(429);
  });
});
