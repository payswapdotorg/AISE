/**
 * Deterministic cylinder fitting (AISE-009).
 *
 * A cylinder is determined by 5 parameters (axis direction 2, axis
 * position 2, radius 1). The fit proceeds in three deterministic
 * stages:
 *
 * 1. **Local normals** — for every point, the smallest-eigenvector
 *    of the covariance of its k nearest neighbors (canonical k-NN:
 *    ties broken by canonical index). Points whose neighborhood is
 *    collinear yield no normal and are excluded from axis
 *    estimation (their neighborhoods carry no surface
 *    information). Sign never matters downstream (all consumers
 *    are sign-invariant).
 *
 * 2. **Axis** — every cylinder surface normal is perpendicular to
 *    the axis, so the axis is the null direction of the normal
 *    scatter matrix Σ n̂ n̂ᵀ (smallest eigenvector — closed form,
 *    sign-invariant, deterministic). The axis is rejected as
 *    AMBIGUOUS when the second-smallest eigenvalue is not clearly
 *    larger than the smallest (sphere: three equal eigenvalues;
 *    plane: two near-null directions) — a shape whose normals do
 *    not share exactly one perpendicular direction is not a
 *    cylinder, and we fail closed instead of picking arbitrarily.
 *
 *    The robust variant (`fitCylinderRobust`) selects the axis by
 *    LMedS over candidate axes n̂ᵢ × n̂ⱼ (the intersection line of
 *    two tangent planes is parallel to the cylinder axis) and
 *    recomputes it from the inlier normal scatter.
 *
 * 3. **Cross-section** — points are projected onto the plane
 *    perpendicular to the axis (deterministic 2D frame) and fitted
 *    with the Kása + Gauss-Newton circle fit. Residuals are the
 *    radial distances to the axis minus the radius.
 *
 * Validity is explicit, not implied: the RMS radial residual must
 * be within `maxRmsResidualRatio · R` (default 2%) or the fit fails
 * with `INVALID_FIT` — points that do not lie on a common cylinder
 * (a cone's varying radii, two coaxial rings, a slab) never
 * produce an authoritative-looking cylinder.
 *
 * As everywhere in this package: results are epistemic INFERRED,
 * provenance-complete, unit-explicit, and deterministically
 * reproducible (canonical point order; fixed algorithm; no
 * ambient state).
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
import { fitCircle2, type Circle2 } from "../numeric/circle.js";
import { type LengthUnit } from "../units.js";
import { type EpistemicState } from "@aise/shared-contracts";

/** Method label for the plain cylinder fit. */
export const CYLINDER_FIT_METHOD = "cylinder-fit/normals-nullspace-circle";
/** Method label for the robust cylinder fit. */
export const CYLINDER_ROBUST_FIT_METHOD = "cylinder-fit/robust-lmeds";

/** Minimum points for a cylinder fit (5 parameters → ≥ 6 points). */
export const MIN_CYLINDER_POINTS = 6;

/** Default k for k-NN local normal estimation. */
export const DEFAULT_K_NEAREST = 10;

/**
 * Default axis-determinacy threshold: the smallest normal-scatter
 * eigenvalue must be below this ratio of the second-smallest
 * (else the axis is ambiguous — sphere/isotropic normals give
 * ratio ≈ 1, cones at the axis-flip angle ≈ 0.67; real cylinders
 * with noisy k-NN normals stay well below 0.1).
 */
export const DEFAULT_AXIS_RATIO_THRESHOLD = 0.05;

/**
 * Transient relaxation of the axis threshold during inlier
 * reclassification rounds (still capped below the isotropic ratio
 * ≈ 1 so sphere-like data fails closed at every round). The FINAL
 * axis refit always applies the caller's strict threshold.
 */
export const IN_LOOP_AXIS_RATIO_RELAXATION = 4;

/** Hard cap for relaxed in-loop thresholds (isotropic ⇒ fail closed). */
export const IN_LOOP_AXIS_RATIO_CAP = 0.8;

/** Default validity bound: RMS radial residual ≤ this ratio · R. */
export const DEFAULT_MAX_RMS_RESIDUAL_RATIO = 0.02;

