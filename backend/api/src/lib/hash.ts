/**
 * Deterministic sha-256 hashing (AISE-004).
 *
 * The capture ingestion gateway's ONLY hash discipline: content addressing
 * over raw asset bytes (the `POST /v1/capture/assets/:contentId` upload
 * contract) and stable fingerprints over canonical contract JSON
 * (`canonicalJsonStringify` from `@aise/shared-contracts`), used for
 * idempotency and conflict detection.
 *
 * Synchronous by design (Bun.CryptoHasher): hashing is pure computation over
 * in-memory bytes and must never introduce await-ordering nondeterminism into
 * gateway decisions or tests.
 */

/** sha-256 over UTF-8 text or raw bytes, as 64 lowercase hex characters. */
export function sha256Hex(input: Uint8Array | string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex");
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
