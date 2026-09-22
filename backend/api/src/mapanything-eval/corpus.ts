/**
 * HFX-101 — the committed MapAnything provider-benchmark CORPUS.
 *
 * The deterministic, in-repo evidence worlds and the EIGHT base tasks of
 * the Layer-1 reconstruction provider benchmark lane (the registered
 * MapAnything candidate + the existing deterministic reference path), the
 * materialized TWELVE benchmark runs (8 MapAnything runs + 4 reference-path
 * runs over the SAME evidence fixtures), and the fail-closed validation of
 * every scenario descriptor through the REALITY-EVAL VALIDATORS (imported,
 * never modified — the Layer-1 scenario schema is consumed, never forked).
 *
 * THE BEHAVIOR MATRIX (every mandated cell exercised and test-asserted):
 *
 *   grounded-pass             recon-multiimage-flagship-grounded-001 ·
 *                             recon-multiimage-midrange-grounded-002 ·
 *                             recon-registration-twopass-grounded-003 ·
 *                             depth-metric-wall-grounded-004
 *   degraded-evidence         recon-registration-degraded-overlap-005
 *                             (inter-pass overlap 1/12 ≈ 8% < the declared
 *                             30% minimum) · recon-multiimage-degraded-
 *                             coverage-006 (coverage 9/12 = 75% < the
 *                             declared 80% minimum)
 *   failed-invocation         recon-multiimage-failed-resource-007 (the
 *                             fused 57600-point capture set exceeds the
 *                             declared 50000-point envelope)
 *   unsupported-task-
 *   combination               recon-unsupported-novelview-008 (the
 *                             novel-view-synthesis task is outside the
 *                             declared task set)
 *
 * THE TASK KINDS (the work order's scope): multi-image capture sets
 * (structured fixture frames with camera poses/intrinsics as data),
 * metric-depth tasks (the documented depth truth) and registration/
 * alignment tasks between capture passes.
 *
 * THE REFERENCE PATH: the four grounded content tasks are additionally
 * evaluated through the EXISTING deterministic reference providers
 * (imported from the reality-eval testkit — "the current deterministic/demo
 * path") over the SAME evidence fixtures and the SAME pinned Layer-1
 * benchmark ids, so the comparison record joins on the comparability key.
 * The explicit-gate cells (degraded-evidence, failed-invocation,
 * unsupported-task-combination) are declared behaviors of the REGISTERED
 * MapAnything profile — the reference double implements no corresponding
 * gate (it reconstructs from the capture view unconditionally), so those
 * cells carry MapAnything runs only (documented in the comparison's honest
 * note).
 *
 * DETERMINISM: pure construction — no clock, no randomness, no I/O. The
 * same corpus build is byte-identical (the committed goldens under
 * tools/mapanything-eval/ are its projection).
 */

import {
  LANE_BENCHMARK_IDS,
  validateRealityEvalScenarioDescriptor,
} from "../reality-eval";
import type { RealityEvalScenarioDescriptor } from "../reality-eval";
import {
  DEPTH_INPUT_SAMPLES,
  FLAGSHIP_FIXTURE_ID,
  MIDRANGE_FIXTURE_ID,
  depthThresholds,
  fixtureDepthTruth,
  flagshipThresholds,
  midrangeThresholds,
} from "../reality-eval/testkit";
import { fixtureById } from "../benchmarks";
import {
  MAPANYTHING_BEHAVIOR_MATRIX_CELLS,
  MAPANYTHING_DECLARED_FALLBACK,
  MAPANYTHING_DEGRADED_BOUND_SIGMA_M,
  MAPANYTHING_DEPTH_SIGMA_M,
  MAPANYTHING_EVAL_CODE_VERSION,
  MAPANYTHING_EVAL_ERROR_CODES,
  MAPANYTHING_EVAL_EXECUTION_MODE,
  MAPANYTHING_EVAL_SUITE_ID,
  MAPANYTHING_EVAL_SUITE_VERSION,
  MAPANYTHING_EVAL_VARIANTS,
  MAPANYTHING_LICENSE_STATUS_EVALUATION_ONLY,
  MAPANYTHING_PROVIDER_ID,
  MAPANYTHING_TASKS,
  MapAnythingEvalError,
  canonicalJsonText,
  mapAnythingProfileForVariant,
  mapAnythingVariantIdentity,
  parseMapAnythingCaptureSet,
  validateMapAnythingTaskCoherence,
} from "./model";
import type {
  MapAnythingBehaviorMatrixCell,
  MapAnythingCaptureFrame,
  MapAnythingCaptureSet,
  MapAnythingCorpusTask,
  MapAnythingDoubleBehaviorClass,
  MapAnythingEvalRun,
  MapAnythingVariantKey,
  UncertaintyDeclaration,
} from "./model";

/* ------------------------------------------------------------------ */
/* The capture-set builders (deterministic, documented fixture data)     */
/* ------------------------------------------------------------------ */

