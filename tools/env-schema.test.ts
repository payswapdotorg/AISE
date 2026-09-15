import { describe, expect, test } from "bun:test";
import {
  ENV_RULES,
  evaluateEnv,
  isFormatValid,
  type EnvRecord,
} from "./env-schema";

describe("declared schema", () => {
  test("covers exactly the variables the current runtime consumes", () => {
    expect(ENV_RULES.map((rule) => rule.name).sort()).toEqual([
      "AISE_AUTH",
      "AISE_AUTH_MODE",
      "AISE_DATA_DIR",
      "AISE_DEMO_PRINCIPAL",
      "AISE_SESSION_TTL_SECONDS",
      "AISE_WEB_PORT",
      "AUTH_SECRET",
      "HOST",
      "LOG_LEVEL",
      "PORT",
      "WORLDSCULPT_API_KEY",
    ]);
  });

  test("AISE_DATA_DIR is the only variable required in start mode; nothing is required in dev mode", () => {
    expect(ENV_RULES.filter((rule) => rule.requiredIn.includes("dev"))).toEqual([]);
    expect(
      ENV_RULES.filter((rule) => rule.requiredIn.includes("start")).map((rule) => rule.name),
    ).toEqual(["AISE_DATA_DIR"]);
  });

  test("only WORLDSCULPT_API_KEY is an optional provider credential", () => {
    expect(
      ENV_RULES.filter((rule) => rule.optionalProvider === true).map((rule) => rule.name),
    ).toEqual(["WORLDSCULPT_API_KEY"]);
  });

  test("PROD-004: only AUTH_SECRET is required-when-enabled (by the AISE_AUTH toggle)", () => {
    const gated = ENV_RULES.filter((rule) => rule.requiredWhen !== undefined);
    expect(gated.map((rule) => rule.name)).toEqual(["AUTH_SECRET"]);
    expect(gated[0]?.requiredWhen).toEqual({
      variable: "AISE_AUTH",
      enabledValues: ["1", "true"],
    });
  });
});

describe("isFormatValid", () => {
  test("port accepts integers in range and rejects everything else", () => {
    expect(isFormatValid("port", "1")).toBe(true);
    expect(isFormatValid("port", "65535")).toBe(true);
    expect(isFormatValid("port", "8080")).toBe(true);
    expect(isFormatValid("port", "0")).toBe(false);
    expect(isFormatValid("port", "65536")).toBe(false);
    expect(isFormatValid("port", "banana")).toBe(false);
    expect(isFormatValid("port", "")).toBe(false);
    expect(isFormatValid("port", "8080 ")).toBe(false);
  });

  test("host rejects empty and non-hostname junk", () => {
    expect(isFormatValid("host", "127.0.0.1")).toBe(true);
    expect(isFormatValid("host", "localhost")).toBe(true);
    expect(isFormatValid("host", "")).toBe(false);
    expect(isFormatValid("host", "bad host")).toBe(false);
  });

  test("log-level is case-insensitive like the API's own loader", () => {
    expect(isFormatValid("log-level", "info")).toBe(true);
    expect(isFormatValid("log-level", "INFO")).toBe(true);
    expect(isFormatValid("log-level", "verbose")).toBe(false);
    expect(isFormatValid("log-level", "")).toBe(false);
  });

  test("path and secret reject empty/whitespace-only values", () => {
    expect(isFormatValid("path", "./data")).toBe(true);
    expect(isFormatValid("path", "  ")).toBe(false);
    expect(isFormatValid("secret", "some-token")).toBe(true);
    expect(isFormatValid("secret", "")).toBe(false);
  });

  test("auth-toggle accepts 1|true|0|false case-insensitively; junk is invalid", () => {
    for (const value of ["1", "true", "TRUE", "0", "false", "False"]) {
      expect(isFormatValid("auth-toggle", value)).toBe(true);
    }
    for (const value of ["", "yes", "on", "enabled", "2"]) {
      expect(isFormatValid("auth-toggle", value)).toBe(false);
    }
  });

  test("auth-mode accepts required|demo-open; ttl-seconds is bounded; identifiers are 1..256 chars", () => {
    expect(isFormatValid("auth-mode", "required")).toBe(true);
    expect(isFormatValid("auth-mode", "demo-open")).toBe(true);
    expect(isFormatValid("auth-mode", "DEMO-OPEN")).toBe(true);
    expect(isFormatValid("auth-mode", "open")).toBe(false);
    expect(isFormatValid("auth-mode", "")).toBe(false);
    expect(isFormatValid("ttl-seconds", "60")).toBe(true);
    expect(isFormatValid("ttl-seconds", "2592000")).toBe(true);
    expect(isFormatValid("ttl-seconds", "59")).toBe(false);
    expect(isFormatValid("ttl-seconds", "2592001")).toBe(false);
    expect(isFormatValid("ttl-seconds", "604800")).toBe(true);
    expect(isFormatValid("ttl-seconds", "banana")).toBe(false);
    expect(isFormatValid("identifier", "demo-evaluator")).toBe(true);
    expect(isFormatValid("identifier", "x")).toBe(true);
    expect(isFormatValid("identifier", "")).toBe(false);
    expect(isFormatValid("identifier", "a".repeat(256))).toBe(true);
    expect(isFormatValid("identifier", "a".repeat(257))).toBe(false);
  });
});

