/**
 * Typed anchoring-contract errors (ANCHOR-002).
 *
 * Mirrors the `@aise/shared-contracts` / `@aise/solution-contract` error
 * discipline (own classes, because the family/object context here is this
 * package's): contract failures are never silent and never stringly-typed.
 * Every decode, encode or construction failure throws an
 * `AnchoringContractError` subclass carrying a stable machine-readable
 * `code`, the contract family and object name, and structured detail. Error
 * messages are deterministic (no timestamps, no randomness).
 */

import type { AnchoringContractFamily } from "./anchoring-contracts.version";

export type AnchoringContractErrorCode =
  | "ANCHORING_CONTRACT_VERSION_MISMATCH"
  | "ANCHORING_CONTRACT_DECODE_ERROR"
  | "ANCHORING_CONTRACT_ENCODE_ERROR"
  | "ANCHORING_CONTRACT_INVARIANT_ERROR";

/** Identifies the anchoring wire object a failure refers to. */
export interface AnchoringContractObjectContext {
  readonly family: AnchoringContractFamily;
  readonly objectName: string;
}

/** One structured validation issue (path is a JSON pointer-ish path). */
export interface AnchoringContractIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
  readonly code: string;
}

export class AnchoringContractError extends Error {
  readonly code: AnchoringContractErrorCode;
  readonly family: AnchoringContractFamily;
  readonly objectName: string;

  constructor(
    code: AnchoringContractErrorCode,
    context: AnchoringContractObjectContext,
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
 * A payload's `contractVersion` is not decodable by this package: a
 * different major version, or a version string that does not compare
 * same-major with the family's current version. Never silently coerced.
 */
export class AnchoringContractVersionMismatchError extends AnchoringContractError {
  readonly expected: string;
  readonly received: string;

  constructor(
    context: AnchoringContractObjectContext,
    expected: string,
    received: string,
    operation: "decode" | "encode" = "decode",
  ) {
    super(
      "ANCHORING_CONTRACT_VERSION_MISMATCH",
      context,
      `anchoring contract version mismatch on ${operation} of ` +
        `${context.family}.${context.objectName}: expected ${expected} ` +
        `(or same major), received ${received}`,
    );
    this.expected = expected;
    this.received = received;
  }
}

/** A payload failed schema validation on decode. */
export class AnchoringContractDecodeError extends AnchoringContractError {
  readonly issues: readonly AnchoringContractIssue[];

  constructor(
    context: AnchoringContractObjectContext,
    issues: readonly AnchoringContractIssue[],
  ) {
    super(
      "ANCHORING_CONTRACT_DECODE_ERROR",
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
export class AnchoringContractEncodeError extends AnchoringContractError {
  readonly issues: readonly AnchoringContractIssue[];

  constructor(
    context: AnchoringContractObjectContext,
    issues: readonly AnchoringContractIssue[],
  ) {
    super(
      "ANCHORING_CONTRACT_ENCODE_ERROR",
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
 * A typed construction invariant failed (law-level helpers): e.g. a refusal
 * carrying hypotheses, a partial whose accounting does not cover every
 * requested still exactly once, or an invented content id. The laws are the
 * gate — never a suggestion.
 */
export class AnchoringContractInvariantError extends AnchoringContractError {
  readonly violations: ReadonlyArray<{ readonly path: string; readonly detail: string }>;

  constructor(
    context: AnchoringContractObjectContext,
    violations: ReadonlyArray<{ readonly path: string; readonly detail: string }>,
  ) {
    super(
      "ANCHORING_CONTRACT_INVARIANT_ERROR",
      context,
      `anchoring invariant violated on ${context.family}.${context.objectName}: ` +
        violations.map((v) => `${v.path || "<root>"} ${v.detail}`).join("; "),
    );
    this.violations = violations;
  }
}
