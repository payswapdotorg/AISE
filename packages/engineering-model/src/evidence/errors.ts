/**
 * Evidence-subsystem error type (AISE-012).
 *
 * Fail-closed discipline identical to the parent model's
 * `EngineeringModelError`: every failure is a typed error with a
 * stable code, a human message, and a JSON-shaped detail record.
 * The evidence subsystem is CRITICAL assurance (measurements,
 * evidence, authoritative provenance semantics — assurance.md),
 * so its failure surface is explicit and never swallowed.
 *
 * The code vocabulary is deliberately separate from the parent
 * `ModelErrorCode` union: the evidence subsystem has its own
 * failure modes (source bindings, links, retractions, mapping
 * integrity) and must not silently grow model-domain codes.
 * Wrapping/cause preservation lives at the service boundary
 * (`@aise/backend-evidence`), mirroring how the reality-model
 * service wraps `EngineeringModelError` causes.
 */

/** Evidence-error detail record (string-keyed, JSON-shaped). */
export type EvidenceErrorDetails = Readonly<Record<string, string>>;

export type EvidenceErrorCode =
  /** A malformed evidence record or field (records, sources). */
  | "EVIDENCE_INVALID"
  /** The declared evidence kind is incompatible with its source. */
  | "KIND_INCOMPATIBLE"
  /** A malformed assertion-subject reference. */
  | "SUBJECT_INVALID"
  /** A subject reference that does not resolve in the committed graph. */
  | "SUBJECT_NOT_FOUND"
  /** A link target that does not resolve to registered evidence. */
  | "EVIDENCE_NOT_FOUND"
  /** A malformed evidence link. */
  | "LINK_INVALID"
  /** A malformed or inconsistent retraction. */
  | "RETRACTION_INVALID"
  /** Conflicting content for an existing identity (fail-closed merge). */
  | "IDENTITY_COLLISION"
  /** The evidence mapping aggregate violates an integrity rule. */
  | "MAPPING_INVALID"
  /** Unexpected internal failure (never a domain outcome). */
  | "INTERNAL_ERROR";

/** Typed fail-closed error thrown by the evidence subsystem. */
export class EvidenceError extends Error {
  readonly code: EvidenceErrorCode;
  readonly details: EvidenceErrorDetails;

  constructor(
    code: EvidenceErrorCode,
    message: string,
    options?: { details?: EvidenceErrorDetails },
  ) {
    super(message);
    this.name = "EvidenceError";
    this.code = code;
    this.details = options?.details ?? {};
  }
}

/** Narrows an unknown thrown value to an `EvidenceError`. */
export function toEvidenceError(error: unknown): EvidenceError {
  if (error instanceof EvidenceError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new EvidenceError("INTERNAL_ERROR", message);
}
