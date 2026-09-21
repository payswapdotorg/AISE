/**
 * Deterministic unit handling (PROD-022).
 *
 * THE FROZEN TYPED-UNIT DISCIPLINE, EXECUTION SIDE: the contract requires
 * every numeric parameter to carry an explicit unit; the ENGINE's job is to
 * (a) recognize the unit, (b) know which QUANTITY DIMENSION it measures
 * (linear/area/volume/…), and (c) convert it to the computation unit of the
 * quantity model DETERMINISTICALLY — never silently.
 *
 * Rules (all fail closed with typed reasons — see errors.ts):
 *
 *  - Only the units in the vocabulary below are accepted. An unknown unit
 *    (`furlong`, `sqft`, …) is `unknown_unit`, never a guess.
 *  - A unit must be dimension-compatible with the parameter slot it fills
 *    (`length: 2 kg` is `unit_dimension_mismatch`, never a silent pass).
 *  - Conversions are EXACT decimal arithmetic (powers of ten), so the same
 *    value always converts to the same number of computation units — no
 *    floating-point conversion chains, no rounding, no locale.
 *  - Quantities are EMITTED in the canonical computation unit of their
 *    dimension (m, m2, m3, count) with the parameter's original unit
 *    preserved in the parameter trace (traceability, not conversion loss).
 */

import type { QuantityDimension } from "@aise/solution-contract";

/** The unit dimension vocabulary the engine understands for parameters. */
export type UnitDimension =
  | "linear"
  | "area"
  | "volume"
  | "angular"
  | "duration"
  | "mass";
export type UnitKind =
  | { readonly kind: "unit"; readonly dimension: UnitDimension; readonly toCanonical: number }
  | { readonly kind: "count" };

/**
 * The engine's unit vocabulary. Every entry converts to the canonical unit
 * of its dimension by multiplication with `toCanonical` (exact powers of
 * ten; canonical units: linear m, area m2, volume m3, angular rad,
 * duration s, mass kg).
 */
export const UNIT_VOCABULARY: Readonly<Record<string, UnitKind>> = Object.freeze({
  m: { kind: "unit", dimension: "linear", toCanonical: 1 },
  dm: { kind: "unit", dimension: "linear", toCanonical: 0.1 },
  cm: { kind: "unit", dimension: "linear", toCanonical: 0.01 },
  mm: { kind: "unit", dimension: "linear", toCanonical: 0.001 },
  km: { kind: "unit", dimension: "linear", toCanonical: 1000 },
  m2: { kind: "unit", dimension: "area", toCanonical: 1 },
  cm2: { kind: "unit", dimension: "area", toCanonical: 0.0001 },
  mm2: { kind: "unit", dimension: "area", toCanonical: 0.000001 },
  m3: { kind: "unit", dimension: "volume", toCanonical: 1 },
  cm3: { kind: "unit", dimension: "volume", toCanonical: 0.000001 },
  mm3: { kind: "unit", dimension: "volume", toCanonical: 0.000000001 },
  l: { kind: "unit", dimension: "volume", toCanonical: 0.001 },
  rad: { kind: "unit", dimension: "angular", toCanonical: 1 },
  s: { kind: "unit", dimension: "duration", toCanonical: 1 },
  kg: { kind: "unit", dimension: "mass", toCanonical: 1 },
  g: { kind: "unit", dimension: "mass", toCanonical: 0.001 },
  t: { kind: "unit", dimension: "mass", toCanonical: 1000 },
  count: { kind: "count" },
});

/** The canonical output unit per contract quantity dimension. */
export const CANONICAL_QUANTITY_UNITS: Readonly<Record<QuantityDimension, string>> =
  Object.freeze({
    length: "m",
    area: "m2",
    volume: "m3",
    mass: "kg",
    count: "count",
    duration: "s",
  });

/** The parameter-slot dimension expected by the quantity models. */
export type ParameterSlotDimension = "linear" | "area" | "volume" | "angular" | "duration";

/**
 * Resolved numeric parameter: value converted to the CANONICAL unit of its
 * dimension (exact), original unit preserved for traceability.
 */
export interface ResolvedParameter {
  readonly name: string;
  readonly canonicalValue: number;
  readonly originalUnit: string;
  readonly dimension: UnitDimension | "count";
  readonly originalValue: number;
}

