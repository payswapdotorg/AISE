/**
 * AISE-013 measurement tests — golden values, uncertainty discipline
 * (null-propagation, monotonicity, confidence-absence), degeneracies.
 */

import { describe, expect, test } from "bun:test";
import {
  angleBetween,
  angleBetweenPlanes,
  dimensionBetweenParallelPlanes,
  distancePointPlane,
  distancePointPoint,
  GeometryError,
  propagateUncertainty,
  type Plane,
  type Vec3,
} from "./index";

describe("distancePointPoint", () => {
  test("3-4-5 triangle: distance is exactly 5", () => {
    const m = distancePointPoint([3, 4, 0], null, [0, 0, 0], null);
    expect(m.value).toBe(5);
    expect(m.uncertainty).toBeNull();
  });

  test("independent 1σ inputs combine as sqrt(σa² + σb²)", () => {
    const m = distancePointPoint([3, 4, 0], 0.1, [0, 0, 0], 0.2);
    expect(m.value).toBe(5);
    expect(m.uncertainty).toBeCloseTo(Math.sqrt(0.05), 12);
  });

  test("null σ on either side stays null — never 0", () => {
    expect(distancePointPoint([1, 0, 0], 0.1, [0, 0, 0], null).uncertainty).toBeNull();
    expect(distancePointPoint([1, 0, 0], null, [0, 0, 0], 0.1).uncertainty).toBeNull();
  });

  test("explicit zero σ is honored (exact reference points)", () => {
    const m = distancePointPoint([1, 0, 0], 0, [0, 0, 0], 0);
    expect(m.uncertainty).toBe(0);
  });

  test("DISCRIMINATION: flipping a null σ to numeric flips null → numeric", () => {
    const unknown = distancePointPoint([1, 1, 0], null, [0, 0, 0], 0.3);
    const known = distancePointPoint([1, 1, 0], 0.1, [0, 0, 0], 0.3);
    expect(unknown.uncertainty).toBeNull();
    expect(known.uncertainty).not.toBeNull();
    expect(known.uncertainty).toBeCloseTo(Math.sqrt(0.01 + 0.09), 12);
  });

  test("uncertainty grows monotonically with input σ", () => {
    let previous = -1;
    for (const sigma of [0.01, 0.05, 0.1, 0.5, 1, 5]) {
      const m = distancePointPoint([1, 0, 0], sigma, [0, 0, 0], sigma);
      expect(m.uncertainty).not.toBeNull();
      expect(m.uncertainty!).toBeGreaterThan(previous);
      previous = m.uncertainty!;
    }
  });

  test("triangle inequality over a fixed point cloud", () => {
    const cloud: Vec3[] = [
      [0, 0, 0],
      [3, 4, 0],
      [1, 7, 2],
      [-2, 0.5, 5],
      [0.3, -1, 8],
    ];
    for (const a of cloud) {
      for (const b of cloud) {
        for (const c of cloud) {
          const ab = distancePointPoint(a, null, b, null).value;
          const ac = distancePointPoint(a, null, c, null).value;
          const bc = distancePointPoint(b, null, c, null).value;
          expect(ab).toBeLessThanOrEqual(ac + bc + 1e-12);
        }
      }
    }
  });
});

