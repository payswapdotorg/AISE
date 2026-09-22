/**
 * HFX-201 — the COMPARISON tests: the 8B vs 30B-A3B comparison record
 * over the same corpus — per-variant outcome counts, the comparability
 * key join, the honest note and the summary recomputation.
 */

import { describe, expect, test } from "bun:test";
import {
  VLM_COMPARISON_HONEST_NOTE,
  exhibitedFailureKindsOf,
  vlmVariantSummaryOf,
} from "./compare";
import { runVlmBenchmarkLifecycle } from "./registry";
import { evaluateVlmRunCorpus } from "./harness";
import { QWEN3_VL_VARIANTS } from "./model";

describe("HFX-201 comparison: the per-variant summaries over the same corpus", () => {
  const outcomes = evaluateVlmRunCorpus();

  test("each variant ran the same 12-scenario corpus", () => {
    for (const variant of QWEN3_VL_VARIANTS) {
      const summary = vlmVariantSummaryOf(variant, outcomes);
      expect(summary.scenarioCount).toBe(12);
      expect(summary.classificationMatches).toBe(12);
      expect(summary.expectedMatches).toBe(12);
    }
  });

  test("the 8B demonstration profile: 5 clean, 3 perception, 1 retrieval, 3 unsupported", () => {
    const summary = vlmVariantSummaryOf("qwen3-vl-8b", outcomes);
    expect(summary.byClassification).toEqual({
      none: 5,
      "perception-failure": 3,
      "retrieval-failure": 1,
      "unsupported-data": 3,
    });
    expect(summary.groundedFailureObservations).toBe(6);
    expect(summary.groundedObservationKinds).toEqual({
      "reasoning-failure": 2,
      "retrieval-failure": 1,
      "unsupported-data": 3,
    });
  });

  test("the 30B-A3B demonstration profile: 8 clean, 1 perception, 3 unsupported", () => {
    const summary = vlmVariantSummaryOf("qwen3-vl-30b-a3b", outcomes);
    expect(summary.byClassification).toEqual({
      none: 8,
      "perception-failure": 1,
      "unsupported-data": 3,
    });
    expect(summary.groundedFailureObservations).toBe(2);
    expect(summary.measurementUncertaintyRuns).toBe(2);
  });

  test("both variants pass all four behavior-matrix cells (the honest sides are exhibited)", () => {
    for (const variant of QWEN3_VL_VARIANTS) {
      const summary = vlmVariantSummaryOf(variant, outcomes);
      expect(summary.behaviorMatrixCellsPassed).toEqual([
        "conflicting-evidence",
        "grounded-pass",
        "missing-evidence",
        "unsupported-question",
      ]);
    }
  });

  test("the exhibited failure kinds come from the closed vocabulary (the five-way discrimination)", () => {
    const kinds = exhibitedFailureKindsOf(outcomes);
    expect(kinds).toEqual(["perception-failure", "retrieval-failure", "unsupported-data"]);
  });
});

describe("HFX-201 comparison: the comparison record", () => {
  const lifecycle = runVlmBenchmarkLifecycle();
  const comparison = lifecycle.comparison;

  test("the comparison record joins both variants on the comparability key", () => {
    expect(comparison.benchmarkId).toBe("qwen3-vl-multimodal-benchmark/1");
    expect(comparison.capability).toBe("multimodal-reasoning");
    expect(comparison.comparabilityKey).toBe("qwen3-vl-multimodal-benchmark/1|multimodal-reasoning");
    expect(comparison.rows.length).toBe(2);
    for (const row of comparison.rows) {
      expect(row.comparabilityKey).toBe(comparison.comparabilityKey);
      expect(row.licenseStatus).toBe("evaluation-only");
      expect(row.benchmarkRecordId).toMatch(/^[0-9a-f]{64}$/);
      expect(row.provenanceManifestId).toMatch(/^[0-9a-f]{64}$/);
      expect(row.scenarioCount).toBe(12);
      expect(row.expectedMatches).toBe(12);
    }
  });

  test("the rows carry the registered identities + digests (provider replacement joins here)", () => {
    const row8 = comparison.rows.find((row) => row.variant === "qwen3-vl-8b");
    const row30 = comparison.rows.find((row) => row.variant === "qwen3-vl-30b-a3b");
    expect(row8?.providerId).toBe("qwen3-vl-8b");
    expect(row8?.technologyVersion).toBe("8b-eval-doubles-1");
    expect(row30?.providerId).toBe("qwen3-vl-30b-a3b");
    expect(row30?.technologyVersion).toBe("30b-a3b-eval-doubles-1");
    expect(row8?.profileDigest).not.toBe(row30?.profileDigest);
    expect(row8?.benchmarkRecordId).not.toBe(row30?.benchmarkRecordId);
  });

  test("the honest note states both runs exercise deterministic doubles (never measured model behavior)", () => {
    expect(comparison.honestNote).toBe(VLM_COMPARISON_HONEST_NOTE);
    expect(comparison.honestNote).toContain("DETERMINISTIC IN-REPO DOUBLES");
    expect(comparison.honestNote).toContain("without any schema change");
  });

  test("the outcome counts differ across variants (the comparison discriminates)", () => {
    const row8 = comparison.rows.find((row) => row.variant === "qwen3-vl-8b");
    const row30 = comparison.rows.find((row) => row.variant === "qwen3-vl-30b-a3b");
    expect(row8?.outcomeCounts).not.toEqual(row30?.outcomeCounts);
    expect(row8?.groundedObservationCounts).not.toEqual(row30?.groundedObservationCounts);
  });
});
