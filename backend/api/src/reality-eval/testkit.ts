/**
 * PROD-027 — the Layer-1 evaluation TESTKIT: deterministic fixture providers
 * + the committed scenario suite runner + the committed-golden loaders.
 *
 * THE FIXTURE DOUBLES (mirroring the HFX-000 reference-provider pattern —
 * deterministic in-repo doubles, NO network, NO real model/dataset/Space;
 * MapAnything and Video Depth Anything are FUTURE consumers of this entry
 * point, never implemented here):
 *
 *  - `fixture-reconstruction-provider`
 *      · v1 `1.0.0-fixture-v1` (GOOD): least-squares plane fits over the
 *        GROUND-TRUTH-BLIND capture view of the pinned Layer-1 golden
 *        fixture — the honest measured baseline that PASSES the committed
 *        thresholds;
 *      · v2 `1.1.0-fixture-v2` (DEGRADED): the same fits with a systematic
 *        ×1.02 linear scale bias on measured dimensions (×1.02³ on volumes)
 *        — the plausible-but-wrong geometry the DISCRIMINATION scenarios
 *        must catch — plus the documented explicit `timeout` behavior on
 *        `sceneTag` values starting with "timeout:" (never a fabricated
 *        partial result);
 *  - `fixture-reality-depth-provider` v1 `1.0.0-fixture-v1` (the reference
 *    depth pattern's VARIANT): reproduces the documented depth truth
 *    exactly, and answers the explicit `unsupported-data` refusal on
 *    out-of-domain scene tags (values starting with "unsupported:") — never
 *    fabricated depth values.
 *
 * THE COMMITTED SUITE: `realityEvalScenarioSet()` builds the complete
 * scenario set deterministically (the provider declarations + the six
 * committed scenarios: 3 positive / 2 negative / 1 discrimination); the
 * regeneration CLI (`regenerate.ts`) writes it to
 * `tools/reality-eval/scenario.json` and the golden outcomes to
 * `tools/reality-eval/fixtures/expected-outcomes.json` (canonical JSON —
 * sorted keys, 2-space indent, trailing newline). `runRealityEvalSuite()`
 * loads the COMMITTED set, drives the full control-plane lifecycle
 * (register → evaluation-started → per scenario: execution-normalized →
 * benchmark-recorded → provenance-sealed) and returns the golden body; the
 * golden tests byte-compare it against the committed files (drift fails the
 * gate).
 *
 * Determinism: PURE DETERMINISTIC COMPUTATION — no network, no clock reads,
 * no randomness. Identical constructions are byte-identical.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  applyRegistryEvent,
  createProviderRegistry,
  inputDigestOf,
  providerResultDigestOf,
  toLicenseDeclaration,
} from "@aise/provider-registry";
import type {
  ProviderInput,
  ProviderProfile,
  ProviderRegistry,
  ProviderRegistryEvent,
  RawProviderExecution,
} from "@aise/provider-registry";
import { captureViewOf, fixtureById, measurePlanePair } from "../benchmarks";
import { fitPlane } from "../geometry";
import { evaluateScenario, REALITY_EVAL_HARNESS_CODE_VERSION } from "./harness";
import type { ScenarioEvaluation } from "./harness";
import {
  completeScenario,
  LANE_BENCHMARK_IDS,
  REALITY_EVAL_OUTCOMES_KIND,
  REALITY_EVAL_OUTCOMES_SCHEMA_VERSION,
  REALITY_EVAL_SCENARIO_SET_KIND,
  REALITY_EVAL_SCENARIO_SET_SCHEMA_VERSION,
  scenarioSetDigestOf,
  validateRealityEvalScenarioSet,
  type RealityEvalScenario,
  type RealityEvalScenarioDescriptor,
  type RealityEvalScenarioSet,
  type RealityEvalGoldenOutcomes,
  type ScenarioClass,
  type ScenarioEvaluationProjection,
  type ScenarioMetricThreshold,
} from "./model";

/* ------------------------------------------------------------------ */
/* The committed fixture-provider world (fixed, documented)             */
/* ------------------------------------------------------------------ */

export const RECONSTRUCTION_PROVIDER_ID = "fixture-reconstruction-provider" as const;
export const RECONSTRUCTION_TECHNOLOGY_VERSION_V1 = "1.0.0-fixture-v1" as const;
export const RECONSTRUCTION_TECHNOLOGY_VERSION_V2 = "1.1.0-fixture-v2" as const;
export const RECONSTRUCTION_CAPABILITY = "reconstruction" as const;

export const DEPTH_PROVIDER_ID = "fixture-reality-depth-provider" as const;
export const DEPTH_TECHNOLOGY_VERSION_V1 = "1.0.0-fixture-v1" as const;
export const DEPTH_CAPABILITY = "depth" as const;

/** The v2 deterministic defect: ×1.02 linear scale bias (volumes ×1.02³). */
export const RECONSTRUCTION_V2_SCALE_BIAS = 1.02;

/** The documented depth truth: depth(sample) = 1.0 + 2.0 × sample (→ [1, 3] m). */
export const DEPTH_TRUTH_BASE_M = 1.0;
export const DEPTH_TRUTH_SPAN_M = 2.0;

