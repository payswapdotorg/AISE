/**
 * AISE-031 historical-comparison error contract (fail-closed).
 *
 * Every failure mode of the comparison boundary is a typed
 * `HistoryError` with a stable code — never a silent downgrade,
 * never a partial report. The comparison is a read-only
 * verification-family analysis: it never mutates the canonical
 * Reality Graph or the evidence mapping, so no error path can
 * leave written state behind.
 */
export type HistoryErrorCode =
  /** Malformed comparison input (wrong shapes, missing pins). */
  | "INPUT_INVALID"
  /** The two versions do not belong to the same model/project. */
  | "MODEL_MISMATCH"
  /** Version records are inconsistent (ordering, digests, identity). */
  | "VERSION_INVALID"
  /** A pinned graph digest does not match its content (tamper). */
  | "DIGEST_MISMATCH"
  /** Evidence graphs supplied for one side only. */
  | "EVIDENCE_ASYMMETRIC"
  /** A size cap was exceeded — fail closed, never truncate. */
  | "LIMIT_EXCEEDED"
  /** The produced report failed self-validation. */
  | "SELF_CHECK_FAILED"
  /** A report handed to the validator is not valid. */
  | "REPORT_INVALID";

export interface HistoryErrorDetails {
  readonly field?: string;
  readonly value?: string;
  readonly [key: string]: unknown;
}

export class HistoryError extends Error {
  readonly code: HistoryErrorCode;
  readonly details: HistoryErrorDetails;

  constructor(code: HistoryErrorCode, message: string, options?: { details?: HistoryErrorDetails }) {
    super(`[${code}] ${message}`);
    this.name = "HistoryError";
    this.code = code;
    this.details = Object.freeze({ ...(options?.details ?? {}) });
  }
}

/** Narrows an unknown throw to a HistoryError (never fabricates one). */
export function isHistoryError(error: unknown): error is HistoryError {
  return error instanceof HistoryError;
}
