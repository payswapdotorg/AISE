import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "./load-config.js";
import { loadEnvFileIfPresent } from "./index.js";

const SMOKE_ENV_VAR = "AISE_TEST_ENV_FILE_MARKER";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  delete process.env[SMOKE_ENV_VAR];
});

describe("loadConfig", () => {
  it("fails closed when the required AISE_ENV variable is missing", () => {
    const result = loadConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some((e) => e.includes("AISE_ENV"))).toBe(true);
    }
  });

  it("treats an empty or whitespace AISE_ENV as missing", () => {
    for (const value of ["", "   "]) {
      const result = loadConfig({ AISE_ENV: value });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("AISE_ENV"))).toBe(true);
      }
    }
  });

  it("rejects an invalid AISE_ENV value and lists the allowed values", () => {
    const result = loadConfig({ AISE_ENV: "staging" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const message = result.errors.find((e) => e.includes("AISE_ENV"));
      expect(message).toBeDefined();
      expect(message).toContain("development");
      expect(message).toContain("test");
      expect(message).toContain("production");
    }
  });

  it("accepts a minimal valid environment and applies documented defaults", () => {
    const result = loadConfig({ AISE_ENV: "development" });
    expect(result).toEqual({
      ok: true,
      config: {
        env: "development",
        logLevel: "info",
        api: { host: "127.0.0.1", port: 8080 },
        worker: { pollIntervalMs: 1000 },
      },
    });
  });

  it("applies explicit overrides for every optional variable", () => {
    const result = loadConfig({
      AISE_ENV: "production",
      AISE_LOG_LEVEL: "debug",
      AISE_API_HOST: "0.0.0.0",
      AISE_API_PORT: "9000",
      AISE_WORKER_POLL_INTERVAL_MS: "250",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.env).toBe("production");
      expect(result.config.logLevel).toBe("debug");
      expect(result.config.api.host).toBe("0.0.0.0");
      expect(result.config.api.port).toBe(9000);
      expect(result.config.worker.pollIntervalMs).toBe(250);
    }
  });

  it("rejects non-numeric, zero and out-of-range ports", () => {
    for (const value of ["not-a-port", "0", "70000", "-1"]) {
      const result = loadConfig({ AISE_ENV: "test", AISE_API_PORT: value });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("AISE_API_PORT"))).toBe(true);
      }
    }
  });

  it("rejects an invalid log level", () => {
    const result = loadConfig({ AISE_ENV: "test", AISE_LOG_LEVEL: "verbose" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("AISE_LOG_LEVEL"))).toBe(true);
    }
  });

  it("rejects an out-of-range worker poll interval", () => {
    const result = loadConfig({
      AISE_ENV: "test",
      AISE_WORKER_POLL_INTERVAL_MS: "10",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("AISE_WORKER_POLL_INTERVAL_MS"))).toBe(true);
    }
  });

  it("reports every problem at once instead of failing on the first", () => {
    const result = loadConfig({
      AISE_ENV: "nope",
      AISE_LOG_LEVEL: "loud",
      AISE_API_PORT: "99999",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(3);
    }
  });

  it("ignores unrelated environment variables without failing", () => {
    const result = loadConfig({ AISE_ENV: "test", PATH: "/usr/bin", HOME: "/home" });
    expect(result.ok).toBe(true);
  });
});

describe("loadEnvFileIfPresent", () => {
  it("returns false for a non-existent env file without throwing", () => {
    const loaded = loadEnvFileIfPresent(
      path.join(tmpdir(), "aise--definitely-missing", "missing.env"),
    );
    expect(loaded).toBe(false);
  });

  it("loads values from an existing env file and returns true", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "aise-config-test-"));
    tempDirs.push(dir);
    const envFile = path.join(dir, ".env");
    writeFileSync(envFile, `${SMOKE_ENV_VAR}=1\n`, "utf8");

    delete process.env[SMOKE_ENV_VAR];
    const loaded = loadEnvFileIfPresent(envFile);
    expect(loaded).toBe(true);
    expect(process.env[SMOKE_ENV_VAR]).toBe("1");
  });
});
