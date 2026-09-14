/**
 * AISE-013 transform validation tests — the WorldSculpt metric gate duty
 * (docs/worldsculpt-integration-strategy.md § AISE-013): detect
 * non-uniform scale, reflection, singularity, shear, out-of-range scale and
 * non-affine rows BEFORE any engine result is used for engineering
 * measurement. Mutation/discrimination tests pin each verdict.
 */

import { describe, expect, test } from "bun:test";
import {
  applyTransform,
  GeometryError,
  mat4Identity,
  mat4Multiply,
  mat4Translation,
  mat4RotationX,
  mat4RotationZ,
  validateMetricTransform,
  type Mat4,
  type Vec3,
} from "./index";

/** Diagonal scale matrix (local test helper — not part of the library). */
function mat4Scale(sx: number, sy: number, sz: number): Mat4 {
  return [
    [sx, 0, 0, 0],
    [0, sy, 0, 0],
    [0, 0, sz, 0],
    [0, 0, 0, 1],
  ];
}

const REF = { expectedScaleWithin: [0.9, 1.1] as const };
const WIDE_REF = { expectedScaleWithin: [0.5, 3] as const };

describe("validateMetricTransform verdicts", () => {
  test("identity → valid, uniform scale 1", () => {
    const v = validateMetricTransform(mat4Identity(), REF);
    expect(v.valid).toBe(true);
    expect(v.issues).toEqual([]);
    expect(v.measured.uniformScale).toBeCloseTo(1, 12);
    expect(v.measured.determinant).toBeCloseTo(1, 12);
    expect(v.measured.maxShearSin).toBeCloseTo(0, 12);
  });

  test("uniform scale 2 (in wide range) → valid with measured scale 2", () => {
    const t = mat4Scale(2, 2, 2);
    const v = validateMetricTransform(t, WIDE_REF);
    expect(v.valid).toBe(true);
    expect(v.measured.scaleFactors).toEqual([2, 2, 2]);
    expect(v.measured.uniformScale).toBeCloseTo(2, 12);
    expect(v.measured.determinant).toBeCloseTo(8, 12);
  });

  test("uniform scale 2 OUTSIDE the strict range → SCALE_OUT_OF_RANGE", () => {
    const v = validateMetricTransform(mat4Scale(2, 2, 2), REF);
    expect(v.valid).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain("SCALE_OUT_OF_RANGE");
  });

  test("non-uniform scale (2,2,2.5) → NON_UNIFORM_SCALE", () => {
    const v = validateMetricTransform(mat4Scale(2, 2, 2.5), WIDE_REF);
    expect(v.valid).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain("NON_UNIFORM_SCALE");
    expect(v.measured.scaleFactors).toEqual([2, 2, 2.5]);
  });

  test("reflection (mirror in x) → REFLECTION", () => {
    const v = validateMetricTransform(mat4Scale(-1, 1, 1), WIDE_REF);
    expect(v.valid).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain("REFLECTION");
    expect(v.measured.determinant).toBeCloseTo(-1, 12);
  });

  test("singular (collapsed axis) → SINGULAR", () => {
    const v = validateMetricTransform(mat4Scale(1, 1, 0), WIDE_REF);
    expect(v.valid).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain("SINGULAR");
    expect(Math.abs(v.measured.determinant)).toBeLessThan(1e-12);
  });

  test("shear → EXCESS_SHEAR (with the measured sine, not the raw coefficient)", () => {
    // Classic shear: x-axis pushed by y. The shear SINE is the normalized
    // dot product 0.2/√(1.04) ≈ 0.1961 — not the raw 0.2 coefficient.
    const t: Mat4 = [
      [1, 0.2, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    const v = validateMetricTransform(t, WIDE_REF);
    expect(v.valid).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain("EXCESS_SHEAR");
    expect(v.measured.maxShearSin).toBeCloseTo(0.2 / Math.sqrt(1.04), 12);
  });

  test("non-affine bottom row → NON_AFFINE", () => {
    const t = mat4Identity();
    const bad: Mat4 = [
      t[0],
      t[1],
      t[2],
      [0.01, 0, 0, 1],
    ];
    const v = validateMetricTransform(bad, WIDE_REF);
    expect(v.valid).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain("NON_AFFINE");
  });

  test("translation is irrelevant to the linear verdict (affine)", () => {
    const v = validateMetricTransform(
      mat4Multiply(mat4Translation([100, -200, 3]), mat4Identity()),
      REF,
    );
    expect(v.valid).toBe(true);
  });

  test("rotation remains valid (orthonormal, det=1)", () => {
    const v = validateMetricTransform(mat4RotationX(0.7), REF);
    expect(v.valid).toBe(true);
    expect(v.measured.determinant).toBeCloseTo(1, 12);
  });

  test("invalid reference range → INVALID_INPUT (fail closed)", () => {
    try {
      validateMetricTransform(mat4Identity(), { expectedScaleWithin: [0, 1] as const });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GeometryError);
      expect((error as GeometryError).code).toBe("INVALID_INPUT");
    }
  });
});

describe("validateMetricTransform MUTATION/DISCRIMINATION (critical-work duty)", () => {
  test("MUTATION 1: flipping one matrix element flips uniform→non-uniform", () => {
    const uniform = mat4Scale(2, 2, 2);
    const nonUniform = mat4Scale(2, 2, 2.0001);
    expect(validateMetricTransform(uniform, WIDE_REF).valid).toBe(true);
    const v = validateMetricTransform(nonUniform, WIDE_REF);
    expect(v.valid).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain("NON_UNIFORM_SCALE");
  });

  test("MUTATION 2: flipping one sign flips valid→reflection", () => {
    const right = mat4Scale(1, 1, 1);
    const mirrored = mat4Scale(1, 1, -1);
    expect(validateMetricTransform(right, REF).valid).toBe(true);
    const v = validateMetricTransform(mirrored, REF);
    expect(v.valid).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain("REFLECTION");
  });

  test("MUTATION 3: shrinking one axis to (near) zero flips valid→singular", () => {
    // Uniform tiny scale is valid within its own range; collapsing ONE axis
    // to near-zero flips the verdict to SINGULAR (rank deficiency).
    const ok = mat4Scale(1e-3, 1e-3, 1e-3);
    expect(validateMetricTransform(ok, { expectedScaleWithin: [1e-4, 1e-2] as const }).valid).toBe(true);
    const collapsed = mat4Scale(1, 1, 1e-14);
    const v = validateMetricTransform(collapsed, { expectedScaleWithin: [1e-15, 2] as const });
    expect(v.valid).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain("SINGULAR");
  });

  test("DISCRIMINATION: issue order is the documented fixed order", () => {
    // A matrix that is simultaneously reflected, non-uniform and sheared
    // reports issues in the documented check order (stable finding codes):
    // NON_AFFINE → SINGULAR → REFLECTION → NON_UNIFORM_SCALE →
    // SCALE_OUT_OF_RANGE → EXCESS_SHEAR.
    const messy: Mat4 = [
      [2, 0.3, 0, 0],
      [0, 1, 0, 0],
      [0, 0, -2.5, 0],
      [0, 0, 0, 1],
    ];
    const v = validateMetricTransform(messy, WIDE_REF);
    const codes: string[] = v.issues.map((i) => String(i.code));
    const position = (code: string): number => codes.indexOf(code);
    expect(position("NON_UNIFORM_SCALE")).toBeGreaterThanOrEqual(0);
    expect(position("REFLECTION")).toBeGreaterThanOrEqual(0);
    expect(position("REFLECTION")).toBeLessThan(position("NON_UNIFORM_SCALE"));
    expect(position("EXCESS_SHEAR")).toBeGreaterThan(position("NON_UNIFORM_SCALE"));
    // …and codes are unique.
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("applyTransform", () => {
  test("translation moves points", () => {
    const out = applyTransform(mat4Translation([10, 20, 30]), [
      [1, 2, 3],
      [0, 0, 0],
    ]);
    expect(out[0]).toEqual([11, 22, 33]);
    expect(out[1]).toEqual([10, 20, 30]);
  });

  test("rotation z by 90° maps x→y", () => {
    const out = applyTransform(mat4RotationZ(Math.PI / 2), [[1, 0, 0]]);
    const p = out[0]!;
    expect(p[0]).toBeCloseTo(0, 12);
    expect(p[1]).toBeCloseTo(1, 12);
    expect(p[2]).toBeCloseTo(0, 12);
  });

  test("input points are never mutated (purity)", () => {
    const points: Vec3[] = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const snapshot = JSON.stringify(points);
    applyTransform(mat4Scale(2, 3, 4), points);
    expect(JSON.stringify(points)).toBe(snapshot);
  });

  test("composition: translate·rotate == rotate then translate", () => {
    const composed = mat4Multiply(mat4Translation([5, 0, 0]), mat4RotationZ(Math.PI / 2));
    const viaComposed = applyTransform(composed, [[1, 0, 0]]);
    const stepwise = applyTransform(mat4Translation([5, 0, 0]), applyTransform(mat4RotationZ(Math.PI / 2), [[1, 0, 0]]));
    expect(viaComposed[0]).toEqual(stepwise[0]);
  });
});