/** Default minimum cross-product norm for robust candidate axes. */
export const DEFAULT_MIN_CROSS_NORM = 0.1;

/** Default cap on robust candidate axis pairs (above → seeded sampling). */
export const DEFAULT_MAX_AXIS_CANDIDATES = 200;

/** Default LMedS inlier scale multiplier (robust fit). */
export const DEFAULT_CYLINDER_INLIER_SCALE = 2.5;

/** Default upper bound on input point count (bounded compute). */
export const DEFAULT_MAX_CYLINDER_POINTS = 10000;

/** Maximum rounds of iterative inlier reclassification in the robust fit. */
export const MAX_INLIER_REFINEMENT_ROUNDS = 8;

/** A fitted cylinder: axis line + radius. */
export interface FittedCylinder {
  /** A point on the axis line. */
  readonly axisPoint: Vec3;
  /** Unit axis direction (sign-fixed canonical representative). */
  readonly axis: Vec3;
  /** Radius (> 0). */
  readonly radius: number;
}

/** First-order propagated uncertainty of a cylinder fit (requires input σ). */
export interface CylinderFitUncertainty {
  /** 1σ of the radius: σ/√n (circle averaging). */
  readonly radiusStandard: number;
  /** 1σ of the axis point offset in the plane ⊥ axis: σ/√n. */
  readonly centerStandard: number;
  /**
   * 1σ (radians) of the axis direction, first-order blended lever
   * model: σ / (√n · √(σ_z² + R²/4)) with σ_z the RMS deviation of
   * the points' axis coordinates (height lever) and R/2 the
   * rotational lever of the circumference coverage. Approximate by
   * construction — documented, carried, never silently dropped.
   */
  readonly axisAngleStandard: number;
}

/** Input for a cylinder fit. */
export interface FitCylinderInput {
  readonly points: readonly GeomPoint[];
  /** Unit of the point coordinates (explicit). */
  readonly unit: LengthUnit;
  /** Epistemic state of the point SOURCE (declaration; default INFERRED). */
  readonly sourceEpistemic?: EpistemicState;
  /** Isotropic per-axis 1σ of point positions, in `unit` (optional). */
  readonly perPointStandardUncertainty?: number;
}

/** Common options for both cylinder fit methods. */
export interface FitCylinderOptions {
  /** k for k-NN local normal estimation (default 10). */
  readonly kNearest?: number;
  /** Axis-determinacy ratio threshold (default 0.05). */
  readonly axisRatioThreshold?: number;
  /** Validity: RMS radial residual ratio bound (default 0.02). */
  readonly maxRmsResidualRatio?: number;
  /** Upper bound on point count (default 10000). */
  readonly maxPoints?: number;
}

/** Result shape for both cylinder fit methods. */
export interface CylinderFitResult {
  readonly kind: "cylinder-fit";
  readonly cylinder: FittedCylinder;
  /** Radius as a measurement (unit + uncertainty where input σ stated). */
  readonly radiusMeasurement: {
    readonly value: number;
    readonly unit: LengthUnit;
    readonly uncertainty?: { readonly kind: "standard"; readonly u: number };
  };
  /** Residual statistics over ALL input points (radial distance − radius). */
  readonly residualStats: ResidualStats;
  /** Robust-mode report. */
  readonly robust?: {
    readonly inlierCount: number;
    readonly outlierCount: number;
    readonly inlierResidualStats: ResidualStats;
    readonly scale: number;
  };
  /** Propagated first-order uncertainty (present iff input σ stated). */
  readonly uncertainty?: CylinderFitUncertainty;
  /** Always INFERRED — fitting is inference over evidence. */
  readonly epistemic: EpistemicState;
  /** Complete lineage. */
  readonly provenance: MeasurementProvenance;
  /** Unit of all coordinates and measurements in this result. */
  readonly unit: LengthUnit;
}