/** The canonical fixture surface ids (ground-truth-blind: structure only). */
function canonicalSurfaceIdsOf(fixtureId: string): readonly string[] {
  const fixture = fixtureById(fixtureId);
  if (fixture === undefined) {
    throw new MapAnythingEvalError(
      "invalid_corpus",
      `unknown Layer-1 golden fixture '${fixtureId}' — the corpus may only reference committed fixtures`,
    );
  }
  return fixture.groundTruth.surfaces.map((surface) => surface.surfaceId);
}

/** One posed frame of a capture set (documented deterministic fixture data). */
function frame(input: {
  readonly frameId: string;
  readonly station: string;
  readonly position: readonly [number, number, number];
  readonly orientation: readonly [number, number, number, number];
  readonly intrinsics: readonly [number, number, number, number];
  readonly observedSurfaceIds: readonly string[];
  readonly pointCount: number;
  readonly evidenceRevision: string;
}): MapAnythingCaptureFrame {
  return {
    frameId: input.frameId,
    station: input.station,
    pose: { position: input.position, orientation: input.orientation },
    intrinsics: {
      fx: input.intrinsics[0],
      fy: input.intrinsics[1],
      cx: input.intrinsics[2],
      cy: input.intrinsics[3],
    },
    observedSurfaceIds: [...input.observedSurfaceIds],
    pointCount: input.pointCount,
    evidenceRevision: input.evidenceRevision,
  };
}

/** The documented pinhole intrinsics of the flagship LiDAR-class rig (pixels). */
const FLAGSHIP_INTRINSICS: readonly [number, number, number, number] = [1462.5, 1462.5, 960, 540];

/** The documented pinhole intrinsics of the midrange camera rig (pixels). */
const MIDRANGE_INTRINSICS: readonly [number, number, number, number] = [1040, 1040, 640, 360];

/** A canonical identity orientation quaternion (no rotation). */
const IDENTITY_ORIENTATION: readonly [number, number, number, number] = [0, 0, 0, 1];

/** A quarter-turn-about-z orientation quaternion (the plan-view stations). */
const QUARTER_Z_ORIENTATION: readonly [number, number, number, number] = [0, 0, 0.38268343, 0.92387953];

/**
 * The flagship multi-image capture set (task 001): SIX posed frames across
 * six stations covering ALL twelve canonical surfaces of the living-room
 * fixture (full coverage; a single capture pass).
 */
function flagshipMultiImageCaptureSet(): MapAnythingCaptureSet {
  return {
    captureSetId: "cap-flagship-livingroom-6frame",
    purpose: "multi-image-reconstruction",
    frames: [
      frame({
        frameId: "FR-FLAG-01",
        station: "S1",
        position: [1.05, 3.05, 1.35],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["floor", "wall_west"],
        pointCount: 1240,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-FLAG-02",
        station: "S2",
        position: [3.15, 2.05, 1.35],
        orientation: QUARTER_Z_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["floor", "wall_north"],
        pointCount: 1190,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-FLAG-03",
        station: "S3",
        position: [1.05, 0.55, 1.35],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["ceiling", "wall_east"],
        pointCount: 1250,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-FLAG-04",
        station: "S4",
        position: [3.15, 1.05, 1.35],
        orientation: QUARTER_Z_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["ceiling", "wall_south"],
        pointCount: 1180,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-FLAG-05",
        station: "S5",
        position: [1.0, 0.6, 0.4],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["box_storage::xmin", "box_storage::xmax", "box_storage::ymin"],
        pointCount: 110,
        evidenceRevision: "r2",
      }),
      frame({
        frameId: "FR-FLAG-06",
        station: "S6",
        position: [1.0, 0.6, 0.55],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["box_storage::ymax", "box_storage::zmin", "box_storage::zmax"],
        pointCount: 105,
        evidenceRevision: "r2",
      }),
    ],
    note:
      "six posed flagship-class frames (six stations, documented intrinsics) covering all twelve " +
      "canonical surfaces of the living-room golden fixture — the well-grounded multi-image evidence",
  };
}

/**
 * The midrange multi-image capture set (task 002): FOUR posed frames
 * covering all twelve canonical surfaces of the bedroom fixture.
 */
function midrangeMultiImageCaptureSet(): MapAnythingCaptureSet {
  return {
    captureSetId: "cap-midrange-bedroom-4frame",
    purpose: "multi-image-reconstruction",
    frames: [
      frame({
        frameId: "FR-MID-01",
        station: "S1",
        position: [0.875, 2.5, 1.275],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: ["floor", "wall_west", "wall_north"],
        pointCount: 980,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-MID-02",
        station: "S2",
        position: [2.625, 1.5, 1.275],
        orientation: QUARTER_Z_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: ["floor", "ceiling", "wall_east"],
        pointCount: 1010,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-MID-03",
        station: "S3",
        position: [1.75, 0.5, 1.275],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: ["ceiling", "wall_south", "box_cabinet::xmin", "box_cabinet::xmax"],
        pointCount: 760,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-MID-04",
        station: "S4",
        position: [2.85, 0.45, 0.25],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: ["box_cabinet::ymin", "box_cabinet::ymax", "box_cabinet::zmin", "box_cabinet::zmax"],
        pointCount: 90,
        evidenceRevision: "r2",
      }),
    ],
    note:
      "four posed midrange-class frames (four stations, documented intrinsics) covering all twelve " +
      "canonical surfaces of the bedroom golden fixture",
  };
}

