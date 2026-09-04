import { describe, expect, it } from "vitest";
import {
  ANGLE_UNITS,
  AREA_SI_FACTORS,
  LENGTH_SI_FACTORS,
  areaToSiSquareMeters,
  formatQuantity,
  lengthToSiMeters,
  qaUnitFamily,
  squareOfLengthUnit,
} from "./units.js";
import { ModelQaError } from "./errors.js";
import { unitFamily } from "@aise/engineering-model";

describe("exact SI factors (the model's own unit vocabulary)", () => {
  it("length factors are exact by definition", () => {
    expect(LENGTH_SI_FACTORS.millimeter).toBe(0.001);
    expect(LENGTH_SI_FACTORS.centimeter).toBe(0.01);
    expect(LENGTH_SI_FACTORS.inch).toBe(0.0254);
    expect(LENGTH_SI_FACTORS.foot).toBe(0.3048);
    expect(LENGTH_SI_FACTORS.meter).toBe(1);
  });

  it("area factors are the exact products of their length factors", () => {
    expect(AREA_SI_FACTORS.square_millimeter).toBe(0.001 * 0.001);
    expect(AREA_SI_FACTORS.square_centimeter).toBe(0.01 * 0.01);
    expect(AREA_SI_FACTORS.square_inch).toBe(0.0254 * 0.0254);
    expect(AREA_SI_FACTORS.square_foot).toBe(0.3048 * 0.3048);
    expect(AREA_SI_FACTORS.square_meter).toBe(1);
  });

  it("conversions round-trip through the factors", () => {
    for (const unit of Object.keys(LENGTH_SI_FACTORS) as Array<keyof typeof LENGTH_SI_FACTORS>) {
      const si = lengthToSiMeters(5, unit);
      const back = si / LENGTH_SI_FACTORS[unit];
      expect(back).toBe(5);
    }
    for (const unit of Object.keys(AREA_SI_FACTORS) as Array<keyof typeof AREA_SI_FACTORS>) {
      const si = areaToSiSquareMeters(5, unit);
      const back = si / AREA_SI_FACTORS[unit];
      expect(back).toBe(5);
    }
  });

  it("the unit vocabulary matches the engineering model's exactly (no alternate vocabulary)", () => {
    for (const unit of Object.keys(LENGTH_SI_FACTORS)) {
      expect(unitFamily(unit as never)).toBe("length");
    }
    for (const unit of Object.keys(AREA_SI_FACTORS)) {
      expect(unitFamily(unit as never)).toBe("area");
    }
    for (const unit of ANGLE_UNITS) {
      expect(unitFamily(unit as never)).toBe("angle");
    }
  });

  it("family classification agrees with the model's classification", () => {
    const allUnits = [
      ...Object.keys(LENGTH_SI_FACTORS),
      ...Object.keys(AREA_SI_FACTORS),
      ...ANGLE_UNITS,
    ];
    for (const unit of allUnits) {
      expect(qaUnitFamily(unit as never)).toBe(unitFamily(unit as never));
    }
  });

  it("length conversion fails closed on non-length units", () => {
    expect(() => lengthToSiMeters(1, "square_meter")).toThrow(ModelQaError);
    expect(() => lengthToSiMeters(1, "radian")).toThrow(ModelQaError);
  });

  it("area conversion fails closed on non-area units", () => {
    expect(() => areaToSiSquareMeters(1, "meter")).toThrow(ModelQaError);
    expect(() => areaToSiSquareMeters(1, "degree")).toThrow(ModelQaError);
  });

  it("family classification fails closed on unknown units", () => {
    expect(() => qaUnitFamily("cubit" as never)).toThrow(ModelQaError);
  });

  it("squareOfLengthUnit pairs each length with its square", () => {
    expect(squareOfLengthUnit("meter")).toBe("square_meter");
    expect(squareOfLengthUnit("millimeter")).toBe("square_millimeter");
    expect(squareOfLengthUnit("centimeter")).toBe("square_centimeter");
    expect(squareOfLengthUnit("inch")).toBe("square_inch");
    expect(squareOfLengthUnit("foot")).toBe("square_foot");
    expect(() => squareOfLengthUnit("radian")).toThrow(ModelQaError);
  });

  it("formatQuantity renders deterministically", () => {
    expect(formatQuantity(12, "square_meter")).toBe("12 square_meter");
    expect(formatQuantity(10.399999999999995, "square_meter")).toBe("10.4 square_meter");
    expect(formatQuantity(2.7000000000002307, "meter")).toBe("2.7 meter");
  });
});
