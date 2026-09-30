/**
 * `@aise/anchoring-contract` — public API (ANCHOR-002).
 *
 * THE SHARED ANCHORING CONTRACT: the provider-neutral anchoring port lifted
 * from the ANCHOR-001 spike into a typed zod-coded contract — so that every
 * anchoring provider and every anchoring consumer implements against the
 * same closed wire shapes, the same AISE-owned identity discipline and the
 * same fail-closed laws, keeping "no provider type crosses the canonical
 * contract" PHYSICALLY true (a process boundary), not merely conventional.
 *
 * Layout:
 *   anchoring-contracts.version.ts  the version + the NEW port id
 *   vocabularies.ts                 the closed, versioned vocabularies
 *   request.ts / response.ts        the zod-coded wire schemas
 *   codec.ts                        the solution-contract codec discipline
 *   guard.ts                        the AISE-side output guard (typed laws)
 *   laws.ts                         the constructive port laws + gate order
 *   runner.ts                       the supervised subprocess runner
 *   registration.ts                 the evaluation-stage reference-lane registration
 *
 * The exported surface is functions + frozen constants ONLY (the house
 * package discipline). NO I/O in the core schemas/laws/guard (the runner is
 * the supervised-boundary module by definition; the registration is a pure
 * derivation over declared values). Nothing here writes the Reality Graph —
 * hypotheses are INFERRED candidates; the governed changes API remains the
 * only production path.
 */

/* Versioning ---------------------------------------------------------------- */

export {
  ANCHORING_CONTRACT_VERSION,
  ANCHORING_CONTRACT_FAMILIES,
  ANCHORING_FAMILY_VERSIONS,
  ANCHORING_OBJECT_NAMES,
  ANCHORING_PORT_VERSION,
  ANCHORING_WIRE_SCHEMA_VERSION,
  anchoringFamilyVersion,
} from "./anchoring-contracts.version";
export type {
  AnchoringContractFamily,
  AnchoringObjectName,
} from "./anchoring-contracts.version";

/* Closed vocabularies -------------------------------------------------------- */

export {
  ANCHORING_EVIDENCE_METHODS,
  ANCHORING_GATE_STAGES,
  ANCHORING_GUARD_VIOLATION_CODES,
  ANCHORING_OUTCOMES,
  ANCHORING_PER_STILL_REASON_CODES,
  ANCHORING_REASON_CODES,
  ANCHORING_REPRESENTATIONS,
  ANCHORING_RUNNER_FAILURE_KINDS,
  HYPOTHESIS_EPISTEMIC_LABELS,
  PLAN_CONTEXT_KINDS,
} from "./vocabularies";
export type {
  AnchoringEvidenceMethod,
  AnchoringGateStage,
  AnchoringGuardViolationCode,
  AnchoringOutcome,
  AnchoringPerStillReasonCode,
  AnchoringReasonCode,
  AnchoringRepresentation,
  AnchoringRunnerFailureKind,
  HypothesisEpistemicLabel,
  PlanContextKind,
} from "./vocabularies";

/* Errors ---------------------------------------------------------------------- */

export {
  AnchoringContractDecodeError,
  AnchoringContractEncodeError,
  AnchoringContractError,
  AnchoringContractInvariantError,
  AnchoringContractVersionMismatchError,
} from "./errors";
export type {
  AnchoringContractErrorCode,
  AnchoringContractIssue,
  AnchoringContractObjectContext,
} from "./errors";

/* Request wire schema --------------------------------------------------------- */

export {
  anchoringPolicySchema,
  anchoringRequestSchema,
  evidenceRefSchema,
  planContextSchema,
  rasterToSceneSchema,
  requestContentIds,
  requestStillContentIds,
} from "./request";
export type {
  AnchoringPolicy,
  AnchoringRequest,
  EvidenceRef,
  PlanContext,
  RasterToScene,
} from "./request";

/* Response wire schema ---------------------------------------------------------- */

export {
  anchoringHypothesisSchema,
  anchoringProvenanceSchema,
  anchoringRefusedStillSchema,
  anchoringResponseSchema,
  crossValidationEntrySchema,
  partialSummarySchema,
  provenanceComponentSchema,
  uncertaintyBudgetSchema,
} from "./response";
export type {
  AnchoringHypothesis,
  AnchoringProvenance,
  AnchoringRefusedStill,
  AnchoringResponse,
  CrossValidationEntry,
  PartialSummary,
  ProvenanceComponent,
  UncertaintyBudget,
} from "./response";

/* Codec engine ---------------------------------------------------------------- */

export { createAnchoringWireCodec } from "./codec";
export type {
  AnchoringWireCodec,
  AnchoringWireCodecOptions,
} from "./codec";
export { anchoringRequestCodec, anchoringResponseCodec } from "./codecs.instance";

/* Output guard (the boundary law) ----------------------------------------------- */

export {
  deterministicProjection,
  guardAnchoringResponse,
} from "./guard";
export type { AnchoringGuardViolation } from "./guard";

/* The port laws (constructive) --------------------------------------------------- */

export {
  ANCHORING_GATE_ORDER,
  ANCHORING_GATE_STAGE_REASON_CODES,
  buildPartialResponse,
  echoedContentIds,
  firstFailingStage,
  refuseAnchoring,
  refuseStill,
  refusalCarriesZeroHypotheses,
  stageOfReasonCode,
} from "./laws";

/* The supervised subprocess runner ------------------------------------------------- */

export {
  anchoringInputDigestOf,
  runSupervisedAnchoring,
} from "./runner";
export type {
  AnchoringRunnerFailure,
  AnchoringRunnerFailureRecord,
  AnchoringRunnerSuccess,
  SupervisedAnchoringRun,
  SupervisedRunnerOptions,
} from "./runner";

/* The evaluation-stage reference-lane registration ----------------------------------- */

export {
  ANCHOR001_ADAPTER_SOURCE_DIGEST,
  ANCHOR001_AGGREGATE,
  ANCHOR001_COUNTS,
  ANCHOR001_INPUT_DIGEST,
  ANCHOR001_MERGE_SHA,
  ANCHOR001_POLICY_ECHO,
  ANCHOR001_RUN_DIGEST,
  ANCHOR001_WALL_MS,
  REFERENCE_LANE_BENCHMARK_ID,
  REFERENCE_LANE_CAPABILITY,
  REFERENCE_LANE_COMPONENTS,
  REFERENCE_LANE_PLATFORM,
  REFERENCE_LANE_PROVIDER_ID,
  REFERENCE_LANE_TECHNOLOGY_VERSION,
  deriveReferenceLaneRegistration,
  evaluateReferenceLanePromotion,
  referenceLaneBenchmarkBody,
  referenceLaneBenchmarkRecord,
  referenceLaneEnvironment,
  referenceLaneProfile,
  referenceLaneProvenanceManifest,
} from "./registration";
export type { ReferenceLaneRegistration } from "./registration";
