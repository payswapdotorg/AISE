/**
 * AISE-039 — Production pilot hardening: public surface.
 *
 * A PURE LIBRARY pilot harness (NO server.ts change, NO router, NO HTTP
 * surface, NO tools/ change, NO apps/ change): typed ICP environments and
 * multi-project campaigns over the REAL lab-runner end-to-end executions,
 * adoption metrics computed from executed records (synthetic-only evidence
 * is typed UNKNOWN with the missing real-evidence requirement named),
 * versioned performance/security/usability gates with per-project R17
 * discipline, versioned ReleaseCriteria with regression-suite binding and
 * an append-only, self-approval-refusing release log.
 *
 * THE HARNESS IS NOT AN AUTHORITY: nothing in this module mints
 * engineering truth or blesses a release — the evaluation reports
 * readiness; approval is a separate act by a separate actor.
 *
 * LOUD HONESTY (the SHARED split): this sandbox has no live pilot users
 * or telemetry collectors; session evidence is represented as
 * deterministic recorded fixtures bound to the real executed runs (the
 * AISE-035 split), and synthetic-only projections are named, typed and
 * refused as adoption evidence. Live telemetry ingestion is a known
 * limitation (see the completion report).
 */

export {
  PILOT_ERROR_CODES,
  PILOT_ICP_CLASSES,
  PILOT_DIMENSIONS,
  PILOT_WALK_HOPS,
  PILOT_EVIDENCE_KINDS,
  PILOT_EVIDENCE_CLASSES,
  PILOT_CONNECTOR_ACTION_KINDS,
  PILOT_BROKER_DECISIONS,
  PILOT_BROKER_UNAVAILABLE_REASONS,
  PILOT_GATE_IDS,
  PILOT_GATE_STATUSES,
  PILOT_ADOPTION_METRIC_IDS,
  PILOT_METRIC_UNKNOWN_REASONS,
  PILOT_IDENTITY_PERMISSIONS,
  PilotError,
  isPilotError,
  validateIcpProfile,
  validateMigrationState,
  sessionEvidenceClass,
  isExternalTrip,
  parsePilotSessionRecord,
  sessionNotObservedOf,
  dimensionObserved,
  pilotDigestOf,
  pilotIdOf,
  validateGateId,
  validateMetricId,
} from "./model";
export type {
  PilotErrorCode,
  PilotIcpClass,
  PilotIcpProfile,
  PilotDimension,
  PilotWalkHopId,
  PilotEvidenceKind,
  PilotEvidenceClass,
  PilotSessionEvidence,
  PilotExecutedEvidence,
  PilotAdoptionStateEvidence,
  PilotBrokerOutcomeEvidence,
  PilotDeepLinkTraversalEvidence,
  PilotSyntheticEvidence,
  PilotProjectedAdoption,
  PilotConnectorActionKind,
  PilotBrokerDecision,
  PilotBrokerUnavailableReason,
  PilotAuthorizedActionRecord,
  PilotTraversalRecord,
  PilotAuditEventRecord,
  PilotSessionHop,
  PilotSessionRecord,
  PilotProjectSpec,
  PilotEnvironmentSpec,
  PilotTargetedStepRef,
  PilotSessionContext,
  PilotSessionRecorder,
  PilotCampaignSpec,
  PilotGateId,
  PilotGateStatus,
  PilotGateViolation,
  PilotNotObserved,
  PilotGateProjectRollup,
  PilotGateResult,
  PilotEvidenceField,
  PilotAdoptionMetricId,
  PilotMetricUnknownReason,
} from "./model";

export {
  pilotRunDigest,
  campaignDigestPreimage,
  campaignDigestOf,
  runPilotCampaign,
  sessionClassOf,
} from "./campaign";
export type {
  PilotExecutedRunSummary,
  PilotProjectResult,
  PilotCampaignResult,
  RunPilotCampaignOptions,
} from "./campaign";

export {
  PILOT_PERFORMANCE_BUDGET_VERSION,
  PILOT_HOP_LATENCY_BUDGETS,
  PILOT_LATENCY_REGRESSION_BASELINES,
  PILOT_SECURITY_COVERAGE_VERSION,
  PILOT_REQUIRED_PERMISSION_COVERAGE,
  PILOT_REQUIRED_AUDIT_COVERAGE,
  PILOT_USABILITY_THRESHOLD_VERSION,
  PILOT_USABILITY_THRESHOLDS,
  PILOT_GATE_TABLES_V1,
  validateGateTables,
  evaluateHopLatencyGate,
  evaluateLatencyRegressionGate,
  evaluatePermissionCoverageGate,
  evaluateAuditCoverageGate,
  evaluateScopeMinimalityGate,
  evaluateBrokerOutcomeGate,
  evaluateContextSwitchGate,
  evaluateReturnPathIntegrityGate,
  evaluatePilotGates,
  campaignAggregateHidingProof,
} from "./gates";
export type {
  PilotHopLatencyBudget,
  PilotLatencyRegressionBaseline,
  PilotGateTables,
  HopLatencyGateResult,
  LatencyRegressionGateResult,
  PilotGateEvaluation,
  PilotAggregateHidingProof,
} from "./gates";

export {
  PILOT_DEFAULT_MIN_REAL_SESSIONS,
  PILOT_ROUTINE_CONTEXT_SWITCH_BUDGET,
  sessionCompletedTargetedWorkflow,
  computeAdoptionMetrics,
} from "./metrics";
export type {
  PilotMetricEvidence,
  PilotComputedMetric,
  PilotUnknownMetric,
  PilotMetricResult,
  PilotAdoptionMetrics,
  ComputeAdoptionMetricsOptions,
  PilotSessionRecordLike,
} from "./metrics";

export {
  PILOT_BOUND_REGRESSION_SUITES,
  PILOT_RELEASE_CRITERIA_V1,
  PILOT_RELEASE_LOG_GENESIS,
  RELEASE_BLOCKER_KINDS,
  validateReleaseCriteria,
  evaluateRelease,
  appendEvaluation,
  requestApproval,
  verifyReleaseLog,
} from "./release";
export type {
  RegressionSuiteRef,
  RegressionSuiteBinding,
  PilotAdoptionThreshold,
  ReleaseCriteria,
  PilotGateTableFamily,
  ReleaseBlockerKind,
  ReleaseBlocker,
  ReleaseEvaluation,
  EvaluateReleaseInput,
  ReleaseLogEntry,
} from "./release";

export {
  PILOT_CLOCK,
  pilotConstantClock,
  PILOT_ICP_LARGE_CONTRACTOR,
  PILOT_ICP_SMALL_CONSULTANCY,
  pilotEnvironmentLarge,
  pilotEnvironmentSmall,
  pilotSessionRecorder,
  PILOT_TARGETED_WORKFLOW_STEPS,
  pilotMigrationCandidate,
  pilotAdoptionStates,
  PILOT_PROJECTED_ADOPTION,
  shippedPilotCampaignSpec,
  syntheticOnlyPilotCampaignSpec,
  mixedPilotCampaignSpec,
  runShippedPilotCampaign,
  evidenceField,
  PILOT_THRESHOLDED_METRIC_IDS,
} from "./testkit";
export type {
  PilotRecorderOptions,
  PilotSpecOptions,
} from "./testkit";
