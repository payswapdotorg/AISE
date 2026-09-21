/**
 * `@aise/solution-contract` — public API (PROD-021).
 *
 * The versioned, testable contract of the interactive engineering solution
 * workflow (spec/solution-operation-contract.md; governing records
 * ACR-005/ACR-006): the ten solution-graph/BOQ-trace wire objects the work
 * order names, the typed operation intent with its single constructor
 * surface for direct manipulation AND agent commands, the lifecycle state
 * machine, the operation capability negotiation, the bidirectional BOQ
 * trace resolution, the deterministic identity derivations and the
 * cross-field invariant checks. DATA + CONTRACT LOGIC ONLY: no I/O in the
 * core (the fixture loader is the only fs-touching helper), no server
 * behavior, no 3D, NO MUTATION PATH FOR AUTHORITATIVE REALITY (see
 * README.md).
 *
 * TypeScript consumers import schemas/types/decoders/negotiation/traces
 * from here. Non-TS consumers consume the committed JSON Schemas in
 * `schemas/` plus the committed fixture corpus.
 */

/* Versioning ---------------------------------------------------------------- */

export {
  SOLUTION_CONTRACT_VERSION,
  SOLUTION_CONTRACT_FAMILIES,
  SOLUTION_FAMILY_VERSIONS,
  solutionFamilyVersion,
  SOLUTION_GRAPH_OBJECT_NAMES,
  SOLUTION_INTERACTION_OBJECT_NAMES,
  SOLUTION_OBJECT_NAMES,
} from "./solution-contracts.version";
export type {
  SolutionContractFamily,
  SolutionGraphObjectName,
  SolutionInteractionObjectName,
  SolutionObjectName,
} from "./solution-contracts.version";

/* Errors and codec engine ---------------------------------------------------- */

export {
  SolutionContractError,
  SolutionContractVersionMismatchError,
  SolutionContractDecodeError,
  SolutionContractEncodeError,
  SolutionContractLifecycleError,
} from "./errors";
export type {
  SolutionContractErrorCode,
  SolutionContractObjectContext,
  SolutionContractIssue,
} from "./errors";
export { createSolutionWireCodec } from "./codec";
export type { SolutionWireCodec, SolutionWireCodecOptions } from "./codec";

/* Family: domain (extensibility) --------------------------------------------- */

export {
  SOLUTION_VERTICALS,
  BUILDING_VERTICAL,
  FUTURE_VERTICALS,
  BUILDING_OPERATION_VOCABULARY,
  BUILDING_ELEMENT_TAXONOMY_EXTENSION,
  REFERENCE_BUILDING_DOMAIN,
  BUILDING_OPERATION_TYPES,
  BUILDING_OPERATION_CATEGORIES,
  SolutionDomainExtensionSchema,
  SolutionDomainDescriptorSchema,
  SolutionDomainDescriptorCodec,
  decodeSolutionDomainDescriptor,
  decodeSolutionDomainDescriptorStrict,
  encodeSolutionDomainDescriptor,
} from "./domain";
export type {
  SolutionVertical,
  SolutionDomainExtension,
  SolutionDomainDescriptor,
  BuildingOperationType,
} from "./domain";

/* Family: operation (record + satellites) ------------------------------------- */

export {
  SPATIAL_SELECTOR_KINDS,
  TARGET_GEOMETRY_REF_KINDS,
  OPERATION_INTENT_ORIGINS,
  OPERATION_DEPENDENCY_KINDS,
  QUANTITY_DIMENSIONS,
  QUANTITY_IMPACT_DIRECTIONS,
  OPERATION_EFFECT_KINDS,
  TypedOperationParameterSchema,
  OperationProvenanceSchema,
  TargetGeometryRefSchema,
  SpatialUnitsSchema,
  OperationTargetSchema,
  OperationTargetCodec,
  decodeOperationTarget,
  decodeOperationTargetStrict,
  encodeOperationTarget,
  OperationDependencySchema,
  OperationDependencyCodec,
  decodeOperationDependency,
  decodeOperationDependencyStrict,
  encodeOperationDependency,
  TypedQuantitySchema,
  OperationEffectSchema,
  OperationEffectCodec,
  decodeOperationEffect,
  decodeOperationEffectStrict,
  encodeOperationEffect,
  EngineeringOperationSchema,
  EngineeringOperationCodec,
  decodeEngineeringOperation,
  decodeEngineeringOperationStrict,
  encodeEngineeringOperation,
} from "./operation";
export type {
  TypedOperationParameter,
  OperationIntentOrigin,
  OperationProvenance,
  SpatialSelectorKind,
  TargetGeometryRefKind,
  TargetGeometryRef,
  SpatialUnits,
  OperationTarget,
  OperationDependencyKind,
  OperationDependency,
  QuantityDimension,
  QuantityImpactDirection,
  TypedQuantity,
  OperationEffectKind,
  OperationEffect,
  EngineeringOperation,
} from "./operation";

/* Family: operation (the intent + constructor) --------------------------------- */

export {
  IntentProposalContextSchema,
  EngineeringOperationIntentSchema,
  EngineeringOperationIntentCodec,
  decodeEngineeringOperationIntent,
  decodeEngineeringOperationIntentStrict,
  encodeEngineeringOperationIntent,
  createOperationIntent,
} from "./intent";
export type {
  IntentProposalContext,
  EngineeringOperationIntent,
  CreateOperationIntentInput,
} from "./intent";

/* Family: state (the PROPOSED seal) --------------------------------------------- */

export {
  ProposedStateSchema,
  ProposedStateCodec,
  decodeProposedState,
  decodeProposedStateStrict,
  encodeProposedState,
} from "./state";
export type { ProposedState } from "./state";

