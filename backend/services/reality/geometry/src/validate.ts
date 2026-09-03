/**
 * Input validation and canonicalization (AISE-009).
 *
 * Two jobs, both fail-closed:
 *
 * 1. **Finite-value discipline** — every coordinate and numeric
 *    parameter entering a computation is checked finite
 *    (`NON_FINITE_INPUT`). A NaN anywhere in a geometry pipeline
 *    propagates silently into authoritative-looking output; here it
 *    stops at the boundary.
 *
 * 2. **Canonical point order** — point sets are sorted
 *    lexicographically by (x, y, z) before ANY accumulation. This
 *    is what makes every fit a deterministic function of the point
 *    SET rather than of the input ORDER: floating-point addition is
 *    not associative, so summation order changes low-order bits;
 *    canonical order removes the degree of freedom entirely. The
 *    same points in any order produce bit-identical results
 *    (pinned by permutation-invariance tests).
 */
import { GeometryError } from "./errors.js";

/** A raw 3D point. Structurally validated, order-free until canonicalized. */
export interface GeomPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Below this norm a vector is treated as the zero vector. */
export const ZERO_VECTOR_EPS = 1e-12;

/** Assert a number is finite (NaN/±Infinity fail closed). */
export function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GeometryError(
      "NON_FINITE_INPUT",
      `${label} must be a finite number: ${String(value)}`,
      { details: { label, value: String(value) } },
    );
  }
  return value;
}

/** Assert a positive integer parameter. */
export function assertPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new GeometryError("VALIDATION_FAILED", `${label} must be a positive integer: ${String(value)}`, {
      details: { label, value: String(value) },
    });
  }
  return value;
}

/** Assert a positive finite parameter (tolerances, scales, thresholds). */
export function assertPositiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new GeometryError("VALIDATION_FAILED", `${label} must be a finite number > 0: ${String(value)}`, {
      details: { label, value: String(value) },
    });
  }
  return value;
}

/** Assert a non-negative finite parameter. */
export function assertNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new GeometryError("VALIDATION_FAILED", `${label} must be a finite number ≥ 0: ${String(value)}`, {
      details: { label, value: String(value) },
    });
  }
  return value;
}

/** Validate one raw point (finite coordinates). */
export function validateGeomPoint(point: unknown, label: string): GeomPoint {
  if (point === null || typeof point !== "object") {
    throw new GeometryError("VALIDATION_FAILED", `${label} must be a point object`, {
      details: { label },
    });
  }
  const candidate = point as Partial<Record<"x" | "y" | "z", unknown>>;
  const x = assertFiniteNumber(candidate.x, `${label}.x`);
  const y = assertFiniteNumber(candidate.y, `${label}.y`);
  const z = assertFiniteNumber(candidate.z, `${label}.z`);
  return { x, y, z };
}

/**
 * Deterministic lexicographic comparison of two points by
 * (x, y, z). NaN coordinates can never reach here (validated
 * upstream); equal points compare 0 (duplicates are preserved —
 * they are content, and duplicate-weighting is part of the fit).
 */
export function compareGeomPoints(a: GeomPoint, b: GeomPoint): number {
  if (a.x !== b.x) {
    return a.x < b.x ? -1 : 1;
  }
  if (a.y !== b.y) {
    return a.y < b.y ? -1 : 1;
  }
  if (a.z !== b.z) {
    return a.z < b.z ? -1 : 1;
  }
  return 0;
}

/**
 * Validates a point array and returns it in CANONICAL ORDER
 * (lexicographic sort — stable and total, so the result is a pure
 * function of the set). Also enforces the minimum point count.
 *
 * The canonical copy is what every accumulation consumes; the
 * caller's array is never mutated.
 */
export function canonicalizePointSet(
  points: readonly unknown[],
  options: { minCount: number; label?: string },
): GeomPoint[] {
  const label = options.label ?? "points";
  if (!Array.isArray(points)) {
    throw new GeometryError("VALIDATION_FAILED", `${label} must be an array`, {
      details: { label },
    });
  }
  if (points.length < options.minCount) {
    throw new GeometryError(
      "INSUFFICIENT_POINTS",
      `${label}: at least ${options.minCount} points are required, got ${points.length}`,
      { details: { label, required: options.minCount, actual: points.length } },
    );
  }
  const validated = points.map((point, index) => validateGeomPoint(point, `${label}[${index}]`));
  return [...validated].sort(compareGeomPoints);
}

/** A 3D vector with finite components. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Vector norm (sqrt/abs arithmetic only — exact-IEEE discipline, no library hypot). */
export function vec3Norm(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/** Dot product. */
export function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Cross product. */
export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Vector difference a − b. */
export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** Vector sum a + b. */
export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** Vector scaled by a scalar. */
export function vec3Scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

/**
 * Normalize to a unit vector; the zero (or near-zero, below
 * `ZERO_VECTOR_EPS`) vector fails closed with `ZERO_VECTOR`.
 */
export function vec3Normalize(v: Vec3, label: string): Vec3 {
  assertFiniteNumber(v.x, `${label}.x`);
  assertFiniteNumber(v.y, `${label}.y`);
  assertFiniteNumber(v.z, `${label}.z`);
  const norm = vec3Norm(v);
  if (norm < ZERO_VECTOR_EPS) {
    throw new GeometryError("ZERO_VECTOR", `${label} must not be the zero vector (norm ${norm} < ${ZERO_VECTOR_EPS})`, {
      details: { label, norm: String(norm) },
    });
  }
  return { x: v.x / norm, y: v.y / norm, z: v.z / norm };
}

/**
 * Deterministic sign fixing for unit vectors: the component with
 * the largest magnitude is made positive (ties broken by component
 * order x→y→z). A pure function of the vector — used so eigen
 * solvers and fit results have a canonical representative per
 * direction line.
 */
export function vec3FixSign(v: Vec3): Vec3 {
  let maxAbs = Math.abs(v.x);
  let maxIndex = 0;
  if (Math.abs(v.y) > maxAbs) {
    maxAbs = Math.abs(v.y);
    maxIndex = 1;
  }
  if (Math.abs(v.z) > maxAbs) {
    maxAbs = Math.abs(v.z);
    maxIndex = 2;
  }
  const lead = maxIndex === 0 ? v.x : maxIndex === 1 ? v.y : v.z;
  return lead < 0 ? { x: -v.x, y: -v.y, z: -v.z } : v;
}

/** Euclidean distance between two points (sqrt-based, deterministic). */
export function geomPointDistance(a: GeomPoint, b: GeomPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
