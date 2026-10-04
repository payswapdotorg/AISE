/**
 * WORLD-P2 — the world-layer2-experience package root.
 *
 * The Layer-2 EXPERIENCE LANE: the typed contracts for the Procore-parity
 * workflow behavior translated into the AISE evidence/case architecture
 * (directive §1 Layer 2 + §7 P2: "Do not copy Procore's domain model.
 * Translate useful workflow behavior into the AISE evidence/case
 * architecture.").
 *
 * THE EIGHT LANE STAGES (each an explicit typed transform with in-memory
 * substitution doubles proving it works WITHOUT any substrate):
 *
 *   1. PROBLEM        — `defineEngineeringProblem`: a problem statement
 *                       bound to spatial world context through the P0-A
 *                       scene-composition types (fail-closed binding).
 *   2. CONTEXT        — the `CaseContextAssembler` port: the context view
 *                       composing AISE-side records with the P0-B
 *                       understanding-substrate extracted candidates as
 *                       INFERRED inputs.
 *   3. EVIDENCE       — `bindProblemEvidence`: the Evidence Envelope laws
 *                       (immutable content-addressed evidence, provenance
 *                       roles, recorded invalidation, bundles as the
 *                       documents/drawings continuity translation).
 *   4. MISSING-EVIDENCE — the `MissingEvidenceDetector` port: typed gaps
 *                       with explicit remediation tasks + worst-of
 *                       readiness verdicts — FAILS CLOSED.
 *   5. BOUNDED REASONING — the `BoundedReasoningProvider` port: THE LLM
 *                       SUBSTRATE SEAM (a replaceable substrate with
 *                       substitution doubles; retrieval scoped to the
 *                       case context; outputs INFERRED with prompt/context
 *                       provenance recorded; refusal on insufficient
 *                       evidence; NEVER an engineering authority).
 *   6. DETERMINISTIC CHECKS — `gateDeterministicChecks`: the
 *                       engine-owned vs advisory classification over the
 *                       closed inventory mirroring the PROD-022
 *                       solution-engine checks + AISE-023 verification
 *                       finding codes; fabricated authority is refused.
 *   7. ACTION         — the `ActionRecorder` port: typed actions with
 *                       explicit ownership, governed status lifecycle and
 *                       gate-governed consequential actions.
 *   8. AUDIT TRAIL    — the `AuditLedger` port: append-only, chained,
 *                       deterministic-replay audit records — every lane
 *                       transition a who/what/when/why/evidence-bound
 *                       record.
 *
 * THE FIVE PUBLIC FACES (package.json exports):
 *
 *   "."          → this root      — the lane statement, the lane runner,
 *                                   the control-plane profiles and every
 *                                   family surface;
 *   "./seam"     → src/seam.ts    — the nine lane laws, the actor
 *                                   discipline, the digest discipline
 *                                   (re-exported from the P0-B seam),
 *                                   the HFX-000 failure vocabulary;
 *   "./problem"  → src/problem/   — stages 1–2;
 *   "./evidence" → src/evidence/  — stages 3–4;
 *   "./reasoning"→ src/reasoning/ — stages 5–6;
 *   "./action"   → src/action/    — stages 7–8;
 *   "./lane"     → src/lane.ts    — the end-to-end lane runner.
 *
 * THE NINE LANE LAWS (binding on every family — see src/seam.ts):
 * epistemic law (substrate/LLM outputs are INFERRED), identity law (no
 * substrate id as canonical identity), evidence-envelope law (immutable
 * content-addressed evidence; observations require evidence),
 * fail-closed readiness law (worst-of verdicts; absent inputs are never
 * READY), no-LLM-authority law (the deterministic engine stays the only
 * engineering authority), refusal law (unsupported is recorded, never
 * computed), ownership law (actions carry explicit owners), audit law
 * (append-only chained digests; deterministic replay), determinism law
 * (no network/clock/randomness/I/O — declared instants only).
 */

/* The lane statement + the seam's law surface. */
export {
  LAYER2_LANE_ID,
  LAYER2_LANE_STATEMENT,
  LAYER2_STAGE_NAMES,
  LAYER2_FAMILIES,
  LANE_ACTOR_ROLES,
  canonicalDigestOf,
  textDigestOf,
  isCanonicalDigest,
  deepFreeze,
  isLayer2StageName,
  isLayer2Family,
  isLaneActorRole,
  laneProviderDescriptorDigestOf,
  laneRefused,
  isDeclaredInstant,
  contentIdOf,
} from "./seam";
export type {
  Layer2StageName,
  Layer2Family,
  LaneActorRole,
  LaneActor,
  LaneProviderDescriptor,
  LaneFailure,
  LaneOutcome,
} from "./seam";

