/**
 * The capture-source port: the reconstruction pipeline's view of
 * AISE-004 committed ingestion state (AISE-008).
 *
 * AISE-004 (capture ingestion API) commits logical uploads as
 * immutable raw-evidence records with: session/asset identity, the
 * declared content hash, the server-verified received hash, byte
 * size, MIME type, and the verbatim acquisition metadata. That
 * committed-upload shape — NOT the wire envelopes — is the only
 * ingestion state reconstruction consumes, and it is mirrored here
 * as a structural port rather than imported from the API service
 * package: services in this repository share contracts and ports,
 * not each other's internals (the API service and the worker are
 * separate processes sharing only the `@aise/backend-jobs` boundary;
 * the same discipline applies to reconstruction).
 *
 * The port is intentionally narrower than the full ingestion store:
 * reconstruction needs committed uploads per session, nothing else.
 * `assetType` keeps the AISE-003 cross-MINOR reader sentinel surface
 * (`EnumOrUnknown<AssetType>`) because manifests read tolerantly can
 * carry it; consumers must handle it (preprocessing fails closed on
 * it — an ambiguous asset type is not routable).
 *
 * v1.0 ships two bindings: `createStaticCaptureSource` (fixed
 * records — composition/testing) and `createFailClosedCaptureSource`
 * (the production default until a durable ingestion transport is
 * bound; it never fabricates state).
 */
import type {
  AcquisitionMetadata,
  AssetType,
  ContentHash,
  EnumOrUnknown,
  Uuid,
} from "@aise/shared-contracts";
import { ReconstructionError } from "../errors.js";

/**
 * One committed logical upload, as AISE-004 guarantees it:
 * `contentHash === receivedHash === sha256(payload)` and
 * `byteSize === payload.length` were all verified at commit time.
 * Reconstruction re-verifies them independently (defense in depth).
 */
export interface CommittedCaptureUpload {
  readonly sessionId: Uuid;
  readonly assetId: Uuid;
  /** Declared content hash (lowercase-hex sha-256). */
  readonly contentHash: ContentHash;
  /** Server-computed hash recorded at commit; equal to contentHash. */
  readonly receivedHash: ContentHash;
  readonly byteSize: number;
  readonly mimeType: string | undefined;
  /**
   * Asset type from the declaring manifest, with the cross-MINOR
   * reader sentinel surface preserved.
   */
  readonly assetType: EnumOrUnknown<AssetType>;
  /** Acquisition metadata preserved verbatim by ingestion. */
  readonly acquisition: AcquisitionMetadata;
  /** Raw evidence bytes (in-memory placeholder for object storage). */
  readonly payload: Uint8Array;
}

/**
 * Read port over committed ingestion state. `undefined` means the
 * session is unknown; an empty array means the session is known but
 * has no committed uploads (distinct states, kept distinct).
 */
export interface CaptureUploadSource {
  /** Stable description for observability (e.g. readiness logs). */
  readonly kind: string;
  listCommittedUploads(sessionId: Uuid): readonly CommittedCaptureUpload[] | undefined;
}

export interface StaticCaptureSourceOptions {
  /** Stable description for observability. Default: "static". */
  readonly kind?: string;
}

/** Creates a capture source serving a fixed list of committed uploads. */
export function createStaticCaptureSource(
  uploads: readonly CommittedCaptureUpload[],
  options: StaticCaptureSourceOptions = {},
): CaptureUploadSource {
  const bySession = new Map<Uuid, CommittedCaptureUpload[]>();
  for (const upload of uploads) {
    const bucket = bySession.get(upload.sessionId) ?? [];
    bucket.push(upload);
    bySession.set(upload.sessionId, bucket);
  }
  return {
    kind: options.kind ?? "static",
    listCommittedUploads: (sessionId) => bySession.get(sessionId),
  };
}

export interface FailClosedCaptureSourceOptions {
  /** Stable description for observability. Default: "unbound". */
  readonly kind?: string;
}

/**
 * Creates the production-default capture source: every read fails
 * closed. Until a durable ingestion transport is wired (later Work
 * Item), the reconstruction service process has no live view of
 * ingestion state, and it must say so instead of answering with
 * empty or fabricated sessions.
 */
export function createFailClosedCaptureSource(
  options: FailClosedCaptureSourceOptions = {},
): CaptureUploadSource {
  const kind = options.kind ?? "unbound";
  return {
    kind,
    listCommittedUploads: (sessionId) => {
      throw new ReconstructionError(
        "CAPTURE_SOURCE_UNAVAILABLE",
        `capture source "${kind}" is not bound to ingestion state; refusing to answer for session ${sessionId}`,
        { details: { sessionId, sourceKind: kind } },
      );
    },
  };
}
