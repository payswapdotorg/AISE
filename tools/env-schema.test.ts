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
      "AISE_DATA_DIR",
      "AISE_WEB_PORT",
      "DATABASE_URL",
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

  test("only WORLDSCULPT_API_KEY and DATABASE_URL are optional provider credentials", () => {
    expect(
      ENV_RULES.filter((rule) => rule.optionalProvider === true).map((rule) => rule.name),
    ).toEqual(["WORLDSCULPT_API_KEY", "DATABASE_URL"]);
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

  test("postgres-url accepts postgres:// and postgresql:// URLs with a host, rejects everything else", () => {
    expect(isFormatValid("postgres-url", "postgres://user:pass@host.example/db?sslmode=require")).toBe(true);
    expect(isFormatValid("postgres-url", "postgresql://neon.db/neondb")).toBe(true);
    expect(isFormatValid("postgres-url", "postgres://localhost:5432/aise")).toBe(true);
    expect(isFormatValid("postgres-url", "mysql://user@host/db")).toBe(false);
    expect(isFormatValid("postgres-url", "postgres://")).toBe(false);
    expect(isFormatValid("postgres-url", "not a url")).toBe(false);
    expect(isFormatValid("postgres-url", "")).toBe(false);
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

  test("DATABASE_URL: missing is disabled (optional) = Fs persistence mode", () => {
    const report = evaluateEnv({}, "dev");
    const check = report.checks.find((c) => c.name === "DATABASE_URL");
    expect(check?.status).toBe("disabled-optional");
    expect(check?.detail).toBe("disabled (optional)");
    expect(report.ok).toBe(true);
  });

  test("DATABASE_URL: a valid URL is enabled (optional) and never echoed in detail", () => {
    const url = "postgres://user:secret-password@ep-example-pooler.example.neon.tech/neondb?sslmode=require";
    const report = evaluateEnv({ DATABASE_URL: url }, "dev");
    const check = report.checks.find((c) => c.name === "DATABASE_URL");
    expect(check?.status).toBe("enabled-optional");
    expect(check?.detail).not.toContain(url);
    expect(check?.detail).not.toContain("secret-password");
    expect(report.ok).toBe(true);
  });

  test("DATABASE_URL: a non-postgres scheme is a deterministic failure that never echoes the value", () => {
    const report = evaluateEnv({ DATABASE_URL: "mysql://user:leaked@host/db" }, "dev");
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      "DATABASE_URL: expected a postgres:// or postgresql:// connection URL with a host",
    ]);
    expect(report.issues[0]).not.toContain("leaked");
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
