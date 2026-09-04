/**
 * Capture-upload adapter (AISE-012 backend).
 *
 * Bridges the AISE-004 ingestion boundary into the evidence
 * subsystem: a committed logical upload (PHOTO/VIDEO/DEPTH/
 * DOCUMENT/SKETCH/VOICE asset) becomes a first-class evidence
 * record whose capture binding is pinned to the INGESTION
 * BOUNDARY's server-computed received hash — never the client's
 * declared hash. Raw captures are immutable evidence artifacts
 * (architecture-lock §2); the evidence record references them,
 * it never re-asserts their bytes.
 *
 * The upload view is a NARROW structural interface: the API
 * service (or any durable capture store that replaces it) can
 * satisfy it without a package dependency from the evidence
 * service into the API service — composition stays at the
 * runtime boundary (the AISE-011 structural-reader precedent).
 */
import {
  evidenceRecord,
  EvidenceError,
  type EvidenceKind,
  type EvidenceRecord,
} from "@aise/engineering-model";
import type { AcquisitionMetadata, AssetType } from "@aise/shared-contracts";
import { EvidenceServiceError } from "./errors.js";

/**
 * The capture-upload read view the evidence boundary requires
 * (structurally satisfiable by the AISE-004 store: its
 * `UploadRecord` plus the declared asset's `assetType`).
 */
export interface CaptureUploadView {
  /** Owning project (tenant boundary). */
  readonly projectId: string;
  readonly sessionId: string;
  readonly assetId: string;
  readonly packageId: string;
  readonly assetType: AssetType;
  /** Server-computed hash of the stored payload (the binding pin). */
  readonly receivedHash: string;
  readonly byteSize: number;
  readonly mimeType?: string;
  /** Acquisition metadata preserved by the ingestion boundary. */
  readonly acquisition: AcquisitionMetadata;
}

/** Reader of committed capture uploads (injected at the runtime boundary). */
export interface CaptureUploadReader {
  /** Returns the committed upload view, or undefined when absent. */
  getUpload(sessionId: string, assetId: string): CaptureUploadView | undefined;
}

/** The default capture asset → evidence kind mapping (v1 decision). */
export const DEFAULT_KIND_BY_ASSET_TYPE: Readonly<Record<AssetType, EvidenceKind>> = {
  PHOTO: "IMAGE",
  VIDEO: "VIDEO",
  DEPTH: "LIDAR",
  DOCUMENT: "DOCUMENT",
  SKETCH: "DOCUMENT",
  VOICE: "HUMAN_OBSERVATION",
  METADATA: "IMAGE", // rejected below — METADATA assets are never evidence
};

export interface EvidenceFromUploadOptions {
  /** Explicit evidence kind (defaults per asset type; must stay compatible). */
  readonly kind?: EvidenceKind;
  readonly recordedBy: string;
  readonly recordedAt: string;
  readonly notes?: string;
}

/**
 * Builds the evidence record for one committed capture upload.
 * METADATA assets are rejected (session metadata is not a source
 * observation); the binding pins the server-computed
 * `receivedHash`; acquisition metadata passes through verbatim
 * (raw preservation — the AISE-004 discipline).
 */
export function evidenceFromUpload(
  upload: CaptureUploadView,
  options: EvidenceFromUploadOptions,
): EvidenceRecord {
  if (upload.assetType === "METADATA") {
    throw new EvidenceServiceError(
      "EVIDENCE_INVALID",
      `a METADATA capture asset is not evidence (session metadata is not a source observation): ${upload.sessionId}/${upload.assetId}`,
      { details: { field: "assetType", value: "METADATA", assetId: upload.assetId } },
    );
  }
  const kind = options.kind ?? DEFAULT_KIND_BY_ASSET_TYPE[upload.assetType];
  try {
    return evidenceRecord({
      kind,
      source: {
        kind: "capture",
        sessionId: upload.sessionId,
        assetId: upload.assetId,
        packageId: upload.packageId,
        assetType: upload.assetType,
        contentHash: upload.receivedHash,
        byteSize: upload.byteSize,
        ...(upload.mimeType !== undefined ? { mimeType: upload.mimeType } : {}),
        acquisition: upload.acquisition,
      },
      recordedBy: options.recordedBy,
      recordedAt: options.recordedAt,
      ...(options.notes !== undefined ? { notes: options.notes } : {}),
    });
  } catch (error) {
    // Kind incompatibility (explicit kind disagreeing with the
    // asset type) is the expected failure; everything else is a
    // record-validation failure. Both fail closed with the cause
    // message preserved.
    if (error instanceof EvidenceServiceError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new EvidenceServiceError(
      error instanceof EvidenceError && error.code === "KIND_INCOMPATIBLE"
        ? "KIND_INCOMPATIBLE"
        : "EVIDENCE_INVALID",
      message,
      { details: { sessionId: upload.sessionId, assetId: upload.assetId } },
    );
  }
}
