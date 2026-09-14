/**
 * AISE-022 — Assurance/readiness v2 public surface.
 *
 * THE single server-side readiness authority (architecture-lock "Adaptive
 * evidence"): versioned code-defined profiles (one per task kind), a pure
 * deterministic multidimensional evaluator with fail-closed critical
 * semantics, actionable readiness gaps for the 018 evidence-gap engine,
 * and device-aware remediation ANNOTATION that can never lower the bar.
 *
 * This is a domain library: no router/server wiring is exported here
 * (integration into the request surface is a separate, explicitly reviewed
 * change). Read the module headers of model.ts (authority + fact mapping),
 * profiles.ts (documented profile values) and evaluate.ts (aggregate rules,
 * monotonicity scope, no-downgrade) before use.
 */

export {
  // versioning + vocabularies
  ASSURANCE_PROFILE_VERSION,
  TASK_KINDS,
  REQUIREMENT_KINDS,
  DIMENSION_OUTCOME_LEVELS,
  READINESS_LEVELS,
  DIMENSION_DEFICIENCY_CODES,
  METHOD_CAPABILITY_FACT_KEYS,
  CAPABILITY_FACT_LEVELS,
  METHOD_REMEDIATION_ALTERNATIVES,
  METHOD_PLAUSIBILITY_LEVELS,
  ASSURANCE_ERROR_CODES,
  // functions
  normalizeCapabilityFactLevel,
  validateAssuranceProfile,
  validateEvaluationFacts,
} from "./model";

export type {
  TaskKind,
  RequirementKind,
  Requirement,
  ReadinessDimension,
  AssuranceProfile,
  PropertyUncertainty,
  PropertyFact,
  NodeFact,
  EvidenceFact,
  DeviceProfile,
  GraphSnapshotFact,
  EvaluationInput,
  DimensionOutcomeLevel,
  ReadinessLevel,
  EvidenceSufficiencyBasis,
  UncertaintyBoundBasis,
  CoverageBasis,
  EpistemicKeyBasis,
  EpistemicFloorBasis,
  DimensionBasis,
  DimensionDeficiencyCode,
  DimensionDeficiency,
  DimensionOutcome,
  Remediation,
  CapabilityFact,
  CapabilityFactLevel,
  MethodPlausibilityLevel,
  MethodPlausibility,
  DeviceRemediationHint,
  ReadinessGap,
  ReadinessReport,
  AssuranceErrorCode,
} from "./model";

export { AssuranceError, EPISTEMIC_RANK } from "./model";

export {
  ASSURANCE_PROFILES,
  DIMENSIONAL_SURVEY_PROFILE,
  CONDITION_INSPECTION_PROFILE,
  AS_BUILT_MODEL_PROFILE,
  getAssuranceProfile,
  getAssuranceProfileByTaskKind,
} from "./profiles";

export {
  DIMENSION_OUTCOME_RANK,
  READINESS_RANK,
  dimensionOutcomeAtLeast,
  readinessAtLeast,
  serializeReadinessReport,
  aggregateReadiness,
  evaluateReadiness,
} from "./evaluate";
