/**
 * Deterministic least-squares plane and line fitting (AISE-013).
 *
 * Plane: centroid + population covariance (divide-by-n) of the centered
 * points, eigen-decomposed by symmetricEigen3 (Smith closed form). The
 * least-squares plane normal is the eigenvector of the SMALLEST eigenvalue;
 * `d` satisfies n·x + d = 0 with d = −n·centroid. The plane equation scale
 * is exact: unit normal. rmsResidual is the root-mean-square SIGNED distance
 * Σ sqrt(dot(n, pᵢ) + d)²/n — mathematically sqrt(λ_min) (Rayleigh
 * quotient), computed explicitly from residuals.
 *
 * Line: same covariance; the direction is the LARGEST eigenvalue's
 * eigenvector through the centroid; rmsResidual is the RMS orthogonal
 * distance to the line — mathematically sqrt(λ_mid + λ_min). COLLINEAR
 * input is the IDEAL case for a line (rms 0), NOT a degeneracy; only
 * COINCIDENT points (no direction defined) fail typed.
 *
 * Degeneracy discipline (typed GeometryError, never silent):
 *   - fitPlane: < 3 points → INSUFFICIENT_POINTS; rank ≤ 1 (middle
 *     eigenvalue below COLLINEARITY_RATIO_TOLERANCE × largest) →
 *     DEGENERATE_COLLINEAR; all eigenvalues below
 *     COINCIDENT_TOLERANCE (absolute) → DEGENERATE_COINCIDENT.
 *   - fitLine: < 2 points → INSUFFICIENT_POINTS; largest eigenvalue below
 *     COINCIDENT_TOLERANCE → DEGENERATE_COINCIDENT.
 *
 * Point-order dependence: sums are accumulated in the caller's array order,
 * so PERMUTING the input points changes floating-point rounding at the
 * ~1e-16·scale level. Order is part of the input bits — determinism means
 * identical input (including order) → identical output; the tests pin
 * permutation insensitivity beyond 1e-12 relative, which holds for the
 * closed-form solution.
 */

import { GeometryError } from "./errors";
import { symmetricEigen3, type SymmetricEigen } from "./eigen";
import {
  canonicalAxisSign,
  canonicalZero,
  type Mat3,
  type Vec3,
  vecDot,
  vecScale,
  vecSub,
} from "./vector";

/**
 * Plane as unit normal + offset: points x satisfy dot(normal, x) + d = 0.
 * The signed distance of point p is dot(normal, p) + d (positive on the
 * side the normal points toward).
 */
export interface Plane {
  readonly normal: Vec3;
  readonly d: number;
}

/** Result of `fitPlane`. Eigenvalues ASCENDING (λ1 ≤ λ2 ≤ λ3). */
export interface PlaneFitResult {
  readonly plane: Plane;
  /** RMS signed distance of the input points to the fitted plane. */
  readonly rmsResidual: number;
  readonly pointCount: number;
  readonly eigenvalues: readonly [number, number, number];
}

