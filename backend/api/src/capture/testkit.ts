/**
 * Deterministic capture-gateway test fixtures (AISE-004) — TEST SUPPORT
 * ONLY, never imported by production modules.
 *
 * Every fixture is built as a typed contract object and round-tripped
 * through the shared codecs (`SyncBatchCodec.encode`), so tests exercise
 * the same wire documents real clients send. All content ids are derived
 * from fixed byte payloads via the gateway's own sha-256 discipline; all
 * timestamps are fixed constants; the clock is a constant function. No
 * wall-clock, no randomness, no network — the verify gate stays
 * deterministic.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CONTRACT_VERSION,
  SyncBatchCodec,
  type CapabilityDescriptor,
  type CapabilityStatus,
  type CaptureSessionEnvelope,
  type DeviceCapabilityProfile,
  type Evidence,
  type SyncBatch,
} from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";

/* ------------------------------------------------------------------ */
/* Fixed determinism                                                     */
/* ------------------------------------------------------------------ */

export const FIXED_NOW = "2026-01-15T10:00:00.000Z";
export const FIXED_CAPTURED_AT = "2026-01-15T09:36:12.000Z";
export const FIXED_STARTED_AT = "2026-01-15T09:30:00.000Z";
export const FIXED_ENDED_AT = "2026-01-15T09:58:22.000Z";

/** Injected clock: constant, so acks and records are byte-stable. */
export const fixedClock = (): string => FIXED_NOW;

/** Create a fresh temporary directory; removed when `fn` settles. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "aise-capture-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* Assets                                                                */
/* ------------------------------------------------------------------ */

/** A deterministic test asset: fixed bytes, its real sha-256 content id. */
export interface TestAsset {
  readonly bytes: Uint8Array;
  readonly contentId: string;
  readonly byteSize: number;
  readonly mediaType: string;
}

export function makeAsset(seed: string, mediaType = "image/jpeg"): TestAsset {
  const bytes = new TextEncoder().encode(`aise-capture-test-asset:${seed}`);
  return { bytes, contentId: sha256Hex(bytes), byteSize: bytes.length, mediaType };
}

/* ------------------------------------------------------------------ */
/* Contract object builders                                              */
/* ------------------------------------------------------------------ */

function descriptor(
  status: CapabilityStatus,
  details: Record<string, string>,
  limitations: string[],
): CapabilityDescriptor {
  return { contractVersion: CONTRACT_VERSION, status, details, limitations };
}

/** Fixed, fully-populated session-time capability snapshot. */
export function makeCapabilityProfile(): DeviceCapabilityProfile {
  return {
    contractVersion: CONTRACT_VERSION,
    profileId: "cap-profile-2026-0142",
    capturedAt: FIXED_STARTED_AT,
    deviceIdentity: {
      deviceId: "device-field-007",
      platform: "android",
      model: "Pixel 8 Pro",
      osVersion: "15",
      appVersion: "0.3.0",
    },
    device: descriptor("supported", { "thermal.state": "nominal", "battery.level": "82%" }, []),
    camera: descriptor(
      "supported",
      { "rear.sensors": "wide,ultrawide,tele", "raw.capture": "true" },
      [],
    ),
    depth: descriptor(
      "degraded",
      { "lidar": "false", "depth.mode": "stereo-disparity" },
      ["No LiDAR; depth from stereo disparity degrades beyond 3.5 m"],
    ),
    imu: descriptor(
      "supported",
      { "accelerometer": "true", "gyroscope": "true", "magnetometer": "true" },
      [],
    ),
    tracking: descriptor(
      "supported",
      { "pose.provider": "ARCore", "world.drift": "low" },
      [],
    ),
    compute: descriptor("supported", { "ml.accelerator": "NPU", "ram.gb": "12" }, []),
    calibration: descriptor(
      "unknown",
      {},
      ["Camera intrinsics not yet verified against a calibration target this session"],
    ),
    environment: descriptor(
      "degraded",
      { "illumination": "low-artificial", "surface.reflectivity": "variable" },
      ["Low mixed lighting; expect weaker texture match on the west wall"],
    ),
  };
}

