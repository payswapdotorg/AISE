/**
 * Wire codec engine (AISE-003).
 *
 * One deterministic decode/encode pipeline shared by every wire object:
 *
 *  DECODE (default):
 *    1. reject non-object payloads with a typed error;
 *    2. if `contractVersion` is present as a string and is NOT same-major
 *       with the family version, fail fast with `ContractVersionMismatchError`
 *       (a v0 or v2 payload is never silently accepted);
 *    3. validate with the open wire schema — unknown keys are preserved, so
 *       a payload produced by a newer minor of the same major round-trips
 *       without data loss;
 *    4. schema violations (including a missing/malformed `contractVersion`)
 *       surface as `ContractDecodeError` with structured issues.
 *
 *  DECODE (strict): same, then walks the schema against the decoded value
 *    and rejects unknown keys at ANY object nesting level (issue code
 *    `unrecognized_keys`). Canonical-validation mode for producers and
 *    internal pipelines. Open maps (`z.record` fields) stay open in strict
 *    mode — their keys are data, not schema drift.
 *
 *  ENCODE:
 *    - stamps `contractVersion` with the family version when absent;
 *    - rejects values carrying any other version (typed error — never
 *      silently rewritten);
 *    - validates with the wire schema and emits canonical JSON
 *      (recursively sorted keys, 2-space indent, trailing newline), so the
 *      same value always produces identical bytes.
 */

import { z } from "zod";
import type { ContractFamily } from "./contracts.version";
import { familyVersion, parseMajorVersion, sameMajorVersion } from "./contracts.version";
import {
  ContractDecodeError,
  ContractEncodeError,
  ContractVersionMismatchError,
  type ContractIssue,
} from "./errors";
import { canonicalJsonStringify } from "./common";
import { collectUnknownKeyPaths } from "./strictness";

export interface WireCodecOptions<T extends object> {
  /** Wire object name, e.g. `"DeviceCapabilityProfile"`. */
  readonly name: string;
  readonly family: ContractFamily;
  /** Open wire schema (unknown keys preserved on decode). */
  readonly schema: z.ZodType<T>;
}

export interface WireCodec<T extends object> {
  readonly name: string;
  readonly family: ContractFamily;
  readonly contractVersion: string;
  /** The single wire schema (also used for JSON Schema generation). */
  readonly schema: z.ZodType<T>;
  /** Decode preserving unknown fields (default wire behavior). */
  decode(payload: unknown): T;
  /** Decode rejecting unknown fields at any object nesting level. */
  decodeStrict(payload: unknown): T;
  /** Canonical-JSON encode; stamps the family version when absent. */
  encode(value: T): string;
}

function toIssues(error: z.ZodError): ContractIssue[] {
  return error.issues.map((issue) => ({
    path: [...issue.path],
    message: issue.message,
    code: issue.code,
  }));
}

function unknownKeyIssues(paths: readonly string[]): ContractIssue[] {
  return paths.map((path) => ({
    path: path.split("."),
    message: "unrecognized key",
    code: "unrecognized_keys",
  }));
}

function decodeValue<T>(
  context: { family: ContractFamily; objectName: string },
  schema: z.ZodType<T>,
  payload: unknown,
  strict: boolean,
): T {
  const expected = familyVersion(context.family);

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ContractDecodeError(context, [
      { path: [], message: "expected a JSON object", code: "invalid_type" },
    ]);
  }

  // Version gate before schema parse: a VALID semver version that is not
  // same-major with the family version (e.g. "0.9.0", "2.0.0") fails fast
  // with the typed mismatch error. Malformed version strings fall through
  // to the schema parse, which reports the pattern violation at the
  // contractVersion path — both paths are typed errors, never silent.
  const rawVersion = (payload as Record<string, unknown>)["contractVersion"];
  if (
    typeof rawVersion === "string" &&
    parseMajorVersion(rawVersion) !== null &&
    !sameMajorVersion(rawVersion, expected)
  ) {
    throw new ContractVersionMismatchError(context, expected, rawVersion);
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ContractDecodeError(context, toIssues(result.error));
  }

  if (strict) {
    const unknownPaths = collectUnknownKeyPaths(result.data, schema);
    if (unknownPaths.length > 0) {
      throw new ContractDecodeError(context, unknownKeyIssues(unknownPaths));
    }
  }

  return result.data;
}

function encodeValue<T extends object>(
  context: { family: ContractFamily; objectName: string },
  schema: z.ZodType<T>,
  value: T,
): string {
  const expected = familyVersion(context.family);
  const record = value as Record<string, unknown>;

  let candidate: unknown;
  if (!("contractVersion" in record)) {
    candidate = { ...record, contractVersion: expected };
  } else if (record["contractVersion"] === expected) {
    candidate = value;
  } else if (typeof record["contractVersion"] === "string") {
    throw new ContractVersionMismatchError(
      context,
      expected,
      record["contractVersion"],
      "encode",
    );
  } else {
    throw new ContractEncodeError(context, [
      {
        path: ["contractVersion"],
        message: "contractVersion must be a semver string",
        code: "invalid_type",
      },
    ]);
  }

  const result = schema.safeParse(candidate);
  if (!result.success) {
    throw new ContractEncodeError(context, toIssues(result.error));
  }
  return canonicalJsonStringify(result.data);
}

/** Creates the decode/decodeStrict/encode triple for one wire object. */
export function createWireCodec<T extends object>(options: WireCodecOptions<T>): WireCodec<T> {
  const context = { family: options.family, objectName: options.name };
  return {
    name: options.name,
    family: options.family,
    contractVersion: familyVersion(options.family),
    schema: options.schema,
    decode: (payload: unknown): T => decodeValue(context, options.schema, payload, false),
    decodeStrict: (payload: unknown): T => decodeValue(context, options.schema, payload, true),
    encode: (value: T): string => encodeValue(context, options.schema, value),
  };
}
