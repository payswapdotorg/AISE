/**
 * Typed, fail-closed errors for the AISE-014 model-QA service.
 *
 * Discipline (the AISE-009/010/011/012/013 pattern):
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
 * Fail-closed semantics (architecture-lock §3, AISE-014 CRITICAL):
 * the QA layer never produces a report on inputs it could not
 * validate — an `INVALID_INPUT`-class failure is an explicit,
 * machine-readable outcome, never a silently degraded report.
 */
import { EngineeringModelError, EvidenceError } from "@aise/engineering-model";

/** Machine-readable model-QA error codes. */
export type ModelQaErrorCode =
  /** The QA run input is structurally invalid (profile, version, ids). */
  | "QA_INPUT_INVALID"
  /** The requested model/version does not exist (reader port). */
  | "MODEL_NOT_FOUND"
  /** The graph failed boundary validation (tampered or malformed). */
  | "GRAPH_INVALID"
  /** The evidence mapping snapshot failed boundary validation. */
  | "MAPPING_INVALID"
  /** The readiness context failed structural validation. */
  | "CONTEXT_INVALID"
  /** The graph does not belong to the requested project. */
  | "PROJECT_MISMATCH"
  /** Bounded-compute limits exceeded. */
  | "BOUNDS_EXCEEDED"
  /** An internal invariant broke (retryable class; never masks bad input). */
  | "INTERNAL_ERROR";

/** Structured details attached to a model-QA error. */
export interface ModelQaErrorDetails {
  readonly code: ModelQaErrorCode;
  readonly fields?: Readonly<Record<string, string>>;
}

/** The fail-closed error type of the model-QA service. */
export class ModelQaError extends Error {
  readonly code: ModelQaErrorCode;
  readonly details: ModelQaErrorDetails;
  /** The wrapped cause's code when a pure-layer error was wrapped. */
  readonly causeCode?: string;

  constructor(
    code: ModelQaErrorCode,
    message: string,
    options?: { details?: ModelQaErrorDetails["fields"]; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ModelQaError";
    this.code = code;
    this.causeCode =
      options?.cause instanceof EngineeringModelError || options?.cause instanceof EvidenceError
        ? options.cause.code
        : options?.cause instanceof Error && "code" in options.cause
          ? String((options.cause as { code: unknown }).code)
          : undefined;
    this.details = { code, ...(options?.details !== undefined ? { fields: options.details } : {}) };
  }
}

/** Narrow `error` to a `ModelQaError` when possible. */
export function isModelQaError(error: unknown): error is ModelQaError {
  return error instanceof ModelQaError;
}

/**
 * Wraps unknown errors into `ModelQaError`. Known pure-layer
 * failures keep their identity in `causeCode`; everything else
 * becomes `INTERNAL_ERROR` (the honest catch-all — never masks a
 * validation failure as an internal one).
 */
export function toModelQaError(error: unknown): ModelQaError {
  if (error instanceof ModelQaError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new ModelQaError("INTERNAL_ERROR", `unexpected model-qa failure: ${message}`, { cause: error });
}
