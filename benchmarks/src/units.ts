/**
 * Exact SI conversion factors for the Reality Graph's frozen
 * length/area unit vocabulary (the AISE-011 `quantities.ts`
 * mirror — the same discipline every backend service follows:
 * the model's units are the vocabulary; conversion to SI base
 * units for scoring is exact by definition, never approximated).
 */
import { BenchmarkError } from "./errors.js";

/** The model's length units (mirror of `ModelLengthUnit`). */
export type BenchLengthUnit = "meter" | "millimeter" | "centimeter" | "inch" | "foot";

/** The model's area units (mirror of `ModelAreaUnit`). */
export type BenchAreaUnit =
  | "square_meter"
  | "square_millimeter"
  | "square_centimeter"
  | "square_inch"
  | "square_foot";

/** Exact length → metre factors (by definition). */
export const LENGTH_SI_FACTORS: Readonly<Record<BenchLengthUnit, number>> = Object.freeze({
  meter: 1,
  millimeter: 0.001,
  centimeter: 0.01,
  inch: 0.0254,
  foot: 0.3048,
});

/** Exact area → square-metre factors (products of the length factors). */
export const AREA_SI_FACTORS: Readonly<Record<BenchAreaUnit, number>> = Object.freeze({
  square_meter: 1,
  square_millimeter: LENGTH_SI_FACTORS.millimeter * LENGTH_SI_FACTORS.millimeter,
  square_centimeter: LENGTH_SI_FACTORS.centimeter * LENGTH_SI_FACTORS.centimeter,
  square_inch: LENGTH_SI_FACTORS.inch * LENGTH_SI_FACTORS.inch,
  square_foot: LENGTH_SI_FACTORS.foot * LENGTH_SI_FACTORS.foot,
});

/** Whether a unit string is a known length unit. */
export function isLengthUnit(unit: string): unit is BenchLengthUnit {
  return unit in LENGTH_SI_FACTORS;
}

/** Exact conversion of a length-unit value into metres (fail closed). */
export function lengthToSiMeters(value: number, unit: string): number {
  if (!isLengthUnit(unit)) {
    throw new BenchmarkError("BENCH_INPUT_INVALID", `not a length unit: ${String(unit)}`, {
      details: { field: "unit", value: String(unit) },
    });
  }
  return value * LENGTH_SI_FACTORS[unit];
}
