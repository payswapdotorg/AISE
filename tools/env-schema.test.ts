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
      "AISE_ARTIFACT_MAX_BYTES",
      "AISE_AUTH",
      "AISE_AUTH_MODE",
      "AISE_DATA_DIR",
      "AISE_DEMO_PRINCIPAL",
      "AISE_MAX_UPLOAD_BYTES",
      "AISE_QUOTA_R2_BYTES",
      "AISE_QUOTA_R2_OBJECTS",
      "AISE_QUOTA_REDIS_COMMANDS",
      "AISE_QUOTA_THRESHOLD_PERCENT",
      "AISE_RATELIMIT_GLOBAL_MAX",
      "AISE_RATELIMIT_MAX",
      "AISE_RATELIMIT_WINDOW_SECONDS",
      "AISE_REDIS_CACHE_TTL_SECONDS",
      "AISE_REDIS_RATELIMIT_MAX",
      "AISE_REDIS_RATELIMIT_WINDOW_SECONDS",
      "AISE_REDIS_REST_TOKEN",
      "AISE_REDIS_REST_URL",
      "AISE_SESSION_TTL_SECONDS",
      "AISE_WEB_PORT",
      "AUTH_SECRET",
      "DATABASE_URL",
      "HOST",
      "LOG_LEVEL",
      "PORT",
      "R2_ACCESS_KEY_ID",
      "R2_ACCOUNT_ID",
      "R2_BUCKET",
      "R2_PUBLIC_ENDPOINT",
      "R2_SECRET_ACCESS_KEY",
      "WORLDSCULPT_API_KEY",
    ]);
  });

  test("AISE_DATA_DIR is the only variable required in start mode; nothing is required in dev mode", () => {
    expect(ENV_RULES.filter((rule) => rule.requiredIn.includes("dev"))).toEqual([]);
    expect(
      ENV_RULES.filter((rule) => rule.requiredIn.includes("start")).map((rule) => rule.name),
    ).toEqual(["AISE_DATA_DIR"]);
  });

  test("optional provider credentials are WORLDSCULPT, the R2 artifact group, DATABASE_URL and the redis group (PROD-007)", () => {
    expect(
      ENV_RULES.filter((rule) => rule.optionalProvider === true).map((rule) => rule.name),
    ).toEqual([
      "WORLDSCULPT_API_KEY",
      "R2_ACCOUNT_ID",
      "R2_BUCKET",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_PUBLIC_ENDPOINT",
      "DATABASE_URL",
      "AISE_REDIS_REST_URL",
      "AISE_REDIS_REST_TOKEN",
    ]);
  });

  test("optional groups (r2, redis): all-or-nothing required members", () => {
    const groups = new Map<string, readonly string[]>();
    for (const rule of ENV_RULES) {
      if (rule.optionalGroup === undefined) {
        continue;
      }
      groups.set(rule.optionalGroup, [...(groups.get(rule.optionalGroup) ?? []), rule.name]);
    }
    expect([...groups.keys()]).toEqual(["r2", "redis"]);
    expect(groups.get("r2")).toEqual([
      "R2_ACCOUNT_ID",
      "R2_BUCKET",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_PUBLIC_ENDPOINT",
    ]);
    expect(
      ENV_RULES.filter((rule) => rule.optionalGroup === "r2" && rule.groupRequired === true).map(
        (rule) => rule.name,
      ),
    ).toEqual(["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]);
    expect(groups.get("redis")).toEqual(["AISE_REDIS_REST_URL", "AISE_REDIS_REST_TOKEN"]);
    expect(
      ENV_RULES.filter((rule) => rule.optionalGroup === "redis" && rule.groupRequired === true).map(
        (rule) => rule.name,
      ),
    ).toEqual(["AISE_REDIS_REST_URL", "AISE_REDIS_REST_TOKEN"]);
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

  test("bytes-cap accepts integers between 1 and 1 GiB and rejects everything else", () => {
    expect(isFormatValid("bytes-cap", "1")).toBe(true);
    expect(isFormatValid("bytes-cap", "26214400")).toBe(true);
    expect(isFormatValid("bytes-cap", "1073741824")).toBe(true);
    expect(isFormatValid("bytes-cap", "0")).toBe(false);
    expect(isFormatValid("bytes-cap", "1073741825")).toBe(false);
    expect(isFormatValid("bytes-cap", "25MB")).toBe(false);
    expect(isFormatValid("bytes-cap", "-1")).toBe(false);
    expect(isFormatValid("bytes-cap", "")).toBe(false);
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

describe("PROD-006 R2 artifact storage group", () => {
  const COMPLETE_R2: EnvRecord = {
    R2_ACCOUNT_ID: "account-id-value",
    R2_BUCKET: "bucket-name-value",
    R2_ACCESS_KEY_ID: "access-key-id-value",
    R2_SECRET_ACCESS_KEY: "secret-access-key-value",
  };

  test("unset group reports every member disabled (optional), never an error", () => {
    const report = evaluateEnv({}, "dev");
    expect(report.ok).toBe(true);
    for (const name of [
      "R2_ACCOUNT_ID",
      "R2_BUCKET",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_PUBLIC_ENDPOINT",
    ]) {
      const check = report.checks.find((entry) => entry.name === name);
      expect(check?.status).toBe("disabled-optional");
      expect(check?.detail).toBe("disabled (optional)");
    }
  });

  test("complete group passes and never echoes any R2 value", () => {
    const report = evaluateEnv({ AISE_DATA_DIR: "/var/lib/aise", ...COMPLETE_R2 }, "start");
    expect(report.ok).toBe(true);
    for (const name of Object.keys(COMPLETE_R2)) {
      const check = report.checks.find((entry) => entry.name === name);
      expect(check?.status).toBe("enabled-optional");
      expect(check?.detail).toBe("enabled (optional group 'r2')");
      expect(check?.detail).not.toContain(COMPLETE_R2[name] ?? "");
    }
  });

  test("half-configured group fails with one precise issue per missing member (names only)", () => {
    const report = evaluateEnv(
      { R2_ACCOUNT_ID: "account-id-value", R2_BUCKET: "bucket-name-value" },
      "dev",
    );
    expect(report.ok).toBe(false);
    expect(report.issues).toHaveLength(2);
    for (const issue of report.issues) {
      expect(issue).toContain("required when the r2 group is active");
      expect(issue).not.toContain("account-id-value");
      expect(issue).not.toContain("bucket-name-value");
    }
    const names = report.issues.map((issue) => issue.split(":")[0]).sort();
    expect(names).toEqual(["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]);
  });

  test("R2_PUBLIC_ENDPOINT alone activates the group and demands the required members", () => {
    const report = evaluateEnv({ R2_PUBLIC_ENDPOINT: "https://example.invalid" }, "dev");
    expect(report.ok).toBe(false);
    expect(report.issues).toHaveLength(4);
    const names = report.issues.map((issue) => issue.split(":")[0]).sort();
    expect(names).toEqual(["R2_ACCESS_KEY_ID", "R2_ACCOUNT_ID", "R2_BUCKET", "R2_SECRET_ACCESS_KEY"]);
  });

  test("AISE_ARTIFACT_MAX_BYTES defaults to 25 MiB and rejects malformed caps", () => {
    const unset = evaluateEnv({}, "dev");
    expect(unset.checks.find((check) => check.name === "AISE_ARTIFACT_MAX_BYTES")?.status).toBe(
      "ok-default",
    );
    expect(unset.checks.find((check) => check.name === "AISE_ARTIFACT_MAX_BYTES")?.detail).toBe(
      "default: 26214400",
    );

    const set = evaluateEnv({ AISE_ARTIFACT_MAX_BYTES: "1048576" }, "dev");
    expect(set.ok).toBe(true);
    expect(set.checks.find((check) => check.name === "AISE_ARTIFACT_MAX_BYTES")?.detail).toBe(
      "1048576",
    );

    const malformed = evaluateEnv({ AISE_ARTIFACT_MAX_BYTES: "0" }, "dev");
    expect(malformed.ok).toBe(false);
    expect(malformed.issues).toEqual([
      "AISE_ARTIFACT_MAX_BYTES: expected an integer number of bytes between 1 and 1073741824",
    ]);
  });
});

describe("PROD-007 redis transient-state group", () => {
  const COMPLETE_REDIS: EnvRecord = {
    AISE_REDIS_REST_URL: "https://redis-test.example.upstash.io",
    AISE_REDIS_REST_TOKEN: "redis-rest-token-value",
  };

  test("unset group reports both members disabled (optional) and the tuning defaults — never an error", () => {
    const report = evaluateEnv({}, "dev");
    expect(report.ok).toBe(true);
    for (const name of ["AISE_REDIS_REST_URL", "AISE_REDIS_REST_TOKEN"]) {
      const check = report.checks.find((entry) => entry.name === name);
      expect(check?.status).toBe("disabled-optional");
      expect(check?.detail).toBe("disabled (optional)");
    }
    const byName = new Map(report.checks.map((check) => [check.name, check]));
    expect(byName.get("AISE_REDIS_CACHE_TTL_SECONDS")?.status).toBe("ok-default");
    expect(byName.get("AISE_REDIS_CACHE_TTL_SECONDS")?.detail).toBe("default: 300");
    expect(byName.get("AISE_REDIS_RATELIMIT_WINDOW_SECONDS")?.detail).toBe("default: 60");
    expect(byName.get("AISE_REDIS_RATELIMIT_MAX")?.detail).toBe("default: 100");
  });

  test("complete group passes and never echoes the URL or token", () => {
    const report = evaluateEnv({ AISE_DATA_DIR: "/var/lib/aise", ...COMPLETE_REDIS }, "start");
    expect(report.ok).toBe(true);
    for (const name of Object.keys(COMPLETE_REDIS)) {
      const check = report.checks.find((entry) => entry.name === name);
      expect(check?.status).toBe("enabled-optional");
      expect(check?.detail).toBe("enabled (optional group 'redis')");
      expect(check?.detail).not.toContain(COMPLETE_REDIS[name] ?? "");
    }
  });

  test("half-configured group fails with one precise issue naming the missing member (never the value)", () => {
    const report = evaluateEnv({ AISE_REDIS_REST_URL: "https://redis-test.example.upstash.io" }, "dev");
    expect(report.ok).toBe(false);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toContain("AISE_REDIS_REST_TOKEN");
    expect(report.issues[0]).toContain("required when the redis group is active");
    expect(report.issues[0]).not.toContain("redis-test");
    expect(report.checks.find((entry) => entry.name === "AISE_REDIS_REST_TOKEN")?.status).toBe(
      "missing",
    );
  });

  test("present-but-empty group members are malformed, not unset", () => {
    const report = evaluateEnv({ AISE_REDIS_REST_TOKEN: "" }, "dev");
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(["AISE_REDIS_REST_TOKEN: expected a non-empty value"]);
  });

  test("tuning variables accept in-range integers and reject malformed values precisely", () => {
    const ok = evaluateEnv(
      {
        AISE_REDIS_CACHE_TTL_SECONDS: "600",
        AISE_REDIS_RATELIMIT_WINDOW_SECONDS: "120",
        AISE_REDIS_RATELIMIT_MAX: "500",
      },
      "dev",
    );
    expect(ok.ok).toBe(true);
    expect(ok.checks.find((check) => check.name === "AISE_REDIS_RATELIMIT_MAX")?.detail).toBe("500");

    const malformed = evaluateEnv(
      {
        AISE_REDIS_CACHE_TTL_SECONDS: "59",
        AISE_REDIS_RATELIMIT_WINDOW_SECONDS: "banana",
        AISE_REDIS_RATELIMIT_MAX: "0",
      },
      "dev",
    );
    expect(malformed.ok).toBe(false);
    expect(malformed.issues).toEqual([
      "AISE_REDIS_CACHE_TTL_SECONDS: expected an integer between 60 and 2592000 (seconds)",
      "AISE_REDIS_RATELIMIT_WINDOW_SECONDS: expected an integer between 60 and 2592000 (seconds)",
      "AISE_REDIS_RATELIMIT_MAX: expected an integer between 1 and 100000",
    ]);
  });
});

describe("PROD-013 cost-guard variables (all optional, conservative defaults)", () => {
  test("every cost knob is optional in BOTH modes — the zero-config discipline", () => {
    const costVars = ENV_RULES.filter((rule) =>
      [
        "AISE_QUOTA_REDIS_COMMANDS",
        "AISE_QUOTA_R2_BYTES",
        "AISE_QUOTA_R2_OBJECTS",
        "AISE_QUOTA_THRESHOLD_PERCENT",
        "AISE_RATELIMIT_WINDOW_SECONDS",
        "AISE_RATELIMIT_MAX",
        "AISE_RATELIMIT_GLOBAL_MAX",
        "AISE_MAX_UPLOAD_BYTES",
      ].includes(rule.name),
    );
    expect(costVars).toHaveLength(8);
    for (const rule of costVars) {
      expect(rule.requiredIn).toEqual([]);
      expect(rule.optionalProvider).toBeUndefined();
      expect(rule.optionalGroup).toBeUndefined();
      expect(rule.requiredWhen).toBeUndefined();
    }
    // Nothing is newly required anywhere: the start-mode requirement set
    // is still exactly AISE_DATA_DIR.
    expect(
      ENV_RULES.filter((rule) => rule.requiredIn.includes("start")).map((rule) => rule.name),
    ).toEqual(["AISE_DATA_DIR"]);
  });

  test("unset knobs report the documented conservative defaults", () => {
    const report = evaluateEnv({}, "dev");
    expect(report.ok).toBe(true);
    const byName = new Map(report.checks.map((check) => [check.name, check]));
    expect(byName.get("AISE_QUOTA_REDIS_COMMANDS")?.status).toBe("ok-default");
    expect(byName.get("AISE_QUOTA_REDIS_COMMANDS")?.detail).toBe("default: 400000");
    expect(byName.get("AISE_QUOTA_R2_BYTES")?.detail).toBe("default: 8589934592");
    expect(byName.get("AISE_QUOTA_R2_OBJECTS")?.detail).toBe("default: 100000");
    expect(byName.get("AISE_QUOTA_THRESHOLD_PERCENT")?.detail).toBe("default: 80");
    expect(byName.get("AISE_RATELIMIT_WINDOW_SECONDS")?.detail).toBe("default: 60");
    expect(byName.get("AISE_RATELIMIT_MAX")?.detail).toBe("default: 60");
    expect(byName.get("AISE_RATELIMIT_GLOBAL_MAX")?.detail).toBe("default: 600");
    expect(byName.get("AISE_MAX_UPLOAD_BYTES")?.detail).toBe("default: 10485760");
  });

  test("valid values pass and are echoed (budget numbers, not secrets)", () => {
    const report = evaluateEnv(
      {
        AISE_QUOTA_REDIS_COMMANDS: "500000",
        AISE_QUOTA_R2_BYTES: "1099511627776",
        AISE_QUOTA_R2_OBJECTS: "100000000",
        AISE_QUOTA_THRESHOLD_PERCENT: "100",
        AISE_RATELIMIT_WINDOW_SECONDS: "1",
        AISE_RATELIMIT_MAX: "100000",
        AISE_RATELIMIT_GLOBAL_MAX: "25",
        AISE_MAX_UPLOAD_BYTES: "1073741824",
      },
      "dev",
    );
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    // Sub-minute windows are VALID burst protection (the guard's own
    // parser accepts 1 — unlike the ttl-seconds format's 60 floor).
    expect(
      report.checks.find((check) => check.name === "AISE_RATELIMIT_WINDOW_SECONDS")?.detail,
    ).toBe("1");
  });

  test("malformed or out-of-range values fail precisely, never echoing the value", () => {
    const report = evaluateEnv(
      {
        AISE_QUOTA_REDIS_COMMANDS: "100000001",
        AISE_QUOTA_R2_BYTES: "1099511627777",
        AISE_QUOTA_R2_OBJECTS: "0",
        AISE_QUOTA_THRESHOLD_PERCENT: "101",
        AISE_RATELIMIT_WINDOW_SECONDS: "2592001",
        AISE_RATELIMIT_MAX: "100001",
        AISE_RATELIMIT_GLOBAL_MAX: "banana",
        AISE_MAX_UPLOAD_BYTES: "10MB",
      },
      "dev",
    );
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      "AISE_QUOTA_REDIS_COMMANDS: expected an integer between 1 and 100000000",
      "AISE_QUOTA_R2_BYTES: expected an integer number of bytes between 1 and 1099511627776",
      "AISE_QUOTA_R2_OBJECTS: expected an integer between 1 and 100000000",
      "AISE_QUOTA_THRESHOLD_PERCENT: expected an integer between 1 and 100",
      "AISE_RATELIMIT_WINDOW_SECONDS: expected an integer between 1 and 2592000 (seconds)",
      "AISE_RATELIMIT_MAX: expected an integer between 1 and 100000",
      "AISE_RATELIMIT_GLOBAL_MAX: expected an integer between 1 and 100000",
      "AISE_MAX_UPLOAD_BYTES: expected an integer number of bytes between 1 and 1073741824",
    ]);
    for (const issue of report.issues) {
      expect(issue).not.toContain("banana");
      expect(issue).not.toContain("10MB");
    }
  });

  test("the knob formats mirror the cost family's own parser ceilings", () => {
    // quota-count: 1..100,000,000 (cost/quotas.ts CAP_CEILINGS for
    // redis_commands and r2_objects).
    expect(isFormatValid("quota-count", "1")).toBe(true);
    expect(isFormatValid("quota-count", "100000000")).toBe(true);
    expect(isFormatValid("quota-count", "100000001")).toBe(false);
    expect(isFormatValid("quota-count", "0")).toBe(false);
    // quota-bytes-cap: 1..1 TiB (the r2_storage_bytes ceiling).
    expect(isFormatValid("quota-bytes-cap", "8589934592")).toBe(true);
    expect(isFormatValid("quota-bytes-cap", "1099511627776")).toBe(true);
    expect(isFormatValid("quota-bytes-cap", "1099511627777")).toBe(false);
    // percent: 1..100 (the threshold band).
    expect(isFormatValid("percent", "80")).toBe(true);
    expect(isFormatValid("percent", "100")).toBe(true);
    expect(isFormatValid("percent", "0")).toBe(false);
    expect(isFormatValid("percent", "101")).toBe(false);
    // window-seconds: 1..2,592,000 (cost/guards.ts WINDOW_MAX_SECONDS —
    // sub-minute windows valid, unlike ttl-seconds).
    expect(isFormatValid("window-seconds", "1")).toBe(true);
    expect(isFormatValid("window-seconds", "2592000")).toBe(true);
    expect(isFormatValid("window-seconds", "2592001")).toBe(false);
    // Whitespace tolerance mirrors the parsers' trim discipline.
    expect(isFormatValid("quota-count", " 42 ")).toBe(true);
    expect(isFormatValid("window-seconds", "soon")).toBe(false);
  });
});
