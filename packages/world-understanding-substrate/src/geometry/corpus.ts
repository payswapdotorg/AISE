/**
 * WORLD-P0-B — the deterministic GEOMETRY corpus (`src/geometry/`).
 *
 * A committed, hand-authored fixture of DECLARED shapes with
 * HAND-COMPUTED exact values (the house discipline: no network, no
 * vendored dataset, no engine). Every fixture coordinate is chosen so
 * the closed-form results are EXACT in IEEE-754 double arithmetic —
 * the doubles' outputs are bit-stable and re-derivable by hand:
 *
 *   - points (0,0,0) and (3,4,0)          → distance 5      (3-4-5)
 *   - point (3,0,4) vs segment (2,0,0)-(6,0,0) → distance 4
 *     (projection parameter t = 1/4 exact; perpendicular foot (3,0,0))
 *   - segment (0,0,0)-(3,4,12)            → length 13       (3-4-12-13)
 *   - polygon: unit-spaced square (0,0),(4,0),(4,4),(0,4) → area 16
 *     (Newell normal z-component 32 → 32/2)
 *   - box (0,0,0)-(2,3,5)                 → volume 30
 *   - containment: (1,1) strictly inside (boundary distance 1 > tolerance
 *     0.01 → verdict true); (4.001,2) outside at boundary distance
 *     4.001−4 ≈ 0.001 ≤ 0.01 → verdict "within-tolerance" (the seam law
 *     #4 drill); (10,10) far outside → verdict false.
 *
 * The shape names are OCCT-TopoDS-flavored external labels
 * (vertex-N / edge-N / face-N / solid-N) — carried as `occt-topology`
 * namespaced labels, never identity (law #1).
 */

import { textDigestOf } from "../seam";
import type {
  GeometryComputationRequest,
  GeometryOperation,
  GeometryShapeDeclaration,
  GeometryToleranceDeclaration,
  GeometryUnitDeclaration,
} from "./contract";

/* ------------------------------------------------------------------ */
/* The fixture shape table                                              */
/* ------------------------------------------------------------------ */

/** The DECLARED subject (a 64-hex content id — geometry fabricates no identity). */
export const GEOMETRY_FIXTURE_SUBJECT_REF = textDigestOf(
  "AISE-WORLD-P0-B-geometry-fixture-subject",
);

/** The declared evidence content id of the registered fixture source. */
export const GEOMETRY_FIXTURE_EVIDENCE_CONTENT_ID = textDigestOf(
  "AISE-WORLD-P0-B-geometry-fixture-evidence-binding",
);

/** The declared recording instant (deterministic — no clock reads). */
export const GEOMETRY_FIXTURE_RECORDED_AT = "2026-10-02T00:00:00.000Z" as const;

/** The declared tolerance (carried VERBATIM into results — seam law #4). */
export const GEOMETRY_FIXTURE_TOLERANCE: GeometryToleranceDeclaration = {
  linear: 0.01,
  angular: 1e-9,
};

/** The declared units the computed values are expressed in. */
export const GEOMETRY_FIXTURE_UNITS: GeometryUnitDeclaration = { linear: "m", angular: "rad" };

/**
 * The fixture shape table (index-stable — the operations below cite
 * these indices; reordering is a fixture change):
 *
 *   0 vertex-0 (0,0,0)          1 vertex-1 (3,4,0)          2 vertex-2 (3,0,4)
 *   3 vertex-3 (1,1,0) inside   4 vertex-4 (4.001,2,0) near 5 vertex-5 (10,10,0)
 *   6 edge-0 (2,0,0)-(6,0,0)    7 face-0 the 4x4 square    8 solid-0 (0,0,0)-(2,3,5)
 *   9 edge-1 (0,0,0)-(3,4,12)
 */
export const GEOMETRY_FIXTURE_SHAPES: readonly GeometryShapeDeclaration[] = [
  { kind: "point", name: "vertex-0", at: { x: 0, y: 0, z: 0 } },
  { kind: "point", name: "vertex-1", at: { x: 3, y: 4, z: 0 } },
  { kind: "point", name: "vertex-2", at: { x: 3, y: 0, z: 4 } },
  { kind: "point", name: "vertex-3", at: { x: 1, y: 1, z: 0 } },
  { kind: "point", name: "vertex-4", at: { x: 4.001, y: 2, z: 0 } },
  { kind: "point", name: "vertex-5", at: { x: 10, y: 10, z: 0 } },
  { kind: "segment", name: "edge-0", a: { x: 2, y: 0, z: 0 }, b: { x: 6, y: 0, z: 0 } },
  {
    kind: "polygon",
    name: "face-0",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 4, z: 0 },
      { x: 0, y: 4, z: 0 },
    ],
  },
  {
    kind: "box",
    name: "solid-0",
    min: { x: 0, y: 0, z: 0 },
    max: { x: 2, y: 3, z: 5 },
  },
  { kind: "segment", name: "edge-1", a: { x: 0, y: 0, z: 0 }, b: { x: 3, y: 4, z: 12 } },
];

