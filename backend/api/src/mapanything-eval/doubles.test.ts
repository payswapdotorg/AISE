/**
 * HFX-101 — the DOUBLES tests: the deterministic MapAnything evaluation
 * double's data-driven gates (task / resource / coverage / overlap), the
 * delegated well-grounded reconstruction core (byte-identical to the
 * reference double's geometry), the documented metric-depth deviation, the
 * explicit never-fabricate refusals and the opaque native payload.
 */

import { describe, expect, test } from "bun:test";
import {
  executeFixtureReconstructionProvider,
  fixtureReconstructionProfileV1,
} from "../reality-eval/testkit";
import {
  MAPANYTHING_DECLARED_FALLBACK,
  MAPANYTHING_DEPTH_OFFSET_M,
  MAPANYTHING_DEPTH_SCALE_DEVIATION,
  MAPANYTHING_MAX_FUSED_POINTS,
  MAPANYTHING_MIN_COVERAGE_RATIO,
  MAPANYTHING_MIN_INTER_PASS_OVERLAP_RATIO,
  mapAnythingProfile,
  validatedMapAnythingProfile,
} from "./model";
import { executeMapAnythingDouble, readCaptureGates } from "./doubles";
import { mapAnythingRunOf } from "./corpus";
import type { MapAnythingCaptureSet } from "./model";

const PROFILE = validatedMapAnythingProfile().profile;

function doubleOf(runId: string): ReturnType<typeof executeMapAnythingDouble> {
  const run = mapAnythingRunOf(runId);
  return executeMapAnythingDouble(PROFILE, run.scenario.input);
}

describe("HFX-101 doubles: the data-driven capture gates", () => {
  const gatesOf = (runId: string): MapAnythingCaptureSet => {
    const run = mapAnythingRunOf(runId);
    return JSON.parse(
      (run.scenario.input.payload as Record<string, unknown>)["captureSetJson"] as string,
    ) as MapAnythingCaptureSet;
  };

  test("the flagship multi-image capture set reads full coverage, single pass", () => {
    const readings = readCaptureGates(
      gatesOf("recon-multiimage-flagship-grounded-001@mapanything"),
      "fixture-flagship-livingroom-001",
    );
    expect(readings.coverageRatio).toBe(1);
    expect(readings.canonicalSurfaceCount).toBe(12);
    expect(readings.interPassOverlapRatio).toBeNull();
    expect(readings.fusedPoints).toBeLessThanOrEqual(MAPANYTHING_MAX_FUSED_POINTS);
  });

  test("the two-pass registration capture set reads 5/12 shared surfaces (41.7% >= 30%)", () => {
    const readings = readCaptureGates(
      gatesOf("recon-registration-twopass-grounded-003@mapanything"),
      "fixture-flagship-livingroom-001",
    );
    expect(readings.coverageRatio).toBe(1);
    expect(readings.interPassOverlapRatio).toBeCloseTo(5 / 12, 12);
    expect(readings.interPassOverlapRatio as number).toBeGreaterThanOrEqual(
      MAPANYTHING_MIN_INTER_PASS_OVERLAP_RATIO,
    );
  });

  test("the degraded fixtures read below their declared minimums (overlap 1/12, coverage 9/12)", () => {
    const overlap = readCaptureGates(
      gatesOf("recon-registration-degraded-overlap-005@mapanything"),
      "fixture-midrange-bedroom-001",
    );
    expect(overlap.coverageRatio).toBe(1); // the union still covers — ONLY the overlap gate fires
    expect(overlap.interPassOverlapRatio).toBeCloseTo(1 / 12, 12);
    expect(overlap.interPassOverlapRatio as number).toBeLessThan(
      MAPANYTHING_MIN_INTER_PASS_OVERLAP_RATIO,
    );
    const coverage = readCaptureGates(
      gatesOf("recon-multiimage-degraded-coverage-006@mapanything"),
      "fixture-midrange-bedroom-001",
    );
    expect(coverage.coveredSurfaceCount).toBe(9);
    expect(coverage.coverageRatio).toBe(0.75);
    expect(coverage.coverageRatio).toBeLessThan(MAPANYTHING_MIN_COVERAGE_RATIO);
  });

  test("the oversized fixture reads above the declared fused-point envelope", () => {
    const readings = readCaptureGates(
      gatesOf("recon-multiimage-failed-resource-007@mapanything"),
      "fixture-flagship-livingroom-001",
    );
    expect(readings.fusedPoints).toBe(57600);
    expect(readings.fusedPoints).toBeGreaterThan(MAPANYTHING_MAX_FUSED_POINTS);
    expect(readings.coverageRatio).toBe(1); // coverage itself is complete — ONLY the resource gate fires
  });
});

