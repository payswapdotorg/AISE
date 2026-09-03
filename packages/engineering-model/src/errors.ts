/**
 * Engineering-model error type (AISE-011).
 *
 * Every failure in the Reality Graph core is a typed, fail-closed
 * `EngineeringModelError`. The model is the canonical engineering
 * authority (architecture-lock §1: "the Reality Graph is the only
 * canonical structured engineering-model authority"), so nothing
 * enters or leaves it through an untyped failure path.
 *
 * Like the AISE-009/010 service errors, these are non-retryable by
 * construction: model construction and validation are pure
 * deterministic functions — retrying with the same invalid input
 * must fail identically, so no error here is transient. Transport
 * layers that wrap this package translate codes onto their own
 * retry vocabulary; the model itself makes no retry claim.
 */
/** Error detail record (string-keyed, JSON-shaped). */
export type EngineeringErrorDetails = Readonly<Record<string, string>>;

/**
 * All error codes of the Reality Graph core.
 *
 * Grouped by the invariant they protect:
 * - structural: `MODEL_INVALID`, `IDENTITY_COLLISION`, `REFERENTIAL_INTEGRITY`
 * - epistemic:  `EPISTEMIC_INVALID`, `EPISTEMIC_UPGRADE`
 * - semantic:   `PRESENCE_INVALID`, `MEASUREMENT_KIND_INVALID`, `PROVENANCE_INCOMPLETE`
 * - values:     `VALUE_INVALID`, `UNIT_INVALID`, `MISMATCHED_UNITS`
 * - identity:   `NOT_FOUND`, `MODEL_MISMATCH`
 */
export type ModelErrorCode =
  | "MODEL_INVALID"
  | "IDENTITY_COLLISION"
  | "REFERENTIAL_INTEGRITY"
  | "EPISTEMIC_INVALID"
  | "EPISTEMIC_UPGRADE"
  | "PRESENCE_INVALID"
  | "MEASUREMENT_KIND_INVALID"
  | "PROVENANCE_INCOMPLETE"
  | "VALUE_INVALID"
  | "UNIT_INVALID"
  | "MISMATCHED_UNITS"
  | "NOT_FOUND"
  | "MODEL_MISMATCH";

/** Typed fail-closed error thrown by every model constructor and validator. */
export class EngineeringModelError extends Error {
  readonly code: ModelErrorCode;
  readonly details: EngineeringErrorDetails;

  constructor(code: ModelErrorCode, message: string, options?: { details?: EngineeringErrorDetails }) {
    super(message);
    this.name = "EngineeringModelError";
    this.code = code;
    this.details = options?.details ?? {};
  }
}

/** Narrows an unknown thrown value to an `EngineeringModelError`. */
export function toEngineeringModelError(error: unknown): EngineeringModelError {
  if (error instanceof EngineeringModelError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new EngineeringModelError("MODEL_INVALID", message);
}
