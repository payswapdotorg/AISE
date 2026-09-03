/**
 * Uncertainty tests (AISE-009): the three distinct representations,
 * the confidence-must-never-substitute invariant, fail-closed
 * tolerance semantics, and propagation.
 */
import { describe, expect, it } from "vitest";
import {
  combineStandard,
  convertMeasurement,
  rssStandard,
  scaleStandard,
  scaleUncertaintyRecord,
  toStandardUncertainty,
  validateUncertainty,
  type Measurement,
} from "./uncertainty.js";
import { GeometryError } from "./errors.js";

describe("uncertainty validation (fail closed)", () => {
  it("rejects negative standard uncertainty", () => {
    expect(() => validateUncertainty({ kind: "standard", u: -0.1 })).toThrow(GeometryError);
    expect(() => validateUncertainty({ kind: "standard", u: Number.NaN })).toThrow(GeometryError);
  });

  it("rejects coverage factors below 1", () => {
    expect(() => validateUncertainty({ kind: "expanded", U: 1, coverageFactor: 0.95 })).toThrow(GeometryError);
    expect(() => validateUncertainty({ kind: "expanded", U: 1, coverageFactor: Number.NaN })).toThrow(GeometryError);
    expect(validateUncertainty({ kind: "expanded", U: 2, coverageFactor: 2 })).toEqual({
      kind: "expanded",
      U: 2,
      coverageFactor: 2,
    });
  });

  it("rejects tolerance bounds that do not bracket the nominal", () => {
    expect(() => validateUncertainty({ kind: "tolerance", lowerOffset: 0.1, upperOffset: 0.2 })).toThrow(GeometryError);
    expect(() => validateUncertainty({ kind: "tolerance", lowerOffset: -0.2, upperOffset: -0.1 })).toThrow(GeometryError);
    expect(() => validateUncertainty({ kind: "tolerance", lowerOffset: -0.1, upperOffset: 0.1 })).not.toThrow();
  });
});

describe("confidence never substitutes for uncertainty", () => {
  it("no uncertainty representation carries a confidence field", () => {
    const representations = [
      { kind: "standard", u: 0.1 },
      { kind: "expanded", U: 0.2, coverageFactor: 2 },
      { kind: "tolerance", lowerOffset: -0.1, upperOffset: 0.1 },
    ] as const;
    for (const representation of representations) {
      expect(JSON.stringify(representation)).not.toContain("confidence");
      expect(Object.keys(representation)).not.toContain("confidence");
    }
  });

  it("a tolerance is NOT a statistical uncertainty and cannot be converted to one", () => {
    try {
      toStandardUncertainty({ kind: "tolerance", lowerOffset: -0.1, upperOffset: 0.1 });
      expect.unreachable("tolerance→standard conversion must fail closed");
    } catch (error) {
      const geometryError = error as GeometryError;
      expect(geometryError.code).toBe("UNCERTAINTY_INVALID");
    }
  });
});

describe("toStandardUncertainty", () => {
  it("passes standard through", () => {
    expect(toStandardUncertainty({ kind: "standard", u: 0.25 })).toBe(0.25);
  });

  it("divides expanded by its coverage factor", () => {
    expect(toStandardUncertainty({ kind: "expanded", U: 0.4, coverageFactor: 2 })).toBeCloseTo(0.2, 15);
    expect(toStandardUncertainty({ kind: "expanded", U: 0.99, coverageFactor: 3 })).toBeCloseTo(0.33, 15);
  });
});

describe("propagation", () => {
  it("combines independent standard uncertainties by RSS", () => {
    expect(combineStandard(3, 4)).toBeCloseTo(5, 12);
    expect(combineStandard(0, 5)).toBe(5);
  });

  it("combines with explicit correlation", () => {
    expect(combineStandard(3, 4, 1)).toBeCloseTo(7, 12);
    expect(combineStandard(3, 4, -1)).toBeCloseTo(1, 12);
  });

  it("rejects invalid correlation coefficients", () => {
    expect(() => combineStandard(1, 1, 1.5)).toThrow(GeometryError);
    expect(() => combineStandard(1, 1, -1.5)).toThrow(GeometryError);
    expect(() => combineStandard(-1, 1)).toThrow(GeometryError);
  });

  it("RSS over lists rejects empty lists and negative entries", () => {
    expect(() => rssStandard([])).toThrow(GeometryError);
    expect(() => rssStandard([1, -1])).toThrow(GeometryError);
    expect(rssStandard([3, 4])).toBeCloseTo(5, 12);
  });

  it("scales standard uncertainties", () => {
    expect(scaleStandard(0.5, 2)).toBe(1);
    expect(() => scaleStandard(0.5, -2)).toThrow(GeometryError);
  });

  it("scales every representation field", () => {
    expect(scaleUncertaintyRecord({ kind: "standard", u: 2 }, 0.5)).toEqual({ kind: "standard", u: 1 });
    expect(scaleUncertaintyRecord({ kind: "expanded", U: 4, coverageFactor: 2 }, 0.5)).toEqual({
      kind: "expanded",
      U: 2,
      coverageFactor: 2,
    });
    expect(
      scaleUncertaintyRecord({ kind: "tolerance", lowerOffset: -2, upperOffset: 4 }, 0.5),
    ).toEqual({ kind: "tolerance", lowerOffset: -1, upperOffset: 2 });
  });
});

describe("measurement conversion carries uncertainty", () => {
  it("converts value and uncertainty together within a family", () => {
    const measurement: Measurement = {
      value: 1,
      unit: "meter",
      uncertainty: { kind: "standard", u: 0.01 },
    };
    const converted = convertMeasurement(measurement, "millimeter");
    expect(converted.value).toBeCloseTo(1000, 12);
    expect(converted.uncertainty).toEqual({ kind: "standard", u: 10 });
    expect(converted.unit).toBe("millimeter");
  });

  it("keeps absent uncertainty absent (never zero)", () => {
    const measurement: Measurement = { value: 2, unit: "meter" };
    const converted = convertMeasurement(measurement, "foot");
    expect(converted.value).toBeCloseTo(2 / 0.3048, 12);
    expect(converted.uncertainty).toBeUndefined();
  });

  it("fails closed across unit families", () => {
    const angle: Measurement = { value: Math.PI, unit: "radian" };
    expect(() => convertMeasurement(angle, "meter")).toThrow(GeometryError);
    const length: Measurement = { value: 1, unit: "meter" };
    expect(() => convertMeasurement(length, "degree")).toThrow(GeometryError);
  });

  it("converts angles to degrees", () => {
    const angle: Measurement = { value: Math.PI / 2, unit: "radian" };
    const converted = convertMeasurement(angle, "degree");
    expect(converted.value).toBeCloseTo(90, 12);
  });
});