/** Line as origin + unit direction: x(t) = origin + t·direction. */
export interface Line {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

/** Result of `fitLine`. Eigenvalues ASCENDING (λ1 ≤ λ2 ≤ λ3). */
export interface LineFitResult {
  readonly line: Line;
  /** RMS orthogonal distance of the input points to the fitted line. */
  readonly rmsResidual: number;
  readonly pointCount: number;
  readonly eigenvalues: readonly [number, number, number];
}

/**
 * Absolute covariance (length²) tolerance below which ALL spread counts as
 * coincident: largest eigenvalue ≤ 1e-12 ⇒ every point lies within
 * ~1e-6 length units of the centroid in every direction. Named constant —
 * coincidence is an absolute (scale-carrying) property.
 */
export const COINCIDENT_TOLERANCE = 1e-12;

/**
 * Relative middle-eigenvalue ratio under which the point set is treated as
 * collinear (rank 1): λ_mid ≤ COLLINEARITY_RATIO_TOLERANCE · λ_max. Named
 * constant; borderline sets (perpendicular spread ≲ 1e-6 of the extent)
 * fail typed rather than fitting an arbitrary plane through them.
 */
export const COLLINEARITY_RATIO_TOLERANCE = 1e-12;

/** Arithmetic mean of points, accumulated in input order. */
function centroid(points: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = points.length;
  return [x / n, y / n, z / n];
}

/** Population covariance (divide by n) of centered points, symmetric Mat3. */
function covariance(points: readonly Vec3[], center: Vec3): Mat3 {
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  for (const p of points) {
    const dx = p[0] - center[0];
    const dy = p[1] - center[1];
    const dz = p[2] - center[2];
    xx += dx * dx;
    xy += dx * dy;
    xz += dx * dz;
    yy += dy * dy;
    yz += dy * dz;
    zz += dz * dz;
  }
  const n = points.length;
  return [
    [xx / n, xy / n, xz / n],
    [xy / n, yy / n, yz / n],
    [xz / n, yz / n, zz / n],
  ];
}

/**
 * Least-squares plane fit. See the module header for the method and the
 * degeneracy discipline. The returned normal is sign-canonicalized
 * (largest-magnitude component positive — for a z-dominant plane this is
 * the documented "normal.z > 0" convention).
 */
export function fitPlane(points: readonly Vec3[]): PlaneFitResult {
  const n = points.length;
  if (n < 3) {
    throw new GeometryError(
      "INSUFFICIENT_POINTS",
      `plane fit requires at least 3 points, got ${n}`,
    );
  }
  const center = centroid(points);
  const cov = covariance(points, center);
  const eigen: SymmetricEigen = symmetricEigen3(cov);
  const middle = eigen.eigenvalues[1];
  const largest = eigen.eigenvalues[2];

  if (largest <= COINCIDENT_TOLERANCE) {
    throw new GeometryError(
      "DEGENERATE_COINCIDENT",
      `points are coincident: largest covariance eigenvalue ${largest} ≤ tolerance ${COINCIDENT_TOLERANCE}`,
    );
  }
  if (middle <= COLLINEARITY_RATIO_TOLERANCE * largest) {
    throw new GeometryError(
      "DEGENERATE_COLLINEAR",
      `points are collinear: middle/largest eigenvalue ratio ${middle / largest} ≤ tolerance ${COLLINEARITY_RATIO_TOLERANCE}`,
    );
  }

  // Normal: eigenvector of the smallest eigenvalue, sign-canonicalized
  // (idempotent with eigen's canonicalization — kept explicit here so the
  // plane-level convention is independent of the eigen internals).
  const normal = canonicalAxisSign(eigen.eigenvectors[0]);
  const d = canonicalZero(-vecDot(normal, center));

  let squaredResidualSum = 0;
  for (const p of points) {
    const residual = vecDot(normal, p) + d;
    squaredResidualSum += residual * residual;
  }
  const rmsResidual = Math.sqrt(squaredResidualSum / n);

  return {
    plane: { normal, d },
    rmsResidual,
    pointCount: n,
    eigenvalues: eigen.eigenvalues,
  };
}

/**
 * Least-squares line fit (3D): centroid + principal (largest-eigenvector)
 * direction. Collinear input is the ideal, NOT degenerate; coincident input
 * fails typed (DEGENERATE_COINCIDENT) because no direction is defined.
 * Direction is sign-canonicalized like plane normals.
 */
export function fitLine(points: readonly Vec3[]): LineFitResult {
  const n = points.length;
  if (n < 2) {
    throw new GeometryError(
      "INSUFFICIENT_POINTS",
      `line fit requires at least 2 points, got ${n}`,
    );
  }
  const center = centroid(points);
  const cov = covariance(points, center);
  const eigen: SymmetricEigen = symmetricEigen3(cov);
  const largest = eigen.eigenvalues[2];

  if (largest <= COINCIDENT_TOLERANCE) {
    throw new GeometryError(
      "DEGENERATE_COINCIDENT",
      `points are coincident: largest covariance eigenvalue ${largest} ≤ tolerance ${COINCIDENT_TOLERANCE}`,
    );
  }

  const direction = canonicalAxisSign(eigen.eigenvectors[2]);
  const origin = center;

  let squaredResidualSum = 0;
  for (const p of points) {
    // Orthogonal distance to the line: |(p − origin) − ((p − origin)·d)d|.
    const delta = vecSub(p, origin);
    const along = vecDot(delta, direction);
    const perpendicular = vecSub(delta, vecScale(direction, along));
    squaredResidualSum += vecDot(perpendicular, perpendicular);
  }
  const rmsResidual = Math.sqrt(squaredResidualSum / n);

  return {
    line: { origin, direction },
    rmsResidual,
    pointCount: n,
    eigenvalues: eigen.eigenvalues,
  };
}

