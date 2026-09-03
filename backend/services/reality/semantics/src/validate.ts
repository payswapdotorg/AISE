/**
 * Input validation for architectural object extraction (AISE-010).
 *
 * Mirrors the AISE-009 finite-value discipline but throws
 * `SemanticsError`, so the semantics public surface never leaks
 * another package's error type: a NaN or a malformed parameter
 * stops at this boundary (`NON_FINITE_INPUT` /
 * `VALIDATION_FAILED`) instead of propagating silently into
 * authoritative-looking architectural objects.
 *
 * Point-set canonicalization is REUSED from AISE-009
 * (`canonicalizePointSet`) — it throws `GeometryError`, which the
 * extraction stages wrap via `wrapGeometryFailure` — so the
 * canonical-order guarantee (the same point SET in any input order
 * yields bit-identical results) is inherited, not reinvented.
 */
import { SemanticsError } from "./errors.js";
import { canonicalizePointSet, vec3Normalize } from "@aise/backend-geometry";
import type { GeomPoint, Vec3, LengthUnit } from "@aise/backend-geometry";

/** Length units accepted by extraction (same family as AISE-009). */
const LENGTH_UNITS: readonly LengthUnit[] = ["meter", "millimeter", "centimeter", "inch", "foot"];

/** Assert a length unit from the shared vocabulary. */
export function assertLengthUnit(unit: unknown): LengthUnit {
  if (typeof unit !== "string" || !LENGTH_UNITS.includes(unit as LengthUnit)) {
    throw new SemanticsError("VALIDATION_FAILED", `unknown length unit: ${String(unit)}`, {
      details: { unit: String(unit), allowed: [...LENGTH_UNITS] },
    });
  }
  return unit as LengthUnit;
}

/** Assert a number is finite (NaN/±Infinity fail closed). */
export function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SemanticsError("NON_FINITE_INPUT", `${label} must be a finite number: ${String(value)}`, {
      details: { label, value: String(value) },
    });
  }
  return value;
}

/** Assert a positive integer parameter. */
export function assertPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new SemanticsError("VALIDATION_FAILED", `${label} must be a positive integer: ${String(value)}`, {
      details: { label, value: String(value) },
    });
  }
  return value;
}

/** Assert a positive finite parameter (tolerances, scales, thresholds). */
export function assertPositiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new SemanticsError("VALIDATION_FAILED", `${label} must be a finite number > 0: ${String(value)}`, {
      details: { label, value: String(value) },
    });
  }
  return value;
}

/** Assert a non-negative finite parameter. */
export function assertNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new SemanticsError("VALIDATION_FAILED", `${label} must be a finite number ≥ 0: ${String(value)}`, {
      details: { label, value: String(value) },
    });
  }
  return value;
}

/**
 * Validate and normalize the declared "up" axis (gravity-negative
 * direction) of the scene frame. Any non-zero finite vector is
 * accepted and normalized; the caller's declaration is recorded in
 * provenance. A zero/near-zero vector fails closed
 * (`DEGENERATE_GEOMETRY`) — a scene without a declared up axis
 * cannot support floor/ceiling/wall classification, and guessing
 * one would fabricate orientation.
 */
export function normalizeUpAxis(up: Vec3): Vec3 {
  try {
    return vec3Normalize(up, "scene up axis");
  } catch (error) {
    throw new SemanticsError(
      "DEGENERATE_GEOMETRY",
      `scene up axis must be a non-zero finite vector: ${error instanceof Error ? error.message : String(error)}`,
      { details: { up: { x: String(up.x), y: String(up.y), z: String(up.z) } } },
    );
  }
}

/**
 * Validates a point array and returns it in CANONICAL order
 * (AISE-009 canonicalizer; its `GeometryError` is expected to be
 * wrapped by the caller via `wrapGeometryFailure`). Enforces the
 * minimum point count.
 */
export function canonicalPoints(
  points: readonly unknown[],
  options: { minCount: number; label?: string },
): GeomPoint[] {
  return canonicalizePointSet(points, options);
}
