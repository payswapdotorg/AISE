/**
 * Solution wire codec engine (PROD-021).
 *
 * One deterministic decode/encode pipeline shared by every solution wire
 * object — the same discipline as `@aise/shared-contracts` and
 * `@aise/adapter-contract` (own engine, own error classes, this package's
 * families and version):
 *
 *  DECODE (default):
 *    1. reject non-object payloads with a typed error;
 *    2. if `contractVersion` is present as a string and is NOT same-major
 *       with the family version, fail fast with
 *       `SolutionContractVersionMismatchError` (a v0 or v2 payload is never
 *       silently accepted);
 *    3. validate with the open wire schema — unknown keys are preserved, so
 *       a payload produced by a newer minor of the same major round-trips
 *       without data loss;
 *    4. schema violations (including a missing/malformed `contractVersion`)
 *       surface as `SolutionContractDecodeError` with structured issues.
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
 *    - validates with the wire schema and emits canonical JSON (recursively
 *      sorted keys, 2-space indent, trailing newline — the canonical JSON
 *      helper of `@aise/shared-contracts`), so the same value always
 *      produces identical bytes.
 *
 * NOTE: encode/decode are SERIALIZATION, never authority. A client or agent
 * may serialize any object for transport, caching or offline replay; the
 * proposal-versus-reality separation, validation snapshots and BOQ trace
 * pins remain owned by the server/domain solution engine (PROD-022/025) —
 * see invariants.ts and the package README.
 */

import { z } from "zod";
import {
  canonicalJsonStringify,
  collectUnknownKeyPaths,
  parseMajorVersion,
  sameMajorVersion,
} from "@aise/shared-contracts";
import type { SolutionContractFamily } from "./solution-contracts.version";
import { solutionFamilyVersion } from "./solution-contracts.version";
import {
  SolutionContractDecodeError,
  SolutionContractEncodeError,
  SolutionContractVersionMismatchError,
  type SolutionContractIssue,
} from "./errors";

export interface SolutionWireCodecOptions<T extends object> {
  /** Wire object name, e.g. `"Solution"`. */
  readonly name: string;
  readonly family: SolutionContractFamily;
  /** Open wire schema (unknown keys preserved on decode). */
  readonly schema: z.ZodType<T>;
}

export interface SolutionWireCodec<T extends object> {
  readonly name: string;
  readonly family: SolutionContractFamily;
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

function toIssues(error: z.ZodError): SolutionContractIssue[] {
  return error.issues.map((issue) => ({
    path: [...issue.path],
    message: issue.message,
    code: issue.code,
  }));
}

function unknownKeyIssues(paths: readonly string[]): SolutionContractIssue[] {
  return paths.map((path) => ({
    path: path.split("."),
    message: "unrecognized key",
    code: "unrecognized_keys",
  }));
}

function decodeValue<T>(
  context: { family: SolutionContractFamily; objectName: string },
  schema: z.ZodType<T>,
  payload: unknown,
  strict: boolean,
): T {
  const expected = solutionFamilyVersion(context.family);

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new SolutionContractDecodeError(context, [
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
    throw new SolutionContractVersionMismatchError(context, expected, rawVersion);
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new SolutionContractDecodeError(context, toIssues(result.error));
  }

  if (strict) {
    const unknownPaths = collectUnknownKeyPaths(result.data, schema);
    if (unknownPaths.length > 0) {
      throw new SolutionContractDecodeError(context, unknownKeyIssues(unknownPaths));
    }
  }

  return result.data;
}

function encodeValue<T extends object>(
  context: { family: SolutionContractFamily; objectName: string },
  schema: z.ZodType<T>,
  value: T,
): string {
  const expected = solutionFamilyVersion(context.family);
  const record = value as Record<string, unknown>;

  let candidate: unknown;
  if (!("contractVersion" in record)) {
    candidate = { ...record, contractVersion: expected };
  } else if (record["contractVersion"] === expected) {
    candidate = value;
  } else if (typeof record["contractVersion"] === "string") {
    throw new SolutionContractVersionMismatchError(
      context,
      expected,
      record["contractVersion"],
      "encode",
    );
  } else {
    throw new SolutionContractEncodeError(context, [
      {
        path: ["contractVersion"],
        message: "contractVersion must be a semver string",
        code: "invalid_type",
      },
    ]);
  }

  const result = schema.safeParse(candidate);
  if (!result.success) {
    throw new SolutionContractEncodeError(context, toIssues(result.error));
  }
  return canonicalJsonStringify(result.data);
}

/** Creates the decode/decodeStrict/encode triple for one solution wire object. */
export function createSolutionWireCodec<T extends object>(
  options: SolutionWireCodecOptions<T>,
): SolutionWireCodec<T> {
  const context = { family: options.family, objectName: options.name };
  return {
    name: options.name,
    family: options.family,
    contractVersion: solutionFamilyVersion(options.family),
    schema: options.schema,
    decode: (payload: unknown): T =>
      decodeValue(context, options.schema, payload, false),
    decodeStrict: (payload: unknown): T =>
      decodeValue(context, options.schema, payload, true),
    encode: (value: T): string => encodeValue(context, options.schema, value),
  };
}
