/**
 * Typed, fail-closed errors for the AISE-022 benchmark harness.
 *
 * Discipline (the AISE-009..021 pattern): stable machine codes,
 * human messages, offending field/value in `details`; every code
 * is non-retryable by construction (identical inputs produce the
 * identical failure) except `INTERNAL_ERROR`.
 *
 * Fail-closed semantics: a benchmark run never reports success
 * over inputs it cannot verify — a tampered or malformed
 * baseline, an unresolvable case, or a broken fixture throws
 * instead of silently skipping.
 */
/** Machine-readable benchmark error codes. */
export type BenchmarkErrorCode =
  /** A case/fixture input is invalid. */
  | "BENCH_INPUT_INVALID"
  /** A committed baseline record is invalid or tampered. */
  | "BASELINE_INVALID"
  /** A regression was detected (the run's gate result). */
  | "REGRESSION_DETECTED"
  /** An internal invariant broke. */
  | "INTERNAL_ERROR";

/** Structured details attached to a benchmark error. */
export interface BenchmarkErrorDetails {
  readonly code: BenchmarkErrorCode;
  readonly fields?: Readonly<Record<string, string>>;
}

/** The fail-closed error type of the benchmark harness. */
export class BenchmarkError extends Error {
  readonly code: BenchmarkErrorCode;
  readonly details: BenchmarkErrorDetails;

  constructor(
    code: BenchmarkErrorCode,
    message: string,
    options?: { details?: BenchmarkErrorDetails["fields"] },
  ) {
    super(message);
    this.name = "BenchmarkError";
    this.code = code;
    this.details = { code, ...(options?.details !== undefined ? { fields: options.details } : {}) };
  }
}

/** Narrow `error` to a `BenchmarkError` when possible. */
export function isBenchmarkError(error: unknown): error is BenchmarkError {
  return error instanceof BenchmarkError;
}
