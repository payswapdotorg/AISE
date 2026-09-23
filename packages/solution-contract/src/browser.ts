/**
 * `@aise/solution-contract/browser` — the BROWSER-SAFE cut of the public
 * API (PROD-031, the PROD-030 subpath pattern).
 *
 * WHY THIS MODULE EXISTS: the barrel (`src/index.ts`) re-exports the
 * deterministic identity derivations (`src/identity.ts`), whose module
 * scope imports `node:crypto`'s `createHash`. A plain-browser bundle
 * externalizes that builtin (rolldown emits the empty-exports stub whose
 * namespace call throws at CALL time), so ANY browser graph importing the
 * barrel carries the crypto stub — exactly the defect class PROD-030
 * documented for node:fs/node:path and PROD-031 closes for the solution
 * workspace's browser mount.
 *
 * THE CUT: this subpath re-exports every crypto-FREE family of the
 * contract — versions, errors + codec engine, domain descriptors, the
 * operation record + satellites, the intent + its single constructor
 * surface, proposed states, validation snapshots, capability profiles +
 * negotiation, the bidirectional BOQ trace resolvers, the solution
 * containers + lifecycle, the cross-field invariants and the registry —
 * the SAME exports, from the SAME modules, as the barrel. The ONLY things
 * deliberately absent are the identity derivations
 * (`deriveEngineeringOperationId`, `deriveProposedStateId`,
 * `deriveValidationSnapshotId`, `deriveSolutionBoqLineTraceId`, their
 * input types and the semantic-identity extractors): they are NOT
 * browser-safe (sha-256 over canonical JSON through `node:crypto`) and a
 * browser consumer that needs an identity derived must ask the BACKEND
 * through the solution routes (the PROD-031 browser mount's law: the
 * engine executes server-side; the browser renders its outputs verbatim).
 *
 * PROOF OF CRYPTO-FREENESS: by construction — every module re-exported
 * here imports only zod, `@aise/shared-contracts` (crypto-free: canonical
 * JSON only) and each other; `src/identity.ts` is the ONLY module of this
 * package that imports `node:crypto`, and this file does not import it.
 * `src/browser-safety.test.ts` pins all three sides: the module source
 * references no `./identity` specifier, the package exports map declares
 * the subpath, and the runtime namespace carries the browser graph's
 * sentinel values (the constructor, the reference profile, the trace
 * resolvers) while the identity derivations stay absent. The build-side
 * proof is the PROD-031 web-bundle gate: the browser mount's chunk must
 * contain no Node-builtin externalization marker at all.
 *
 * The barrel itself stays byte-identical (its exports are FROZEN); this
 * subpath is purely additive.
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

/* Deliberately NOT re-exported (browser-UNSAFE, see the module header):

  - the identity derivations of `./identity` (module-scope `node:crypto`)
    [the barrel keeps them for Node consumers];
  - the Node-only committed-fixture loader (`./fixtures-loader` — the
    PROD-030 subpath, node:fs/node:path at module scope).
*/
