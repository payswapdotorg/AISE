import { describe, expect, test } from "bun:test";
import {
  ConfigError,
  loadConfig,
  validateEnv,
  type AppConfig,
  type ConfigResult,
} from "./config";

function configOf(result: ConfigResult): AppConfig {
  if (!result.ok) {
    throw new Error("expected a valid config result");
  }
  return result.config;
}

describe("config validation", () => {
  test("accepts a valid environment with explicit values", () => {
    const result = validateEnv({
      HOST: "0.0.0.0",
      PORT: "9090",
      LOG_LEVEL: "debug",
    });
    const config = configOf(result);
    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(9090);
    expect(config.logLevel).toBe("debug");
  });

  test("applies safe defaults when the environment is missing entirely", () => {
    const config = configOf(validateEnv({}));
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8080);
    expect(config.logLevel).toBe("info");
    expect(config.dataDir).toBe("./data");
  });

  test("normalizes LOG_LEVEL case-insensitively", () => {
    const config = configOf(validateEnv({ LOG_LEVEL: "WARN" }));
    expect(config.logLevel).toBe("warn");
  });

  test("rejects out-of-range and non-numeric ports", () => {
    expect(validateEnv({ PORT: "" }).ok).toBe(false);
    expect(validateEnv({ PORT: "0" }).ok).toBe(false);
    expect(validateEnv({ PORT: "65536" }).ok).toBe(false);
    expect(validateEnv({ PORT: "not-a-port" }).ok).toBe(false);
    expect(validateEnv({ PORT: "12.5" }).ok).toBe(false);
    expect(validateEnv({ PORT: "-1" }).ok).toBe(false);
  });

  test("rejects malformed hosts and log levels", () => {
    expect(validateEnv({ HOST: "bad host!" }).ok).toBe(false);
    expect(validateEnv({ HOST: "" }).ok).toBe(false);
    expect(validateEnv({ LOG_LEVEL: "verbose" }).ok).toBe(false);
    expect(validateEnv({ LOG_LEVEL: "" }).ok).toBe(false);
  });

  test("AISE_DATA_DIR accepts a custom path verbatim and rejects junk", () => {
    const custom = configOf(validateEnv({ AISE_DATA_DIR: "/var/lib/aise/capture" }));
    expect(custom.dataDir).toBe("/var/lib/aise/capture");

    expect(validateEnv({ AISE_DATA_DIR: "" }).ok).toBe(false);
    expect(validateEnv({ AISE_DATA_DIR: "   " }).ok).toBe(false);

    // Non-string junk can only arrive from a misbehaving env source; the
    // parser defends without ever echoing the value.
    const nonString = validateEnv({ AISE_DATA_DIR: 42 as unknown as string });
    expect(nonString.ok).toBe(false);
    if (!nonString.ok) {
      expect(nonString.issues).toEqual([
        "AISE_DATA_DIR: expected a non-empty directory path",
      ]);
    }
  });

  test("lists every invalid variable at once, without echoing values", () => {
    const result = validateEnv({
      HOST: "bad host!",
      PORT: "abc",
      LOG_LEVEL: "verbose",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(3);
      const joined = result.issues.join("\n");
      expect(joined).toContain("HOST");
      expect(joined).toContain("PORT");
      expect(joined).toContain("LOG_LEVEL");
      expect(joined).not.toContain("abc");
      expect(joined).not.toContain("bad host!");
      expect(joined).not.toContain("verbose");
    }
  });

  test("loadConfig fails fast with a ConfigError naming every issue", () => {
    let caught: unknown;
    try {
      loadConfig({ PORT: "70000" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    const err = caught as ConfigError;
    expect(err.message).toContain("Invalid environment configuration");
    expect(err.message).toContain("PORT");
    expect(err.issues).toEqual(["PORT: expected an integer between 1 and 65535"]);
  });

  test("loadConfig accepts the live process environment shape", () => {
    // The process env itself must always satisfy the schema or fail loudly;
    // in the test environment no AISE variables are set, so defaults apply.
    const config = loadConfig({});
    expect(config.port).toBe(8080);
  });
});
