/**
 * Plane fitting tests (AISE-009): TLS-PCA and robust LMedS,
 * degeneracy rejection, uncertainty propagation, provenance,
 * epistemic honesty, determinism.
 */
import { describe, expect, it } from "vitest";
import { fitPlane, fitPlaneRobust, PLANE_FIT_METHOD, PLANE_ROBUST_FIT_METHOD } from "./plane.js";
import { GeometryError } from "../errors.js";
import { DeterministicRng } from "../seeded.js";
import { exactPlanePoints, noisyPlanePoints, planeGroundTruth } from "../fixtures/golden.js";

const UNIT = "meter" as const;

function planePointsZ(): { x: number; y: number; z: number }[] {
  // Simple z = 0 plane, 5x5 grid.
  const points: { x: number; y: number; z: number }[] = [];
  for (let x = -2; x <= 2; x += 1) {
    for (let y = -2; y <= 2; y += 1) {
      points.push({ x, y, z: 0 });
    }
  }
  return points;
}

describe("fitPlane (TLS-PCA)", () => {
  it("recovers an exact plane's normal and offset", () => {
    const result = fitPlane({ points: exactPlanePoints(), unit: UNIT });
    const truth = planeGroundTruth();
    // Normal up to sign.
    const dot =
      result.plane.normal.x * truth.normal.x +
      result.plane.normal.y * truth.normal.y +
      result.plane.normal.z * truth.normal.z;
    expect(Math.abs(dot)).toBeCloseTo(1, 10);
    // Offset up to sign consistency.
    const sign = dot >= 0 ? 1 : -1;
    expect(sign * result.offsetFromOrigin.value).toBeCloseTo(truth.offset, 10);
    expect(result.residualStats.rms).toBeLessThan(1e-10);
    expect(result.residualStats.count).toBe(exactPlanePoints().length);
  });

  it("recovers a simple axis-aligned plane exactly", () => {
    const result = fitPlane({ points: planePointsZ(), unit: UNIT });
    expect(Math.abs(result.plane.normal.z)).toBeCloseTo(1, 12);
    expect(Math.abs(result.plane.normal.x)).toBeLessThan(1e-12);
    expect(Math.abs(result.plane.normal.y)).toBeLessThan(1e-12);
    expect(result.offsetFromOrigin.value).toBeCloseTo(0, 12);
  });

  it("is bit-identical across input permutations (determinism)", () => {
    const base = exactPlanePoints();
    const rng = new DeterministicRng(1234);
    const shuffled = rng.permutation(base.length).map((index) => base[index]!);
    const a = fitPlane({ points: base, unit: UNIT });
    const b = fitPlane({ points: shuffled, unit: UNIT });
    expect(a).toEqual(b);
  });

  it("produces identical results on repeated runs (no hidden state)", () => {
    const a = fitPlane({ points: exactPlanePoints(), unit: UNIT });
    const b = fitPlane({ points: exactPlanePoints(), unit: UNIT });
    expect(a).toEqual(b);
  });

  it("carries epistemic INFERRED even when the source points are declared OBSERVED", () => {
    const result = fitPlane({
      points: exactPlanePoints(),
      unit: UNIT,
      sourceEpistemic: "OBSERVED",
    });
    expect(result.epistemic).toBe("INFERRED");
    expect(result.provenance.inputs[0]).toMatchObject({ kind: "point-set", epistemic: "OBSERVED" });
  });

  it("records complete provenance with content-pinned inputs", () => {
    const result = fitPlane({ points: exactPlanePoints(), unit: UNIT });
    expect(result.provenance.method).toBe(PLANE_FIT_METHOD);
    expect(result.provenance.methodVersion).toBe("1.0.0");
    expect(result.provenance.inputs).toHaveLength(1);
    expect(result.provenance.parameters).toMatchObject({ unit: "meter", method: "tls-pca" });
    const hash = result.provenance.inputs[0]!.contentHash;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("propagates first-order uncertainty when input σ is stated", () => {
    const sigma = 0.01;
    const n = exactPlanePoints().length;
    const result = fitPlane({ points: exactPlanePoints(), unit: UNIT, perPointStandardUncertainty: sigma });
    expect(result.uncertainty).toBeDefined();
    expect(result.uncertainty!.offsetStandard).toBeCloseTo(sigma / Math.sqrt(n), 12);
    expect(result.offsetFromOrigin.uncertainty).toEqual({
      kind: "standard",
      u: sigma / Math.sqrt(n),
    });
    // Normal angle uncertainty: σ / (√n · in-plane RMS spread).
    expect(result.uncertainty!.normalAngleStandard).toBeGreaterThan(0);
    expect(Number.isFinite(result.uncertainty!.normalAngleStandard)).toBe(true);
  });

  it("omits uncertainty when input σ is not stated (never zero)", () => {
    const result = fitPlane({ points: exactPlanePoints(), unit: UNIT });
    expect(result.uncertainty).toBeUndefined();
    expect(result.offsetFromOrigin.uncertainty).toBeUndefined();
  });

  it("rejects non-finite points", () => {
    const points = planePointsZ();
    points[3] = { x: Number.NaN, y: 0, z: 0 };
    expect(() => fitPlane({ points, unit: UNIT })).toThrow(GeometryError);
    try {
      fitPlane({ points, unit: UNIT });
    } catch (error) {
      expect((error as GeometryError).code).toBe("NON_FINITE_INPUT");
    }
  });

  it("rejects fewer than 3 points", () => {
    try {
      fitPlane({ points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }], unit: UNIT });
      expect.unreachable("must fail closed");
    } catch (error) {
      expect((error as GeometryError).code).toBe("INSUFFICIENT_POINTS");
    }
  });

  it("rejects collinear points (a line determines no unique plane)", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 2 * i, z: 3 * i }));
    try {
      fitPlane({ points, unit: UNIT });
      expect.unreachable("collinear plane fit must fail closed");
    } catch (error) {
      const geometryError = error as GeometryError;
      expect(geometryError.code).toBe("DEGENERATE_GEOMETRY");
      expect(String(geometryError.message)).toContain("collinear");
    }
  });

  it("rejects coincident points", () => {
    const points = Array.from({ length: 5 }, () => ({ x: 1, y: 2, z: 3 }));
    try {
      fitPlane({ points, unit: UNIT });
      expect.unreachable("coincident points must fail closed");
    } catch (error) {
      expect((error as GeometryError).code).toBe("DEGENERATE_GEOMETRY");
    }
  });
});

