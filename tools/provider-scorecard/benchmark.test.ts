/**
 * HFX-401 — the tools-side check runner test: the COMMITTED-DATA leg of
 * the provider scorecard gate.
 *
 * The boundary matrix forbids tools → packages/backend imports, so this
 * test runs the standalone runner's PURE CORE (runAllDrills — no writes)
 * over the committed records and asserts every check passes. The
 * backend-side golden test is the live leg; this is the committed-data
 * leg — together they prove the engine's records, the committed files and
 * the mirrored derivation all agree byte-for-byte.
 */

import { describe, expect, test } from "bun:test";
import { runAllDrills } from "./runner";

describe("HFX-401 provider-scorecard runner (the committed-data leg)", () => {
  test(
    "the full drill suite passes over the committed records (scorecards + promotions + rollback)",
    () => {
      const report = runAllDrills();
      for (const entry of report.checks) {
        if (!entry.passed) {
          console.error(`(fail) ${entry.id}: ${entry.detail}`);
        }
      }
      expect(report.checks.length).toBeGreaterThan(50);
      expect(report.ok).toBe(true);
    },
    120000,
  );

  test(
    "the scored corpus is the committed seven-provider corpus",
    () => {
      const report = runAllDrills();
      expect(report.providerCount).toBe(7);
    },
    120000,
  );

  test(
    "the per-provider drill filter still verifies the provider's own records",
    () => {
      const report = runAllDrills("geometry-substitute-fine");
      expect(report.ok).toBe(true);
      expect(report.checks.length).toBeGreaterThan(5);
    },
    120000,
  );
});