/* Family: validation ------------------------------------------------------------ */

export {
  VALIDATION_CHECK_RESULTS,
  VALIDATION_SNAPSHOT_OUTCOMES,
  validationOutcomeWorstOf,
  ValidationCheckSchema,
  ValidationEngineRefSchema,
  SolutionValidationSnapshotSchema,
  SolutionValidationSnapshotCodec,
  decodeSolutionValidationSnapshot,
  decodeSolutionValidationSnapshotStrict,
  encodeSolutionValidationSnapshot,
} from "./validation";
export type {
  ValidationCheckResult,
  ValidationSnapshotOutcome,
  ValidationCheck,
  ValidationEngineRef,
  SolutionValidationSnapshot,
} from "./validation";

/* Family: capability ------------------------------------------------------------ */

export {
  REFERENCE_PROFILE_INSTANT,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  REFERENCE_PARTIAL_BUILDING_OPERATION_PROFILE,
  REFERENCE_BUILDING_PROFILE_OPERATION_TYPES,
  OperationTypeCapabilitySchema,
  DomainOperationCapabilitySchema,
  OperationCapabilityProfileSchema,
  OperationCapabilityProfileCodec,
  decodeOperationCapabilityProfile,
  decodeOperationCapabilityProfileStrict,
  encodeOperationCapabilityProfile,
} from "./capability";
export type {
  OperationTypeCapability,
  DomainOperationCapability,
  OperationCapabilityProfile,
} from "./capability";

/* Negotiation --------------------------------------------------------------------- */

export {
  OPERATION_NEGOTIATION_OUTCOMES,
  OPERATION_NEGOTIATION_REASON_CODES,
  NegotiationReasonSchema,
  OperationCapabilityNegotiationSchema,
  OperationCapabilityNegotiationCodec,
  decodeOperationCapabilityNegotiation,
  decodeOperationCapabilityNegotiationStrict,
  encodeOperationCapabilityNegotiation,
  negotiateOperationCapability,
} from "./negotiation";
export type {
  OperationNegotiationOutcome,
  OperationNegotiationReasonCode,
  NegotiationReason,
  OperationCapabilityNegotiation,
} from "./negotiation";

/* Family: trace (bidirectional BOQ traces) ------------------------------------------ */

export {
  BOQ_LINE_CONTRIBUTION_KINDS,
  OperationContributionSchema,
  SolutionBoqLineTraceSchema,
  SolutionBoqLineTraceCodec,
  decodeSolutionBoqLineTrace,
  decodeSolutionBoqLineTraceStrict,
  encodeSolutionBoqLineTrace,
  SolutionBoqTraceSetSchema,
  SolutionBoqTraceSetCodec,
  decodeSolutionBoqTraceSet,
  decodeSolutionBoqTraceSetStrict,
  encodeSolutionBoqTraceSet,
  resolveOperationsForLine,
  resolveLinesForOperation,
  findContribution,
} from "./trace";
export type {
  BoqLineContributionKind,
  OperationContribution,
  SolutionBoqLineTrace,
  SolutionBoqTraceSet,
} from "./trace";

/* Family: solution (containers + lifecycle) -------------------------------------------- */

export {
  SOLUTION_LIFECYCLE_STATUSES,
  TERMINAL_SOLUTION_STATUSES,
  SOLUTION_LIFECYCLE_TRANSITIONS,
  isTerminalSolutionStatus,
  canTransitionSolutionStatus,
  assertSolutionLifecycleTransition,
} from "./lifecycle";
export type { SolutionLifecycleStatus } from "./lifecycle";
export {
  SolutionBranchSchema,
  SolutionSchema,
  SolutionCodec,
  decodeSolution,
  decodeSolutionStrict,
  encodeSolution,
  SolutionVersionSchema,
  SolutionVersionCodec,
  decodeSolutionVersion,
  decodeSolutionVersionStrict,
  encodeSolutionVersion,
} from "./solution";
export type { SolutionBranch, Solution, SolutionVersion } from "./solution";

/* Deterministic identities --------------------------------------------------------------- */

export {
  deriveEngineeringOperationId,
  operationSemanticIdentityOfIntent,
  operationSemanticIdentityOfOperation,
  deriveProposedStateId,
  deriveValidationSnapshotId,
  deriveSolutionBoqLineTraceId,
} from "./identity";
export type {
  OperationVersionContext,
  OperationSemanticIdentity,
  ProposedStateIdentityInput,
  ValidationSnapshotIdentityInput,
  BoqLineTraceIdentityInput,
} from "./identity";

/* Cross-field invariants -------------------------------------------------------------------- */

export {
  SOLUTION_CONTRACT_INVARIANT_CODES,
  checkTypedOperationParameters,
  checkOperationTarget,
  checkOperationProvenance,
  checkEngineeringOperationIntent,
  checkEngineeringOperation,
  checkProposedState,
  checkSolution,
  checkSolutionVersion,
  checkSolutionValidationSnapshot,
  checkOperationCapabilityProfile,
  checkSolutionBoqLineTrace,
  checkSolutionBoqTraceSet,
  checkSolutionContractObject,
} from "./invariants";
export type {
  SolutionContractInvariantCode,
  SolutionContractInvariantFinding,
} from "./invariants";

/* Registry ------------------------------------------------------------------------------------- */

export {
  SOLUTION_WIRE_OBJECTS,
  SOLUTION_WIRE_OBJECT_NAMES,
  solutionWireObject,
} from "./registry";
export type { SolutionObjectDefinition } from "./registry";

/* Fixture loader (the only fs-touching helper) ---------------------------------------------------- */

export { loadCommittedFixtures } from "./fixtures-loader";
export type { SolutionFixtureRecord, SolutionFixtureCorpus } from "./fixtures-loader";
