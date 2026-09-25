/**
 * HFX-401 — `backend/api/src/provider-scorecard/` public surface.
 *
 * THE PROVIDER SCORECARD, PROMOTION AND ROLLBACK GATE — the cross-layer
 * promotion machinery that turns one-off HF experiments into a durable
 * AISE capability: continuously evaluating interchangeable technologies
 * instead of hardwiring a single model/provider. A provider may NOT
 * become the production default solely because it has better task
 * metrics — promotion requires ALL applicable gates of the work order's
 * ten-dimension checklist, enforced by CODE (the promotion engine refuses
 * on any mandatory-gate failure and names EVERY failed gate; there is no
 * override path).
 *
 * Consumers import from HERE only (the house module discipline). The
 * module IMPORTS the control plane (`@aise/provider-registry` — HFX-000's
 * machine, never modified) and the committed benchmark corpora
 * (`backend/api/src/geometry-eval` — HFX-302; `backend/api/src/
 * equivalence-eval` — HFX-301; the HFX-000 fixtures read as data) as
 * scorecard INPUTS. The standalone tools runner
 * (`tools/provider-scorecard/runner.ts`) consumes the COMMITTED RECORDS
 * as data (the workspace boundary matrix forbids tools → packages/backend
 * imports) and mirrors the derivations — the two-leg discipline.
 *
 *   gates.ts                the ten-gate closed, versioned vocabulary +
 *                           the evidence doctrine (kinds, outcomes, the
 *                           no-evidence-no-record validator);
 *   layers.ts               the per-layer promotion checklist (versioned
 *                           applicability: mandatory vs justified-NA +
 *                           the layer-regression requirements);
 *   promotion-vocabulary.ts the work-order states ↔ control-plane machine
 *                           mapping record (documented, versioned — never
 *                           a second machine);
 *   corpus.ts               the scored-provider corpus (the committed
 *                           inputs + the drill kits + the lane-registry
 *                           projection the tools runner consumes);
 *   scorecard.ts            the machine-readable scorecard record
 *                           (content-addressed) + the verdict derivation +
 *                           the validator;
 *   promotion.ts            the promotion decision engine (approve IFF
 *                           every mandatory gate passed; refuse naming
 *                           EVERY failed gate; no override) + the two-path
 *                           drill + the forged-record verifier;
 *   rollback.ts             the rollback/fallback configuration record +
 *                           the promote-then-demote drill with the
 *                           historical-replay proof;
 *   regenerate.ts           the committed-record writer (the evidence
 *                           under docs/productization-evidence/HFX-401/).
 *
 * DETERMINISM: pure functions + fresh in-memory registries throughout; no
 * clock, no randomness, no network; the committed control-plane registry
 * files are NEVER mutated (drills emit event payloads as records —
 * applying them to the live registry is the Tech Lead's call).
 */

/* The ten-gate vocabulary + the evidence doctrine. */
export {
  CONTROL_PLANE_GATE_MAPPING,
  CONTROL_PLANE_GATE_MAPPING_VERSION,
  GATE_EVIDENCE_KINDS,
  GATE_OUTCOMES,
  GATE_OUTCOME_FAILURE_KINDS,
  GATE_VOCABULARY_VERSION,
  PROMOTION_SCORECARD_GATE_IDS,
  SCORECARD_GATES,
  gateDefinitionOf,
  isGateEvidenceKind,
  isGateOutcomeKind,
  isScorecardGateId,
  validateGateOutcome,
  validateGateOutcomeSet,
} from "./gates";
export type {
  ControlPlaneGateMappingEntry,
  GateEvidence,
  GateEvidenceKind,
  GateOutcome,
  GateOutcomeFailure,
  GateOutcomeFailureKind,
  GateOutcomeKind,
  GateOutcomeValidation,
  ScorecardGateDefinition,
  ScorecardGateId,
} from "./gates";

