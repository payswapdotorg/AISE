/**
 * HFX-101 — the COMPARE tests: the per-lane provider comparison records —
 * the comparability-key join, the outcome counts, the metric deltas over
 * the shared content tasks (the reconstruction deltas exactly 0 — the
 * shared deterministic core; the depth deltas non-zero — the documented
 * deviation), the declared latency/resource + uncertainty profiles and the
 * honest note.
 */

import { describe, expect, test } from "bun:test";
import { runMapAnythingBenchmarkLifecycle } from "./registry";
import { compareMapAnythingLanes, MAPANYTHING_COMPARISON_HONEST_NOTE } from "./compare";
import { mapAnythingEvalRuns } from "./corpus";
import { evaluateMapAnythingRunCorpus } from "./harness";

describe("HFX-101 compare: the per-lane provider comparison records", () => {
  const lifecycle = runMapAnythingBenchmarkLifecycle();

  test("two lane comparisons (reconstruction + depth), each joining the candidate with the reference path", () => {
    expect(lifecycle.comparisons.length).toBe(2);
    const lanes = lifecycle.comparisons.map((comparison) => comparison.lane).sort();
    expect(lanes).toEqual(["depth", "reconstruction"]);
    for (const comparison of lifecycle.comparisons) {
      expect(comparison.rows.length).toBe(2);
      expect(comparison.rows[0]?.role).toBe("registered-candidate");
      expect(comparison.rows[0]?.providerId).toBe("mapanything");
      expect(comparison.rows[1]?.role).toBe("reference-path");
      expect(comparison.comparabilityKey).toBe(`${comparison.benchmarkId}|${comparison.capability}`);
      expect(comparison.honestNote).toBe(MAPANYTHING_COMPARISON_HONEST_NOTE);
    }
  });

  test("the reconstruction lane: the shared content tasks are the three grounded reconstruction tasks", () => {
    const reconstruction = lifecycle.comparisons.find(
      (comparison) => comparison.lane === "reconstruction",
    )!;
    expect(reconstruction.sharedContentTaskIds).toEqual([
      "recon-multiimage-flagship-grounded-001",
      "recon-multiimage-midrange-grounded-002",
      "recon-registration-twopass-grounded-003",
    ]);
    // the candidate row: 7 runs (3 content + 4 explicit refusals); the reference row: 3 content runs:
    expect(reconstruction.rows[0]?.runCount).toBe(7);
    expect(reconstruction.rows[0]?.contentRuns).toBe(3);
    expect(reconstruction.rows[0]?.refusalRuns).toBe(4);
    expect(reconstruction.rows[1]?.runCount).toBe(3);
    expect(reconstruction.rows[1]?.refusalRuns).toBe(0);
    // all four behavior-matrix cells passed on the candidate row:
    expect(reconstruction.rows[0]?.behaviorMatrixCellsPassed.length).toBe(4);
  });

  test("the reconstruction-lane metric deltas are EXACTLY 0 (the shared deterministic core — provider substitution preserves the canonical semantics)", () => {
    const reconstruction = lifecycle.comparisons.find(
      (comparison) => comparison.lane === "reconstruction",
    )!;
    expect(reconstruction.metricDeltas.length).toBe(18); // 3 shared tasks × 6 metric names (the 5 canonical + criteria_satisfied)
    for (const delta of reconstruction.metricDeltas) {
      expect(delta.delta).toBe(0);
      expect(delta.mapAnythingMeanAbs).toBe(delta.referenceMeanAbs);
    }
    for (const aggregate of reconstruction.aggregateDeltas) {
      expect(aggregate.delta).toBe(0);
    }
  });

  test("the depth-lane metric deltas are NON-ZERO (the documented deviation profile, within thresholds)", () => {
    const depth = lifecycle.comparisons.find((comparison) => comparison.lane === "depth")!;
    expect(depth.sharedContentTaskIds).toEqual(["depth-metric-wall-grounded-004"]);
    const mae = depth.aggregateDeltas.find((delta) => delta.metric === "depth_mae_m");
    const max = depth.aggregateDeltas.find((delta) => delta.metric === "depth_max_error_m");
    expect(mae?.delta).toBeCloseTo(0.00395625, 10);
    expect(max?.delta).toBeCloseTo(0.005, 12);
    expect(mae?.referenceMean).toBe(0); // the reference path reproduces the documented truth exactly
    expect(max?.referenceMean).toBe(0);
  });

  test("every row carries the DECLARED latency/resource profile and the uncertainty characteristics", () => {
    for (const comparison of lifecycle.comparisons) {
      for (const row of comparison.rows) {
        expect(row.resourceProfile.latencyMsP50).toBeGreaterThan(0);
        expect(row.resourceProfile.memoryMiB).toBeGreaterThan(0);
        expect(row.resourceProfile.costModel.length).toBeGreaterThan(0);
        expect(row.uncertaintyCharacteristics.calibration.length).toBeGreaterThan(0);
        expect(row.uncertaintyCharacteristics.perTask.length).toBe(row.runCount);
      }
      // the candidate declares measurement-uncertainty with per-answer sigmas; the reference
      // path declares none (its calibration is none-declared) — recorded, never fabricated:
      const candidate = comparison.rows[0]!;
      expect(candidate.uncertaintyCharacteristics.calibration).toBe("measurement-uncertainty");
      const reference = comparison.rows[1]!;
      expect(reference.uncertaintyCharacteristics.calibration).toBe("none-declared");
      expect(
        reference.uncertaintyCharacteristics.perTask.every((entry) => entry.declaredSigmaM === null),
      ).toBe(true);
    }
  });

  test("the rows chain the consolidated record + manifest ids (the comparability evidence)", () => {
    const reconstruction = lifecycle.comparisons.find(
      (comparison) => comparison.lane === "reconstruction",
    )!;
    const candidateRow = reconstruction.rows[0]!;
    const candidateVariant = lifecycle.variants.find((variant) => variant.variant === "mapanything")!;
    const candidateLane = candidateVariant.lanes.find((lane) => lane.lane === "reconstruction")!;
    expect(candidateRow.benchmarkRecordId).toBe(candidateLane.consolidatedRecord.recordId);
    expect(candidateRow.provenanceManifestId).toBe(candidateLane.consolidatedManifest.manifestId);
    expect(candidateRow.comparabilityKey).toBe(candidateLane.comparabilityKey);
    const referenceRow = reconstruction.rows[1]!;
    const referenceVariant = lifecycle.variants.find(
      (variant) => variant.variant === "reference-reconstruction",
    )!;
    expect(referenceRow.benchmarkRecordId).toBe(
      referenceVariant.lanes[0]?.consolidatedRecord.recordId ?? "",
    );
  });

  test("the deltas recompute from the outcomes alone (independent arithmetic)", () => {
    const outcomes = evaluateMapAnythingRunCorpus(mapAnythingEvalRuns());
    const comparisons = compareMapAnythingLanes(
      lifecycle.variants.flatMap((variant) =>
        variant.lanes.map((lane) => ({
          variant: variant.variant,
          lane: lane.lane,
          providerId: variant.providerId,
          technologyVersion: variant.technologyVersion,
          profileDigest: variant.profileDigest,
          benchmarkRecordId: lane.consolidatedRecord.recordId,
          provenanceManifestId: lane.consolidatedManifest.manifestId,
          outcomes: outcomes.filter(
            (outcome) =>
              outcome.variant === variant.variant &&
              outcome.layer1.record.capability === lane.lane,
          ),
        })),
      ),
    );
    expect(comparisons.length).toBe(2);
    for (const comparison of comparisons) {
      const committed = lifecycle.comparisons.find(
        (entry) => entry.lane === comparison.lane,
      )!;
      expect(JSON.stringify(comparison.metricDeltas)).toBe(JSON.stringify(committed.metricDeltas));
      expect(JSON.stringify(comparison.aggregateDeltas)).toBe(
        JSON.stringify(committed.aggregateDeltas),
      );
    }
  });

  test("the honest note states the deterministic-double limitation and the real-model slot-in", () => {
    expect(MAPANYTHING_COMPARISON_HONEST_NOTE).toContain("DETERMINISTIC IN-REPO DOUBLE");
    expect(MAPANYTHING_COMPARISON_HONEST_NOTE).toContain("not measured model behavior");
    expect(MAPANYTHING_COMPARISON_HONEST_NOTE).toContain("without any schema change");
  });
});
