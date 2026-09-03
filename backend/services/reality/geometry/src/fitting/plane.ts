/**
 * Deterministic plane fitting (AISE-009).
 *
 * Two methods, both fail-closed:
 *
 * - `fitPlane` — total-least-squares via principal component
 *   analysis: the fitted plane minimizes the sum of squared
 *   perpendicular distances. The normal is the eigenvector of the
 *   covariance matrix with the smallest eigenvalue (computed by
 *   the deterministic Jacobi eigensolver); the plane passes through
 *   the centroid. Optimal for Gaussian noise.
 *
 * - `fitPlaneRobust` — LMedS (least median of squares): candidate
 *   planes from point triples, scored by the MEDIAN absolute
 *   residual (breakdown point 50%); the winning candidate's
 *   inliers (|r| ≤ 2.5·σ̂ with the finite-sample-corrected LMedS
 *   scale) are refit by TLS. Deterministic candidate enumeration
 *   (all triples up to a cap, then seeded fixed-seed sampling of
 *   the canonical triple list).
 *
 * Degeneracies rejected (fail closed, `DEGENERATE_GEOMETRY`):
 * fewer than 3 points (`INSUFFICIENT_POINTS`), non-finite
 * coordinates (`NON_FINITE_INPUT`), identical points, and
 * collinear points — a line does not determine a unique plane, and
 * guessing one would fabricate geometry.
 *
 * Every result carries full residual statistics, propagated
 * first-order uncertainty (when input per-point σ is stated),
 * epistemic state INFERRED (fitting is inference — it never
 * upgrades to OBSERVED/CONFIRMED), and complete provenance.
 */
import { GeometryError } from "../errors.js";
import { assertFitEpistemicState, assertSourceEpistemicState, FIT_EPISTEMIC_STATE } from "../epistemic.js";
import { measurementProvenance, type MeasurementProvenance } from "../provenance.js";
import { canonicalContentHash } from "../canonical.js";
import { ROBUST_SAMPLING_SEED, DeterministicRng } from "../seeded.js";
import {
  assertFiniteNumber,
  assertPositiveInteger,
  canonicalizePointSet,
  vec3FixSign,
  type GeomPoint,
  type Vec3,
} from "../validate.js";
import { eigensystemSymmetric3, type Matrix3 } from "../numeric/matrix.js";
import { computeResidualStats, classifyInliers, lmedsScale, type ResidualStats } from "./residuals.js";
import { type LengthUnit } from "../units.js";
import { type EpistemicState } from "@aise/shared-contracts";

/** Method label for the TLS plane fit. */
export const PLANE_FIT_METHOD = "plane-fit/tls-pca";
/** Method label for the robust LMedS plane fit. */
export const PLANE_ROBUST_FIT_METHOD = "plane-fit/robust-lmeds";

/** Minimum points for a plane. */
export const MIN_PLANE_POINTS = 3;

/**
 * Relative collinearity threshold: the points are collinear when
 * the second-smallest covariance eigenvalue is below this ratio of
 * the largest (the point cloud spreads in only one direction).
 */
export const COLLINEARITY_RATIO = 1e-10;

/** Default cap on LMedS candidate triples before seeded sampling. */
export const DEFAULT_MAX_PLANE_CANDIDATES = 20000;

/** Default LMedS inlier scale multiplier. */
export const DEFAULT_INLIER_SCALE_MULTIPLIER = 2.5;

/** A fitted plane: point + unit normal (sign-fixed canonical representative). */
export interface FittedPlane {
  /** A point on the plane (the TLS centroid / inlier centroid). */
  readonly point: Vec3;
  /** Unit normal, sign-fixed (largest-magnitude component positive). */
  readonly normal: Vec3;
}

/** First-order propagated uncertainty of a plane fit (requires input σ). */
export interface PlaneFitUncertainty {
  /** 1σ of the plane's signed offset from the origin: σ/√n. */
  readonly offsetStandard: number;
  /**
   * 1σ (radians) of the normal direction, first-order:
   * σ / (√n · √(λ₂ + λ₃)) with λ₂, λ₃ the in-plane covariance
   * eigenvalues (the in-plane spread is the lever arm that
   * determines the normal).
   */
  readonly normalAngleStandard: number;
}

