/**
 * Uncertainty representation for geometry measurements (AISE-009).
 *
 * The architecture is explicit (architecture-lock §3, requirements
 * AC-052/AC-071/AC-072, assurance checkpoint 5):
 *
 * - measurements carry units and, where available,
 *   uncertainty/tolerance;
 * - a confidence score cannot substitute for measurement
 *   uncertainty;
 * - nothing silently upgrades an estimate into a measurement.
 *
 * This module enforces the first two structurally:
 *
 * - `Uncertainty` is one of three *distinct* representations:
 *   `standard` (1σ), `expanded` (U with coverage factor k), or
 *   `tolerance` (specification bounds). There is deliberately no
 *   confidence anywhere in this package: deterministic geometry
 *   has no confidence to report, and if a consumer wants one it
 *   must come from an evidence process, never be fabricated here;
 * - a `tolerance` is a specification limit, NOT a statistical
 *   estimate: converting a tolerance into a standard uncertainty
 *   would silently invent a distribution, so `toStandardUncertainty`
 *   fails closed on it (`UNCERTAINTY_INVALID`);
 * - absent uncertainty means "not stated", never "zero": the
 *   measurement type keeps uncertainty optional and no code path
 *   fills it with 0.
 *
 * All propagation below is standard first-order (GUM-style) linear
 * propagation for independent inputs; correlations are supported
 * explicitly by `combineStandard` when the caller can state them.
 */
import { GeometryError } from "./errors.js";
import { convertLength, convertAngle, type AngleUnit, type LengthUnit, type Unit } from "./units.js";

/** Standard (1σ) uncertainty. */
export interface StandardUncertainty {
  readonly kind: "standard";
  /** Positive standard uncertainty, in the measurement's unit. */
  readonly u: number;
}

/** Expanded uncertainty U = k·u with an explicit coverage factor. */
export interface ExpandedUncertainty {
  readonly kind: "expanded";
  /** Positive expanded uncertainty, in the measurement's unit. */
  readonly U: number;
  /** Coverage factor k ≥ 1 (k=2 ≈ 95% for Gaussian; the level is the caller's claim to document, not ours). */
  readonly coverageFactor: number;
}

/**
 * Symmetric specification tolerance around the nominal value.
 * A bound, not a statistical estimate — never convertible to a
 * standard uncertainty.
 */
export interface Tolerance {
  readonly kind: "tolerance";
  /** Lower offset from nominal (≤ 0). */
  readonly lowerOffset: number;
  /** Upper offset from nominal (≥ 0). */
  readonly upperOffset: number;
}

export type Uncertainty = StandardUncertainty | ExpandedUncertainty | Tolerance;

/** Validates and normalizes an uncertainty record (fail closed). */
export function validateUncertainty(uncertainty: Uncertainty): Uncertainty {
  switch (uncertainty.kind) {
    case "standard": {
      requireNonNegative(uncertainty.u, "standard uncertainty u");
      return uncertainty;
    }
    case "expanded": {
      requireNonNegative(uncertainty.U, "expanded uncertainty U");
      if (!Number.isFinite(uncertainty.coverageFactor) || uncertainty.coverageFactor < 1) {
        throw new GeometryError(
          "UNCERTAINTY_INVALID",
          `coverage factor must be a finite number ≥ 1: ${String(uncertainty.coverageFactor)}`,
          { details: { coverageFactor: String(uncertainty.coverageFactor) } },
        );
      }
      return uncertainty;
    }
    case "tolerance": {
      if (
        !Number.isFinite(uncertainty.lowerOffset) ||
        !Number.isFinite(uncertainty.upperOffset) ||
        uncertainty.lowerOffset > 0 ||
        uncertainty.upperOffset < 0
      ) {
        throw new GeometryError(
          "UNCERTAINTY_INVALID",
          `tolerance bounds must bracket the nominal value (lower ≤ 0 ≤ upper), got [${String(uncertainty.lowerOffset)}, ${String(uncertainty.upperOffset)}]`,
          {
            details: {
              lowerOffset: String(uncertainty.lowerOffset),
              upperOffset: String(uncertainty.upperOffset),
            },
          },
        );
      }
      return uncertainty;
    }
  }
}

/**
 * Converts an uncertainty to its standard (1σ) form, where that is
 * a legitimate statement: standard passes through, expanded divides
 * by its coverage factor. A tolerance fails closed — a spec bound
 * is not a distribution.
 */
export function toStandardUncertainty(uncertainty: Uncertainty): number {
  validateUncertainty(uncertainty);
  switch (uncertainty.kind) {
    case "standard":
      return uncertainty.u;
    case "expanded":
      return uncertainty.U / uncertainty.coverageFactor;
    case "tolerance":
      throw new GeometryError(
        "UNCERTAINTY_INVALID",
        "a specification tolerance is not a statistical uncertainty — it cannot be converted to a standard uncertainty; the distribution would be invented",
        { details: { kind: "tolerance" } },
      );
  }
}

/**
 * Combines two standard uncertainties for independent inputs
 * (root sum of squares), optionally with an explicit correlation
 * coefficient ρ ∈ [-1, 1] (u = √(u₁² + u₂² + 2ρu₁u₂)).
 */
