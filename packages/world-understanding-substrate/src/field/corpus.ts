/**
 * WORLD-P0-B — the deterministic FIELD corpus (`src/field/`).
 *
 * A committed, hand-authored fixture of DECLARED structured-grid sample
 * tables with HAND-COMPUTED exact values (the house discipline: no
 * network, no vendored dataset, no engine). Every fixture number is
 * chosen so the closed-form discrete results are EXACT in IEEE-754
 * double arithmetic — the doubles' outputs are bit-stable and
 * re-derivable by hand:
 *
 *   - grid: 3x3 nodes, origin (0,0), spacing (1,1) — a 2x2 cell domain
 *     of area 1 each (samples row-major, y-major: index = j*3 + i);
 *   - scalar field f(x,y) = 3x + 4y over the nodes:
 *       y=0:  0, 3, 6        y=1:  4, 7, 10        y=2:  8, 11, 14
 *     -> extent   = 14 - 0  = 14   (max - min)
 *     -> mean     = 63 / 9  = 7    (the sum is divisible by the count)
 *     -> norm-l1  = 63            (sum of absolute values)
 *     -> integral = 28            (composite trapezoid: corners 0,6,8,14
 *                                  weight 1/4 -> 7; edge nodes 3,4,10,11
 *                                  weight 1/2 -> 14; interior 7 weight 1
 *                                  -> 7; per-cell corner-average form:
 *                                  3.5 + 6.5 + 7.5 + 10.5 = 28)
 *   - vector field (u,v) = (2x, 3y) over the same nodes:
 *     -> vector magnitude at node 5 (x=2,y=1) = |(4,3)| = 5 (3-4-5);
 *     -> divergence at node 4 (x=1,y=1):
 *          (u(2,1) - u(0,1)) / (2*1) + (v(1,2) - v(1,0)) / (2*1)
 *          = (4 - 0)/2 + (6 - 0)/2 = 2 + 3 = 5;
 *   - threshold probes on the scalar table (tolerance band 0.01):
 *       node 4 (value 7) vs threshold 5      -> true (margin +2 > band);
 *       node 2 (value 6) vs threshold 5.999  -> "within-tolerance"
 *         (6 - 5.999 = ~0.001 <= 0.01 — the seam law #4 drill);
 *       node 3 (value 4) vs threshold 5      -> false (margin -1).
 *
 * The grid/array names are VTK-flavored external labels
 * (vtk-structured-grid-0 / vtk-point-data-scalars-0 /
 * vtk-point-data-vectors-0) — carried as `vtk-dataobject` namespaced
 * labels, never identity (law #1).
 */

import { textDigestOf } from "../seam";
import type {
  FieldComputationRequest,
  FieldGridDeclaration,
  FieldOperation,
  FieldPoint2,
  FieldToleranceDeclaration,
  FieldUnitDeclaration,
  ScalarFieldDeclaration,
  VectorFieldDeclaration,
} from "./contract";

/* ------------------------------------------------------------------ */
/* The fixture declarations                                             */
/* ------------------------------------------------------------------ */

/** The DECLARED subject (a 64-hex content id — field fabricates no identity). */
export const FIELD_FIXTURE_SUBJECT_REF = textDigestOf(
  "AISE-WORLD-P0-B-field-fixture-subject",
);

/** The declared evidence content id of the registered fixture source. */
export const FIELD_FIXTURE_EVIDENCE_CONTENT_ID = textDigestOf(
  "AISE-WORLD-P0-B-field-fixture-evidence-binding",
);

/** The declared recording instant (deterministic — no clock reads). */
export const FIELD_FIXTURE_RECORDED_AT = "2026-10-02T00:00:00.000Z" as const;

/** The declared tolerance (carried VERBATIM into results — seam law #4). */
export const FIELD_FIXTURE_TOLERANCE: FieldToleranceDeclaration = { value: 0.01 };

/** The declared units the computed values are expressed in. */
export const FIELD_FIXTURE_UNITS: FieldUnitDeclaration = { value: "K", coordinate: "m" };

/** The declared structured grid (row-major y-major sample indexing). */
export const FIELD_FIXTURE_GRID: FieldGridDeclaration = {
  name: "vtk-structured-grid-0",
  nx: 3,
  ny: 3,
  origin: { x: 0, y: 0 },
  spacing: { x: 1, y: 1 },
};

/** The declared scalar samples: f(x,y) = 3x + 4y (hand-computed above). */
export const FIELD_FIXTURE_SCALAR_FIELD: ScalarFieldDeclaration = {
  name: "vtk-point-data-scalars-0",
  values: [0, 3, 6, 4, 7, 10, 8, 11, 14],
};

/** The declared vector samples: (u,v) = (2x, 3y) (hand-computed above). */
export const FIELD_FIXTURE_VECTOR_FIELD: VectorFieldDeclaration = {
  name: "vtk-point-data-vectors-0",
  samples: [
    { u: 0, v: 0 },
    { u: 2, v: 0 },
    { u: 4, v: 0 },
    { u: 0, v: 3 },
    { u: 2, v: 3 },
    { u: 4, v: 3 },
    { u: 0, v: 6 },
    { u: 2, v: 6 },
    { u: 4, v: 6 },
  ],
};

/** The magnitude probe node: (x=2, y=1) — the vector sample (4, 3). */
export const FIELD_FIXTURE_MAGNITUDE_NODE = 5;

/** The divergence probe node: (x=1, y=1) — the interior node. */
export const FIELD_FIXTURE_DIVERGENCE_NODE = 4;