/** Plain cylinder fit (least-squares over all points). */
export function fitCylinder(input: FitCylinderInput, options: FitCylinderOptions = {}): CylinderFitResult {
  const points = preparePoints(input, options);
  const normals = estimateLocalNormals(points, effectiveK(points.length, options.kNearest));
  const axis = axisFromNormalScatter(normals.vectors, options.axisRatioThreshold ?? DEFAULT_AXIS_RATIO_THRESHOLD);
  const frame = framePerpendicularTo(axis);
  const circle = fitCircle2(projectPoints(points, frame));
  const residuals = radialResiduals(points, axis, frame, circle);
  return finalizeCylinder({
    points,
    inliers: points,
    normalsUsable: normals.vectors.length,
    axis,
    frame,
    circle,
    residuals,
    input,
    options,
    method: CYLINDER_FIT_METHOD,
    robust: undefined,
  });
}

/** Robust cylinder fit (LMedS axis selection + inlier refit). */
export function fitCylinderRobust(
  input: FitCylinderInput,
  options: FitCylinderOptions & {
    /** Cap on candidate axis pairs (default 200). */
    readonly maxAxisCandidates?: number;
    /** Inlier bound multiplier (default 2.5). */
    readonly inlierScaleMultiplier?: number;
    /** Minimum |nᵢ × nⱼ| for a candidate axis (default 0.1). */
    readonly minCrossNorm?: number;
  } = {},
): CylinderFitResult {
  const points = preparePoints(input, options);
  const k = effectiveK(points.length, options.kNearest);
  const normals = estimateLocalNormals(points, k);
  const minCrossNorm = options.minCrossNorm ?? DEFAULT_MIN_CROSS_NORM;
  const maxCandidates = options.maxAxisCandidates ?? DEFAULT_MAX_AXIS_CANDIDATES;
  const scaleMultiplier = options.inlierScaleMultiplier ?? DEFAULT_CYLINDER_INLIER_SCALE;

  // Candidate axes: nᵢ × n̂ⱼ over usable-normal pairs, capped by
  // seeded sampling of the canonical pair list.
  const pairs = candidateNormalPairs(normals.vectors, minCrossNorm, maxCandidates);
  let bestAxis: Vec3 | null = null;
  let bestCircle: Circle2 | null = null;
  let bestResiduals: number[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [i, j] of pairs) {
    const ni = normals.vectors[i] as Vec3;
    const nj = normals.vectors[j] as Vec3;
    const cross = {
      x: ni.y * nj.z - ni.z * nj.y,
      y: ni.z * nj.x - ni.x * nj.z,
      z: ni.x * nj.y - ni.y * nj.x,
    };
    const norm = Math.sqrt(cross.x * cross.x + cross.y * cross.y + cross.z * cross.z);
    if (norm < minCrossNorm) {
      continue;
    }
    const axis = vec3FixSign({ x: cross.x / norm, y: cross.y / norm, z: cross.z / norm });
    const frame = framePerpendicularTo(axis);
    let circle: Circle2;
    try {
      circle = fitCircle2(projectPoints(points, frame));
    } catch (error) {
      if (error instanceof GeometryError) {
        continue; // this candidate axis collapses the cross-section — wrong axis
      }
      throw error;
    }
    const residuals = radialResiduals(points, axis, frame, circle);
    const score = medianOfAbs(residuals);
    if (score < bestScore) {
      bestScore = score;
      bestAxis = axis;
      bestCircle = circle;
      bestResiduals = residuals;
    }
  }
  if (bestAxis === null || bestCircle === null || bestResiduals === null) {
    throw new GeometryError(
      "DEGENERATE_GEOMETRY",
      "robust cylinder fit: no usable candidate axis (normals are parallel — the shape is not a cylinder, or sampling was too coarse)",
      { details: { usableNormals: normals.vectors.length, candidatePairs: pairs.length } },
    );
  }

  // Iterative inlier refinement (bounded, deterministic): the
  // phase-A axis/circle (fit over ALL points, outliers included)
  // is biased or even wrong, so each round reclassifies inliers
  // under the current (axis, circle) and REFITS BOTH from the new
  // inlier set — the axis from the inlier normal scatter, the
  // circle from the inlier cross-section — until the inlier set is
  // stable. A scale-relative absolute floor keeps exact data
  // (σ̂ ≈ 0) from degenerating the bound to zero.
  const axisRatioThreshold = options.axisRatioThreshold ?? DEFAULT_AXIS_RATIO_THRESHOLD;
  const inLoopAxisThreshold = Math.min(
    axisRatioThreshold * IN_LOOP_AXIS_RATIO_RELAXATION,
    IN_LOOP_AXIS_RATIO_CAP,
  );
  const floor = inlierFloor(points, bestCircle.radius);
  let inlierPoints: GeomPoint[] = points;
  let previousFlags: boolean[] = points.map(() => true);
  let scale = lmedsScale(bestResiduals.map(Math.abs), 5);
  let circle = bestCircle;
  let axis = bestAxis;
  let frame = framePerpendicularTo(axis);
  for (let round = 0; round < MAX_INLIER_REFINEMENT_ROUNDS; round += 1) {
    const residuals = radialResiduals(points, axis, frame, circle);
    scale = Math.max(lmedsScale(residuals.map(Math.abs), 5), floor);
    const flags = classifyInliers(residuals, scale, scaleMultiplier);
    const newInliers = points.filter((_, index) => flags[index] === true);
    if (newInliers.length < MIN_CYLINDER_POINTS) {
      throw new GeometryError(
        "DEGENERATE_GEOMETRY",
        `robust cylinder fit isolated only ${newInliers.length} inliers (need ${MIN_CYLINDER_POINTS}) — no dominant cylinder in the data`,
        { details: { inlierCount: newInliers.length, outlierCount: points.length - newInliers.length } },
      );
    }
    const converged =
      flags.length === previousFlags.length && flags.every((flag, index) => flag === previousFlags[index]);
    previousFlags = flags;
    inlierPoints = newInliers;
    if (converged) {
      break;
    }
    // Refit axis AND circle from the new inlier set. The relaxed
    // in-loop threshold tolerates transient normal pollution (the
    // partition is still cleaning); the final refit below applies
    // the strict gate.
    const roundNormals = estimateLocalNormals(inlierPoints, effectiveK(inlierPoints.length, options.kNearest));
    axis = axisFromNormalScatter(roundNormals.vectors, inLoopAxisThreshold);
    frame = framePerpendicularTo(axis);
    circle = fitCircle2(projectPoints(inlierPoints, frame));
  }

  // Final refinement: axis from the FINAL inlier normal scatter
  // (STRICT threshold), circle on the final inliers — the gate.
  const inlierNormals = estimateLocalNormals(inlierPoints, effectiveK(inlierPoints.length, options.kNearest));
  axis = axisFromNormalScatter(inlierNormals.vectors, axisRatioThreshold);
  frame = framePerpendicularTo(axis);
  circle = fitCircle2(projectPoints(inlierPoints, frame));
  const residuals = radialResiduals(points, axis, frame, circle);
  const inlierResiduals = radialResiduals(inlierPoints, axis, frame, circle);

  return finalizeCylinder({
    points,
    inliers: inlierPoints,
    normalsUsable: inlierNormals.vectors.length,
    axis,
    frame,
    circle,
    residuals,
    input,
    options,
    method: CYLINDER_ROBUST_FIT_METHOD,
    robust: {
      inlierCount: inlierPoints.length,
      outlierCount: points.length - inlierPoints.length,
      inlierResidualStats: computeResidualStats(inlierResiduals),
      scale,
    },
  });
}

