/**
 * Typed, fail-closed errors for the AISE-013 assurance service.
 *
 * Discipline (the AISE-009/010/011/012 pattern):
 *
 * - every failure has a stable machine code and a human message;
 * - `details` carries the offending field/value for observability;
 * - wrapped pure-layer causes (`EngineeringModelError`,
 *   `EvidenceError`) are preserved as `cause` with their code —
 *   the failure chain is inspectable, never flattened;
 * - every code is non-retryable BY CONSTRUCTION (the inputs are
 *   wrong or the boundary is violated; retrying identical inputs
 *   produces the identical failure) except `INTERNAL_ERROR`, the
 *   catch-all for unexpected runtime conditions.
 *
 * Fail-closed semantics (architecture-lock §3): a CRITICAL
 * readiness result is never produced on missing or ambiguous
 * inputs — the assessment either computes honestly or throws.
 */
import { EngineeringModelError, EvidenceError } from "@aise/engineering-model";

/** Machine-readable assurance error codes. */
export type AssuranceErrorCode =
  /** A task profile input is invalid (enums, budget, ids). */
  | "PROFILE_INVALID"
  /** An intent-engine input is invalid (unknown intent/profile). */
  | "INTENT_INVALID"
  /** A declared profile is below the intent's contract floor (AISE-020). */
  | "INTENT_PROFILE_BELOW_FLOOR"
  /** The requested task profile is not registered for the project. */
  | "TASK_NOT_FOUND"
  /** The requested model/version does not exist. */
  | "MODEL_NOT_FOUND"
  /** The model does not belong to the requested project. */
  | "PROJECT_MISMATCH"
  /** The graph failed boundary validation (tampered or malformed). */
  | "GRAPH_INVALID"
  /** The mapping snapshot failed boundary validation. */
  | "MAPPING_INVALID"
  /** A stored record failed integrity re-verification (tampered storage). */
  | "RECORD_INVALID"
  /** Bounded-compute limits exceeded. */
  | "BOUNDS_EXCEEDED"
  /** An internal invariant broke (retryable class; never masks bad input). */
  | "INTERNAL_ERROR";

/** Structured details attached to an assurance error. */
export interface AssuranceErrorDetails {
  readonly code: AssuranceErrorCode;
  readonly fields?: Readonly<Record<string, string>>;
}

/** The fail-closed error type of the assurance service. */
export class AssuranceError extends Error {
  readonly code: AssuranceErrorCode;
  readonly details: AssuranceErrorDetails;
  /** The wrapped cause's code when a pure-layer error was wrapped. */
  readonly causeCode?: string;

  constructor(
    code: AssuranceErrorCode,
    message: string,
    options?: { details?: AssuranceErrorDetails["fields"]; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AssuranceError";
    this.code = code;
    this.causeCode =
      options?.cause instanceof EngineeringModelError
        ? options.cause.code
        : options?.cause instanceof Error && "code" in options.cause
          ? String((options.cause as { code: unknown }).code)
          : undefined;
    this.details = { code, ...(options?.details !== undefined ? { fields: options.details } : {}) };
  }
}

/** Narrow `error` to an `AssuranceError` when possible. */
export function isAssuranceError(error: unknown): error is AssuranceError {
  return error instanceof AssuranceError;
}

/**
 * Wraps unknown errors into `AssuranceError`. Known
 * `EngineeringModelError` causes keep their code visible in
 * `causeCode`; unknown errors become `INTERNAL_ERROR` (the only
 * retryable-by-class code) with the original as `cause`.
 */
export function toAssuranceError(error: unknown, context: string): AssuranceError {
  if (error instanceof AssuranceError) {
    return error;
  }
  if (error instanceof EngineeringModelError) {
    return new AssuranceError(
      "GRAPH_INVALID",
      `${context}: engineering-model layer rejected the input: ${error.message}`,
      { details: { causeCode: error.code }, cause: error },
    );
  }
  if (error instanceof EvidenceError) {
    return new AssuranceError(
      "MAPPING_INVALID",
      `${context}: evidence layer rejected the mapping: ${error.message}`,
      { details: { causeCode: error.code }, cause: error },
    );
  }
  return new AssuranceError("INTERNAL_ERROR", `${context}: ${errorMessage(error)}`, {
    cause: error,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
