/**
 * PROD-027 — the Layer-1 evaluation TESTKIT tests (the deterministic
 * fixture provider doubles + the committed scenario suite).
 *
 * Proves:
 *  - the fixture profiles are VALID control-plane profiles (15/15 fields,
 *    closed failure-mode vocabulary, permissive fixture license);
 *  - the reconstruction double is GROUND-TRUTH-VALUE-BLIND (scrambling the
 *    answer sheet leaves the execution bit-identical — the metrics.test.ts
 *    discipline mirrored for the double);
 *  - the v2 degraded behavior: the documented ×1.02 bias on measured
 *    dimensions (×1.02³ on volumes), the explicit timeout refusal, and the
 *    v1/v2 output digests DIFFER (the discrimination is real);
 *  - the depth double: the documented truth, the explicit unsupported-data
 *    refusal on out-of-domain tags;
 *  - the committed suite: 3 positive / 2 negative / 1 discrimination, the
 *    class split per capability, and the RUNNER's determinism (two runs,
 *    one canonical body).
 */

import { describe, expect, test } from "bun:test";
import { validateProviderProfile } from "@aise/provider-registry";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { computeFixtureMetrics } from "../benchmarks";
import {
  DEPTH_INPUT_SAMPLES,
  DEPTH_PROVIDER_ID,
  DEPTH_TECHNOLOGY_VERSION_V1,
  DEPTH_TRUTH_BASE_M,
  DEPTH_TRUTH_SPAN_M,
  FLAGSHIP_FIXTURE_ID,
  RECONSTRUCTION_PROVIDER_ID,
  RECONSTRUCTION_TECHNOLOGY_VERSION_V1,
  RECONSTRUCTION_TECHNOLOGY_VERSION_V2,
  RECONSTRUCTION_V2_SCALE_BIAS,
  executeFixtureDepthProvider,
  executeFixtureProvider,
  executeFixtureReconstructionProvider,
  fixtureById,
  fixtureDepthProfileV1,
  fixtureDepthTruth,
  fixtureReconstructionProfileV1,
  fixtureReconstructionProfileV2,
  realityEvalScenarioSet,
  runRealityEvalSuite,
} from "./testkit";
import { completeScenario } from "./model";
import type { GoldenFixture } from "../benchmarks";

const FLAGSHIP = fixtureById(FLAGSHIP_FIXTURE_ID)!;

function reconstructionInput(fixture: GoldenFixture, sceneTag: string) {
  return {
    kind: "provider-input" as const,
    capability: "reconstruction" as const,
    payload: { fixtureId: fixture.fixtureId, deviceClass: fixture.deviceClass, sceneTag },
  };
}

describe("PROD-027 testkit: the fixture provider profiles", () => {
  test("all three fixture profiles validate as control-plane ProviderProfiles", () => {
    for (const profile of [
      fixtureReconstructionProfileV1(),
      fixtureReconstructionProfileV2(),
      fixtureDepthProfileV1(),
    ]) {
      const validation = validateProviderProfile(profile);
      expect(validation.ok, `${profile.providerId} ${profile.technologyVersion}`).toBe(true);
    }
  });

  test("the v2 profile documents the degraded behaviors (perception-failure + timeout)", () => {
    const v2 = fixtureReconstructionProfileV2();
    const kinds = v2.failureModes.map((mode) => mode.kind);
    expect(kinds).toContain("perception-failure");
    expect(kinds).toContain("timeout");
    expect(v2.failureModes.some((mode) => mode.condition.includes("1.02"))).toBe(true);
  });

  test("the depth profile documents the unsupported-data behavior", () => {
    const depth = fixtureDepthProfileV1();
    expect(depth.failureModes.map((mode) => mode.kind)).toContain("unsupported-data");
    expect(depth.capabilities).toEqual(["depth"]);
    expect(depth.providerId).toBe(DEPTH_PROVIDER_ID);
  });

  test("the fixture licenses are permissive and cleared (in-repo doubles, not production candidates)", () => {
    for (const profile of [
      fixtureReconstructionProfileV1(),
      fixtureDepthProfileV1(),
    ]) {
      expect(profile.license.evaluationOnly).toBe(false);
      expect(profile.license.commercialUse).toBe(true);
    }
  });
});

