import { describe, expect, test } from "bun:test";
import pkg from "../package.json" with { type: "json" };
import { createLogger } from "./lib/log";
import { createRequestHandler, isUuid, type HandlerOptions } from "./server";
import type { EnvRecord } from "./lib/config";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

function handlerFor(env: EnvRecord): (request: Request) => Promise<Response> {
  const options: HandlerOptions = {
    envSource: () => env,
    version: pkg.version,
    logger: quietLogger,
  };
  return createRequestHandler(options);
}

function get(path: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers });
}

describe("GET /healthz", () => {
  test("returns ok with the service identity and package version", async () => {
    const response = await handlerFor(validEnv)(get("/healthz"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await response.json()).toEqual({
      ok: true,
      service: "aise-api",
      version: pkg.version,
    });
  });

  test("echoes a provided correlation id in x-request-id", async () => {
    const response = await handlerFor(validEnv)(
      get("/healthz", { "x-request-id": "corr-123" }),
    );
    expect(response.headers.get("x-request-id")).toBe("corr-123");
  });

  test("generates a UUID correlation id when none is provided", async () => {
    const response = await handlerFor(validEnv)(get("/healthz"));
    const requestId = response.headers.get("x-request-id");
    expect(typeof requestId).toBe("string");
    expect(isUuid(requestId!)).toBe(true);
  });

  test("rejects non-GET methods with 405", async () => {
    const response = await handlerFor(validEnv)(
      new Request("http://localhost/healthz", { method: "POST" }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });
});

describe("GET /readyz", () => {
  test("returns ok when the environment is valid", async () => {
    const response = await handlerFor(validEnv)(get("/readyz"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("returns 503 with issues when the environment is invalid", async () => {
    const response = await handlerFor({ PORT: "abc", LOG_LEVEL: "verbose" })(get("/readyz"));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { ok: boolean; issues: string[] };
    expect(body.ok).toBe(false);
    expect(body.issues.join("\n")).toContain("PORT");
    expect(body.issues.join("\n")).toContain("LOG_LEVEL");
  });
});

describe("routing", () => {
  test("returns 404 for unknown paths", async () => {
    const response = await handlerFor(validEnv)(get("/nope"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "not_found" });
  });
});

describe("end-to-end over Bun.serve (loopback)", () => {
  test("serves /healthz through a real socket", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: handlerFor(validEnv),
    });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/healthz`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        service: "aise-api",
        version: pkg.version,
      });
      expect(response.headers.get("x-request-id")).toBeTruthy();
    } finally {
      server.stop(true);
    }
  });
});
