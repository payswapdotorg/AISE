/**
 * HFX-101 — the MapAnything universal-reconstruction provider benchmark:
 * the public module surface.
 *
 * The provider-neutral Layer-1 reconstruction benchmark lane of the
 * layer-hardening track, with Meta's MapAnything registered as the
 * candidate provider profile through the HFX-000 control plane and
 * benchmarked over deterministic in-repo fixture doubles over the
 * multi-image capture sets, metric-depth and registration capabilities
 * (no live model, no network — the binding dataset/model-use rule keeps
 * the candidate evaluation-only), compared against the existing
 * deterministic/reference path over the SAME fixtures and joined on the
 * control plane's comparability key:
 *
 *   model.ts     the suite identities, the variant keys, the task +
 *                behavior-matrix vocabularies, the declared capture
 *                requirements, the structured capture-set fixtures with
 *                the fail-closed parsers, the uncertainty declarations,
 *                the corpus task/run shapes and the registered candidate
 *                profile (validated through `validateProviderProfile`);
 *   corpus.ts    the committed EIGHT-task corpus (× the candidate + the
 *                reference-path variants = TWELVE runs) with the
 *                reality-eval-validated scenario descriptors;
 *   doubles.ts   the deterministic MapAnything evaluation double (the
 *                data-driven task/resource/coverage/overlap gates, the
 *                delegated reconstruction core, the documented depth
 *                deviation, the opaque native payload);
 *   harness.ts   `evaluateMapAnythingRun` — the evaluation entry point
 *                (the double → the reality-eval Layer-1 harness → the
 *                lane's metadata assertions);
 *   versions.ts  the derived-reconstruction-version discipline
 *                (reprocessing creates a NEW derived version; the
 *                original evidence-revision binding is immutable);
 *   registry.ts  the control-plane lifecycle: registration → evaluation →
 *                executions → consolidated benchmark records → sealed
 *                provenance manifests → the license-blocked promotion
 *                refusal → the replay proof;
 *   compare.ts   the per-lane provider comparison records over the same
 *                corpus (outcome counts + metric deltas + the
 *                comparability key join);
 *   golden.ts    the committed-artifact projections (tools/
 *                mapanything-eval/scenario.json + fixtures/
 *                expected-outcomes.json);
 *   service.ts   the thin deterministic service (catalog, run, corpus,
 *                benchmark) with fail-closed request parsing;
 *   index.ts     this surface (types + functions + frozen constants only).
 *
 * Import this module from backend surfaces; the tools-side benchmark
 * runner consumes the COMMITTED ARTIFACTS as data (the workspace boundary
 * matrix forbids tools → packages/backend imports).
 */

/* Model (types + vocabularies + parsers + the registered profile). */
export {
  DECLARED_COST_MODELS,
  DECLARED_MODALITIES,
  DERIVED_VERSION_PREFIX,
  MAPANYTHING_BEHAVIOR_MATRIX_CELLS,
  MAPANYTHING_DECLARED_FALLBACK,
  MAPANYTHING_DEGRADED_BOUND_SIGMA_M,
  MAPANYTHING_DEPTH_OFFSET_M,
  MAPANYTHING_DEPTH_SCALE_DEVIATION,
  MAPANYTHING_DEPTH_SIGMA_M,
  MAPANYTHING_DOUBLE_BEHAVIOR_CLASSES,
  MAPANYTHING_EVAL_CODE_VERSION,
  MAPANYTHING_EVAL_ERROR_CODES,
  MAPANYTHING_EVAL_EXECUTION_MODE,
  MAPANYTHING_EVAL_SUITE_ID,
  MAPANYTHING_EVAL_SUITE_VERSION,
  MAPANYTHING_EVAL_VARIANTS,
  MAPANYTHING_LICENSE_IDENTIFIER,
  MAPANYTHING_LICENSE_STATUS_EVALUATION_ONLY,
  MAPANYTHING_MAX_FUSED_POINTS,
  MAPANYTHING_MIN_COVERAGE_RATIO,
  MAPANYTHING_MIN_INTER_PASS_OVERLAP_RATIO,
  MAPANYTHING_PROVIDER_ID,
  MAPANYTHING_REFERENCE_VARIANTS,
  MAPANYTHING_TASKS,
  MAPANYTHING_TECHNOLOGY_VERSION,
  MapAnythingEvalError,
  canonicalDigestOf,
  canonicalJsonText,
  derivedReconstructionVersionIdOf,
  isMapAnythingTaskKind,
  isMapAnythingVariantKey,
  mapAnythingLicenseDeclaration,
  mapAnythingLicenseStatus,
  mapAnythingProfile,
  mapAnythingProfileForVariant,
  mapAnythingVariantIdentity,
  mapAnythingVariantLanes,
  parseMapAnythingCaptureSet,
  parseMapAnythingVariantKey,
  parseUncertaintyDeclaration,
  validatedMapAnythingProfile,
  validatedProfileForVariant,
  validateMapAnythingTaskCoherence,
} from "./model";
export type {
  DerivedVersionAddressInput,
  MapAnythingBehaviorMatrixCell,
  MapAnythingCaptureFrame,
  MapAnythingCaptureSet,
  MapAnythingCorpusTask,
  MapAnythingDoubleBehaviorClass,
  MapAnythingEvalErrorCode,
  MapAnythingEvalRun,
  MapAnythingTaskKind,
  MapAnythingVariantKey,
  UncertaintyDeclaration,
} from "./model";