/**
 * The flagship two-pass registration capture set (task 003): EIGHT posed
 * frames in TWO capture passes. Pass A covers eight surfaces, pass B nine;
 * the passes SHARE five surfaces (overlap 5/12 ≈ 41.7% ≥ the declared 30%
 * minimum) and their union covers all twelve (the well-grounded
 * registration evidence).
 */
function flagshipTwoPassCaptureSet(): MapAnythingCaptureSet {
  return {
    captureSetId: "cap-flagship-livingroom-2pass",
    purpose: "registration",
    frames: [
      frame({
        frameId: "FR-PASSA-01",
        station: "SA1",
        position: [1.05, 3.05, 1.35],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["floor", "ceiling"],
        pointCount: 1240,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-PASSA-02",
        station: "SA2",
        position: [0.55, 1.8, 1.35],
        orientation: QUARTER_Z_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["wall_west", "wall_north"],
        pointCount: 1190,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-PASSA-03",
        station: "SA3",
        position: [1.0, 0.6, 0.4],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["box_storage::xmin", "box_storage::xmax"],
        pointCount: 110,
        evidenceRevision: "r2",
      }),
      frame({
        frameId: "FR-PASSA-04",
        station: "SA4",
        position: [1.0, 0.6, 0.55],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["box_storage::ymin", "box_storage::zmin"],
        pointCount: 105,
        evidenceRevision: "r2",
      }),
      frame({
        frameId: "FR-PASSB-01",
        station: "SB1",
        position: [2.1, 3.05, 1.35],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["floor", "ceiling", "wall_west"],
        pointCount: 1250,
        evidenceRevision: "r3",
      }),
      frame({
        frameId: "FR-PASSB-02",
        station: "SB2",
        position: [3.65, 1.05, 1.35],
        orientation: QUARTER_Z_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["wall_east", "wall_south"],
        pointCount: 1180,
        evidenceRevision: "r3",
      }),
      frame({
        frameId: "FR-PASSB-03",
        station: "SB3",
        position: [1.2, 0.6, 0.45],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["box_storage::ymin", "box_storage::ymax"],
        pointCount: 108,
        evidenceRevision: "r3",
      }),
      frame({
        frameId: "FR-PASSB-04",
        station: "SB4",
        position: [1.2, 0.6, 0.6],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["box_storage::zmin", "box_storage::zmax"],
        pointCount: 102,
        evidenceRevision: "r3",
      }),
    ],
    passes: [
      { passId: "pass-A", frameIds: ["FR-PASSA-01", "FR-PASSA-02", "FR-PASSA-03", "FR-PASSA-04"] },
      { passId: "pass-B", frameIds: ["FR-PASSB-01", "FR-PASSB-02", "FR-PASSB-03", "FR-PASSB-04"] },
    ],
    note:
      "two flagship capture passes (four posed frames each, distinct stations and evidence revisions); " +
      "the passes share five of their twelve union surfaces (41.7% overlap) and cover the fixture fully",
  };
}

/**
 * The metric-depth capture set (task 004): TWO posed depth-sensor frames
 * over the documented 4x4 wall grid (the depth passes carry no surface
 * observations — the sample grid IS the evidence).
 */
function depthCaptureSet(): MapAnythingCaptureSet {
  return {
    captureSetId: "cap-depth-wall-2frame",
    purpose: "metric-depth",
    frames: [
      frame({
        frameId: "FR-DEPTH-01",
        station: "SD1",
        position: [0.0, 0.0, 1.5],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: [],
        pointCount: 16,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-DEPTH-02",
        station: "SD2",
        position: [0.35, 0.0, 1.5],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: [],
        pointCount: 16,
        evidenceRevision: "r1",
      }),
    ],
    note:
      "two posed depth-sensor frames over the documented 4x4 interior-wall sample grid (16 cells " +
      "per frame; the grid samples are the evidence, revisions r1)",
  };
}

/**
 * The midrange two-pass capture set with INSUFFICIENT OVERLAP (task 005):
 * pass A covers the six room surfaces, pass B the floor plus the six box
 * faces — the passes share ONLY the floor (overlap 1/12 ≈ 8.3% < the
 * declared 30% minimum) while their union still covers all twelve surfaces
 * (the DEGRADED-EVIDENCE fixture: the overlap gate alone fires).
 */
