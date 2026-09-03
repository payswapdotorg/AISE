/**
 * Test-support builders for committed capture uploads (AISE-008
 * tests).
 *
 * Mirrors how AISE-004 commits uploads: the declared hash and byte
 * size are computed FROM the payload (so happy paths are internally
 * consistent), and tests override individual fields to simulate
 * tampering, drift, and malformed records.
 */
import { createHash } from "node:crypto";
import type {
  AcquisitionMetadata,
  AssetType,
  ContentHash,
  EnumOrUnknown,
  Geolocation,
  OrientationQuaternion,
  Uuid,
} from "@aise/shared-contracts";
import { sha256HexBytes } from "../canonical.js";
import type { CommittedCaptureUpload } from "../capture/source.js";

/** Deterministic pseudo-random payload bytes derived from a seed. */
export function payloadFor(seed: string, length = 96): Buffer {
  const chunks: Buffer[] = [];
  let current = Buffer.from(seed, "utf8");
  let total = 0;
  while (total < length) {
    current = createHash("sha256").update(current).digest();
    chunks.push(current);
    total += current.length;
  }
  return Buffer.concat(chunks).subarray(0, length);
}

export interface UploadOverrides {
  readonly sessionId?: Uuid;
  readonly assetId?: Uuid;
  readonly assetType?: EnumOrUnknown<AssetType>;
  readonly capturedAt?: string;
  readonly orientation?: OrientationQuaternion;
  readonly geolocation?: Geolocation;
  readonly mimeType?: string;
  readonly payload?: Uint8Array;
  /** Overrides the declared hash (tamper tests). */
  readonly contentHash?: ContentHash;
  /** Overrides the ingestion-recorded hash (mismatch tests). */
  readonly receivedHash?: ContentHash;
  /** Overrides the declared byte size (mismatch tests). */
  readonly byteSize?: number;
  /** Replaces the whole acquisition record (fixture-driven tests). */
  readonly acquisition?: AcquisitionMetadata;
}

const DEFAULT_SESSION: Uuid = "11111111-1111-4111-8111-111111111111";
const DEFAULT_ASSET: Uuid = "22222222-2222-4222-8222-222222222222";

/** Builds a committed upload whose hashes are consistent with its payload. */
export function buildUpload(overrides: UploadOverrides = {}): CommittedCaptureUpload {
  const assetId = overrides.assetId ?? DEFAULT_ASSET;
  const payload = overrides.payload ?? payloadFor(assetId);
  const contentHash = overrides.contentHash ?? sha256HexBytes(payload);
  const acquisition: AcquisitionMetadata =
    overrides.acquisition !== undefined
      ? overrides.acquisition
      : {
          capturedAt: overrides.capturedAt ?? "2026-09-03T07:12:31Z",
          ...(overrides.orientation !== undefined
            ? { orientation: { quaternion: overrides.orientation } }
            : {}),
          ...(overrides.geolocation !== undefined ? { geolocation: overrides.geolocation } : {}),
        };
  return {
    sessionId: overrides.sessionId ?? DEFAULT_SESSION,
    assetId,
    contentHash,
    receivedHash: overrides.receivedHash ?? contentHash,
    byteSize: overrides.byteSize ?? payload.byteLength,
    mimeType: overrides.mimeType ?? "image/jpeg",
    assetType: overrides.assetType ?? "PHOTO",
    acquisition,
    payload,
  };
}