/** Evidence record for one test asset (open metadata map preserved verbatim). */
export function makeEvidence(asset: TestAsset, sessionId: string): Evidence {
  return {
    contractVersion: CONTRACT_VERSION,
    contentId: asset.contentId,
    byteSize: asset.byteSize,
    mediaType: asset.mediaType,
    capturedAt: FIXED_CAPTURED_AT,
    acquisitionMethod: "STILL_IMAGERY",
    acquisitionMetadata: {
      "mission.id": "mission-2026-000042",
      "session.id": sessionId,
      "device.id": "device-field-007",
      "capture.kind": "still",
      "acquisition.sensorId": "rear-wide",
      "lens.focal.length.mm": "6.9",
    },
  };
}

/** Session envelope carrying every asset's evidence verbatim. */
export function makeEnvelope(
  sessionId: string,
  assets: ReadonlyArray<TestAsset>,
): CaptureSessionEnvelope {
  return {
    contractVersion: CONTRACT_VERSION,
    sessionId,
    missionRef: "mission-2026-000042",
    deviceIdentity: {
      deviceId: "device-field-007",
      platform: "android",
      model: "Pixel 8 Pro",
      osVersion: "15",
      appVersion: "0.3.0",
    },
    capabilityProfile: makeCapabilityProfile(),
    startedAt: FIXED_STARTED_AT,
    endedAt: FIXED_ENDED_AT,
    assets: assets.map((asset) => makeEvidence(asset, sessionId)),
  };
}

export interface MakeBatchOptions {
  readonly sessionId: string;
  readonly sequence: number;
  /** Assets transported by this batch (manifest AND envelope evidence). */
  readonly assets: ReadonlyArray<TestAsset>;
  /** Assets listed in the envelope (defaults to `assets`). */
  readonly envelopeAssets?: ReadonlyArray<TestAsset>;
  readonly batchId?: string;
  readonly idempotencyKey?: string;
}

/** A schema-valid `SyncBatch` for the given session/sequence/assets. */
export function makeBatch(options: MakeBatchOptions): SyncBatch {
  return {
    contractVersion: CONTRACT_VERSION,
    batchId: options.batchId ?? `batch-${options.sessionId}-${options.sequence}`,
    sessionId: options.sessionId,
    sequence: options.sequence,
    idempotencyKey: options.idempotencyKey ?? `idem-${options.sessionId}-${options.sequence}`,
    envelope: makeEnvelope(
      options.sessionId,
      options.envelopeAssets ?? options.assets,
    ),
    manifest: options.assets.map((asset) => ({
      contentId: asset.contentId,
      byteSize: asset.byteSize,
      mediaType: asset.mediaType,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Body serialization and mutation                                       */
/* ------------------------------------------------------------------ */

/** Canonical wire body for a VALID batch (validates via the codec). */
export function canonicalBatchBody(batch: SyncBatch): string {
  return SyncBatchCodec.encode(batch);
}

/** Raw body for deliberately invalid or hand-shaped payloads. */
export function rawBody(value: unknown): string {
  return JSON.stringify(value);
}

/** Recursively-writable mirror of a JSON-shaped type. */
type Mutable<T> = T extends ReadonlyArray<infer U>
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;

/**
 * Deep-clone a batch and apply a mutation. The result may be intentionally
 * schema-INVALID (that is the point of some tests); tests that need a valid
 * document re-encode it via `canonicalBatchBody`.
 */
export function mutateBatch(
  batch: SyncBatch,
  mutator: (draft: Mutable<SyncBatch>) => void,
): SyncBatch {
  const draft = JSON.parse(JSON.stringify(batch)) as Mutable<SyncBatch>;
  mutator(draft);
  return draft as unknown as SyncBatch;
}

/** Same batch content with a different key ORDER (semantically equal). */
export function shuffledKeyOrderBody(batch: SyncBatch): string {
  const reversed = JSON.parse(JSON.stringify(batch)) as Record<string, unknown>;
  const flip = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(flip);
    }
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(record).reverse()) {
        out[key] = flip(record[key]);
      }
      return out;
    }
    return value;
  };
  return JSON.stringify(flip(reversed));
}