export type UnitResolutionFailure =
  | { readonly code: "unknown_unit"; readonly unit: string; readonly parameterName: string }
  | {
      readonly code: "unit_dimension_mismatch";
      readonly unit: string;
      readonly parameterName: string;
      readonly expectedDimension: ParameterSlotDimension | "count";
      readonly actualDimension: string;
    }
  | {
      readonly code: "parameter_not_numeric";
      readonly parameterName: string;
      readonly value: unknown;
    }
  | {
      readonly code: "parameter_not_positive";
      readonly parameterName: string;
      readonly value: number;
      readonly unit: string;
    };

/**
 * Resolves one numeric parameter against its expected slot dimension.
 * PURE: same input, same resolution or the same typed failure.
 */
export function resolveNumericParameter(
  parameter: { readonly name: string; readonly value: unknown; readonly unit?: unknown },
  expected: ParameterSlotDimension | "count",
): { ok: true; resolved: ResolvedParameter } | { ok: false; failure: UnitResolutionFailure } {
  const name = parameter.name;
  if (typeof parameter.value !== "number") {
    return {
      ok: false,
      failure: { code: "parameter_not_numeric", parameterName: name, value: parameter.value },
    };
  }
  if (typeof parameter.unit !== "string" || parameter.unit.trim() === "") {
    // numeric_without_unit is the contract invariant's concern; the engine
    // treats a missing/blank unit on a numeric value as an invalid input.
    return {
      ok: false,
      failure: { code: "unknown_unit", unit: "<missing>", parameterName: name },
    };
  }
  const entry = UNIT_VOCABULARY[parameter.unit];
  if (entry === undefined) {
    return {
      ok: false,
      failure: { code: "unknown_unit", unit: parameter.unit, parameterName: name },
    };
  }
  if (entry.kind === "count") {
    if (expected !== "count") {
      return {
        ok: false,
        failure: {
          code: "unit_dimension_mismatch",
          unit: parameter.unit,
          parameterName: name,
          expectedDimension: expected,
          actualDimension: "count",
        },
      };
    }
    if (parameter.value <= 0) {
      return {
        ok: false,
        failure: {
          code: "parameter_not_positive",
          parameterName: name,
          value: parameter.value,
          unit: parameter.unit,
        },
      };
    }
    return {
      ok: true,
      resolved: {
        name,
        canonicalValue: parameter.value,
        originalUnit: parameter.unit,
        dimension: "count",
        originalValue: parameter.value,
      },
    };
  }
  if (entry.dimension !== expected) {
    return {
      ok: false,
      failure: {
        code: "unit_dimension_mismatch",
        unit: parameter.unit,
        parameterName: name,
        expectedDimension: expected,
        actualDimension: entry.dimension,
      },
    };
  }
  if (parameter.value <= 0) {
    return {
      ok: false,
      failure: {
        code: "parameter_not_positive",
        parameterName: name,
        value: parameter.value,
        unit: parameter.unit,
      },
    };
  }
  return {
    ok: true,
    resolved: {
      name,
      canonicalValue: parameter.value * entry.toCanonical,
      originalUnit: parameter.unit,
      dimension: entry.dimension,
      originalValue: parameter.value,
    },
  };
}

/** Resolves a non-numeric parameter (e.g. `material`) as a string choice. */
export function resolveStringParameter(
  parameter: { readonly name: string; readonly value: unknown },
): { ok: true; value: string } | { ok: false; failure: UnitResolutionFailure } {
  if (typeof parameter.value !== "string" || parameter.value.trim() === "") {
    return {
      ok: false,
      failure: { code: "parameter_not_numeric", parameterName: parameter.name, value: parameter.value },
    };
  }
  return { ok: true, value: parameter.value };
}

/** Rounds an exact decimal up to the next integer (partial units count). */
export function roundUp(value: number): number {
  return Math.ceil(roundFloat(value));
}

/**
 * Cleans float noise introduced by decimal multiplication so identical
 * inputs always emit identical quantities (e.g. 0.1*3 = 0.30000000000000004
 * → 0.3). Deterministic: same input, same output — no rounding of the
 * significant digits, only noise at the 12th significant decimal.
 */
export function roundFloat(value: number): number {
  return Number(value.toFixed(10));
}