/* ------------------------------------------------------------------ */
/* The requests                                                         */
/* ------------------------------------------------------------------ */

const FULL_OPERATIONS: readonly FieldOperation[] = [
  { operation: "field-extent" },
  { operation: "field-mean" },
  { operation: "field-norm-l1" },
  { operation: "field-vector-magnitude", node: FIELD_FIXTURE_MAGNITUDE_NODE },
  { operation: "field-divergence", node: FIELD_FIXTURE_DIVERGENCE_NODE },
  { operation: "field-integral" },
  { operation: "field-above-threshold", node: 4, threshold: 5 },
  { operation: "field-above-threshold", node: 2, threshold: 5.999 },
  { operation: "field-above-threshold", node: 3, threshold: 5 },
];

const MEASUREMENT_OPERATIONS: readonly FieldOperation[] = [
  { operation: "field-extent" },
  { operation: "field-mean" },
  { operation: "field-norm-l1" },
  { operation: "field-vector-magnitude", node: FIELD_FIXTURE_MAGNITUDE_NODE },
  { operation: "field-divergence", node: FIELD_FIXTURE_DIVERGENCE_NODE },
  { operation: "field-integral" },
];

const PREDICATE_OPERATIONS: readonly FieldOperation[] = [
  { operation: "field-above-threshold", node: 4, threshold: 5 },
  { operation: "field-above-threshold", node: 2, threshold: 5.999 },
  { operation: "field-above-threshold", node: 3, threshold: 5 },
];

function baseRequest(operations: readonly FieldOperation[]): FieldComputationRequest {
  return {
    kind: "field-computation-request",
    schemaVersion: "field-computation-request/1",
    subjectRef: FIELD_FIXTURE_SUBJECT_REF,
    grid: FIELD_FIXTURE_GRID,
    scalarField: FIELD_FIXTURE_SCALAR_FIELD,
    vectorField: FIELD_FIXTURE_VECTOR_FIELD,
    operations,
    tolerance: FIELD_FIXTURE_TOLERANCE,
    units: FIELD_FIXTURE_UNITS,
    evidenceContentId: FIELD_FIXTURE_EVIDENCE_CONTENT_ID,
    recordedAt: FIELD_FIXTURE_RECORDED_AT,
  };
}

/** The full-operations request over the fixture sample tables. */
export const FULL_FIELD_REQUEST: FieldComputationRequest = baseRequest(FULL_OPERATIONS);

/** Measurements only (the six discrete closed-form measurements). */
export const MEASUREMENTS_ONLY_FIELD_REQUEST: FieldComputationRequest = baseRequest(MEASUREMENT_OPERATIONS);

/** Predicates only (the three threshold verdicts). */
export const PREDICATES_ONLY_FIELD_REQUEST: FieldComputationRequest = baseRequest(PREDICATE_OPERATIONS);

/** No operations at all — every result array must come back empty. */
export const NO_FIELD_OPERATIONS_REQUEST: FieldComputationRequest = baseRequest([]);

/* ------------------------------------------------------------------ */
/* The expected exact facts (hand-computed, drilled by tests)           */
/* ------------------------------------------------------------------ */

/** field-extent = max - min = 14 - 0 = 14. */
export const EXPECTED_FIELD_EXTENT = 14;

/** field-mean = 63 / 9 = 7. */
export const EXPECTED_FIELD_MEAN = 7;

/** field-norm-l1 = |0|+|3|+|6|+|4|+|7|+|10|+|8|+|11|+|14| = 63. */
export const EXPECTED_FIELD_NORM_L1 = 63;

/** field-vector-magnitude(node 5) = |(4,3)| = 5. */
export const EXPECTED_FIELD_VECTOR_MAGNITUDE = 5;

/** field-divergence(node 4) = (4-0)/2 + (6-0)/2 = 5. */
export const EXPECTED_FIELD_DIVERGENCE = 5;

/** field-integral = composite trapezoid over the 2x2-cell domain = 28. */
export const EXPECTED_FIELD_INTEGRAL = 28;

/** The strictly-above probe answers true (margin 2 > 0.01). */
export const EXPECTED_ABOVE_VERDICT = true as const;

/** The near-threshold probe answers "within-tolerance" (~0.001 <= 0.01). */
export const EXPECTED_NEAR_THRESHOLD_VERDICT = "within-tolerance" as const;

/** The below probe answers false (margin -1, |−1| > 0.01). */
export const EXPECTED_BELOW_VERDICT = false as const;

/** The signed margin of the strictly-above probe (positive: above). */
export const EXPECTED_ABOVE_SIGNED_MARGIN = 2;

/** The signed margin of the below probe (negative: below). */
export const EXPECTED_BELOW_SIGNED_MARGIN = -1;

/**
 * The hand-derivation of the near-threshold margin: 6 − 5.999 (a
 * rounding-exact subtraction in the fixture's intent; the VERDICT BAND
 * is what the tests assert, not the literal bits of the margin).
 */
export const NEAR_THRESHOLD_NODE_VALUE = 6;
export const NEAR_THRESHOLD_DECLARED = 5.999;

/** The tolerance band the near-threshold verdict is decided against. */
export const EXPECTED_FIELD_TOLERANCE_BAND = FIELD_FIXTURE_TOLERANCE.value;

/** The fixture's node coordinates (row-major, y-major), for derivations. */
export const FIELD_FIXTURE_NODE_OF: readonly FieldPoint2[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
  { x: 2, y: 1 },
  { x: 0, y: 2 },
  { x: 1, y: 2 },
  { x: 2, y: 2 },
];