/** The canonical 4×4 depth fixture samples (normalized, row-major). */
export const DEPTH_GRID_WIDTH = 4;
export const DEPTH_GRID_HEIGHT = 4;
export const DEPTH_INPUT_SAMPLES: readonly number[] = [
  0, 0.2, 0.4, 0.6, 0.8, 1, 0.9, 0.7, 0.5, 0.3, 0.1, 0.25, 0.75, 0.35, 0.65, 0.15,
];

/** The DOCUMENTED depth truth over the canonical samples. */
export function fixtureDepthTruth(samples: readonly number[]): number[] {
  return samples.map((sample) => DEPTH_TRUTH_BASE_M + DEPTH_TRUTH_SPAN_M * sample);
}

/* ------------------------------------------------------------------ */
/* The declared I/O contracts                                           */
/* ------------------------------------------------------------------ */

function reconstructionIOContracts() {
  const inputContract = {
    contractId: "fixture-reconstruction-input/1",
    modality: "point-cloud",
    fields: [
      {
        name: "fixtureId",
        type: "string",
        required: true,
        description: "the pinned Layer-1 golden fixture id (the canonical benchmark fixture the provider is evaluated over)",
        minLength: 1,
        maxLength: 128,
      },
      {
        name: "deviceClass",
        type: "string",
        required: true,
        description: "the device class of the fixture's synthetic capture (must match the fixture's own class)",
        minLength: 1,
        maxLength: 32,
      },
      {
        name: "sceneTag",
        type: "string",
        required: true,
        description:
          "declared scene class; on the degraded v2 a tag starting with 'timeout:' triggers the documented explicit timeout refusal",
        minLength: 1,
        maxLength: 128,
      },
    ],
  } as const;
  const outputContract = {
    contractId: "fixture-reconstruction-output/1",
    modality: "point-cloud",
    fields: [
      {
        name: "planeNormals",
        type: "number-array",
        required: true,
        description: "unit plane normal components (x, y, z per canonical surface, aligned with the fixture's surface order); unit-norm is enforced at the canonical projection",
        minLength: 3,
        maxLength: 512,
      },
      {
        name: "planeOffsets",
        type: "number-array",
        required: true,
        description: "plane offsets d (dot(normal, x) + d = 0), one per canonical surface; finiteness is enforced at the canonical projection",
        maxLength: 256,
      },
      {
        name: "measuredDimensions",
        type: "number-array",
        required: true,
        description: "measured linear dimensions (meters), aligned with the fixture's measurement-request order",
        min: 0,
        max: 1000,
        minLength: 1,
        maxLength: 256,
      },
      {
        name: "measuredVolumes",
        type: "number-array",
        required: true,
        description: "measured object volumes (cubic meters), aligned with the fixture's object order",
        min: 0,
        max: 10000,
        minLength: 1,
        maxLength: 256,
      },
      {
        name: "note",
        type: "string",
        required: true,
        description: "the engine's deterministic diagnostic note (carried verbatim)",
        minLength: 1,
        maxLength: 512,
      },
    ],
  } as const;
  return { inputContract, outputContract };
}

function depthIOContracts() {
  const inputContract = {
    contractId: "fixture-reality-depth-input/1",
    modality: "image",
    fields: [
      {
        name: "gridWidth",
        type: "integer",
        required: true,
        description: "grid width of the fixture sample grid (cells)",
        min: 1,
        max: 64,
      },
      {
        name: "gridHeight",
        type: "integer",
        required: true,
        description: "grid height of the fixture sample grid (cells)",
        min: 1,
        max: 64,
      },
      {
        name: "samples",
        type: "number-array",
        required: true,
        description: "normalized sample values in [0, 1], row-major gridWidth x gridHeight",
        min: 0,
        max: 1,
        minLength: 1,
        maxLength: 4096,
      },
      {
        name: "sceneTag",
        type: "string",
        required: true,
        description:
          "declared scene class; a tag starting with 'unsupported:' (out-of-domain input) triggers the explicit unsupported-data refusal",
        minLength: 1,
        maxLength: 128,
      },
    ],
  } as const;
  const outputContract = {
    contractId: "fixture-reality-depth-output/1",
    modality: "depth-map",
    fields: [
      {
        name: "depthMap",
        type: "number-array",
        required: true,
        description: "estimated depth per grid cell (meters), row-major gridWidth x gridHeight",
        min: 0,
        max: 4,
        minLength: 1,
        maxLength: 4096,
      },
      {
        name: "unit",
        type: "string",
        required: true,
        description: "the depth unit of the depthMap values (Layer-1 canonical depth is meters)",
        minLength: 1,
        maxLength: 8,
      },
    ],
  } as const;
  return { inputContract, outputContract };
}

/* ------------------------------------------------------------------ */
/* The fixture provider profiles                                        */
/* ------------------------------------------------------------------ */

function fixtureLicense() {
  return toLicenseDeclaration({
    identifier: "fixture-eval-permissive-1.0",
    commercialUse: true,
    intendedUse:
      "deterministic Layer-1 evaluation fixtures behind the AISE reality-eval harness (in-repo doubles, no real model)",
    intendedUseCleared: true,
  });
}

