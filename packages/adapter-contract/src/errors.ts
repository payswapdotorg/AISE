/**
 * Typed adapter-contract errors (PROD-016).
 *
 * Mirrors the `@aise/shared-contracts` error discipline (own classes, because
 * the family/object context here is this package's, not that package's):
 * contract failures are never silent and never stringly-typed. Every decode
 * or encode failure throws an `AdapterContractError` subclass carrying a
 * stable machine-readable `code`, the contract family and object name, and
 * structured issues. Error messages are deterministic (no timestamps, no
 * randomness) so tests and consumers can rely on them.
 */

import type { AdapterContractFamily } from "./adapter-contracts.version";

export type AdapterContractErrorCode =
  | "ADAPTER_CONTRACT_VERSION_MISMATCH"
  | "ADAPTER_CONTRACT_DECODE_ERROR"
  | "ADAPTER_CONTRACT_ENCODE_ERROR";

/** Identifies the adapter wire object a failure refers to. */
export interface AdapterContractObjectContext {
  readonly family: AdapterContractFamily;
  readonly objectName: string;
}

/** One structured validation issue (path is a JSON pointer-ish path). */
export interface AdapterContractIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
  readonly code: string;
}

export class AdapterContractError extends Error {
  readonly code: AdapterContractErrorCode;
  readonly family: AdapterContractFamily;
  readonly objectName: string;

  constructor(
    code: AdapterContractErrorCode,
    context: AdapterContractObjectContext,
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
export class AdapterContractVersionMismatchError extends AdapterContractError {
  readonly expected: string;
  readonly received: string;

  constructor(
    context: AdapterContractObjectContext,
    expected: string,
    received: string,
    operation: "decode" | "encode" = "decode",
  ) {
    super(
      "ADAPTER_CONTRACT_VERSION_MISMATCH",
      context,
      `adapter contract version mismatch on ${operation} of ` +
        `${context.family}.${context.objectName}: expected ${expected} ` +
        `(or same major), received ${received}`,
    );
    this.expected = expected;
    this.received = received;
  }
}

/** A payload failed schema validation on decode. */
export class AdapterContractDecodeError extends AdapterContractError {
  readonly issues: readonly AdapterContractIssue[];

  constructor(
    context: AdapterContractObjectContext,
    issues: readonly AdapterContractIssue[],
  ) {
    super(
      "ADAPTER_CONTRACT_DECODE_ERROR",
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
export class AdapterContractEncodeError extends AdapterContractError {
  readonly issues: readonly AdapterContractIssue[];

  constructor(
    context: AdapterContractObjectContext,
    issues: readonly AdapterContractIssue[],
  ) {
    super(
      "ADAPTER_CONTRACT_ENCODE_ERROR",
      context,
      `failed to encode ${context.family}.${context.objectName}: ` +
        issues
          .map((issue) => `${issue.path.join("/") || "<root>"} ${issue.message}`)
          .join("; "),
    );
    this.issues = issues;
  }
}
