/**
 * Typed, fail-closed errors for the AISE-021 rules service.
 *
 * Discipline (the AISE-009/013/014 pattern):
 *
 * - every failure has a stable machine code and a human message;
 * - `details` carries the offending field/value for observability;
 * - wrapped pure-layer causes (`EngineeringModelError`) are
 *   preserved as `cause` with their code — the failure chain is
 *   inspectable, never flattened;
 * - every code is non-retryable BY CONSTRUCTION (the inputs are
 *   wrong or the boundary is violated; retrying identical inputs
 *   produces the identical failure) except `INTERNAL_ERROR`.
 *
 * Fail-closed semantics (architecture-lock §3, AC-111): a
 * CRITICAL rule evaluation is never produced over unverifiable
 * inputs — the evaluation either computes honestly, reports
 * UNKNOWN for what it cannot establish, or throws.
 */
import { EngineeringModelError } from "@aise/engineering-model";

/** Machine-readable rules error codes. */
export type RulesErrorCode =
  /** The run input is invalid (graph/profile/version/rule set mismatch). */
  | "RULES_INPUT_INVALID"
  /** A rule set failed its own construction validation. */
  | "RULESET_INVALID"
  /** The graph failed boundary validation (tampered or malformed). */
  | "GRAPH_INVALID"
  /** The mapping snapshot failed boundary validation. */
  | "MAPPING_INVALID"
  /** The readiness context failed structural validation. */
  | "CONTEXT_INVALID"
  /** The requested model/version does not exist. */
  | "MODEL_NOT_FOUND"
  /** Bounded-compute limits exceeded. */
  | "BOUNDS_EXCEEDED"
  /** An internal invariant broke (retryable class; never masks bad input). */
  | "INTERNAL_ERROR";

/** Structured details attached to a rules error. */
export interface RulesErrorDetails {
  readonly code: RulesErrorCode;
  readonly fields?: Readonly<Record<string, string>>;
}

/** The fail-closed error type of the rules service. */
export class RulesError extends Error {
  readonly code: RulesErrorCode;
  readonly details: RulesErrorDetails;
  /** The wrapped cause's code when a pure-layer error was wrapped. */
  readonly causeCode?: string;

  constructor(
    code: RulesErrorCode,
    message: string,
    options?: { details?: RulesErrorDetails["fields"]; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "RulesError";
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

/** Narrow `error` to a `RulesError` when possible. */
export function isRulesError(error: unknown): error is RulesError {
  return error instanceof RulesError;
}

/**
 * Wraps unknown errors into `RulesError`. Known
 * `EngineeringModelError` causes keep their code visible in
 * `causeCode`; unknown errors become `INTERNAL_ERROR`.
 */
export function toRulesError(error: unknown, context: string): RulesError {
  if (error instanceof RulesError) {
    return error;
  }
  if (error instanceof EngineeringModelError) {
    return new RulesError(
      "GRAPH_INVALID",
      `${context}: engineering-model layer rejected the input: ${error.message}`,
      { details: { causeCode: error.code }, cause: error },
    );
  }
  return new RulesError("INTERNAL_ERROR", `${context}: ${errorMessage(error)}`, {
    cause: error,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