function midrangeLowOverlapCaptureSet(): MapAnythingCaptureSet {
  return {
    captureSetId: "cap-midrange-bedroom-2pass-low-overlap",
    purpose: "registration",
    frames: [
      frame({
        frameId: "FR-LO-A1",
        station: "SA1",
        position: [0.875, 2.5, 1.275],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: ["floor", "wall_west"],
        pointCount: 980,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-LO-A2",
        station: "SA2",
        position: [2.625, 1.5, 1.275],
        orientation: QUARTER_Z_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: ["ceiling", "wall_east"],
        pointCount: 1010,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-LO-A3",
        station: "SA3",
        position: [1.75, 0.5, 1.275],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: ["wall_north", "wall_south"],
        pointCount: 960,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-LO-B1",
        station: "SB1",
        position: [2.85, 0.45, 0.25],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: [
          "floor",
          "box_cabinet::xmin",
          "box_cabinet::xmax",
          "box_cabinet::ymin",
        ],
        pointCount: 520,
        evidenceRevision: "r2",
      }),
      frame({
        frameId: "FR-LO-B2",
        station: "SB2",
        position: [2.85, 0.45, 0.35],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: ["box_cabinet::ymax", "box_cabinet::zmin", "box_cabinet::zmax"],
        pointCount: 480,
        evidenceRevision: "r2",
      }),
    ],
    passes: [
      { passId: "pass-A", frameIds: ["FR-LO-A1", "FR-LO-A2", "FR-LO-A3"] },
      { passId: "pass-B", frameIds: ["FR-LO-B1", "FR-LO-B2"] },
    ],
    note:
      "two midrange capture passes with only the floor shared between them (overlap 1/12 = 8.3%, below " +
      "the declared 30% minimum) — the degraded-evidence registration fixture",
  };
}

/**
 * The midrange capture set with INSUFFICIENT COVERAGE (task 006): three
 * frames covering only NINE of the twelve canonical surfaces (coverage
 * 75% < the declared 80% minimum — the DEGRADED-EVIDENCE fixture: the
 * coverage gate fires).
 */
function midrangeLowCoverageCaptureSet(): MapAnythingCaptureSet {
  return {
    captureSetId: "cap-midrange-bedroom-3frame-low-coverage",
    purpose: "multi-image-reconstruction",
    frames: [
      frame({
        frameId: "FR-LC-01",
        station: "S1",
        position: [0.875, 2.5, 1.275],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: ["floor", "wall_west"],
        pointCount: 980,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-LC-02",
        station: "S2",
        position: [2.625, 1.5, 1.275],
        orientation: QUARTER_Z_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: ["ceiling", "wall_east"],
        pointCount: 1010,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-LC-03",
        station: "S3",
        position: [1.75, 0.5, 1.275],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: MIDRANGE_INTRINSICS,
        observedSurfaceIds: [
          "wall_north",
          "wall_south",
          "box_cabinet::xmin",
          "box_cabinet::xmax",
          "box_cabinet::ymin",
        ],
        pointCount: 770,
        evidenceRevision: "r2",
      }),
    ],
    note:
      "three midrange frames covering nine of the twelve canonical surfaces (75% coverage, below the " +
      "declared 80% minimum; box_cabinet::ymax, box_cabinet::zmin and box_cabinet::zmax are uncaptured)",
  };
}

/**
 * The oversized flagship capture set (task 007): TWELVE high-resolution
 * frames totalling 57600 fused points — above the declared 50000-point
 * resource envelope (the FAILED-INVOCATION fixture: the resource gate
 * fires; coverage itself is complete).
 */
function flagshipOversizedCaptureSet(): MapAnythingCaptureSet {
  const surfacesByFrame: readonly (readonly string[])[] = [
    ["floor"],
    ["ceiling"],
    ["wall_west"],
    ["wall_east"],
    ["wall_north"],
    ["wall_south"],
    ["box_storage::xmin", "box_storage::xmax"],
    ["box_storage::ymin", "box_storage::ymax"],
    ["box_storage::zmin", "box_storage::zmax"],
    ["floor", "ceiling"],
    ["wall_west", "wall_east"],
    ["wall_north", "wall_south"],
  ];
  return {
    captureSetId: "cap-flagship-livingroom-12frame-oversized",
    purpose: "multi-image-reconstruction",
    frames: surfacesByFrame.map((observedSurfaceIds, index) =>
      frame({
        frameId: `FR-BIG-${String(index + 1).padStart(2, "0")}`,
        station: `SB${index + 1}`,
        position: [1.05 + 0.2 * index, 1.8, 1.35],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds,
        pointCount: 4800,
        evidenceRevision: "r1",
      }),
    ),
    note:
      "twelve high-resolution flagship frames totalling 57600 fused points — above the declared " +
      "50000-point resource envelope (the failed-invocation fixture; coverage itself is complete)",
  };
}

/**
 * The plain multi-image capture set of the UNSUPPORTED task (task 008): a
 * minimal well-formed capture set — the EVIDENCE is fine; the TASK asked of
 * it (novel-view synthesis) is outside the declared task set.
 */