/** Input for a plane fit. */
export interface FitPlaneInput {
  readonly points: readonly GeomPoint[];
  /** Unit of the point coordinates (explicit — never implicit). */
  readonly unit: LengthUnit;
  /**
   * Epistemic state of the point SOURCE as declared by the caller
   * (survey control points may be OBSERVED). Default INFERRED. The
   * FIT result is INFERRED regardless — this declaration is
   * recorded in provenance and used by nothing else.
   */
  readonly sourceEpistemic?: EpistemicState;
  /** Isotropic per-axis 1σ of point positions, in `unit` (optional). */
  readonly perPointStandardUncertainty?: number;
}

/** Common result shape for both plane fit methods. */
export interface PlaneFitResult {
  readonly kind: "plane-fit";
  /** The fitted plane. */
  readonly plane: FittedPlane;
  /** Signed distance from the origin along the normal (with unit + uncertainty). */
  readonly offsetFromOrigin: { value: number; unit: LengthUnit; uncertainty?: { kind: "standard"; u: number } };
  /** Residual statistics over ALL input points (signed perpendicular distances). */
  readonly residualStats: ResidualStats;
  /** Robust-mode report: inlier/outlier split and inlier-only statistics. */
  readonly robust?: {
    readonly inlierCount: number;
    readonly outlierCount: number;
    readonly inlierResidualStats: ResidualStats;
    /** The LMedS scale estimate used for classification. */
    readonly scale: number;
  };
  /** Propagated first-order uncertainty (present iff input σ was stated). */
  readonly uncertainty?: PlaneFitUncertainty;
  /** Always INFERRED — fitting is inference over evidence. */
  readonly epistemic: EpistemicState;
  /** Complete lineage: method, parameters, content-pinned inputs. */
  readonly provenance: MeasurementProvenance;
  /** The unit of all coordinates and measurements in this result. */
  readonly unit: LengthUnit;
}

/** Total-least-squares plane fit (PCA). */
export function fitPlane(input: FitPlaneInput): PlaneFitResult {
  const points = canonicalizePointSet(input.points, { minCount: MIN_PLANE_POINTS, label: "fitPlane.points" });
  const sourceEpistemic = assertSourceEpistemicState(input.sourceEpistemic ?? "INFERRED");
  const sigma = validateSigma(input.perPointStandardUncertainty);

  const fit = tlsPlane(points);
  const residualStats = planeResidualStats(points, fit.plane);
  const provenance = measurementProvenance(
    PLANE_FIT_METHOD,
    {
      unit: input.unit,
      pointCount: points.length,
      method: "tls-pca",
      collinearityRatio: COLLINEARITY_RATIO,
      perPointStandardUncertainty: sigma,
      sourceEpistemic,
    },
    [pointSetRef(points, sourceEpistemic)],
  );
  assertFitEpistemicState(FIT_EPISTEMIC_STATE);

  return finalizePlaneResult({
    plane: fit.plane,
    eigenvalues: fit.eigenvalues,
    points,
    residualStats,
    sigma,
    unit: input.unit,
    provenance,
  });
}

