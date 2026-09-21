/**
 * Typed solution-contract errors (PROD-021).
 *
 * Mirrors the `@aise/shared-contracts` / `@aise/adapter-contract` error
 * discipline (own classes, because the family/object context here is this
 * package's): contract failures are never silent and never stringly-typed.
 * Every decode, encode, construction or lifecycle failure throws a
 * `SolutionContractError` subclass carrying a stable machine-readable `code`,
 * the contract family and object name, and structured detail. Error messages
 * are deterministic (no timestamps, no randomness) so tests and consumers can
 * rely on them.
 */

import type { SolutionContractFamily } from "./solution-contracts.version";

export type SolutionContractErrorCode =
  | "SOLUTION_CONTRACT_VERSION_MISMATCH"
  | "SOLUTION_CONTRACT_DECODE_ERROR"
  | "SOLUTION_CONTRACT_ENCODE_ERROR"
  | "SOLUTION_CONTRACT_LIFECYCLE_ERROR";

/** Identifies the solution wire object a failure refers to. */
export interface SolutionContractObjectContext {
  readonly family: SolutionContractFamily;
  readonly objectName: string;
}

/** One structured validation issue (path is a JSON pointer-ish path). */
export interface SolutionContractIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
  readonly code: string;
}

export class SolutionContractError extends Error {
  readonly code: SolutionContractErrorCode;
  readonly family: SolutionContractFamily;
  readonly objectName: string;

  constructor(
    code: SolutionContractErrorCode,
    context: SolutionContractObjectContext,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.family = context.family;
    this.objectName = context.objectName;
  }
}

/**
 * A payload's `contractVersion` is not decodable by this package: either a
 * different major version, or a version string that does not compare
 * same-major with the family's current version. Never silently coerced.
 */
export class SolutionContractVersionMismatchError extends SolutionContractError {
  readonly expected: string;
  readonly received: string;

  constructor(
    context: SolutionContractObjectContext,
    expected: string,
    received: string,
    operation: "decode" | "encode" = "decode",
  ) {
    super(
      "SOLUTION_CONTRACT_VERSION_MISMATCH",
      context,
      `solution contract version mismatch on ${operation} of ` +
        `${context.family}.${context.objectName}: expected ${expected} ` +
        `(or same major), received ${received}`,
    );
    this.expected = expected;
    this.received = received;
  }
}

/** A payload failed schema validation on decode. */
export class SolutionContractDecodeError extends SolutionContractError {
  readonly issues: readonly SolutionContractIssue[];

  constructor(
    context: SolutionContractObjectContext,
    issues: readonly SolutionContractIssue[],
  ) {
    super(
      "SOLUTION_CONTRACT_DECODE_ERROR",
      context,
      `failed to decode ${context.family}.${context.objectName}: ` +
        issues
          .map((issue) => `${issue.path.join("/") || "<root>"} ${issue.message}`)
          .join("; "),
    );
    this.issues = issues;
  }
}

/** A value failed schema validation (or carried an unusable version) on encode. */
export class SolutionContractEncodeError extends SolutionContractError {
  readonly issues: readonly SolutionContractIssue[];

  constructor(
    context: SolutionContractObjectContext,
    issues: readonly SolutionContractIssue[],
  ) {
    super(
      "SOLUTION_CONTRACT_ENCODE_ERROR",
      context,
      `failed to encode ${context.family}.${context.objectName}: ` +
        issues
          .map((issue) => `${issue.path.join("/") || "<root>"} ${issue.message}`)
          .join("; "),
    );
    this.issues = issues;
  }
}

/**
 * An illegal solution lifecycle transition: the draft → validated →
 * superseded/abandoned state machine is version-pinned and terminal statuses
 * admit no further transitions. The error carries the attempted `from`/`to`
 * pair so callers can surface the exact governed rule that was violated.
 */
export class SolutionContractLifecycleError extends SolutionContractError {
  readonly from: string;
  readonly to: string;

  constructor(from: string, to: string) {
    super(
      "SOLUTION_CONTRACT_LIFECYCLE_ERROR",
      { family: "solution", objectName: "SolutionLifecycle" },
      `illegal solution lifecycle transition ${from} -> ${to} ` +
        `(governed table: draft -> validated | superseded | abandoned; ` +
        `validated -> superseded | abandoned; superseded and abandoned are terminal)`,
    );
    this.from = from;
    this.to = to;
  }
}
