/**
 * PROD-011b — the runtime entry's SESSION-STORE SEAM tests (entry.ts × auth/store-redis.ts).
 *
 * These prove the env-gated composition contract of the deployed-session
 * stability seam, through the FULL production pipeline (no store is
 * constructed directly — the seam is the point):
 *
 *   - REDIS SELECTED (AISE_REDIS_REST_URL + AISE_REDIS_REST_TOKEN both
 *     present) the RedisSessionStore is REALLY in the auth path: the mode
 *     log says redis, and — the decisive wiring proof without any real
 *     Upstash dependency — a session minted against an UNREACHABLE endpoint
 *     (the reserved .invalid TLD) fails closed exactly as the store's
 *     contract promises: the mint still succeeds (200 + cookie; put's
 *     typed failure is logged data), whoami then 401s, and the structured
 *     redis_session_store_*_failed warn lines exist. The Fs twin would
 *     have answered whoami 200 — this is the negative space that proves
 *     the twin swap happened;
 *   - FS UNCHANGED (both absent) the mode log says fs and the demo cookie
 *     round-trips 200 — byte-identical to the pre-seam behavior;
 *   - HALF-CONFIGURED (exactly one of the pair set) the seam refuses to
 *     guess: the documented warn fires, the mode log says fs, the demo
 *     journey still works;
 *   - the secret-leak discipline holds at the seam: the URL and the token
 *     appear in NO log line and NO response body.
 *
 * Determinism: fixed env records, fixed request ids, scratch data dirs
 * (mkdtemp, always removed). The unreachable endpoint uses RFC-2606's
 * reserved .invalid TLD — the DNS failure is the deterministic "Redis is
 * down" stand-in for the fail-closed proof.
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
  const dir = mkdtempSync(join(tmpdir(), "aise-runtime-session-redis-test-"));
  scratchDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const AUTH_SECRET = "runtime-session-redis-test-secret-DO-NOT-LEAK";
/** RFC 2606 reserved — guaranteed non-resolvable, never a real endpoint. */
const UNREACHABLE_REDIS_URL = "https://aise-session-seam-test.invalid";
const FAKE_REDIS_TOKEN = "aise-session-seam-test-token-DO-NOT-LEAK";

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

