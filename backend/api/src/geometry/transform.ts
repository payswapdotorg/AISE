/**
 * Metric transform validation (AISE-013) — the WorldSculpt gate.
 *
 * Per docs/worldsculpt-integration-strategy.md (AISE-013 duty): NO engine
 * transform reaches engineering measurement without validation of its
 * coordinate transform and metric scale. `validateMetricTransform` detects
 * reflection, near-singularity, non-uniform scale, out-of-reference scale
 * and shear in the 3×3 linear part (translation column is irrelevant to
 * these properties and is ignored); `applyTransform` then applies the
 * AFFINE transform to point sets (bottom row unused — validated transforms
 * are affine by construction).
 *
 * Method (fixed, documented):
 *   - scale factors per axis: column norms |M·e_k| of the linear part;
 *   - uniformScale: arithmetic mean of the three factors;
 *   - determinant: of the linear part (= det of an affine Mat4);
 *   - shear: |u_i·u_j| between the unit column directions — the sine of
 *     the deviation from a right angle between transformed basis axes.
 *
 * Issue codes (typed, in this fixed report order):
 *   NON_AFFINE, SINGULAR, REFLECTION, NON_UNIFORM_SCALE,
 *   SCALE_OUT_OF_RANGE, EXCESS_SHEAR.
 * NON_AFFINE guards the affine assumption the other checks rest on (an
 * extension beyond the four mandated codes — a perspective bottom row
 * must never slip through as "valid"); SCALE_OUT_OF_RANGE implements the
 * mandated `expectedScaleWithin` reference (unit-mismatch detection, e.g.
 * a millimeter/meter slip producing scale ~1000).
 *
 * All thresholds are named constants; every issue message carries the
 * measured values so verdicts are auditable, and single-element mutations
 * flip verdicts (discrimination-tested).
 */

import { GeometryError } from "./errors";
import {
  canonicalZero,
  type Mat4,
  type Vec3,
  vecDot,
  vecNorm,
} from "./vector";

/** Typed issue codes emitted by validateMetricTransform. */
export const TRANSFORM_ISSUE_CODES = [
  "NON_UNIFORM_SCALE",
  "REFLECTION",
  "SINGULAR",
  "EXCESS_SHEAR",
  "SCALE_OUT_OF_RANGE",
  "NON_AFFINE",
] as const;

export type TransformIssueCode = (typeof TRANSFORM_ISSUE_CODES)[number];

/** One validation finding: stable code + message carrying measured values. */
export interface TransformIssue {
  readonly code: TransformIssueCode;
  readonly message: string;
}

/** Reference expectations for a metric transform. */
export interface MetricTransformReference {
  /** Acceptable uniform-scale range (inclusive), in the target unit. */
  readonly expectedScaleWithin: readonly [number, number];
  /** Relative per-axis scale spread tolerated as uniform (default 1e-6). */
  readonly scaleUniformityTolerance?: number;
  /** Max tolerated |u_i·u_j| shear sine (default 1e-6). */
  readonly maxShearSin?: number;
}

/** Measured properties of the transform's linear part. */
export interface TransformMeasurement {
  /** Per-axis scale factors (column norms), in column order. */
  readonly scaleFactors: readonly [number, number, number];
  /** Arithmetic mean of the scale factors. */
  readonly uniformScale: number;
  /** Determinant of the linear part. */
  readonly determinant: number;
  /** Max |u_i·u_j| over unit-column pairs (sine of the shear angle). */
  readonly maxShearSin: number;
}

/** Verdict of validateMetricTransform. */
export interface TransformValidation {
  readonly valid: boolean;
  /** Issues in the documented fixed order; empty ⇔ valid. */
  readonly issues: readonly TransformIssue[];
  readonly measured: TransformMeasurement;
}

/** Relative per-axis scale spread still counted as uniform scale. */
export const DEFAULT_SCALE_UNIFORMITY_TOLERANCE = 1e-6;

/** Default tolerated |u_i·u_j| between transformed basis axes. */
export const DEFAULT_MAX_SHEAR_SIN = 1e-6;

/**
 * |det| at or below this multiple of (largest column norm)³ is singular
 * (rank-deficient linear part; e.g. a collapsed axis or a zero matrix).
 */
export const SINGULAR_DETERMINANT_TOLERANCE = 1e-12;

/** Tolerance on the bottom row's deviation from [0,0,0,1] (affineness). */
export const NON_AFFINE_TOLERANCE = 1e-12;

/** Column `index` (0–2) of the linear part as a Vec3. */
function linearColumn(t: Mat4, index: number): Vec3 {
  if (index === 0) {
    return [t[0][0], t[1][0], t[2][0]];
  }
  if (index === 1) {
    return [t[0][1], t[1][1], t[2][1]];
  }
  return [t[0][2], t[1][2], t[2][2]];
}

function format3(values: readonly number[]): string {
  return `[${values.map((v) => canonicalZero(v)).join(", ")}]`;
}

/**
 * Validate a transform for metric/engineering use. Pure and deterministic;
 * never throws for finite input (findings are returned, not thrown). A
 * malformed reference (min > max, non-positive bounds) throws INVALID_INPUT
 * — the gate itself must not be silently misconfigured.
 */