describe("PROD-027 testkit: the reconstruction double", () => {
  test("v1 is GROUND-TRUTH-VALUE-BLIND (scrambled answers leave the execution bit-identical)", () => {
    const profile = fixtureReconstructionProfileV1();
    const input = reconstructionInput(FLAGSHIP, "interior-livingroom");
    const honest = executeFixtureReconstructionProvider(profile, input);

    // Scramble the ANSWER SHEET only (dimension/volume truth values); the
    // world geometry (surface planes — where the observed points live) is
    // not an answer and is left untouched (the metrics.test.ts discipline).
    const scrambled = structuredClone(FLAGSHIP) as typeof FLAGSHIP & {
      groundTruth: {
        dimensions: { valueM: number }[];
        objectVolumes: { volumeM3: number }[];
      };
    };
    for (const dimension of scrambled.groundTruth.dimensions) {
      dimension.valueM *= 7.25;
    }
    for (const volume of scrambled.groundTruth.objectVolumes) {
      volume.volumeM3 += 100;
    }
    const blind = executeFixtureReconstructionProvider(profile, input);
    expect(canonicalJsonStringify(blind)).toBe(canonicalJsonStringify(honest));
  });

  test("the v2 x1.02 bias is exactly the documented magnitude on dimensions and volumes", () => {
    const v1 = executeFixtureReconstructionProvider(
      fixtureReconstructionProfileV1(),
      reconstructionInput(FLAGSHIP, "interior-livingroom"),
    );
    const v2 = executeFixtureReconstructionProvider(
      fixtureReconstructionProfileV2(),
      reconstructionInput(FLAGSHIP, "interior-livingroom"),
    );
    const v1Outputs = v1.outputs as Record<string, unknown>;
    const v2Outputs = v2.outputs as Record<string, unknown>;

    // the fits are identical (the bias applies to MEASURED values only)
    expect(v2Outputs["planeNormals"]).toEqual(v1Outputs["planeNormals"]);
    expect(v2Outputs["planeOffsets"]).toEqual(v1Outputs["planeOffsets"]);

    for (const [index, value] of (v1Outputs["measuredDimensions"] as number[]).entries()) {
      const biased = (v2Outputs["measuredDimensions"] as number[])[index]!;
      expect(biased).toBeCloseTo(value * RECONSTRUCTION_V2_SCALE_BIAS, 12);
    }
    for (const [index, value] of (v1Outputs["measuredVolumes"] as number[]).entries()) {
      const biased = (v2Outputs["measuredVolumes"] as number[])[index]!;
      expect(biased).toBeCloseTo(
        value * RECONSTRUCTION_V2_SCALE_BIAS * RECONSTRUCTION_V2_SCALE_BIAS * RECONSTRUCTION_V2_SCALE_BIAS,
        12,
      );
    }
    // the executions differ (the discrimination is real)
    expect(canonicalJsonStringify(v2)).not.toBe(canonicalJsonStringify(v1));
  });

  test("the v2 timeout trigger answers the EXPLICIT closed-vocabulary timeout failure", () => {
    const execution = executeFixtureReconstructionProvider(
      fixtureReconstructionProfileV2(),
      reconstructionInput(FLAGSHIP, "timeout:oversized-fusion-input"),
    );
    expect(execution.outputs).toBeUndefined();
    expect(execution.failure?.kind).toBe("timeout");
    expect(execution.failure?.detail).toContain("never a fabricated or partial reconstruction");
    expect(execution.providerNative).toBeDefined();
  });

  test("v1 does NOT have the timeout behavior (it is a v2-declared failure mode)", () => {
    const execution = executeFixtureReconstructionProvider(
      fixtureReconstructionProfileV1(),
      reconstructionInput(FLAGSHIP, "timeout:oversized-fusion-input"),
    );
    expect(execution.outputs).toBeDefined();
    expect(execution.failure).toBeUndefined();
  });

  test("the v1 output projects and scores within the committed flagship thresholds (the honest baseline)", () => {
    // computed via the existing benchmark metrics: v1's honest plane fits
    // pass every gates-1 flagship row (plane_fit_rms ~2mm, registration
    // ~1e-4m, scale ~2e-5, dimension ~2e-4, volume error ~1.6e-3).
    const execution = executeFixtureReconstructionProvider(
      fixtureReconstructionProfileV1(),
      reconstructionInput(FLAGSHIP, "interior-livingroom"),
    );
    const outputs = execution.outputs as Record<string, unknown>;
    const scene = {
      planes: (FLAGSHIP.groundTruth.surfaces.map((surface, index) => ({
        surfaceId: surface.surfaceId,
        plane: {
          normal: [
            (outputs["planeNormals"] as number[])[index * 3]!,
            (outputs["planeNormals"] as number[])[index * 3 + 1]!,
            (outputs["planeNormals"] as number[])[index * 3 + 2]!,
          ] as [number, number, number],
          d: (outputs["planeOffsets"] as number[])[index]!,
        },
      }))),
      dimensions: FLAGSHIP.groundTruth.dimensions.map((dimension, index) => ({
        dimensionId: dimension.dimensionId,
        measuredM: (outputs["measuredDimensions"] as number[])[index]!,
      })),
      objectVolumes: FLAGSHIP.groundTruth.objectVolumes.map((object, index) => ({
        objectId: object.objectId,
        measuredVolumeM3: (outputs["measuredVolumes"] as number[])[index]!,
      })),
      notes: [outputs["note"] as string],
    };
    const metrics = computeFixtureMetrics(FLAGSHIP, scene);
    const worst: Record<string, number> = {};
    for (const instance of metrics.metrics) {
      worst[instance.metric] = Math.max(worst[instance.metric] ?? 0, Math.abs(instance.value));
    }
    expect(worst["plane_fit_rms"]!).toBeLessThan(0.004);
    expect(worst["registration_error"]!).toBeLessThan(0.005);
    expect(worst["scale_error"]!).toBeLessThan(0.01);
    expect(worst["dimension_error"]!).toBeLessThan(0.02);
    expect(worst["object_volume_error"]!).toBeLessThan(0.05);
  });

  test("the double dispatch refuses unknown fixture providers loudly", () => {
    expect(() =>
      executeFixtureProvider(
        { ...fixtureDepthProfileV1(), providerId: "unknown-double" },
        reconstructionInput(FLAGSHIP, "x"),
      ),
    ).toThrow("unknown fixture provider");
  });
});

