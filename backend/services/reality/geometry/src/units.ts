/**
 * Unit system for geometry measurements (AISE-009).
 *
 * The architecture requires measurements to carry units
 * (architecture-lock §3: "measurements must carry units"). This
 * module makes units structural:
 *
 * - length and angle are distinct unit families; a length can
 *   never be mistaken for an angle at the type level (they only
 *   meet inside `Measurement`, which tags every value with its
 *   unit);
 * - conversion factors to the canonical units (meter, radian) are
 *   exact rational constants by international definition
 *   (mm = 10⁻³ m, cm = 10⁻² m, inch = 0.0254 m, foot = 0.3048 m,
 *   degree = π/180 rad, gon = π/200 rad), so conversion is
 *   reproducible;
 * - combining measurements of different units without an explicit
 *   conversion fails closed (`MISMATCHED_UNITS`) — silent unit
 *   coercion is how engineering software kills people, and it is
 *   exactly the class of error the fail-closed discipline exists
 *   to prevent.
 *
 * Angles are reported in radians by default; `convertAngle`
 * converts a measured angle value to degrees/gon when a caller
 * needs them. Coordinates always carry an explicit length unit —
 * there is no implicit default.
 */
import { GeometryError } from "./errors.js";

/** Supported length units (conversion factors to meter are exact). */
export type LengthUnit = "meter" | "millimeter" | "centimeter" | "inch" | "foot";

/** Supported angle units (conversion factors to radian are exact). */
export type AngleUnit = "radian" | "degree" | "gon";

/** Any unit a scalar measurement can carry. */
export type Unit = LengthUnit | AngleUnit;

const LENGTH_TO_METER: Record<LengthUnit, number> = {
  meter: 1,
  millimeter: 1e-3,
  centimeter: 1e-2,
  inch: 0.0254,
  foot: 0.3048,
};

const ANGLE_TO_RADIAN: Record<AngleUnit, number> = {
  radian: 1,
  degree: Math.PI / 180,
  gon: Math.PI / 200,
};

function isLengthUnit(unit: unknown): unit is LengthUnit {
  return unit === "meter" || unit === "millimeter" || unit === "centimeter" ||
    unit === "inch" || unit === "foot";
}

function isAngleUnit(unit: unknown): unit is AngleUnit {
  return unit === "radian" || unit === "degree" || unit === "gon";
}

/** Assert a unit is a known length unit (runtime guard for untrusted input). */
export function assertLengthUnit(unit: unknown): LengthUnit {
  if (!isLengthUnit(unit)) {
    throw new GeometryError("VALIDATION_FAILED", `unknown length unit: ${String(unit)}`, {
      details: { unit, allowed: ["meter", "millimeter", "centimeter", "inch", "foot"] },
    });
  }
  return unit;
}

/** Assert a unit is a known angle unit (runtime guard for untrusted input). */
export function assertAngleUnit(unit: unknown): AngleUnit {
  if (!isAngleUnit(unit)) {
    throw new GeometryError("VALIDATION_FAILED", `unknown angle unit: ${String(unit)}`, {
      details: { unit, allowed: ["radian", "degree", "gon"] },
    });
  }
  return unit;
}

/** Exact factor of a length unit to meters. */
export function lengthToMeterFactor(unit: LengthUnit): number {
  return LENGTH_TO_METER[assertLengthUnit(unit)];
}

/** Exact factor of an angle unit to radians. */
export function angleToRadianFactor(unit: AngleUnit): number {
  return ANGLE_TO_RADIAN[assertAngleUnit(unit)];
}

/**
 * Converts a finite value between length units (exact factors,
 * deterministic multiplication).
 */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  assertFinite(value, "length value");
  return (value * lengthToMeterFactor(from)) / lengthToMeterFactor(to);
}

/** Converts a finite value between angle units. */
export function convertAngle(value: number, from: AngleUnit, to: AngleUnit): number {
  assertFinite(value, "angle value");
  return (value * angleToRadianFactor(from)) / angleToRadianFactor(to);
}

/**
 * Requires two units to be equal (fail closed on mismatch — the
 * caller must convert explicitly). Used wherever two measurements
 * or entities combine.
 */
export function requireSameUnit(a: Unit, b: Unit): void {
  if (a !== b) {
    throw new GeometryError(
      "MISMATCHED_UNITS",
      `operations require matching units — got "${a}" and "${b}"; convert explicitly instead`,
      { details: { left: a, right: b } },
    );
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new GeometryError("NON_FINITE_INPUT", `${label} must be finite: ${String(value)}`, {
      details: { label, value: String(value) },
    });
  }
}
