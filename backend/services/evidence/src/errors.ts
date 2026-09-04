/**
 * Evidence-service error type (AISE-012 backend).
 *
 * Wraps the pure-layer `EvidenceError` causes (the AISE-010/011
 * pattern: wrapped upstream causes preserved; fail-closed;
 * non-retryable by construction — evidence registration, linking,
 * retraction, and validity computation are deterministic
 * functions of their inputs).
 */
import { EvidenceError, toEvidenceError } from "@aise/engineering-model";

/** Error detail record (string-keyed, JSON-shaped). */
export type EvidenceServiceErrorDetails = Readonly<Record<string, string>>;

export type EvidenceServiceErrorCode =
  | "EVIDENCE_INVALID"
  | "KIND_INCOMPATIBLE"
  | "SUBJECT_INVALID"
  | "SUBJECT_NOT_FOUND"
  | "EVIDENCE_NOT_FOUND"
  | "LINK_INVALID"
  | "RETRACTION_INVALID"
  | "IDENTITY_COLLISION"
  | "MAPPING_INVALID"
  | "CAPTURE_UPLOAD_NOT_FOUND"
  | "CAPTURE_BINDING_INVALID"
  | "MODEL_VERSION_NOT_FOUND"
  | "PROJECT_MISMATCH"
  | "EVIDENCE_RETRACTED"
  | "BOUNDS_EXCEEDED"
  | "INTERNAL_ERROR";

/** The cause chain entry for a wrapped pure-layer failure. */
export interface ErrorCauseRecord {
  readonly source: "engineering-model/evidence";
  readonly code: string;
  readonly message: string;
}

/** Typed fail-closed error thrown by the evidence-service boundary. */
export class EvidenceServiceError extends Error {
  readonly code: EvidenceServiceErrorCode;
  readonly details: EvidenceServiceErrorDetails;
  /** The wrapped pure-layer cause, when the failure originated there. */
  override readonly cause: EvidenceError | undefined;

  constructor(
    code: EvidenceServiceErrorCode,
    message: string,
    options?: { details?: EvidenceServiceErrorDetails; cause?: unknown },
  ) {
    super(message);
    this.name = "EvidenceServiceError";
    this.code = code;
    this.details = options?.details ?? {};
    this.cause =
      options?.cause !== undefined && options.cause instanceof EvidenceError
        ? options.cause
        : undefined;
  }

  /** Structured cause chain for logs and error envelopes. */
  errorCauses(): readonly ErrorCauseRecord[] {
    if (this.cause === undefined) {
      return [];
    }
    return [
      {
        source: "engineering-model/evidence",
        code: this.cause.code,
        message: this.cause.message,
      },
    ];
  }
}

/**
 * Narrows an unknown thrown value to an `EvidenceServiceError`.
 * Pure-layer codes present in this service's vocabulary pass
 * through; the rest surface as `EVIDENCE_INVALID` with the
 * original cause preserved in the chain.
 */
export function toEvidenceServiceError(error: unknown): EvidenceServiceError {
  if (error instanceof EvidenceServiceError) {
    return error;
  }
  if (error instanceof EvidenceError) {
    return new EvidenceServiceError(toServiceCode(error.code), error.message, { cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new EvidenceServiceError("INTERNAL_ERROR", message);
}

function toServiceCode(code: string): EvidenceServiceErrorCode {
  switch (code) {
    case "EVIDENCE_INVALID":
    case "KIND_INCOMPATIBLE":
    case "SUBJECT_INVALID":
    case "SUBJECT_NOT_FOUND":
    case "EVIDENCE_NOT_FOUND":
    case "LINK_INVALID":
    case "RETRACTION_INVALID":
    case "IDENTITY_COLLISION":
    case "MAPPING_INVALID":
      return code;
    default:
      return "EVIDENCE_INVALID";
  }
}

export { toEvidenceError };
