/**
 * Geometry error model (AISE-009).
 *
 * Every failure inside the geometry measurement primitives is a
 * typed `GeometryError` carrying a machine-readable `code`, a
 * human-readable message, structured `details`, and a `retryable`
 * flag — mirroring the AISE-003/AISE-008 discipline that retry
 * decisions are data-driven (never message parsing).
 *
 * Default semantics are FAIL-CLOSED and, for this package
 * specifically, NON-RETRYABLE by construction: the primitives are
 * deterministic functions of their inputs, so re-running an
 * identical input can never succeed where it failed before. The
 * only retryable code is `INTERNAL_ERROR`, which signals an
 * implementation defect rather than a property of the input.
 */

/** Machine-readable failure codes for the geometry primitives. */
export type GeometryErrorCode =
  /** Well-formedness failure in inputs or parameters. */
  | "VALIDATION_FAILED"
  /** A coordinate or numeric input is not finite (NaN/±Infinity). */
  | "NON_FINITE_INPUT"
  /** Fewer points than the method requires. */
  | "INSUFFICIENT_POINTS"
  /**
   * The input geometry cannot determine the requested primitive:
   * collinear points where a plane is required, points whose
   * projection collapses, parallel local normals where a cylinder
   * axis must come from intersecting tangent directions, or an
   * exactly-identical point set.
   */
  | "DEGENERATE_GEOMETRY"
  /**
   * A zero (or near-zero) direction/normal vector where a unit
   * vector is required.
   */
  | "ZERO_VECTOR"
  /**
   * A fit completed numerically but its result is not an
   * acceptable engineering fit — residuals exceed the declared
   * validity bound, the radius is non-positive, or the refinement
   * did not converge. The points do not lie on the claimed shape.
   */
  | "INVALID_FIT"
  /** Combining measurements of different units without conversion. */
  | "MISMATCHED_UNITS"
  /**
   * An uncertainty/tolerance record is malformed: negative
   * magnitude, coverage factor below 1, tolerance bounds not
   * bracketing the nominal value, or an attempt to convert a
   * specification tolerance into a statistical uncertainty.
   */
  | "UNCERTAINTY_INVALID"
  /** A derived measurement lacks complete method/parameter/input lineage. */
  | "PROVENANCE_INCOMPLETE"
  /**
   * A measurement claims an epistemic state it cannot have:
   * fitting output claiming OBSERVED/CONFIRMED/PROPOSED, or a
   * derived measurement outranking any of its inputs.
   */
  | "EPISTEMIC_STATE_INVALID"
  /** Unexpected internal failure (implementation defect). */
  | "INTERNAL_ERROR";

/** Structured details payload for geometry failures. */
export interface GeometryErrorDetails {
  readonly [key: string]: unknown;
}

/** Typed, fail-closed geometry failure. */
export class GeometryError extends Error {
  readonly code: GeometryErrorCode;
  readonly details: GeometryErrorDetails;
  readonly retryable: boolean;

  constructor(
    code: GeometryErrorCode,
    message: string,
    options: {
      details?: GeometryErrorDetails;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "GeometryError";
    this.code = code;
    this.details = options.details ?? {};
    this.retryable = options.retryable ?? code === "INTERNAL_ERROR";
  }
}

/** Narrow an unknown thrown value to a `GeometryError` if possible. */
export function toGeometryError(error: unknown): GeometryError | null {
  return error instanceof GeometryError ? error : null;
}
