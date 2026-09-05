/**
 * Reporting error model (AISE-019).
 *
 * Every failure inside the site-report composition is a typed
 * `ReportingError` carrying a machine-readable `code`, a
 * human-readable message, structured `details`, and a
 * `retryable` flag — mirroring the sibling export services
 * (AISE-017/AISE-018) and the AISE-010 semantics discipline
 * that retry decisions are data-driven (never message parsing).
 *
 * Default semantics are FAIL-CLOSED and NON-RETRYABLE by
 * construction: the report is a deterministic pure function of
 * the immutable graph (plus the optional evidence graph and the
 * AISE-017 plan projection), so re-running an identical input
 * can never succeed where it failed before. The only retryable
 * code is `INTERNAL_ERROR` (an implementation defect, not a
 * property of the input).
 */

/** Machine-readable failure codes for the site report. */
export type ReportingErrorCode =
  /** Well-formedness failure in the request or the graph input. */
  | "VALIDATION_FAILED"
  /** The model's declared space frame is absent (no unit/up). */
  | "FRAME_DECLARATION_MISSING"
  /** Evidence/version pinning failure (subjects are version-pinned). */
  | "EVIDENCE_VERSION_MISMATCH"
  /** A text value cannot be encoded in the PDF ASCII profile. */
  | "TEXT_UNENCODABLE"
  /** A numeric value is not finite. */
  | "NON_FINITE_INPUT"
  /** Unexpected internal failure (implementation defect). */
  | "INTERNAL_ERROR";

/** Structured details payload for reporting failures. */
export interface ReportingErrorDetails {
  readonly [key: string]: unknown;
}

/** Typed, fail-closed site-report failure. */
export class ReportingError extends Error {
  readonly code: ReportingErrorCode;
  readonly details: ReportingErrorDetails;
  readonly retryable: boolean;

  constructor(
    code: ReportingErrorCode,
    message: string,
    options: {
      details?: ReportingErrorDetails;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "ReportingError";
    this.code = code;
    this.details = options.details ?? {};
    this.retryable = options.retryable ?? code === "INTERNAL_ERROR";
  }
}

/** Narrow an unknown thrown value to a `ReportingError` if possible. */
export function toReportingError(error: unknown): ReportingError | null {
  return error instanceof ReportingError ? error : null;
}