function flagshipPlainCaptureSet(): MapAnythingCaptureSet {
  return {
    captureSetId: "cap-flagship-livingroom-2frame-plain",
    purpose: "multi-image-reconstruction",
    frames: [
      frame({
        frameId: "FR-PLAIN-01",
        station: "S1",
        position: [1.05, 3.05, 1.35],
        orientation: IDENTITY_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["floor", "wall_west", "wall_north"],
        pointCount: 1240,
        evidenceRevision: "r1",
      }),
      frame({
        frameId: "FR-PLAIN-02",
        station: "S2",
        position: [3.15, 1.05, 1.35],
        orientation: QUARTER_Z_ORIENTATION,
        intrinsics: FLAGSHIP_INTRINSICS,
        observedSurfaceIds: ["ceiling", "wall_east", "wall_south"],
        pointCount: 1210,
        evidenceRevision: "r1",
      }),
    ],
    note:
      "a plain two-frame flagship capture set — well-formed multi-image evidence; the novel-view-synthesis " +
      "task requested over it is outside the provider's declared task set",
  };
}

/* ------------------------------------------------------------------ */
/* The corpus task builders                                             */
/* ------------------------------------------------------------------ */

const FLAGSHIP_SIGMA_M = 0.002;
const MIDRANGE_SIGMA_M = 0.008;

function answerSigma(sigmaM: number, statement: string): UncertaintyDeclaration {
  return { role: "answer-sigma", sigmaM, unit: "m", statement };
}

function refusalBoundSigma(): UncertaintyDeclaration {
  return {
    role: "refusal-bound",
    sigmaM: MAPANYTHING_DEGRADED_BOUND_SIGMA_M,
    unit: "m",
    statement:
      `the bounded lower bound the degraded-evidence refusal must cite: any reconstruction from " +
      "below-minimum evidence would carry sigma >= ${MAPANYTHING_DEGRADED_BOUND_SIGMA_M} m over the " +
      "uncovered/un-overlapped region — the refusal names it instead of degrading geometry`,
  };
}