describe("fitPlaneRobust (LMedS)", () => {
  function planeWithOutliers(): { x: number; y: number; z: number }[] {
    const inliers = planePointsZ();
    const outliers = [
      { x: 0, y: 0, z: 50 },
      { x: 1, y: -1, z: -30 },
      { x: -2, y: 2, z: 25 },
      { x: 0.5, y: 0.5, z: -15 },
    ];
    return [...inliers, ...outliers];
  }

  it("isolates the dominant plane and rejects outliers", () => {
    const result = fitPlaneRobust({ points: planeWithOutliers(), unit: UNIT });
    expect(result.robust).toBeDefined();
    expect(result.robust!.outlierCount).toBe(4);
    expect(result.robust!.inlierCount).toBe(planePointsZ().length);
    expect(Math.abs(result.plane.normal.z)).toBeCloseTo(1, 10);
    // Inlier residuals are exactly zero (integer grid); the FULL
    // set statistics necessarily include the outlier distances —
    // that is the outlier report, not a fit failure.
    expect(result.robust!.inlierResidualStats.rms).toBeLessThan(1e-12);
    expect(result.robust!.inlierResidualStats.maxAbs).toBeLessThan(1e-12);
    const expectedFullRms = Math.sqrt((50 ** 2 + 30 ** 2 + 25 ** 2 + 15 ** 2) / 29);
    expect(result.residualStats.rms).toBeCloseTo(expectedFullRms, 9);
  });

  it("recovers the exact ground-truth plane from noisy+outlier data within tolerance", () => {
    const inliers = noisyPlanePoints();
    const outliers = [
      { x: 0, y: 0, z: 40 },
      { x: 1, y: 1, z: -20 },
      { x: -3, y: 2, z: 15 },
    ];
    const result = fitPlaneRobust({ points: [...inliers, ...outliers], unit: UNIT });
    const truth = planeGroundTruth();
    const dot =
      result.plane.normal.x * truth.normal.x +
      result.plane.normal.y * truth.normal.y +
      result.plane.normal.z * truth.normal.z;
    expect(Math.abs(dot)).toBeGreaterThan(0.999);
    expect(result.robust!.outlierCount).toBe(3);
  });

  it("records the robust method and parameters in provenance", () => {
    const result = fitPlaneRobust({ points: planeWithOutliers(), unit: UNIT });
    expect(result.provenance.method).toBe(PLANE_ROBUST_FIT_METHOD);
    expect(result.provenance.parameters).toMatchObject({
      method: "lmeds-then-tls-pca",
      inlierScaleMultiplier: 2.5,
    });
  });

  it("is bit-identical across input permutations", () => {
    const base = planeWithOutliers();
    const rng = new DeterministicRng(777);
    const shuffled = rng.permutation(base.length).map((index) => base[index]!);
    const a = fitPlaneRobust({ points: base, unit: UNIT });
    const b = fitPlaneRobust({ points: shuffled, unit: UNIT });
    expect(a).toEqual(b);
  });

  it("rejects fully collinear input with DEGENERATE_GEOMETRY", () => {
    const points = Array.from({ length: 8 }, (_, i) => ({ x: i, y: i, z: i }));
    expect(() => fitPlaneRobust({ points, unit: UNIT })).toThrow(GeometryError);
  });

  it("propagates uncertainty over the INLIER count", () => {
    const sigma = 0.01;
    const result = fitPlaneRobust({
      points: planeWithOutliers(),
      unit: UNIT,
      perPointStandardUncertainty: sigma,
    });
    const inlierCount = result.robust!.inlierCount;
    expect(result.uncertainty!.offsetStandard).toBeCloseTo(sigma / Math.sqrt(inlierCount), 12);
  });
});
