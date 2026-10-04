/**
 * `@aise/world-layer1-experience` — the COMMITTED FIXTURES
 * (WORLD-P1, `src/fixtures.ts`).
 *
 * One deterministic site scenario the whole lane proves itself on
 * (the P0-B corpus discipline): a capture session with three
 * spatializable assets (two stills + one video) and one voice note
 * (honestly omitted — evidence, not spatial input); device-declared
 * poses and volumes at INTEGER coordinates (every downstream
 * computation is EXACT in IEEE-754 double arithmetic — the
 * byte-identity discipline of the substitution doubles); two plan
 * elements; the registration hypotheses; the derived lane outputs
 * (fragment, registration, world, comparison, measurements, evidence
 * bindings, queries).
 *
 * HONESTY: every content id is the sha-256 of a stable ASCII seed
 * (the anchoring-contract fixture discipline — synthetic,
 * content-addressed, honest about being synthetic); every instant is
 * a declared constant; no clock, no randomness, no network.
 */

import { createHash } from "node:crypto";
import { CONTRACT_VERSION, type CaptureSessionEnvelope, type Evidence } from "@aise/shared-contracts";
import type { AnchoringHypothesis } from "@aise/anchoring-contract";
import type { SiteFrame } from "@aise/world-reality-substrate";
import { LANE_ACQUISITION_METADATA_KEYS } from "./lane";
import type {
  CaptureRegistrationRequest,
  CaptureSpatializationRequest,
} from "./capture/contract";
import { spatializeCaptureSession } from "./capture/spatialize";
import { registerCaptureFragment } from "./capture/register";
import type { PlanModelSource, WorldCompositionRequest } from "./world/contract";
import { composeReconstructionWorld } from "./world/reconstruct";
import type { ComparisonRequest, MeasurementQuery } from "./compare/contract";
import type { SpatializedWorldFragment } from "./capture/contract";
import type { NavigableWorld } from "./world/contract";

/* ------------------------------------------------------------------ */
/* Deterministic content ids                                            */
/* ------------------------------------------------------------------ */

/** sha-256 hex of a stable seed — the deterministic pseudo-content id. */
export function fixtureContentIdOf(seed: string): string {
  return createHash("sha256").update(`layer1-fixture:${seed}`, "utf8").digest("hex");
}

export const FIXTURE_STILL_001_CONTENT_ID = fixtureContentIdOf("still-001");
export const FIXTURE_STILL_002_CONTENT_ID = fixtureContentIdOf("still-002");
export const FIXTURE_VIDEO_001_CONTENT_ID = fixtureContentIdOf("video-001");
export const FIXTURE_VOICE_001_CONTENT_ID = fixtureContentIdOf("voice-001");
export const FIXTURE_FOREIGN_CONTENT_ID = fixtureContentIdOf("foreign-evidence");
export const FIXTURE_PLAN_EVIDENCE_CONTENT_ID = fixtureContentIdOf("plan-interpretation");

/** The declared fixture instants (constants — never clock reads). */
export const FIXTURE_CAPTURED_AT = "2026-10-02T09:00:00.000Z";
export const FIXTURE_SPATIALIZED_AT = "2026-10-02T09:05:00.000Z";
export const FIXTURE_REGISTERED_AT = "2026-10-02T09:10:00.000Z";
export const FIXTURE_COMPOSED_AT = "2026-10-02T09:15:00.000Z";
export const FIXTURE_COMPARED_AT = "2026-10-02T09:20:00.000Z";
export const FIXTURE_MEASURED_AT = "2026-10-02T09:25:00.000Z";
export const FIXTURE_BOOKMARKED_AT = "2026-10-02T09:30:00.000Z";

/** The fixture site frame (origin at the site anchor, north = +Y, metres). */
export const FIXTURE_SITE_FRAME: SiteFrame = {
  origin: [0, 0, 0],
  northHeading: 0,
  units: "metre",
};

/** The declared fixture tolerances/units (carried VERBATIM — law 2). */
export const FIXTURE_TOLERANCE = { linear: 0.05, angular: 1e-9 } as const;
/** The declared near-boundary band of the fixture comparison. */
export const FIXTURE_NEAR_BOUNDARY_BAND = 0.5 as const;
export const FIXTURE_WIDE_TOLERANCE = { linear: 2, angular: 1e-9 } as const;
export const FIXTURE_UNITS = { linear: "m", angular: "rad" } as const;

/* ------------------------------------------------------------------ */
/* The capture session envelope (the seam input)                         */
/* ------------------------------------------------------------------ */

