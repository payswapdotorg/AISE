/**
 * Golden geometric fixtures (AISE-009).
 *
 * Exact synthetic shapes with GROUND-TRUTH values and ACCEPTANCE
 * TOLERANCES, per the CRITICAL assurance profile ("golden/physical
 * benchmark + mutation/discrimination"). Fixtures are generated
 * deterministically (fixed grids and seeded noise — no ambient
 * state), so the same fixture is bit-identical everywhere.
 *
 * Fixture set (from the work order):
 * - plane (exact grid on a known plane; noisy variant);
 * - cylinder (exact wall samples; noisy variant; outlier variant);
 * - parallel lines / orthogonal lines (angle ground truth 0 / π/2);
 * - parallel planes / orthogonal planes;
 * - known-distance point pairs (3-4-5, √3, magnitude sweeps);
 * - point-to-plane and point-to-line distance fixtures with known
 *   values, including signed-plane cases.
 *
 * Noise and outliers use the package's deterministic RNG with
 * recorded seeds — reproducible and provenance-compatible.
 */
import { DeterministicRng, NOISE_FIXTURE_SEED } from "../seeded.js";
import type { GeomPoint } from "../validate.js";

/** Acceptance rule for a numeric ground-truth comparison. */
export interface Acceptance {
  /** Absolute tolerance: |measured − truth| ≤ tolerance. */
  readonly absoluteTolerance: number;
}

/** A golden fixture: deterministic input + ground truth + acceptance. */
export interface GoldenFixture<TInput, TTruth> {
  readonly id: string;
  readonly description: string;
  readonly input: TInput;
  readonly groundTruth: TTruth;
  readonly acceptance: Acceptance;
}

// ---------------------------------------------------------------------------
// Plane fixtures
// ---------------------------------------------------------------------------

/** Ground truth of a plane fixture: unit normal (sign-free) and signed offset from origin. */
export interface PlaneGroundTruth {
  /** A unit normal of the true plane (± both valid — compare with |dot|). */
  readonly normal: { readonly x: number; readonly y: number; readonly z: number };
  /** Signed offset from origin along `normal`. */
  readonly offset: number;
}

/**
 * Exact points on the plane `2x + 3y − z + 7 = 0` (normal
 * (2, 3, −1)/√14, offset −7/√14), on a deterministic grid.
 */
export function exactPlanePoints(): GeomPoint[] {
  const points: GeomPoint[] = [];
  for (let i = -4; i <= 4; i += 1) {
    for (let j = -4; j <= 4; j += 1) {
      const x = i;
      const y = j;
      const z = 2 * x + 3 * y + 7;
      points.push({ x, y, z });
    }
  }
  return points;
}

export function planeNormalGroundTruth(): { x: number; y: number; z: number } {
  const norm = Math.sqrt(2 * 2 + 3 * 3 + 1 * 1);
  return { x: 2 / norm, y: 3 / norm, z: -1 / norm };
}

/** Noisy variant: ±0.01 perpendicular jitter (seeded, reproducible). */
export function noisyPlanePoints(): GeomPoint[] {
  const rng = new DeterministicRng(NOISE_FIXTURE_SEED);
  const base = planeNormalGroundTruth();
  return exactPlanePoints().map((point) => {
    const jitter = rng.nextSignedUnit() * 0.01;
    return {
      x: point.x + jitter * base.x,
      y: point.y + jitter * base.y,
      z: point.z + jitter * base.z,
    };
  });
}

// ---------------------------------------------------------------------------
// Cylinder fixtures
// ---------------------------------------------------------------------------

/** Ground truth of a cylinder fixture. */
export interface CylinderGroundTruth {
  /** A point on the true axis. */
  readonly axisPoint: { readonly x: number; readonly y: number; readonly z: number };
  /** Unit axis direction. */
  readonly axis: { readonly x: number; readonly y: number; readonly z: number };
  readonly radius: number;
}

/**
 * Exact points on the cylinder wall: radius 5, axis = z through
 * (1, 2, 0), z ∈ [−5, 5]; 40 circumferential × 12 vertical samples
 * (deterministic even spacing, half-step offset to avoid exact
 * duplicate columns).
 */
export function exactCylinderPoints(): GeomPoint[] {
  const points: GeomPoint[] = [];
  const circumferenceCount = 40;
  const heightCount = 12;
  const radius = 5;
  for (let a = 0; a < circumferenceCount; a += 1) {
    const angle = (a * 2 * Math.PI) / circumferenceCount + Math.PI / circumferenceCount;
    for (let h = 0; h < heightCount; h += 1) {
      const z = -5 + (h * 10) / (heightCount - 1);
      points.push({
        x: 1 + radius * Math.cos(angle),
        y: 2 + radius * Math.sin(angle),
        z,
      });
    }
  }
  return points;
}

