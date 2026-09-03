import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AiseConfig } from "@aise/backend-config";
import { createLogger, type Logger } from "@aise/backend-logging";
import { createApiServer, type ApiServer } from "./server.js";

const config: AiseConfig = {
  env: "test",
  logLevel: "info",
  api: { host: "127.0.0.1", port: 0 },
  worker: { pollIntervalMs: 1000 },
};

const lines: string[] = [];
const logger: Logger = createLogger({
  level: config.logLevel,
  module: "api-test",
  sink: (line) => lines.push(line),
});

let api: ApiServer;
let baseUrl: string;

beforeAll(async () => {
  api = createApiServer({ config, logger });
  const address = await api.start();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await api.stop();
});

interface JsonRecord {
  msg?: string;
  [key: string]: unknown;
}

function logRecords(): JsonRecord[] {
  return lines.map((line) => JSON.parse(line) as JsonRecord);
}

describe("createApiServer", () => {
  it("serves GET /healthz with service identity, status and environment", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as {
      service: string;
      status: string;
      env: string;
      uptimeSec: number;
    };
    expect(body.service).toBe("api");
    expect(body.status).toBe("ok");
    expect(body.env).toBe("test");
    expect(typeof body.uptimeSec).toBe("number");
    expect(body.uptimeSec).toBeGreaterThanOrEqual(0);
  });

  it("serves GET /readyz", async () => {
    const response = await fetch(`${baseUrl}/readyz`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { service: string; status: string };
    expect(body.service).toBe("api");
    expect(body.status).toBe("ready");
  });

  it("returns a structured 404 for unknown paths", async () => {
    const response = await fetch(`${baseUrl}/definitely-not-a-route`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string; path: string };
    expect(body.error).toBe("not_found");
    expect(body.path).toBe("/definitely-not-a-route");
  });

  it("returns a structured 405 for non-GET methods on known routes", async () => {
    const response = await fetch(`${baseUrl}/healthz`, { method: "POST" });
    expect(response.status).toBe(405);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("method_not_allowed");
  });

  it("logs every request as a structured http.request record", async () => {
    const before = lines.length;
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    await nextTick();
    const records = logRecords().slice(before);
    const requestRecord = records.find((r) => r.msg === "http.request") as
      | { method?: string; path?: string; status?: number; durationMs?: number }
      | undefined;
    expect(requestRecord).toBeDefined();
    expect(requestRecord?.method).toBe("GET");
    expect(requestRecord?.path).toBe("/healthz");
    expect(requestRecord?.status).toBe(200);
    expect(typeof requestRecord?.durationMs).toBe("number");
  });

  it("stops accepting connections after stop() and resolves cleanly", async () => {
    const ephemeral: ApiServer = createApiServer({
      config: { ...config, api: { host: "127.0.0.1", port: 0 } },
      logger,
    });
    const address = await ephemeral.start();
    const alive = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    expect(alive.status).toBe(200);

    await ephemeral.stop();
    await expect(fetch(`http://127.0.0.1:${address.port}/healthz`)).rejects.toThrow();
  });
});

async function nextTick(): Promise<void> {
  // Let the server finish writing the log line before assertions read it.
  await new Promise((resolve) => setImmediate(resolve));
}