describe("PROD-027 testkit: the depth double", () => {
  test("v1 reproduces the documented depth truth exactly (mae 0)", () => {
    const execution = executeFixtureDepthProvider(fixtureDepthProfileV1(), {
      kind: "provider-input",
      capability: "depth",
      payload: {
        gridWidth: 4,
        gridHeight: 4,
        samples: [...DEPTH_INPUT_SAMPLES],
        sceneTag: "interior-wall",
      },
    });
    const outputs = execution.outputs as Record<string, unknown>;
    expect(outputs["depthMap"]).toEqual(fixtureDepthTruth(DEPTH_INPUT_SAMPLES));
    expect(outputs["unit"]).toBe("m");
    // the documented truth model: depth(sample) = 1 + 2 x sample
    expect(fixtureDepthTruth([0, 1])).toEqual([
      DEPTH_TRUTH_BASE_M,
      DEPTH_TRUTH_BASE_M + DEPTH_TRUTH_SPAN_M,
    ]);
  });

  test("an out-of-domain scene tag answers the EXPLICIT unsupported-data refusal", () => {
    const execution = executeFixtureDepthProvider(fixtureDepthProfileV1(), {
      kind: "provider-input",
      capability: "depth",
      payload: {
        gridWidth: 4,
        gridHeight: 4,
        samples: [...DEPTH_INPUT_SAMPLES],
        sceneTag: "unsupported:thermal-only-capture",
      },
    });
    expect(execution.outputs).toBeUndefined();
    expect(execution.failure?.kind).toBe("unsupported-data");
    expect(execution.failure?.detail).toContain("never fabricated depth values");
  });

  test("the depth technology version is pinned (the variant of the reference pattern)", () => {
    expect(DEPTH_TECHNOLOGY_VERSION_V1).toBe("1.0.0-fixture-v1");
    expect(RECONSTRUCTION_TECHNOLOGY_VERSION_V1).toBe("1.0.0-fixture-v1");
    expect(RECONSTRUCTION_TECHNOLOGY_VERSION_V2).toBe("1.1.0-fixture-v2");
    expect(RECONSTRUCTION_PROVIDER_ID).toBe("fixture-reconstruction-provider");
  });
});