function stillMetadata(
  pose: readonly [number, number, number],
  volume: { min: readonly [number, number, number]; max: readonly [number, number, number] },
): Record<string, string> {
  const K = LANE_ACQUISITION_METADATA_KEYS;
  return {
    [K.poseX]: String(pose[0]),
    [K.poseY]: String(pose[1]),
    [K.poseZ]: String(pose[2]),
    [K.volumeMinX]: String(volume.min[0]),
    [K.volumeMinY]: String(volume.min[1]),
    [K.volumeMinZ]: String(volume.min[2]),
    [K.volumeMaxX]: String(volume.max[0]),
    [K.volumeMaxY]: String(volume.max[1]),
    [K.volumeMaxZ]: String(volume.max[2]),
    [K.volumeBasis]: "device-fov-declared",
    "capture.kind": "still",
  };
}

function fixtureEvidence(
  contentId: string,
  mediaType: string,
  acquisitionMethod: Evidence["acquisitionMethod"],
  acquisitionMetadata: Record<string, string>,
  byteSize: number,
): Evidence {
  return {
    contractVersion: CONTRACT_VERSION,
    contentId,
    byteSize,
    mediaType,
    capturedAt: FIXTURE_CAPTURED_AT,
    acquisitionMethod,
    acquisitionMetadata,
  };
}

/**
 * The canonical capture session: three spatializable assets with
 * device-declared poses/volumes + one voice note (omitted at
 * spatialization — visible omission, honest evidence).
 *
 *   still-001  pose (0,0,2)   volume [-4,-4,0]..[4,4,6]
 *   still-002  pose (10,0,2)  volume [6,-4,0]..[14,4,6]
 *   video-001  pose (5,8,2)   volume [1,4,0]..[9,12,6]
 *   voice-001  (audio/ogg — not spatializable)
 *
 * Coverage union: [-4,-4,0]..[14,12,6] (integer-exact).
 */
export const FIXTURE_CAPTURE_SESSION: CaptureSessionEnvelope = {
  contractVersion: CONTRACT_VERSION,
  sessionId: "session-layer1-fixture-001",
  missionRef: "mission-layer1-fixture-001",
  deviceIdentity: {
    deviceId: "device-layer1-fixture-001",
    platform: "android",
    model: "fixture-phone",
    osVersion: "15",
    appVersion: "1.0.0",
  },
  capabilityProfile: {
    contractVersion: CONTRACT_VERSION,
    profileId: "profile-layer1-fixture-001",
    capturedAt: FIXTURE_CAPTURED_AT,
    deviceIdentity: {
      deviceId: "device-layer1-fixture-001",
      platform: "android",
      model: "fixture-phone",
      osVersion: "15",
      appVersion: "1.0.0",
    },
    device: { contractVersion: CONTRACT_VERSION, status: "supported", details: {}, limitations: [] },
    camera: { contractVersion: CONTRACT_VERSION, status: "supported", details: {}, limitations: [] },
    depth: { contractVersion: CONTRACT_VERSION, status: "supported", details: {}, limitations: [] },
    imu: { contractVersion: CONTRACT_VERSION, status: "unknown", details: {}, limitations: [] },
    tracking: { contractVersion: CONTRACT_VERSION, status: "supported", details: {}, limitations: [] },
    compute: { contractVersion: CONTRACT_VERSION, status: "supported", details: {}, limitations: [] },
    calibration: { contractVersion: CONTRACT_VERSION, status: "supported", details: {}, limitations: [] },
    environment: { contractVersion: CONTRACT_VERSION, status: "supported", details: {}, limitations: [] },
  },
  startedAt: FIXTURE_CAPTURED_AT,
  endedAt: "2026-10-02T09:01:00.000Z",
  assets: [
    fixtureEvidence(
      FIXTURE_STILL_001_CONTENT_ID,
      "image/jpeg",
      "STILL_IMAGERY",
      stillMetadata([0, 0, 2], { min: [-4, -4, 0], max: [4, 4, 6] }),
      2_400_000,
    ),
    fixtureEvidence(
      FIXTURE_STILL_002_CONTENT_ID,
      "image/png",
      "STILL_IMAGERY",
      stillMetadata([10, 0, 2], { min: [6, -4, 0], max: [14, 4, 6] }),
      3_100_000,
    ),
    fixtureEvidence(
      FIXTURE_VIDEO_001_CONTENT_ID,
      "video/mp4",
      "VIDEO_FOOTAGE",
      stillMetadata([5, 8, 2], { min: [1, 4, 0], max: [9, 12, 6] }),
      48_000_000,
    ),
    fixtureEvidence(
      FIXTURE_VOICE_001_CONTENT_ID,
      "audio/ogg",
      "VOICE_NOTE",
      { "voice.duration.ms": "4100", "voice.codec": "opus" },
      51_250,
    ),
  ],
};

