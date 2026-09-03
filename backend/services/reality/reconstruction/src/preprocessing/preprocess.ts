/**
 * Asynchronous preprocessing of committed capture sessions
 * (AISE-008).
 *
 * Preprocessing converts the raw-evidence view of a session (its
 * committed uploads) into the derived, reconstructable view:
 * validated frames with stable deterministic ordering, plus an
 * explicit record of which assets were excluded and why. It runs
 * inside pipeline jobs, never inline with a capture API call — the
 * capture gateway stays a recorder, reconstruction is asynchronous
 * by design.
 *
 * Invariants (all fail-closed — a preprocessing failure commits
 * NOTHING):
 *
 * - **Integrity re-verification**: for every upload, sha256(payload)
 *   must equal the declared `contentHash` and the ingestion-recorded
 *   `receivedHash`, and the payload length must equal `byteSize`.
 *   Reconstruction never trusts a hash it did not recompute.
 * - **Metadata well-formedness**: capturedAt parses; orientation
 *   quaternions are finite with non-zero norm; geolocation is within
 *   contract ranges. Invalid metadata is rejected, not repaired.
 * - **Asset routing**: PHOTO/VIDEO/DEPTH become frames;
 *   METADATA/SKETCH/VOICE/DOCUMENT are excluded with the recorded
 *   reason `not_reconstructable_asset_type` (a capture session
 *   legitimately carries non-visual evidence — exclusion is recorded,
 *   never silent). Any other value — including the cross-MINOR
 *   reader sentinel `unknown` — fails the whole preprocess with
 *   `UNKNOWN_ASSET_TYPE`: an ambiguous asset type cannot be routed,
 *   and ambiguity must not become authoritative state.
 * - **Non-empty reconstructable core**: a session with no frames
 *   cannot be reconstructed (failure, not an empty success).
 * - **Determinism**: frames are ordered by (capturedAt, assetId) and
 *   excluded assets by assetId; the `fingerprint` is the canonical
 *   content hash of the whole derived view, so equal inputs produce
 *   equal fingerprints (test-pinned) and changed inputs change it.
 * - **Derived ≠ raw**: the preprocessed record carries metadata and
 *   hashes only — payload bytes stay behind the capture-source port;
 *   raw evidence is never duplicated into derived state.
 */
import {
  UNKNOWN_ENUM,
  type AcquisitionMetadata,
  type ContentHash,
  type Timestamp,
  type Uuid,
} from "@aise/shared-contracts";
import type { CommittedCaptureUpload, CaptureUploadSource } from "../capture/source.js";
import { canonicalContentHash, sha256HexBytes } from "../canonical.js";
import { ReconstructionError } from "../errors.js";
import {
  assertContentHash,
  assertGeolocation,
  assertOrientationQuaternion,
  assertTimestamp,
} from "../validate.js";

/** Asset types that can serve as reconstruction frames. */
export const RECONSTRUCTABLE_ASSET_TYPES = ["PHOTO", "VIDEO", "DEPTH"] as const;

/** Asset types that are legitimately present but not reconstructable. */
export const EXCLUDED_ASSET_TYPES = ["METADATA", "SKETCH", "VOICE", "DOCUMENT"] as const;

export type ReconstructableAssetType = (typeof RECONSTRUCTABLE_ASSET_TYPES)[number];

export type ExcludedAssetType = (typeof EXCLUDED_ASSET_TYPES)[number];

export const PREPROCESSED_SESSION_FORMAT_VERSION = "1.0";

/**
 * One validated, reconstructable frame of a session. One committed
 * upload maps to one frame (frameId === assetId in this foundation).
 * Carries identity and validated acquisition metadata only — never
 * payload bytes (raw evidence stays behind the capture-source port).
 */
export interface PreprocessedFrame {
  readonly frameId: Uuid;
  readonly assetId: Uuid;
  readonly assetType: ReconstructableAssetType;
  readonly capturedAt: Timestamp;
  readonly mimeType: string | undefined;
  readonly contentHash: ContentHash;
  readonly byteSize: number;
  /** Validated verbatim acquisition metadata (orientation, geolocation, …). */
  readonly acquisition: AcquisitionMetadata;
}