/* The PROBLEM family surface (stages 1–2). */
export {
  PROBLEM_RECORD_KIND,
  PROBLEM_RECORD_SCHEMA_VERSION,
  CASE_CONTEXT_KIND,
  CASE_CONTEXT_SCHEMA_VERSION,
  PROBLEM_STATUSES,
  PROBLEM_QUESTION_KINDS,
  PROBLEM_VALIDATION_FAILURE_KINDS,
  isProblemStatus,
  isProblemQuestionKind,
  validateDefineProblemInput,
  validateEngineeringProblem,
  validateSubstrateCandidateSet,
  validateCaseContext,
  defineEngineeringProblem,
  assembleThroughContextPort,
  sealCaseContext,
  REFERENCE_CONTEXT_DESCRIPTOR,
  ALTERNATE_CONTEXT_DESCRIPTOR,
  referenceContextAssemblerDouble,
  alternateContextAssemblerDouble,
  FIXTURE_SCENE,
  FIXTURE_SUBSTRATE_CANDIDATES,
  FIXTURE_PROBLEM,
  FIXTURE_PROBLEM_ID,
  fixtureIfcExtraction,
  labelsOfExtraction,
} from "./problem";
export type {
  ProblemStatus,
  ProblemQuestionKind,
  ProblemValidationFailureKind,
  ProblemValidationFailure,
  ProblemValidation,
  SpatialWorldBinding,
  EngineeringProblem,
  DefineProblemInput,
  SubstrateCandidateSet,
  CaseContext,
  CaseContextRequest,
  CaseContextAssembler,
} from "./problem";

/* The EVIDENCE family surface (stages 3–4). */
export {
  EVIDENCE_ENVELOPE_KIND,
  EVIDENCE_ENVELOPE_SCHEMA_VERSION,
  MISSING_EVIDENCE_REPORT_KIND,
  MISSING_EVIDENCE_REPORT_SCHEMA_VERSION,
  GAP_KINDS,
  READINESS_VERDICTS,
  REQUIREMENT_KINDS,
  MISSING_EVIDENCE_TASK_STATUSES,
  EVIDENCE_VALIDATION_FAILURE_KINDS,
  EPISTEMIC_RANK,
  isGapKind,
  isReadinessVerdict,
  validateEvidenceEnvelope,
  validateEvidenceRequirement,
  validateMissingEvidenceReport,
  bindProblemEvidence,
  detectThroughEvidencePort,
  worstOfVerdicts,
  verdictOfGapKind,
  buildEvidenceGap,
  sealMissingEvidenceReport,
  REFERENCE_DETECTOR_DESCRIPTOR,
  ALTERNATE_DETECTOR_DESCRIPTOR,
  referenceMissingEvidenceDouble,
  alternateMissingEvidenceDouble,
  FIXTURE_REQUIREMENT_SET,
  SCENARIO_A_EVIDENCE_INPUT,
  SCENARIO_B_EVIDENCE_INPUT,
} from "./evidence";
export type {
  GapKind,
  ReadinessVerdict,
  RequirementKind,
  MissingEvidenceTaskStatus,
  EvidenceValidationFailureKind,
  EvidenceValidationFailure,
  EvidenceValidation,
  ProblemEvidenceEnvelope,
  BindEvidenceInput,
  EvidenceSufficiencyRequirement,
  UncertaintyBoundRequirement,
  EpistemicFloorRequirement,
  EvidenceRequirement,
  EvidenceRequirementSet,
  MissingEvidenceTask,
  EvidenceGap,
  RequirementAssessment,
  MissingEvidenceReport,
  MissingEvidenceRequest,
  MissingEvidenceDetector,
} from "./evidence";