// --- internals ---

function preparePoints(input: FitCylinderInput, options: FitCylinderOptions): GeomPoint[] {
  const maxPoints = options.maxPoints ?? DEFAULT_MAX_CYLINDER_POINTS;
  if (!Array.isArray(input.points)) {
    throw new GeometryError("VALIDATION_FAILED", "fitCylinder input points must be an array", {
      details: {},
    });
  }
  if (input.points.length > maxPoints) {
    throw new GeometryError(
      "VALIDATION_FAILED",
      `cylinder fit input has ${input.points.length} points, above the bounded-compute cap of ${maxPoints} — downsample deterministically before fitting`,
      { details: { actual: input.points.length, max: maxPoints } },
    );
  }
  return canonicalizePointSet(input.points, {
    minCount: MIN_CYLINDER_POINTS,
    label: "fitCylinder.points",
  });
}

function effectiveK(pointCount: number, kRequested?: number): number {
  const k = kRequested ?? DEFAULT_K_NEAREST;
  assertPositiveInteger(k, "kNearest");
  const effective = Math.min(k, pointCount - 1);
  if (effective < 3) {
    throw new GeometryError(
      "VALIDATION_FAILED",
      `kNearest must allow at least 3 neighbors: k=${k} with ${pointCount} points`,
      { details: { k, pointCount } },
    );
  }
  return effective;
}

