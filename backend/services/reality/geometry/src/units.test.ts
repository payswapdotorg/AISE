/**
 * Units tests (AISE-009): explicit units, exact conversion factors,
 * fail-closed mismatch and validation.
 */
import { describe, expect, it } from "vitest";
import {
  angleToRadianFactor,
  convertAngle,
  convertLength,
  lengthToMeterFactor,
  requireSameUnit,
} from "./units.js";
import { GeometryError } from "./errors.js";

describe("length unit conversion", () => {
  it("converts between length units with exact factors", () => {
    expect(convertLength(1, "meter", "millimeter")).toBe(1000);
    expect(convertLength(100, "centimeter", "meter")).toBe(1);
    expect(convertLength(1, "inch", "millimeter")).toBeCloseTo(25.4, 12);
    expect(convertLength(1, "foot", "meter")).toBeCloseTo(0.3048, 12);
    expect(convertLength(0.3048, "meter", "foot")).toBeCloseTo(1, 12);
  });

  it("is exact for identity conversions", () => {
    expect(convertLength(123.456, "meter", "meter")).toBe(123.456);
  });

  it("round-trips within 1 ulp for representative values", () => {
    const value = 3.7;
    const there = convertLength(value, "meter", "inch");
    const back = convertLength(there, "inch", "meter");
    expect(Math.abs(back - value)).toBeLessThanOrEqual(1e-15);
  });

  it("exposes the exact canonical factors", () => {
    expect(lengthToMeterFactor("millimeter")).toBe(1e-3);
    expect(lengthToMeterFactor("centimeter")).toBe(1e-2);
    expect(lengthToMeterFactor("inch")).toBe(0.0254);
    expect(lengthToMeterFactor("foot")).toBe(0.3048);
    expect(lengthToMeterFactor("meter")).toBe(1);
  });
});

describe("angle unit conversion", () => {
  it("converts radians/degrees/gon exactly per definition", () => {
    expect(convertAngle(Math.PI, "radian", "degree")).toBeCloseTo(180, 12);
    expect(convertAngle(180, "degree", "radian")).toBeCloseTo(Math.PI, 12);
    expect(convertAngle(200, "gon", "degree")).toBeCloseTo(180, 12);
    expect(convertAngle(Math.PI / 2, "radian", "gon")).toBeCloseTo(100, 12);
    expect(angleToRadianFactor("gon")).toBeCloseTo(Math.PI / 200, 15);
  });
});

describe("fail-closed unit discipline", () => {
  it("rejects non-finite values in conversion", () => {
    expect(() => convertLength(Number.NaN, "meter", "foot")).toThrow(GeometryError);
    expect(() => convertLength(Number.POSITIVE_INFINITY, "meter", "foot")).toThrow(GeometryError);
    expect(() => convertAngle(Number.NaN, "degree", "radian")).toThrow(GeometryError);
  });

  it("requireSameUnit fails closed on mismatch", () => {
    expect(() => requireSameUnit("meter", "foot")).toThrow(GeometryError);
    try {
      requireSameUnit("millimeter", "inch");
    } catch (error) {
      const geometryError = error as GeometryError;
      expect(geometryError.code).toBe("MISMATCHED_UNITS");
      expect(geometryError.retryable).toBe(false);
    }
    expect(() => requireSameUnit("meter", "meter")).not.toThrow();
  });

  it("rejects unknown units at runtime (untrusted input)", async () => {
    const { assertLengthUnit, assertAngleUnit } = await import("./units.js");
    expect(() => assertLengthUnit("furlong")).toThrow(GeometryError);
    expect(() => assertAngleUnit("gradian")).toThrow(GeometryError);
    expect(assertLengthUnit("meter")).toBe("meter");
    expect(assertAngleUnit("degree")).toBe("degree");
  });
});
