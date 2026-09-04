/**
 * Exact SI conversion factors for uncertainty-budget evaluation
 * (AISE-013).
 *
 * The readiness assessment compares STATED measurement
 * uncertainties against a task's declared accuracy budget. The
 * budget is declared in SI base units per quantity family
 * (meter, square meter, radian); assertions carry model units.
 * Conversion is therefore unavoidable — and must be exact and
 * deterministic.
 *
 * Factors (exact by definition, not measurement):
 *
 * - length: m = 1, mm = 10⁻³, cm = 10⁻², inch = 0.0254, foot = 0.3048
 * - area:   m² = 1, mm² = 10⁻⁶, cm² = 10⁻⁴, in² = 0.0254², ft² = 0.3048²
 * - angle:  rad = 1, degree = π/180, gon = π/200
 *
 * These mirror the AISE-009 geometry unit discipline (explicit
 * families, exact factors) against the engineering-model unit
 * vocabulary. They are package-local for the same reason the
 * engineering-model keeps its own table: the canonical model may
 * not depend on a backend service, and this service keeps its
 * evaluation surface self-contained and reviewable.
 *
 * **No conversion is ever applied to tolerance records** — a
 * tolerance is a specification bound, not a statistical
 * estimate; converting it into a standard uncertainty would
 * invent a distribution (the engineering-model quantity
 * discipline, preserved here on the evaluation side).
 */
import {
  assertValidUnit,
  unitFamily,
  type ModelUnit,
  type UnitFamily,
} from "@aise/engineering-model";

/** SI base unit per family (the budget's unit of account). */
export type SiBaseUnit = "meter" | "square_meter" | "radian";

/** Exact length factors to meters. */
const LENGTH_TO_SI: Readonly<Record<string, number>> = {
  meter: 1,
  millimeter: 1e-3,
  centimeter: 1e-2,
  inch: 0.0254,
  foot: 0.3048,
};

/** Exact area factors to square meters. */
const AREA_TO_SI: Readonly<Record<string, number>> = {
  square_meter: 1,
  square_millimeter: 1e-6,
  square_centimeter: 1e-4,
  square_inch: 0.0254 * 0.0254,
  square_foot: 0.3048 * 0.3048,
};

/** Exact angle factors to radians. */
const ANGLE_TO_SI: Readonly<Record<string, number>> = {
  radian: 1,
  degree: Math.PI / 180,
  gon: Math.PI / 200,
};

/** The SI base unit of a unit family. */
export function siBaseUnitOf(family: UnitFamily): SiBaseUnit {
  switch (family) {
    case "length":
      return "meter";
    case "area":
      return "square_meter";
    case "angle":
      return "radian";
  }
}

/**
 * The exact factor multiplying a value in `unit` into the
 * family's SI base unit. Unknown units fail closed (the
 * engineering-model vocabulary is the authority).
 */
export function toSiFactor(unit: ModelUnit): number {
  assertValidUnit(unit, "unit");
  const table = unitFamily(unit) === "length" ? LENGTH_TO_SI : unitFamily(unit) === "area" ? AREA_TO_SI : ANGLE_TO_SI;
  const factor = table[unit];
  if (factor === undefined) {
    // Unreachable while the vocabulary is closed; kept fail-closed.
    throw new Error(`no SI factor for unit "${unit}"`);
  }
  return factor;
}

/**
 * Converts a value in `unit` to the family's SI base unit
 * (deterministic float multiplication; exact factors).
 */
export function toSiValue(value: number, unit: ModelUnit): number {
  return value * toSiFactor(unit);
}
