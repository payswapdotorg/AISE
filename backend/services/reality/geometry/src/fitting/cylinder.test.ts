/**
 * Cylinder fitting tests (AISE-009): axis via normal-scatter null
 * space, cross-section circle, validity bounds, degeneracies
 * (sphere/plane/collinear), robustness to outliers, uncertainty
 * propagation, provenance, epistemic honesty, determinism.
 */
import { describe, expect, it } from "vitest";
import {
  CYLINDER_FIT_METHOD,
  CYLINDER_ROBUST_FIT_METHOD,
  MIN_CYLINDER_POINTS,
  fitCylinder,
  fitCylinderRobust,
} from "./cylinder.js";
import { GeometryError } from "../errors.js";
import { DeterministicRng } from "../seeded.js";
import {
  cylinderGroundTruth,
  cylinderWithOutliers,
  exactCylinderPoints,
  noisyCylinderPoints,
} from "../fixtures/golden.js";

const UNIT = "meter" as const;

function spherePoints(): { x: number; y: number; z: number }[] {
  // Fibonacci-ish deterministic sphere sampling, radius 4.
  const points: { x: number; y: number; z: number }[] = [];
  const count = 200;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(1 - y * y, 0));
    const theta = goldenAngle * i;
    points.push({ x: 4 * radiusAtY * Math.cos(theta), y: 4 * y, z: 4 * radiusAtY * Math.sin(theta) });
  }
  return points;
}

function planePoints(): { x: number; y: number; z: number }[] {
  const points: { x: number; y: number; z: number }[] = [];
  for (let x = -3; x <= 3; x += 1) {
    for (let y = -3; y <= 3; y += 1) {
      points.push({ x, y, z: 0 });
    }
  }
  return points;
}

describe("fitCylinder (normals nullspace + circle)", () => {
  it("recovers the exact cylinder: axis, axis point, radius", () => {
    const result = fitCylinder({ points: exactCylinderPoints(), unit: UNIT });
    const truth = cylinderGroundTruth();
    const axisDot =
      result.cylinder.axis.x * truth.axis.x +
      result.cylinder.axis.y * truth.axis.y +
      result.cylinder.axis.z * truth.axis.z;
    expect(Math.abs(axisDot)).toBeCloseTo(1, 9);
    expect(result.cylinder.radius).toBeCloseTo(truth.radius, 9);
    // Axis point: the closest point on the axis to the origin lies
    // in the plane z=0 for the ground-truth axis.
    expect(result.cylinder.axisPoint.x).toBeCloseTo(truth.axisPoint.x, 8);
    expect(result.cylinder.axisPoint.y).toBeCloseTo(truth.axisPoint.y, 8);
    expect(result.residualStats.rms).toBeLessThan(1e-6);
    expect(result.residualStats.count).toBe(exactCylinderPoints().length);
  });

  it("recovers the noisy cylinder within tolerance", () => {
    const result = fitCylinder({ points: noisyCylinderPoints(), unit: UNIT });
    const truth = cylinderGroundTruth();
    expect(result.cylinder.radius).toBeCloseTo(truth.radius, 2);
    expect(result.cylinder.axisPoint.x).toBeCloseTo(truth.axisPoint.x, 2);
    expect(result.cylinder.axisPoint.y).toBeCloseTo(truth.axisPoint.y, 2);
    expect(result.residualStats.rms).toBeLessThan(0.012);
  });

  it("is bit-identical across input permutations (determinism)", () => {
    const base = exactCylinderPoints();
    const rng = new DeterministicRng(4321);
    const shuffled = rng.permutation(base.length).map((index) => base[index]!);
    const a = fitCylinder({ points: base, unit: UNIT });
    const b = fitCylinder({ points: shuffled, unit: UNIT });
    expect(a).toEqual(b);
  });

  it("produces identical results on repeated runs", () => {
    const a = fitCylinder({ points: exactCylinderPoints(), unit: UNIT });
    const b = fitCylinder({ points: exactCylinderPoints(), unit: UNIT });
    expect(a).toEqual(b);
  });

  it("carries epistemic INFERRED even for OBSERVED-declared points", () => {
    const result = fitCylinder({ points: exactCylinderPoints(), unit: UNIT, sourceEpistemic: "OBSERVED" });
    expect(result.epistemic).toBe("INFERRED");
  });

  it("records complete provenance", () => {
    const result = fitCylinder({ points: exactCylinderPoints(), unit: UNIT });
    expect(result.provenance.method).toBe(CYLINDER_FIT_METHOD);
    expect(result.provenance.inputs).toHaveLength(1);
    expect(result.provenance.inputs[0]).toMatchObject({ kind: "point-set" });
    expect(result.provenance.parameters).toMatchObject({ unit: "meter", kNearest: 10 });
  });

  it("propagates first-order uncertainty when σ is stated", () => {
    const sigma = 0.01;
    const n = exactCylinderPoints().length;
    const result = fitCylinder({
      points: exactCylinderPoints(),
      unit: UNIT,
      perPointStandardUncertainty: sigma,
    });
    expect(result.uncertainty).toBeDefined();
    expect(result.uncertainty!.radiusStandard).toBeCloseTo(sigma / Math.sqrt(n), 12);
    expect(result.radiusMeasurement.uncertainty).toEqual({ kind: "standard", u: sigma / Math.sqrt(n) });
    expect(result.uncertainty!.axisAngleStandard).toBeGreaterThan(0);
    expect(Number.isFinite(result.uncertainty!.axisAngleStandard)).toBe(true);
  });

  it("omits uncertainty when σ is not stated", () => {
    const result = fitCylinder({ points: exactCylinderPoints(), unit: UNIT });
    expect(result.uncertainty).toBeUndefined();
    expect(result.radiusMeasurement.uncertainty).toBeUndefined();
  });

  it("rejects fewer than 6 points", () => {
    const few = exactCylinderPoints().slice(0, 5);
    try {
      fitCylinder({ points: few, unit: UNIT });
      expect.unreachable("must fail closed");
    } catch (error) {
      expect((error as GeometryError).code).toBe("INSUFFICIENT_POINTS");
      expect((error as GeometryError).details).toMatchObject({ required: MIN_CYLINDER_POINTS });
    }
  });

  it("rejects non-finite points", () => {
    const points = exactCylinderPoints();
    points[10] = { x: Number.NaN, y: 0, z: 0 };
    expect(() => fitCylinder({ points, unit: UNIT })).toThrow(GeometryError);
  });

  it("rejects coincident points", () => {
    const points = Array.from({ length: 10 }, () => ({ x: 1, y: 2, z: 3 }));
    expect(() => fitCylinder({ points, unit: UNIT })).toThrow(GeometryError);
  });

  it("rejects collinear points", () => {
    const points = Array.from({ length: 20 }, (_, i) => ({ x: i, y: i, z: i }));
    expect(() => fitCylinder({ points, unit: UNIT })).toThrow(GeometryError);
  });

  it("rejects a sphere (axis ambiguous — normals share no single perpendicular)", () => {
    try {
      fitCylinder({ points: spherePoints(), unit: UNIT });
      expect.unreachable("sphere must fail closed");
    } catch (error) {
      const geometryError = error as GeometryError;
      expect(["DEGENERATE_GEOMETRY", "INVALID_FIT", "INTERNAL_ERROR"]).toContain(geometryError.code);
      if (geometryError.code === "DEGENERATE_GEOMETRY") {
        expect(String(geometryError.message)).toContain("ambiguous");
      }
    }
  });

  it("rejects a plane (no finite cylinder through a plane's points)", () => {
    expect(() => fitCylinder({ points: planePoints(), unit: UNIT })).toThrow(GeometryError);
  });

  it("rejects points that are not on a common cylinder (INVALID_FIT)", () => {
    // Two coaxial tube segments of different radii, each with real
    // height extent (5 z-layers over ±0.6) so local neighborhoods
    // yield clean surface normals: the normals all ⊥ z find the
    // axis, but no single radius fits both — INVALID_FIT.
    const points: { x: number; y: number; z: number }[] = [];
    for (let a = 0; a < 30; a += 1) {
      const theta = (a * 2 * Math.PI) / 30;
      for (const dz of [-0.6, -0.3, 0, 0.3, 0.6]) {
        points.push({ x: 3 * Math.cos(theta), y: 3 * Math.sin(theta), z: -2 + dz });
        points.push({ x: 6 * Math.cos(theta), y: 6 * Math.sin(theta), z: 2 + dz });
      }
    }
    try {
      fitCylinder({ points, unit: UNIT });
      expect.unreachable("two radii must fail the validity bound");
    } catch (error) {
      expect((error as GeometryError).code).toBe("INVALID_FIT");
    }
  });

  it("enforces the bounded-compute cap", () => {
    const points = exactCylinderPoints();
    expect(() => fitCylinder({ points, unit: UNIT }, { maxPoints: 10 })).toThrow(GeometryError);
  });
});

