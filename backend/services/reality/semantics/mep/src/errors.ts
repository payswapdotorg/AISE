/**
 * MEP pipe reconstruction error model (AISE-026).
 *
 * Every failure inside the pipe reconstruction is a typed
 * `MepError` carrying a machine-readable `code`, a human-readable
 * message, structured `details`, and a `retryable` flag — the
 * AISE-010 semantics discipline that retry decisions are
 * data-driven (never message parsing).
 *
 * Default semantics are FAIL-CLOSED and NON-RETRYABLE by
 * construction: the reconstruction is a deterministic pure
 * function of the canonicalized input, so re-running an
 * identical input can never succeed where it failed before. The
 * only retryable code is `INTERNAL_ERROR`.
 *
 * Reconstruction impossibilities are honest refusals, never
 * coerced geometry: clusters that cannot be fitted as pipes are
 * reported `unassigned` with explicit reasons (insufficient
 * points, non-cylindrical shape, too squat) — never forced into
 * plausible-looking pipes (the AISE-017 oblique-plane lesson).
 */

/** Machine-readable failure codes for the MEP pipe reconstruction. */
export type MepErrorCode =
  /** Well-formedness failure in the request or point input. */
  | "VALIDATION_FAILED"
  /** A coordinate/numeric input is not finite (NaN/±Infinity). */
  | "NON_FINITE_INPUT"
  /** The point cloud is empty (no reconstruction is possible). */
  | "EMPTY_INPUT"
  /** A declared option value is invalid. */
  | "OPTION_INVALID"
  /** The produced network failed the built-in validator (fail-closed self-check). */
  | "NETWORK_INVALID"
  /** Unexpected internal failure (implementation defect). */
  | "INTERNAL_ERROR";

/** Structured details payload for reconstruction failures. */
export interface MepErrorDetails {
  readonly [key: string]: unknown;
}

/** Typed, fail-closed MEP-reconstruction failure. */
export class MepError extends Error {
  readonly code: MepErrorCode;
  readonly details: MepErrorDetails;
  readonly retryable: boolean;

  constructor(
    code: MepErrorCode,
    message: string,
    options: {
      details?: MepErrorDetails;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "MepError";
    this.code = code;
    this.details = options.details ?? {};
    this.retryable = options.retryable ?? code === "INTERNAL_ERROR";
  }
}

/** Narrow an unknown thrown value to an `MepError` if possible. */
export function toMepError(error: unknown): MepError | null {
  return error instanceof MepError ? error : null;
}
