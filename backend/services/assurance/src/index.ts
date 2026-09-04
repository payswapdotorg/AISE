/**
 * @aise/backend-assurance — the AISE-013 assurance service.
 *
 * The task-specific model-readiness authority (architecture-lock
 * §1): declared task/assurance profiles and deterministic,
 * content-pinned readiness assessments over the canonical
 * Reality Graph (AISE-011) and the authoritative evidence mapping
 * (AISE-012).
 *
 * Public surface:
 * - errors   — typed, fail-closed AssuranceError
 * - units    — exact SI conversion factors (budget evaluation)
 * - profile  — task profile vocabulary + the fixed, monotone
 *   profile→requirements mapping
 * - readiness — the pure readiness computation (six dimensions,
 *   binary verdict, reporting-only confidence)
 * - store    — immutable profiles + append-only, integrity-
 *   verified assessment records
 * - runtime  — bounded service composition (ports for the
 *   model-graph and evidence-mapping boundaries)
 */
export {
  AssuranceError,
  isAssuranceError,
  toAssuranceError,
  type AssuranceErrorDetails,
  type AssuranceErrorCode,
} from "./errors.js";

export {
  siBaseUnitOf,
  toSiFactor,
  toSiValue,
  type SiBaseUnit,
} from "./units.js";

export {
  ASSURANCE_PROFILES,
  CAPTURE_INTENTS,
  READINESS_DIMENSIONS,
  REQUIREMENTS_BY_PROFILE,
  budgetForFamily,
  requirementsFor,
  standardEquivalent,
  taskProfile,
  type DimensionRequirements,
  type ReadinessDimension,
  type TaskProfileInput,
  type TaskProfileRecord,
  type UncertaintyBudget,
} from "./profile.js";

export {
  computeReadiness,
  readinessReportDigest,
  type AssertionTotals,
  type BudgetEvaluationEntry,
  type ConfidenceSummary,
  type ConfirmedValidityResult,
  type DimensionResult,
  type DimensionVerdict,
  type EpistemicCompositionResult,
  type EpistemicSummary,
  type EvidenceCoverageResult,
  type MeasurementUncertaintyResult,
  type ModelIntegrityResult,
  type ReadinessFinding,
  type ReadinessFindingCode,
  type ReadinessInput,
  type ReadinessReport,
  type ReadinessVerdict,
  type UncertaintyBudgetResult,
} from "./readiness.js";

export {
  DEFAULT_MAX_ASSESSMENTS,
  DEFAULT_MAX_ASSERTIONS,
  DEFAULT_MAX_TASK_PROFILES,
  createInMemoryAssuranceStore,
  deriveAssessmentId,
  emptyMapping,
  type AssuranceStore,
  type EvidenceMappingReader,
  type InMemoryAssuranceStoreOptions,
  type ModelGraphReader,
  type ReadinessAssessmentRecord,
  type RecordAssessmentResult,
  type RegisterProfileResult,
} from "./store.js";

export {
  buildAssuranceService,
  type AssuranceService,
  type BuildAssuranceServiceOptions,
} from "./runtime.js";
