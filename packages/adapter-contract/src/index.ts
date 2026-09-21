/**
 * `@aise/adapter-contract` — public API (PROD-016).
 *
 * The versioned, testable shared client adapter contract of
 * spec/client-adapter-contract.md: the twelve semantic objects every
 * adapter consumes and emits, the platform-neutral capability negotiation
 * model, and the contract-level conformance harness. DATA + CONTRACT LOGIC
 * ONLY: no I/O in the harness core, no server behavior, no UI, NO
 * CLIENT-SIDE AUTHORITY (see README.md).
 *
 * TypeScript consumers import schemas/types/decoders/negotiation/conformance
 * from here. Non-TS consumers (Android) consume the committed JSON Schemas
 * in `schemas/` plus `CONFORMANCE_CHECKS` semantics documented in README.md.
 */

/* Versioning ---------------------------------------------------------------- */

export {
  ADAPTER_CONTRACT_VERSION,
  ADAPTER_CONTRACT_FAMILIES,
  ADAPTER_FAMILY_VERSIONS,
  adapterFamilyVersion,
  SEMANTIC_OBJECT_NAMES,
  NEGOTIATION_OBJECT_NAMES,
  ADAPTER_OBJECT_NAMES,
} from "./adapter-contracts.version";
export type {
  AdapterContractFamily,
  SemanticObjectName,
  NegotiationObjectName,
  AdapterObjectName,
} from "./adapter-contracts.version";

/* Errors and codec engine ---------------------------------------------------- */

export {
  AdapterContractError,
  AdapterContractVersionMismatchError,
  AdapterContractDecodeError,
  AdapterContractEncodeError,
} from "./errors";
export type {
  AdapterContractErrorCode,
  AdapterContractObjectContext,
  AdapterContractIssue,
} from "./errors";
export { createAdapterWireCodec } from "./codec";
export type { AdapterWireCodec, AdapterWireCodecOptions } from "./codec";

/* Family: context ------------------------------------------------------------ */

export {
  PROJECT_USER_ROLES,
  TASK_TYPES,
  ProjectContextSchema,
  TaskIntentSchema,
  ProjectContextCodec,
  decodeProjectContext,
  decodeProjectContextStrict,
  encodeProjectContext,
  TaskIntentCodec,
  decodeTaskIntent,
  decodeTaskIntentStrict,
  encodeTaskIntent,
} from "./context";
export type { ProjectContext, TaskIntent } from "./context";

/* Family: capability ---------------------------------------------------------- */

export {
  CLIENT_CAPABILITY_DOMAINS,
  clientCapabilityStatusSchema,
  SCREEN_SIZE_CLASSES,
  INPUT_MODES,
  CAMERA_CAPTURE_KINDS,
  SENSOR_KINDS,
  OFFLINE_STORAGE_MODES,
  NOTIFICATION_MODES,
  DEEP_LINK_MODES,
  CapabilityDescriptorSchema,
  ScreenCapabilitySchema,
  InputCapabilitySchema,
  SensorCapabilitySchema,
  CameraCapabilitySchema,
  OfflineStorageCapabilitySchema,
  NotificationCapabilitySchema,
  DeepLinkCapabilitySchema,
  ClientCapabilityProfileSchema,
  ScreenRequirementSchema,
  InputRequirementSchema,
  SensorRequirementSchema,
  CameraRequirementSchema,
  OfflineStorageRequirementSchema,
  NotificationRequirementSchema,
  DeepLinkRequirementSchema,
  TaskCapabilityRequirementsSchema,
  CapabilityDescriptorCodec,
  decodeCapabilityDescriptor,
  decodeCapabilityDescriptorStrict,
  encodeCapabilityDescriptor,
  ClientCapabilityProfileCodec,
  decodeClientCapabilityProfile,
  decodeClientCapabilityProfileStrict,
  encodeClientCapabilityProfile,
  TaskCapabilityRequirementsCodec,
  decodeTaskCapabilityRequirements,
  decodeTaskCapabilityRequirementsStrict,
  encodeTaskCapabilityRequirements,
} from "./capability";
export type {
  ClientCapabilityStatus,
  ClientCapabilityDomain,
  CapabilityDescriptor,
  ScreenSizeClass,
  InputMode,
  CameraCaptureKind,
  ScreenCapability,
  InputCapability,
  SensorCapability,
  CameraCapability,
  OfflineStorageCapability,
  NotificationCapability,
  DeepLinkCapability,
  OfflineStorageMode,
  NotificationMode,
  DeepLinkMode,
  ClientCapabilityProfile,
  ScreenRequirement,
  InputRequirement,
  SensorRequirement,
  CameraRequirement,
  OfflineStorageRequirement,
  NotificationRequirement,
  DeepLinkRequirement,
  TaskCapabilityRequirements,
} from "./capability";

/* Negotiation ------------------------------------------------------------------ */

