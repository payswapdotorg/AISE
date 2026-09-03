/**
 * @aise/shared-contracts — versioned cross-platform interchange
 * contracts for the Android field app and Z.ai web/cloud services
 * (AISE-003, SHARED work item).
 *
 * Public surface:
 * - versions  — contract version constants and compatibility rules
 * - types     — TypeScript mirrors of the JSON Schemas
 * - validate  — JSON Schema (draft 2020-12) validators
 * - semantics — cross-field invariants (capture package)
 * - compat    — tolerant-reader helpers for cross-MINOR reading
 * - io        — schema/fixture file access for any consumer
 */
export {
  CONTRACT_VERSION,
  SUPPORTED_CONTRACT_VERSIONS,
  isSupportedContractVersion,
  isContractVersionFormat,
  majorOf,
  isCompatibleReader,
} from "./versions.js";

export type {
  ContractVersion,
  Uuid,
  Timestamp,
  ContentHash,
  Project,
  CaptureIntent,
  AssuranceProfile,
  SessionStatus,
  CaptureSession,
  AssetType,
  ChecksumAlgorithm,
  Geolocation,
  OrientationQuaternion,
  Orientation,
  AcquisitionMetadata,
  PackageAsset,
  CapturePackage,
  UploadPart,
  UploadRequest,
  UploadOutcome,
  UploadResult,
  SyncErrorCode,
  SyncError,
  ModelVersionId,
  ModelObjectRef,
  EpistemicState,
  ObservationPresence,
  UncertaintyType,
  Uncertainty,
  MeasurementKind,
  MeasurementTransport,
} from "./types.js";

export type { ValidationOutcome } from "./validate.js";
export {
  validateProject,
  validateCaptureSession,
  validateCapturePackage,
  validateUploadRequest,
  validateUploadResult,
  validateSyncError,
  validateModelVersion,
  validateModelObjectRef,
  validateMeasurement,
  validateEpistemicState,
  validateObservationPresence,
} from "./validate.js";

export type { SemanticIssue } from "./semantics.js";
export { checkCapturePackageSemantics } from "./semantics.js";

export {
  UNKNOWN_ENUM,
  tolerateEnumValue,
  isEnvelopeLike,
  readContractVersion,
  stripUnknownFields,
  syncRetryDecision,
} from "./compat.js";
export type { EnumOrUnknown } from "./compat.js";

export {
  CONTRACTS_DIR,
  FIXTURES_DIR,
  CONTRACT_FILES,
  SCHEMA_ID_BASE,
  loadSchema,
  loadAllSchemas,
  loadFixtureJson,
  listFixtures,
} from "./io.js";