describe("HFX-101 doubles: the well-grounded content answers", () => {
  test("the reconstruction core is byte-identical to the reference double's geometry (provider substitution preserves semantics)", () => {
    const run = mapAnythingRunOf("recon-multiimage-flagship-grounded-001@mapanything");
    const mine = executeMapAnythingDouble(PROFILE, run.scenario.input);
    const reference = executeFixtureReconstructionProvider(
      fixtureReconstructionProfileV1(),
      {
        kind: "provider-input",
        capability: "reconstruction",
        payload: {
          fixtureId: "fixture-flagship-livingroom-001",
          deviceClass: "flagship_lidar",
          sceneTag: "interior-livingroom",
        },
      },
    );
    expect(mine.outputs).toBeDefined();
    expect(reference.outputs).toBeDefined();
    const mineOutputs = mine.outputs as Record<string, unknown>;
    const referenceOutputs = reference.outputs as Record<string, unknown>;
    expect(mineOutputs["planeNormals"]).toEqual(referenceOutputs["planeNormals"]);
    expect(mineOutputs["planeOffsets"]).toEqual(referenceOutputs["planeOffsets"]);
    expect(mineOutputs["measuredDimensions"]).toEqual(referenceOutputs["measuredDimensions"]);
    expect(mineOutputs["measuredVolumes"]).toEqual(referenceOutputs["measuredVolumes"]);
    // the lane's OWN declarations ride along (the note + the per-answer uncertainty):
    expect(mineOutputs["uncertaintySigmaM"]).toBe(0.002);
    expect(String(mineOutputs["note"])).toContain("multi-image fusion");
  });

  test("the registration answer declares the flagship capture envelope uncertainty", () => {
    const answer = doubleOf("recon-registration-twopass-grounded-003@mapanything");
    expect(answer.outputs?.["uncertaintySigmaM"]).toBe(0.002);
    expect(String(answer.outputs?.["note"])).toContain("least-squares plane fits");
  });

  test("the metric-depth answer carries the documented deviation profile (+0.1% scale, +2mm offset) with the declared sigma", () => {
    const answer = doubleOf("depth-metric-wall-grounded-004@mapanything");
    const depthMap = answer.outputs?.["depthMap"] as number[];
    const samples = (mapAnythingRunOf("depth-metric-wall-grounded-004@mapanything")
      .scenario.input.payload as Record<string, unknown>)["samples"] as number[];
    expect(depthMap.length).toBe(16);
    for (const [index, sample] of samples.entries()) {
      const truth = 1 + 2 * sample;
      expect(depthMap[index]).toBeCloseTo(
        truth * (1 + MAPANYTHING_DEPTH_SCALE_DEVIATION) + MAPANYTHING_DEPTH_OFFSET_M,
        12,
      );
    }
    expect(answer.outputs?.["unit"]).toBe("m");
    expect(answer.outputs?.["uncertaintySigmaM"]).toBe(0.005);
  });

  test("the opaque provider-native payload rides along for provenance only", () => {
    const answer = doubleOf("recon-multiimage-flagship-grounded-001@mapanything");
    expect(answer.providerNative?.mediaType).toBe(
      "application/aise-hfx101-mapanything-eval-double+json",
    );
    const payload = answer.providerNative?.payload as Record<string, unknown>;
    expect(payload["engine"]).toBe("mapanything-eval-double");
    expect(String(payload["note"])).toContain("never parsed into canonical domain types");
  });

  test("identical executions are byte-identical (determinism)", () => {
    const run = mapAnythingRunOf("recon-multiimage-midrange-grounded-002@mapanything");
    const first = executeMapAnythingDouble(PROFILE, run.scenario.input);
    const second = executeMapAnythingDouble(mapAnythingProfile(), run.scenario.input);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("HFX-101 doubles: the explicit never-fabricate gates", () => {
  test("the degraded-overlap gate answers the capture requirement + the bounded uncertainty (never downgraded geometry)", () => {
    const answer = doubleOf("recon-registration-degraded-overlap-005@mapanything");
    expect(answer.outputs).toBeUndefined();
    expect(answer.failure?.kind).toBe("unsupported-data");
    expect(answer.failure?.detail).toContain("capture requirement");
    expect(answer.failure?.detail).toContain("bounded uncertainty: sigma >= 0.05");
    expect(answer.failure?.detail).toContain("overlap");
    expect(answer.failure?.detail).toContain("never silently-downgraded geometry");
  });

  test("the degraded-coverage gate names the UNCOVERED surfaces in the capture requirement", () => {
    const answer = doubleOf("recon-multiimage-degraded-coverage-006@mapanything");
    expect(answer.failure?.kind).toBe("unsupported-data");
    expect(answer.failure?.detail).toContain("box_cabinet::ymax");
    expect(answer.failure?.detail).toContain("box_cabinet::zmin");
    expect(answer.failure?.detail).toContain("box_cabinet::zmax");
    expect(answer.failure?.detail).toContain("75.0%");
  });

  test("the resource gate answers the typed resource-exhaustion failure with the declared fallback (an explicit non-ready state)", () => {
    const answer = doubleOf("recon-multiimage-failed-resource-007@mapanything");
    expect(answer.outputs).toBeUndefined();
    expect(answer.failure?.kind).toBe("resource-exhaustion");
    expect(answer.failure?.detail).toContain("57600");
    expect(answer.failure?.detail).toContain("non-ready");
    expect(answer.failure?.detail).toContain(MAPANYTHING_DECLARED_FALLBACK);
    expect(answer.failure?.detail).toContain("never fabricated geometry");
  });

  test("the task gate answers the explicit unsupported refusal for a task outside the declared set", () => {
    const answer = doubleOf("recon-unsupported-novelview-008@mapanything");
    expect(answer.outputs).toBeUndefined();
    expect(answer.failure?.kind).toBe("unsupported-data");
    expect(answer.failure?.detail).toContain("novel-view-synthesis");
    expect(answer.failure?.detail).toContain("outside the declared capability set");
    expect(answer.failure?.detail).toContain(
      "multi-image-reconstruction, metric-depth, registration",
    );
    expect(answer.failure?.detail).toContain("never a guess");
  });

  test("the gates fire on DATA, not on magic tags (a well-formed capture set over the same scene tag answers content)", () => {
    // the degraded-overlap fixture's capture set behind a DIFFERENT (grounded) capture set on the same fixture: content
    const grounded = doubleOf("recon-multiimage-midrange-grounded-002@mapanything");
    expect(grounded.outputs).toBeDefined();
    expect(grounded.failure).toBeUndefined();
  });
});
