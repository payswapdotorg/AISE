/**
 * Typed contract errors (AISE-003).
 *
 * Contract failures are never silent and never stringly-typed. Every decode
 * or encode failure throws a `ContractError` subclass carrying a stable
 * machine-readable `code`, the contract family and object name, and
 * structured issues. Error messages are deterministic (no timestamps, no
 * randomness) so tests and consumers can rely on them.
 */

import type { ContractFamily } from "./contracts.version";

export type ContractErrorCode =
  | "CONTRACT_VERSION_MISMATCH"
  | "CONTRACT_DECODE_ERROR"
  | "CONTRACT_ENCODE_ERROR";

/** Identifies the wire object a failure refers to. */
export interface ContractObjectContext {
  readonly family: ContractFamily;
  readonly objectName: string;
}

/** One structured validation issue (path is a JSON pointer-ish path). */
export interface ContractIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
  readonly code: string;
}

export class ContractError extends Error {
  readonly code: ContractErrorCode;
  readonly family: ContractFamily;
  readonly objectName: string;

  constructor(
    code: ContractErrorCode,
    context: ContractObjectContext,
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
export class ContractVersionMismatchError extends ContractError {
  readonly expected: string;
  readonly received: string;

  constructor(
    context: ContractObjectContext,
    expected: string,
    received: string,
    operation: "decode" | "encode" = "decode",
  ) {
    super(
      "CONTRACT_VERSION_MISMATCH",
      context,
      `contract version mismatch on ${operation} of ${context.family}.${context.objectName}: ` +
        `expected ${expected} (or same major), received ${received}`,
    );
    this.expected = expected;
    this.received = received;
  }
}

/** A payload failed schema validation on decode. */
export class ContractDecodeError extends ContractError {
  readonly issues: readonly ContractIssue[];

  constructor(context: ContractObjectContext, issues: readonly ContractIssue[]) {
    super(
      "CONTRACT_DECODE_ERROR",
      context,
      `failed to decode ${context.family}.${context.objectName}: ` +
        issues.map((issue) => `${issue.path.join("/") || "<root>"} ${issue.message}`).join("; "),
    );
    this.issues = issues;
  }
}

/** A value failed schema validation (or carried an unusable version) on encode. */
export class ContractEncodeError extends ContractError {
  readonly issues: readonly ContractIssue[];

  constructor(context: ContractObjectContext, issues: readonly ContractIssue[]) {
    super(
      "CONTRACT_ENCODE_ERROR",
      context,
      `failed to encode ${context.family}.${context.objectName}: ` +
        issues.map((issue) => `${issue.path.join("/") || "<root>"} ${issue.message}`).join("; "),
    );
    this.issues = issues;
  }
}
