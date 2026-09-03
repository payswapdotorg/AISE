/**
 * Input validation tests (AISE-010).
 *
 * Finite-value discipline, unit vocabulary, up-axis normalization —
 * all failing closed as SemanticsError at the package boundary.
 */
import { describe, expect, it } from "vitest";
import {
  assertFiniteNumber,
  assertLengthUnit,
  assertNonNegativeNumber,
  assertPositiveInteger,
  assertPositiveNumber,
  normalizeUpAxis,
} from "./validate.js";
import { toSemanticsError } from "./errors.js";

const UP = { x: 0, y: 0, z: 1 };

describe("assertLengthUnit", () => {
  it.each(["meter", "millimeter", "centimeter", "inch", "foot"])("accepts %s", (unit) => {
    expect(assertLengthUnit(unit)).toBe(unit);
  });

  it("rejects unknown units with VALIDATION_FAILED and the allowed list", () => {
    for (const bad of ["furlong", "", "meters", 3, null, undefined]) {
      const error = capture(() => assertLengthUnit(bad));
      expect(error?.code).toBe("VALIDATION_FAILED");
      expect(error?.details.allowed).toContain("meter");
    }
  });
});

describe("assertFiniteNumber", () => {
  it("accepts finite numbers and returns them", () => {
    expect(assertFiniteNumber(0, "x")).toBe(0);
    expect(assertFiniteNumber(-2.5e-9, "x")).toBe(-2.5e-9);
  });

  it("rejects NaN, ±Infinity, and non-numbers with NON_FINITE_INPUT", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "1", null, undefined]) {
      const error = capture(() => assertFiniteNumber(bad, "coord"));
      expect(error?.code).toBe("NON_FINITE_INPUT");
      expect(error?.details.label).toBe("coord");
    }
  });
});

describe("assertPositiveInteger", () => {
  it("accepts positive integers", () => {
    expect(assertPositiveInteger(1, "n")).toBe(1);
    expect(assertPositiveInteger(1000, "n")).toBe(1000);
  });

  it("rejects zero, negatives, fractions, and non-integers", () => {
    for (const bad of [0, -1, 2.5, Number.NaN, "3", null]) {
      const error = capture(() => assertPositiveInteger(bad, "count"));
      expect(error?.code).toBe("VALIDATION_FAILED");
    }
  });
});

describe("assertPositiveNumber", () => {
  it("accepts positive finite numbers", () => {
    expect(assertPositiveNumber(0.03, "tol")).toBe(0.03);
  });

  it("rejects zero, negative, non-finite, and non-numbers", () => {
    for (const bad of [0, -0.001, Number.POSITIVE_INFINITY, Number.NaN, "x"]) {
      const error = capture(() => assertPositiveNumber(bad, "tol"));
      expect(error?.code).toBe("VALIDATION_FAILED");
    }
  });
});

describe("assertNonNegativeNumber", () => {
  it("accepts zero and positive finite numbers", () => {
    expect(assertNonNegativeNumber(0, "x")).toBe(0);
    expect(assertNonNegativeNumber(4, "x")).toBe(4);
  });

  it("rejects negatives and non-finite values", () => {
    for (const bad of [-1e-12, Number.NaN, null]) {
      const error = capture(() => assertNonNegativeNumber(bad, "x"));
      expect(error?.code).toBe("VALIDATION_FAILED");
    }
  });
});

describe("normalizeUpAxis", () => {
  it("normalizes a non-unit vector to length 1 (same direction)", () => {
    const up = normalizeUpAxis({ x: 0, y: 0, z: 7.25 });
    expect(up.z).toBeCloseTo(1, 12);
    expect(up.x).toBeCloseTo(0, 12);
    expect(up.y).toBeCloseTo(0, 12);
  });

  it("accepts arbitrary non-axis directions", () => {
    const up = normalizeUpAxis({ x: 1, y: 1, z: 1 });
    const norm = Math.hypot(up.x, up.y, up.z);
    expect(norm).toBeCloseTo(1, 12);
  });

  it("rejects the zero vector with DEGENERATE_GEOMETRY (no guessed up axis)", () => {
    const error = capture(() => normalizeUpAxis({ x: 0, y: 0, z: 0 }));
    expect(error?.code).toBe("DEGENERATE_GEOMETRY");
    expect(JSON.stringify(error?.details.up)).toContain("0");
  });

  it("rejects non-finite components with DEGENERATE_GEOMETRY", () => {
    const error = capture(() => normalizeUpAxis({ x: Number.NaN, y: 0, z: 1 }));
    expect(error?.code).toBe("DEGENERATE_GEOMETRY");
  });

  it("is a pure function (idempotent)", () => {
    const once = normalizeUpAxis({ x: 3, y: 4, z: 0 });
    const twice = normalizeUpAxis(once);
    expect(twice.x).toBeCloseTo(once.x, 12);
    expect(twice.y).toBeCloseTo(once.y, 12);
    expect(twice.z).toBeCloseTo(once.z, 12);
  });
});

/** Captures a SemanticsError from a throwing callback. */
function capture(fn: () => unknown): ReturnType<typeof toSemanticsError> {
  try {
    fn();
  } catch (error) {
    const semantics = toSemanticsError(error);
    expect(semantics, "expected a SemanticsError").not.toBeNull();
    return semantics;
  }
  throw new Error("expected the call to throw");
}

void UP;
