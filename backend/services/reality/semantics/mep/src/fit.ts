/**
 * Deterministic cylinder fit (AISE-026).
 *
 * Fits one pipe to one point cluster:
 *
 * - **axis** — the principal eigenvector of the cluster's
 *   covariance matrix, computed by power iteration from a FIXED
 *   start vector with a FIXED iteration count (deterministic; no
 *   environment, no convergence-on-clock). The axis sign is
 *   canonicalized (first nonzero component positive), and the
 *   centerline is emitted as an ORDERED pair (lexicographically
 *   smaller endpoint first) so the representation is direction-
 *   free.
 * - **centerline** — the projections of the extreme cluster
 *   points onto the fitted axis: `A = centroid + u·tMin`,
 *   `B = centroid + u·tMax` (the fitted axis through the
 *   centroid; honest to the estimator, never snapped to world
 *   axes).
 * - **diameter** — `2·mean(perpendicular distance to the axis)`.
 *   For a shell-sampled cylinder the mean radial distance = R
 *   exactly; for noisy shells this is the honest mean estimator
 *   (documented: volume-sampled clouds would underestimate — the
 *   fixture samples the shell).
 * - **residuals** — the SCATTER of the radial distances around
 *   their mean (RMS and max deviation): the true fit-quality
 *   facts (0 for an exact shell; ~σ for noisy shells), carried
 *   verbatim.
 *
 * The slenderness/cylindricity gates live in `network.ts` (the
 * classification honesty rules); this module is pure geometry.
 */
import type { GeomPoint } from "@aise/backend-geometry";

/** A fitted pipe's geometry (all values in the input unit). */
export interface CylinderFit {
  /** Canonical unit axis (first nonzero component positive). */
  readonly axis: { readonly x: number; readonly y: number; readonly z: number };
  readonly centroid: { readonly x: number; readonly y: number; readonly z: number };
  /** Ordered endpoints (lexicographically smaller first). */
  readonly start: { readonly x: number; readonly y: number; readonly z: number };
  readonly end: { readonly x: number; readonly y: number; readonly z: number };
  /** 2·mean radial distance (the diameter estimate). */
  readonly diameter: number;
  /** Centerline length (|end − start|). */
  readonly length: number;
  /** Fit-quality residuals, verbatim. */
  readonly residuals: { readonly rms: number; readonly max: number };
  readonly pointCount: number;
}

/** Power-iteration settings (fixed — determinism by construction). */
const POWER_ITERATIONS = 64;
const POWER_START = { x: 1, y: 1, z: 1 } as const;

/** Fits one cylinder to one cluster (pure arithmetic, fail-closed on degeneracy). */
export function fitCylinder(points: readonly GeomPoint[]): CylinderFit {
  if (points.length < 2) {
    throw new Error(`a cylinder fit needs at least 2 points: ${points.length}`);
  }
  const n = points.length;
  const centroid = meanOf(points);
  const covariance = covarianceOf(points, centroid);
  const axis = principalAxis(covariance);

  let tMin = Number.POSITIVE_INFINITY;
  let tMax = Number.NEGATIVE_INFINITY;
  let radialSum = 0;
  const radials: number[] = [];
  for (const point of points) {
    const dx = point.x - centroid.x;
    const dy = point.y - centroid.y;
    const dz = point.z - centroid.z;
    const t = dx * axis.x + dy * axis.y + dz * axis.z;
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
    const rx = dx - axis.x * t;
    const ry = dy - axis.y * t;
    const rz = dz - axis.z * t;
    const radial = Math.sqrt(rx * rx + ry * ry + rz * rz);
    radialSum += radial;
    radials.push(radial);
  }
  const meanRadius = radialSum / n;
  let scatterSquareSum = 0;
  let scatterMax = 0;
  for (const radial of radials) {
    const deviation = radial - meanRadius;
    scatterSquareSum += deviation * deviation;
    scatterMax = Math.max(scatterMax, Math.abs(deviation));
  }
  const rms = Math.sqrt(scatterSquareSum / n);
  const radialMax = scatterMax;
  const start = {
    x: centroid.x + axis.x * tMin,
    y: centroid.y + axis.y * tMin,
    z: centroid.z + axis.z * tMin,
  };
  const end = {
    x: centroid.x + axis.x * tMax,
    y: centroid.y + axis.y * tMax,
    z: centroid.z + axis.z * tMax,
  };
  const [first, second] = orderEndpoints(start, end);
  return {
    axis,
    centroid,
    start: first,
    end: second,
    diameter: 2 * meanRadius,
    length: distance(start, end),
    residuals: { rms, max: radialMax },
    pointCount: n,
  };
}

