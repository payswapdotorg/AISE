/**
 * The runtime handler contract (runtime/entry.ts) — PROD-003.
 *
 * The ONE deployable contract: through the runtime pipeline (CORS layer →
 * routing core → readiness augmentation → error envelope) the deployed API
 * serves the same routes with the same shapes as the local `bun run start`
 * adapter. These tests prove the contract end-to-end at the seam level:
 *
 *   - /healthz is LIVENESS ONLY (no secrets, no providers, no config);
 *   - /readyz is config validity + per-optional-provider statuses;
 *   - every error response is the documented envelope
 *     {error:{code,message,requestId}} (404/405/500/503 through the seam);
 *   - CORS is same-origin by default with an explicit opt-in allowlist;
 *   - the tmp-fs data-dir default and the serverless boot-honesty
 *     discipline behave as documented;
 *   - no log line and no response body ever carries env values (the
 *     secret-leak scan).
 *
 * Determinism: fixed env records, fixed request ids, scratch data dirs
 * (mkdtemp, always removed), no network, no clock dependence in assertions.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { createLogger, type Logger } from "../lib/log";
import type { EnvRecord, EnvSource } from "../lib/config";
import { createRuntimeHandler, RuntimeBootError } from "./entry";

const scratchDirs: string[] = [];

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "aise-runtime-test-"));
  scratchDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A logger capturing every emitted line (for the secret-leak scans). */
function capturingLogger(lines: string[]): Logger {
  return createLogger("debug", (line) => {
    lines.push(line);
  });
}

function handlerFor(
  env: EnvRecord,
  logger?: Logger,
): { handler: (request: Request) => Promise<Response>; envSource: EnvSource } {
  const envSource: EnvSource = () => env;
  return { handler: createRuntimeHandler({ envSource, logger }), envSource };
}

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://api.aise.example${path}`, { method: "GET", headers });
}

const SECRET = "ws-super-secret-value-DO-NOT-LEAK";

function baseEnv(overrides: EnvRecord = {}): EnvRecord {
  return {
    HOST: "127.0.0.1",
    PORT: "8080",
    LOG_LEVEL: "debug",
    AISE_DATA_DIR: scratchDir(),
    ...overrides,
  };
}

