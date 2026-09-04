/**
 * Exact SI conversion factors for the Reality Graph's own frozen
 * unit vocabulary (AISE-011 `quantities.ts`).
 *
 * This is NOT an alternate measurement vocabulary: the unit
 * strings, families and exact definitions are the model's own
 * (the AISE-009 discipline the model mirrors). QA needs exactly
 * one thing the model package does not export: converting a
 * quantity's value into SI base units so two quantities in
 * different units of the SAME family can be compared
 * deterministically (e.g. a property asserted in millimetres
 * against geometry asserted in metres).
 *
 * The factors are exact by definition (no rounding, no drift):
 *
 * - millimetre = 0.001 m, centimetre = 0.01 m,
 *   inch = 0.0254 m (exact, since 1959), foot = 0.3048 m (exact);
 * - square units are the exact products of their length factors;
 * - angle units are not converted here — QA never compares
 *   angles across units (no angle-bearing geometry in v1); the
 *   family is still recognized so cross-family comparison fails
 *   closed instead of silently succeeding.
 *
 * A regression test pins this table to the model's exported unit
 * vocabulary: any drift in either direction fails the suite.
 */
import { ModelQaError } from "./errors.js";

/** The model's length units (mirror of `ModelLengthUnit`). */
export type QaLengthUnit = "meter" | "millimeter" | "centimeter" | "inch" | "foot";

/** The model's area units (mirror of `ModelAreaUnit`). */
export type QaAreaUnit =
  | "square_meter"
  | "square_millimeter"
  | "square_centimeter"
  | "square_inch"
  | "square_foot";

/** The model's angle units (mirror of `ModelAngleUnit`). */
export type QaAngleUnit = "radian" | "degree" | "gon";

/** Any unit a model quantity may carry (mirror of `ModelUnit`). */
export type QaUnit = QaLengthUnit | QaAreaUnit | QaAngleUnit;

/** Unit families (mirror of the model's `UnitFamily`). */
export type QaUnitFamily = "length" | "area" | "angle";

/** Exact length → metre factors (by definition, never approximated). */
export const LENGTH_SI_FACTORS: Readonly<Record<QaLengthUnit, number>> = Object.freeze({
  meter: 1,
  millimeter: 0.001,
  centimeter: 0.01,
  inch: 0.0254,
  foot: 0.3048,
});

/** Exact area → square-metre factors (products of the length factors). */
export const AREA_SI_FACTORS: Readonly<Record<QaAreaUnit, number>> = Object.freeze({
  square_meter: 1,
  square_millimeter: LENGTH_SI_FACTORS.millimeter * LENGTH_SI_FACTORS.millimeter,
  square_centimeter: LENGTH_SI_FACTORS.centimeter * LENGTH_SI_FACTORS.centimeter,
  square_inch: LENGTH_SI_FACTORS.inch * LENGTH_SI_FACTORS.inch,
  square_foot: LENGTH_SI_FACTORS.foot * LENGTH_SI_FACTORS.foot,
});

/** The angle units (recognized, never converted — see module doc). */
export const ANGLE_UNITS: readonly QaAngleUnit[] = Object.freeze(["radian", "degree", "gon"]);

/** Classifies a unit into its family (fails closed on unknown units). */
export function qaUnitFamily(unit: QaUnit): QaUnitFamily {
  if (unit in LENGTH_SI_FACTORS) {
    return "length";
  }
  if (unit in AREA_SI_FACTORS) {
    return "area";
  }
  if (ANGLE_UNITS.includes(unit as QaAngleUnit)) {
    return "angle";
  }
  throw new ModelQaError("QA_INPUT_INVALID", `unknown unit: ${String(unit)}`, {
    details: { field: "unit", value: String(unit) },
  });
}

/** Exact conversion of a length-unit value into metres (fail closed). */
export function lengthToSiMeters(value: number, unit: QaUnit): number {
  if (!(unit in LENGTH_SI_FACTORS)) {
    throw new ModelQaError("QA_INPUT_INVALID", `not a length unit: ${String(unit)}`, {
      details: { field: "unit", value: String(unit) },
    });
  }
  return value * LENGTH_SI_FACTORS[unit as QaLengthUnit];
}

/** Exact conversion of an area-unit value into square metres (fail closed). */
export function areaToSiSquareMeters(value: number, unit: QaUnit): number {
  if (!(unit in AREA_SI_FACTORS)) {
    throw new ModelQaError("QA_INPUT_INVALID", `not an area unit: ${String(unit)}`, {
      details: { field: "unit", value: String(unit) },
    });
  }
  return value * AREA_SI_FACTORS[unit as QaAreaUnit];
}

/**
 * The square counterpart of a length unit (the model's paired
 * families: widths in `foot` pair with areas in `square_foot`).
 * Used only for reporting — comparisons always go through exact
 * SI conversion, never through pairing assumptions.
 */
export function squareOfLengthUnit(unit: QaUnit): QaAreaUnit {
  switch (unit) {
    case "meter":
      return "square_meter";
    case "millimeter":
      return "square_millimeter";
    case "centimeter":
      return "square_centimeter";
    case "inch":
      return "square_inch";
    case "foot":
      return "square_foot";
    default:
      throw new ModelQaError("QA_INPUT_INVALID", `not a length unit: ${String(unit)}`, {
        details: { field: "unit", value: String(unit) },
      });
  }
}

/** Renders a quantity deterministically for expected/actual fields. */
export function formatQuantity(value: number, unit: QaUnit): string {
  return `${Number.isInteger(value) ? value : Number(value.toPrecision(12))} ${unit}`;
}