function reconstructionProfileBase(): Omit<
  ProviderProfile,
  "technologyVersion" | "failureModes" | "description" | "displayName"
> {
  const { inputContract, outputContract } = reconstructionIOContracts();
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    providerId: RECONSTRUCTION_PROVIDER_ID,
    capabilities: [RECONSTRUCTION_CAPABILITY],
    supportedModalities: ["point-cloud", "mesh"],
    computeProfile: {
      accelerator: "none",
      minimumCores: 1,
      recommendedCores: 1,
      offlineCapable: true,
      statement: "deterministic fixture computation — no accelerator, fully offline",
    },
    memoryProfile: {
      minimumMiB: 16,
      recommendedMiB: 32,
      statement: "declared fixture memory envelope (no environment is sensed)",
    },
    latencyProfile: {
      expectedMsP50: 1,
      expectedMsP95: 5,
      timeoutMs: 5000,
      statement: "declared fixture latencies — no wall-clock measurement exists in the harness",
    },
    license: fixtureLicense(),
    costProfile: {
      model: "none",
      unitCost: 0,
      currency: "n/a",
      quotaPolicy: "fixture provider — deterministic local computation, no quota, no fallback needed",
    },
    inputContract,
    outputContract,
    provenanceContract: {
      providerIdentityRequired: true,
      configurationDigestRequired: true,
      inputDigestRequired: true,
      nativePayloadPolicy: "opaque-required",
    },
    uncertaintyCharacteristics: {
      calibration: "none-declared",
      confidenceSeparateFromMeasurementUncertainty: true,
      notes:
        "the fixture emits deterministic geometry values without confidence scores and without measurement " +
        "uncertainty — confidence is never fabricated and never substitutes for measurement uncertainty",
    },
    benchmarkResults: [],
  };
}

/** The v1 reconstruction fixture profile — the GOOD baseline. */
export function fixtureReconstructionProfileV1(): ProviderProfile {
  return {
    ...reconstructionProfileBase(),
    technologyVersion: RECONSTRUCTION_TECHNOLOGY_VERSION_V1,
    displayName: "Fixture Reconstruction Provider v1",
    description:
      "Deterministic reference reconstruction fixture (v1): least-squares plane fits over the ground-truth-blind " +
      "capture view of the pinned Layer-1 golden fixtures — the honest measured baseline that passes the committed thresholds.",
    failureModes: [
      {
        kind: "contract-mismatch",
        condition: "input or output payload violates the declared contracts",
        behavior: "typed normalization refusal with structured issues — never a silent coercion",
      },
    ],
  };
}

/** The v2 reconstruction fixture profile — the DEGRADED discrimination double. */
export function fixtureReconstructionProfileV2(): ProviderProfile {
  return {
    ...reconstructionProfileBase(),
    technologyVersion: RECONSTRUCTION_TECHNOLOGY_VERSION_V2,
    displayName: "Fixture Reconstruction Provider v2",
    description:
      "Deterministic reference reconstruction fixture (v2, degraded): a systematic x1.02 linear scale bias on " +
      "measured dimensions and volumes — plausible-but-wrong geometry the discrimination criteria must catch — " +
      "plus the documented explicit timeout behavior.",
    failureModes: [
      {
        kind: "perception-failure",
        condition:
          "the systematic x1.02 linear scale bias on measured dimensions (x1.02^3 on volumes) — the documented degraded behavior",
        behavior:
          "the biased output is contract-valid and plausible — the scenario's per-instance thresholds must CATCH it " +
          "and record the perception-failure observation (never a silent low score)",
      },
      {
        kind: "timeout",
        condition: "sceneTag starting with 'timeout:' (an input exceeding the declared latency budget)",
        behavior:
          "the explicit closed-vocabulary timeout refusal — never a fabricated or partial reconstruction",
      },
      {
        kind: "contract-mismatch",
        condition: "input or output payload violates the declared contracts",
        behavior: "typed normalization refusal with structured issues — never a silent coercion",
      },
    ],
  };
}

