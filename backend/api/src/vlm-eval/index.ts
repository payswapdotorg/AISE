/**
 * HFX-201 — the Qwen3-VL multimodal reasoning provider benchmark: the
 * public module surface.
 *
 * The provider-neutral VLM benchmark lane of the layer-hardening track,
 * with Qwen3-VL 8B and Qwen3-VL 30B-A3B registered as separate candidate
 * profiles through the HFX-000 control plane and evaluated over
 * deterministic in-repo fixture doubles (no live model, no network — the
 * binding dataset/model-use rule keeps both candidates evaluation-only):
 *
 *   model.ts     the suite identities, the variant keys, the behavior +
 *                matrix vocabularies, the deterministic-check vocabulary,
 *                the structured evidence fixtures (image/video/OCR) with
 *                the fail-closed parsers, the double-script shape and the
 *                two registered candidate profiles (validated through
 *                `validateProviderProfile`);
 *   corpus.ts    the committed 12-scenario multimodal corpus (× 2 variants
 *                = 24 runs) and the Layer-2 materialization;
 *   doubles.ts   the deterministic Qwen3-VL evaluation doubles (the
 *                data-driven well-grounded / hallucinating / refusing
 *                behaviors, the opaque native payload);
 *   checks.ts    the deterministic grounded-reasoning checks (fact
 *                derivability, spatial-reference resolution, field-value
 *                recomputation, conflict detection) + the revision-binding
 *                verification;
 *   harness.ts   `evaluateVlmScenario` — the evaluation entry point (the
 *                double → normalizeResult → the Layer-2 envelope
 *                validation + classification → the deterministic checks);
 *   registry.ts  the control-plane lifecycle: registration → evaluation →
 *                executions → consolidated benchmark records → sealed
 *                provenance manifests → the license-blocked promotion
 *                refusals → the replay proof;
 *   compare.ts   the per-variant summaries + the provider comparison
 *                record over the same corpus (the comparability join);
 *   golden.ts    the committed-artifact projections (tools/vlm-eval/
 *                scenario.json + fixtures/expected-outcomes.json);
 *   service.ts   the thin deterministic service (catalog, run, corpus,
 *                benchmark) with fail-closed request parsing;
 *   index.ts     this surface (types + functions + frozen constants only).
 *
 * Import this module from backend surfaces; the tools-side benchmark
 * runner consumes the COMMITTED ARTIFACTS as data (the workspace boundary
 * matrix forbids tools → packages/backend imports).
 */

/* Model (types + vocabularies + parsers + the registered profiles). */
export {
  DECLARED_COST_MODELS,
  DECLARED_MODALITIES,
  QWEN3_VL_8B_PROVIDER_ID,
  QWEN3_VL_8B_TECHNOLOGY_VERSION,
  QWEN3_VL_30B_A3B_PROVIDER_ID,
  QWEN3_VL_30B_A3B_TECHNOLOGY_VERSION,
  QWEN3_VL_FAMILY,
  QWEN3_VL_LICENSE_IDENTIFIER,
  QWEN3_VL_VARIANTS,
  VLM_BEHAVIOR_MATRIX_CELLS,
  VLM_DETERMINISTIC_CHECKS,
  VLM_DOUBLE_BEHAVIOR_CLASSES,
  VLM_EVAL_BENCHMARK_ID,
  VLM_EVAL_CAPABILITY,
  VLM_EVAL_CODE_VERSION,
  VLM_EVAL_ERROR_CODES,
  VLM_EVAL_LANE,
  VLM_EVAL_SUITE_ID,
  VLM_EVAL_SUITE_VERSION,
  VlmEvalError,
  fixtureContentTextOf,
  fixtureFactsOf,
  isQwen3VlCandidateProviderId,
  isVlmVariantKey,
  parseVlmCorpusScenarioSpec,
  parseVlmDoubleScriptSpec,
  parseVlmEvidenceFixture,
  parseVlmImageFixture,
  parseVlmOcrFixture,
  parseVlmVariantKey,
  parseVlmVideoFixture,
  qwen3Vl8bProfile,
  qwen3Vl30bA3bProfile,
  qwen3VlCandidateProfiles,
  qwen3VlLicenseDeclaration,
  qwen3VlLicenseStatus,
  qwen3VlProfileForVariant,
  qwen3VlVariantIdentity,
  toLayer2Bundle,
  toLayer2EvidenceItem,
  validatedQwen3VlProfile,
} from "./model";
export type {
  VlmBehaviorMatrixCell,
  VlmDeterministicCheckId,
  VlmDeterministicCheckPlan,
  VlmDoubleBehaviorClass,
  VlmDoubleScriptSpec,
  VlmEvalErrorCode,
  VlmEvidenceFixture,
  VlmImageElementFixture,
  VlmImageFixture,
  VlmOcrFixture,
  VlmOcrRegionFixture,
  VlmOracleSpec,
  VlmCorpusScenarioSpec,
  VlmSpatialReference,
  VlmVariantKey,
  VlmVideoFixture,
  VlmVideoFrameFixture,
} from "./model";

/* Corpus (the committed multimodal benchmark corpus + materialization). */
export {
  VLM_EVAL_CORPUS,
  VLM_EVAL_RUNS,
  buildVlmEvalRuns,
  buildVlmEvalScenario,
  vlmEvalCorpus,
  vlmEvalRuns,
  vlmEvalRunsForVariant,
} from "./corpus";
export type { VlmEvalScenario } from "./corpus";

/* Doubles (the deterministic in-repo stand-ins for the candidates). */
export {
  QWEN3_VL_DOUBLE_ENGINE,
  QWEN3_VL_DOUBLE_NATIVE_MEDIA_TYPE,
  executeQwen3VlDouble,
  qwen3VlRefusalDetail,
} from "./doubles";

/* Checks (the deterministic grounded-reasoning recomputation authority). */
export {
  VLM_CHECK_VERDICTS,
  resolveFieldAssertions,
  resolveSpatialReference,
  runGroundedReasoningChecks,
  verifyRevisionBinding,
} from "./checks";
export type {
  VlmCheckVerdict,
  VlmFieldAssertion,
  VlmGroundedCheckObservation,
  VlmGroundedCheckResult,
  VlmGroundedCheckVerdictEntry,
  VlmRevisionBinding,
  VlmSpatialResolution,
} from "./checks";

/* Harness (the evaluation entry point). */
export { evaluateVlmRunCorpus, evaluateVlmScenario, vlmRegistryLogFor } from "./harness";
export type { VlmEvalOutcome } from "./harness";

/* Registry wiring (the control-plane lifecycle). */
export {
  VLM_EVAL_CONSUMER,
  VLM_EVAL_ENVIRONMENT,
  consolidatedVariantRecord,
  runVlmBenchmarkLifecycle,
} from "./registry";
export type { VlmBenchmarkLifecycleResult, VlmVariantLifecycle } from "./registry";

/* Comparison (the provider-comparison evidence). */
export {
  VLM_COMPARISON_HONEST_NOTE,
  compareVlmVariants,
  exhibitedFailureKindsOf,
  vlmVariantSummaryOf,
} from "./compare";
export type {
  VlmVariantComparison,
  VlmVariantComparisonRow,
  VlmVariantRunSummary,
} from "./compare";

/* Golden (the committed-artifact projections). */
export { goldenVlmExpectedOutcomesJson, goldenVlmScenarioSuiteJson } from "./golden";

/* Service (the thin deterministic evaluation entry point). */
export { VlmEvalService, parseVlmEvalRequest } from "./service";
export type { VlmEvalRequest, VlmScenarioSummary, VlmVariantCorpusRun } from "./service";