describe("GET /healthz — liveness only", () => {
  test("200 with the service identity and package version; nothing else", async () => {
    const { handler } = handlerFor(baseEnv());
    const response = await handler(get("/healthz", { "x-request-id": "health-1" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-request-id")).toBe("health-1");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: true, service: "aise-api", version: pkg.version });
    // Liveness ONLY: no config issues, no provider statuses, no env contents.
    expect(body["issues"]).toBeUndefined();
    expect(body["providers"]).toBeUndefined();
  });

  test("byte-identical responses for identical requests (fixed request id)", async () => {
    const { handler } = handlerFor(baseEnv());
    const first = await handler(get("/healthz", { "x-request-id": "health-2" }));
    const second = await handler(get("/healthz", { "x-request-id": "health-2" }));
    expect(await first.text()).toBe(await second.text());
  });

  test("non-GET → 405 in the documented envelope with the allow header", async () => {
    const { handler } = handlerFor(baseEnv());
    const response = await handler(
      new Request("https://api.aise.example/healthz", {
        method: "POST",
        headers: { "x-request-id": "health-3" },
      }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(await response.json()).toEqual({
      error: { code: "method_not_allowed", message: "Method not allowed.", requestId: "health-3" },
    });
  });
});

describe("GET /readyz — config validity + provider statuses", () => {
  test("valid config → 200 with per-optional-provider statuses", async () => {
    const { handler } = handlerFor(baseEnv());
    const response = await handler(get("/readyz", { "x-request-id": "ready-1" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      providers: { worldsculpt: "disabled" },
      // PROD-006: which artifact backend is actually serving (no R2 group →
      // the honest local-fs twin).
      artifacts: { backend: "local-fs", status: "available" },
      // PROD-013: the cost-guards section is ALWAYS additive on /readyz
      // (like the artifacts key) — the zero-config memory ledger, fresh
      // counters, and the documented conservative defaults. windowId is
      // the current UTC month (the window the numbers belong to).
      cost: {
        ledger: "memory",
        windowId: expect.stringMatching(/^\d{4}-\d{2}$/),
        thresholdPercent: 80,
        meters: [
          { resource: "redis_commands", metered: false, used: 0, cap: 400_000, remaining: 400_000, remainingPercent: 100, status: "ok" },
          { resource: "r2_storage_bytes", metered: false, used: 0, cap: 8_589_934_592, remaining: 8_589_934_592, remainingPercent: 100, status: "ok" },
          { resource: "r2_objects", metered: false, used: 0, cap: 100_000, remaining: 100_000, remainingPercent: 100, status: "ok" },
        ],
        rateLimit: { windowSeconds: 60, maxPerPrincipal: 60, maxGlobal: 600 },
        maxUploadBytes: 10_485_760,
        status: "ok",
      },
    });
  });

  test("configured provider → available; the credential value NEVER appears", async () => {
    const { handler } = handlerFor(baseEnv({ WORLDSCULPT_API_KEY: SECRET }));
    const response = await handler(get("/readyz", { "x-request-id": "ready-2" }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"worldsculpt":"available"');
    expect(text).not.toContain(SECRET);
  });

  test("present-but-empty provider credential → unavailable (misconfigured, not down-ready)", async () => {
    const { handler } = handlerFor(baseEnv({ WORLDSCULPT_API_KEY: "" }));
    const response = await handler(get("/readyz"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["providers"]).toEqual({ worldsculpt: "unavailable" });
    expect(body["artifacts"]).toEqual({ backend: "local-fs", status: "available" });
    // PROD-013: the cost section is orthogonal to provider credentials —
    // the same fresh zero-config ledger view as the valid-config test.
    expect(body["cost"]).toEqual({
      ledger: "memory",
      windowId: expect.stringMatching(/^\d{4}-\d{2}$/),
      thresholdPercent: 80,
      meters: [
        { resource: "redis_commands", metered: false, used: 0, cap: 400_000, remaining: 400_000, remainingPercent: 100, status: "ok" },
        { resource: "r2_storage_bytes", metered: false, used: 0, cap: 8_589_934_592, remaining: 8_589_934_592, remainingPercent: 100, status: "ok" },
        { resource: "r2_objects", metered: false, used: 0, cap: 100_000, remaining: 100_000, remainingPercent: 100, status: "ok" },
      ],
      rateLimit: { windowSeconds: 60, maxPerPrincipal: 60, maxGlobal: 600 },
      maxUploadBytes: 10_485_760,
      status: "ok",
    });
  });

  test("invalid config → 503 with the error envelope + issues + provider statuses", async () => {
    const { handler } = handlerFor(baseEnv({ PORT: "not-a-port", LOG_LEVEL: "verbose" }));
    const response = await handler(get("/readyz", { "x-request-id": "ready-3" }));
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      error: { code: string; message: string; requestId: string };
      issues: string[];
      providers: Record<string, string>;
    };
    expect(body.error).toEqual({
      code: "not_ready",
      message: "Service configuration is not ready.",
      requestId: "ready-3",
    });
    expect(body.issues.join("\n")).toContain("PORT: expected an integer between 1 and 65535");
    expect(body.issues.join("\n")).toContain("LOG_LEVEL: expected one of debug|info|warn|error");
    expect(body.issues.join("\n")).not.toContain("not-a-port");
    expect(body.providers).toEqual({ worldsculpt: "disabled" });
  });

  test("non-GET → 405 envelope (the augmentation only touches GET answers)", async () => {
    const { handler } = handlerFor(baseEnv());
    const response = await handler(
      new Request("https://api.aise.example/readyz", { method: "DELETE" }),
    );
    expect(response.status).toBe(405);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("method_not_allowed");
  });
});

describe("the stable error envelope through the seam", () => {
  test("unknown path → 404 envelope", async () => {
    const { handler } = handlerFor(baseEnv());
    const response = await handler(get("/no/such/route", { "x-request-id": "err-1" }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Not found.", requestId: "err-1" },
    });
  });

  test("domain error bodies translate losslessly (code + extras preserved)", async () => {
    const { handler } = handlerFor(baseEnv());
    const response = await handler(
      get("/v1/capture/sessions/never-synced", { "x-request-id": "err-2" }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "session_not_found",
        message: "Session not found.",
        requestId: "err-2",
      },
    });
  });

  test("2xx bodies are NEVER enveloped (ok:true discipline preserved)", async () => {
    const { handler } = handlerFor(baseEnv());
    const response = await handler(get("/v1/sdk", { "x-request-id": "ok-1" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; apiVersion: string; error?: unknown };
    expect(body.ok).toBe(true);
    expect(typeof body.apiVersion).toBe("string");
    expect(body["error"]).toBeUndefined();
  });
});

describe("/v1 delegation through the seam", () => {
  test("GET /v1/gaps serves the analysis list route (lazy store under the scratch data dir)", async () => {
    const { handler } = handlerFor(baseEnv());
    const response = await handler(get("/v1/gaps", { "x-request-id": "gaps-1" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
  });

  test("GET /v1/sdk serves the versioned discovery document", async () => {
    const { handler } = handlerFor(baseEnv());
    const response = await handler(get("/v1/sdk/contract", { "x-request-id": "sdk-1" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; apiVersion: string };
    expect(body.ok).toBe(true);
    expect(typeof body.apiVersion).toBe("string");
  });
});

describe("CORS through the runtime pipeline", () => {
  test("same-origin by default: cross-origin requests get NO CORS headers without the opt-in", async () => {
    const { handler } = handlerFor(baseEnv());
    const response = await handler(get("/healthz", { origin: "http://localhost:5173" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("AISE_CORS_ORIGINS opt-in: allowlisted origin is echoed on answers AND preflights", async () => {
    const { handler } = handlerFor(baseEnv({ AISE_CORS_ORIGINS: "http://localhost:5173" }));
    const response = await handler(get("/healthz", { origin: "http://localhost:5173" }));
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");

    const preflight = await handler(
      new Request("https://api.aise.example/v1/capture/sync", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, POST, HEAD, OPTIONS");
  });

  test("never echoes arbitrary origins (deny = no CORS headers, still a valid response)", async () => {
    const { handler } = handlerFor(baseEnv({ AISE_CORS_ORIGINS: "http://localhost:5173" }));
    const response = await handler(get("/healthz", { origin: "https://evil.example" }));
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const preflight = await handler(
      new Request("https://api.aise.example/v1/gaps", {
        method: "OPTIONS",
        headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("tmp-fs data-dir resolution at the handler level", () => {
  test("serverless mode with an explicit data dir roots the capture store there", async () => {
    const dataDir = scratchDir();
    const { handler } = handlerFor(baseEnv({ AISE_SERVERLESS: "1", AISE_DATA_DIR: dataDir }));
    const response = await handler(get("/readyz"));
    expect(response.status).toBe(200);
    // The eager capture store created its tree under the scratch dir.
    expect(statSync(join(dataDir, "content")).isDirectory()).toBe(true);
    expect(statSync(join(dataDir, "sessions")).isDirectory()).toBe(true);
    expect(statSync(join(dataDir, "idempotency")).isDirectory()).toBe(true);
  });
});

describe("serverless boot honesty", () => {
  function unwritableDataDir(): string {
    // A REGULAR FILE at the data-dir path: mkdirSync under it must fail
    // (deterministic on every POSIX/Windows filesystem).
    const dir = scratchDir();
    const filePath = join(dir, "not-a-directory");
    writeFileSync(filePath, "occupied");
    return filePath;
  }

  test("an unwritable data dir degrades honestly: healthz alive, readyz honest, capture routes fail loudly", async () => {
    const lines: string[] = [];
    const { handler } = handlerFor(
      baseEnv({ AISE_DATA_DIR: unwritableDataDir() }),
      capturingLogger(lines),
    );
    // The function still boots and proves liveness:
    const health = await handler(get("/healthz"));
    expect(health.status).toBe(200);
    // Config itself is valid, so readiness is ok (the fs failure is a
    // per-concern degradation, reported in the logs, never a silent lie):
    const ready = await handler(get("/readyz"));
    expect(ready.status).toBe(200);
    // Capture routes fail LOUDLY (500 envelope) instead of writing somewhere
    // vanishing:
    const captureRead = await handler(get("/v1/capture/sessions/anything"));
    expect(captureRead.status).toBe(500);
    const body = (await captureRead.json()) as { error: { code: string } };
    expect(body.error.code).toBe("internal_error");
    // The construction-time degradation was logged with the reason:
    expect(lines.join("\n")).toContain("capture store initialization failed");
  });

  test("failFast: an unwritable data dir refuses to boot (the LOCAL adapter's discipline)", () => {
    expect(() =>
      createRuntimeHandler({
        envSource: () => baseEnv({ AISE_DATA_DIR: unwritableDataDir() }),
        failFast: true,
      }),
    ).toThrow(RuntimeBootError);
  });

  test("an invalid environment does not crash the handler at construction", () => {
    // Bad PORT: the function still constructs (Vercel cold start must serve
    // honest /healthz + /readyz, not opaque 500s).
    const { handler } = handlerFor(baseEnv({ PORT: "not-a-port" }));
    expect(typeof handler).toBe("function");
  });
});

describe("secret-leak scan (logs and bodies)", () => {
  test("no log line and no response body carries env values", async () => {
    const lines: string[] = [];
    const env = baseEnv({
      WORLDSCULPT_API_KEY: SECRET,
      AISE_CORS_ORIGINS: "http://localhost:5173",
      HOST: "host-with-secret-8f2c",
      AISE_DATA_DIR: join(scratchDir(), "leak-scan"),
    });
    const { handler } = handlerFor(env, capturingLogger(lines));

    const responses: Response[] = [];
    responses.push(await handler(get("/healthz", { "x-request-id": "scan-1" })));
    responses.push(await handler(get("/readyz", { "x-request-id": "scan-2" })));
    responses.push(await handler(get("/nope", { "x-request-id": "scan-3" })));
    responses.push(
      await handler(
        new Request("https://api.aise.example/healthz", {
          method: "POST",
          headers: { "x-request-id": "scan-4" },
        }),
      ),
    );
    responses.push(
      await handler(
        new Request("https://api.aise.example/v1/capture/sync", {
          method: "OPTIONS",
          headers: {
            origin: "http://localhost:5173",
            "access-control-request-method": "POST",
          },
        }),
      ),
    );
    responses.push(await handler(get("/v1/capture/sessions/never", { "x-request-id": "scan-5" })));

    const bodies: string[] = [];
    for (const response of responses) {
      bodies.push(await response.text());
    }
    const everything = [...bodies, ...lines].join("\n");
    expect(everything).not.toContain(SECRET);
    expect(everything).not.toContain("host-with-secret-8f2c");
  });
});
