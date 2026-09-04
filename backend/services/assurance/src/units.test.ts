import { describe, expect, it } from "vitest";
import { EngineeringModelError } from "@aise/engineering-model";
import { siBaseUnitOf, toSiFactor, toSiValue } from "./units.js";

describe("exact SI conversion factors", () => {
  it("length factors are exact by definition", () => {
    expect(toSiFactor("meter")).toBe(1);
    expect(toSiFactor("millimeter")).toBe(1e-3);
    expect(toSiFactor("centimeter")).toBe(1e-2);
    expect(toSiFactor("inch")).toBe(0.0254);
    expect(toSiFactor("foot")).toBe(0.3048);
  });

  it("area factors are the exact squares", () => {
    expect(toSiFactor("square_meter")).toBe(1);
    expect(toSiFactor("square_millimeter")).toBe(1e-6);
    expect(toSiFactor("square_centimeter")).toBe(1e-4);
    expect(toSiFactor("square_inch")).toBe(0.0254 * 0.0254);
    expect(toSiFactor("square_foot")).toBe(0.3048 * 0.3048);
  });

  it("angle factors are the exact transcendental definitions", () => {
    expect(toSiFactor("radian")).toBe(1);
    expect(toSiFactor("degree")).toBe(Math.PI / 180);
    expect(toSiFactor("gon")).toBe(Math.PI / 200);
    // 180° is exactly π radians.
    expect(180 * toSiFactor("degree")).toBeCloseTo(Math.PI, 15);
    // 400 gon is exactly a full turn (1 gon = 1/400 circle).
    expect(400 * toSiFactor("gon")).toBeCloseTo(2 * Math.PI, 14);
  });

  it("converts values deterministically", () => {
    expect(toSiValue(1000, "millimeter")).toBe(1);
    expect(toSiValue(1, "foot")).toBe(0.3048);
    expect(toSiValue(90, "degree")).toBeCloseTo(Math.PI / 2, 15);
    expect(toSiValue(2.5, "centimeter")).toBe(0.025);
  });

  it("round-trips through the factor (float identity)", () => {
    for (const unit of ["meter", "millimeter", "centimeter", "inch", "foot"] as const) {
      const value = 3.7;
      const si = toSiValue(value, unit);
      // Back-conversion is division by the same exact factor.
      expect(si / toSiFactor(unit)).toBeCloseTo(value, 12);
    }
  });

  it("siBaseUnitOf maps families to their SI base units", () => {
    expect(siBaseUnitOf("length")).toBe("meter");
    expect(siBaseUnitOf("area")).toBe("square_meter");
    expect(siBaseUnitOf("angle")).toBe("radian");
  });

  it("fails closed on units outside the model vocabulary", () => {
    expect(() => toSiFactor("cubit" as never)).toThrowError(EngineeringModelError);
    expect(() => toSiValue(1, "furlong" as never)).toThrowError(EngineeringModelError);
  });
});
