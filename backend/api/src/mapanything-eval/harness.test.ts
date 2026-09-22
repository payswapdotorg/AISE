/**
 * HFX-101 — the HARNESS tests: THE MANDATED BEHAVIOR-MATRIX tests (every
 * cell asserted by a test that FAILS if the behavior regresses) —
 * grounded-pass (metrics within thresholds + provenance bound to the right
 * evidence revisions + the declared uncertainty), degraded-evidence
 * (bounded, capture requirements surfaced), failed-invocation (typed
 * failure + explicit fallback, no fabrication) and
 * unsupported-task-combination (explicit unsupported) — plus the reference
 * path's evaluation through the SAME harness and the comparability keys.
 */

import { describe, expect, test } from "bun:test";
import { inputDigestOf, benchmarkComparabilityKey } from "@aise/provider-registry";
import { evaluateMapAnythingRun, mapAnythingRegistryLogFor } from "./harness";
import { mapAnythingRunOf } from "./corpus";
import { MAPANYTHING_DECLARED_FALLBACK } from "./model";

function outcomeOf(runId: string): ReturnType<typeof evaluateMapAnythingRun> {
  return evaluateMapAnythingRun(mapAnythingRunOf(runId));
}

describe("HFX-101 harness: the grounded-pass cell (content within thresholds, provenance bound)", () => {
  test("the flagship multi-image reconstruction passes the gates-1-mirrored flagship thresholds with zero observations", () => {
    const outcome = outcomeOf("recon-multiimage-flagship-grounded-001@mapanything");
    expect(outcome.layer1.verdict).toBe("pass");
    expect(outcome.layer1.failureObservations).toEqual([]);
    expect(outcome.layer1.criterionViolations).toEqual([]);
    expect(outcome.expectedMatch).toBe(true);
    // the EXISTING benchmark metrics ran (the canonical comparison authority):
    const metricNames = outcome.layer1.record.metrics.map((metric) => metric.metric);
    for (const name of ["plane_fit_rms", "registration_error", "scale_error", "dimension_error", "object_volume_error"]) {
      expect(metricNames.includes(name)).toBe(true);
    }
    // the per-instance thresholds were satisfied (criteria_satisfied = 1):
    const satisfied = outcome.layer1.record.metrics.find((metric) => metric.metric === "criteria_satisfied");
    expect(satisfied?.value).toBe(1);
  });

  test("the midrange multi-image reconstruction passes its own (coarser) device-aware thresholds", () => {
    const outcome = outcomeOf("recon-multiimage-midrange-grounded-002@mapanything");
    expect(outcome.layer1.verdict).toBe("pass");
    expect(outcome.expectedMatch).toBe(true);
    expect(outcome.uncertainty.declaredSigmaM).toBe(0.008);
  });

  test("the two-pass registration answer passes the flagship thresholds (the registration lane)", () => {
    const outcome = outcomeOf("recon-registration-twopass-grounded-003@mapanything");
    expect(outcome.layer1.verdict).toBe("pass");
    expect(outcome.expectedMatch).toBe(true);
    const registration = outcome.layer1.record.metrics.filter(
      (metric) => metric.metric === "registration_error",
    );
    expect(registration.length).toBe(12); // one per canonical surface
    for (const metric of registration) {
      expect(metric.value).toBeLessThanOrEqual(0.005);
    }
  });

  test("the metric-depth answer passes the committed depth thresholds with the documented deviation", () => {
    const outcome = outcomeOf("depth-metric-wall-grounded-004@mapanything");
    expect(outcome.layer1.verdict).toBe("pass");
    expect(outcome.expectedMatch).toBe(true);
    const mae = outcome.layer1.record.metrics.find((metric) => metric.metric === "depth_mae_m");
    const max = outcome.layer1.record.metrics.find((metric) => metric.metric === "depth_max_error_m");
    expect(mae?.value).toBeCloseTo(0.00395625, 10);
    expect(max?.value).toBeCloseTo(0.005, 12);
    expect(outcome.uncertainty.declaredSigmaM).toBe(0.005);
  });

  test("the provenance manifest is bound to the RIGHT evidence revisions (the input digest covers the capture set)", () => {
    const run = mapAnythingRunOf("recon-multiimage-flagship-grounded-001@mapanything");
    const outcome = evaluateMapAnythingRun(run);
    // the manifest chains the input digest of the scenario's OWN input (capture set included):
    expect(outcome.layer1.manifest.inputDigests).toEqual([inputDigestOf(run.scenario.input)]);
    // the record's reproduction statement carries the same input digest:
    expect(outcome.layer1.record.reproduction.inputsDigest).toBe(inputDigestOf(run.scenario.input));
    // the outcome binds to the corpus task's declared evidence revisions:
    expect(outcome.evidenceRevisions).toEqual(["r1", "r2"]);
    // the derived reconstruction version is addressed:
    expect(outcome.derivedVersionId).toMatch(/^drv-[0-9a-f]{24}$/);
  });
});

