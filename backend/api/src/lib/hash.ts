/**
 * Deterministic sha-256 hashing (AISE-004; PROD-003 runtime unification).
 *
 * The capture ingestion gateway's ONLY hash discipline: content addressing
 * over raw asset bytes (the `POST /v1/capture/assets/:contentId` upload
 * contract) and stable fingerprints over canonical contract JSON
 * (`canonicalJsonStringify` from `@aise/shared-contracts`), used for
 * idempotency and conflict detection.
 *
 * Runtime neutrality (PROD-003): implemented with node:crypto `createHash`
 * instead of `Bun.CryptoHasher`, because the deployable API must also run on
 * Node.js serverless runtimes (the Vercel function). `createHash("sha256")`
 * is available on BOTH runtimes and produces byte-identical digests to the
 * historical Bun.CryptoHasher implementation. That equality is LOAD-BEARING:
 * every content-addressing id in every store (capture content blobs and
 * session records, evidence records, BOQ/normalization/mapping artifacts,
 * reality graph versions, cases, interventions, executions, impacts, gaps,
 * comparisons, adoption records, missions, identity records) is a sha-256
 * hex digest produced by this function — a digest change would corrupt every
 * content id in the system. It is PROVEN two ways by the colocated tests
 * (`lib/hash.test.ts`):
 *
 *   1. fixed FIPS 180-4 test vectors (runtime-independent ground truth), and
 *   2. a live cross-check against `Bun.CryptoHasher` itself on this Bun
 *      runtime (the historical implementation), over string and binary
 *      inputs spanning the sha-256 block boundaries.
 *
 * Synchronous by design: hashing is pure computation over in-memory bytes
 * and must never introduce await-ordering nondeterminism into gateway
 * decisions or tests. (node:crypto's `createHash` is the synchronous,
 * non-streaming API — identical semantics to `Bun.CryptoHasher` here.)
 */

import { createHash } from "node:crypto";

/** sha-256 over UTF-8 text or raw bytes, as 64 lowercase hex characters. */
export function sha256Hex(input: Uint8Array | string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Byte-for-byte equality (length then content). */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}
