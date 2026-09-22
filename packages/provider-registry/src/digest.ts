/**
 * HFX-000 — internal deterministic digest helper.
 *
 * The control plane's identity discipline: sha-256 over the WIRE canonical
 * JSON encoding (`canonicalJsonStringify` from `@aise/shared-contracts` —
 * recursively sorted keys, 2-space indent, trailing newline). The same
 * value always digests to the same id; no salt, no clock, no randomness.
 *
 * This is deliberately NOT the AISE-CONTENT-V1 content-addressing encoding
 * (that byte discipline belongs to the capture/gateway authorities): the
 * control plane addresses its OWN artifacts (profiles, benchmark records,
 * provenance manifests) over the shared wire canonicalization so they stay
 * portable, self-contained JSON verifiable by digest.
 *
 * The ONLY import this package makes from `@aise/shared-contracts` is the
 * canonical JSON serializer — a pure text helper. NO canonical AISE domain
 * type (Reality Graph, Evidence Graph, Solution, BOQ semantics) is imported
 * or extended anywhere in this package. Provider-specific types stay on the
 * provider side of the boundary (see discipline.test.ts).
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";

/** sha-256 (lowercase hex) over the canonical JSON of the value. */
export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

/** 64 lowercase hex characters — the shape every digest in this package takes. */
export const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

/** Type guard: is this string a 64-lowercase-hex digest? */
export function isDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}
