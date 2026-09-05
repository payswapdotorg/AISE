/**
 * Export-2D error model (AISE-017).
 *
 * Every failure inside the 2D plan/elevation projection is a
 * typed `Export2dError` carrying a machine-readable `code`, a
 * human-readable message, structured `details`, and a
 * `retryable` flag — mirroring the AISE-010 semantics discipline
 * that retry decisions are data-driven (never message parsing).
 *
 * Default semantics are FAIL-CLOSED and NON-RETRYABLE by
 * construction: the projection is a deterministic pure function
 * of the canonical graph, so re-running an identical input can
 * never succeed where it failed before. The only retryable code
 * is `INTERNAL_ERROR` (an implementation defect, not a property
 * of the input).
 *
 * Projection failures are honest limitations, never coerced
 * geometry: an object whose plane is oblique to the requested
 * view is reported unprojected in the document (`oblique-plane`)
 * rather than approximated into a wrong polygon or segment —
 * fail-closed display beats plausible-looking fabrication.
 */

/** Machine-readable failure codes for the 2D projection. */
export type Export2dErrorCode =
  /** Well-formedness failure in the request or the graph input. */
  | "VALIDATION_FAILED"
  /** A coordinate/numeric input is not finite (NaN/±Infinity). */
  | "NON_FINITE_INPUT"
  /** A requested view direction is not a finite unit vector. */
  | "VIEW_DIRECTION_INVALID"
  /**
   * A requested elevation direction is not horizontal (not
   * orthogonal to the scene up axis within tolerance).
   */
  | "VIEW_DIRECTION_NOT_HORIZONTAL"
  /**
   * The model's declared space frame is absent, so no projection
   * basis/unit can be derived deterministically.
   */
  | "FRAME_DECLARATION_MISSING"
  /** Unexpected internal failure (implementation defect). */
  | "INTERNAL_ERROR";

/** Structured details payload for projection failures. */
export interface Export2dErrorDetails {
  readonly [key: string]: unknown;
}

/** Typed, fail-closed 2D-projection failure. */
export class Export2dError extends Error {
  readonly code: Export2dErrorCode;
  readonly details: Export2dErrorDetails;
  readonly retryable: boolean;

  constructor(
    code: Export2dErrorCode,
    message: string,
    options: {
      details?: Export2dErrorDetails;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "Export2dError";
    this.code = code;
    this.details = options.details ?? {};
    this.retryable = options.retryable ?? code === "INTERNAL_ERROR";
  }
}

/** Narrow an unknown thrown value to an `Export2dError` if possible. */
export function toExport2dError(error: unknown): Export2dError | null {
  return error instanceof Export2dError ? error : null;
}