interface LocalNormals {
  /** Unit local normals, one per point that has one (sign arbitrary). */
  readonly vectors: readonly Vec3[];
  /** Canonical indices of the points the vectors belong to. */
  readonly indices: readonly number[];
}

/**
 * k-NN local normal estimation over canonically ordered points.
 * Neighbors are chosen by (squared distance, canonical index) — a
 * total order, so ties are deterministic. A point whose
 * neighborhood is collinear (λ₂/λ₃ ≤ collinearity ratio) or
 * coincident yields no normal.
 */
function estimateLocalNormals(points: readonly GeomPoint[], k: number): LocalNormals {
  const n = points.length;
  const vectors: Vec3[] = [];
  const indices: number[] = [];
  const distSq = new Array<number>(n);
  const order = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    const point = points[i] as GeomPoint;
    // Squared distances to all other points (canonical indices are
    // the deterministic tiebreak in the sort below).
    for (let j = 0; j < n; j += 1) {
      order[j] = j;
      if (j === i) {
        distSq[j] = Number.POSITIVE_INFINITY;
        continue;
      }
      const other = points[j] as GeomPoint;
      const dx = point.x - other.x;
      const dy = point.y - other.y;
      const dz = point.z - other.z;
      distSq[j] = dx * dx + dy * dy + dz * dz;
    }
    order.sort((a, b) => {
      const da = distSq[a] as number;
      const db = distSq[b] as number;
      return da !== db ? da - db : a - b;
    });
    // k nearest (excluding self, which is at +∞).
    const neighbors: GeomPoint[] = [];
    for (let t = 0; t < k; t += 1) {
      neighbors.push(points[order[t] as number] as GeomPoint);
    }
    if (neighbors.length < 3) {
      continue;
    }
    // Local covariance → smallest eigenvector.
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const nb of neighbors) {
      cx += nb.x;
      cy += nb.y;
      cz += nb.z;
    }
    const m = neighbors.length;
    const mx = cx / m;
    const my = cy / m;
    const mz = cz / m;
    let cxx = 0;
    let cxy = 0;
    let cxz = 0;
    let cyy = 0;
    let cyz = 0;
    let czz = 0;
    for (const nb of neighbors) {
      const dx = nb.x - mx;
      const dy = nb.y - my;
      const dz = nb.z - mz;
      cxx += dx * dx;
      cxy += dx * dy;
      cxz += dx * dz;
      cyy += dy * dy;
      cyz += dy * dz;
      czz += dz * dz;
    }
    const covariance: Matrix3 = [
      [cxx / m, cxy / m, cxz / m],
      [cxy / m, cyy / m, cyz / m],
      [cxz / m, cyz / m, czz / m],
    ];
    let eigen;
    try {
      eigen = eigensystemSymmetric3(covariance);
    } catch {
      continue; // pathological neighborhood — no normal from this point
    }
    const [l1, l2, l3] = eigen.eigenvalues;
    if (!(l3 > 0) || Math.abs(l3) < 1e-300 || l2 <= l3 * 1e-10) {
      continue; // coincident or collinear neighborhood — no surface information
    }
    void l1;
    vectors.push(eigen.eigenvectors[0] as Vec3);
    indices.push(i);
  }
  return { vectors, indices };
}

/**
 * Axis from the normal scatter null space: the smallest
 * eigenvector of Σ n̂ n̂ᵀ. Fails closed when the axis is ambiguous
 * (λ₁ not clearly below λ₂ — sphere/plane-like normal sets).
 */
