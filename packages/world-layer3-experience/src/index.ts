/**
 * WORLD-P3 — the world-layer3-experience package root.
 *
 * The Layer-3 EXPERIENCE LANE: the typed contracts for the
 * SYNCHRO/Revit/Navisworks-parity workflow — interactive spatial
 * authoring, model coordination, tolerance-declared clash detection,
 * live BOQ quantity consequences, what-if alternatives, execution
 * sequencing and solution replay — composing the FIVE landed world
 * packages with the existing deterministic solution engine and BOQ
 * Graph seams (directive §1 Layer 3 + §7 P3).
 *
 * THE SEVEN LANE STAGES (each an explicit typed transform with
 * in-memory substitution doubles proving it works WITHOUT any
 * substrate):
 *
 *   1. AUTHOR        — `compileManipulationStream` + the
 *                      `NlCommandParserAdapter` port: BOTH input
 *                      modalities (the direct-manipulation gesture
 *                      stream and the natural-language utterance)
 *                      resolve to the SAME typed
 *                      `EngineeringOperationIntent` through the ONE
 *                      constructor surface; the NL parser is a
 *                      REPLACEABLE SUBSTRATE behind a port with two
 *                      substitution doubles (exactly the P2 LLM law);
 *                      authored commands present as GHOSTS through the
 *                      P0-C scene-usage contract.
 *   2. COORDINATE    — `aggregateCoordinationModels`: multi-model
 *                      aggregation through the P0-A scene-composition
 *                      types with CROSS-MODEL identity quarantine.
 *   3. CLASH-DETECT  — the `ClashPredicateAdapter` port: typed clash
 *                      predicates delegating to the P0-B exact-geometry
 *                      vocabulary with tolerance-DECLARED verdicts
 *                      (clear / within-tolerance / clash — never a
 *                      silent boolean); conflict records bind to the
 *                      P2 problem lane.
 *   4. QUANTIFY      — the `BoqGraphViewAdapter` port + live quantity
 *                      consequence projections: typed VIEWS and
 *                      PROJECTIONS over the BOQ Graph seams — the BOQ
 *                      Graph stays the ONLY quantity authority.
 *   5. WHAT-IF       — typed variant sets through the P0-A USD
 *                      composition port (the P0-C what-if ghost
 *                      discipline) compared against the P1 deviation
 *                      vocabulary.
 *   6. SEQUENCE      — declared activity orderings compiled into the
 *                      P0-C execution-simulation contract (the
 *                      simulation substrate computes trajectories; the
 *                      Solution Graph stays the only authority).
 *   7. REPLAY        — the chained, content-addressed, deterministic
 *                      replay log — the audit trail of the interactive
 *                      world.
 *
 * THE SEVEN PUBLIC FACES (package.json exports):
 *
 *   "."             → this root      — the lane statement, the kit +
 *                                     runner, and every family surface;
 *   "./seam"        → src/seam.ts    — the ten lane laws, the operator
 *                                     discipline, the digest discipline
 *                                     (re-exported from the P0-B seam),
 *                                     the HFX-000 failure vocabulary;
 *   "./authoring"   → src/authoring/ — stages 1 (AUTHOR);
 *   "./coordination"→ src/coordination/ — stages 2–3;
 *   "./quantify"    → src/quantify/  — stages 4–5;
 *   "./sequencing"  → src/sequencing/ — stages 6–7;
 *   "./lane"        → src/lane.ts    — the end-to-end lane runner.
 *
 * THE TEN LANE LAWS (binding on every family — see src/seam.ts):
 * DM↔NL equivalence, NL-substrate (the parser is a replaceable
 * substrate behind a port, its outputs re-validated fail-closed),
 * ghost-distinctness end-to-end, identity quarantine (substrate ids
 * never canonical; cross-model collisions refused), BOQ authority (the
 * BOQ Graph stays the only quantity authority — the lane views and
 * projects), simulation non-authority (the Solution Graph stays the
 * only authority), tolerance-declared clash verdicts, fail-closed
 * refusals (the HFX-000 closed vocabulary), determinism (no network,
 * no clock reads, no randomness, no I/O), replay (chained,
 * content-addressed, byte-identical).
 */

