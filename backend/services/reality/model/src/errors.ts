/**
 * Reality-model service error type (AISE-011 backend).
 *
 * Wraps the canonical-model `EngineeringModelError` causes (the
 * AISE-010 pattern: wrapped upstream causes preserved; fail-closed;
 * non-retryable by construction — persistence and deterministic
 * ingestion are pure functions of their inputs).
 */
import { EngineeringModelError, toEngineeringModelError } from "@aise/engineering-model";

/** Error detail record (string-keyed, JSON-shaped). */
export type RealityModelErrorDetails = Readonly<Record<string, string>>;

export type RealityModelErrorCode =
  | "MODEL_INVALID"
  | "MODEL_NOT_FOUND"
  | "MODEL_MISMATCH"
  | "IDENTITY_COLLISION"
  | "REFERENTIAL_INTEGRITY"
  | "EPISTEMIC_UPGRADE"
  | "PROVENANCE_INCOMPLETE"
  | "INGESTION_INVALID"
  | "INTERNAL_ERROR";

/** The cause chain entry for a wrapped canonical-model failure. */
export interface ErrorCauseRecord {
  readonly source: "engineering-model" | "semantics";
  readonly code: string;
  readonly message: string;
}

/** Typed fail-closed error thrown by the reality-model service boundary. */
export class RealityModelError extends Error {
  readonly code: RealityModelErrorCode;
  readonly details: RealityModelErrorDetails;
  /** The wrapped canonical-model cause, when the failure originated there. */
  override readonly cause: EngineeringModelError | undefined;

  constructor(
    code: RealityModelErrorCode,
    message: string,
    options?: { details?: RealityModelErrorDetails; cause?: unknown },
  ) {
    super(message);
    this.name = "RealityModelError";
    this.code = code;
    this.details = options?.details ?? {};
    this.cause = options?.cause !== undefined ? toEngineeringModelError(options.cause) : undefined;
  }

  /** Structured cause chain for logs and error envelopes. */
  errorCauses(): readonly ErrorCauseRecord[] {
    if (this.cause === undefined) {
      return [];
    }
    return [
      {
        source: "engineering-model",
        code: this.cause.code,
        message: this.cause.message,
      },
    ];
  }
}

/**
 * Narrows an unknown thrown value to a `RealityModelError`.
 * Canonical-model codes present in this service's vocabulary pass
 * through; the rest surface as `MODEL_INVALID` with the original
 * cause preserved in the chain.
 */
export function toRealityModelError(error: unknown): RealityModelError {
  if (error instanceof RealityModelError) {
    return error;
  }
  if (error instanceof EngineeringModelError) {
    return new RealityModelError(toServiceCode(error.code), error.message, { cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new RealityModelError("INTERNAL_ERROR", message);
}

function toServiceCode(code: string): RealityModelErrorCode {
  switch (code) {
    case "MODEL_INVALID":
    case "MODEL_MISMATCH":
    case "MODEL_NOT_FOUND":
    case "IDENTITY_COLLISION":
    case "REFERENTIAL_INTEGRITY":
    case "EPISTEMIC_UPGRADE":
    case "PROVENANCE_INCOMPLETE":
      return code;
    default:
      return "MODEL_INVALID";
  }
}