function axisFromNormalScatter(normals: readonly Vec3[], ratioThreshold: number): Vec3 {
  if (normals.length < MIN_CYLINDER_POINTS) {
    throw new GeometryError(
      "DEGENERATE_GEOMETRY",
      `only ${normals.length} points yielded usable local normals (need ${MIN_CYLINDER_POINTS}) — neighborhoods carry no surface information`,
      { details: { usableNormals: normals.length } },
    );
  }
  let s11 = 0;
  let s12 = 0;
  let s13 = 0;
  let s22 = 0;
  let s23 = 0;
  let s33 = 0;
  for (const n of normals) {
    s11 += n.x * n.x;
    s12 += n.x * n.y;
    s13 += n.x * n.z;
    s22 += n.y * n.y;
    s23 += n.y * n.z;
    s33 += n.z * n.z;
  }
  const count = normals.length;
  const scatter: Matrix3 = [
    [s11 / count, s12 / count, s13 / count],
    [s12 / count, s22 / count, s23 / count],
    [s13 / count, s23 / count, s33 / count],
  ];
  const { eigenvalues, eigenvectors } = eigensystemSymmetric3(scatter);
  const [lambda1, lambda2] = eigenvalues;
  if (!(lambda2 > 0) || Math.abs(lambda2) < 1e-300 || lambda1 > lambda2 * ratioThreshold) {
    throw new GeometryError(
      "DEGENERATE_GEOMETRY",
      `cylinder axis is ambiguous: normal-scatter eigenvalue ratio λ₁/λ₂ = ${String(lambda1 / lambda2)} exceeds ${ratioThreshold} — the normals do not share exactly one perpendicular direction (sphere/plane-like data)`,
      { details: { ratio: String(lambda1 / lambda2), threshold: ratioThreshold } },
    );
  }
  return vec3FixSign(eigenvectors[0] as Vec3);
}

/** Deterministic orthonormal frame (u, v) with u ⊥ v ⊥ axis. */
export interface PerpendicularFrame {
  readonly u: Vec3;
  readonly v: Vec3;
}

function framePerpendicularTo(axis: Vec3): PerpendicularFrame {
  // e = coordinate axis least aligned with the axis (ties: x < y < z).
  const ax = Math.abs(axis.x);
  const ay = Math.abs(axis.y);
  const az = Math.abs(axis.z);
  let e: Vec3;
  if (ax <= ay && ax <= az) {
    e = { x: 1, y: 0, z: 0 };
  } else if (ay <= az) {
    e = { x: 0, y: 1, z: 0 };
  } else {
    e = { x: 0, y: 0, z: 1 };
  }
  const crossEA = {
    x: e.y * axis.z - e.z * axis.y,
    y: e.z * axis.x - e.x * axis.z,
    z: e.x * axis.y - e.y * axis.x,
  };
  const norm = Math.sqrt(crossEA.x * crossEA.x + crossEA.y * crossEA.y + crossEA.z * crossEA.z);
  if (norm < 1e-300) {
    throw new GeometryError("INTERNAL_ERROR", "perpendicular frame construction failed (axis aligned with every candidate)", {
      details: {},
    });
  }
  const u = { x: crossEA.x / norm, y: crossEA.y / norm, z: crossEA.z / norm };
  const v = {
    x: axis.y * u.z - axis.z * u.y,
    y: axis.z * u.x - axis.x * u.z,
    z: axis.x * u.y - axis.y * u.x,
  };
  return { u, v };
}

function projectPoints(points: readonly GeomPoint[], frame: PerpendicularFrame): { x: number; y: number }[] {
  return points.map((point) => ({
    x: point.x * frame.u.x + point.y * frame.u.y + point.z * frame.u.z,
    y: point.x * frame.v.x + point.y * frame.v.y + point.z * frame.v.z,
  }));
}

