/**
 * ANCHOR-002 — the anchoring wire codec engine.
 *
 * The `solution-contract` codec discipline, verbatim (one deterministic
 * decode/encode pipeline shared by this package's wire objects — own engine,
 * own error classes, this package's families and version):
 *
 *  DECODE (default): reject non-object payloads with a typed error; fail
 *    fast on a cross-major `contractVersion` (`VersionMismatchError`);
 *    validate with the open wire schema — unknown keys are PRESERVED, so a
 *    payload produced by a newer minor of the same major round-trips without
 *    data loss; schema violations surface as `DecodeError` with structured
 *    issues.
 *
 *  DECODE (strict): same, then walks the schema against the decoded value
 *    and rejects unknown keys at ANY object nesting level (issue code
 *    `unrecognized_keys`). Canonical-validation mode for producers and
 *    internal pipelines. Open maps (`z.record` fields) stay open in strict
 *    mode — their keys are data, not schema drift.
 *
 *  ENCODE: stamps `contractVersion` with the family version when absent;
 *    rejects values carrying any other version (typed error — never
 *    silently rewritten); validates with the wire schema and emits canonical
 *    JSON (recursively sorted keys, 2-space indent, trailing newline — the
 *    shared-contract canonical helper), so the same value always produces
 *    identical bytes.
 *
 *  Encode/decode are SERIALIZATION, never authority: nothing here anchors,
 *    validates anchors or writes anything — the hypotheses remain INFERRED
 *    candidates owned by the consumer-side guard discipline.
 */

import { z } from "zod";
import {
  canonicalJsonStringify,
  collectUnknownKeyPaths,
  parseMajorVersion,
  sameMajorVersion,
} from "@aise/shared-contracts";
import type { AnchoringContractFamily } from "./anchoring-contracts.version";
import { anchoringFamilyVersion } from "./anchoring-contracts.version";
import {
  AnchoringContractDecodeError,
  AnchoringContractEncodeError,
  AnchoringContractVersionMismatchError,
  type AnchoringContractIssue,
} from "./errors";

export interface AnchoringWireCodecOptions<T extends object> {
  /** Wire object name, e.g. `"AnchoringRequest"`. */
  readonly name: string;
  readonly family: AnchoringContractFamily;
  /** Open wire schema (unknown keys preserved on decode). */
  readonly schema: z.ZodType<T>;
}

export interface AnchoringWireCodec<T extends object> {
  readonly name: string;
  readonly family: AnchoringContractFamily;
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

function toIssues(error: z.ZodError): AnchoringContractIssue[] {
  return error.issues.map((issue) => ({
    path: [...issue.path],
    message: issue.message,
    code: issue.code,
  }));
}

function unknownKeyIssues(paths: readonly string[]): AnchoringContractIssue[] {
  return paths.map((path) => ({
    path: path.split("."),
    message: "unrecognized key",
    code: "unrecognized_keys",
  }));
}

function decodeValue<T>(
  context: { family: AnchoringContractFamily; objectName: string },
  schema: z.ZodType<T>,
  payload: unknown,
  strict: boolean,
): T {
  const expected = anchoringFamilyVersion(context.family);

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AnchoringContractDecodeError(context, [
      { path: [], message: "expected a JSON object", code: "invalid_type" },
    ]);
  }

  // Version gate before schema parse: a VALID semver version that is not
  // same-major with the family version fails fast with the typed mismatch
  // error. Malformed version strings fall through to the schema parse, which
  // reports the pattern violation at the contractVersion path — both paths
  // are typed errors, never silent.
  const rawVersion = (payload as Record<string, unknown>)["contractVersion"];
  if (
    typeof rawVersion === "string" &&
    parseMajorVersion(rawVersion) !== null &&
    !sameMajorVersion(rawVersion, expected)
  ) {
    throw new AnchoringContractVersionMismatchError(context, expected, rawVersion);
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new AnchoringContractDecodeError(context, toIssues(result.error));
  }

  if (strict) {
    const unknownPaths = collectUnknownKeyPaths(result.data, schema);
    if (unknownPaths.length > 0) {
      throw new AnchoringContractDecodeError(context, unknownKeyIssues(unknownPaths));
    }
  }

  return result.data;
}

function encodeValue<T extends object>(
  context: { family: AnchoringContractFamily; objectName: string },
  schema: z.ZodType<T>,
  value: T,
): string {
  const expected = anchoringFamilyVersion(context.family);
  const record = value as Record<string, unknown>;

  let candidate: unknown;
  if (!("contractVersion" in record)) {
    candidate = { ...record, contractVersion: expected };
  } else if (record["contractVersion"] === expected) {
    candidate = value;
  } else if (typeof record["contractVersion"] === "string") {
    throw new AnchoringContractVersionMismatchError(
      context,
      expected,
      record["contractVersion"],
      "encode",
    );
  } else {
    throw new AnchoringContractEncodeError(context, [
      {
        path: ["contractVersion"],
        message: "contractVersion must be a semver string",
        code: "invalid_type",
      },
    ]);
  }

  const result = schema.safeParse(candidate);
  if (!result.success) {
    throw new AnchoringContractEncodeError(context, toIssues(result.error));
  }
  return canonicalJsonStringify(result.data);
}

/** Creates the decode/decodeStrict/encode triple for one anchoring wire object. */
export function createAnchoringWireCodec<T extends object>(
  options: AnchoringWireCodecOptions<T>,
): AnchoringWireCodec<T> {
  const context = { family: options.family, objectName: options.name };
  return {
    name: options.name,
    family: options.family,
    contractVersion: anchoringFamilyVersion(options.family),
    schema: options.schema,
    decode: (payload: unknown): T => decodeValue(context, options.schema, payload, false),
    decodeStrict: (payload: unknown): T => decodeValue(context, options.schema, payload, true),
    encode: (value: T): string => encodeValue(context, options.schema, value),
  };
}