/** The canonical spatialization request. */
export const FIXTURE_SPATIALIZATION_REQUEST: CaptureSpatializationRequest = {
  envelope: FIXTURE_CAPTURE_SESSION,
  siteFrame: FIXTURE_SITE_FRAME,
  declaredAt: FIXTURE_SPATIALIZED_AT,
};

/** The spatialized fragment (derived ONCE, deterministically). */
export const FIXTURE_FRAGMENT: SpatializedWorldFragment = (() => {
  const outcome = spatializeCaptureSession(FIXTURE_SPATIALIZATION_REQUEST);
  if (!outcome.ok) {
    throw new Error(`fixture fragment derivation failed: ${outcome.failure.detail}`);
  }
  return outcome.value;
})();

/* ------------------------------------------------------------------ */
/* The registration fixtures                                            */
/* ------------------------------------------------------------------ */

function fixtureHypothesis(contentId: string, seed: number): AnchoringHypothesis {
  return {
    evidenceContentId: contentId,
    representation: "plan-homography",
    transform: {
      frameFrom: "plan-raster-px",
      frameTo: "still-px",
      matrix: [
        [1.0001205, -0.0000231, 12.5],
        [0.0000198, 0.9999871, -4.25],
        [1.2e-7, -3.4e-8, 1],
      ],
    },
    inlierCount: 40 + seed,
    matchCount: 180,
    inlierRatio: 0.25,
    residualRmsPx: 1.4,
    uncertainty: {
      floorRmsM: 0.0065,
      budget95M: 0.0128,
      basis: "layer1-fixture-declaration-v1",
    },
    confidence: 0.9,
    epistemicLabel: "INFERRED",
    crossValidation: [
      { peerContentId: FIXTURE_STILL_002_CONTENT_ID, residualRmsPx: 2.1, consistent: true },
    ],
  };
}

/** The canonical registration request (2 admissible hypotheses → anchored). */
export const FIXTURE_REGISTRATION_REQUEST: CaptureRegistrationRequest = {
  fragment: FIXTURE_FRAGMENT,
  hypotheses: [
    fixtureHypothesis(FIXTURE_STILL_001_CONTENT_ID, 1),
    fixtureHypothesis(FIXTURE_STILL_002_CONTENT_ID, 2),
  ],
  candidateAnchor: { latitudeDeg: 47.3769, longitudeDeg: 8.5417, heightM: 408 },
  declaredAccuracyMetres: 0.5,
  declaredAt: FIXTURE_REGISTERED_AT,
};

/** The registration result (anchored — derived ONCE). */
export const FIXTURE_REGISTRATION = (() => {
  const outcome = registerCaptureFragment(FIXTURE_REGISTRATION_REQUEST);
  if (!outcome.ok) {
    throw new Error(`fixture registration failed: ${outcome.failure.detail}`);
  }
  return outcome.value;
})();

/** The REGISTERED fragment (site-registered — the world input). */
export const FIXTURE_REGISTERED_FRAGMENT: SpatializedWorldFragment =
  FIXTURE_REGISTRATION.fragment;

/* ------------------------------------------------------------------ */
/* The plan model fixture (the model side — P0-B vocabulary in)          */
/* ------------------------------------------------------------------ */

/** The IFC GlobalId-shaped EXTERNAL LABEL of the plan wall (a label, never identity). */
export const FIXTURE_WALL_IFC_GUID = "1hNGeMV3v5xeJ$OTEbSO6r" as const;

/** The plan model: two elements (wall + slab) with integer geometry. */
export const FIXTURE_PLAN_MODEL: PlanModelSource = {
  planModelId: fixtureContentIdOf("plan-model-001"),
  elements: [
    {
      elementId: "plan-wall-001",
      kind: "wall",
      translation: [2, -2, 0],
      shape: { kind: "box", name: null, min: { x: 1, y: -4, z: 0 }, max: { x: 3, y: 0, z: 3 } },
      externalLabels: [{ namespace: "ifc-guid", value: FIXTURE_WALL_IFC_GUID }],
      evidenceContentIds: [FIXTURE_PLAN_EVIDENCE_CONTENT_ID],
      label: "Plan wall W-1",
    },
    {
      elementId: "plan-slab-001",
      kind: "slab",
      translation: [7, 7, 0],
      shape: { kind: "box", name: null, min: { x: 5, y: 5, z: 0 }, max: { x: 9, y: 9, z: 0.3 } },
      externalLabels: [{ namespace: "ifc-guid", value: "0$SWUbhqvCbOOiOjnbN1ID" }],
      evidenceContentIds: [FIXTURE_PLAN_EVIDENCE_CONTENT_ID],
      label: "Plan slab S-1",
    },
  ],
  derivation: {
    contractVersion: CONTRACT_VERSION,
    derivationId: "derive-plan-model-001",
    outputContentId: fixtureContentIdOf("plan-model-001"),
    inputEvidenceContentIds: [FIXTURE_PLAN_EVIDENCE_CONTENT_ID],
    method: "interpretation.ifc",
    methodVersion: "layer1-fixture/1",
    parameters: { "ifc.schema": "IFC4" },
    createdAt: FIXTURE_COMPOSED_AT,
  },
};