/** Radial residuals: distance to the axis minus the circle radius. */
function radialResiduals(
  points: readonly GeomPoint[],
  axis: Vec3,
  frame: PerpendicularFrame,
  circle: Circle2,
): number[] {
  // Axis point: circle center expressed in the 3D frame (plane ⊥ axis through origin).
  const axisPoint = {
    x: circle.centerX * frame.u.x + circle.centerY * frame.v.x,
    y: circle.centerX * frame.u.y + circle.centerY * frame.v.y,
    z: circle.centerX * frame.u.z + circle.centerY * frame.v.z,
  };
  return points.map((point) => {
    const dx = point.x - axisPoint.x;
    const dy = point.y - axisPoint.y;
    const dz = point.z - axisPoint.z;
    const alongAxis = dx * axis.x + dy * axis.y + dz * axis.z;
    const qx = dx - alongAxis * axis.x;
    const qy = dy - alongAxis * axis.y;
    const qz = dz - alongAxis * axis.z;
    return Math.sqrt(qx * qx + qy * qy + qz * qz) - circle.radius;
  });
}

function candidateNormalPairs(
  normals: readonly Vec3[],
  minCrossNorm: number,
  maxCandidates: number,
): readonly (readonly [number, number])[] {
  const usable = normals.length;
  const pairs: [number, number][] = [];
  const total = (usable * (usable - 1)) / 2;
  if (total <= maxCandidates) {
    for (let i = 0; i < usable; i += 1) {
      for (let j = i + 1; j < usable; j += 1) {
        pairs.push([i, j]);
      }
    }
    return pairs;
  }
  const rng = new DeterministicRng(ROBUST_SAMPLING_SEED);
  const chosen = new Set<number>();
  while (chosen.size < maxCandidates) {
    chosen.add(rng.nextUint32() % total);
  }
  const sortedIndices = [...chosen].sort((a, b) => a - b);
  for (const index of sortedIndices) {
    pairs.push(pairAt(index, usable));
  }
  return pairs;
}

/** Maps a canonical pair index to (i, j). */
function pairAt(index: number, n: number): [number, number] {
  let remaining = index;
  for (let i = 0; i < n - 1; i += 1) {
    const iCount = n - 1 - i;
    if (remaining < iCount) {
      return [i, i + 1 + remaining];
    }
    remaining -= iCount;
  }
  throw new GeometryError("INTERNAL_ERROR", `pair index ${index} out of range for n=${n}`, {
    details: {},
  });
}

/**
 * Scale-relative inlier floor: keeps the LMedS bound nonzero for
 * exact data (σ̂ ≈ 0 when ≥ 50% of residuals are exactly zero), so
 * exact points at rounding-level residuals still classify as
 * inliers. 1e-9·(1 + R) relative to the fitted radius scale.
 */
function inlierFloor(points: readonly GeomPoint[], radius: number): number {
  let maxNorm = 0;
  for (const point of points) {
    const norm = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z);
    if (norm > maxNorm) {
      maxNorm = norm;
    }
  }
  const scale = Math.max(maxNorm, Math.abs(radius), 1);
  return 1e-9 * scale;
}

function medianOfAbs(values: readonly number[]): number {
  const sorted = values.map(Math.abs).sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 === 1
    ? (sorted[(n - 1) / 2] as number)
    : ((sorted[n / 2 - 1] as number) + (sorted[n / 2] as number)) / 2;
}