/* The REASONING family surface (stages 5–6). */
export {
  BOUNDED_REASONING_REQUEST_KIND,
  BOUNDED_REASONING_REQUEST_SCHEMA_VERSION,
  BOUNDED_REASONING_RESULT_KIND,
  BOUNDED_REASONING_RESULT_SCHEMA_VERSION,
  CHECK_GATE_VERDICT_KIND,
  CHECK_GATE_VERDICT_SCHEMA_VERSION,
  BOUNDED_QUESTION_KINDS,
  REASONING_REFUSAL_CODES,
  CLAIM_CITATION_KINDS,
  ENGINE_OWNED_CHECK_IDS,
  CHECK_OWNERSHIPS,
  CHECK_SOURCE_KINDS,
  CHECK_OUTCOMES,
  CHECK_GATE_FAILURE_KINDS,
  REASONING_VALIDATION_FAILURE_KINDS,
  isBoundedQuestionKind,
  isReasoningRefusalCode,
  worstOfCheckOutcomes,
  promptDigestOf,
  validateBoundedReasoningRequest,
  validateReasoningStepResult,
  resolveClaimCitations,
  reasonThroughBoundedPort,
  gateDeterministicChecks,
  refusalForReadiness,
  REFERENCE_REASONER_DESCRIPTOR,
  ALTERNATE_REASONER_DESCRIPTOR,
  referenceBoundedReasonerDouble,
  alternateBoundedReasonerDouble,
  FIXTURE_ENGINE_SNAPSHOT_DIGEST,
  fixtureAttachedChecks,
  fixtureReasoningRequest,
} from "./reasoning";
export type {
  BoundedQuestionKind,
  ReasoningRefusalCode,
  ClaimCitationKind,
  EngineOwnedCheckId,
  CheckOwnership,
  CheckSourceKind,
  CheckOutcome,
  CheckGateFailureKind,
  CheckGateFailure,
  ReasoningValidationFailureKind,
  ReasoningValidationFailure,
  ReasoningValidation,
  BoundedReasoningRequest,
  ClaimCitation,
  ReasoningClaim,
  ReasoningProvenance,
  ReasoningStepResult,
  ReasoningRefusal,
  BoundedReasoningOutcome,
  BoundedReasoningProvider,
  AttachedCheck,
  DeterministicCheckGateInput,
  DeterministicCheckGateVerdict,
} from "./reasoning";

/* The ACTION family surface (stages 7–8). */
export {
  PROBLEM_ACTION_KIND,
  PROBLEM_ACTION_SCHEMA_VERSION,
  AUDIT_TRAIL_KIND,
  AUDIT_TRAIL_SCHEMA_VERSION,
  AUDIT_RECORD_KIND,
  ACTION_KINDS,
  ACTION_STATUSES,
  ACTION_TRANSITIONS,
  REVIEW_DECISIONS,
  AUDIT_REASON_KINDS,
  AUDIT_EVENT_KINDS,
  ACTION_VALIDATION_FAILURE_KINDS,
  isActionKind,
  isActionStatus,
  isAuditReasonKind,
  validateRecordActionInput,
  validateProblemAction,
  validateAuditAppendInput,
  recordProblemAction,
  transitionActionStatus,
  auditRecordContentDigest,
  auditRecordDigest,
  buildAuditRecord,
  verifyAuditReplay,
  recordThroughActionPort,
  appendThroughAuditPort,
  REFERENCE_RECORDER_DESCRIPTOR,
  ALTERNATE_RECORDER_DESCRIPTOR,
  REFERENCE_LEDGER_DESCRIPTOR,
  ALTERNATE_LEDGER_DESCRIPTOR,
  referenceActionRecorderDouble,
  alternateActionRecorderDouble,
  referenceAuditLedgerDouble,
  alternateAuditLedgerDouble,
} from "./action";
export type {
  ActionKind,
  ActionStatus,
  ReviewDecision,
  AuditReasonKind,
  AuditEventKind,
  ActionValidationFailureKind,
  ActionValidationFailure,
  ActionValidation,
  AssignOwnerPayload,
  RequestEvidencePayload,
  RecordObservationPayload,
  RecordInferencePayload,
  ProposeSolutionOperationPayload,
  RequestReviewPayload,
  ResolveCasePayload,
  CloseCasePayload,
  ActionPayload,
  ActionOwnership,
  ProblemAction,
  RecordActionInput,
  AuditRecord,
  AuditTrail,
  AuditAppendInput,
  ReplayVerification,
  ActionRecorder,
  AuditLedger,
} from "./action";

/* The lane runner + the fixture scenarios. */
export {
  FIXTURE_WALL_REALITY_OBJECT,
  fixtureScenarioA,
  fixtureScenarioB,
  runLayer2Lane,
} from "./lane";
export type {
  Layer2LaneKit,
  Layer2LaneScenario,
  StageSummary,
  Layer2LaneRunResult,
} from "./lane";

/* The control-plane profile surface (HFX-000, 15/15 mandatory fields). */
export {
  LAYER2_PROFILE_LANE_ID,
  CASE_CONTEXT_CAPABILITY,
  MISSING_EVIDENCE_CAPABILITY,
  BOUNDED_REASONING_CAPABILITY,
  ACTION_AUDIT_CAPABILITY,
  referenceContextProfile,
  alternateContextProfile,
  referenceDetectorProfile,
  alternateDetectorProfile,
  referenceReasonerProfile,
  alternateReasonerProfile,
  referenceRecorderProfile,
  alternateRecorderProfile,
  referenceLedgerProfile,
  alternateLedgerProfile,
  LAYER2_PROVIDER_PROFILES,
  LAYER2_PROFILE_PROVIDER_IDS,
} from "./profiles";