describe("distancePointPlane", () => {
  const z1: Plane = { normal: [0, 0, 1], d: -1 }; // z = 1

  test("point (1,1,3) to z=1 plane: signed +2, absolute 2", () => {
    const m = distancePointPlane([1, 1, 3], null, z1, null);
    expect(m.value).toBe(2);
    expect(m.absolute).toBe(2);
  });

  test("sign convention: positive on the normal's side, negative below", () => {
    expect(distancePointPlane([0, 0, 0], null, z1, null).value).toBe(-1);
    expect(distancePointPlane([0, 0, 0], null, z1, null).absolute).toBe(1);
  });

  test("non-unit plane normal is normalized internally (same plane)", () => {
    const scaled: Plane = { normal: [0, 0, 5], d: -5 };
    const m = distancePointPlane([1, 1, 3], null, scaled, null);
    expect(m.value).toBeCloseTo(2, 12);
  });

  test("query-point σ propagates exactly when the plane is exact (uNormal = 0 explicit)", () => {
    // Omitted σ means UNKNOWN: uNormal must be passed as an explicit 0 to
    // assert an exact reference plane (documented API contract).
    // σs = sqrt(σp² + (0·|lever|)²) = σp.
    const m = distancePointPlane([1, 1, 3], 0.25, z1, 0);
    expect(m.uncertainty).toBeCloseTo(0.25, 12);
  });

  test("normal angular σ contributes the lever-arm term", () => {
    // p₀ = (0,0,1); p = (1,1,3) → |p − p₀| = sqrt(1 + 1 + 4) = sqrt(6).
    // σs = sqrt(0.25² + (0.05·sqrt(6))²).
    const m = distancePointPlane([1, 1, 3], 0.25, z1, 0.05);
    expect(m.uncertainty).toBeCloseTo(Math.sqrt(0.0625 + 0.0025 * 6), 12);
  });

  test("omitted/unknown σ poisons the result — null, never fabricated (discrimination)", () => {
    // σp known but σn omitted (unknown) → null.
    expect(distancePointPlane([1, 1, 3], 0.1, z1, null).uncertainty).toBeNull();
    // σn known but σp unknown → null.
    expect(distancePointPlane([1, 1, 3], null, z1, 0.1).uncertainty).toBeNull();
    // Discrimination: pinning the omitted σn to an explicit 0 flips null → 0.1.
    const pinned = distancePointPlane([1, 1, 3], 0.1, z1, 0);
    expect(pinned.uncertainty).not.toBeNull();
    expect(pinned.uncertainty).toBeCloseTo(0.1, 12);
  });
});

describe("angleBetween", () => {
  test("orthogonal axes → π/2", () => {
    expect(angleBetween([1, 0, 0], [0, 1, 0]).value).toBeCloseTo(Math.PI / 2, 12);
  });

  test("parallel vectors → 0; antiparallel → π", () => {
    expect(angleBetween([2, 0, 0], [5, 0, 0]).value).toBeCloseTo(0, 12);
    expect(angleBetween([1, 0, 0], [-3, 0, 0]).value).toBeCloseTo(Math.PI, 12);
  });

  test("small-angle regime is accurate away from the acos ill-conditioning", () => {
    // (1,0,0) vs (1,ε,0): θ = acos(1/√(1+ε²)) ≈ ε. ε = 1e-4 keeps acos
    // well-conditioned (the module docs flag the c→±1 value ill-conditioning
    // at the last representable bits; 1e-7-scale ε is below that floor).
    const eps = 1e-4;
    expect(angleBetween([1, 0, 0], [1, eps, 0]).value).toBeCloseTo(eps, 10);
  });

  test("symmetry: angle(a,b) = angle(b,a)", () => {
    const a: Vec3 = [1, 2, 3];
    const b: Vec3 = [-2, 0.5, 1];
    expect(angleBetween(a, b).value).toBeCloseTo(angleBetween(b, a).value, 12);
  });

  test("angular σ combines as sqrt(σ1² + σ2²) at any angle (exact first-order)", () => {
    const theta = angleBetween([1, 0, 0], [Math.cos(0.7), Math.sin(0.7), 0], 0.03, 0.04);
    expect(theta.uncertainty).toBeCloseTo(Math.sqrt(0.0009 + 0.0016), 12);
    // And at a right angle too — the cancellation is documented as exact.
    const right = angleBetween([1, 0, 0], [0, 1, 0], 0.03, 0.04);
    expect(right.uncertainty).toBeCloseTo(0.05, 12);
  });

  test("zero-length vector → ZERO_LENGTH_VECTOR", () => {
    try {
      angleBetween([0, 0, 0], [1, 0, 0]);
      expect.unreachable();
    } catch (error) {
      expect((error as GeometryError).code).toBe("ZERO_LENGTH_VECTOR");
    }
  });
});