describe("evaluateEnv", () => {
  test("dev mode passes on a clean environment with all defaults", () => {
    const report = evaluateEnv({}, "dev");
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    const byName = new Map(report.checks.map((check) => [check.name, check]));
    expect(byName.get("HOST")?.status).toBe("ok-default");
    expect(byName.get("HOST")?.detail).toBe("default: 127.0.0.1");
    expect(byName.get("PORT")?.detail).toBe("default: 8080");
    expect(byName.get("LOG_LEVEL")?.detail).toBe("default: info");
    expect(byName.get("AISE_DATA_DIR")?.detail).toBe("default: ./data");
    expect(byName.get("AISE_WEB_PORT")?.detail).toBe("default: 5173");
  });

  test("missing optional provider credential reports disabled (optional), never an error", () => {
    const report = evaluateEnv({}, "dev");
    const provider = report.checks.find((check) => check.name === "WORLDSCULPT_API_KEY");
    expect(provider?.status).toBe("disabled-optional");
    expect(provider?.detail).toBe("disabled (optional)");
    expect(report.ok).toBe(true);
  });

  test("start mode fails deterministically when AISE_DATA_DIR is missing", () => {
    const report = evaluateEnv({}, "start");
    expect(report.ok).toBe(false);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toContain("AISE_DATA_DIR:");
    expect(report.issues[0]).toContain("docs/INSTALL.md");
    expect(report.checks.find((check) => check.name === "AISE_DATA_DIR")?.status).toBe("missing");
    // The optional provider is still only "disabled", not an error.
    expect(report.checks.find((check) => check.name === "WORLDSCULPT_API_KEY")?.status).toBe(
      "disabled-optional",
    );
  });

  test("start mode passes when AISE_DATA_DIR is set", () => {
    const report = evaluateEnv({ AISE_DATA_DIR: "/var/lib/aise" }, "start");
    expect(report.ok).toBe(true);
    expect(report.checks.find((check) => check.name === "AISE_DATA_DIR")?.detail).toBe(
      "/var/lib/aise",
    );
  });

  test("malformed values fail with precise issues that never contain the value", () => {
    const env: EnvRecord = { PORT: "not-a-port", HOST: "bad host", LOG_LEVEL: "verbose" };
    const report = evaluateEnv(env, "dev");
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      "HOST: expected a hostname or IP address",
      "PORT: expected an integer between 1 and 65535",
      "LOG_LEVEL: expected one of debug|info|warn|error",
    ]);
    for (const issue of report.issues) {
      expect(issue).not.toContain("not-a-port");
      expect(issue).not.toContain("bad host");
    }
  });

  test("present-but-empty values are misconfigurations, not unset", () => {
    const report = evaluateEnv({ PORT: "", AISE_DATA_DIR: "  " }, "dev");
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      "PORT: expected an integer between 1 and 65535",
      "AISE_DATA_DIR: expected a non-empty directory path",
    ]);
  });

  test("present-but-empty optional provider credential is malformed, not disabled", () => {
    const report = evaluateEnv({ WORLDSCULPT_API_KEY: "" }, "dev");
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(["WORLDSCULPT_API_KEY: expected a non-empty value"]);
    expect(report.checks.find((check) => check.name === "WORLDSCULPT_API_KEY")?.status).toBe(
      "invalid",
    );
  });

  test("a well-formed environment passes in both modes and echoes non-secret values only", () => {
    const env: EnvRecord = {
      HOST: "127.0.0.1",
      PORT: "9000",
      LOG_LEVEL: "debug",
      AISE_DATA_DIR: "./runtime-data",
      AISE_WEB_PORT: "5173",
      WORLDSCULPT_API_KEY: "secret-value",
    };
    for (const mode of ["dev", "start"] as const) {
      const report = evaluateEnv(env, mode);
      expect(report.ok).toBe(true);
      expect(report.checks.find((check) => check.name === "PORT")?.detail).toBe("9000");
      const provider = report.checks.find((check) => check.name === "WORLDSCULPT_API_KEY");
      expect(provider?.status).toBe("enabled-optional");
      expect(provider?.detail).not.toContain("secret-value");
    }
  });

  test("evaluation is deterministic: the same env and mode produce identical reports", () => {
    const env: EnvRecord = { PORT: "9000", AISE_DATA_DIR: "./x" };
    expect(evaluateEnv(env, "start")).toEqual(evaluateEnv(env, "start"));
    expect(evaluateEnv(env, "dev")).toEqual(evaluateEnv(env, "dev"));
  });
});

