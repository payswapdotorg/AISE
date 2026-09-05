/**
 * Export-DXF error model (AISE-019).
 *
 * Every failure inside the DXF serialization is a typed
 * `ExportDxfError` carrying a machine-readable `code`, a
 * human-readable message, structured `details`, and a
 * `retryable` flag — mirroring the sibling export services
 * (AISE-017/AISE-018) and the AISE-010 semantics discipline
 * that retry decisions are data-driven (never message parsing).
 *
 * Default semantics are FAIL-CLOSED and NON-RETRYABLE by
 * construction: the DXF serialization is a deterministic pure
 * function of the immutable plan document, so re-running an
 * identical input can never succeed where it failed before. The
 * only retryable code is `INTERNAL_ERROR` (an implementation
 * defect, not a property of the input).
 *
 * Serialization failures are honest refusals, never coerced
 * output: a document containing a value that cannot be encoded
 * in the chosen DXF profile (non-finite coordinate, non-ASCII
 * text, unknown frame unit) fails closed with a typed error —
 * a plausible-looking drawing of wrong numbers would be worse
 * than no drawing (the same fail-closed-display discipline as
 * the AISE-017 oblique-plane refusal).
 */

/** Machine-readable failure codes for the DXF export. */
export type ExportDxfErrorCode =
  /** Well-formedness failure in the request or the plan document input. */
  | "VALIDATION_FAILED"
  /** A coordinate/numeric value is not finite (NaN/±Infinity). */
  | "NON_FINITE_INPUT"
  /** A text value cannot be encoded in the DXF ASCII profile. */
  | "TEXT_UNENCODABLE"
  /** The model's declared frame unit has no DXF $INSUNITS mapping. */
  | "UNIT_UNMAPPABLE"
  /** Structural self-conformance failure (the emitted file failed the built-in validator). */
  | "DXF_INVALID"
  /** Unexpected internal failure (implementation defect). */
  | "INTERNAL_ERROR";

/** Structured details payload for DXF export failures. */
export interface ExportDxfErrorDetails {
  readonly [key: string]: unknown;
}

/** Typed, fail-closed DXF-export failure. */
export class ExportDxfError extends Error {
  readonly code: ExportDxfErrorCode;
  readonly details: ExportDxfErrorDetails;
  readonly retryable: boolean;

  constructor(
    code: ExportDxfErrorCode,
    message: string,
    options: {
      details?: ExportDxfErrorDetails;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "ExportDxfError";
    this.code = code;
    this.details = options.details ?? {};
    this.retryable = options.retryable ?? code === "INTERNAL_ERROR";
  }
}

/** Narrow an unknown thrown value to an `ExportDxfError` if possible. */
export function toExportDxfError(error: unknown): ExportDxfError | null {
  return error instanceof ExportDxfError ? error : null;
}