/** The depth fixture profile — the reference depth pattern's variant. */
export function fixtureDepthProfileV1(): ProviderProfile {
  const { inputContract, outputContract } = depthIOContracts();
  return {
    kind: "provider-profile",
    schemaVersion: "provider-profile/1",
    providerId: DEPTH_PROVIDER_ID,
    capabilities: [DEPTH_CAPABILITY],
    supportedModalities: ["image", "depth-map"],
    computeProfile: {
      accelerator: "none",
      minimumCores: 1,
      recommendedCores: 1,
      offlineCapable: true,
      statement: "deterministic fixture computation — no accelerator, fully offline",
    },
    memoryProfile: {
      minimumMiB: 16,
      recommendedMiB: 32,
      statement: "declared fixture memory envelope (no environment is sensed)",
    },
    latencyProfile: {
      expectedMsP50: 0.5,
      expectedMsP95: 1,
      timeoutMs: 5000,
      statement: "declared fixture latencies — no wall-clock measurement exists in the harness",
    },
    license: fixtureLicense(),
    costProfile: {
      model: "none",
      unitCost: 0,
      currency: "n/a",
      quotaPolicy: "fixture provider — deterministic local computation, no quota, no fallback needed",
    },
    inputContract,
    outputContract,
    provenanceContract: {
      providerIdentityRequired: true,
      configurationDigestRequired: true,
      inputDigestRequired: true,
      nativePayloadPolicy: "opaque-required",
    },
    uncertaintyCharacteristics: {
      calibration: "none-declared",
      confidenceSeparateFromMeasurementUncertainty: true,
      notes:
        "the fixture emits deterministic depth values without confidence scores and without measurement " +
        "uncertainty — confidence is never fabricated and never substitutes for measurement uncertainty",
    },
    benchmarkResults: [],
    technologyVersion: DEPTH_TECHNOLOGY_VERSION_V1,
    displayName: "Fixture Reality Depth Provider v1",
    description:
      "Deterministic depth-estimation fixture (the HFX-000 reference pattern's variant): reproduces the documented " +
      "depth truth exactly and answers the explicit unsupported-data refusal on out-of-domain scene tags.",
    failureModes: [
      {
        kind: "unsupported-data",
        condition: "sceneTag starting with 'unsupported:' (a scene class outside declared support)",
        behavior: "explicit unsupported-data refusal — never fabricated depth values",
      },
      {
        kind: "contract-mismatch",
        condition: "input or output payload violates the declared contracts",
        behavior: "typed normalization refusal with structured issues — never a silent coercion",
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The deterministic executions (the fixture provider doubles)          */
/* ------------------------------------------------------------------ */

/**
 * Executes the reconstruction fixture double DETERMINISTICALLY over the
 * input fixture: least-squares plane fits over the GROUND-TRUTH-BLIND
 * capture view (`captureViewOf` — the answer sheet is never an input),
 * dimensions/volumes via the benchmark engine's `measurePlanePair`. v2
 * applies the documented ×1.02 bias; a v2 `timeout:` scene tag answers the
 * explicit timeout refusal. The provider-native payload rides along as an
 * OPAQUE provenance payload.
 */
export function executeFixtureReconstructionProvider(
  profile: ProviderProfile,
  input: ProviderInput,
): RawProviderExecution {
  const payload = input.payload as {
    readonly fixtureId: string;
    readonly deviceClass: string;
    readonly sceneTag: string;
  };
  const fixture = fixtureById(payload.fixtureId);
  if (fixture === undefined) {
    throw new Error(
      `fixture reconstruction double: unknown Layer-1 golden fixture '${payload.fixtureId}'`,
    );
  }

  if (
    profile.technologyVersion === RECONSTRUCTION_TECHNOLOGY_VERSION_V2 &&
    payload.sceneTag.startsWith("timeout:")
  ) {
    return {
      capability: RECONSTRUCTION_CAPABILITY,
      failure: {
        kind: "timeout",
        detail:
          `sceneTag '${payload.sceneTag}' exceeds the fixture provider's declared latency budget ` +
          `(timeoutMs 5000) — explicit timeout observation, never a fabricated or partial reconstruction`,
      },
      providerNative: {
        mediaType: "application/aise-fixture-reconstruction+json",
        payload: {
          engine: "fixture-reconstruction-engine",
          technologyVersion: profile.technologyVersion,
          refusedSceneTag: payload.sceneTag,
        },
      },
    };
  }

  // GROUND-TRUTH-BLIND: only the capture view (observations + request ids +
  // object structure) — the ground-truth ANSWERS (dimension values, volumes)
  // are never read here.
  const view = captureViewOf(fixture);
  const notes: string[] = [];
  const planes = view.observations.map((observation) => ({
    surfaceId: observation.surfaceId,
    plane: fitPlane(observation.points).plane,
  }));
  const planeOf = (surfaceId: string) => {
    const found = planes.find((candidate) => candidate.surfaceId === surfaceId);
    if (!found) {
      throw new Error(`fixture reconstruction double: no fitted plane for surface ${surfaceId}`);
    }
    return found.plane;
  };
  const pointsOf = (surfaceId: string) => {
    const found = view.observations.find((observation) => observation.surfaceId === surfaceId);
    if (!found) {
      throw new Error(`fixture reconstruction double: no observation for surface ${surfaceId}`);
    }
    return found.points;
  };

  const isV2 = profile.technologyVersion === RECONSTRUCTION_TECHNOLOGY_VERSION_V2;
  const scale = isV2 ? RECONSTRUCTION_V2_SCALE_BIAS : 1;

  const measuredDimensions = view.measurementRequests.map((request) => {
    const measurement = measurePlanePair(request, planeOf, pointsOf, notes);
    return measurement.valueM * scale;
  });
  const measuredVolumes = view.objects.map((object) => {
    let volume = 1;
    for (let axis = 0; axis < 3; axis += 1) {
      const faceA = object.faceSurfaceIds[axis * 2] as string;
      const faceB = object.faceSurfaceIds[axis * 2 + 1] as string;
      const measurement = measurePlanePair(
        {
          dimensionId: `${object.objectId}::face-${axis}`,
          surfaceA: faceA,
          surfaceB: faceB,
        },
        planeOf,
        pointsOf,
        notes,
      );
      volume *= measurement.valueM;
    }
    return volume * scale * scale * scale;
  });

  const planeNormals: number[] = [];
  const planeOffsets: number[] = [];
  for (const plane of planes) {
    planeNormals.push(plane.plane.normal[0], plane.plane.normal[1], plane.plane.normal[2]);
    planeOffsets.push(plane.plane.d);
  }

  const note = isV2
    ? "fixture-reconstruction-engine 1.1.0: least-squares plane fits over the ground-truth-blind capture view; systematic x1.02 linear scale bias injected (the documented degraded behavior)"
    : "fixture-reconstruction-engine 1.0.0: least-squares plane fits over the ground-truth-blind capture view; dimensions via parallel-plane separation (mean point-to-plane fallback where fits disagree)";

  return {
    capability: RECONSTRUCTION_CAPABILITY,
    outputs: {
      planeNormals,
      planeOffsets,
      measuredDimensions,
      measuredVolumes,
      note,
    },
    providerNative: {
      mediaType: "application/aise-fixture-reconstruction+json",
      payload: {
        engine: "fixture-reconstruction-engine",
        technologyVersion: profile.technologyVersion,
        fixtureId: payload.fixtureId,
        scaleBias: isV2 ? RECONSTRUCTION_V2_SCALE_BIAS : 1,
        note: "opaque provider-native payload — carried for provenance only, never parsed into canonical Layer-1 types",
      },
    },
  };
}

/**
 * Executes the depth fixture double DETERMINISTICALLY: v1 reproduces the
 * documented depth truth exactly; an out-of-domain scene tag answers the
 * explicit `unsupported-data` refusal (the closed vocabulary's negative
 * path). The provider-native payload rides along as an OPAQUE provenance
 * payload.
 */
export function executeFixtureDepthProvider(
  profile: ProviderProfile,
  input: ProviderInput,
): RawProviderExecution {
  const payload = input.payload as {
    readonly samples: readonly number[];
    readonly sceneTag: string;
  };
  if (payload.sceneTag.startsWith("unsupported:")) {
    return {
      capability: DEPTH_CAPABILITY,
      failure: {
        kind: "unsupported-data",
        detail:
          `sceneTag '${payload.sceneTag}' is outside the fixture provider's declared support ` +
          `(supported: 'interior-wall') — explicit refusal, never fabricated depth values`,
      },
      providerNative: {
        mediaType: "application/aise-fixture-depth+json",
        payload: {
          engine: "fixture-reality-depth-engine",
          technologyVersion: profile.technologyVersion,
          refusedSceneTag: payload.sceneTag,
        },
      },
    };
  }
  return {
    capability: DEPTH_CAPABILITY,
    outputs: {
      depthMap: fixtureDepthTruth(payload.samples),
      unit: "m",
    },
    providerNative: {
      mediaType: "application/aise-fixture-depth+json",
      payload: {
        engine: "fixture-reality-depth-engine",
        technologyVersion: profile.technologyVersion,
        truthModel: `depth(sample) = ${DEPTH_TRUTH_BASE_M} + ${DEPTH_TRUTH_SPAN_M} x sample`,
        note: "opaque provider-native payload — carried for provenance only, never parsed into canonical Layer-1 types",
      },
    },
  };
}

/** Dispatches one fixture provider execution by provider id. */
export function executeFixtureProvider(
  profile: ProviderProfile,
  input: ProviderInput,
): RawProviderExecution {
  if (profile.providerId === RECONSTRUCTION_PROVIDER_ID) {
    return executeFixtureReconstructionProvider(profile, input);
  }
  if (profile.providerId === DEPTH_PROVIDER_ID) {
    return executeFixtureDepthProvider(profile, input);
  }
  throw new Error(`reality-eval testkit: unknown fixture provider '${profile.providerId}'`);
}

/* ------------------------------------------------------------------ */
/* The committed threshold tables (citing the engine's gates-1 rows)    */
/* ------------------------------------------------------------------ */

/**
 * The committed flagship-class thresholds — the benchmark engine's
 * versioned gate table rows for `flagship_lidar` (GATE_THRESHOLD_VERSION
 * "gates-1"), cited per row. Critical flags mirror the table.
 */
export function flagshipThresholds(): readonly ScenarioMetricThreshold[] {
  return [
    metric("plane_fit_rms", 0.004, true, "mirrors gates-1 flagship_lidar: 2x the 2mm 1-sigma flagship noise envelope"),
    metric("registration_error", 0.005, true, "mirrors gates-1 flagship_lidar: 2.5x the 2mm flagship noise envelope"),
    metric("scale_error", 0.01, true, "mirrors gates-1 flagship_lidar: 1% scale error invalidates LiDAR-class dimensional engineering use"),
    metric("dimension_error", 0.02, true, "mirrors gates-1 flagship_lidar: 20mm absolute dimension error invalidates LiDAR-class work"),
    metric("object_volume_error", 0.05, true, "mirrors gates-1 flagship_lidar: 5% object volume error invalidates LiDAR-class quantity takeoff"),
  ];
}

/** The committed midrange-class thresholds (gates-1 `midrange_no_depth` rows). */
export function midrangeThresholds(): readonly ScenarioMetricThreshold[] {
  return [
    metric("plane_fit_rms", 0.016, false, "mirrors gates-1 midrange_no_depth: 2x the 8mm midrange noise envelope"),
    metric("registration_error", 0.02, false, "mirrors gates-1 midrange_no_depth: 2.5x the 8mm midrange noise envelope"),
    metric("scale_error", 0.025, false, "mirrors gates-1 midrange_no_depth: photogrammetry-tier scale drift; flagged for review"),
    metric("dimension_error", 0.04, false, "mirrors gates-1 midrange_no_depth: midrange absolute dimension tolerance"),
    metric("object_volume_error", 0.15, false, "mirrors gates-1 midrange_no_depth: midrange object volume tolerance"),
  ];
}

/** The committed depth-grid thresholds (per-cell meters; exact truth → zero error). */
export function depthThresholds(): readonly ScenarioMetricThreshold[] {
  return [
    metric("depth_mae_m", 0.01, true, "mean absolute depth error above 10mm invalidates the wall-mapping use the depth lane serves"),
    metric("depth_max_error_m", 0.05, true, "maximum absolute depth error above 50mm is a visible wall-position error"),
  ];
}

function metric(
  name: string,
  threshold: number,
  critical: boolean,
  rationale: string,
): ScenarioMetricThreshold {
  return { metric: name, threshold, failureKind: "perception-failure", critical, rationale };
}

/* ------------------------------------------------------------------ */
/* The committed scenario set (the benchmark's data form)               */
/* ------------------------------------------------------------------ */

export const REALITY_EVAL_SUITE_ID = "reality-eval-layer1/1" as const;
export const REALITY_EVAL_SUITE_VERSION = "1.0.0" as const;
export const REALITY_EVAL_BENCHMARK_VERSION = "1.0.0" as const;

/** The pinned Layer-1 golden fixtures the committed scenarios evaluate over. */
export const FLAGSHIP_FIXTURE_ID = "fixture-flagship-livingroom-001" as const;
export const MIDRANGE_FIXTURE_ID = "fixture-midrange-bedroom-001" as const;

function reconstructionInput(fixtureId: string, sceneTag: string): ProviderInput {
  const fixture = fixtureById(fixtureId);
  if (fixture === undefined) {
    throw new Error(`reality-eval testkit: unknown fixture '${fixtureId}'`);
  }
  return {
    kind: "provider-input",
    capability: RECONSTRUCTION_CAPABILITY,
    payload: { fixtureId, deviceClass: fixture.deviceClass, sceneTag },
  };
}

function depthInput(sceneTag: string): ProviderInput {
  return {
    kind: "provider-input",
    capability: DEPTH_CAPABILITY,
    payload: {
      gridWidth: DEPTH_GRID_WIDTH,
      gridHeight: DEPTH_GRID_HEIGHT,
      samples: [...DEPTH_INPUT_SAMPLES],
      sceneTag,
    },
  };
}

function descriptor(input: {
  readonly scenarioId: string;
  readonly scenarioClass: ScenarioClass;
  readonly capability: "reconstruction" | "depth";
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly input: ProviderInput;
  readonly expected: RealityEvalScenarioDescriptor["expected"];
  readonly thresholds: readonly ScenarioMetricThreshold[];
  readonly expectedFailureKinds: readonly ScenarioMetricThreshold["failureKind"][];
}): RealityEvalScenarioDescriptor {
  return {
    kind: "reality-eval-scenario",
    schemaVersion: "reality-eval-scenario/1",
    scenarioId: input.scenarioId,
    scenarioVersion: "1.0.0",
    scenarioClass: input.scenarioClass,
    capability: input.capability,
    benchmarkId: LANE_BENCHMARK_IDS[input.capability],
    providerReference: {
      providerId: input.providerId,
      technologyVersion: input.technologyVersion,
    },
    input: input.input,
    expected: input.expected,
    criteria: {
      thresholds: input.thresholds,
      expectedFailureKinds: input.expectedFailureKinds,
    },
  };
}

/**
 * Builds the COMPLETE committed scenario set deterministically (the data
 * form committed at `tools/reality-eval/scenario.json`): three fixture
 * provider declarations + six scenarios — 3 positive / 2 negative /
 * 1 discrimination (the day-27 doctrine).
 */
export function realityEvalScenarioSet(): RealityEvalScenarioSet {
  return {
    kind: REALITY_EVAL_SCENARIO_SET_KIND,
    schemaVersion: REALITY_EVAL_SCENARIO_SET_SCHEMA_VERSION,
    suiteId: REALITY_EVAL_SUITE_ID,
    suiteVersion: REALITY_EVAL_SUITE_VERSION,
    benchmarkVersion: REALITY_EVAL_BENCHMARK_VERSION,
    providers: [
      fixtureReconstructionProfileV1(),
      fixtureReconstructionProfileV2(),
      fixtureDepthProfileV1(),
    ],
    scenarios: [
      descriptor({
        scenarioId: "recon-flagship-positive-001",
        scenarioClass: "positive",
        capability: "reconstruction",
        providerId: RECONSTRUCTION_PROVIDER_ID,
        technologyVersion: RECONSTRUCTION_TECHNOLOGY_VERSION_V1,
        input: reconstructionInput(FLAGSHIP_FIXTURE_ID, "interior-livingroom"),
        expected: { kind: "reconstruction-scene", fixtureId: FLAGSHIP_FIXTURE_ID },
        thresholds: flagshipThresholds(),
        expectedFailureKinds: [],
      }),
      descriptor({
        scenarioId: "recon-midrange-positive-002",
        scenarioClass: "positive",
        capability: "reconstruction",
        providerId: RECONSTRUCTION_PROVIDER_ID,
        technologyVersion: RECONSTRUCTION_TECHNOLOGY_VERSION_V1,
        input: reconstructionInput(MIDRANGE_FIXTURE_ID, "interior-bedroom"),
        expected: { kind: "reconstruction-scene", fixtureId: MIDRANGE_FIXTURE_ID },
        thresholds: midrangeThresholds(),
        expectedFailureKinds: [],
      }),
      descriptor({
        scenarioId: "recon-flagship-discrimination-003",
        scenarioClass: "discrimination",
        capability: "reconstruction",
        providerId: RECONSTRUCTION_PROVIDER_ID,
        technologyVersion: RECONSTRUCTION_TECHNOLOGY_VERSION_V2,
        input: reconstructionInput(FLAGSHIP_FIXTURE_ID, "interior-livingroom"),
        expected: { kind: "reconstruction-scene", fixtureId: FLAGSHIP_FIXTURE_ID },
        thresholds: flagshipThresholds(),
        expectedFailureKinds: [],
      }),
      descriptor({
        scenarioId: "recon-timeout-negative-004",
        scenarioClass: "negative",
        capability: "reconstruction",
        providerId: RECONSTRUCTION_PROVIDER_ID,
        technologyVersion: RECONSTRUCTION_TECHNOLOGY_VERSION_V2,
        input: reconstructionInput(FLAGSHIP_FIXTURE_ID, "timeout:oversized-fusion-input"),
        expected: { kind: "explicit-refusal" },
        thresholds: [],
        expectedFailureKinds: ["timeout"],
      }),
      descriptor({
        scenarioId: "depth-wall-positive-005",
        scenarioClass: "positive",
        capability: "depth",
        providerId: DEPTH_PROVIDER_ID,
        technologyVersion: DEPTH_TECHNOLOGY_VERSION_V1,
        input: depthInput("interior-wall"),
        expected: {
          kind: "depth-grid",
          gridWidth: DEPTH_GRID_WIDTH,
          gridHeight: DEPTH_GRID_HEIGHT,
          unit: "m",
          truthM: fixtureDepthTruth(DEPTH_INPUT_SAMPLES),
        },
        thresholds: depthThresholds(),
        expectedFailureKinds: [],
      }),
      descriptor({
        scenarioId: "depth-unsupported-negative-006",
        scenarioClass: "negative",
        capability: "depth",
        providerId: DEPTH_PROVIDER_ID,
        technologyVersion: DEPTH_TECHNOLOGY_VERSION_V1,
        input: depthInput("unsupported:thermal-only-capture"),
        expected: { kind: "explicit-refusal" },
        thresholds: [],
        expectedFailureKinds: ["unsupported-data"],
      }),
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The committed artifacts (loaders — TEST-ONLY I/O)                    */
/* ------------------------------------------------------------------ */

/** The repository root (this file lives at backend/api/src/reality-eval/). */
export const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");

export const SCENARIO_SET_PATH = join(REPO_ROOT, "tools", "reality-eval", "scenario.json");
export const EXPECTED_OUTCOMES_PATH = join(
  REPO_ROOT,
  "tools",
  "reality-eval",
  "fixtures",
  "expected-outcomes.json",
);

/** Loads the committed scenario set (validated; drift from the builder fails loudly). */
export function loadRealityEvalScenarioSet(): RealityEvalScenarioSet {
  const parsed = JSON.parse(readFileSync(SCENARIO_SET_PATH, "utf8")) as unknown;
  const validation = validateRealityEvalScenarioSet(parsed);
  if (!validation.ok) {
    const issues = validation.failures
      .map((failure) => `${failure.path || "(root)"} ${failure.kind}: ${failure.detail}`)
      .join("; ");
    throw new Error(`the committed scenario set failed validation: ${issues}`);
  }
  return validation.set;
}

/** Loads the committed golden outcomes (raw JSON; the golden tests byte-compare). */
export function loadRealityEvalGoldenOutcomes(): RealityEvalGoldenOutcomes {
  const parsed = JSON.parse(readFileSync(EXPECTED_OUTCOMES_PATH, "utf8")) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("the committed expected outcomes must be a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  if (record["kind"] !== REALITY_EVAL_OUTCOMES_KIND) {
    throw new Error(
      `the committed expected outcomes carry the wrong typed seal (expected '${REALITY_EVAL_OUTCOMES_KIND}')`,
    );
  }
  if (record["schemaVersion"] !== REALITY_EVAL_OUTCOMES_SCHEMA_VERSION) {
    throw new Error(
      `the committed expected outcomes carry the wrong schema version (expected '${REALITY_EVAL_OUTCOMES_SCHEMA_VERSION}')`,
    );
  }
  return parsed as RealityEvalGoldenOutcomes;
}

/* ------------------------------------------------------------------ */
/* The suite runner (register → evaluate → record → seal, per scenario) */
/* ------------------------------------------------------------------ */

function projectionOf(evaluation: ScenarioEvaluation): ScenarioEvaluationProjection {
  return {
    scenarioId: evaluation.scenarioId,
    scenarioClass: evaluation.scenarioClass,
    verdict: evaluation.verdict,
    failureObservationKinds: evaluation.failureObservations.map((observation) => observation.kind),
    discriminationCaught: evaluation.discriminationCaught,
    record: evaluation.record,
    manifest: evaluation.manifest,
  };
}

/**
 * Runs the COMMITTED Layer-1 evaluation suite deterministically:
 *
 *   1. loads + validates the committed scenario set
 *      (`tools/reality-eval/scenario.json`);
 *   2. registers every declared fixture provider into an append-only
 *      control-plane registry log and starts its evaluation;
 *   3. for every committed scenario (in committed order): executes the
 *      deterministic fixture double over the scenario input, completes the
 *      scenario, evaluates it through the harness, and appends the
 *      lifecycle events (execution-normalized → benchmark-recorded →
 *      provenance-sealed);
 *   4. returns the GOLDEN OUTCOMES body (the evaluation projections + the
 *      full event log), byte-identical on every run.
 *
 * The suite intentionally ends at provenance-sealed: PROMOTION is a
 * separate governed decision owned by the control plane's promotion gate
 * (`/v1/providers/promotion/decide`), never a benchmark side effect.
 */
export function runRealityEvalSuite(): RealityEvalGoldenOutcomes {
  const set = loadRealityEvalScenarioSet();

  let registry: ProviderRegistry = createProviderRegistry();
  const events: ProviderRegistryEvent[] = [];
  const apply = (event: ProviderRegistryEvent): void => {
    const result = applyRegistryEvent(registry, event);
    if (!result.ok) {
      throw new Error(
        `reality-eval suite: event '${event.kind}' was refused: ${result.failure.detail}`,
      );
    }
    registry = result.registry;
    events.push(event);
  };

  // The fixture providers' lifecycle head: registration + evaluation start.
  for (const profile of set.providers) {
    apply({ kind: "provider-registered", profile });
  }
  for (const profile of set.providers) {
    apply({
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
  }

  // Every committed scenario, in committed order. Per scenario the suite
  // appends the LAWFUL evaluation lifecycle events: execution-normalized
  // (evaluation → evaluation, records the run) and provenance-sealed
  // (evaluation → evaluation, records the manifest). The suite deliberately
  // does NOT append benchmark-recorded or promotion-decided events: the
  // control plane's registry models ONE benchmark-record intake per
  // provider lifecycle (evaluation → benchmarked, single-shot) and the
  // promotion decision is a governed gate — both are SEPARATE decisions
  // owned by the control plane (/v1/providers/benchmarks/intake,
  // /v1/providers/promotion/decide), never benchmark side effects. The
  // per-scenario records this suite emits are INTAKE CANDIDATES for that
  // flow.
  const evaluations: ScenarioEvaluation[] = [];
  for (const committed of set.scenarios) {
    const entry = registry.entryOf(
      committed.providerReference.providerId,
      committed.providerReference.technologyVersion,
    );
    if (entry === undefined) {
      throw new Error(
        `reality-eval suite: provider '${committed.providerReference.providerId}' is not registered`,
      );
    }
    const declaredExecution = executeFixtureProvider(entry.profile, committed.input);
    const scenario: RealityEvalScenario = completeScenario(committed, declaredExecution);
    const outcome = evaluateScenario(scenario, events);
    if (!outcome.ok) {
      throw new Error(
        `reality-eval suite: scenario '${committed.scenarioId}' was refused (${outcome.refusal.kind}): ${outcome.refusal.detail}`,
      );
    }
    const evaluation = outcome.evaluation;
    evaluations.push(evaluation);

    apply({
      kind: "execution-normalized",
      providerId: entry.profile.providerId,
      technologyVersion: entry.profile.technologyVersion,
      execution: {
        capability: scenario.capability,
        inputDigest: inputDigestOf(scenario.input),
        normalizedResultDigest: providerResultDigestOf(evaluation.normalizedResult),
      },
    });
    apply({ kind: "provenance-sealed", manifest: evaluation.manifest });
  }

  return {
    kind: REALITY_EVAL_OUTCOMES_KIND,
    schemaVersion: REALITY_EVAL_OUTCOMES_SCHEMA_VERSION,
    suiteId: set.suiteId,
    suiteVersion: set.suiteVersion,
    benchmarkVersion: set.benchmarkVersion,
    scenarioSetDigest: scenarioSetDigestOf(set),
    evaluations: evaluations.map(projectionOf),
    registryLog: events,
  };
}

/* Re-exported for the regeneration CLI and the golden tests. */
export { REALITY_EVAL_HARNESS_CODE_VERSION };
export { fixtureById } from "../benchmarks";
