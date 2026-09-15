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
      "AISE_DATA_DIR",
      "AISE_WEB_PORT",
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

  test("optional provider credentials are WORLDSCULPT plus the R2 artifact storage group", () => {
    expect(
      ENV_RULES.filter((rule) => rule.optionalProvider === true).map((rule) => rule.name),
    ).toEqual([
      "WORLDSCULPT_API_KEY",
      "R2_ACCOUNT_ID",
      "R2_BUCKET",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_PUBLIC_ENDPOINT",
    ]);
  });

  test("the R2_* group is the only optional group: all-or-nothing required members", () => {
    const groups = new Map<string, readonly string[]>();
    for (const rule of ENV_RULES) {
      if (rule.optionalGroup === undefined) {
        continue;
      }
      groups.set(rule.optionalGroup, [...(groups.get(rule.optionalGroup) ?? []), rule.name]);
    }
    expect([...groups.keys()]).toEqual(["r2"]);
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
