/**
 * HFX-401 — internal deterministic digest helper.
 *
 * The provider-scorecard's identity discipline, identical to the control
 * plane's own (`packages/provider-registry/src/digest.ts` — that helper is
 * package-internal, so this module carries its own over the SAME shared
 * wire canonicalization): sha-256 over `canonicalJsonStringify` from
 * `@aise/shared-contracts` (recursively sorted keys, 2-space indent,
 * trailing newline). The same value always digests to the same id; no
 * salt, no clock, no randomness. The standalone tools runner mirrors this
 * derivation (sorted-keys canonical JSON + sha-256) so committed records
 * re-verify outside the importable zone.
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";

/** sha-256 (lowercase hex) over the canonical JSON of the value. */
export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

/** 64 lowercase hex characters — the shape every content address takes. */
export const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

/** Type guard: is this string a 64-lowercase-hex digest? */
export function isDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}