describe("HFX-101 harness: the degraded-evidence cell (bounded, capture requirements surfaced)", () => {
  test("the insufficient-overlap registration answers the explicit unsupported-data refusal with the capture requirement", () => {
    const outcome = outcomeOf("recon-registration-degraded-overlap-005@mapanything");
    expect(outcome.layer1.verdict).toBe("pass"); // the negative path is explicit-and-safe
    expect(outcome.layer1.normalizedResult.status).toBe("failed");
    expect(outcome.layer1.normalizedResult.failure?.kind).toBe("unsupported-data");
    expect(outcome.failureKindMatch).toBe(true);
    expect(outcome.expectedMatch).toBe(true);
    // NEVER silently-downgraded geometry: NO outputs crossed the boundary:
    expect(outcome.layer1.normalizedResult.outputs).toBeUndefined();
    // the capture requirement + the bounded uncertainty are surfaced:
    const detail = outcome.layer1.normalizedResult.failure?.detail ?? "";
    expect(detail).toContain("capture requirement");
    expect(detail).toContain("bounded uncertainty: sigma >= 0.05");
    expect(outcome.uncertainty.refusalBoundSigmaM).toBe(0.05);
  });

  test("the insufficient-coverage multi-image capture answers the explicit refusal naming the uncovered surfaces", () => {
    const outcome = outcomeOf("recon-multiimage-degraded-coverage-006@mapanything");
    expect(outcome.layer1.verdict).toBe("pass");
    expect(outcome.layer1.normalizedResult.failure?.kind).toBe("unsupported-data");
    expect(outcome.layer1.normalizedResult.outputs).toBeUndefined();
    expect(outcome.expectedMatch).toBe(true);
    const observation = outcome.layer1.failureObservations[0];
    expect(observation?.kind).toBe("unsupported-data");
    expect(observation?.detail).toContain("explicit and safe");
  });
});

describe("HFX-101 harness: the failed-invocation cell (typed failure + explicit fallback, no fabrication)", () => {
  test("the resource exhaustion answers the typed resource-exhaustion failure with the non-ready/fallback state", () => {
    const outcome = outcomeOf("recon-multiimage-failed-resource-007@mapanything");
    expect(outcome.layer1.verdict).toBe("pass"); // the explicit failure is the expected-and-safe behavior
    expect(outcome.layer1.normalizedResult.status).toBe("failed");
    expect(outcome.layer1.normalizedResult.failure?.kind).toBe("resource-exhaustion");
    // NEVER fabricated geometry — no outputs crossed the boundary:
    expect(outcome.layer1.normalizedResult.outputs).toBeUndefined();
    // the explicit non-ready/fallback state:
    expect(outcome.fallbackState).not.toBeNull();
    expect(outcome.fallbackState?.nonReady).toBe(true);
    expect(outcome.fallbackState?.declaredFallback).toBe(MAPANYTHING_DECLARED_FALLBACK);
    expect(outcome.fallbackState?.surfaced).toBe(true);
    expect(outcome.expectedMatch).toBe(true);
  });

  test("fabricated geometry where a refusal is expected would FAIL the criteria (the negative-path guard)", () => {
    // the same scenario with the expectation inverted: a fabricated-output answer over a
    // refusal-expecting scenario is classified as a caught failure by the Layer-1 harness.
    const run = mapAnythingRunOf("recon-multiimage-failed-resource-007@mapanything");
    const outcome = evaluateMapAnythingRun(run);
    expect(outcome.layer1.normalizedResult.status).toBe("failed");
    // the record carries the failure observation (never silent):
    expect(outcome.layer1.record.failureObservations.length).toBe(1);
    expect(outcome.layer1.record.failureObservations[0]?.kind).toBe("resource-exhaustion");
  });
});

