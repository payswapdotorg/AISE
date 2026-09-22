/**
 * `@aise/provider-registry` — public API (HFX-000).
 *
 * THE PROVIDER EVALUATION CONTROL PLANE of the HFX hardening track: the
 * machine-readable `ProviderProfile` schema, the append-only provider
 * registry with its promotion state machine and license/use gate, the
 * normalized provider I/O boundary, the closed failure vocabulary, the
 * benchmark result schema, the portable provenance manifest and the
 * deterministic reference-provider lifecycle (the §HF-0 exit gate).
 *
 * PURE DETERMINISTIC COMPUTATION over declared inputs: no network, no
 * clock reads (no registry field ever carries a timestamp — the log order
 * IS the time), no randomness, no environment senses, no I/O in the core
 * (testkit.ts is the TEST-ONLY exception). Identical registry inputs
 * produce identical registry states and decisions.
 *
 * CANONICAL-BOUNDARY DOCTRINE: a provider — model, dataset, Space,
 * renderer, reconstruction engine or agent framework — is an implementation
 * candidate, NEVER canonical engineering truth. This package imports ONLY
 * `@aise/shared-contracts`'s canonical-JSON serializer (a pure text helper)
 * plus `node:crypto`; no canonical AISE domain type is imported, extended
 * or redefined. Provider-native formats are captured as OPAQUE provenance
 * payloads (io.ts) and never parsed into canonical domain types. The only
 * import from the shared contracts package is asserted by
 * discipline.test.ts.
 *
 * The exported surface is functions + frozen constants ONLY (the house
 * package discipline). Endpoint-side orchestration lives in the backend
 * module `backend/api/src/providers/` (a thin transport adapter the Tech
 * Lead mounts at the integration station).
 */

/* Closed failure vocabulary ------------------------------------------ */

export {
  FAILURE_KINDS,
  FAILURE_VOCABULARY,
  failureDefinitionOf,
  isFailureKind,
} from "./failures";
export type { FailureDefinition, FailureKind } from "./failures";

/* Profile schema + validators ----------------------------------------- */

export {
  COMPUTE_ACCELERATORS,
  CONTRACT_FIELD_TYPES,
  COST_MODELS,
  MANDATORY_PROFILE_FIELDS,
  NATIVE_PAYLOAD_POLICIES,
  PROVIDER_MODALITIES,
  PROVIDER_PROFILE_KIND,
  PROVIDER_PROFILE_SCHEMA_VERSION,
  PROFILE_VALIDATION_FAILURE_KINDS,
  UNCERTAINTY_CALIBRATIONS,
  deriveEvaluationOnly,
  isProviderProfile,
  profileDigestOf,
  toLicenseDeclaration,
  validateProviderProfile,
} from "./profile";
export type {
  ComputeAccelerator,
  ComputeProfile,
  ContractFieldSpec,
  ContractFieldType,
  CostModel,
  CostProfile,
  FailureModeDeclaration,
  LicenseClearanceInput,
  LicenseDeclaration,
  LicenseDeclarationInput,
  LatencyProfile,
  MemoryProfile,
  NativePayloadPolicy,
  ProfileValidationFailure,
  ProfileValidationFailureKind,
  ProviderIOContract,
  ProviderModality,
  ProviderProfile,
  ProviderProfileValidation,
  ProvenanceContract,
  UncertaintyCalibration,
  UncertaintyCharacteristics,
} from "./profile";

/* Normalized I/O boundary ---------------------------------------------- */

export {
  INPUT_VALIDATION_FAILURE_KINDS,
  NORMALIZE_FAILURE_KINDS,
  PROVIDER_INPUT_KIND,
  PROVIDER_RESULT_KIND,
  inputDigestOf,
  normalizeResult,
  opaqueNativeDigestOf,
  outputsDigestOf,
  providerResultDigestOf,
  validatePayloadAgainstContract,
  validateProviderInput,
} from "./io";
export type {
  ContractIssue,
  InputValidationFailure,
  InputValidationFailureKind,
  NormalizeFailure,
  NormalizeFailureKind,
  NormalizeResultOutcome,
  OpaqueNativePayload,
  ProviderFailureObservation,
  ProviderInput,
  ProviderInputValidation,
  ProviderResult,
  RawProviderExecution,
} from "./io";

