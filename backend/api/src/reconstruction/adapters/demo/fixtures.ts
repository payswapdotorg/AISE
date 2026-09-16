/**
 * Deterministic demo-provider fixtures (PROD-009) — STABLE EVIDENCE BYTES.
 *
 * The demo reconstruction path must run without paid GPU/model APIs and be
 * byte-deterministic: identical evidence bytes always produce byte-identical
 * demo outcomes. This module defines the fixture discipline:
 *
 *  - `demoEvidenceBytes(seed)` derives fixed pseudo-evidence bytes from a
 *    seed string (pure sha-256 computation — no randomness, no clock).
 *  - `demoEvidenceDigest(seed)` is the sha-256 of those bytes: the stable
 *    digest the demo adapter folds into its derivation.
 *  - `DEMO_FIXTURE_DIGESTS` pins the digests of `DEMO_FIXTURE_SEEDS` as
 *    literal constants: if anyone changes the byte derivation, the colocated
 *    test fails — fixture bytes are a stability contract, not an accident.
 *  - `demoEvidenceReader` adapts a content-id → bytes map to the
 *    `EvidenceBytesReader` seam (absent ids resolve to null).
 */

import { sha256Hex } from "../../../lib/hash";
import type { EvidenceBytesReader } from "../worldsculpt/backend";

export const DEMO_EVIDENCE_FORMAT = "aise-demo-evidence-v1";

/** The canonical fixture seeds (stable, documented demo evidence set). */
export const DEMO_FIXTURE_SEEDS = [
  "facade-north",
  "facade-east",
  "site-overview-01",
  "column-detail-01",
] as const;

/** Deterministic fixture payload text for one seed (pure sha-256 derivation). */
export function demoEvidencePayload(seed: string): string {
  return `${DEMO_EVIDENCE_FORMAT}\nseed: ${seed}\nderivation: ${sha256Hex(`${DEMO_EVIDENCE_FORMAT}:${seed}`)}\n`;
}

/** Deterministic fixture evidence bytes for one seed. */
export function demoEvidenceBytes(seed: string): Uint8Array {
  return new TextEncoder().encode(demoEvidencePayload(seed));
}

/** Stable digest of one seed's fixture bytes (sha-256 over the raw bytes). */
export function demoEvidenceDigest(seed: string): string {
  return sha256Hex(demoEvidenceBytes(seed));
}

/**
 * Pinned digests for `DEMO_FIXTURE_SEEDS` (literal constants — the stability
 * contract; the colocated test recomputes and compares).
 */
export const DEMO_FIXTURE_DIGESTS: Readonly<Record<string, string>> = {
  "facade-north": "67b91d386957add872a936bb468882175eea0d6f0f6daf0cee1b4bb3c4058a6a",
  "facade-east": "fa1ac8009a727cdd7a4a1c9e815fe676478478d013600a343fee02f9d194b249",
  "site-overview-01": "3545b32d76b2fcde71b3e1ce4e38d91ffd5107b23b5ed9fd844502d59a943ee3",
  "column-detail-01": "cb62724006daae8c7a240105a43f2859c7a320ca01ab9197005c94bb1f3bc590",
};

/** Reader over an explicit content-id → bytes map (absent ids resolve to null). */
export function demoEvidenceReader(
  entries: Readonly<Record<string, Uint8Array>>,
): EvidenceBytesReader {
  return {
    read: async (contentId: string): Promise<Uint8Array | null> => entries[contentId] ?? null,
  };
}