function finalizeCylinder(args: {
  points: readonly GeomPoint[];
  inliers: readonly GeomPoint[];
  normalsUsable: number;
  axis: Vec3;
  frame: PerpendicularFrame;
  circle: Circle2;
  residuals: readonly number[];
  input: FitCylinderInput;
  options: FitCylinderOptions & { maxAxisCandidates?: number; inlierScaleMultiplier?: number; minCrossNorm?: number };
  method: string;
  robust?: {
    inlierCount: number;
    outlierCount: number;
    inlierResidualStats: ResidualStats;
    scale: number;
  };
}): CylinderFitResult {
  const { points, inliers, axis, frame, circle, residuals, input, options, method, robust } = args;
  const sourceEpistemic = assertSourceEpistemicState(input.sourceEpistemic ?? "INFERRED");
  const sigma = validateSigma(input.perPointStandardUncertainty);
  const maxRatio = options.maxRmsResidualRatio ?? DEFAULT_MAX_RMS_RESIDUAL_RATIO;

  const residualStats = computeResidualStats([...residuals]);
  // Validity is evaluated on the FITTED population: all points for
  // the plain fit, the inliers for the robust fit (outliers are
  // reported, not re-fitted — penalizing the bound with reported
  // outliers would reject every successful robust isolation).
  const validityRms = robust ? robust.inlierResidualStats.rms : residualStats.rms;
  if (!(validityRms <= Math.max(maxRatio * circle.radius, 1e-9))) {
    throw new GeometryError(
      "INVALID_FIT",
      `cylinder fit rejected: ${robust ? "inlier" : "RMS"} radial residual ${validityRms} exceeds the validity bound ${Math.max(maxRatio * circle.radius, 1e-9)} (ratio bound ${maxRatio} of radius ${circle.radius}) — the points do not lie on a common cylinder`,
      {
        details: {
          rms: String(validityRms),
          radius: String(circle.radius),
          ratioBound: maxRatio,
          maxAbs: String(robust ? robust.inlierResidualStats.maxAbs : residualStats.maxAbs),
        },
      },
    );
  }

  const axisPoint = {
    x: circle.centerX * frame.u.x + circle.centerY * frame.v.x,
    y: circle.centerX * frame.u.y + circle.centerY * frame.v.y,
    z: circle.centerX * frame.u.z + circle.centerY * frame.v.z,
  };

  const heightRms = axisHeightRms(points, axisPoint, axis);
  const uncertainty = sigma === undefined ? undefined : cylinderUncertainty(sigma, inliers.length, circle.radius, heightRms);

  const provenance = measurementProvenance(
    method,
    {
      unit: input.unit,
      pointCount: points.length,
      inlierCount: robust?.inlierCount ?? points.length,
      kNearest: options.kNearest ?? DEFAULT_K_NEAREST,
      axisRatioThreshold: options.axisRatioThreshold ?? DEFAULT_AXIS_RATIO_THRESHOLD,
      maxRmsResidualRatio: maxRatio,
      minCrossNorm: options.minCrossNorm ?? DEFAULT_MIN_CROSS_NORM,
      maxAxisCandidates: options.maxAxisCandidates ?? DEFAULT_MAX_AXIS_CANDIDATES,
      inlierScaleMultiplier: options.inlierScaleMultiplier ?? DEFAULT_CYLINDER_INLIER_SCALE,
      samplingSeed: ROBUST_SAMPLING_SEED,
      usableNormals: args.normalsUsable,
      perPointStandardUncertainty: sigma,
      sourceEpistemic,
    },
    [
      {
        kind: "point-set",
        pointCount: points.length,
        contentHash: canonicalContentHash(points.map((point) => [point.x, point.y, point.z])),
        epistemic: sourceEpistemic,
      },
    ],
  );
  assertFitEpistemicState(FIT_EPISTEMIC_STATE);

  return {
    kind: "cylinder-fit",
    cylinder: { axisPoint, axis, radius: circle.radius },
    radiusMeasurement: sigma === undefined
      ? { value: circle.radius, unit: input.unit }
      : { value: circle.radius, unit: input.unit, uncertainty: { kind: "standard", u: sigma / Math.sqrt(inliers.length) } },
    residualStats,
    robust,
    uncertainty,
    epistemic: FIT_EPISTEMIC_STATE,
    provenance,
    unit: input.unit,
  };
}

function axisHeightRms(points: readonly GeomPoint[], axisPoint: Vec3, axis: Vec3): number {
  let sum = 0;
  let sumSq = 0;
  for (const point of points) {
    const dx = point.x - axisPoint.x;
    const dy = point.y - axisPoint.y;
    const dz = point.z - axisPoint.z;
    const along = dx * axis.x + dy * axis.y + dz * axis.z;
    sum += along;
    sumSq += along * along;
  }
  const n = points.length;
  const mean = sum / n;
  return Math.sqrt(Math.max(sumSq / n - mean * mean, 0));
}

function cylinderUncertainty(sigma: number, inlierCount: number, radius: number, heightRms: number): CylinderFitUncertainty {
  const lever = Math.sqrt(heightRms * heightRms + (radius * radius) / 4);
  return {
    radiusStandard: sigma / Math.sqrt(inlierCount),
    centerStandard: sigma / Math.sqrt(inlierCount),
    axisAngleStandard: sigma / (Math.sqrt(inlierCount) * lever),
  };
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
