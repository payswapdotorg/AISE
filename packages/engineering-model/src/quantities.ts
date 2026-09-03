/**
 * Canonical quantity vocabulary for the Reality Graph core
 * (AISE-011).
 *
 * The architecture (architecture-lock §3, requirements AC-052,
 * AC-071, AC-072) requires:
 *
 * - measurements carry units and, where available,
 *   uncertainty/tolerance;
 * - a confidence score cannot substitute for measurement
 *   uncertainty (separate axes, separate fields);
 * - nothing silently upgrades an estimate into a measurement.
 *
 * This module defines the model's own canonical representation.
 * It is a structural mirror of the AISE-009 geometry vocabulary
 * (the discipline is identical) but deliberately package-local:
 * the canonical engineering model may not depend on a backend
 * service package, and backend producers adapt into this
 * vocabulary at the ingestion boundary (`@aise/backend-reality-
 * model` owns that explicit, reviewable mapping).
 *
 * The estimate/measurement distinction is structural:
 *
 * - `MeasurementKind` separates "measurement" (a value directly
 *   supported by capture/instrument/human authority) from
 *   "estimate" (a derived value);
 * - `quantityKindRule` encodes the architecture-lock §3 rule: only
 *   `OBSERVED` or `CONFIRMED` assertions may carry
 *   `kind: "measurement"`; `INFERRED` and `PROPOSED` values are
 *   `estimate` by construction. The property-assertion constructor
 *   enforces this fail-closed (`MEASUREMENT_KIND_INVALID`).
 */
import { EngineeringModelError } from "./errors.js";

/** Supported length units (the AISE-009 vocabulary, exact family). */
export type ModelLengthUnit = "meter" | "millimeter" | "centimeter" | "inch" | "foot";

/** Supported area units (square counterparts of the length units). */
export type ModelAreaUnit =
  | "square_meter"
  | "square_millimeter"
  | "square_centimeter"
  | "square_inch"
  | "square_foot";

/** Supported angle units. */
export type ModelAngleUnit = "radian" | "degree" | "gon";

/** Any unit a model quantity may carry. */
export type ModelUnit = ModelLengthUnit | ModelAreaUnit | ModelAngleUnit;

const LENGTH_UNITS: readonly ModelLengthUnit[] = [
  "meter",
  "millimeter",
  "centimeter",
  "inch",
  "foot",
];

const AREA_UNITS: readonly ModelAreaUnit[] = [
  "square_meter",
  "square_millimeter",
  "square_centimeter",
  "square_inch",
  "square_foot",
];

const ANGLE_UNITS: readonly ModelAngleUnit[] = ["radian", "degree", "gon"];

export type UnitFamily = "length" | "area" | "angle";

/** Throws unless `unit` belongs to the model unit vocabulary. */
export function assertValidUnit(unit: ModelUnit, field: string): void {
  if (
    !LENGTH_UNITS.includes(unit as ModelLengthUnit) &&
    !AREA_UNITS.includes(unit as ModelAreaUnit) &&
    !ANGLE_UNITS.includes(unit as ModelAngleUnit)
  ) {
    throw new EngineeringModelError(
      "UNIT_INVALID",
      `${field} is not a model unit: ${String(unit)}`,
      { details: { field, value: String(unit) } },
    );
  }
}

/** Classifies a model unit into its family. */
export function unitFamily(unit: ModelUnit): UnitFamily {
  assertValidUnit(unit, "unit");
  if (LENGTH_UNITS.includes(unit as ModelLengthUnit)) {
    return "length";
  }
  if (AREA_UNITS.includes(unit as ModelAreaUnit)) {
    return "area";
  }
  return "angle";
}

/** Throws unless both units belong to the same family. */
export function assertSameUnitFamily(a: ModelUnit, b: ModelUnit, context: string): void {
  const familyA = unitFamily(a);
  const familyB = unitFamily(b);
  if (familyA !== familyB) {
    throw new EngineeringModelError(
      "MISMATCHED_UNITS",
      `${context}: units "${a}" (${familyA}) and "${b}" (${familyB}) are of different families`,
      { details: { context, a, b } },
    );
  }
}

/** Standard (1σ) uncertainty. */
export interface StandardUncertainty {
  readonly kind: "standard";
  /** Positive standard uncertainty, in the quantity's unit. */
  readonly u: number;
}

/** Expanded uncertainty U = k·u with an explicit coverage factor. */
export interface ExpandedUncertainty {
  readonly kind: "expanded";
  /** Positive expanded uncertainty, in the quantity's unit. */
  readonly U: number;
  /** Coverage factor k ≥ 1 (the confidence level is the caller's claim to document, not ours). */
  readonly coverageFactor: number;
}