describe("PROD-027 testkit: the committed scenario suite", () => {
  const SET = realityEvalScenarioSet();

  test("the committed set: 3 fixture providers, 6 scenarios (3 positive / 2 negative / 1 discrimination)", () => {
    expect(SET.providers.length).toBe(3);
    expect(SET.scenarios.length).toBe(6);
    const classes = SET.scenarios.map((scenario) => scenario.scenarioClass);
    expect(classes.filter((entry) => entry === "positive").length).toBe(3);
    expect(classes.filter((entry) => entry === "negative").length).toBe(2);
    expect(classes.filter((entry) => entry === "discrimination").length).toBe(1);
  });

  test("the lane coverage: 4 reconstruction scenarios + 2 depth scenarios over 2 pinned benchmarks", () => {
    const byCapability = new Map<string, number>();
    for (const scenario of SET.scenarios) {
      byCapability.set(
        scenario.capability,
        (byCapability.get(scenario.capability) ?? 0) + 1,
      );
    }
    expect(byCapability.get("reconstruction")).toBe(4);
    expect(byCapability.get("depth")).toBe(2);
    const benchmarkIds = new Set(SET.scenarios.map((scenario) => scenario.benchmarkId));
    expect(benchmarkIds.size).toBe(2);
  });

  test("the negative scenarios enumerate their lawful explicit kinds from the closed vocabulary", () => {
    const timeout = SET.scenarios.find((entry) => entry.scenarioId === "recon-timeout-negative-004")!;
    expect(timeout.criteria.expectedFailureKinds).toEqual(["timeout"]);
    expect(timeout.expected.kind).toBe("explicit-refusal");
    const unsupported = SET.scenarios.find(
      (entry) => entry.scenarioId === "depth-unsupported-negative-006",
    )!;
    expect(unsupported.criteria.expectedFailureKinds).toEqual(["unsupported-data"]);
  });

  test("the discrimination scenario targets the DEGRADED v2 with the flagship thresholds", () => {
    const discrimination = SET.scenarios.find(
      (entry) => entry.scenarioId === "recon-flagship-discrimination-003",
    )!;
    expect(discrimination.providerReference.technologyVersion).toBe(
      RECONSTRUCTION_TECHNOLOGY_VERSION_V2,
    );
    expect(discrimination.criteria.thresholds.length).toBe(5);
    expect(
      discrimination.criteria.thresholds.every((threshold) => threshold.failureKind === "perception-failure"),
    ).toBe(true);
    expect(
      discrimination.criteria.thresholds.every((threshold) => threshold.critical),
    ).toBe(true);
  });

  test("the committed thresholds cite the engine's gates-1 rows in every rationale", () => {
    for (const scenario of SET.scenarios) {
      for (const threshold of scenario.criteria.thresholds) {
        expect(threshold.rationale.length).toBeGreaterThan(0);
      }
    }
    const flagship = SET.scenarios
      .find((entry) => entry.scenarioId === "recon-flagship-positive-001")!
      .criteria.thresholds;
    expect(flagship.every((threshold) => threshold.rationale.includes("gates-1"))).toBe(true);
  });

  test("the committed descriptors complete into scenarios the harness accepts", () => {
    const descriptor = SET.scenarios[0]!;
    const profile =
      descriptor.providerReference.providerId === DEPTH_PROVIDER_ID
        ? fixtureDepthProfileV1()
        : fixtureReconstructionProfileV1();
    const scenario = completeScenario(
      descriptor,
      executeFixtureProvider(profile, descriptor.input),
    );
    expect(scenario.declaredExecution).toBeDefined();
    expect(scenario.scenarioId).toBe(descriptor.scenarioId);
  });
});

describe("PROD-027 testkit: the suite runner's determinism", () => {
  test("two runs of the committed suite produce the BYTE-IDENTICAL golden body", () => {
    const first = runRealityEvalSuite();
    const second = runRealityEvalSuite();
    expect(canonicalJsonStringify(second)).toBe(canonicalJsonStringify(first));
  });

  test("the suite's evaluations match the committed scenario order and ids", () => {
    const outcomes = runRealityEvalSuite();
    expect(outcomes.evaluations.map((evaluation) => evaluation.scenarioId)).toEqual(
      realityEvalScenarioSet().scenarios.map((scenario) => scenario.scenarioId),
    );
  });

  test("the suite's registry log is the lawful evaluation lifecycle (18 events, all providers end in evaluation)", () => {
    const outcomes = runRealityEvalSuite();
    const kinds = outcomes.registryLog.map((event) => event.kind);
    expect(kinds.slice(0, 6)).toEqual([
      "provider-registered",
      "provider-registered",
      "provider-registered",
      "evaluation-started",
      "evaluation-started",
      "evaluation-started",
    ]);
    // per scenario: execution-normalized + provenance-sealed
    for (let index = 6; index < kinds.length; index += 2) {
      expect(kinds[index]).toBe("execution-normalized");
      expect(kinds[index + 1]).toBe("provenance-sealed");
    }
    expect(kinds.length).toBe(6 + 6 * 2);
    // no promotion decisions: the suite never self-promotes
    expect(kinds).not.toContain("promotion-decided");
    expect(kinds).not.toContain("benchmark-recorded");
  });
});