export function cylinderGroundTruth(): CylinderGroundTruth {
  return { axisPoint: { x: 1, y: 2, z: 0 }, axis: { x: 0, y: 0, z: 1 }, radius: 5 };
}

/** Noisy variant: ±0.01 radial jitter (seeded, reproducible). */
export function noisyCylinderPoints(): GeomPoint[] {
  const rng = new DeterministicRng(NOISE_FIXTURE_SEED ^ 0x5bf03635);
  return exactCylinderPoints().map((point) => {
    const radial = rng.nextSignedUnit() * 0.01;
    const dx = point.x - 1;
    const dy = point.y - 2;
    const norm = Math.sqrt(dx * dx + dy * dy);
    return {
      x: point.x + (radial * dx) / norm,
      y: point.y + (radial * dy) / norm,
      z: point.z + rng.nextSignedUnit() * 0.005,
    };
  });
}

/** Outlier variant: exact cylinder + 20% uniformly scattered outliers. */
export function cylinderWithOutliers(): GeomPoint[] {
  const rng = new DeterministicRng(NOISE_FIXTURE_SEED ^ 0x1f2e3d4c);
  const inliers = exactCylinderPoints();
  const outlierCount = Math.floor(inliers.length * 0.2);
  const outliers: GeomPoint[] = [];
  for (let i = 0; i < outlierCount; i += 1) {
    const angle = rng.nextUnit() * 2 * Math.PI;
    const radius = 7 + rng.nextUnit() * 6; // 7..13 — far off the R=5 wall
    const z = -5 + rng.nextUnit() * 10;
    outliers.push({ x: 1 + radius * Math.cos(angle), y: 2 + radius * Math.sin(angle), z });
  }
  return [...inliers, ...outliers];
}

// ---------------------------------------------------------------------------
// Known-distance point pairs
// ---------------------------------------------------------------------------

/** A known-distance pair fixture. */
export interface KnownDistancePair {
  readonly id: string;
  readonly a: GeomPoint;
  readonly b: GeomPoint;
  readonly distance: number;
  readonly absoluteTolerance: number;
}

/**
 * Known-distance point pairs: 3-4-5 triangles at several
 * magnitudes (including a large-offset case that punishes
 * cancellation), the unit diagonal √3, a small-magnitude case, and
 * a fractional case.
 */
export function knownDistancePairs(): KnownDistancePair[] {
  return [
    { id: "pythagorean-3-4-5", a: { x: 0, y: 0, z: 0 }, b: { x: 3, y: 4, z: 0 }, distance: 5, absoluteTolerance: 1e-12 },
    { id: "pythagorean-3-4-5-z", a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 3, z: 4 }, distance: 5, absoluteTolerance: 1e-12 },
    { id: "unit-diagonal", a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 1, z: 1 }, distance: Math.sqrt(3), absoluteTolerance: 1e-12 },
    { id: "small-magnitude", a: { x: 0, y: 0, z: 0 }, b: { x: 1e-3, y: 0, z: 0 }, distance: 1e-3, absoluteTolerance: 1e-15 },
    { id: "large-offset-3-4-5", a: { x: 1e6, y: 1e6, z: 1e6 }, b: { x: 1e6, y: 1e6 + 3, z: 1e6 + 4 }, distance: 5, absoluteTolerance: 1e-9 },
    { id: "fractional", a: { x: 0, y: 0, z: 0 }, b: { x: 0.3, y: 0.4, z: 0 }, distance: 0.5, absoluteTolerance: 1e-15 },
    { id: "negative-quadrant", a: { x: -1, y: -2, z: -3 }, b: { x: -4, y: -6, z: -3 }, distance: 5, absoluteTolerance: 1e-12 },
  ];
}

// ---------------------------------------------------------------------------
// Line / plane angle fixtures
// ---------------------------------------------------------------------------

/** An angle fixture pair: two entity parameter sets + expected angle. */
export interface AngleFixture {
  readonly id: string;
  readonly kind: "line-line" | "line-plane" | "plane-plane";
  readonly first: {
    readonly point: GeomPoint;
    readonly vector: { readonly x: number; readonly y: number; readonly z: number };
  };
  readonly second: {
    readonly point: GeomPoint;
    readonly vector: { readonly x: number; readonly y: number; readonly z: number };
  };
  readonly expectedAngle: number;
  readonly absoluteTolerance: number;
}

const V_X: { x: number; y: number; z: number } = { x: 1, y: 0, z: 0 };
const V_Y: { x: number; y: number; z: number } = { x: 0, y: 1, z: 0 };
const V_Z: { x: number; y: number; z: number } = { x: 0, y: 0, z: 1 };
const V_DIAG: { x: number; y: number; z: number } = { x: 1, y: 1, z: 0 };
const V_DIAG3: { x: number; y: number; z: number } = { x: 1, y: 1, z: 1 };
const ORIGIN: GeomPoint = { x: 0, y: 0, z: 0 };