describe("angleBetweenPlanes (acute dihedral convention)", () => {
  test("planes at 30° → π/6", () => {
    const p1: Plane = { normal: [0, 0, 1], d: 0 };
    const p2: Plane = { normal: [0, Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)], d: 0 };
    expect(angleBetweenPlanes(p1, p2).value).toBeCloseTo(Math.PI / 6, 12);
  });

  test("parallel → 0; perpendicular → π/2; orientation-independent", () => {
    const p1: Plane = { normal: [0, 0, 1], d: 0 };
    const p2: Plane = { normal: [0, 0, 1], d: -5 };
    expect(angleBetweenPlanes(p1, p2).value).toBeCloseTo(0, 12);
    const q: Plane = { normal: [1, 0, 0], d: 0 };
    expect(angleBetweenPlanes(p1, q).value).toBeCloseTo(Math.PI / 2, 12);
    // Flipping a normal sign must not change the acute dihedral.
    const flipped: Plane = { normal: [0, 0, -1], d: 5 };
    expect(angleBetweenPlanes(p1, flipped).value).toBeCloseTo(0, 12);
  });

  test("no σ inputs → uncertainty null (never fabricated)", () => {
    expect(angleBetweenPlanes({ normal: [0, 0, 1], d: 0 }, { normal: [0, 1, 0], d: 0 }).uncertainty).toBeNull();
  });

  test("zero normal → DEGENERATE_PLANE_NORMAL", () => {
    try {
      angleBetweenPlanes({ normal: [0, 0, 0], d: 0 }, { normal: [0, 1, 0], d: 0 });
      expect.unreachable();
    } catch (error) {
      expect((error as GeometryError).code).toBe("DEGENERATE_PLANE_NORMAL");
    }
  });
});

describe("dimensionBetweenParallelPlanes", () => {
  test("z=0 and z=2.5 → 2.5 (non-negative separation convention)", () => {
    const dim = dimensionBetweenParallelPlanes(
      { normal: [0, 0, 1], d: 0 },
      { normal: [0, 0, 1], d: -2.5 },
    );
    expect(dim.value).toBe(2.5);
    expect(dim.uncertainty).toBeNull();
  });

  test("orientation flips are absorbed (same physical gap)", () => {
    const a = dimensionBetweenParallelPlanes(
      { normal: [0, 0, 1], d: 0 },
      { normal: [0, 0, -1], d: 2.5 },
    );
    expect(a.value).toBe(2.5);
  });

  test("non-parallel planes → NON_PARALLEL_PLANES naming the measured angle", () => {
    try {
      dimensionBetweenParallelPlanes(
        { normal: [0, 0, 1], d: 0 },
        { normal: [0, Math.sin(0.2), Math.cos(0.2)], d: -1 },
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GeometryError);
      expect((error as GeometryError).code).toBe("NON_PARALLEL_PLANES");
      expect((error as GeometryError).message).toContain("0.2");
    }
  });
});

describe("propagateUncertainty core", () => {
  test("partials/uncertainties length mismatch → INVALID_INPUT", () => {
    try {
      propagateUncertainty(1, [1, 2], [0.1]);
      expect.unreachable();
    } catch (error) {
      expect((error as GeometryError).code).toBe("INVALID_INPUT");
    }
  });

  test("any null σ → null; all numeric → sqrt of summed squares", () => {
    expect(propagateUncertainty(7, [2, 3], [0.1, null]).uncertainty).toBeNull();
    expect(propagateUncertainty(7, [2, 3], [0.1, 0.2]).uncertainty).toBeCloseTo(
      Math.sqrt(0.04 + 0.36),
      12,
    );
  });

  test("TYPE-LEVEL: the Measurement API exposes no confidence field", () => {
    // Confidence is a belief-support quantity and must not appear anywhere
    // in the measurement API (architecture-lock: confidence never
    // substitutes for measurement uncertainty). Discrimination at runtime:
    const m = distancePointPoint([1, 0, 0], 0.1, [0, 0, 0], 0.1);
    const keys = Object.keys(m).sort();
    expect(keys).toEqual(["uncertainty", "value"]);
  });
});