export function combineStandard(u1: number, u2: number, correlation = 0): number {
  requireNonNegative(u1, "u1");
  requireNonNegative(u2, "u2");
  if (!Number.isFinite(correlation) || correlation < -1 || correlation > 1) {
    throw new GeometryError(
      "UNCERTAINTY_INVALID",
      `correlation coefficient must be in [-1, 1]: ${String(correlation)}`,
      { details: { correlation: String(correlation) } },
    );
  }
  const combined = Math.sqrt(u1 * u1 + u2 * u2 + 2 * correlation * u1 * u2);
  if (!Number.isFinite(combined)) {
    throw new GeometryError("UNCERTAINTY_INVALID", "combined uncertainty is not finite", {
      details: { u1: String(u1), u2: String(u2), correlation: String(correlation) },
    });
  }
  return combined;
}

/** Scales a standard uncertainty by a finite non-negative factor. */
export function scaleStandard(u: number, factor: number): number {
  requireNonNegative(u, "u");
  if (!Number.isFinite(factor) || factor < 0) {
    throw new GeometryError("UNCERTAINTY_INVALID", `scale factor must be finite ≥ 0: ${String(factor)}`, {
      details: { factor: String(factor) } ,
    });
  }
  return u * factor;
}

/** Root-sum-square over a list of standard uncertainties. */
export function rssStandard(us: readonly number[]): number {
  if (us.length === 0) {
    throw new GeometryError("UNCERTAINTY_INVALID", "cannot combine an empty uncertainty list", {
      details: {},
    });
  }
  let sumSquares = 0;
  for (const u of us) {
    requireNonNegative(u, "u");
    sumSquares += u * u;
  }
  const combined = Math.sqrt(sumSquares);
  if (!Number.isFinite(combined)) {
    throw new GeometryError("UNCERTAINTY_INVALID", "combined uncertainty is not finite", {
      details: { count: us.length },
    });
  }
  return combined;
}

/**
 * A scalar measurement: value + unit + optional uncertainty, the
 * deterministic output of a geometry operation. Epistemic state and
 * provenance are mandatory — a measurement without lineage and an
 * honest epistemic status is not a measurement, it is a bare
 * number.
 */
export interface Measurement {
  /** Measured value (finite). */
  readonly value: number;
  /** Unit of the value (length family for distances, angle family for angles). */
  readonly unit: Unit;
  /** Uncertainty/tolerance where available; absent means "not stated", never zero. */
  readonly uncertainty?: Uncertainty;
}

/** A measurement with standard (1σ) uncertainty materialized. */
export interface StandardMeasurement extends Measurement {
  readonly uncertainty: StandardUncertainty;
}

/** Converts a measurement (and its uncertainty) to another unit of the same family. */
export function convertMeasurement(measurement: Measurement, to: Unit): Measurement {
  if (measurement.unit === to) {
    return measurement;
  }
  const fromIsLength = isLengthFamily(measurement.unit);
  const toIsLength = isLengthFamily(to);
  if (fromIsLength !== toIsLength) {
    throw new GeometryError(
      "MISMATCHED_UNITS",
      `cannot convert "${measurement.unit}" to "${to}" — different unit families`,
      { details: { from: measurement.unit, to } },
    );
  }
  if (fromIsLength) {
    const converted = convertLength(measurement.value, measurement.unit as LengthUnit, to as LengthUnit);
    const scale = convertLength(1, measurement.unit as LengthUnit, to as LengthUnit);
    return withConvertedValue(measurement, converted, scale, to);
  }
  const converted = convertAngle(measurement.value, measurement.unit as AngleUnit, to as AngleUnit);
  const scale = convertAngle(1, measurement.unit as AngleUnit, to as AngleUnit);
  return withConvertedValue(measurement, converted, scale, to);
}

function withConvertedValue(measurement: Measurement, value: number, scale: number, to: Unit): Measurement {
  if (measurement.uncertainty === undefined) {
    return { ...measurement, value, unit: to };
  }
  return { ...measurement, value, unit: to, uncertainty: scaleUncertaintyRecord(measurement.uncertainty, scale) };
}

/** Scales every numeric field of an uncertainty record by a non-negative factor. */
export function scaleUncertaintyRecord(uncertainty: Uncertainty, factor: number): Uncertainty {
  const unc = validateUncertainty(uncertainty);
  if (!Number.isFinite(factor) || factor < 0) {
    throw new GeometryError("UNCERTAINTY_INVALID", `uncertainty scale factor must be finite ≥ 0: ${String(factor)}`, {
      details: { factor: String(factor) },
    });
  }
  switch (unc.kind) {
    case "standard":
      return { kind: "standard", u: unc.u * factor };
    case "expanded":
      return { kind: "expanded", U: unc.U * factor, coverageFactor: unc.coverageFactor };
    case "tolerance":
      return { kind: "tolerance", lowerOffset: unc.lowerOffset * factor, upperOffset: unc.upperOffset * factor };
  }
}

function requireNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new GeometryError(
      "UNCERTAINTY_INVALID",
      `${label} must be a finite number ≥ 0: ${String(value)}`,
      { details: { label, value: String(value) } },
    );
  }
}

function isLengthFamily(unit: Unit): boolean {
  return unit === "meter" || unit === "millimeter" || unit === "centimeter" ||
    unit === "inch" || unit === "foot";
}
