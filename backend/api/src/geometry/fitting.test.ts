/**
 * AISE-013 plane/line fitting tests — numerical accuracy, degeneracies,
 * order-permutation stability (see index.ts determinism contract).
 */

import { describe, expect, test } from "bun:test";
import {
  COLLINEARITY_RATIO_TOLERANCE,
  fitLine,
  fitPlane,
  GeometryError,
  type PlaneFitResult,
  type Vec3,
} from "./index";

const NEAR = 1e-12;

describe("fitPlane numerical accuracy", () => {
  test("four exact points of the z=0 plane fit perfectly", () => {
    const points: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ];
    const fit = fitPlane(points);
    // Sign canonicalization: largest-magnitude component positive → z > 0.
    expect(fit.plane.normal[2]).toBeGreaterThan(0);
    expect(Math.abs(fit.plane.normal[0])).toBeLessThan(NEAR);
    expect(Math.abs(fit.plane.normal[1])).toBeLessThan(NEAR);
    expect(fit.plane.normal[2]).toBeCloseTo(1, 12);
    expect(Math.abs(fit.plane.d)).toBeLessThan(NEAR);
    expect(fit.rmsResidual).toBeLessThan(NEAR);
    expect(fit.pointCount).toBe(4);
    // Eigenvalues ascending; the two in-plane ones dominate, the normal one is ~0.
    const [l1, l2, l3] = fit.eigenvalues;
    expect(l1).toBeLessThan(NEAR);
    expect(l2).toBeGreaterThan(0.2);
    expect(l3).toBeGreaterThan(0.2);
    expect(l1 <= l2 && l2 <= l3).toBe(true);
  });

  test("noisy synthetic points produce the analytic rms residual", () => {
    // Four exact z=0 points plus ONE outlier at height h = 0.1. By symmetry
    // the least-squares plane is z = h/5 = 0.02, so the residuals are
    // −0.02 ×4 and +0.08 ×1 → rms = 0.1·sqrt(20/125) = 0.04 exactly.
    const points: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [0.5, 0.5, 0.1],
    ];
    const fit = fitPlane(points);
    expect(fit.rmsResidual).toBeCloseTo(0.04, 10);
    expect(fit.plane.normal[2]).toBeGreaterThan(0);
    expect(fit.plane.d).toBeCloseTo(-0.02, 10);
  });

  test("a tilted plane is recovered: z = x + 2y + 3", () => {
    // Plane normal ∝ (-1, -2, 1)/sqrt(6); canonical sign flips to make the
    // largest-magnitude component (y, |−2|) positive → (1, 2, −1)/sqrt(6).
    const points: Vec3[] = [
      [0, 0, 3],
      [1, 0, 4],
      [0, 1, 5],
      [2, 1, 7],
      [1, 2, 8],
    ];
    const fit = fitPlane(points);
    const s = Math.sqrt(6);
    expect(fit.plane.normal[0]).toBeCloseTo(1 / s, 10);
    expect(fit.plane.normal[1]).toBeCloseTo(2 / s, 10);
    expect(fit.plane.normal[2]).toBeCloseTo(-1 / s, 10);
    // dot(n, p) + d = 0 for p = (0,0,3): d = -n·p = 3/s.
    expect(fit.plane.d).toBeCloseTo(3 / s, 10);
    expect(fit.rmsResidual).toBeLessThan(NEAR);
  });

  test("point-order permutation changes the fit only below 1e-12 relative", () => {
    const base: Vec3[] = [
      [0, 0, 0.01],
      [1, 0, -0.02],
      [0, 1, 0.015],
      [1, 1, -0.005],
      [2, 1, 0.02],
      [0.5, 2, -0.01],
    ];
    const a = fitPlane(base);
    const b = fitPlane([...base].reverse());
    const an = a.plane.normal;
    const bn = b.plane.normal;
    expect(Math.abs(an[0] - bn[0])).toBeLessThan(1e-12);
    expect(Math.abs(an[1] - bn[1])).toBeLessThan(1e-12);
    expect(Math.abs(an[2] - bn[2])).toBeLessThan(1e-12);
    expect(Math.abs(a.plane.d - b.plane.d)).toBeLessThan(1e-12);
    expect(Math.abs(a.rmsResidual - b.rmsResidual)).toBeLessThan(1e-12);
  });
});

