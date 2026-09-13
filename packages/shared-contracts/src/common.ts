/**
 * Shared contract primitives (AISE-003).
 *
 * Bounded, inspectable value schemas shared by every contract family, plus
 * the canonical-JSON helpers that make serialization deterministic.
 *
 * Conventions pinned here (cross-platform, Android-compatible):
 *
 *  - `ContentId`: exactly 64 lowercase hexadecimal characters (sha-256).
 *    The normative derivation is the frozen `AISE-CONTENT-V1` canonical
 *    encoding established by the AISE-002 Android foundation
 *    (`apps/android/core/.../identity/ContentIdentity.kt`):
 *    sha256 over TAG("AISE-CONTENT-V1") | len(payload) | payload |
 *    count(metadata) | sorted(key,value) metadata entries, keys sorted by
 *    UTF-8 byte sequence. This package constrains the FORM; re-derivation
 *    is implemented by clients (AISE-005) and the ingestion gateway
 *    (AISE-004), never trusted from the wire.
 *  - `IsoTimestamp`: ISO 8601 UTC with millisecond precision and a literal
 *    `Z` suffix only (`YYYY-MM-DDTHH:MM:SS.sssZ`). No local offsets, no
 *    timezone conversion — timezone-free by construction, matching the
 *    Android foundation's UTC-epoch-millis discipline.
 *  - `StableId`: a non-empty opaque string identifier assigned by the
 *    authority that owns the object (server for missions/model objects,
 *    client for sessions/batches). Not a content address.
 *
 * WIRE OBJECTS ARE OPEN: every object schema in this package is built with
 * `.passthrough()` so decoding PRESERVES unknown keys — same-major forward
 * compatibility, and evidence/audit data is never silently dropped. The
 * strict decode mode (unknown keys rejected) is implemented by the
 * schema-walking checker in `strictness.ts`, not by parallel schemas, so
 * there is exactly ONE schema per object (the wire contract).
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Primitive string schemas                                            */
/* ------------------------------------------------------------------ */

/** Strict semver (semver.org grammar), e.g. `1.0.0`, `1.2.0-rc.1+build.5`. */
export const SEMVER_PATTERN =
  "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$";

export const contractVersionSchema = z
  .string()
  .regex(new RegExp(SEMVER_PATTERN))
  .describe(
    "Strict semver contract version carried by every wire object. " +
      "Decoders accept the same major version; any other version is a typed error.",
  );

/** UTC instant, ISO 8601, millisecond precision, literal `Z` suffix only. */
export const ISO_8601_UTC_PATTERN =
  "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$";

export const isoTimestampSchema = z
  .string()
  .regex(new RegExp(ISO_8601_UTC_PATTERN))
  .describe("ISO 8601 UTC timestamp with millisecond precision, `Z` suffix only.");

/** Opaque stable identifier (assigned by the owning authority, not content-derived). */
export const stableIdSchema = z
  .string()
  .min(1)
  .max(256)
  .describe("Opaque stable identifier assigned by the authority that owns the object.");

/** sha-256 content address: exactly 64 lowercase hex characters. */
export const contentIdSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .describe(
    "sha-256 content address (64 lowercase hex). Normative derivation: the frozen " +
      "AISE-CONTENT-V1 canonical encoding (see apps/android ContentIdentity).",
  );

/** IANA-style media type, e.g. `image/jpeg`, `video/mp4`, `application/json`. */
export const mediaTypeSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]{0,126}\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]{0,126}$/)
  .describe("IANA-style media type of the content.");

/** Short bounded text (names, titles, kinds, units): 1..256 characters. */
export const shortTextSchema = z.string().min(1).max(256);

/** Bounded text (descriptions, statements, instructions): 1..4096 characters. */
export const textSchema = z.string().min(1).max(4096);

/** Non-negative integer (sequence numbers, revisions, byte sizes). */
export const nonNegativeIntSchema = z.number().int().min(0);

/** Positive integer (version counters that start at 1). */
export const positiveIntSchema = z.number().int().min(1);

/* ------------------------------------------------------------------ */
/* Uncertainty and confidence (epistemic support values)               */
/* ------------------------------------------------------------------ */

/**
 * Measurement uncertainty attached to a value. Confidence NEVER substitutes
 * for this (spec/architecture-lock.md: "Confidence never substitutes for
 * measurement uncertainty").
 *
 * Per-kind requirements (enforced by policy, not by the schema):
 *  - DIMENSIONAL: `plusMinus` present (tolerance in the parent's unit);
 *  - STATISTICAL: `plusMinus` and `level` present (e.g. level "95%");
 *  - INTERVAL: `lower` and `upper` present (bounds in the parent's unit).
 */
export const UNCERTAINTY_KINDS = ["DIMENSIONAL", "STATISTICAL", "INTERVAL"] as const;
export type UncertaintyKind = (typeof UNCERTAINTY_KINDS)[number];

export const UncertaintySchema = z
  .object({
    kind: z.enum(UNCERTAINTY_KINDS),
    plusMinus: z.number().optional(),
    level: shortTextSchema.optional(),
    lower: z.number().optional(),
    upper: z.number().optional(),
  })
  .passthrough();

export type Uncertainty = z.infer<typeof UncertaintySchema>;

/**
 * Probabilistic or qualitative confidence supporting an assertion.
 * Distinct from `Uncertainty`: confidence is support for the belief,
 * uncertainty is a property of the measurement.
 *
 * Per-kind requirements (policy): PROBABILISTIC `value` is a probability in
 * [0,1]; QUALITATIVE `value` is an ordinal on the scale named by `basis`.
 */
export const CONFIDENCE_KINDS = ["PROBABILISTIC", "QUALITATIVE"] as const;
export type ConfidenceKind = (typeof CONFIDENCE_KINDS)[number];

export const ConfidenceSchema = z
  .object({
    kind: z.enum(CONFIDENCE_KINDS),
    value: z.number().min(0),
    basis: shortTextSchema.optional(),
  })
  .passthrough();

export type Confidence = z.infer<typeof ConfidenceSchema>;

/* ------------------------------------------------------------------ */
/* Canonical JSON                                                      */
/* ------------------------------------------------------------------ */

/**
 * Recursively sorts object keys (lexicographic, UTF-16 code-unit order) and
 * returns a structurally equal value with deterministic key order.
 * Arrays keep their order (order is data).
 *
 * NOTE: this is the WIRE canonicalization for deterministic serialization
 * (stable bytes for logs, manifests and tests). It is deliberately NOT the
 * AISE-CONTENT-V1 byte encoding used for content addressing — that hashing
 * discipline lives in the clients/gateway and sorts metadata keys by UTF-8
 * byte sequence. Two different orderings for two different purposes.
 */
export function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = canonicalizeJson(record[key]);
    }
    return out;
  }
  return value;
}

/** Canonical JSON text: 2-space indented, sorted keys, trailing newline. */
export function canonicalJsonStringify(value: unknown): string {
  return `${JSON.stringify(canonicalizeJson(value), null, 2)}\n`;
}