/* Corpus (the committed benchmark corpus + the materialized runs). */
export {
  MAPANYTHING_DECLARED_MATRIX_CELLS,
  MAPANYTHING_DECLARED_TASKS,
  MAPANYTHING_EVAL_CORPUS,
  buildMapAnythingEvalRun,
  mapAnythingEvalCorpus,
  mapAnythingEvalRuns,
  mapAnythingEvalRunsForVariant,
  mapAnythingRunOf,
  mapAnythingSuiteIdentity,
  referenceRunOf,
} from "./corpus";

/* Doubles (the deterministic in-repo stand-in for the candidate). */
export {
  MAPANYTHING_DOUBLE_ENGINE,
  MAPANYTHING_DOUBLE_NATIVE_MEDIA_TYPE,
  executeMapAnythingDouble,
  readCaptureGates,
} from "./doubles";
export type { CaptureGateReadings } from "./doubles";

/* Harness (the evaluation entry point). */
export {
  evaluateMapAnythingRun,
  evaluateMapAnythingRunCorpus,
  mapAnythingRegistryLogFor,
} from "./harness";
export type {
  MapAnythingEvalOutcome,
  MapAnythingFallbackState,
  MapAnythingOutcomeUncertainty,
} from "./harness";

/* Versions (the derived-reconstruction-version discipline). */
export {
  derivedReconstructionVersionOf,
  firstDerivedVersionOf,
  reprocessMapAnythingRun,
} from "./versions";
export type {
  DerivedReconstructionVersion,
  MapAnythingReprocessResult,
} from "./versions";

/* Registry wiring (the control-plane lifecycle). */
export {
  MAPANYTHING_EVAL_CONSUMER,
  MAPANYTHING_EVAL_ENVIRONMENT,
  consolidatedLaneRecord,
  runMapAnythingBenchmarkLifecycle,
} from "./registry";
export type {
  MapAnythingBenchmarkLifecycleResult,
  MapAnythingLane,
  MapAnythingVariantLifecycle,
} from "./registry";

/* Comparison (the provider-comparison evidence). */
export {
  MAPANYTHING_COMPARISON_HONEST_NOTE,
  compareMapAnythingLanes,
  exhibitedFailureKindsOf,
  mapAnythingVariantLaneSummaryOf,
} from "./compare";
export type {
  MapAnythingComparisonLaneInput,
  MapAnythingLaneComparison,
  MapAnythingLaneComparisonRow,
  MapAnythingMetricDeltaRow,
  MapAnythingVariantLaneSummary,
} from "./compare";

/* Golden (the committed-artifact projections). */
export {
  goldenMapAnythingExpectedOutcomesJson,
  goldenMapAnythingScenarioSuiteJson,
  mapAnythingScenarioSuiteValue,
} from "./golden";

/* Service (the thin deterministic evaluation entry point). */
export { MapAnythingEvalService, parseMapAnythingEvalRequest } from "./service";
export type {
  MapAnythingEvalRequest,
  MapAnythingRunSummary,
  MapAnythingVariantCorpusRun,
} from "./service";