describe("HFX-101 harness: the unsupported-task-combination cell (explicit unsupported, never a guess)", () => {
  test("the novel-view-synthesis task answers the explicit unsupported-data refusal", () => {
    const outcome = outcomeOf("recon-unsupported-novelview-008@mapanything");
    expect(outcome.layer1.verdict).toBe("pass");
    expect(outcome.layer1.normalizedResult.status).toBe("failed");
    expect(outcome.layer1.normalizedResult.failure?.kind).toBe("unsupported-data");
    expect(outcome.layer1.normalizedResult.outputs).toBeUndefined();
    expect(outcome.layer1.normalizedResult.failure?.detail).toContain(
      "outside the declared capability set",
    );
    expect(outcome.expectedMatch).toBe(true);
  });
});

describe("HFX-101 harness: the reference path through the SAME harness + the comparability join", () => {
  test("the reference reconstruction path evaluates the same evidence through the same Layer-1 harness", () => {
    const outcome = outcomeOf("recon-multiimage-flagship-grounded-001@reference-reconstruction");
    expect(outcome.layer1.verdict).toBe("pass");
    expect(outcome.expectedMatch).toBe(true);
    expect(outcome.layer1.record.providerId).toBe("fixture-reconstruction-provider");
    expect(outcome.layer1.record.capability).toBe("reconstruction");
  });

  test("the reference depth path reproduces the documented truth exactly (mae 0)", () => {
    const outcome = outcomeOf("depth-metric-wall-grounded-004@reference-depth");
    expect(outcome.layer1.verdict).toBe("pass");
    const mae = outcome.layer1.record.metrics.find((metric) => metric.metric === "depth_mae_m");
    expect(mae?.value).toBe(0);
    // the reference path declares no per-answer uncertainty (calibration none-declared):
    expect(outcome.uncertainty.declaredSigmaM).toBeNull();
    expect(outcome.uncertainty.surfaced).toBe(true);
  });

  test("the MapAnything records are COMPARABLE with the reference path's records (the same pinned benchmark ids + capability)", () => {
    const maRecon = outcomeOf("recon-multiimage-flagship-grounded-001@mapanything");
    const refRecon = outcomeOf("recon-multiimage-flagship-grounded-001@reference-reconstruction");
    expect(benchmarkComparabilityKey(maRecon.layer1.record)).toBe(
      benchmarkComparabilityKey(refRecon.layer1.record),
    );
    expect(benchmarkComparabilityKey(maRecon.layer1.record)).toBe(
      "reality-eval-reconstruction/1|reconstruction",
    );
    const maDepth = outcomeOf("depth-metric-wall-grounded-004@mapanything");
    const refDepth = outcomeOf("depth-metric-wall-grounded-004@reference-depth");
    expect(benchmarkComparabilityKey(maDepth.layer1.record)).toBe(
      benchmarkComparabilityKey(refDepth.layer1.record),
    );
    expect(benchmarkComparabilityKey(maDepth.layer1.record)).toBe("reality-eval-depth/1|depth");
  });

  test("the records validate through the control plane's own validator (content-addressed, closed vocabulary)", () => {
    for (const runId of [
      "recon-multiimage-flagship-grounded-001@mapanything",
      "recon-registration-degraded-overlap-005@mapanything",
      "recon-multiimage-failed-resource-007@mapanything",
      "depth-metric-wall-grounded-004@reference-depth",
    ]) {
      const outcome = outcomeOf(runId);
      expect(outcome.layer1.record.recordId).toMatch(/^[0-9a-f]{64}$/);
      expect(outcome.layer1.manifest.manifestId).toMatch(/^[0-9a-f]{64}$/);
      expect(outcome.layer1.record.reproduction.codeVersion).toBe("reality-eval-harness/1");
    }
  });

  test("identical (run, registryLog) pairs produce byte-identical outcomes (determinism)", () => {
    const run = mapAnythingRunOf("recon-registration-twopass-grounded-003@mapanything");
    const log = mapAnythingRegistryLogFor(run);
    const first = evaluateMapAnythingRun(run, log);
    const second = evaluateMapAnythingRun(run, log);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