/**
 * An asset that was committed but is not usable as a frame, recorded
 * with the reason so exclusions are always explainable.
 */
export interface ExcludedAsset {
  readonly assetId: Uuid;
  readonly assetType: ExcludedAssetType;
  readonly reason: "not_reconstructable_asset_type";
}

/** The derived, reconstructable view of one capture session. */
export interface PreprocessedSession {
  readonly formatVersion: typeof PREPROCESSED_SESSION_FORMAT_VERSION;
  readonly sessionId: Uuid;
  /** Deterministically ordered validated frames. */
  readonly frames: readonly PreprocessedFrame[];
  /** Explicitly excluded (non-visual) committed assets. */
  readonly excludedAssets: readonly ExcludedAsset[];
  /**
   * Canonical content hash of the derived view (frames + exclusions
   * + session identity). Equal inputs ⇒ equal fingerprint.
   */
  readonly fingerprint: ContentHash;
  /** Bookkeeping stamp (not part of the fingerprint). */
  readonly createdAt: Timestamp;
}

export interface PreprocessSessionOptions {
  /** Injectable clock for deterministic tests. */
  readonly now?: () => string;
}

/**
 * Preprocesses one session from committed uploads. Throws
 * `ReconstructionError` (fail closed) on any integrity, validation,
 * routing, or emptiness failure; returns the derived record on
 * success.
 */
export function preprocessSession(
  source: CaptureUploadSource,
  sessionId: Uuid,
  options: PreprocessSessionOptions = {},
): PreprocessedSession {
  const uploads = source.listCommittedUploads(sessionId);
  if (uploads === undefined) {
    throw new ReconstructionError("SESSION_NOT_FOUND", `capture session ${sessionId} is not known to the capture source`, {
      details: { sessionId },
    });
  }
  if (uploads.length === 0) {
    throw new ReconstructionError(
      "NO_COMMITTED_UPLOADS",
      `capture session ${sessionId} has no committed uploads to preprocess`,
      { details: { sessionId } },
    );
  }

  const frames: PreprocessedFrame[] = [];
  const excludedAssets: ExcludedAsset[] = [];
  const seenAssetIds = new Set<Uuid>();

  for (const upload of uploads) {
    validateUploadIntegrity(upload);
    if (seenAssetIds.has(upload.assetId)) {
      throw new ReconstructionError("VALIDATION_FAILED", `duplicate committed asset ${upload.assetId} in session ${sessionId}`, {
        details: { sessionId, assetId: upload.assetId },
      });
    }
    seenAssetIds.add(upload.assetId);

    const routed = routeAssetType(upload);
    if (routed === undefined) {
      // Ambiguous asset type (reader sentinel or unexpected value):
      // not routable, and ambiguity must not become state.
      throw new ReconstructionError(
        "UNKNOWN_ASSET_TYPE",
        `asset ${upload.assetId} has asset type "${String(upload.assetType)}" which cannot be routed for reconstruction`,
        { details: { sessionId, assetId: upload.assetId, assetType: String(upload.assetType) } },
      );
    }
    if ("excluded" in routed) {
      excludedAssets.push({
        assetId: upload.assetId,
        assetType: routed.excluded,
        reason: "not_reconstructable_asset_type",
      });
    } else {
      frames.push({
        frameId: upload.assetId,
        assetId: upload.assetId,
        assetType: routed.frame,
        capturedAt: upload.acquisition.capturedAt,
        mimeType: upload.mimeType,
        contentHash: upload.contentHash,
        byteSize: upload.byteSize,
        acquisition: upload.acquisition,
      });
    }
  }

  if (frames.length === 0) {
    throw new ReconstructionError(
      "NO_RECONSTRUCTABLE_FRAMES",
      `capture session ${sessionId} has no reconstructable frames (all ${excludedAssets.length} committed assets are non-visual)`,
      { details: { sessionId, excludedAssets: excludedAssets.length } },
    );
  }

  frames.sort((a, b) =>
    a.capturedAt === b.capturedAt
      ? compareStrings(a.assetId, b.assetId)
      : compareStrings(a.capturedAt, b.capturedAt),
  );
  excludedAssets.sort((a, b) => compareStrings(a.assetId, b.assetId));

  const fingerprint = canonicalContentHash({
    formatVersion: PREPROCESSED_SESSION_FORMAT_VERSION,
    kind: "preprocessed_session",
    sessionId,
    frames,
    excludedAssets,
  });

  return {
    formatVersion: PREPROCESSED_SESSION_FORMAT_VERSION,
    sessionId,
    frames,
    excludedAssets,
    fingerprint,
    createdAt: (options.now ?? defaultNow)(),
  };
}