/** Robust LMedS plane fit with TLS refit on inliers. */
export function fitPlaneRobust(
  input: FitPlaneInput,
  options: {
    /** Cap on enumerated candidate triples (above → seeded sampling). */
    readonly maxCandidates?: number;
    /** Inlier bound: |r| ≤ multiplier · LMedS scale. */
    readonly inlierScaleMultiplier?: number;
  } = {},
): PlaneFitResult {
  const points = canonicalizePointSet(input.points, { minCount: MIN_PLANE_POINTS, label: "fitPlaneRobust.points" });
  const sourceEpistemic = assertSourceEpistemicState(input.sourceEpistemic ?? "INFERRED");
  const sigma = validateSigma(input.perPointStandardUncertainty);
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_PLANE_CANDIDATES;
  const scaleMultiplier = options.inlierScaleMultiplier ?? DEFAULT_INLIER_SCALE_MULTIPLIER;

  const candidates = candidateTriples(points.length, maxCandidates);
  let bestPlane: FittedPlane | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestResiduals: number[] = [];
  for (const [i, j, k] of candidates) {
    const plane = planeThroughThreePoints(
      points[i] as GeomPoint,
      points[j] as GeomPoint,
      points[k] as GeomPoint,
    );
    if (plane === null) {
      continue; // collinear triple — not a plane candidate
    }
    const residuals = points.map((point) => signedPlaneDistance(point, plane));
    const score = medianOfAbs(residuals);
    // Strict improvement keeps the FIRST candidate on ties — deterministic.
    if (score < bestScore) {
      bestScore = score;
      bestPlane = plane;
      bestResiduals = residuals;
    }
  }
  if (bestPlane === null) {
    throw new GeometryError(
      "DEGENERATE_GEOMETRY",
      "robust plane fit: no non-degenerate candidate plane exists (points are collinear or coincident)",
      { details: { pointCount: points.length, candidateCount: candidates.length } },
    );
  }

  const scale = Math.max(
    lmedsScale(bestResiduals.map(Math.abs), 3),
    planeInlierFloor(points),
  );
  const inlierFlags = classifyInliers(bestResiduals, scale, scaleMultiplier);
  const inliers = points.filter((_, index) => inlierFlags[index] === true);
  if (inliers.length < MIN_PLANE_POINTS) {
    throw new GeometryError(
      "DEGENERATE_GEOMETRY",
      `robust plane fit isolated only ${inliers.length} inliers (need ${MIN_PLANE_POINTS}) — no dominant plane in the data`,
      { details: { inlierCount: inliers.length, outlierCount: points.length - inliers.length } },
    );
  }

  const refit = tlsPlane(inliers);
  const residualStats = planeResidualStats(points, refit.plane);
  const inlierResidualStats = planeResidualStats(inliers, refit.plane);
  const provenance = measurementProvenance(
    PLANE_ROBUST_FIT_METHOD,
    {
      unit: input.unit,
      pointCount: points.length,
      method: "lmeds-then-tls-pca",
      maxCandidates,
      candidateCount: candidates.length,
      sampled: candidates.length < tripleCount(points.length),
      samplingSeed: ROBUST_SAMPLING_SEED,
      inlierScaleMultiplier: scaleMultiplier,
      collinearityRatio: COLLINEARITY_RATIO,
      perPointStandardUncertainty: sigma,
      sourceEpistemic,
    },
    [pointSetRef(points, sourceEpistemic)],
  );
  assertFitEpistemicState(FIT_EPISTEMIC_STATE);

  const base = finalizePlaneResult({
    plane: refit.plane,
    eigenvalues: refit.eigenvalues,
    points,
    residualStats,
    sigma,
    unit: input.unit,
    provenance,
  });
  return {
    ...base,
    robust: {
      inlierCount: inliers.length,
      outlierCount: points.length - inliers.length,
      inlierResidualStats,
      scale,
    },
    // Robust-mode propagated uncertainty uses the INLIER count —
    // outliers do not participate in the final fit.
    uncertainty: sigma === undefined ? undefined : planeUncertainty(refit.eigenvalues, inliers.length, sigma),
    offsetFromOrigin: sigma === undefined
      ? { value: offsetOf(refit.plane), unit: input.unit }
      : {
          value: offsetOf(refit.plane),
          unit: input.unit,
          uncertainty: { kind: "standard", u: sigma / Math.sqrt(inliers.length) },
        },
  };
}

// --- internals ---

interface TlsPlaneFit {
  readonly plane: FittedPlane;
  readonly eigenvalues: readonly [number, number, number];
  readonly pointCount: number;
}