export function validateMetricTransform(
  t: Mat4,
  reference: MetricTransformReference,
): TransformValidation {
  const [scaleMin, scaleMax] = reference.expectedScaleWithin;
  if (!(scaleMin > 0) || !(scaleMax >= scaleMin)) {
    throw new GeometryError(
      "INVALID_INPUT",
      `expectedScaleWithin must be [min, max] with 0 < min ≤ max, got [${scaleMin}, ${scaleMax}]`,
    );
  }
  const uniformityTolerance =
    reference.scaleUniformityTolerance ?? DEFAULT_SCALE_UNIFORMITY_TOLERANCE;
  const shearTolerance = reference.maxShearSin ?? DEFAULT_MAX_SHEAR_SIN;

  const c0 = linearColumn(t, 0);
  const c1 = linearColumn(t, 1);
  const c2 = linearColumn(t, 2);
  const s0 = vecNorm(c0);
  const s1 = vecNorm(c1);
  const s2 = vecNorm(c2);
  const scaleFactors: readonly [number, number, number] = [s0, s1, s2];
  const uniformScale = (s0 + s1 + s2) / 3;
  const determinant =
    t[0][0] * (t[1][1] * t[2][2] - t[1][2] * t[2][1]) -
    t[0][1] * (t[1][0] * t[2][2] - t[1][2] * t[2][0]) +
    t[0][2] * (t[1][0] * t[2][1] - t[1][1] * t[2][0]);
  const maxColumnNorm = Math.max(s0, s1, s2);

  // Shear: sines of inter-axis angles between unit column directions.
  const u0: Vec3 | null =
    s0 === 0 ? null : [c0[0] / s0, c0[1] / s0, c0[2] / s0];
  const u1: Vec3 | null =
    s1 === 0 ? null : [c1[0] / s1, c1[1] / s1, c1[2] / s1];
  const u2: Vec3 | null =
    s2 === 0 ? null : [c2[0] / s2, c2[1] / s2, c2[2] / s2];
  let maxShearSin = 0;
  if (u0 !== null && u1 !== null) {
    maxShearSin = Math.max(maxShearSin, Math.abs(vecDot(u0, u1)));
  }
  if (u0 !== null && u2 !== null) {
    maxShearSin = Math.max(maxShearSin, Math.abs(vecDot(u0, u2)));
  }
  if (u1 !== null && u2 !== null) {
    maxShearSin = Math.max(maxShearSin, Math.abs(vecDot(u1, u2)));
  }

  const issues: TransformIssue[] = [];

  // 1. Affineness — the foundation the other measurements assume.
  const bottomRowDeviation = Math.max(
    Math.abs(t[3][0]),
    Math.abs(t[3][1]),
    Math.abs(t[3][2]),
    Math.abs(t[3][3] - 1),
  );
  if (bottomRowDeviation > NON_AFFINE_TOLERANCE) {
    issues.push({
      code: "NON_AFFINE",
      message: `bottom row is not [0,0,0,1] (max deviation ${bottomRowDeviation} > ${NON_AFFINE_TOLERANCE}); perspective rows are not metric transforms`,
    });
  }

  // 2. Singularity — relative to the largest column norm cubed.
  const singularThreshold =
    SINGULAR_DETERMINANT_TOLERANCE * maxColumnNorm ** 3;
  const singular = Math.abs(determinant) <= singularThreshold;
  if (singular) {
    issues.push({
      code: "SINGULAR",
      message: `determinant ${determinant} is at or below the singularity threshold ${singularThreshold} (rank-deficient linear part)`,
    });
  }

  // 3. Reflection — negative determinant on a non-singular transform.
  if (!singular && determinant < 0) {
    issues.push({
      code: "REFLECTION",
      message: `determinant ${determinant} is negative: the transform mirrors space (handedness flip)`,
    });
  }

  // 4. Non-uniform scale — relative per-axis spread of column norms.
  if (uniformScale > 0) {
    const scaleSpread =
      (Math.max(...scaleFactors) - Math.min(...scaleFactors)) / uniformScale;
    if (scaleSpread > uniformityTolerance) {
      issues.push({
        code: "NON_UNIFORM_SCALE",
        message: `per-axis scale factors ${format3(scaleFactors)} differ by ${(scaleSpread * 100).toFixed(6)}% (relative spread ${scaleSpread} > tolerance ${uniformityTolerance})`,
      });
    }
  }

  // 5. Scale within the reference range (unit-mismatch detection).
  if (uniformScale < scaleMin || uniformScale > scaleMax) {
    issues.push({
      code: "SCALE_OUT_OF_RANGE",
      message: `uniform scale ${uniformScale} is outside the expected range [${scaleMin}, ${scaleMax}]`,
    });
  }

  // 6. Excess shear between transformed basis axes.
  if (maxShearSin > shearTolerance) {
    issues.push({
      code: "EXCESS_SHEAR",
      message: `max shear sine ${maxShearSin} between transformed basis axes exceeds tolerance ${shearTolerance} (axes are not orthogonal after transform)`,
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    measured: {
      scaleFactors,
      uniformScale,
      determinant: canonicalZero(determinant),
      maxShearSin,
    },
  };
}

/**
 * Apply an AFFINE Mat4 to a point set: p' = M3·p + t per point (bottom row
 * unused; validate first — see validateMetricTransform). Pure: returns a
 * new array, never mutates the input.
 */
export function applyTransform(
  t: Mat4,
  points: readonly Vec3[],
): Vec3[] {
  return points.map((p) => [
    t[0][0] * p[0] + t[0][1] * p[1] + t[0][2] * p[2] + t[0][3],
    t[1][0] * p[0] + t[1][1] * p[1] + t[1][2] * p[2] + t[1][3],
    t[2][0] * p[0] + t[2][1] * p[1] + t[2][2] * p[2] + t[2][3],
  ]);
}