function post(path: string, body: unknown): Request {
  return new Request(`https://api.aise.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": path.replace(/[^a-z0-9]/gi, "-").slice(0, 30),
    },
    body: JSON.stringify(body),
  });
}

function cookieOf(response: Response): string | null {
  return response.headers.get("set-cookie");
}

/* ------------------------------------------------------------------ */
/* Redis selected — the twin is really in the path                      */
/* ------------------------------------------------------------------ */

describe("session-store seam — REDIS selected when the Upstash env group is complete", () => {
  test("the mode log names redis; a mint against an unreachable store fails CLOSED per the contract", async () => {
    const world = runtimeWorld(
      baseEnv({
        AISE_REDIS_REST_URL: UNREACHABLE_REDIS_URL,
        AISE_REDIS_REST_TOKEN: FAKE_REDIS_TOKEN,
      }),
    );

    // The mint itself succeeds: put()'s typed failure is logged data, the
    // cookie is handed out (the honest contract: durable-later, not
    // mint-refused).
    const mint = await world.handler(post("/v1/auth/demo", {}));
    expect(mint.status).toBe(200);
    const cookie = cookieOf(mint);
    expect(cookie).not.toBeNull();

    // whoami with that cookie fails closed — the Redis get failed typed,
    // the store answered null, the request is unauthenticated. The Fs twin
    // would have answered 200 here: this is the wiring proof.
    const whoami = await world.handler(get("/v1/auth/whoami", { cookie: cookie ?? "" }));
    expect(whoami.status).toBe(401);

    // The structured evidence: the mode line + the typed store failures.
    const modeLogged = world.logLines.some((line) => line.includes('"auth_session_store_mode"') && line.includes('"redis"'));
    expect(modeLogged).toBe(true);
    const storeFailureLogged = world.logLines.some((line) =>
      line.includes("redis_session_store_put_failed") || line.includes("redis_session_store_put_index_failed"),
    );
    expect(storeFailureLogged).toBe(true);
    const getFailureLogged = world.logLines.some((line) =>
      line.includes("redis_session_store_get_failed"),
    );
    expect(getFailureLogged).toBe(true);
  });

  test("the secret-leak discipline: the URL and token appear in no log line and no response body", async () => {
    const world = runtimeWorld(
      baseEnv({
        AISE_REDIS_REST_URL: UNREACHABLE_REDIS_URL,
        AISE_REDIS_REST_TOKEN: FAKE_REDIS_TOKEN,
      }),
    );
    const mint = await world.handler(post("/v1/auth/demo", {}));
    expect(mint.status).toBe(200);
    const whoami = await world.handler(
      get("/v1/auth/whoami", { cookie: cookieOf(mint) ?? "" }),
    );
    expect(whoami.status).toBe(401);
    const mintBody = JSON.stringify(await mint.json());
    const whoamiBody = JSON.stringify(await whoami.json());

    for (const line of world.logLines) {
      expect(line.includes(UNREACHABLE_REDIS_URL)).toBe(false);
      expect(line.includes(FAKE_REDIS_TOKEN)).toBe(false);
    }
    expect(mintBody.includes(UNREACHABLE_REDIS_URL)).toBe(false);
    expect(mintBody.includes(FAKE_REDIS_TOKEN)).toBe(false);
    expect(whoamiBody.includes(UNREACHABLE_REDIS_URL)).toBe(false);
    expect(whoamiBody.includes(FAKE_REDIS_TOKEN)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Fs unchanged — the default path                                      */
/* ------------------------------------------------------------------ */

describe("session-store seam — FS unchanged when the Upstash env group is absent", () => {
  test("the mode log names fs and the demo cookie round-trips whoami 200", async () => {
    const world = runtimeWorld(baseEnv());
    const mint = await world.handler(post("/v1/auth/demo", {}));
    expect(mint.status).toBe(200);
    const cookie = cookieOf(mint);
    expect(cookie).not.toBeNull();

    const whoami = await world.handler(get("/v1/auth/whoami", { cookie: cookie ?? "" }));
    expect(whoami.status).toBe(200);
    const body = (await whoami.json()) as Record<string, unknown>;
    expect(body).toEqual({
      ok: true,
      principal: expect.objectContaining({ kind: "demo" }),
    });

    const modeLogged = world.logLines.some(
      (line) => line.includes('"auth_session_store_mode"') && line.includes('"fs"'),
    );
    expect(modeLogged).toBe(true);
    const redisWarned = world.logLines.some((line) =>
      line.includes("redis_session_store") || line.includes("half_configured"),
    );
    expect(redisWarned).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Half-configured — the seam refuses to guess                          */
/* ------------------------------------------------------------------ */

describe("session-store seam — HALF-CONFIGURED refuses to guess", () => {
  test("URL without token: the documented warn, fs mode, the demo journey works", async () => {
    const world = runtimeWorld(baseEnv({ AISE_REDIS_REST_URL: UNREACHABLE_REDIS_URL }));
    const mint = await world.handler(post("/v1/auth/demo", {}));
    expect(mint.status).toBe(200);
    const whoami = await world.handler(
      get("/v1/auth/whoami", { cookie: cookieOf(mint) ?? "" }),
    );
    expect(whoami.status).toBe(200);

    const warned = world.logLines.some((line) =>
      line.includes("auth_session_store_redis_group_half_configured"),
    );
    expect(warned).toBe(true);
    const modeLogged = world.logLines.some(
      (line) => line.includes('"auth_session_store_mode"') && line.includes('"fs"'),
    );
    expect(modeLogged).toBe(true);
  });

  test("token without URL: same refusal, names only (no token value in any log line)", async () => {
    const world = runtimeWorld(baseEnv({ AISE_REDIS_REST_TOKEN: FAKE_REDIS_TOKEN }));
    const mint = await world.handler(post("/v1/auth/demo", {}));
    expect(mint.status).toBe(200);
    const whoami = await world.handler(
      get("/v1/auth/whoami", { cookie: cookieOf(mint) ?? "" }),
    );
    expect(whoami.status).toBe(200);

    const warned = world.logLines.some((line) =>
      line.includes("auth_session_store_redis_group_half_configured"),
    );
    expect(warned).toBe(true);
    for (const line of world.logLines) {
      expect(line.includes(FAKE_REDIS_TOKEN)).toBe(false);
    }
  });
});
