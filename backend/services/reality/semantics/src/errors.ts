/**
 * Semantics error model (AISE-010).
 *
 * Every failure inside the architectural object extraction is a
 * typed `SemanticsError` carrying a machine-readable `code`, a
 * human-readable message, structured `details`, and a `retryable`
 * flag — mirroring the AISE-003/AISE-008/AISE-009 discipline that
 * retry decisions are data-driven (never message parsing).
 *
 * Default semantics are FAIL-CLOSED and NON-RETRYABLE by
 * construction: extraction is a deterministic function of its
 * inputs, so re-running an identical input can never succeed where
 * it failed before. The only retryable code is `INTERNAL_ERROR`,
 * which signals an implementation defect rather than a property of
 * the input.
 *
 * Underlying `GeometryError`s raised by the AISE-009 fitting
 * primitives are wrapped (never swallowed): the wrap records the
 * originating service, code, and message in `details.cause` so the
 * evidence chain survives the package boundary — the semantics
 * public surface only ever throws `SemanticsError`.
 */

/** Machine-readable failure codes for the semantics primitives. */
export type SemanticsErrorCode =
  /** Well-formedness failure in inputs or parameters. */
  | "VALIDATION_FAILED"
  /** A coordinate or numeric input is not finite (NaN/±Infinity). */
  | "NON_FINITE_INPUT"
  /** Fewer points than the stage requires. */
  | "INSUFFICIENT_POINTS"
  /**
   * The input geometry cannot determine the requested structure:
   * a cluster too small or too thin to be a wall, a plane whose
   * rectangle collapses, or points that do not support a plane.
   */
  | "DEGENERATE_GEOMETRY"
  /**
   * A plane fit required for extraction failed inside the AISE-009
   * geometry primitives (degenerate, invalid, or non-finite input).
   * The originating `GeometryError` code is preserved in
   * `details.cause`.
   */
  | "PLANE_FIT_FAILED"
  /** Combining geometry of different units without conversion. */
  | "MISMATCHED_UNITS"
  /** A derived object lacks complete method/parameter/input lineage. */
  | "PROVENANCE_INCOMPLETE"
  /**
   * An object claims an epistemic state it cannot have: extraction
   * output claiming OBSERVED/CONFIRMED/PROPOSED, or a derived
   * object outranking any of its inputs.
   */
  | "EPISTEMIC_STATE_INVALID"
  /**
   * The extracted scene is internally impossible: a floor at or
   * above the ceiling, an opening taller than its wall, or another
   * architectural contradiction. Contradictory geometry is rejected
   * (fail closed), never silently coerced.
   */
  | "GEOMETRY_CONTRADICTION"
  /**
   * Duplicate input content (two identical clusters) or colliding
   * deterministic object identities — both mean the input is not a
   * faithful set of distinct observations.
   */
  | "IDENTITY_COLLISION"
  /** Input exceeded a bounded-compute cap (points, segments, cells). */
  | "BOUNDS_EXCEEDED"
  /** Unexpected internal failure (implementation defect). */
  | "INTERNAL_ERROR";

/** Structured details payload for semantics failures. */
export interface SemanticsErrorDetails {
  readonly [key: string]: unknown;
}

/** Lineage of a wrapped failure from another AISE service. */
export interface ErrorCauseRecord {
  readonly service: string;
  readonly code: string;
  readonly message: string;
}

/** Typed, fail-closed semantics failure. */
export class SemanticsError extends Error {
  readonly code: SemanticsErrorCode;
  readonly details: SemanticsErrorDetails;
  readonly retryable: boolean;

  constructor(
    code: SemanticsErrorCode,
    message: string,
    options: {
      details?: SemanticsErrorDetails;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "SemanticsError";
    this.code = code;
    this.details = options.details ?? {};
    this.retryable = options.retryable ?? code === "INTERNAL_ERROR";
  }
}

/** Narrow an unknown thrown value to a `SemanticsError` if possible. */
export function toSemanticsError(error: unknown): SemanticsError | null {
  return error instanceof SemanticsError ? error : null;
}

/**
 * Wraps a failure raised by the AISE-009 geometry primitives into a
 * `PLANE_FIT_FAILED` semantics error, preserving the originating
 * service identity, code, and message in the evidence chain. Only
 * `GeometryError`s are wrapped; anything else becomes an
 * `INTERNAL_ERROR` (an implementation defect, retryable).
 */
export function wrapGeometryFailure(stage: string, error: unknown): SemanticsError {
  const geometryError = error as { name?: string; code?: string; message?: string } | null;
  if (
    error instanceof Error &&
    geometryError !== null &&
    geometryError.name === "GeometryError" &&
    typeof geometryError.code === "string"
  ) {
    return new SemanticsError(
      "PLANE_FIT_FAILED",
      `${stage}: plane fit failed — ${error.message}`,
      {
        details: {
          stage,
          cause: {
            service: "aise.geometry",
            code: geometryError.code,
            message: error.message,
          } satisfies ErrorCauseRecord,
        },
      },
    );
  }
  return new SemanticsError("INTERNAL_ERROR", `${stage}: unexpected internal failure`, {
    details: { stage, message: error instanceof Error ? error.message : String(error) },
    retryable: true,
  });
}