const defaultNow = (): string => new Date().toISOString();

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Re-verifies the AISE-004 commit guarantees independently. */
function validateUploadIntegrity(upload: CommittedCaptureUpload): void {
  const field = `uploads[${upload.assetId}]`;
  assertContentHash(upload.contentHash, `${field}.contentHash`);
  assertContentHash(upload.receivedHash, `${field}.receivedHash`);

  const payloadHash = sha256HexBytes(upload.payload);
  if (payloadHash !== upload.contentHash) {
    throw new ReconstructionError(
      "INTEGRITY_MISMATCH",
      `asset ${upload.assetId}: recomputed payload hash does not match the declared content hash`,
      {
        details: {
          sessionId: upload.sessionId,
          assetId: upload.assetId,
          declared: upload.contentHash,
          recomputed: payloadHash,
        },
      },
    );
  }
  if (upload.receivedHash !== upload.contentHash) {
    throw new ReconstructionError(
      "INTEGRITY_MISMATCH",
      `asset ${upload.assetId}: ingestion-recorded received hash does not match the declared content hash`,
      {
        details: {
          sessionId: upload.sessionId,
          assetId: upload.assetId,
          declared: upload.contentHash,
          received: upload.receivedHash,
        },
      },
    );
  }
  if (upload.payload.byteLength !== upload.byteSize) {
    throw new ReconstructionError(
      "INTEGRITY_MISMATCH",
      `asset ${upload.assetId}: payload byte length does not match the declared byte size`,
      {
        details: {
          sessionId: upload.sessionId,
          assetId: upload.assetId,
          declared: upload.byteSize,
          actual: upload.payload.byteLength,
        },
      },
    );
  }

  const acquisitionField = `${field}.acquisition`;
  if (typeof upload.acquisition.capturedAt !== "string") {
    throw new ReconstructionError("VALIDATION_FAILED", `${acquisitionField}.capturedAt is required`, {
      details: { sessionId: upload.sessionId, assetId: upload.assetId },
    });
  }
  assertTimestamp(upload.acquisition.capturedAt, `${acquisitionField}.capturedAt`);
  const quaternion = upload.acquisition.orientation?.quaternion;
  if (quaternion !== undefined) {
    assertOrientationQuaternion(quaternion, `${acquisitionField}.orientation.quaternion`);
  }
  const geolocation = upload.acquisition.geolocation;
  if (geolocation !== undefined) {
    assertGeolocation(geolocation, `${acquisitionField}.geolocation`);
  }
}

type AssetRoute = { readonly frame: ReconstructableAssetType } | { readonly excluded: ExcludedAssetType };

/** Routes an asset type; `undefined` means not routable (ambiguous). */
function routeAssetType(upload: CommittedCaptureUpload): AssetRoute | undefined {
  const assetType = upload.assetType;
  if (assetType === UNKNOWN_ENUM) {
    return undefined;
  }
  if ((RECONSTRUCTABLE_ASSET_TYPES as readonly string[]).includes(assetType)) {
    return { frame: assetType as ReconstructableAssetType };
  }
  if ((EXCLUDED_ASSET_TYPES as readonly string[]).includes(assetType)) {
    return { excluded: assetType as ExcludedAssetType };
  }
  return undefined;
}