/**
 * Angle fixtures: parallel/orthogonal lines, a 45° skew pair, the
 * 45°/arctan line-plane cases, parallel/orthogonal planes, and the
 * sign-flipped duplicates that must yield the SAME acute angle
 * (undirected conventions).
 */
export function angleFixtures(): AngleFixture[] {
  return [
    {
      id: "parallel-lines",
      kind: "line-line",
      first: { point: ORIGIN, vector: V_X },
      second: { point: { x: 0, y: 5, z: 0 }, vector: V_X },
      expectedAngle: 0,
      absoluteTolerance: 1e-12,
    },
    {
      id: "parallel-lines-opposite-direction",
      kind: "line-line",
      first: { point: ORIGIN, vector: V_X },
      second: { point: { x: 0, y: 5, z: 0 }, vector: { x: -3, y: 0, z: 0 } },
      expectedAngle: 0,
      absoluteTolerance: 1e-12,
    },
    {
      id: "orthogonal-lines",
      kind: "line-line",
      first: { point: ORIGIN, vector: V_X },
      second: { point: { x: 10, y: 10, z: 10 }, vector: V_Y },
      expectedAngle: Math.PI / 2,
      absoluteTolerance: 1e-12,
    },
    {
      id: "diagonal-lines-45deg",
      kind: "line-line",
      first: { point: ORIGIN, vector: V_X },
      second: { point: { x: 0, y: 0, z: 5 }, vector: V_DIAG },
      expectedAngle: Math.PI / 4,
      absoluteTolerance: 1e-12,
    },
    {
      id: "space-diagonal-54-7356deg",
      kind: "line-line",
      first: { point: ORIGIN, vector: V_X },
      second: { point: { x: 7, y: 7, z: 7 }, vector: V_DIAG3 },
      expectedAngle: Math.acos(1 / Math.sqrt(3)),
      absoluteTolerance: 1e-12,
    },
    {
      id: "line-in-plane",
      kind: "line-plane",
      first: { point: ORIGIN, vector: V_X },
      second: { point: ORIGIN, vector: V_Z },
      expectedAngle: 0,
      absoluteTolerance: 1e-12,
    },
    {
      id: "line-perpendicular-to-plane",
      kind: "line-plane",
      first: { point: ORIGIN, vector: V_Z },
      second: { point: { x: 4, y: 4, z: 0 }, vector: V_Z },
      expectedAngle: Math.PI / 2,
      absoluteTolerance: 1e-12,
    },
    {
      id: "line-diagonal-in-xz-vs-xy-plane",
      kind: "line-plane",
      first: { point: ORIGIN, vector: { x: 0, y: 1, z: 1 } },
      second: { point: ORIGIN, vector: V_Z },
      expectedAngle: Math.PI / 4,
      absoluteTolerance: 1e-12,
    },
    {
      id: "parallel-planes",
      kind: "plane-plane",
      first: { point: { x: 0, y: 0, z: 3 }, vector: V_Z },
      second: { point: { x: 1, y: 1, z: -2 }, vector: { x: 0, y: 0, z: 7 } },
      expectedAngle: 0,
      absoluteTolerance: 1e-12,
    },
    {
      id: "parallel-planes-opposite-normal",
      kind: "plane-plane",
      first: { point: { x: 0, y: 0, z: 3 }, vector: V_Z },
      second: { point: { x: 1, y: 1, z: -2 }, vector: { x: 0, y: 0, z: -5 } },
      expectedAngle: 0,
      absoluteTolerance: 1e-12,
    },
    {
      id: "orthogonal-planes",
      kind: "plane-plane",
      first: { point: ORIGIN, vector: V_Z },
      second: { point: { x: 5, y: 0, z: 0 }, vector: V_X },
      expectedAngle: Math.PI / 2,
      absoluteTolerance: 1e-12,
    },
    {
      id: "planes-45deg",
      kind: "plane-plane",
      first: { point: ORIGIN, vector: V_Z },
      second: { point: ORIGIN, vector: { x: 1, y: 0, z: 1 } },
      expectedAngle: Math.PI / 4,
      absoluteTolerance: 1e-12,
    },
  ];
}

// ---------------------------------------------------------------------------
// Point-to-plane / point-to-line distance fixtures
// ---------------------------------------------------------------------------

/** A point-to-plane signed distance fixture. */
export interface PointPlaneDistanceFixture {
  readonly id: string;
  readonly point: GeomPoint;
  readonly planePoint: GeomPoint;
  readonly planeNormal: { readonly x: number; readonly y: number; readonly z: number };
  readonly expectedSignedDistance: number;
  readonly absoluteTolerance: number;
}