function evidenceRevisionsOf(captureSet: MapAnythingCaptureSet): readonly string[] {
  return [...new Set(captureSet.frames.map((entry) => entry.evidenceRevision))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Builds one corpus task (validating coherence + capture-set shape, fail closed). */
function task(input: {
  readonly taskId: string;
  readonly taskKind: string;
  readonly matrixCell: MapAnythingBehaviorMatrixCell;
  readonly behaviorClass: MapAnythingDoubleBehaviorClass;
  readonly capability: "reconstruction" | "depth";
  readonly evidence: MapAnythingCorpusTask["evidence"];
  readonly expected: MapAnythingCorpusTask["expected"];
  readonly criteria: MapAnythingCorpusTask["criteria"];
  readonly expectedFailureKind: MapAnythingCorpusTask["expectedFailureKind"];
  readonly uncertainty: UncertaintyDeclaration | null;
  readonly expectedFallback?: string;
}): MapAnythingCorpusTask {
  const captureSet = parseMapAnythingCaptureSet(input.evidence.captureSet);
  const built: MapAnythingCorpusTask = {
    taskId: input.taskId,
    taskVersion: "1.0.0",
    taskKind: input.taskKind,
    matrixCell: input.matrixCell,
    behaviorClass: input.behaviorClass,
    capability: input.capability,
    evidence: { ...input.evidence, captureSet, evidenceRevisions: evidenceRevisionsOf(captureSet) },
    expected: input.expected,
    criteria: input.criteria,
    expectedVerdict: "pass",
    expectedFailureKind: input.expectedFailureKind,
    uncertainty: input.uncertainty,
    ...(input.expectedFallback === undefined ? {} : { expectedFallback: input.expectedFallback }),
  };
  validateMapAnythingTaskCoherence(built);
  if (input.capability === "reconstruction") {
    const fixtureId = input.evidence.fixtureId ?? "";
    const known = new Set(canonicalSurfaceIdsOf(fixtureId));
    for (const entry of captureSet.frames) {
      for (const surfaceId of entry.observedSurfaceIds) {
        if (!known.has(surfaceId)) {
          throw new MapAnythingEvalError(
            "invalid_corpus",
            `task '${input.taskId}': frame '${entry.frameId}' observes unknown canonical surface '${surfaceId}'`,
          );
        }
      }
    }
  }
  return built;
}

/** The committed EIGHT-task corpus (the data form, deterministic order). */
export function mapAnythingEvalCorpus(): readonly MapAnythingCorpusTask[] {
  return [
    task({
      taskId: "recon-multiimage-flagship-grounded-001",
      taskKind: "multi-image-reconstruction",
      matrixCell: "grounded-pass",
      behaviorClass: "well-grounded",
      capability: "reconstruction",
      evidence: {
        description:
          "six posed flagship-class frames over the living-room golden fixture (full coverage, one pass)",
        fixtureId: FLAGSHIP_FIXTURE_ID,
        deviceClass: "flagship_lidar",
        captureSet: flagshipMultiImageCaptureSet(),
        evidenceRevisions: [],
      },
      expected: { kind: "reconstruction-scene", fixtureId: FLAGSHIP_FIXTURE_ID },
      criteria: { thresholds: flagshipThresholds(), expectedFailureKinds: [] },
      expectedFailureKind: "none",
      uncertainty: answerSigma(
        FLAGSHIP_SIGMA_M,
        "the flagship capture noise envelope (2mm 1-sigma, the gates-1 flagship_lidar row) propagated " +
          "as the answer's declared measurement uncertainty",
      ),
    }),
    task({
      taskId: "recon-multiimage-midrange-grounded-002",
      taskKind: "multi-image-reconstruction",
      matrixCell: "grounded-pass",
      behaviorClass: "well-grounded",
      capability: "reconstruction",
      evidence: {
        description:
          "four posed midrange-class frames over the bedroom golden fixture (full coverage, one pass)",
        fixtureId: MIDRANGE_FIXTURE_ID,
        deviceClass: "midrange_no_depth",
        captureSet: midrangeMultiImageCaptureSet(),
        evidenceRevisions: [],
      },
      expected: { kind: "reconstruction-scene", fixtureId: MIDRANGE_FIXTURE_ID },
      criteria: { thresholds: midrangeThresholds(), expectedFailureKinds: [] },
      expectedFailureKind: "none",
      uncertainty: answerSigma(
        MIDRANGE_SIGMA_M,
        "the midrange capture noise envelope (8mm 1-sigma, the gates-1 midrange_no_depth row) propagated " +
          "as the answer's declared measurement uncertainty",
      ),
    }),
    task({
      taskId: "recon-registration-twopass-grounded-003",
      taskKind: "registration",
      matrixCell: "grounded-pass",
      behaviorClass: "well-grounded",
      capability: "reconstruction",
      evidence: {
        description:
          "two flagship capture passes (4 posed frames each, 41.7% inter-pass overlap, full union coverage)",
        fixtureId: FLAGSHIP_FIXTURE_ID,
        deviceClass: "flagship_lidar",
        captureSet: flagshipTwoPassCaptureSet(),
        evidenceRevisions: [],
      },
      expected: { kind: "reconstruction-scene", fixtureId: FLAGSHIP_FIXTURE_ID },
      criteria: { thresholds: flagshipThresholds(), expectedFailureKinds: [] },
      expectedFailureKind: "none",
      uncertainty: answerSigma(
        FLAGSHIP_SIGMA_M,
        "the registered two-pass answer's declared measurement uncertainty (the flagship 2mm 1-sigma " +
          "capture envelope over the shared stations)",
      ),
    }),
    task({
      taskId: "depth-metric-wall-grounded-004",
      taskKind: "metric-depth",
      matrixCell: "grounded-pass",
      behaviorClass: "well-grounded",
      capability: "depth",
      evidence: {
        description:
          "two posed depth-sensor frames over the documented 4x4 interior-wall sample grid",
        gridWidth: 4,
        gridHeight: 4,
        samples: [...DEPTH_INPUT_SAMPLES],
        captureSet: depthCaptureSet(),
        evidenceRevisions: [],
      },
      expected: {
        kind: "depth-grid",
        gridWidth: 4,
        gridHeight: 4,
        unit: "m",
        truthM: fixtureDepthTruth(DEPTH_INPUT_SAMPLES),
      },
      criteria: { thresholds: depthThresholds(), expectedFailureKinds: [] },
      expectedFailureKind: "none",
      uncertainty: answerSigma(
        MAPANYTHING_DEPTH_SIGMA_M,
        "the metric-depth answer's declared measurement uncertainty — the bound of the double's " +
          "documented deviation profile (+0.1% scale, +2mm offset)",
      ),
    }),
    task({
      taskId: "recon-registration-degraded-overlap-005",
      taskKind: "registration",
      matrixCell: "degraded-evidence",
      behaviorClass: "degraded-evidence",
      capability: "reconstruction",
      evidence: {
        description:
          "two midrange capture passes sharing only the floor (8.3% inter-pass overlap < the declared 30% minimum)",
        fixtureId: MIDRANGE_FIXTURE_ID,
        deviceClass: "midrange_no_depth",
        captureSet: midrangeLowOverlapCaptureSet(),
        evidenceRevisions: [],
      },
      expected: { kind: "explicit-refusal" },
      criteria: { thresholds: [], expectedFailureKinds: ["unsupported-data"] },
      expectedFailureKind: "unsupported-data",
      uncertainty: refusalBoundSigma(),
    }),
    task({
      taskId: "recon-multiimage-degraded-coverage-006",
      taskKind: "multi-image-reconstruction",
      matrixCell: "degraded-evidence",
      behaviorClass: "degraded-evidence",
      capability: "reconstruction",
      evidence: {
        description:
          "three midrange frames covering nine of twelve canonical surfaces (75% coverage < the declared 80% minimum)",
        fixtureId: MIDRANGE_FIXTURE_ID,
        deviceClass: "midrange_no_depth",
        captureSet: midrangeLowCoverageCaptureSet(),
        evidenceRevisions: [],
      },
      expected: { kind: "explicit-refusal" },
      criteria: { thresholds: [], expectedFailureKinds: ["unsupported-data"] },
      expectedFailureKind: "unsupported-data",
      uncertainty: refusalBoundSigma(),
    }),
    task({
      taskId: "recon-multiimage-failed-resource-007",
      taskKind: "multi-image-reconstruction",
      matrixCell: "failed-invocation",
      behaviorClass: "failing",
      capability: "reconstruction",
      evidence: {
        description:
          "twelve high-resolution flagship frames totalling 57600 fused points (above the declared 50000-point envelope)",
        fixtureId: FLAGSHIP_FIXTURE_ID,
        deviceClass: "flagship_lidar",
        captureSet: flagshipOversizedCaptureSet(),
        evidenceRevisions: [],
      },
      expected: { kind: "explicit-refusal" },
      criteria: { thresholds: [], expectedFailureKinds: ["resource-exhaustion"] },
      expectedFailureKind: "resource-exhaustion",
      uncertainty: null,
      expectedFallback: MAPANYTHING_DECLARED_FALLBACK,
    }),
    task({
      taskId: "recon-unsupported-novelview-008",
      taskKind: "novel-view-synthesis",
      matrixCell: "unsupported-task-combination",
      behaviorClass: "unsupported-task",
      capability: "reconstruction",
      evidence: {
        description:
          "a plain well-formed two-frame flagship capture set — the novel-view-synthesis task asked over it is outside the declared task set",
        fixtureId: FLAGSHIP_FIXTURE_ID,
        deviceClass: "flagship_lidar",
        captureSet: flagshipPlainCaptureSet(),
        evidenceRevisions: [],
      },
      expected: { kind: "explicit-refusal" },
      criteria: { thresholds: [], expectedFailureKinds: ["unsupported-data"] },
      expectedFailureKind: "unsupported-data",
      uncertainty: null,
    }),
  ];
}

/** The committed corpus (the frozen value; reprocessing never mutates it). */
export const MAPANYTHING_EVAL_CORPUS: readonly MapAnythingCorpusTask[] = mapAnythingEvalCorpus();

/* ------------------------------------------------------------------ */
/* The run materialization (one variant over one task)                   */
/* ------------------------------------------------------------------ */

/** Does the reference path evaluate this task's evidence? (The content tasks.) */
export function referenceRunOf(
  task: MapAnythingCorpusTask,
): MapAnythingVariantKey | undefined {
  if (task.matrixCell !== "grounded-pass") {
    return undefined;
  }
  return task.capability === "depth" ? "reference-depth" : "reference-reconstruction";
}

/** The MapAnything input payload for one task (the declared input contract's shape). */
function mapAnythingPayloadOf(task: MapAnythingCorpusTask): Record<string, unknown> {
  const base: Record<string, unknown> = {
    task: task.taskKind,
    sceneTag:
      task.capability === "depth"
        ? "interior-wall"
        : task.taskKind === "registration"
          ? task.evidence.fixtureId === FLAGSHIP_FIXTURE_ID
            ? "interior-livingroom-registration"
            : "interior-bedroom-registration"
          : task.evidence.fixtureId === FLAGSHIP_FIXTURE_ID
            ? "interior-livingroom"
            : "interior-bedroom",
    captureSetJson: canonicalJsonText(task.evidence.captureSet),
  };
  if (task.capability === "reconstruction") {
    return {
      ...base,
      fixtureId: task.evidence.fixtureId,
      deviceClass: task.evidence.deviceClass,
    };
  }
  return {
    ...base,
    gridWidth: task.evidence.gridWidth,
    gridHeight: task.evidence.gridHeight,
    samples: [...(task.evidence.samples ?? [])],
  };
}

/** The reference-path input payload for one task (the reference contract's exact closed shape). */
function referencePayloadOf(task: MapAnythingCorpusTask): Record<string, unknown> {
  if (task.capability === "reconstruction") {
    return {
      fixtureId: task.evidence.fixtureId,
      deviceClass: task.evidence.deviceClass,
      sceneTag: task.evidence.fixtureId === FLAGSHIP_FIXTURE_ID ? "interior-livingroom" : "interior-bedroom",
    };
  }
  return {
    gridWidth: task.evidence.gridWidth,
    gridHeight: task.evidence.gridHeight,
    samples: [...(task.evidence.samples ?? [])],
    sceneTag: "interior-wall",
  };
}

/** Builds ONE run's scenario descriptor (validated through the reality-eval validator, fail closed). */
function scenarioDescriptorOf(
  task: MapAnythingCorpusTask,
  variant: MapAnythingVariantKey,
): RealityEvalScenarioDescriptor {
  const identity = mapAnythingVariantIdentity(variant);
  const descriptor: RealityEvalScenarioDescriptor = {
    kind: "reality-eval-scenario",
    schemaVersion: "reality-eval-scenario/1",
    scenarioId: `${task.taskId}@${variant}`,
    scenarioVersion: task.taskVersion,
    scenarioClass: task.matrixCell === "grounded-pass" ? "positive" : "negative",
    capability: task.capability,
    benchmarkId: LANE_BENCHMARK_IDS[task.capability],
    providerReference: {
      providerId: identity.providerId,
      technologyVersion: identity.technologyVersion,
    },
    input: {
      kind: "provider-input",
      capability: task.capability,
      payload:
        variant === MAPANYTHING_PROVIDER_ID
          ? mapAnythingPayloadOf(task)
          : referencePayloadOf(task),
    },
    expected: task.expected,
    criteria: task.criteria,
  };
  const validation = validateRealityEvalScenarioDescriptor(descriptor);
  if (!validation.ok) {
    const issues = validation.failures
      .map((failure) => `${failure.path}: ${failure.kind}: ${failure.detail}`)
      .join("; ");
    throw new MapAnythingEvalError(
      "invalid_corpus",
      `run '${task.taskId}@${variant}': the scenario descriptor failed the reality-eval validator: ${issues}`,
    );
  }
  // Cross-check: the referenced provider declares the scenario's capability.
  const profile = mapAnythingProfileForVariant(variant);
  if (!(profile.capabilities as readonly string[]).includes(task.capability)) {
    throw new MapAnythingEvalError(
      "invalid_corpus",
      `run '${task.taskId}@${variant}': the referenced provider does not declare capability '${task.capability}'`,
    );
  }
  return descriptor;
}

/** Builds ONE benchmark run (task + variant + the validated scenario descriptor). */
export function buildMapAnythingEvalRun(
  task: MapAnythingCorpusTask,
  variant: MapAnythingVariantKey,
): MapAnythingEvalRun {
  return {
    runId: `${task.taskId}@${variant}`,
    taskId: task.taskId,
    variant,
    task,
    scenario: scenarioDescriptorOf(task, variant),
  };
}

/** The committed run order: per task, the MapAnything run first, then its reference run. */
export function mapAnythingEvalRuns(): readonly MapAnythingEvalRun[] {
  const runs: MapAnythingEvalRun[] = [];
  for (const task of MAPANYTHING_EVAL_CORPUS) {
    runs.push(buildMapAnythingEvalRun(task, MAPANYTHING_PROVIDER_ID));
    const referenceVariant = referenceRunOf(task);
    if (referenceVariant !== undefined) {
      runs.push(buildMapAnythingEvalRun(task, referenceVariant));
    }
  }
  return runs;
}

/** The committed runs of ONE variant. */
export function mapAnythingEvalRunsForVariant(
  variant: MapAnythingVariantKey,
): readonly MapAnythingEvalRun[] {
  return mapAnythingEvalRuns().filter((run) => run.variant === variant);
}

/** The run lookup by run id (committed order; unique ids asserted). */
export function mapAnythingRunOf(runId: string): MapAnythingEvalRun {
  const found = mapAnythingEvalRuns().find((run) => run.runId === runId);
  if (found === undefined) {
    throw new MapAnythingEvalError(
      "unknown_run",
      `no benchmark run '${runId}' — the committed run ids are '<taskId>@<variant>' over ` +
        `${MAPANYTHING_EVAL_VARIANTS.join(", ")}`,
    );
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* The suite identity projection (consumed by golden.ts + the runner)    */
/* ------------------------------------------------------------------ */

/** The suite identity block every committed artifact carries. */
export function mapAnythingSuiteIdentity(): {
  readonly suiteId: string;
  readonly version: string;
  readonly codeVersion: string;
  readonly executionMode: string;
  readonly licenseStatus: string;
} {
  return {
    suiteId: MAPANYTHING_EVAL_SUITE_ID,
    version: MAPANYTHING_EVAL_SUITE_VERSION,
    codeVersion: MAPANYTHING_EVAL_CODE_VERSION,
    executionMode: MAPANYTHING_EVAL_EXECUTION_MODE,
    licenseStatus: MAPANYTHING_LICENSE_STATUS_EVALUATION_ONLY,
  };
}

/** Imported re-exports for the sibling modules (single import surface). */
export {
  MAPANYTHING_EVAL_SUITE_ID,
  MAPANYTHING_EVAL_SUITE_VERSION,
  MAPANYTHING_TASKS,
  MAPANYTHING_BEHAVIOR_MATRIX_CELLS,
  MAPANYTHING_EVAL_VARIANTS,
  MAPANYTHING_EVAL_ERROR_CODES,
};

/** The declared task-set + matrix-cell vocabularies re-exported as values (the runner mirrors them). */
export const MAPANYTHING_DECLARED_TASKS: readonly string[] = [...MAPANYTHING_TASKS];
export const MAPANYTHING_DECLARED_MATRIX_CELLS: readonly string[] = [
  ...MAPANYTHING_BEHAVIOR_MATRIX_CELLS,
];
