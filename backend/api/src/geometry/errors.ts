/**
 * Typed geometry failures (AISE-013).
 *
 * Degeneracies and invalid inputs in this module NEVER degrade silently into
 * a plausible-looking number: they throw a `GeometryError` carrying a machine
 * readable `code` and a message that names the measured value which tripped
 * the check (e.g. the collinearity eigenvalue ratio or the measured
 * inter-plane angle). Callers gate engineering decisions on these codes.
 */

/** Every distinct failure mode emitted by the geometry module. */
export const GEOMETRY_ERROR_CODES = [
  /** Fewer points than the fit requires (3 for a plane, 2 for a line). */
  "INSUFFICIENT_POINTS",
  /** Points span only a line — no plane is defined. */
  "DEGENERATE_COLLINEAR",
  /** Points are coincident (all within the coincidence tolerance). */
  "DEGENERATE_COINCIDENT",
  /** A vector that must be non-zero has zero length. */
  "ZERO_LENGTH_VECTOR",
  /** A plane whose normal must be non-zero has a zero-length normal. */
  "DEGENERATE_PLANE_NORMAL",
  /** Planes that must be parallel are not; message names the measured angle. */
  "NON_PARALLEL_PLANES",
  /** Malformed numeric input (shape mismatch, negative sigma, bad range). */
  "INVALID_INPUT",
] as const;

export type GeometryErrorCode = (typeof GEOMETRY_ERROR_CODES)[number];

/** Typed, non-silent geometry failure. `code` is stable API. */
export class GeometryError extends Error {
  readonly code: GeometryErrorCode;

  constructor(code: GeometryErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = "GeometryError";
    this.code = code;
  }
}

/** Type guard for GeometryError (rethrown foreign errors stay foreign). */
export function isGeometryError(error: unknown): error is GeometryError {
  return error instanceof GeometryError;
}