describe("fitPlane degeneracies (typed, never silent)", () => {
  const expectCode = (points: readonly Vec3[], code: string): void => {
    try {
      fitPlane(points);
      expect.unreachable(`expected ${code}`);
    } catch (error) {
      expect(error).toBeInstanceOf(GeometryError);
      expect(String((error as GeometryError).code)).toBe(code);
    }
  };

  test("two points → INSUFFICIENT_POINTS", () => {
    expectCode(
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
      "INSUFFICIENT_POINTS",
    );
  });

  test("collinear points → DEGENERATE_COLLINEAR", () => {
    expectCode(
      [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [3, 0, 0],
      ],
      "DEGENERATE_COLLINEAR",
    );
  });

  test("coincident points → DEGENERATE_COINCIDENT", () => {
    expectCode(
      [
        [1, 2, 3],
        [1, 2, 3],
        [1, 2, 3],
      ],
      "DEGENERATE_COINCIDENT",
    );
  });

  test("the collinearity ratio tolerance is the documented constant", () => {
    // Pin the policy constant so tightening it is a deliberate act.
    expect(COLLINEARITY_RATIO_TOLERANCE).toBe(1e-12);
  });
});

describe("fitLine", () => {
  test("points along the x-axis with tiny jitter fit a near-x-axis line", () => {
    const points: Vec3[] = [];
    for (let i = 0; i < 8; i++) {
      points.push([i, 0.001 * i, 0]);
    }
    const fit = fitLine(points);
    // Direction ≈ (1, 0.001, 0)/|…|.
    const dir = fit.line.direction;
    expect(dir[0]).toBeGreaterThan(0.999);
    expect(Math.abs(dir[1])).toBeLessThan(0.002);
    expect(Math.abs(dir[2])).toBeLessThan(NEAR);
    // RMS orthogonal distance: |y - 0.001x| is exactly 0 for these points —
    // the line passes through all of them.
    expect(fit.rmsResidual).toBeLessThan(1e-9);
  });

  test("exact 3D diagonal line is recovered exactly", () => {
    const points: Vec3[] = [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
    ];
    const fit = fitLine(points);
    const d = fit.line.direction;
    expect(Math.abs(d[0])).toBeCloseTo(1 / Math.sqrt(3), 12);
    expect(Math.abs(d[1])).toBeCloseTo(1 / Math.sqrt(3), 12);
    expect(Math.abs(d[2])).toBeCloseTo(1 / Math.sqrt(3), 12);
    expect(fit.rmsResidual).toBeLessThan(NEAR);
  });

  test("fewer than 2 points → INSUFFICIENT_POINTS", () => {
    try {
      fitLine([[1, 1, 1]]);
      expect.unreachable();
    } catch (error) {
      expect((error as GeometryError).code).toBe("INSUFFICIENT_POINTS");
    }
  });

  test("coincident points → DEGENERATE_COINCIDENT", () => {
    try {
      fitLine([
        [2, 2, 2],
        [2, 2, 2],
      ]);
      expect.unreachable();
    } catch (error) {
      expect((error as GeometryError).code).toBe("DEGENERATE_COINCIDENT");
    }
  });

  test("collinear input is NOT degenerate for a line (documented)", () => {
    // Collinear points are the ideal case for a line fit, not a degeneracy.
    const fit = fitLine([
      [0, 0, 0],
      [1, 0, 0],
      [5, 0, 0],
    ]);
    expect(Math.abs(fit.line.direction[1])).toBeLessThan(NEAR);
    expect(Math.abs(fit.line.direction[2])).toBeLessThan(NEAR);
  });
});

describe("fitPlane determinism", () => {
  test("identical inputs produce identical PlaneFitResult objects", () => {
    const points: Vec3[] = [
      [0, 0, 0.01],
      [1, 0, -0.01],
      [0, 1, 0.02],
      [1, 1, -0.02],
    ];
    const a: PlaneFitResult = fitPlane(points);
    const b: PlaneFitResult = fitPlane(points);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // No NaNs anywhere.
    expect(JSON.stringify(a)).not.toContain("null");
    expect(Number.isFinite(a.eigenvalues[0])).toBe(true);
  });
});