function tlsPlane(points: readonly GeomPoint[]): TlsPlaneFit {
  const n = points.length;
  // Centroid — accumulate in canonical order (bit-stable).
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const point of points) {
    cx += point.x;
    cy += point.y;
    cz += point.z;
  }
  const centroid: Vec3 = { x: cx / n, y: cy / n, z: cz / n };

  // Covariance (1/n — variance semantics), canonical order.
  let cxx = 0;
  let cxy = 0;
  let cxz = 0;
  let cyy = 0;
  let cyz = 0;
  let czz = 0;
  for (const point of points) {
    const dx = point.x - centroid.x;
    const dy = point.y - centroid.y;
    const dz = point.z - centroid.z;
    cxx += dx * dx;
    cxy += dx * dy;
    cxz += dx * dz;
    cyy += dy * dy;
    cyz += dy * dz;
    czz += dz * dz;
  }
  const covariance: Matrix3 = [
    [cxx / n, cxy / n, cxz / n],
    [cxy / n, cyy / n, cyz / n],
    [cxz / n, cyz / n, czz / n],
  ];
  const { eigenvalues, eigenvectors } = eigensystemSymmetric3(covariance);

  const [, lambda2, lambda3] = eigenvalues;
  if (!(lambda3 > 0) || Math.abs(lambda3) < 1e-300) {
    throw new GeometryError(
      "DEGENERATE_GEOMETRY",
      "all points are coincident — a plane is not determined",
      { details: { largestEigenvalue: String(lambda3) } },
    );
  }
  if (lambda2 <= lambda3 * COLLINEARITY_RATIO) {
    throw new GeometryError(
      "DEGENERATE_GEOMETRY",
      `points are collinear (λ₂/λ₃ = ${String(lambda2 / lambda3)} ≤ ${COLLINEARITY_RATIO}) — a line does not determine a unique plane`,
      { details: { ratio: String(lambda2 / lambda3), threshold: COLLINEARITY_RATIO } },
    );
  }

  const normal = vec3FixSign(eigenvectors[0] as Vec3);
  return {
    plane: { point: centroid, normal },
    eigenvalues,
    pointCount: n,
  };
}

function finalizePlaneResult(args: {
  plane: FittedPlane;
  eigenvalues: readonly [number, number, number];
  points: readonly GeomPoint[];
  residualStats: ResidualStats;
  sigma?: number;
  unit: LengthUnit;
  provenance: MeasurementProvenance;
}): PlaneFitResult {
  const { plane, eigenvalues, points, residualStats, sigma, unit, provenance } = args;
  const offset = offsetOf(plane);
  return {
    kind: "plane-fit",
    plane,
    offsetFromOrigin: sigma === undefined
      ? { value: offset, unit }
      : { value: offset, unit, uncertainty: { kind: "standard", u: sigma / Math.sqrt(points.length) } },
    residualStats,
    uncertainty: sigma === undefined ? undefined : planeUncertainty(eigenvalues, points.length, sigma),
    epistemic: FIT_EPISTEMIC_STATE,
    provenance,
    unit,
  };
}

function planeUncertainty(
  eigenvalues: readonly [number, number, number],
  pointCount: number,
  sigma: number,
): PlaneFitUncertainty {
  const inPlaneVariance = (eigenvalues[1] as number) + (eigenvalues[2] as number);
  const leverArm = Math.sqrt(Math.max(inPlaneVariance, 0));
  return {
    offsetStandard: sigma / Math.sqrt(pointCount),
    normalAngleStandard: sigma / (Math.sqrt(pointCount) * leverArm),
  };
}

function offsetOf(plane: FittedPlane): number {
  return plane.normal.x * plane.point.x + plane.normal.y * plane.point.y + plane.normal.z * plane.point.z;
}

function planeResidualStats(points: readonly GeomPoint[], plane: FittedPlane): ResidualStats {
  return computeResidualStats(points.map((point) => signedPlaneDistance(point, plane)));
}

function signedPlaneDistance(point: GeomPoint, plane: FittedPlane): number {
  const dx = point.x - plane.point.x;
  const dy = point.y - plane.point.y;
  const dz = point.z - plane.point.z;
  return plane.normal.x * dx + plane.normal.y * dy + plane.normal.z * dz;
}

function planeThroughThreePoints(a: GeomPoint, b: GeomPoint, c: GeomPoint): FittedPlane | null {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  const normal = {
    x: uy * vz - uz * vy,
    y: uz * vx - ux * vz,
    z: ux * vy - uy * vx,
  };
  const norm = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
  if (norm < 1e-12) {
    return null; // collinear triple
  }
  const unitNormal = { x: normal.x / norm, y: normal.y / norm, z: normal.z / norm };
  return { point: a, normal: vec3FixSign(unitNormal) };
}

