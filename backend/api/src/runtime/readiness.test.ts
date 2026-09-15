/**
 * Optional-provider readiness (runtime/readiness.ts) — PROD-003.
 *
 * /readyz reports {available|disabled|unavailable} per optional provider —
 * STATUSES ONLY, never credential material, never raw provider errors, and
 * no live probing (deterministic cold-start-safe readiness).
 *
 * Determinism: pure function over fixed env records.
 */

import { describe, expect, test } from "bun:test";
import { evaluateOptionalProviders, OPTIONAL_PROVIDERS } from "./readiness";

describe("the optional-provider registry", () => {
  test("declares exactly the providers the current runtime consumes", () => {
    // Mirrors tools/env-schema.ts's optionalProvider entries — see the
    // readiness.ts header for the documented mirror (not import) decision.
    expect(OPTIONAL_PROVIDERS).toEqual([{ id: "worldsculpt", envVar: "WORLDSCULPT_API_KEY" }]);
  });
});

describe("evaluateOptionalProviders", () => {
  test("unset provider credential → disabled", () => {
    expect(evaluateOptionalProviders({})).toEqual({ worldsculpt: "disabled" });
  });

  test("set, non-empty credential → available (configuration status, not a live probe)", () => {
    expect(evaluateOptionalProviders({ WORLDSCULPT_API_KEY: "ws-key-value" })).toEqual({
      worldsculpt: "available",
    });
  });

  test("present-but-empty credential → unavailable (misconfigured)", () => {
    expect(evaluateOptionalProviders({ WORLDSCULPT_API_KEY: "" })).toEqual({
      worldsculpt: "unavailable",
    });
    expect(evaluateOptionalProviders({ WORLDSCULPT_API_KEY: "   " })).toEqual({
      worldsculpt: "unavailable",
    });
  });

  test("the result NEVER contains the credential value", () => {
    const result = evaluateOptionalProviders({ WORLDSCULPT_API_KEY: "SUPER-SECRET-VALUE" });
    expect(JSON.stringify(result)).not.toContain("SUPER-SECRET-VALUE");
    expect(JSON.stringify(result)).not.toContain("WORLDSCULPT_API_KEY");
  });

  test("every optional provider is always reported (no silent omissions)", () => {
    const result = evaluateOptionalProviders({});
    for (const rule of OPTIONAL_PROVIDERS) {
      expect(result[rule.id]).toBeDefined();
    }
  });
});