/* The seam's law surface. */
export {
  LAYER3_LANE_ID,
  LAYER3_LANE_STATEMENT,
  LAYER3_STAGE_NAMES,
  LAYER3_FAMILIES,
  LANE_OPERATOR_ROLES,
  canonicalDigestOf,
  textDigestOf,
  isCanonicalDigest,
  deepFreeze,
  isLayer3StageName,
  isLayer3Family,
  isLaneOperatorRole,
  isDeclaredInstant,
  isRecord,
  isNonEmptyString,
  contentIdOf,
  SUBSTRATE_ID_PATTERNS,
  looksLikeSubstrateId,
  isFinitePositive,
} from "./seam";
export type {
  Layer3StageName,
  Layer3Family,
  LaneOperatorRole,
  LaneOperator,
  LaneFailure,
  LaneOutcome,
} from "./seam";
export { laneRefused, isLaneRefusal } from "./seam";

/* The authoring family (stage 1 — AUTHOR). */
export {
  AUTHORING_COMMAND_KIND,
  AUTHORING_COMMAND_SCHEMA_VERSION,
  NL_COMMAND_PARSE_PORT_ID,
  SPATIAL_AUTHORING_COMMANDS,
  MANIPULATION_GESTURE_KINDS,
  BUILDING_OPERATION_TYPES,
  resolveCommandParameters,
  resolveOperationTarget,
  validateAuthoringCommandDraft,
  compileManipulationStream,
  parseNlCommandThroughPort,
  compileAuthoringCommand,
  operationIdentityOf,
  ghostElementIdOf,
  ghostSetOfCommand,
  composeGhostScene,
  proposedStatePresentationRequestOf,
  IDENTITY_TRANSFORM,
  translation,
} from "./authoring/contract";
export type {
  ScopedSelectionMode,
  ScopedElementDescriptor,
  ScopedOperationType,
  AuthoringScope,
  AuthoringCommandDraft,
  ManipulationGestureKind,
  ManipulationGesture,
  DirectManipulationStream,
  NlParserCapabilities,
  NlCommandParseRequest,
  NlCommandParserAdapter,
  AuthoringProvenanceInput,
  AuthoredCommand,
  SpatialAuthoringCommandKind,
} from "./authoring/contract";
export {
  NL_GRAMMAR_FAMILIES,
  REFERENCE_NL_PARSER_NOTE,
  ALTERNATE_NL_PARSER_NOTE,
  ReferenceNlCommandParserDouble,
  AlternateNlCommandParserDouble,
  referenceNlCommandParserDouble,
  alternateNlCommandParserDouble,
  canonicalManipulationStream,
} from "./authoring/doubles";

/* The coordination family (stages 2–3 — COORDINATE + CLASH-DETECT). */
export {
  COORDINATION_AGGREGATE_KIND,
  COORDINATION_AGGREGATE_SCHEMA_VERSION,
  CLASH_REPORT_KIND,
  CLASH_REPORT_SCHEMA_VERSION,
  CLASH_PREDICATE_PORT_ID,
  CLASH_VERDICTS,
  SUPPORTED_CLASH_SHAPE_KINDS,
  CLASH_SUBJECT_REF,
  CLASH_EVIDENCE_CONTENT_ID,
  isClashVerdictKind,
  aggregateCoordinationModels,
  validateClashTestRequest,
  classifySeparation,
  boxSeparationMetres,
  recordCoordinationConflicts,
} from "./coordination/contract";
export type {
  CoordinationModelSource,
  CoordinatedSceneAggregate,
  CoordinationAggregationRequest,
  ClashPair,
  ClashTestRequest,
  ClashPairVerdict,
  ClashReport,
  ClashEngineCapabilities,
  ClashPredicateAdapter,
  ClashVerdictKind,
  SupportedClashShapeKind,
  CoordinationConflictRecord,
  ConflictRecordingRequest,
} from "./coordination/contract";
export {
  ReferenceClashPredicateDouble,
  AlternateClashPredicateDouble,
  referenceClashPredicateDouble,
  alternateClashPredicateDouble,
} from "./coordination/doubles";

