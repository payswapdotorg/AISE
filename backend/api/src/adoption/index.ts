/**
 * AISE-041 — Workflow migration and switching-friction profiler public
 * surface.
 *
 * Consumers (server.ts, future AISE-040 adoption-shell / AISE-039 pilot
 * hardening) import from HERE only. The module is a domain library plus
 * its HTTP adapter: model (types, vocabularies, typed errors, boundary
 * parsers, digests, the pure deterministic readiness/friction scoring
 * engine, the migration state-machine tables, stored-record parsers) +
 * service (policy engine over an injected store, clock and ONE read-only
 * adapter-descriptor resolver) + store (persistence + in-memory twin) +
 * router (transport).
 *
 * THE BOUNDARY, restated at the surface: the profiler is INVENTORY +
 * SCORING, never migration itself — there is no code path from this
 * module into any incumbent system, and the only sibling runtime
 * touchpoint is the injected READ-ONLY `AdapterDescriptorResolver` (one
 * read method over the integrations adapter registry). Incumbent
 * systems of record are referenced BY ID only; the registry's resolved
 * descriptors are carried VERBATIM as consumed assessment context and
 * the registry is never mutated. The migration state machine never
 * declares a step replaced without semantic equivalence, operational
 * acceptance and an active rollback plan; every score is inspectable
 * down to its contributing attributes; UNKNOWN attributes propagate as
 * UNKNOWN components with null composites — never zero, never silently
 * defaulted. All records are append-only with provenance-bearing audit
 * events; the same inputs plus the same clock produce byte-identical
 * records in fresh stores.
 */

export {
  // vocabularies + frozen tables
  UNKNOWN_MARKER,
  RESOURCE_KINDS,
  MANUAL_REENTRY_LEVELS,
  APPROVAL_STRICTNESSES,
  IRREVERSIBILITY_LEVELS,
  TRAINING_BURDEN_LEVELS,
  LATENCY_CLASSES,
  ROLLBACK_AVAILABILITIES,
  CONTRACTUAL_LEVELS,
  MIGRATION_STATES,
  ADVANCE_SUCCESSORS,
  ROLLBACK_ALLOWED_FROM,
  ADVANCE_REQUIREMENTS,
  ADOPTION_EVENT_TYPES,
  ADOPTION_ERROR_CODES,
  READINESS_WEIGHTS,
  FRICTION_WEIGHTS,
  APPROVAL_STRICTNESS_SEVERITY,
  APPROVAL_GATE_SATURATION,
  IRREVERSIBILITY_SEVERITY,
  TRAINING_BURDEN_SEVERITY,
  LATENCY_SEVERITY,
  CONTRACTUAL_SEVERITY,
  MANUAL_REENTRY_READINESS,
  ROLLBACK_READINESS,
  EMPTY_SOR_COVERAGE,
  ROLLBACK_PLAN_STATES,
  // functions
  canAdvance,
  computeAdoptionAssessment,
  parseWorkflowStep,
  parseCreateWorkflowInput,
  parseAppendStepInput,
  parseRunAssessmentInput,
  parseCreateCandidateInput,
  parseRecordEquivalenceInput,
  parseRecordAcceptanceInput,
  parseRecordRollbackPlanInput,
  parseAdvanceCandidateInput,
  parseRollbackCandidateInput,
  parseRetireRollbackPlanInput,
  parseIncumbentWorkflow,
  parseMigrationCandidate,
  parseIntegrationReadinessAssessment,
  summarizeWorkflow,
  summarizeAssessment,
  summarizeCandidate,
  workflowContentDigest,
  candidateContentDigest,
  assessmentContentDigest,
  assessmentInputDigest,
  validateWorkflowId,
  validateCandidateId,
  validateAssessmentId,
  validatePlanId,
  // the typed error
  AdoptionError,
  // types
  type UnknownMarker,
  type ResourceKind,
  type ManualReentryLevel,
  type ApprovalStrictness,
  type IrreversibilityLevel,
  type TrainingBurdenLevel,
  type LatencyClass,
  type RollbackAvailability,
  type ContractualLevel,
  type MigrationState,
  type AdvanceRequirements,
  type AdoptionEventType,
  type AdoptionErrorCode,
  type ExternalSystemRef,
  type ResourceRef,
  type ApprovalProfile,
  type MaybeUnknown,
  type WorkflowStep,
  type IncumbentWorkflow,
  type SemanticEquivalenceRecord,
  type OperationalAcceptanceRecord,
  type RollbackPlanState,
  type RollbackPlan,
  type MigrationCandidate,
  type AdoptionEvent,
  type KnownScoreComponent,
  type UnknownScoreComponent,
  type ScoreComponent,
  type ScoreBreakdown,
  type StepAssessment,
  type RankedStep,
  type AdoptionInventoryStats,
  type AdapterViewEntry,
  type AdoptionAssessmentState,
  type ComputedAssessment,
  type IntegrationReadinessAssessment,
  type WorkflowSummary,
  type AssessmentSummary,
  type CandidateSummary,
  type CreateWorkflowInput,
  type AppendStepInput,
  type RunAssessmentInput,
  type CreateCandidateInput,
  type RecordEquivalenceInput,
  type RecordAcceptanceInput,
  type RecordRollbackPlanInput,
  type AdvanceCandidateInput,
  type RollbackCandidateInput,
  type RetireRollbackPlanInput,
} from "./model";
export {
  AdoptionService,
  readOnlyAdapterDescriptorResolver,
  emptyAdapterDescriptorResolver,
  type AdoptionServiceDeps,
  type AdapterDescriptorResolver,
} from "./service";
export {
  FsAdoptionStore,
  InMemoryAdoptionStore,
  type AdoptionStore,
} from "./store";
export { handleAdoptionRequest, type AdoptionRouteOptions } from "./router";
