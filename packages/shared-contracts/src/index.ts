/**
 * `@aise/shared-contracts` — public API (AISE-003).
 *
 * Versioned, cross-platform wire contracts for device capability, capture
 * missions, evidence, core model objects and sync envelopes. DATA SHAPES
 * ONLY: no business logic, no I/O, no client or server behavior, no
 * readiness thresholds (readiness scoring is AISE-022).
 *
 * TypeScript consumers import schemas/types/decoders from here. Non-TS
 * consumers (Android) consume the committed JSON Schemas in `schemas/`.
 * See README.md for the versioning and compatibility policy.
 */

/* Versioning ---------------------------------------------------------------- */

export {
  CONTRACT_VERSION,
  CONTRACT_FAMILIES,
  FAMILY_VERSIONS,
  familyVersion,
  parseMajorVersion,
  sameMajorVersion,
} from "./contracts.version";
export type { ContractFamily } from "./contracts.version";

/* Shared primitives ---------------------------------------------------------- */

export {
  SEMVER_PATTERN,
  ISO_8601_UTC_PATTERN,
  contractVersionSchema,
  isoTimestampSchema,
  stableIdSchema,
  contentIdSchema,
  mediaTypeSchema,
  shortTextSchema,
  textSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  UNCERTAINTY_KINDS,
  UncertaintySchema,
  CONFIDENCE_KINDS,
  ConfidenceSchema,
  canonicalizeJson,
  canonicalJsonStringify,
} from "./common";
export type {
  UncertaintyKind,
  Uncertainty,
  ConfidenceKind,
  Confidence,
} from "./common";

/* Errors and codec engine ---------------------------------------------------- */

export {
  ContractError,
  ContractVersionMismatchError,
  ContractDecodeError,
  ContractEncodeError,
} from "./errors";
export type {
  ContractErrorCode,
  ContractObjectContext,
  ContractIssue,
} from "./errors";
export { createWireCodec } from "./codec";
export type { WireCodec, WireCodecOptions } from "./codec";
export { collectUnknownKeyPaths } from "./strictness";

/* Family: capability --------------------------------------------------------- */

export {
  CAPABILITY_STATUSES,
  capabilityStatusSchema,
  DeviceIdentitySchema,
  CapabilityDescriptorSchema,
  DeviceCapabilityProfileSchema,
  CapabilityDescriptorCodec,
  decodeCapabilityDescriptor,
  decodeCapabilityDescriptorStrict,
  encodeCapabilityDescriptor,
  DeviceCapabilityProfileCodec,
  decodeDeviceCapabilityProfile,
  decodeDeviceCapabilityProfileStrict,
  encodeDeviceCapabilityProfile,
} from "./capability";
export type {
  CapabilityStatus,
  DeviceIdentity,
  CapabilityDescriptor,
  DeviceCapabilityProfile,
} from "./capability";

/* Family: evidence ----------------------------------------------------------- */

export {
  ACQUISITION_METADATA_KEYS,
  EVIDENCE_METHODS,
  evidenceMethodSchema,
  PROVENANCE_ROLES,
  provenanceRoleSchema,
  EvidenceSchema,
  ProvenanceLinkSchema,
  DerivationSchema,
  EvidenceBundleSchema,
  EvidenceCodec,
  decodeEvidence,
  decodeEvidenceStrict,
  encodeEvidence,
  ProvenanceLinkCodec,
  decodeProvenanceLink,
  decodeProvenanceLinkStrict,
  encodeProvenanceLink,
  DerivationCodec,
  decodeDerivation,
  decodeDerivationStrict,
  encodeDerivation,
  EvidenceBundleCodec,
  decodeEvidenceBundle,
  decodeEvidenceBundleStrict,
  encodeEvidenceBundle,
} from "./evidence";
export type {
  EvidenceMethod,
  ProvenanceRole,
  Evidence,
  ProvenanceLink,
  Derivation,
  EvidenceBundle,
} from "./evidence";

/* Family: mission ------------------------------------------------------------ */

export {
  MISSION_STATES,
  missionStateSchema,
  EVIDENCE_GAP_KINDS,
  evidenceGapKindSchema,
  CaptureMissionSchema,
  CaptureStepSchema,
  ReferenceControlSchema,
  EvidenceGapSchema,
  CaptureMissionCodec,
  decodeCaptureMission,
  decodeCaptureMissionStrict,
  encodeCaptureMission,
  CaptureStepCodec,
  decodeCaptureStep,
  decodeCaptureStepStrict,
  encodeCaptureStep,
  ReferenceControlCodec,
  decodeReferenceControl,
  decodeReferenceControlStrict,
  encodeReferenceControl,
  EvidenceGapCodec,
  decodeEvidenceGap,
  decodeEvidenceGapStrict,
  encodeEvidenceGap,
} from "./mission";
export type {
  MissionState,
  EvidenceGapKind,
  CaptureMission,
  CaptureStep,
  ReferenceControl,
  EvidenceGap,
} from "./mission";

/* Family: model -------------------------------------------------------------- */

export {
  EPISTEMIC_STATUSES,
  epistemicStatusSchema,
  UnitsSpecSchema,
  PropertyAssertionSchema,
  RealityObjectSchema,
  ObservationSchema,
  MeasurementSchema,
  PropertyAssertionCodec,
  decodePropertyAssertion,
  decodePropertyAssertionStrict,
  encodePropertyAssertion,
  RealityObjectCodec,
  decodeRealityObject,
  decodeRealityObjectStrict,
  encodeRealityObject,
  ObservationCodec,
  decodeObservation,
  decodeObservationStrict,
  encodeObservation,
  MeasurementCodec,
  decodeMeasurement,
  decodeMeasurementStrict,
  encodeMeasurement,
} from "./model";
export type {
  EpistemicStatus,
  UnitsSpec,
  PropertyAssertion,
  RealityObject,
  Observation,
  Measurement,
} from "./model";

/* Family: sync --------------------------------------------------------------- */

export {
  SYNC_OUTCOMES,
  syncOutcomeSchema,
  SYNC_REASON_CODES,
  syncReasonCodeSchema,
  CaptureSessionEnvelopeSchema,
  SyncBatchSchema,
  SyncAckSchema,
  CaptureSessionEnvelopeCodec,
  decodeCaptureSessionEnvelope,
  decodeCaptureSessionEnvelopeStrict,
  encodeCaptureSessionEnvelope,
  SyncBatchCodec,
  decodeSyncBatch,
  decodeSyncBatchStrict,
  encodeSyncBatch,
  SyncAckCodec,
  decodeSyncAck,
  decodeSyncAckStrict,
  encodeSyncAck,
} from "./sync";
export type {
  SyncOutcome,
  SyncReasonCode,
  CaptureSessionEnvelope,
  SyncBatch,
  SyncAck,
} from "./sync";

/* Registry ------------------------------------------------------------------- */

export { WIRE_OBJECTS, WIRE_OBJECT_NAMES, wireObject } from "./registry";
export type { WireObjectDefinition } from "./registry";