export {
  INTERACTION_MODES,
  DOMAIN_OUTCOMES,
  NEGOTIATION_OUTCOMES,
  DomainNegotiationSchema,
  CapabilityNegotiationSchema,
  CapabilityNegotiationCodec,
  decodeCapabilityNegotiation,
  decodeCapabilityNegotiationStrict,
  encodeCapabilityNegotiation,
  deriveInteractionModes,
  negotiateCapabilities,
} from "./negotiation";
export type {
  InteractionMode,
  DomainOutcome,
  NegotiationOutcome,
  DomainNegotiation,
  CapabilityNegotiation,
} from "./negotiation";

/* Family: domain ---------------------------------------------------------------- */

export {
  EvidenceSummarySchema,
  RealitySummarySchema,
  BOQContextSchema,
  EngineeringCaseSummarySchema,
  InterventionScenarioSummarySchema,
  OutcomeSummarySchema,
  EvidenceSummaryCodec,
  decodeEvidenceSummary,
  decodeEvidenceSummaryStrict,
  encodeEvidenceSummary,
  RealitySummaryCodec,
  decodeRealitySummary,
  decodeRealitySummaryStrict,
  encodeRealitySummary,
  BOQContextCodec,
  decodeBOQContext,
  decodeBOQContextStrict,
  encodeBOQContext,
  EngineeringCaseSummaryCodec,
  decodeEngineeringCaseSummary,
  decodeEngineeringCaseSummaryStrict,
  encodeEngineeringCaseSummary,
  InterventionScenarioSummaryCodec,
  decodeInterventionScenarioSummary,
  decodeInterventionScenarioSummaryStrict,
  encodeInterventionScenarioSummary,
  OutcomeSummaryCodec,
  decodeOutcomeSummary,
  decodeOutcomeSummaryStrict,
  encodeOutcomeSummary,
} from "./domain";
export type {
  EvidenceGapSummary,
  EvidenceSummary,
  RealitySummary,
  BOQContext,
  EngineeringCaseSummary,
  InterventionScenarioSummary,
  OutcomeSummary,
} from "./domain";

/* Family: action ----------------------------------------------------------------- */

export {
  ACTION_STATUSES,
  NEXT_BEST_ACTION_KINDS,
  NextBestActionSchema,
  NextBestActionCodec,
  decodeNextBestAction,
  decodeNextBestActionStrict,
  encodeNextBestAction,
} from "./action";
export type { ActionStatus, ActionBlocker, NextBestAction } from "./action";

/* Family: authorization ------------------------------------------------------------ */

export {
  AUTHORIZATION_DENIAL_REASON_CODES,
  AuthorizationContextSchema,
  AuthorizationContextCodec,
  decodeAuthorizationContext,
  decodeAuthorizationContextStrict,
  encodeAuthorizationContext,
} from "./authorization";
export type { AuthorizationDenial, AuthorizationContext } from "./authorization";

/* Family: result -------------------------------------------------------------------- */

export {
  OPERATION_RESULT_STATUSES,
  OPERATION_FAILURE_CODES,
  OperationResultSchema,
  OperationResultCodec,
  decodeOperationResult,
  decodeOperationResultStrict,
  encodeOperationResult,
} from "./result";
export type { OperationResultStatus, OperationFailure, OperationResult } from "./result";

/* Reference profiles ------------------------------------------------------------------ */

export {
  REFERENCE_ADAPTER_KINDS,
  REFERENCE_BROWSER_PROFILE,
  REFERENCE_MOBILE_FIELD_PROFILE,
  REFERENCE_DESKTOP_RICH_SHELL_PROFILE,
  REFERENCE_PROFILES,
  REFERENCE_FIELD_DEPTH_CAPTURE_REQUIREMENTS,
  REFERENCE_BOQ_REVIEW_REQUIREMENTS,
  REFERENCE_OFFLINE_FIELD_QUEUE_REQUIREMENTS,
  REFERENCE_LIDAR_CAPTURE_REQUIREMENTS,
  REFERENCE_NOTIFICATION_BROADCAST_REQUIREMENTS,
  REFERENCE_TASK_REQUIREMENTS,
} from "./reference-profiles";
export type { ReferenceAdapterKind } from "./reference-profiles";

/* Registry ------------------------------------------------------------------------------ */

export {
  ADAPTER_WIRE_OBJECTS,
  ADAPTER_WIRE_OBJECT_NAMES,
  adapterWireObject,
} from "./registry";
export type { AdapterObjectDefinition } from "./registry";

/* Conformance ---------------------------------------------------------------------------- */

export {
  AUTHORITATIVE_FIELDS,
  DENIAL_SCENARIO_FIXTURE,
  FAILURE_SCENARIO_FIXTURE,
  BLOCKED_ACTION_SCENARIO_FIXTURE,
  REQUIRED_SCENARIO_FIXTURES,
  CONFORMANCE_CHECKS,
  runConformance,
  createLosslessBinding,
} from "./conformance";
export type {
  AdapterFixtureRecord,
  ConformanceCorpus,
  AdapterConformanceBinding,
  ConformanceCheckSpec,
  ConformanceCheckResult,
  ConformanceReport,
} from "./conformance";

/* Fixture loader (the only fs-touching helper) ---------------------------------------------- */

export { loadCommittedFixtures } from "./fixtures-loader";