/* ------------------------------------------------------------------ */
/* The world fixtures                                                   */
/* ------------------------------------------------------------------ */

/** The canonical composition request (rev 1). */
export const FIXTURE_WORLD_REQUEST: WorldCompositionRequest = {
  fragments: [FIXTURE_REGISTERED_FRAGMENT],
  planModel: FIXTURE_PLAN_MODEL,
  siteFrame: FIXTURE_SITE_FRAME,
  georeference: FIXTURE_REGISTRATION.georeference,
  worldRevision: 1,
  declaredAt: FIXTURE_COMPOSED_AT,
};

/** The canonical world (rev 1 — derived ONCE, deterministically). */
export const FIXTURE_WORLD: NavigableWorld = (() => {
  const outcome = composeReconstructionWorld(FIXTURE_WORLD_REQUEST);
  if (!outcome.ok) {
    throw new Error(`fixture world derivation failed: ${outcome.failure.detail}`);
  }
  return outcome.value;
})();

/** The revision-2 composition: the plan wall MOVED (the what-changed fixture). */
export const FIXTURE_WORLD_REVISION_2: NavigableWorld = (() => {
  const movedPlan: PlanModelSource = {
    ...FIXTURE_PLAN_MODEL,
    elements: [
      {
        ...FIXTURE_PLAN_MODEL.elements[0]!,
        translation: [4, -2, 0], // moved +2 in x
      },
      FIXTURE_PLAN_MODEL.elements[1]!,
      {
        // a NEW element (added in rev 2)
        elementId: "plan-column-001",
        kind: "column",
        translation: [12, 6, 0],
        shape: { kind: "box", name: null, min: { x: 11.5, y: 5.5, z: 0 }, max: { x: 12.5, y: 6.5, z: 3 } },
        externalLabels: [],
        evidenceContentIds: [FIXTURE_PLAN_EVIDENCE_CONTENT_ID],
        label: "Plan column C-1",
      },
    ],
  };
  const outcome = composeReconstructionWorld({
    ...FIXTURE_WORLD_REQUEST,
    planModel: movedPlan,
    worldRevision: 2,
  });
  if (!outcome.ok) {
    throw new Error(`fixture world rev 2 derivation failed: ${outcome.failure.detail}`);
  }
  return outcome.value;
})();

/* ------------------------------------------------------------------ */
/* The comparison fixtures                                              */
/* ------------------------------------------------------------------ */

/**
 * The canonical comparison request:
 *
 *  - wall pair: model centroid (2,-2,1.5) vs capture centroid (2,3,1.5)
 *    → deviation EXACTLY 5 m → deviation-detected at tolerance 0.05;
 *  - slab pair: identical centroids → deviation 0 → within-tolerance;
 *  - unpaired: the capture element of video-001 (missing-in-model)
 *    and the plan column in rev 2 style (missing-in-capture).
 */
export const FIXTURE_COMPARISON_REQUEST: ComparisonRequest = {
  worldRevision: 1,
  pairs: [
    {
      modelElementId: "plan-wall-001",
      captureElementId: FIXTURE_WORLD.elementProvenance.find(
        (record) => record.fragmentId !== null,
      )!.elementId,
      modelShape: {
        kind: "box",
        name: null,
        min: { x: 1, y: -4, z: 0 },
        max: { x: 3, y: 0, z: 3 },
      },
      captureShape: {
        kind: "box",
        name: null,
        min: { x: 1, y: 1, z: 0 },
        max: { x: 3, y: 5, z: 3 },
      },
    },
    {
      modelElementId: "plan-slab-001",
      captureElementId: FIXTURE_WORLD.elementProvenance[2]!.elementId,
      modelShape: {
        kind: "box",
        name: null,
        min: { x: 5, y: 5, z: 0 },
        max: { x: 9, y: 9, z: 0.3 },
      },
      captureShape: {
        kind: "box",
        name: null,
        min: { x: 5, y: 5, z: 0 },
        max: { x: 9, y: 9, z: 0.3 },
      },
    },
  ],
  unpairedModelElementIds: ["plan-column-001"],
  unpairedCaptureElementIds: [],
  tolerance: FIXTURE_TOLERANCE,
  nearBoundaryBand: FIXTURE_NEAR_BOUNDARY_BAND,
  units: FIXTURE_UNITS,
  declaredAt: FIXTURE_COMPARED_AT,
};