/* Benchmark result schema ---------------------------------------------- */

export {
  BENCHMARK_RECORD_KIND,
  BENCHMARK_RECORD_SCHEMA_VERSION,
  BENCHMARK_VALIDATION_FAILURE_KINDS,
  benchmarkComparabilityKey,
  benchmarkRecordDigestOf,
  deriveBenchmarkRecordId,
  validateBenchmarkRecord,
} from "./benchmark";
export type {
  BenchmarkFailureObservation,
  BenchmarkMetric,
  BenchmarkRecord,
  BenchmarkRecordValidation,
  BenchmarkReproduction,
  BenchmarkValidationFailure,
  BenchmarkValidationFailureKind,
  ResourceObservations,
} from "./benchmark";

/* Portable provenance manifest ----------------------------------------- */

export {
  CONTROL_PLANE_SURFACE,
  PROVENANCE_CONSUMER_AISE,
  PROVENANCE_MANIFEST_KIND,
  PROVENANCE_MANIFEST_SCHEMA_VERSION,
  PROVENANCE_VALIDATION_FAILURE_KINDS,
  manifestDigestOf,
  sealProvenanceManifest,
  verifyProvenanceManifest,
} from "./provenance";
export type {
  ConsumerIdentity,
  EnvironmentFingerprint,
  ProfileReference,
  ProvenanceManifest,
  ProvenanceManifestValidation,
  ProvenanceValidationFailure,
  ProvenanceValidationFailureKind,
  SealProvenanceInput,
} from "./provenance";

/* Registry + promotion state machine ------------------------------------ */

export {
  PROVIDER_REGISTRY_EVENT_KINDS,
  PROVIDER_REGISTRY_STATES,
  PROMOTION_GATE_IDS,
  PROMOTION_REFUSAL_KINDS,
  REGISTRY_EVENT_FAILURE_KINDS,
  applyRegistryEvent,
  createProviderRegistry,
  evaluatePromotionGate,
  replayRegistry,
  requestPromotion,
} from "./registry";
export type {
  NormalizedExecutionRecord,
  PromotionDecisionRecord,
  PromotionGateCheck,
  PromotionGateEvaluation,
  PromotionGateId,
  PromotionRefusal,
  PromotionRefusalKind,
  ProviderRegistry,
  ProviderRegistryEvent,
  ProviderRegistryEventKind,
  ProviderState,
  RegistryApplyResult,
  RegistryEntry,
  RegistryEventFailure,
  RegistryEventFailureKind,
  RegistryReplayResult,
} from "./registry";

/* Reference provider lifecycle (TEST-ONLY testkit) ---------------------- */

export {
  REFERENCE_BENCHMARK_ID,
  REFERENCE_CAPABILITY,
  REFERENCE_GRID_HEIGHT,
  REFERENCE_GRID_WIDTH,
  REFERENCE_INPUT_SAMPLES,
  REFERENCE_PROVIDER_ID,
  REFERENCE_TECHNOLOGY_VERSION_V1,
  REFERENCE_TECHNOLOGY_VERSION_V2,
  REFERENCE_V2_EVEN_INDEX_BIAS_M,
  executeReferenceProvider,
  providerFixture,
  referenceDepthTruth,
  referenceEnvironment,
  referenceInput,
  referenceProviderProfileV1,
  referenceProviderProfileV2,
  referenceUnsupportedInput,
  runReferenceBenchmark,
  runReferenceLifecycle,
} from "./testkit";
export type { ReferenceLifecycleResult } from "./testkit";
