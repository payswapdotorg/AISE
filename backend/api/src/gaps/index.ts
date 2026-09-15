/**
 * AISE-018 — Adaptive evidence-gap engine public surface.
 *
 * Consumers (server.ts, future AISE-007 mission-planner feedback loops /
 * AISE-035 dogfood / AISE-038 developer API) import from HERE only. The
 * module is a domain library plus its HTTP adapter: model (types,
 * vocabularies, typed errors, parsers, digests, the pure deterministic
 * gap-computation + candidate-ranking engine) + service (policy engine
 * over an injected store, clock, the SINGLE readiness authority's
 * injected evaluator and THREE read-only reference resolvers: assurance
 * profile resolution, reality version resolution, evidence graph state)
 * + store (persistence + in-memory twin) + router (transport).
 *
 * THE DERIVED-PROJECTION BOUNDARY, restated at the surface: this module
 * imports NO sibling module at runtime beyond the reality model's
 * EPISTEMIC_RANK constant (the single epistemic order authority — the
 * assurance module's own argument; redefining it would create a second
 * epistemic order, which is forbidden). There is no write path from here
 * into the assurance, reality or evidence authorities, ever. The gap
 * analysis is a deterministic function of (assurance profile, evidence
 * graph state, pinned reality version) plus the request seams; analysis
 * records are derived, append-only and byte-identical under
 * recomputation of the same inputs. The readiness authority's report is
 * consumed VERBATIM and never mutated — this module is the
 * evidence-GAP authority, never a second readiness authority.
 */

export {
  // vocabularies + frozen tables
  GAP_KINDS,
  GAP_STATES,
  GAP_CLASSES,
  GAP_CLASS_TABLE,
  CANDIDATE_ACTION_KINDS,
  OBSERVATION_STATUS_ANNOTATION_STATUSES,
  GAP_ANALYSIS_EVENT_TYPES,
  GAP_ANALYSIS_ERROR_CODES,
  SCORE_WEIGHTS,
  CRITICALITY_FACTORS,
  DEFAULT_DIMENSION_WEIGHT,
  UNFOCUSED_SUBJECT_FACTOR,
  NO_FOCUS_FACTOR,
  UNKNOWN_SIGMA_RESOLUTION_VALUE,
  NON_MEASUREMENT_REDUCTION_VALUE,
  VERIFY_CAPTURE_STATUS_EFFORT,
  DEFAULT_METHOD_EFFORT,
  RECOVERABILITY_BY_STATE,
  TOMBSTONED_RECOVERABILITY,
  DEFAULT_METHOD_PREFERENCES,
  // functions
  computeGapAnalysis,
  gapAnalysisContentDigest,
  gapAnalysisInputDigest,
  parseGapAnalysisRecord,
  parseRunGapAnalysisInput,
  resolveEffortModel,
  resolveMethodPreferences,
  summarizeGapAnalysis,
  validateAnalysisId,
  validateProjectRefId,
  validateVersionRefId,
  // the typed error
  GapAnalysisError,
  // types
  type GapKind,
  type GapState,
  type GapClass,
  type CandidateActionKind,
  type ObservationStatus,
  type GapAnalysisEventType,
  type GapAnalysisErrorCode,
  type ObservationStatusAnnotation,
  type UncertaintyAnnotation,
  type TaskFocusEntry,
  type EffortModel,
  type MethodPreferences,
  type GapTaskRef,
  type RunGapAnalysisInput,
  type SubjectProperty,
  type SubjectPresence,
  type GapSubject,
  type GapAnalysisState,
  type EvidenceGapEntry,
  type SubstitutionSemantics,
  type ScoreDerivation,
  type CandidateScore,
  type RankedCandidate,
  type GapAnalysisStats,
  type GapAnalysisEvent,
  type GapAnalysisRecord,
  type GapAnalysisSummary,
  type ComputedGaps,
} from "./model";
export {
  GapAnalysisService,
  readOnlyAssuranceProfileResolver,
  readOnlyGapRealityVersionResolver,
  readOnlyEvidenceGraphResolver,
  type GapAnalysisServiceDeps,
  type AssuranceProfileResolver,
  type ReadinessEvaluator,
  type RealityVersionResolver,
  type EvidenceFactSnapshot,
  type EvidenceGraphResolver,
} from "./service";
export { FsGapAnalysisStore, InMemoryGapAnalysisStore, type GapAnalysisStore } from "./store";
export { handleGapsRequest, type GapsRouteOptions } from "./router";