describe("PROD-004 auth variables (required-when-enabled semantics)", () => {
  test("auth disabled (unset) → every auth variable reports a default, AUTH_SECRET is NOT required", () => {
    const report = evaluateEnv({}, "dev");
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    const byName = new Map(report.checks.map((check) => [check.name, check]));
    expect(byName.get("AISE_AUTH")?.status).toBe("ok-default");
    expect(byName.get("AISE_AUTH")?.detail).toBe("default: unset (auth layer disabled)");
    expect(byName.get("AUTH_SECRET")?.status).toBe("ok-default");
    expect(byName.get("AUTH_SECRET")?.detail).toBe(
      "not required while AISE_AUTH is unset or disabled",
    );
    expect(byName.get("AISE_AUTH_MODE")?.detail).toBe("default: demo-open");
    expect(byName.get("AISE_SESSION_TTL_SECONDS")?.detail).toBe("default: 604800");
    expect(byName.get("AISE_DEMO_PRINCIPAL")?.detail).toBe("default: demo-evaluator");
  });

  test("AISE_AUTH=0 (explicitly disabled) → AUTH_SECRET is still not required", () => {
    const report = evaluateEnv({ AISE_AUTH: "0", AISE_DATA_DIR: "./data" }, "start");
    expect(report.ok).toBe(true);
    expect(report.checks.find((check) => check.name === "AISE_AUTH")?.detail).toBe("0");
    expect(report.checks.find((check) => check.name === "AUTH_SECRET")?.status).toBe("ok-default");
  });

  test("AISE_AUTH=1 without AUTH_SECRET → deterministic failure naming the expectation, never the value", () => {
    const report = evaluateEnv({ AISE_AUTH: "1" }, "dev");
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      "AUTH_SECRET: required when AISE_AUTH=1 — set it to a long random string (see docs/INSTALL.md §Auth)",
    ]);
    expect(report.checks.find((check) => check.name === "AUTH_SECRET")?.status).toBe("missing");
  });

  test("AISE_AUTH=true (case-insensitive) also gates the secret; AISE_AUTH=1 with the secret passes", () => {
    expect(evaluateEnv({ AISE_AUTH: "TRUE" }, "dev").ok).toBe(false);
    const report = evaluateEnv(
      { AISE_AUTH: "1", AUTH_SECRET: "a-long-random-string", AISE_DATA_DIR: "./runtime-data" },
      "start",
    );
    expect(report.ok).toBe(true);
    const secret = report.checks.find((check) => check.name === "AUTH_SECRET");
    expect(secret?.status).toBe("ok");
    // The secret value is NEVER echoed — only the fact that it is set.
    expect(secret?.detail).toBe("set (value hidden)");
    expect(secret?.detail).not.toContain("a-long-random-string");
  });

  test("malformed auth values fail with precise expectations that never contain the value", () => {
    const report = evaluateEnv(
      {
        AISE_AUTH: "affirmative",
        AISE_AUTH_MODE: "permissive",
        AISE_SESSION_TTL_SECONDS: "10",
        AISE_DEMO_PRINCIPAL: "",
      },
      "dev",
    );
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      "AISE_AUTH: expected 1|true|0|false",
      "AISE_AUTH_MODE: expected required|demo-open",
      "AISE_SESSION_TTL_SECONDS: expected an integer between 60 and 2592000 (seconds)",
      "AISE_DEMO_PRINCIPAL: expected a non-empty value (1..256 characters)",
    ]);
    for (const issue of report.issues) {
      expect(issue).not.toContain("affirmative");
      expect(issue).not.toContain("permissive");
    }
  });

  test("a fully configured auth environment passes in both modes", () => {
    const env: EnvRecord = {
      AISE_AUTH: "1",
      AUTH_SECRET: "test-secret-not-a-real-credential",
      AISE_AUTH_MODE: "required",
      AISE_SESSION_TTL_SECONDS: "3600",
      AISE_DEMO_PRINCIPAL: "demo-evaluator",
      AISE_DATA_DIR: "./runtime-data",
    };
    for (const mode of ["dev", "start"] as const) {
      const report = evaluateEnv(env, mode);
      expect(report.ok).toBe(true);
      expect(report.issues).toEqual([]);
    }
  });
});