/** The distance from a point to a segment [A, B] (junction detection). */
export function distanceToSegment(
  point: { readonly x: number; readonly y: number; readonly z: number },
  a: { readonly x: number; readonly y: number; readonly z: number },
  b: { readonly x: number; readonly y: number; readonly z: number },
): { readonly distance: number; readonly closest: { readonly x: number; readonly y: number; readonly z: number } } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const apz = point.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  if (ab2 === 0) {
    return { distance: distance(point, a), closest: a };
  }
  const t = clamp((apx * abx + apy * aby + apz * abz) / ab2, 0, 1);
  const closest = { x: a.x + abx * t, y: a.y + aby * t, z: a.z + abz * t };
  return { distance: distance(point, closest), closest };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function meanOf(points: readonly GeomPoint[]): { x: number; y: number; z: number } {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
    z += point.z;
  }
  return { x: x / points.length, y: y / points.length, z: z / points.length };
}

function covarianceOf(
  points: readonly GeomPoint[],
  centroid: { readonly x: number; readonly y: number; readonly z: number },
): number[][] {
  const c = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const point of points) {
    const d = [point.x - centroid.x, point.y - centroid.y, point.z - centroid.z];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        c[i]![j]! += d[i]! * d[j]!;
      }
    }
  }
  return c;
}

/** Power iteration toward the dominant eigenvector, canonicalized sign. */
function principalAxis(covariance: number[][]): { x: number; y: number; z: number } {
  let v = normalize(POWER_START);
  for (let iteration = 0; iteration < POWER_ITERATIONS; iteration += 1) {
    const next: number[] = [
      covariance[0]![0]! * v.x + covariance[0]![1]! * v.y + covariance[0]![2]! * v.z,
      covariance[1]![0]! * v.x + covariance[1]![1]! * v.y + covariance[1]![2]! * v.z,
      covariance[2]![0]! * v.x + covariance[2]![1]! * v.y + covariance[2]![2]! * v.z,
    ];
    const norm = Math.hypot(next[0]!, next[1]!, next[2]!);
    if (!Number.isFinite(norm) || norm === 0) {
      break; // isotropic cluster — keep the current vector
    }
    v = { x: next[0]! / norm, y: next[1]! / norm, z: next[2]! / norm };
  }
  // Canonical sign: the first component with |c| > 1e-12 is positive.
  const components = [v.x, v.y, v.z];
  for (let index = 0; index < 3; index += 1) {
    if (Math.abs(components[index]!) > 1e-12) {
      if (components[index]! < 0) {
        v = { x: -v.x, y: -v.y, z: -v.z };
      }
      break;
    }
  }
  return v;
}

function normalize(v: { readonly x: number; readonly y: number; readonly z: number }): { x: number; y: number; z: number } {
  const norm = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(norm) || norm === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: v.x / norm, y: v.y / norm, z: v.z / norm };
}

function orderEndpoints(
  a: { readonly x: number; readonly y: number; readonly z: number },
  b: { readonly x: number; readonly y: number; readonly z: number },
): [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] {
  if (a.x !== b.x) {
    return a.x < b.x ? [a, b] : [b, a];
  }
  if (a.y !== b.y) {
    return a.y < b.y ? [a, b] : [b, a];
  }
  return a.z <= b.z ? [a, b] : [b, a];
}

function distance(
  a: { readonly x: number; readonly y: number; readonly z: number },
  b: { readonly x: number; readonly y: number; readonly z: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}