/* The quantify family (stages 4–5 — QUANTIFY + WHAT-IF). */
export {
  BOQ_VIEW_PORT_ID,
  QUANTITY_PROJECTION_KIND,
  QUANTITY_PROJECTION_SCHEMA_VERSION,
  WHAT_IF_COMPARISON_KIND,
  WHAT_IF_COMPARISON_SCHEMA_VERSION,
  BOQ_VIEW_QUERY_KINDS,
  viewBoqGraph,
  projectLiveQuantityConsequences,
  compareWhatIfAlternatives,
} from "./quantify/contract";
export type {
  BoqVersionRequest,
  BoqGraphViewCapabilities,
  BoqGraphViewAdapter,
  BoqViewQueryKind,
  BoqViewQuery,
  BoqViewRequest,
  BoqViewResult,
  ProjectedConsequenceLine,
  QuantityConsequenceProjectionRequest,
  QuantityConsequenceProjection,
  WhatIfAlternative,
  WhatIfComparisonRequest,
  WhatIfDeviationVerdict,
  WhatIfComparison,
} from "./quantify/contract";
export {
  InMemoryBoqGraphReferenceDouble,
  InMemoryBoqGraphAlternateDouble,
  referenceBoqGraphViewDouble,
  alternateBoqGraphViewDouble,
  refuseMalformedBoqVersionRequest,
} from "./quantify/doubles";
export {
  classifyWorldDiffs,
  DIFFERENCE_CLASSIFICATIONS,
} from "./compare-bridge";
export type { WorldDiffPair, WorldDiffClassification, DifferenceClassification } from "./compare-bridge";

/* The sequencing family (stages 6–7 — SEQUENCE + REPLAY). */
export {
  SEQUENCING_PLAN_KIND,
  SEQUENCING_PLAN_SCHEMA_VERSION,
  REPLAY_LOG_KIND,
  REPLAY_LOG_SCHEMA_VERSION,
  REPLAY_LEDGER_PORT_ID,
  SEQUENCE_PHASES,
  REPLAY_EVENT_KINDS,
  REPLAY_GENESIS_DIGEST,
  DURATION_UNIT_TO_HOURS,
  phaseOfOperationType,
  compileExecutionSimulationRequest,
  sequenceExecution,
  playbackPhasesOf,
  appendReplayEvent,
  openReplayLog,
  verifyReplayLog,
  isReplayEventKind,
} from "./sequencing/contract";
export type {
  ExecutionSequencingPlan,
  SequencedExecution,
  SequencePhase,
  ReplayEventKind,
  SolutionReplayEvent,
  SolutionReplayEntry,
  SolutionReplayLog,
  ReplayLedgerCapabilities,
  SolutionReplayLedger,
  ActivityDurationDeclaration,
  ExecutionSimulationAdapter,
  ExecutionSimulationRequest,
  ExecutionTrajectory,
  SimulatedActivity,
  SimulationClockDeclaration,
  SimulatedProgressCapture,
  TimeAnchoredWorldState,
} from "./sequencing/contract";
export {
  InMemoryReplayLedgerReferenceDouble,
  InMemoryReplayLedgerAlternateDouble,
  referenceReplayLedgerDouble,
  alternateReplayLedgerDouble,
} from "./sequencing/doubles";

/* The lane runner (the end-to-end composition). */
export {
  defaultInteractiveSolutionLaneKit,
  runInteractiveSolutionLane,
} from "./lane";
export type { InteractiveSolutionLaneKit, InteractiveSolutionLaneRun } from "./lane";
