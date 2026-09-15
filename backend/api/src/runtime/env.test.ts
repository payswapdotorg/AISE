/**
 * PROD-003 additive config semantics (lib/config.ts) — the production /
 * serverless mode variables, colocated with their runtime consumers.
 *
 * Determinism: pure validateEnv/resolveDataDir calls over fixed env records —
 * no clock, no randomness, no I/O, no process.env reads.
 */

import { describe, expect, test } from "bun:test";
import { loadConfig, resolveDataDir, validateEnv, type EnvRecord } from "../lib/config";

describe("AISE_SERVERLESS", () => {
  test("unset → serverless false; config otherwise identical to the historical shape", () => {
    const config = validateEnv({});
    expect(config.ok).toBe(true);
    if (config.ok) {
      expect(config.config.serverless).toBe(false);
      expect(config.config.corsOrigins).toEqual([]);
      // The historical defaults are untouched when the new variables are unset.
      expect(config.config.host).toBe("127.0.0.1");
      expect(config.config.port).toBe(8080);
      expect(config.config.logLevel).toBe("info");
      expect(config.config.dataDir).toBe("./data");
    }
  });

  test("1/true (case-insensitive) enable; 0/false disable", () => {
    for (const value of ["1", "true", "TRUE", "True"]) {
      const config = validateEnv({ AISE_SERVERLESS: value });
      expect(config.ok).toBe(true);
      if (config.ok) {
        expect(config.config.serverless).toBe(true);
      }
    }
    for (const value of ["0", "false", "FALSE"]) {
      const config = validateEnv({ AISE_SERVERLESS: value });
      expect(config.ok).toBe(true);
      if (config.ok) {
        expect(config.config.serverless).toBe(false);
      }
    }
  });

  test("junk (including present-but-empty) is a deterministic issue naming the variable, never the value", () => {
    for (const value of ["", "yes", "on ", "2"]) {
      const result = validateEnv({ AISE_SERVERLESS: value });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toEqual(["AISE_SERVERLESS: expected 1|true|0|false"]);
      }
    }
  });
});

describe("AISE_DATA_DIR in serverless mode (tmp-fs resolution)", () => {
  test("unset + serverless → /tmp/aise-data (Vercel's only writable directory)", () => {
    const config = validateEnv({ AISE_SERVERLESS: "1" });
    expect(config.ok).toBe(true);
    if (config.ok) {
      expect(config.config.dataDir).toBe("/tmp/aise-data");
    }
    expect(resolveDataDir({ AISE_SERVERLESS: "true" })).toBe("/tmp/aise-data");
  });

  test("unset + local → ./data (unchanged historical default)", () => {
    expect(resolveDataDir({})).toBe("./data");
  });

  test("explicit value wins verbatim in BOTH modes", () => {
    expect(resolveDataDir({ AISE_DATA_DIR: "/var/aise" })).toBe("/var/aise");
    expect(resolveDataDir({ AISE_SERVERLESS: "1", AISE_DATA_DIR: "/mnt/scratch" })).toBe(
      "/mnt/scratch",
    );
  });

  test("misconfigured value falls back to the MODE default (boot-honesty, not a crash)", () => {
    expect(resolveDataDir({ AISE_DATA_DIR: "" })).toBe("./data");
    expect(resolveDataDir({ AISE_SERVERLESS: "1", AISE_DATA_DIR: "  " })).toBe("/tmp/aise-data");
    // …and the misconfiguration is reported as an issue:
    const result = validateEnv({ AISE_SERVERLESS: "1", AISE_DATA_DIR: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain("AISE_DATA_DIR: expected a non-empty directory path");
    }
  });
});

describe("AISE_CORS_ORIGINS", () => {
  test("unset → empty allowlist (same-origin only)", () => {
    const config = validateEnv({});
    expect(config.ok).toBe(true);
    if (config.ok) {
      expect(config.config.corsOrigins).toEqual([]);
    }
  });

  test("comma list is trimmed, normalized and de-duplicated (first occurrence wins)", () => {
    const config = validateEnv({
      AISE_CORS_ORIGINS: "http://localhost:5173, https://AISE.Example.COM/, http://localhost:5173",
    });
    expect(config.ok).toBe(true);
    if (config.ok) {
      expect(config.config.corsOrigins).toEqual([
        "http://localhost:5173",
        "https://aise.example.com",
      ]);
    }
  });

  test("junk entries (non-origins, stray commas, paths, credentials) invalidate the WHOLE variable", () => {
    for (const value of [
      "",
      "not-an-origin",
      "ftp://example.com",
      "https://example.com/path",
      "https://user:pass@example.com",
      "http://localhost:5173,",
      "http://a.example,,http://b.example",
    ]) {
      const result = validateEnv({ AISE_CORS_ORIGINS: value });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toEqual([
          "AISE_CORS_ORIGINS: expected a comma-separated list of absolute http(s) origins (https://host[:port])",
        ]);
      }
    }
  });

  test("the issue never echoes the offending value", () => {
    // A value WITH A PATH is invalid as an allowlist entry; the secret-looking
    // host must never appear in the reported issue.
    const result = validateEnv({ AISE_CORS_ORIGINS: "https://secret-value.example/leak" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join("\n")).not.toContain("secret-value");
    }
  });

  test("loadConfig exposes the same production fields", () => {
    const config = loadConfig({ AISE_SERVERLESS: "1", AISE_CORS_ORIGINS: "http://x.example" });
    expect(config.serverless).toBe(true);
    expect(config.corsOrigins).toEqual(["http://x.example"]);
    expect(config.dataDir).toBe("/tmp/aise-data");
  });
});

describe("local-mode zero-change guarantee", () => {
  test("an env record with ONLY the historical variables produces the historical issues", () => {
    const result = validateEnv({ PORT: "abc", LOG_LEVEL: "verbose" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        "PORT: expected an integer between 1 and 65535",
        "LOG_LEVEL: expected one of debug|info|warn|error",
      ]);
    }
  });

  test("a fully valid historical env stays valid (no new requirements)", () => {
    const env: EnvRecord = { HOST: "0.0.0.0", PORT: "9090", LOG_LEVEL: "debug" };
    const config = validateEnv(env);
    expect(config.ok).toBe(true);
  });
});