function medianOfAbs(values: readonly number[]): number {
  const sorted = values.map(Math.abs).sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 === 1
    ? (sorted[(n - 1) / 2] as number)
    : ((sorted[n / 2 - 1] as number) + (sorted[n / 2] as number)) / 2;
}

/**
 * Scale-relative inlier floor for the LMedS plane bound: exact
 * data has σ̂ ≈ 0 (median residual exactly zero when ≥ 50% of
 * points are exactly on the plane); the floor keeps rounding-level
 * residuals classifiable instead of degenerating the bound to a
 * zero-width window. 1e-12·(1 + max |coordinate|).
 */
function planeInlierFloor(points: readonly GeomPoint[]): number {
  let maxAbs = 1;
  for (const point of points) {
    const candidate = Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z));
    if (candidate > maxAbs) {
      maxAbs = candidate;
    }
  }
  return 1e-12 * maxAbs;
}

function tripleCount(n: number): number {
  return (n * (n - 1) * (n - 2)) / 6;
}

/**
 * Deterministic candidate triples: all C(n,3) in canonical
 * (i, j, k) lexicographic order while the count is within the cap;
 * above the cap, a fixed-seed RNG selects triple indices from the
 * same canonical enumeration. The enumeration order is total, and
 * the seed is a recorded constant — reproducible everywhere.
 */
function candidateTriples(n: number, maxCandidates: number): readonly (readonly [number, number, number])[] {
  assertPositiveInteger(n, "point count");
  assertPositiveInteger(maxCandidates, "maxCandidates");
  const total = tripleCount(n);
  const triples: [number, number, number][] = [];
  if (total <= maxCandidates) {
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        for (let k = j + 1; k < n; k += 1) {
          triples.push([i, j, k]);
        }
      }
    }
    return triples;
  }
  // Seeded sampling without replacement over the canonical index space.
  const rng = new DeterministicRng(ROBUST_SAMPLING_SEED);
  const chosen = new Set<number>();
  while (chosen.size < maxCandidates) {
    const index = rng.nextUint32() % total;
    chosen.add(index);
  }
  const sortedIndices = [...chosen].sort((a, b) => a - b);
  for (const index of sortedIndices) {
    triples.push(tripleAt(index, n));
  }
  return triples;
}

/** Maps a canonical triple index back to its (i, j, k) triple. */
function tripleAt(index: number, n: number): [number, number, number] {
  let remaining = index;
  for (let i = 0; i < n - 2; i += 1) {
    const iCount = ((n - 1 - i) * (n - 2 - i)) / 2;
    if (remaining < iCount) {
      for (let j = i + 1; j < n - 1; j += 1) {
        const jCount = n - 1 - j;
        if (remaining < jCount) {
          return [i, j, j + 1 + remaining];
        }
        remaining -= jCount;
      }
    }
    remaining -= iCount;
  }
  // Unreachable for valid indices; fail closed if reached.
  throw new GeometryError("INTERNAL_ERROR", `triple index ${index} out of range for n=${n}`, {
    details: {},
  });
}

function validateSigma(sigma: number | undefined): number | undefined {
  if (sigma === undefined) {
    return undefined;
  }
  const value = assertFiniteNumber(sigma, "perPointStandardUncertainty");
  if (value <= 0) {
    throw new GeometryError(
      "UNCERTAINTY_INVALID",
      `perPointStandardUncertainty must be > 0 (or omitted): ${String(sigma)}`,
      { details: { value: String(sigma) } },
    );
  }
  return value;
}

function pointSetRef(points: readonly GeomPoint[], sourceEpistemic: EpistemicState): {
  kind: "point-set";
  pointCount: number;
  contentHash: string;
  epistemic: EpistemicState;
} {
  return {
    kind: "point-set",
    pointCount: points.length,
    contentHash: canonicalContentHash(points.map((point) => [point.x, point.y, point.z])),
    epistemic: sourceEpistemic,
  };
}
