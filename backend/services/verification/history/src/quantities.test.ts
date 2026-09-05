import { describe, expect, it } from "vitest";
import {
  deriveQuantityDelta,
  formatQuantity,
  quantityEquals,
  uncertaintyEquals,
  checkQuantitySnapshot,
} from "./quantities.js";
import { isHistoryError } from "./errors.js";

describe("AISE-031 quantity comparison (confidence/uncertainty separation)", () => {
  it("passes quantities through verbatim — equality includes uncertainty", () => {
    expect(quantityEquals({ value: 2.7, unit: "meter" }, { value: 2.7, unit: "meter" })).toBe(true);
    expect(
      quantityEquals(
        { value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 0.01 } },
        { value: 2.7, unit: "meter" },
      ),
    ).toBe(false);
    expect(
      quantityEquals(
        { value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 0.01 } },
        { value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 0.02 } },
      ),
    ).toBe(false);
    // An uncertainty-only change IS a change (never collapsed).
    expect(
      uncertaintyEquals({ kind: "standard", u: 0.01 }, { kind: "standard", u: 0.01 }),
    ).toBe(true);
    expect(uncertaintyEquals(undefined, undefined)).toBe(true);
    expect(uncertaintyEquals({ kind: "standard", u: 0.01 }, undefined)).toBe(false);
  });

  it("derives a same-unit value delta", () => {
    const delta = deriveQuantityDelta({ value: 2.7, unit: "meter" }, { value: 2.71, unit: "meter" });
    expect(delta).toBeDefined();
    expect(delta!.value).toBeCloseTo(0.01, 12);
    expect(delta!.unit).toBe("meter");
    expect(delta!.combinedUncertainty).toBeUndefined();
  });

  it("combines uncertainties ONLY when both sides state standard uncertainties (RSS)", () => {
    const delta = deriveQuantityDelta(
      { value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 0.03 } },
      { value: 2.71, unit: "meter", uncertainty: { kind: "standard", u: 0.04 } },
    );
    expect(delta!.combinedUncertainty).toEqual({ kind: "standard", u: 0.05 });

    const oneSided = deriveQuantityDelta(
      { value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 0.03 } },
      { value: 2.71, unit: "meter" },
    );
    expect(oneSided!.combinedUncertainty).toBeUndefined();

    const expanded = deriveQuantityDelta(
      { value: 2.7, unit: "meter", uncertainty: { kind: "expanded", U: 0.06, coverageFactor: 2 } },
      { value: 2.71, unit: "meter", uncertainty: { kind: "standard", u: 0.04 } },
    );
    expect(expanded!.combinedUncertainty).toBeUndefined();
  });

  it("never derives a cross-unit delta (no conversion — reported verbatim instead)", () => {
    const delta = deriveQuantityDelta({ value: 2.7, unit: "meter" }, { value: 2700, unit: "millimeter" });
    expect(delta).toBeUndefined();
  });

  it("renders quantities deterministically (locale-independent, uncertainty explicit)", () => {
    expect(formatQuantity({ value: 2.7, unit: "meter" })).toBe(
      '2.7 meter uncertainty=unstated',
    );
    expect(formatQuantity({ value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 0.01 } })).toContain(
      '"kind":"standard"',
    );
  });

  it("fail-closed snapshot checks", () => {
    expect(() => checkQuantitySnapshot({ value: Number.NaN, unit: "meter" }, "q")).toThrow();
    try {
      checkQuantitySnapshot({ value: 1, unit: "" as unknown as "meter" }, "q");
      expect.unreachable();
    } catch (error) {
      expect(isHistoryError(error)).toBe(true);
    }
  });
});
