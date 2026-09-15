/**
 * PROD-004 — the auth env discipline tests (fail-closed semantics).
 *
 * Determinism: pure function of the env record; fixed inputs, no I/O.
 */

import { describe, expect, test } from "bun:test";
import { AUTH_MODES, authReadiness, parseAuthConfig, type EnvRecord } from "./config";

describe("the AISE_AUTH toggle", () => {
  test("unset → disabled, and no other variable is required", () => {
    const result = parseAuthConfig({});
    expect(result).toEqual({
      ok: true,
      config: {
        enabled: false,
        mode: "demo-open",
        secret: "",
        sessionTtlSeconds: 604_800,
        demoPrincipalId: "demo-evaluator",
      },
    });
  });

  test("1|true (case-insensitive, trimmed) → enabled; 0|false → disabled", () => {
    for (const value of ["1", "true", "TRUE", " 1 "]) {
      expect(parseAuthConfig({ AISE_AUTH: value, AUTH_SECRET: "s" }).ok && (
        parseAuthConfig({ AISE_AUTH: value, AUTH_SECRET: "s" }) as { config: { enabled: boolean } }
      ).config.enabled).toBe(true);
    }
    for (const value of ["0", "false", "False"]) {
      expect(parseAuthConfig({ AISE_AUTH: value }).ok && (
        parseAuthConfig({ AISE_AUTH: value }) as { config: { enabled: boolean } }
      ).config.enabled).toBe(false);
    }
  });

  test("junk toggle → {ok:false} with the precise issue (fail closed)", () => {
    const result = parseAuthConfig({ AISE_AUTH: "yes" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(["AISE_AUTH: expected 1|true|0|false"]);
    }
  });

  test("present-but-empty toggle is a REPORTED misconfiguration, treated as disabled", () => {
    const result = parseAuthConfig({ AISE_AUTH: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain("AISE_AUTH: expected 1|true|0|false");
    }
  });
});

describe("AUTH_SECRET is required exactly when auth is enabled", () => {
  test("enabled without a secret → fail closed with the documented issue", () => {
    const result = parseAuthConfig({ AISE_AUTH: "1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        "AUTH_SECRET: required when AISE_AUTH=1 — set it to a long random string (see docs/INSTALL.md §Auth)",
      ]);
    }
  });

  test("enabled with a whitespace-only secret → still missing (no silent fallback key)", () => {
    const result = parseAuthConfig({ AISE_AUTH: "1", AUTH_SECRET: "   " });
    expect(result.ok).toBe(false);
  });

  test("disabled → the secret is simply unused (no issue, even when set)", () => {
    const disabled = parseAuthConfig({ AUTH_SECRET: "whatever" });
    expect(disabled.ok).toBe(true);
    const unset = parseAuthConfig({});
    expect(unset.ok).toBe(true);
  });

  test("enabled with a secret → ok, the secret is held server-side only", () => {
    const result = parseAuthConfig({ AISE_AUTH: "1", AUTH_SECRET: "long-random-test-secret" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.secret).toBe("long-random-test-secret");
      expect(result.config.enabled).toBe(true);
    }
  });
});

describe("the remaining auth variables", () => {
  test("mode accepts required|demo-open (case-insensitive); junk is inert while DISABLED, an issue while ENABLED", () => {
    expect(parseAuthConfig({ AISE_AUTH_MODE: "required" }).ok && (
      parseAuthConfig({ AISE_AUTH_MODE: "required" }) as { config: { mode: string } }
    ).config.mode).toBe("required");
    expect(parseAuthConfig({ AISE_AUTH_MODE: "DEMO-OPEN" }).ok && (
      parseAuthConfig({ AISE_AUTH_MODE: "DEMO-OPEN" }) as { config: { mode: string } }
    ).config.mode).toBe("demo-open");
    // INERT-WHEN-DISABLED: with the layer off, a malformed value changes no
    // behavior — it reports nothing here (check:env is the strict gate) and
    // the default applies.
    const inert = parseAuthConfig({ AISE_AUTH_MODE: "open" });
    expect(inert.ok).toBe(true);
    if (inert.ok) {
      expect(inert.config.mode).toBe("demo-open");
    }
    // ENABLED: the same junk is a fail-closed issue.
    const bad = parseAuthConfig({ AISE_AUTH: "1", AUTH_SECRET: "s", AISE_AUTH_MODE: "open" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues).toContain("AISE_AUTH_MODE: expected required|demo-open");
    }
    expect(AUTH_MODES).toEqual(["required", "demo-open"]);
  });

  test("session TTL is bounded 60..2592000 with the 7-day default; junk is inert only while disabled", () => {
    expect(parseAuthConfig({}).ok && (parseAuthConfig({}) as { config: { sessionTtlSeconds: number } }).config.sessionTtlSeconds).toBe(604_800);
    expect(parseAuthConfig({ AISE_SESSION_TTL_SECONDS: "60" }).ok && (
      parseAuthConfig({ AISE_SESSION_TTL_SECONDS: "60" }) as { config: { sessionTtlSeconds: number } }
    ).config.sessionTtlSeconds).toBe(60);
    expect(parseAuthConfig({ AISE_SESSION_TTL_SECONDS: "2592000" }).ok && (
      parseAuthConfig({ AISE_SESSION_TTL_SECONDS: "2592000" }) as { config: { sessionTtlSeconds: number } }
    ).config.sessionTtlSeconds).toBe(2_592_000);
    for (const bad of ["59", "2592001", "banana", ""]) {
      // Disabled: inert (the zero-behavior-change contract).
      const inert = parseAuthConfig({ AISE_SESSION_TTL_SECONDS: bad });
      expect(inert.ok).toBe(true);
      if (inert.ok) {
        expect(inert.config.sessionTtlSeconds).toBe(604_800);
      }
      // Enabled: fail closed with the precise issue.
      const enabled = parseAuthConfig({
        AISE_AUTH: "1",
        AUTH_SECRET: "s",
        AISE_SESSION_TTL_SECONDS: bad,
      });
      expect(enabled.ok).toBe(false);
      if (!enabled.ok) {
        expect(enabled.issues).toContain(
          "AISE_SESSION_TTL_SECONDS: expected an integer between 60 and 2592000 (seconds)",
        );
      }
    }
  });

  test("the demo principal id is 1..256 chars with the documented default; oversize is inert only while disabled", () => {
    expect(parseAuthConfig({}).ok && (parseAuthConfig({}) as { config: { demoPrincipalId: string } }).config.demoPrincipalId).toBe("demo-evaluator");
    expect(parseAuthConfig({ AISE_DEMO_PRINCIPAL: "evaluator-x" }).ok && (
      parseAuthConfig({ AISE_DEMO_PRINCIPAL: "evaluator-x" }) as { config: { demoPrincipalId: string } }
    ).config.demoPrincipalId).toBe("evaluator-x");
    const tooLong = "x".repeat(257);
    const inert = parseAuthConfig({ AISE_DEMO_PRINCIPAL: tooLong });
    expect(inert.ok).toBe(true);
    if (inert.ok) {
      expect(inert.config.demoPrincipalId).toBe("demo-evaluator");
    }
    const enabled = parseAuthConfig({ AISE_AUTH: "1", AUTH_SECRET: "s", AISE_DEMO_PRINCIPAL: tooLong });
    expect(enabled.ok).toBe(false);
    if (!enabled.ok) {
      expect(enabled.issues).toContain(
        "AISE_DEMO_PRINCIPAL: expected a non-empty value (1..256 characters)",
      );
    }
  });

  test("issue strings NEVER contain the submitted values (the leak discipline)", () => {
    const secret = "super-secret-value-do-not-print";
    const env: EnvRecord = {
      AISE_AUTH: "affirmative",
      AUTH_SECRET: secret,
      AISE_AUTH_MODE: "permissive",
      AISE_SESSION_TTL_SECONDS: "1",
      AISE_DEMO_PRINCIPAL: "",
    };
    const result = parseAuthConfig(env);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const issue of result.issues) {
        expect(issue).not.toContain(secret);
        expect(issue).not.toContain("affirmative");
        expect(issue).not.toContain("permissive");
      }
    }
  });
});

describe("authReadiness (the /readyz projection)", () => {
  test("disabled → {status:'disabled'} with no mode detail (byte-identical contract)", () => {
    expect(authReadiness({})).toEqual({ status: "disabled" });
    expect(authReadiness({ AISE_AUTH: "0" })).toEqual({ status: "disabled" });
  });

  test("enabled → {status:'enabled', mode}", () => {
    expect(authReadiness({ AISE_AUTH: "1", AUTH_SECRET: "s" })).toEqual({
      status: "enabled",
      mode: "demo-open",
    });
    expect(authReadiness({ AISE_AUTH: "1", AUTH_SECRET: "s", AISE_AUTH_MODE: "required" })).toEqual({
      status: "enabled",
      mode: "required",
    });
  });

  test("unbuildable → {status:'unavailable', issues} (names and expectations only)", () => {
    const readiness = authReadiness({ AISE_AUTH: "1" });
    expect(readiness.status).toBe("unavailable");
    expect(readiness.issues).toEqual([
      "AUTH_SECRET: required when AISE_AUTH=1 — set it to a long random string (see docs/INSTALL.md §Auth)",
    ]);
  });
});
