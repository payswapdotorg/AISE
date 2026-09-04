/**
 * Exact SI conversion factors for the Reality Graph's own frozen
 * unit vocabulary (AISE-011 `quantities.ts`).
 *
 * This is NOT an alternate measurement vocabulary: the unit
 * strings, families and exact definitions are the model's own
 * (the AISE-009 discipline the model mirrors). The rule engine
 * needs exactly one thing the model package does not export:
 * converting a quantity's value into SI base units so a rule
 * bound declared in one unit can be compared against an
 * assertion stated in another unit of the SAME family,
 * deterministically (e.g. a rule bound in millimetres against
 * a property asserted in metres).
 *
 * The factors are exact by definition (no rounding, no drift):
 *
 * - millimetre = 0.001 m, centimetre = 0.01 m,
 *   inch = 0.0254 m (exact, since 1959), foot = 0.3048 m (exact);
 * - square units are the exact products of their length factors;
 * - angle units are converted with exact factors (degree =
 *   π/180 rad — the one non-decimal exact factor; the rule
 *   engine compares angles only within the angle family).
 *
 * A regression test pins this table to the model's exported unit
 * vocabulary: any drift in either direction fails the suite.
 */
import { RulesError } from "./errors.js";

/** The model's length units (mirror of `ModelLengthUnit`). */
export type RuleLengthUnit = "meter" | "millimeter" | "centimeter" | "inch" | "foot";

/** The model's area units (mirror of `ModelAreaUnit`). */
export type RuleAreaUnit =
  | "square_meter"
  | "square_millimeter"
  | "square_centimeter"
  | "square_inch"
  | "square_foot";

/** The model's angle units (mirror of `ModelAngleUnit`). */
export type RuleAngleUnit = "radian" | "degree" | "gon";

/** Any unit a model quantity may carry (mirror of `ModelUnit`). */
export type RuleUnit = RuleLengthUnit | RuleAreaUnit | RuleAngleUnit;

/** Unit families (mirror of the model's `UnitFamily`). */
export type RuleUnitFamily = "length" | "area" | "angle";

/** Exact length → metre factors (by definition, never approximated). */
export const LENGTH_SI_FACTORS: Readonly<Record<RuleLengthUnit, number>> = Object.freeze({
  meter: 1,
  millimeter: 0.001,
  centimeter: 0.01,
  inch: 0.0254,
  foot: 0.3048,
});

/** Exact area → square-metre factors (products of the length factors). */
export const AREA_SI_FACTORS: Readonly<Record<RuleAreaUnit, number>> = Object.freeze({
  square_meter: 1,
  square_millimeter: LENGTH_SI_FACTORS.millimeter * LENGTH_SI_FACTORS.millimeter,
  square_centimeter: LENGTH_SI_FACTORS.centimeter * LENGTH_SI_FACTORS.centimeter,
  square_inch: LENGTH_SI_FACTORS.inch * LENGTH_SI_FACTORS.inch,
  square_foot: LENGTH_SI_FACTORS.foot * LENGTH_SI_FACTORS.foot,
});

/** Exact angle → radian factors (degree = π/180 by definition; gon = π/200). */
export const ANGLE_SI_FACTORS: Readonly<Record<RuleAngleUnit, number>> = Object.freeze({
  radian: 1,
  degree: Math.PI / 180,
  gon: Math.PI / 200,
});

/** Classifies a unit into its family (fails closed on unknown units). */
export function ruleUnitFamily(unit: RuleUnit): RuleUnitFamily {
  if (unit in LENGTH_SI_FACTORS) {
    return "length";
  }
  if (unit in AREA_SI_FACTORS) {
    return "area";
  }
  if (unit in ANGLE_SI_FACTORS) {
    return "angle";
  }
  throw new RulesError("RULES_INPUT_INVALID", `unknown unit: ${String(unit)}`, {
    details: { field: "unit", value: String(unit) },
  });
}

/** Exact conversion of any length-unit value into metres (fail closed). */
export function lengthToSiMeters(value: number, unit: RuleUnit): number {
  if (!(unit in LENGTH_SI_FACTORS)) {
    throw new RulesError("RULES_INPUT_INVALID", `not a length unit: ${String(unit)}`, {
      details: { field: "unit", value: String(unit) },
    });
  }
  return value * LENGTH_SI_FACTORS[unit as RuleLengthUnit];
}

/** Exact conversion of any area-unit value into square metres (fail closed). */
export function areaToSiSquareMeters(value: number, unit: RuleUnit): number {
  if (!(unit in AREA_SI_FACTORS)) {
    throw new RulesError("RULES_INPUT_INVALID", `not an area unit: ${String(unit)}`, {
      details: { field: "unit", value: String(unit) },
    });
  }
  return value * AREA_SI_FACTORS[unit as RuleAreaUnit];
}

/** Exact conversion of any angle-unit value into radians (fail closed). */
export function angleToSiRadians(value: number, unit: RuleUnit): number {
  if (!(unit in ANGLE_SI_FACTORS)) {
    throw new RulesError("RULES_INPUT_INVALID", `not an angle unit: ${String(unit)}`, {
      details: { field: "unit", value: String(unit) },
    });
  }
  return value * ANGLE_SI_FACTORS[unit as RuleAngleUnit];
}

/** Exact conversion of a quantity into its family's SI base unit (fail closed). */
export function toSiBase(value: number, unit: RuleUnit): number {
  const family = ruleUnitFamily(unit);
  switch (family) {
    case "length":
      return lengthToSiMeters(value, unit);
    case "area":
      return areaToSiSquareMeters(value, unit);
    case "angle":
      return angleToSiRadians(value, unit);
  }
}

/** The SI base unit of a family (for reporting). */
export function siBaseUnitOf(family: RuleUnitFamily): RuleUnit {
  switch (family) {
    case "length":
      return "meter";
    case "area":
      return "square_meter";
    case "angle":
      return "radian";
  }
}

/** Renders a quantity deterministically for expected/actual fields. */
export function formatQuantity(value: number, unit: RuleUnit): string {
  return `${Number.isInteger(value) ? value : Number(value.toPrecision(12))} ${unit}`;
}