/* ------------------------------------------------------------------ */
/* The requests                                                         */
/* ------------------------------------------------------------------ */

const FULL_OPERATIONS: readonly GeometryOperation[] = [
  { operation: "distance-point-point", a: 0, b: 1 },
  { operation: "distance-point-segment", point: 2, segment: 6 },
  { operation: "segment-length", segment: 9 },
  { operation: "polygon-area", polygon: 7 },
  { operation: "box-volume", box: 8 },
  { operation: "point-in-polygon", point: 3, polygon: 7 },
  { operation: "point-in-polygon", point: 4, polygon: 7 },
  { operation: "point-in-polygon", point: 5, polygon: 7 },
];

const MEASUREMENT_OPERATIONS: readonly GeometryOperation[] = [
  { operation: "distance-point-point", a: 0, b: 1 },
  { operation: "distance-point-segment", point: 2, segment: 6 },
  { operation: "segment-length", segment: 9 },
  { operation: "polygon-area", polygon: 7 },
  { operation: "box-volume", box: 8 },
];

const PREDICATE_OPERATIONS: readonly GeometryOperation[] = [
  { operation: "point-in-polygon", point: 3, polygon: 7 },
  { operation: "point-in-polygon", point: 4, polygon: 7 },
  { operation: "point-in-polygon", point: 5, polygon: 7 },
];

function baseRequest(operations: readonly GeometryOperation[]): GeometryComputationRequest {
  return {
    kind: "geometry-computation-request",
    schemaVersion: "geometry-computation-request/1",
    subjectRef: GEOMETRY_FIXTURE_SUBJECT_REF,
    shapes: GEOMETRY_FIXTURE_SHAPES,
    operations,
    tolerance: GEOMETRY_FIXTURE_TOLERANCE,
    units: GEOMETRY_FIXTURE_UNITS,
    evidenceContentId: GEOMETRY_FIXTURE_EVIDENCE_CONTENT_ID,
    recordedAt: GEOMETRY_FIXTURE_RECORDED_AT,
  };
}

/** The full-operations request over the fixture shape table. */
export const FULL_GEOMETRY_REQUEST: GeometryComputationRequest = baseRequest(FULL_OPERATIONS);

/** Measurements only (the five closed-form measurements, no predicates). */
export const MEASUREMENTS_ONLY_REQUEST: GeometryComputationRequest = baseRequest(MEASUREMENT_OPERATIONS);

/** Predicates only (the three containment verdicts, no measurements). */
export const PREDICATES_ONLY_REQUEST: GeometryComputationRequest = baseRequest(PREDICATE_OPERATIONS);

/** No operations at all — every result array must come back empty. */
export const NO_OPERATIONS_REQUEST: GeometryComputationRequest = baseRequest([]);

/* ------------------------------------------------------------------ */
/* The expected exact facts (hand-computed, drilled by tests)           */
/* ------------------------------------------------------------------ */

/** distance-point-point(vertex-0, vertex-1) = |(3,4,0)| = 5. */
export const EXPECTED_DISTANCE_POINT_POINT = 5;

/** distance-point-segment(vertex-2, edge-0) = 4 (perpendicular foot (3,0,0)). */
export const EXPECTED_DISTANCE_POINT_SEGMENT = 4;

/** segment-length(edge-1) = |(3,4,12)| = 13. */
export const EXPECTED_SEGMENT_LENGTH = 13;

/** polygon-area(face-0) = 16 (Newell: |Nz| = 32 → 32/2). */
export const EXPECTED_POLYGON_AREA = 16;

/** box-volume(solid-0) = 2*3*5 = 30. */
export const EXPECTED_BOX_VOLUME = 30;

/** The strictly-inside point answers true (boundary distance 1 > 0.01). */
export const EXPECTED_INSIDE_VERDICT = true as const;

/** The near-boundary point answers "within-tolerance" (≈0.001 ≤ 0.01). */
export const EXPECTED_NEAR_BOUNDARY_VERDICT = "within-tolerance" as const;

/** The far-outside point answers false (boundary distance ≈ 8.49 > 0.01). */
export const EXPECTED_OUTSIDE_VERDICT = false as const;

/** The signed boundary distance of the inside point (positive: inside). */
export const EXPECTED_INSIDE_SIGNED_DISTANCE = 1;

/**
 * The hand-derivation of the near-boundary signed distance:
 * 4.001 − 4 (an exact IEEE subtraction; the verdict band is what the
 * tests assert, not the literal bits of the distance).
 */
export const NEAR_BOUNDARY_POINT_X = 4.001;
export const NEAR_BOUNDARY_POLYGON_EDGE_X = 4;

/** The tolerance band the near-boundary verdict is decided against. */
export const EXPECTED_TOLERANCE_BAND = GEOMETRY_FIXTURE_TOLERANCE.linear;