describe("fitCylinderRobust (LMedS)", () => {
  it("recovers the exact cylinder from data with 20% outliers", () => {
    const result = fitCylinderRobust({ points: cylinderWithOutliers(), unit: UNIT });
    const truth = cylinderGroundTruth();
    expect(result.robust).toBeDefined();
    expect(result.robust!.outlierCount).toBeGreaterThanOrEqual(80);
    expect(result.cylinder.radius).toBeCloseTo(truth.radius, 2);
    expect(result.cylinder.axisPoint.x).toBeCloseTo(truth.axisPoint.x, 2);
    expect(result.cylinder.axisPoint.y).toBeCloseTo(truth.axisPoint.y, 2);
    const axisDot =
      result.cylinder.axis.x * truth.axis.x +
      result.cylinder.axis.y * truth.axis.y +
      result.cylinder.axis.z * truth.axis.z;
    expect(Math.abs(axisDot)).toBeGreaterThan(0.999);
  });

  it("records the robust method in provenance", () => {
    const result = fitCylinderRobust({ points: cylinderWithOutliers(), unit: UNIT });
    expect(result.provenance.method).toBe(CYLINDER_ROBUST_FIT_METHOD);
    expect(result.provenance.parameters).toMatchObject({ inlierScaleMultiplier: 2.5 });
  });

  it("is bit-identical across input permutations", () => {
    const base = cylinderWithOutliers();
    const rng = new DeterministicRng(999);
    const shuffled = rng.permutation(base.length).map((index) => base[index]!);
    const a = fitCylinderRobust({ points: base, unit: UNIT });
    const b = fitCylinderRobust({ points: shuffled, unit: UNIT });
    expect(a).toEqual(b);
  });

  it("still fails closed on a sphere", () => {
    expect(() => fitCylinderRobust({ points: spherePoints(), unit: UNIT })).toThrow(GeometryError);
  });

  it("propagates uncertainty over the inlier count", () => {
    const sigma = 0.01;
    const result = fitCylinderRobust({
      points: cylinderWithOutliers(),
      unit: UNIT,
      perPointStandardUncertainty: sigma,
    });
    const inlierCount = result.robust!.inlierCount;
    expect(result.uncertainty!.radiusStandard).toBeCloseTo(sigma / Math.sqrt(inlierCount), 12);
  });
});
