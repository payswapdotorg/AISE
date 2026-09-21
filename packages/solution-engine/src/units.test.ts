/**
 * Deterministic unit-handling tests (PROD-022).
 *
 * Proves the unit vocabulary discipline: exact conversions (powers of ten),
 * unknown units and dimension mismatches fail closed with typed failures,
 * counts are dimensionless, and the canonical output units follow the
 * contract's QuantityDimension vocabulary.
 */

import { describe, expect, test } from "bun:test";
import {
  CANONICAL_QUANTITY_UNITS,
  UNIT_VOCABULARY,
  resolveNumericParameter,
  roundFloat,
  roundUp,
} from "./units";

describe("the unit vocabulary (frozen reference data)", () => {
  test("the vocabulary is frozen and covers the Phase 1 building units", () => {
    expect(Object.isFrozen(UNIT_VOCABULARY)).toBe(true);
    for (const unit of ["m", "cm", "mm", "m2", "m3", "l", "count", "kg", "rad"]) {
      expect(UNIT_VOCABULARY[unit]).toBeDefined();
    }
  });

  test("canonical quantity units follow the contract's QuantityDimension vocabulary", () => {
    expect(Object.keys(CANONICAL_QUANTITY_UNITS)).toHaveLength(6);
    expect(CANONICAL_QUANTITY_UNITS.area).toBe("m2");
    expect(CANONICAL_QUANTITY_UNITS.volume).toBe("m3");
    expect(CANONICAL_QUANTITY_UNITS.length).toBe("m");
    expect(CANONICAL_QUANTITY_UNITS.count).toBe("count");
    expect(CANONICAL_QUANTITY_UNITS.mass).toBe("kg");
    expect(CANONICAL_QUANTITY_UNITS.duration).toBe("s");
  });
});

describe("numeric parameter resolution (exact, deterministic, fail closed)", () => {
  test("a linear parameter in m resolves to the canonical unit", () => {
    const resolved = resolveNumericParameter(
      { name: "depth", value: 1.5, unit: "m" },
      "linear",
    );
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.resolved.canonicalValue).toBe(1.5);
      expect(resolved.resolved.originalUnit).toBe("m");
      expect(resolved.resolved.dimension).toBe("linear");
    }
  });

  test("mm and cm convert exactly (powers of ten, no float drift)", () => {
    const mm = resolveNumericParameter({ name: "thickness", value: 30, unit: "mm" }, "linear");
    const cm = resolveNumericParameter({ name: "depth", value: 150, unit: "cm" }, "linear");
    expect(mm.ok && mm.resolved.canonicalValue).toBe(0.03);
    expect(cm.ok && cm.resolved.canonicalValue).toBe(1.5);
  });

  test("the same input always resolves identically (determinism)", () => {
    for (let index = 0; index < 5; index += 1) {
      const resolved = resolveNumericParameter(
        { name: "width", value: 0.1, unit: "m" },
        "linear",
      );
      expect(resolved.ok && resolved.resolved.canonicalValue).toBe(0.1);
    }
  });

  test("an unknown unit fails closed with unknown_unit", () => {
    const resolved = resolveNumericParameter({ name: "depth", value: 1, unit: "furlong" }, "linear");
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.failure.code).toBe("unknown_unit");
      if (resolved.failure.code === "unknown_unit") {
        expect(resolved.failure.unit).toBe("furlong");
      }
    }
  });

  test("a missing unit on a numeric value fails closed (typed-unit discipline)", () => {
    const resolved = resolveNumericParameter({ name: "depth", value: 1 }, "linear");
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.failure.code).toBe("unknown_unit");
    }
  });

  test("a dimension mismatch fails closed with unit_dimension_mismatch", () => {
    const resolved = resolveNumericParameter({ name: "depth", value: 1, unit: "kg" }, "linear");
    expect(resolved.ok).toBe(false);
    if (!resolved.ok && "actualDimension" in resolved.failure) {
      expect(resolved.failure.code).toBe("unit_dimension_mismatch");
      expect(resolved.failure.actualDimension).toBe("mass");
      expect(resolved.failure.expectedDimension).toBe("linear");
    }
  });

  test("a mass unit fails closed in a linear slot (dimensional consistency)", () => {
    const linear = resolveNumericParameter({ name: "depth", value: 2, unit: "kg" }, "linear");
    expect(linear.ok).toBe(false);
    if (!linear.ok && "actualDimension" in linear.failure) {
      expect(linear.failure.actualDimension).toBe("mass");
    }
  });

  test("non-positive values fail closed with parameter_not_positive", () => {
    for (const value of [0, -1.5]) {
      const resolved = resolveNumericParameter({ name: "depth", value, unit: "m" }, "linear");
      expect(resolved.ok).toBe(false);
      if (!resolved.ok) {
        expect(resolved.failure.code).toBe("parameter_not_positive");
      }
    }
  });

  test("a non-numeric value fails closed with parameter_not_numeric", () => {
    const resolved = resolveNumericParameter({ name: "depth", value: "deep" }, "linear");
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.failure.code).toBe("parameter_not_numeric");
    }
  });

  test("counts resolve dimensionless and only in count slots", () => {
    const count = resolveNumericParameter({ name: "coats", value: 2, unit: "count" }, "count");
    expect(count.ok).toBe(true);
    const linear = resolveNumericParameter({ name: "depth", value: 2, unit: "count" }, "linear");
    expect(linear.ok).toBe(false);
    if (!linear.ok && "actualDimension" in linear.failure) {
      expect(linear.failure.code).toBe("unit_dimension_mismatch");
    }
  });
});

describe("deterministic numeric helpers", () => {
  test("roundFloat cleans multiplication noise without rounding significant digits", () => {
    expect(roundFloat(0.1 * 0.1)).toBe(0.01);
    expect(roundFloat(0.30000000000000004)).toBe(0.3);
    expect(roundFloat(9.0)).toBe(9);
  });

  test("roundUp rounds partial units up (whole blocks/courses)", () => {
    expect(roundUp(62.5)).toBe(63);
    expect(roundUp(12)).toBe(12);
    expect(roundUp(12.0000001)).toBe(13);
  });
});