/* The per-layer promotion checklist. */
export {
  CHECKLIST_FAILURE_KINDS,
  LAYER3_REQUIRED_OPERATION_FAMILIES,
  LAYER3_VISUAL_PRESENTATION_ONLY,
  LAYER_CHECKLISTS,
  LAYER_CHECKLIST_VERSION,
  LAYER_PROVIDER_CLASSES,
  LAYER_TITLES,
  NA_ALLOWANCE_CODES,
  REQUIRED_CAPABILITY_COVERAGE,
  SCORECARD_LAYERS,
  checkChecklistConformance,
  dependentLayerRegressionOf,
  gateApplicabilityOf,
  layerChecklistOf,
  layerChecklistProjectionJson,
  requiredCapabilityCoverageOf,
} from "./layers";
export type {
  ChecklistFailure,
  ChecklistFailureKind,
  GateApplicability,
  LayerChecklist,
  NaAllowanceCode,
  ScorecardLayer,
} from "./layers";

/* The promotion-vocabulary mapping record. */
export {
  PROMOTION_VOCABULARY_MAPPING,
  PROMOTION_VOCABULARY_MAPPING_VERSION,
  promotionVocabularyMappingJson,
} from "./promotion-vocabulary";
export type { PromotionVocabularyMappingRow } from "./promotion-vocabulary";

/* The scored-provider corpus (the committed inputs). */
export {
  ENGINEERED_REFUSAL_LICENSE_ID,
  ENGINEERED_REFUSAL_PROVIDER_ID,
  PROVIDER_SCORECARD_KIND,
  PROVIDER_SCORECARD_SCHEMA_VERSION,
  SCORECARD_CODE_VERSION,
  SCORECARD_CONSUMER,
  SCORECARD_ENVIRONMENT,
  buildScorecardCorpus,
  driveKitLifecycle,
  eventsDigestOf,
  laneRegistryProjection,
  profileReferenceOf,
  providerSlug,
} from "./corpus";
export type {
  DependentLayerCitation,
  ProviderDrillKit,
  ScorecardCorpus,
  ScorecardCorpusRow,
  ScoredProvider,
  ScoredProviderRole,
} from "./corpus";

/* The machine-readable scorecard record. */
export {
  EVIDENCE_POINTERS,
  SCORECARD_VALIDATION_FAILURE_KINDS,
  WORK_ORDER_STAGES,
  buildProviderScorecard,
  deriveVerdict,
  scorecardDigestOf,
  scorecardJson,
  scorecardPreimage,
  validateProviderScorecard,
} from "./scorecard";
export type {
  ProviderScorecard,
  ProviderScorecardValidation,
  ScorecardControlPlaneMapping,
  ScorecardCorpusLink,
  ScorecardValidationFailure,
  ScorecardValidationFailureKind,
  ScorecardVerdict,
  WorkOrderStage,
} from "./scorecard";

/* The promotion decision engine + the two-path drill. */
export {
  ENGINE_REFUSAL_KINDS,
  PROMOTION_RECORD_FAILURE_KINDS,
  PROVIDER_PROMOTION_KIND,
  PROVIDER_PROMOTION_SCHEMA_VERSION,
  dependentLayerRequirementOf,
  evaluatePromotion,
  mandatoryGateIdsOf,
  promotionRecordDigestOf,
  promotionRecordJson,
  runPromotionDrill,
  verifyProviderPromotionRecord,
} from "./promotion";
export type {
  ApprovedPromotionDecision,
  EngineRefusal,
  EngineRefusalKind,
  PromotionEngineDecision,
  PromotionRecordFailure,
  PromotionRecordFailureKind,
  PromotionRecordVerification,
  ProviderPromotionRecord,
  RefusedPromotionDecision,
} from "./promotion";

/* The rollback / fallback configuration record + the drill. */
export {
  ROLLBACK_DEMOTION_REASON,
  ROLLBACK_RECORD_FAILURE_KINDS,
  ROLLBACK_TRIGGER,
  PROVIDER_ROLLBACK_KIND,
  PROVIDER_ROLLBACK_SCHEMA_VERSION,
  rollbackRecordDigestOf,
  rollbackRecordJson,
  runRollbackDrill,
  verifyProviderRollbackRecord,
} from "./rollback";
export type {
  ProviderRollbackRecord,
  RollbackRecordFailure,
  RollbackRecordFailureKind,
  RollbackRecordVerification,
} from "./rollback";