/**
 * Symmetric specification tolerance around the nominal value.
 * A bound, not a statistical estimate — never convertible to a
 * standard uncertainty (silently converting would invent a
 * distribution).
 */
export interface Tolerance {
  readonly kind: "tolerance";
  /** Lower offset from nominal (≤ 0). */
  readonly lowerOffset: number;
  /** Upper offset from nominal (≥ 0). */
  readonly upperOffset: number;
}

/** Union of uncertainty representations (no confidence anywhere in this union). */
export type ModelUncertainty = StandardUncertainty | ExpandedUncertainty | Tolerance;

/** A measured or estimated value with an explicit unit. */
export interface Quantity {
  /** Finite value. */
  readonly value: number;
  /** Unit of the value (explicit — never implicit). */
  readonly unit: ModelUnit;
  /** Uncertainty/tolerance where available; absent means "not stated", never zero. */
  readonly uncertainty?: ModelUncertainty;
}

/**
 * The estimate/measurement distinction (architecture-lock §3).
 * `confidence` (a model probability, AC-070) is a SEPARATE field
 * on property assertions, isomorphic to none of these types, and
 * can never substitute for any of them.
 */
export type MeasurementKind = "measurement" | "estimate";

/**
 * Whether an assertion in epistemic `state` may carry
 * `kind: "measurement"`. Only directly-supported states
 * (`OBSERVED`, `CONFIRMED`) may; `INFERRED`/`PROPOSED` values are
 * estimates by construction. This is the structural form of
 * AC-072 ("the system never upgrades an estimate into a
 * measurement without qualifying evidence").
 */
export function quantityMayBeMeasurement(state: string): boolean {
  return state === "OBSERVED" || state === "CONFIRMED";
}

/** Validates and normalizes an uncertainty record (fail closed). */
export function validateUncertainty(uncertainty: ModelUncertainty, field: string): ModelUncertainty {
  switch (uncertainty.kind) {
    case "standard": {
      requireFiniteNonNegative(uncertainty.u, `${field}.u`);
      return uncertainty;
    }
    case "expanded": {
      requireFiniteNonNegative(uncertainty.U, `${field}.U`);
      if (!Number.isFinite(uncertainty.coverageFactor) || uncertainty.coverageFactor < 1) {
        throw new EngineeringModelError(
          "VALUE_INVALID",
          `${field}.coverageFactor must be a finite number ≥ 1: ${String(uncertainty.coverageFactor)}`,
          { details: { field: `${field}.coverageFactor`, value: String(uncertainty.coverageFactor) } },
        );
      }
      return uncertainty;
    }
    case "tolerance": {
      const { lowerOffset, upperOffset } = uncertainty;
      if (
        !Number.isFinite(lowerOffset) ||
        !Number.isFinite(upperOffset) ||
        lowerOffset > 0 ||
        upperOffset < 0
      ) {
        throw new EngineeringModelError(
          "VALUE_INVALID",
          `${field} tolerance offsets must be finite with lower ≤ 0 ≤ upper: ${String(lowerOffset)} / ${String(upperOffset)}`,
          {
            details: {
              field: `${field}.tolerance`,
              lowerOffset: String(lowerOffset),
              upperOffset: String(upperOffset),
            },
          },
        );
      }
      return uncertainty;
    }
    default:
      throw new EngineeringModelError(
        "VALUE_INVALID",
        `${field} has unknown uncertainty kind: ${String((uncertainty as { kind?: unknown }).kind)}`,
        { details: { field: `${field}.kind`, value: String((uncertainty as { kind?: unknown }).kind) } },
      );
  }
}

/** Validates a quantity record (value, unit, uncertainty — all fail closed). */
export function validateQuantity(quantity: Quantity, field: string): Quantity {
  if (!Number.isFinite(quantity.value)) {
    throw new EngineeringModelError(
      "VALUE_INVALID",
      `${field}.value must be finite: ${String(quantity.value)}`,
      { details: { field: `${field}.value`, value: String(quantity.value) } },
    );
  }
  assertValidUnit(quantity.unit, `${field}.unit`);
  if (quantity.uncertainty !== undefined) {
    validateUncertainty(quantity.uncertainty, `${field}.uncertainty`);
  }
  return quantity;
}

function requireFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new EngineeringModelError(
      "VALUE_INVALID",
      `${field} must be a finite number ≥ 0: ${String(value)}`,
      { details: { field, value: String(value) } },
    );
  }
}