export function pointPlaneDistanceFixtures(): PointPlaneDistanceFixture[] {
  const invSqrt2 = 1 / Math.SQRT2;
  return [
    {
      id: "point-above-plane",
      point: { x: 1, y: 2, z: 7 },
      planePoint: { x: 0, y: 0, z: 3 },
      planeNormal: V_Z,
      expectedSignedDistance: 4,
      absoluteTolerance: 1e-12,
    },
    {
      id: "point-below-plane-negative",
      point: { x: 1, y: 2, z: 1 },
      planePoint: { x: 0, y: 0, z: 3 },
      planeNormal: V_Z,
      expectedSignedDistance: -2,
      absoluteTolerance: 1e-12,
    },
    {
      id: "point-on-plane",
      point: { x: 5, y: -5, z: 3 },
      planePoint: { x: 0, y: 0, z: 3 },
      planeNormal: V_Z,
      expectedSignedDistance: 0,
      absoluteTolerance: 1e-12,
    },
    {
      id: "diagonal-plane-signed",
      point: { x: 4, y: 4, z: 0 },
      planePoint: ORIGIN,
      planeNormal: { x: invSqrt2, y: invSqrt2, z: 0 },
      expectedSignedDistance: 4 * invSqrt2 + 4 * invSqrt2,
      absoluteTolerance: 1e-12,
    },
    {
      id: "unnormalized-normal-still-normalized-at-construction",
      point: { x: 0, y: 0, z: 10 },
      planePoint: { x: 0, y: 0, z: 2 },
      planeNormal: { x: 0, y: 0, z: 9 },
      expectedSignedDistance: 8,
      absoluteTolerance: 1e-12,
    },
  ];
}

/** A point-to-line distance fixture. */
export interface PointLineDistanceFixture {
  readonly id: string;
  readonly point: GeomPoint;
  readonly linePoint: GeomPoint;
  readonly lineDirection: { readonly x: number; readonly y: number; readonly z: number };
  readonly expectedDistance: number;
  readonly absoluteTolerance: number;
}

export function pointLineDistanceFixtures(): PointLineDistanceFixture[] {
  return [
    {
      id: "point-off-x-axis",
      point: { x: 10, y: 3, z: 4 },
      linePoint: ORIGIN,
      lineDirection: V_X,
      expectedDistance: 5,
      absoluteTolerance: 1e-12,
    },
    {
      id: "point-on-line",
      point: { x: 17, y: 0, z: 0 },
      linePoint: ORIGIN,
      lineDirection: V_X,
      expectedDistance: 0,
      absoluteTolerance: 1e-12,
    },
    {
      id: "diagonal-line-distance",
      point: { x: 1, y: 0, z: 0 },
      linePoint: ORIGIN,
      lineDirection: { x: 1, y: 1, z: 0 },
      expectedDistance: Math.SQRT2 / 2,
      absoluteTolerance: 1e-12,
    },
    {
      id: "offset-line-point-irrelevant-along-direction",
      point: { x: 0, y: 5, z: 0 },
      linePoint: { x: 1000, y: 0, z: 0 },
      lineDirection: V_X,
      expectedDistance: 5,
      absoluteTolerance: 1e-12,
    },
  ];
}

/** Seeded-noise helper exported for regression fixture builders. */
export function fixtureRng(seed: number): DeterministicRng {
  return new DeterministicRng(seed);
}

/** The plane fixture's ground truth (normal + signed offset). */
export function planeGroundTruth(): PlaneGroundTruth {
  const normal = planeNormalGroundTruth();
  // Plane 2x + 3y − z + 7 = 0 → normal·p = −7 for points on the plane.
  // Signed offset along the GIVEN normal orientation: n̂·p = −7/√14.
  return { normal, offset: -7 / Math.sqrt(14) };
}

export const PLANE_EXACT_ACCEPTANCE = { absoluteTolerance: 1e-9 } as const;
export const PLANE_NOISY_ACCEPTANCE = { absoluteTolerance: 0.01 } as const;
export const CYLINDER_EXACT_ACCEPTANCE = {
  radiusTolerance: 1e-6,
  axisAngleTolerance: 1e-6,
  centerTolerance: 1e-6,
} as const;
export const CYLINDER_NOISY_ACCEPTANCE = {
  radiusTolerance: 0.02,
  axisAngleTolerance: 0.01,
  centerTolerance: 0.02,
} as const;
export const CYLINDER_OUTLIER_ACCEPTANCE = {
  radiusTolerance: 0.01,
  axisAngleTolerance: 0.01,
  centerTolerance: 0.01,
} as const;
export const ANGLE_ACCEPTANCE = { absoluteTolerance: 1e-12 } as const;
export const DISTANCE_ACCEPTANCE = { absoluteTolerance: 1e-12 } as const;
