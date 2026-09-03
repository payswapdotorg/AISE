/**
 * TypeScript mirrors of the JSON Schemas in `contracts/`.
 *
 * The JSON Schemas are the machine-readable authority for these
 * contracts; these types mirror them for typed consumers on the
 * Z.ai side. Two consistency guarantees are enforced by tests:
 *
 * 1. every fixture in `fixtures/` validates against its schema
 *    (data <-> schema);
 * 2. typed sample literals constructed against these interfaces
 *    validate against the schemas (types <-> schema).
 *
 * String fields use plain `string` (not template-literal or union
 * narrowing on identifiers) so JSON payloads remain assignable after
 * runtime validation; enum-like fields use literal unions because
 * producers construct them as literals.
 */

/**
 * MAJOR.MINOR contract version. The JSON Schema constrains the
 * pattern at validation time.
 */
export type ContractVersion = string;

/** UUID identifier (offline-generatable, collision-safe). */
export type Uuid = string;

/** RFC 3339 UTC timestamp. */
export type Timestamp = string;

/** SHA-256 content hash, lowercase hex. */
export type ContentHash = string;

// ---------------------------------------------------------------------------
// Project identity
// ---------------------------------------------------------------------------

export interface Project {
  contractVersion: ContractVersion;
  projectId: Uuid;
  name: string;
  description?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// ---------------------------------------------------------------------------
// Capture session
// ---------------------------------------------------------------------------

export type CaptureIntent = "AS_BUILT" | "MAINTENANCE" | "INSPECTION";

export type AssuranceProfile = "LIGHT" | "STANDARD" | "HIGH_ASSURANCE" | "CRITICAL";

export type SessionStatus = "DRAFT" | "READY" | "IN_PROGRESS" | "COMPLETED";

export interface CaptureSession {
  contractVersion: ContractVersion;
  sessionId: Uuid;
  projectId: Uuid;
  intent: CaptureIntent;
  assuranceProfile: AssuranceProfile;
  status: SessionStatus;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  operatorRef?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Capture package manifest
// ---------------------------------------------------------------------------

export type AssetType =
  | "PHOTO"
  | "VIDEO"
  | "DEPTH"
  | "METADATA"
  | "SKETCH"
  | "VOICE"
  | "DOCUMENT";

export type ChecksumAlgorithm = "sha256";

export interface Geolocation {
  latitude: number;
  longitude: number;
  altitudeM?: number;
  accuracyM?: number;
}

export interface OrientationQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Orientation {
  quaternion: OrientationQuaternion;
}

/**
 * Device-neutral acquisition metadata. Device/sensor references are
 * opaque strings; no platform-specific fields belong here.
 */
export interface AcquisitionMetadata {
  capturedAt: Timestamp;
  deviceRef?: string;
  sensorRef?: string;
  geolocation?: Geolocation;
  orientation?: Orientation;
  notes?: string;
}

export interface PackageAsset {
  assetId: Uuid;
  assetType: AssetType;
  relativePath: string;
  contentHash: ContentHash;
  byteSize: number;
  mimeType?: string;
  acquisition: AcquisitionMetadata;
}

export interface CapturePackage {
  contractVersion: ContractVersion;
  packageId: Uuid;
  sessionId: Uuid;
  projectId: Uuid;
  createdAt: Timestamp;
  checksumAlgorithm: ChecksumAlgorithm;
  totalByteSize?: number;
  assets: PackageAsset[];
}

// ---------------------------------------------------------------------------
// Upload / idempotency
// ---------------------------------------------------------------------------

export interface UploadPart {
  index: number;
  total: number;
}

export interface UploadRequest {
  contractVersion: ContractVersion;
  sessionId: Uuid;
  assetId: Uuid;
  idempotencyKey: Uuid;
  contentHash: ContentHash;
  byteSize: number;
  part?: UploadPart;
}

export type UploadOutcome = "ACCEPTED" | "DUPLICATE";

export interface UploadResult {
  contractVersion: ContractVersion;
  assetId: Uuid;
  outcome: UploadOutcome;
  receivedHash: ContentHash;
  duplicateOf?: Uuid;
  note?: string;
}

// ---------------------------------------------------------------------------
// Synchronization errors
// ---------------------------------------------------------------------------

export type SyncErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "PROJECT_NOT_FOUND"
  | "SESSION_NOT_FOUND"
  | "ASSET_NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CHECKSUM_MISMATCH"
  | "PAYLOAD_TOO_LARGE"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "CONTRACT_VERSION_UNSUPPORTED";

export interface SyncError {
  contractVersion: ContractVersion;
  code: SyncErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Model / version identifiers
// ---------------------------------------------------------------------------

export interface ModelVersionId {
  contractVersion: ContractVersion;
  projectId: Uuid;
  modelId: Uuid;
  version: number;
  parentVersion?: number;
}

export interface ModelObjectRef {
  modelId: Uuid;
  version: number;
  objectId: string;
}

// ---------------------------------------------------------------------------
// Epistemic vocabulary and measurement transport
// ---------------------------------------------------------------------------

export type EpistemicState = "OBSERVED" | "INFERRED" | "CONFIRMED" | "PROPOSED";

export type ObservationPresence = "UNKNOWN" | "NOT_OBSERVED" | "OCCLUDED";

export type UncertaintyType =
  | "absolute_tolerance"
  | "standard_uncertainty"
  | "coverage";

export interface Uncertainty {
  plusMinus: number;
  unit: string;
  type?: UncertaintyType;
  level?: number;
}

export type MeasurementKind = "measurement" | "estimate";

/**
 * Transport record for a measured or estimated quantity. `kind`
 * separates measurements from estimates; `confidence` (model
 * probability) is a different field from `uncertainty` (metrological
 * uncertainty) and never substitutes for it.
 */
export interface MeasurementTransport {
  kind: MeasurementKind;
  value: number;
  unit: string;
  uncertainty?: Uncertainty;
  confidence?: number;
  method?: string;
}
