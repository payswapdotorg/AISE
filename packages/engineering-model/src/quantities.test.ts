/**
 * Quantity vocabulary tests: units, families, uncertainty
 * representations, and the estimate/measurement distinction.
 */
import { describe, expect, it } from "vitest";
import { EngineeringModelError } from "./errors.js";
import {
  assertSameUnitFamily,
  assertValidUnit,
  quantityMayBeMeasurement,
  unitFamily,
  validateQuantity,
  validateUncertainty,
} from "./quantities.js";

describe("unit vocabulary", () => {
  it("accepts the length, area, and angle vocabulary", () => {
    for (const unit of [
      "meter",
      "millimeter",
      "centimeter",
      "inch",
      "foot",
      "square_meter",
      "square_foot",
      "radian",
      "degree",
      "gon",
    ] as const) {
      expect(() => assertValidUnit(unit, "test")).not.toThrow();
    }
  });

  it("rejects unknown units", () => {
    expect(() => assertValidUnit("meters" as never, "test")).toThrow(EngineeringModelError);
    expect(() => assertValidUnit("yards" as never, "test")).toThrow(EngineeringModelError);
  });

  it("classifies families", () => {
    expect(unitFamily("meter")).toBe("length");
    expect(unitFamily("square_meter")).toBe("area");
    expect(unitFamily("degree")).toBe("angle");
  });

  it("fails closed on family mismatch", () => {
    expect(() => assertSameUnitFamily("meter", "square_meter", "ctx")).toThrow(EngineeringModelError);
    expect(() => assertSameUnitFamily("meter", "degree", "ctx")).toThrow(EngineeringModelError);
    expect(() => assertSameUnitFamily("meter", "foot", "ctx")).not.toThrow();
  });
});

describe("uncertainty validation", () => {
  it("accepts standard uncertainty with u ≥ 0", () => {
    expect(() => validateUncertainty({ kind: "standard", u: 0.01 }, "u")).not.toThrow();
    expect(() => validateUncertainty({ kind: "standard", u: 0 }, "u")).not.toThrow();
  });

  it("rejects negative or non-finite standard uncertainty", () => {
    expect(() => validateUncertainty({ kind: "standard", u: -0.01 }, "u")).toThrow(EngineeringModelError);
    expect(() => validateUncertainty({ kind: "standard", u: Number.NaN }, "u")).toThrow(EngineeringModelError);
  });

  it("accepts expanded uncertainty with k ≥ 1", () => {
    expect(() =>
      validateUncertainty({ kind: "expanded", U: 0.05, coverageFactor: 2 }, "u"),
    ).not.toThrow();
    expect(() =>
      validateUncertainty({ kind: "expanded", U: 0.05, coverageFactor: 1 }, "u"),
    ).not.toThrow();
  });

  it("rejects expanded uncertainty with k < 1 or non-finite", () => {
    expect(() =>
      validateUncertainty({ kind: "expanded", U: 0.05, coverageFactor: 0.95 }, "u"),
    ).toThrow(EngineeringModelError);
    expect(() =>
      validateUncertainty({ kind: "expanded", U: -1, coverageFactor: 2 }, "u"),
    ).toThrow(EngineeringModelError);
  });

  it("accepts tolerance with lower ≤ 0 ≤ upper", () => {
    expect(() =>
      validateUncertainty({ kind: "tolerance", lowerOffset: -0.01, upperOffset: 0.01 }, "u"),
    ).not.toThrow();
    expect(() =>
      validateUncertainty({ kind: "tolerance", lowerOffset: 0, upperOffset: 0.01 }, "u"),
    ).not.toThrow();
  });

  it("rejects tolerances that do not straddle zero", () => {
    expect(() =>
      validateUncertainty({ kind: "tolerance", lowerOffset: 0.01, upperOffset: 0.02 }, "u"),
    ).toThrow(EngineeringModelError);
    expect(() =>
      validateUncertainty({ kind: "tolerance", lowerOffset: -0.02, upperOffset: -0.01 }, "u"),
    ).toThrow(EngineeringModelError);
  });

  it("rejects unknown uncertainty kinds (runtime guard)", () => {
    expect(() =>
      validateUncertainty({ kind: "confidence" } as never, "u"),
    ).toThrow(EngineeringModelError);
  });
});

describe("quantity validation", () => {
  it("accepts a finite value with a valid unit and optional uncertainty", () => {
    expect(() => validateQuantity({ value: 3.2, unit: "meter" }, "q")).not.toThrow();
    expect(() =>
      validateQuantity({ value: 3.2, unit: "meter", uncertainty: { kind: "standard", u: 0.1 } }, "q"),
    ).not.toThrow();
  });

  it("rejects non-finite values and invalid units/uncertainty", () => {
    expect(() => validateQuantity({ value: Number.POSITIVE_INFINITY, unit: "meter" }, "q")).toThrow(
      EngineeringModelError,
    );
    expect(() => validateQuantity({ value: 1, unit: "cubit" as never }, "q")).toThrow(
      EngineeringModelError,
    );
    expect(() =>
      validateQuantity({ value: 1, unit: "meter", uncertainty: { kind: "standard", u: -1 } }, "q"),
    ).toThrow(EngineeringModelError);
  });

  it("keeps absent uncertainty absent (never zero-filled)", () => {
    const validated = validateQuantity({ value: 1, unit: "meter" }, "q");
    expect(validated.uncertainty).toBeUndefined();
  });
});

describe("the estimate/measurement distinction (AC-072)", () => {
  it("allows measurement only for directly-supported states", () => {
    expect(quantityMayBeMeasurement("OBSERVED")).toBe(true);
    expect(quantityMayBeMeasurement("CONFIRMED")).toBe(true);
    expect(quantityMayBeMeasurement("INFERRED")).toBe(false);
    expect(quantityMayBeMeasurement("PROPOSED")).toBe(false);
  });
});