/* ------------------------------------------------------------------ */
/* The measurement fixtures                                             */
/* ------------------------------------------------------------------ */

/**
 * The canonical measurement query set (every value EXACT):
 *
 *  - point:    the first capture element's position (0,0,2);
 *  - line:     still-001 (0,0,2) ↔ still-002 (10,0,2) → distance 10;
 *  - area:     the 4×4 fixture polygon → 16 m²;
 *  - volume:   the 3×4×5 fixture box → 60 m³;
 *  - contain:  (2,1,0) in the 8×8 square → boundary distance 1 →
 *              verdict `true` at tolerance 0.05, `within-tolerance`
 *              at tolerance 2 (the wide-tolerance variant).
 */
export const FIXTURE_MEASUREMENT_QUERIES: readonly MeasurementQuery[] = [
  {
    queryId: "query-point-001",
    kind: "point",
    elementId: FIXTURE_WORLD.elementProvenance[0]!.elementId,
    tolerance: FIXTURE_TOLERANCE,
    units: FIXTURE_UNITS,
  },
  {
    queryId: "query-line-001",
    kind: "line",
    fromElementId: FIXTURE_WORLD.elementProvenance[0]!.elementId,
    toElementId: FIXTURE_WORLD.elementProvenance[1]!.elementId,
    tolerance: FIXTURE_TOLERANCE,
    units: FIXTURE_UNITS,
  },
  {
    queryId: "query-area-001",
    kind: "area",
    elementId: FIXTURE_WORLD.elementProvenance[0]!.elementId,
    declaredPolygon: {
      kind: "polygon",
      name: null,
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
        { x: 4, y: 4, z: 0 },
        { x: 0, y: 4, z: 0 },
      ],
    },
    tolerance: FIXTURE_TOLERANCE,
    units: FIXTURE_UNITS,
  },
  {
    queryId: "query-volume-001",
    kind: "volume",
    elementId: FIXTURE_WORLD.elementProvenance[0]!.elementId,
    declaredBox: {
      kind: "box",
      name: null,
      min: { x: 0, y: 0, z: 0 },
      max: { x: 3, y: 4, z: 5 },
    },
    tolerance: FIXTURE_TOLERANCE,
    units: FIXTURE_UNITS,
  },
  {
    queryId: "query-contain-001",
    kind: "point-in-region",
    pointElementId: FIXTURE_WORLD.elementProvenance[0]!.elementId,
    regionElementId: FIXTURE_WORLD.elementProvenance[0]!.elementId,
    declaredPoint: { kind: "point", name: null, at: { x: 2, y: 1, z: 0 } },
    declaredRegionPolygon: {
      kind: "polygon",
      name: null,
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 8, y: 0, z: 0 },
        { x: 8, y: 8, z: 0 },
        { x: 0, y: 8, z: 0 },
      ],
    },
    tolerance: FIXTURE_TOLERANCE,
    units: FIXTURE_UNITS,
  },
];

/** The wide-tolerance containment variant (the near-boundary drill). */
export const FIXTURE_WIDE_TOLERANCE_CONTAINMENT_QUERY: MeasurementQuery = {
  ...FIXTURE_MEASUREMENT_QUERIES[4]!,
  queryId: "query-contain-wide-001",
  tolerance: FIXTURE_WIDE_TOLERANCE,
};

/* ------------------------------------------------------------------ */
/* The what-is-here fixture points                                      */
/* ------------------------------------------------------------------ */

/**
 * The canonical what-is-here points (all inside/outside decisions
 * integer-exact):
 *
 *  - (0,0,3)    → inside still-001's volume → element-bound;
 *  - (5,-2,5)   → inside the coverage union, outside every element
 *                 volume → coverage-only;
 *  - (100,0,0)  → outside the coverage union → not-covered;
 */
export const FIXTURE_WHAT_IS_HERE_POINTS = {
  elementBound: [0, 0, 3] as readonly [number, number, number],
  coverageOnly: [5, -2, 5] as readonly [number, number, number],
  notCovered: [100, 0, 0] as readonly [number, number, number],
};
