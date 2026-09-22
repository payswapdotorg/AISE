/**
 * HFX-301 — the natural-language / direct-manipulation EQUIVALENCE
 * benchmark: the public module surface.
 *
 * The governed equivalence benchmark that EVIDENCES the hardening plan's
 * demand ("an explicit natural-language/direct-manipulation equivalence
 * test" — docs/huggingface-hardening-execution-plan.md §HF-3): for a
 * committed corpus of PAIRED authoring tasks, the natural-language path
 * (the PROD-023 agent compiler — imported, never modified) and the
 * direct-manipulation path (the interactive authoring input through the
 * contract's `createOperationIntent`) run through the SAME deterministic
 * journey (baseline materialization → apply → validate → BOQ derivation)
 * and their canonical results compare EQUIVALENT — or an HONESTLY
 * DECLARED difference with the PROD-029 closed-vocabulary kind. The
 * agent-refused and agent-clarification cells record the DESIGNED
 * agent-path outcomes, never equivalence failures.
 *
 *   model.ts     the typed vocabulary — the four behavior-matrix cells,
 *                the pair/direct-input shapes, the journey/comparison
 *                records, the pure `validateEquivalencePair`;
 *   corpus.ts    the committed corpus (32 pairs: 16 equivalent, 4
 *                declared-different, 7 agent-refused — one per
 *                unsafe-taxonomy reason code, 6 agent-clarification —
 *                all five clarification slot kinds) + the committed
 *                baseline scene and the session focus table;
 *   registry.ts  the control-plane wiring — the deterministic in-house
 *                lane profile + the pinned suite identities and the
 *                version pins (taxonomy, engine, compiler, corpus digest);
 *   harness.ts   `evaluateEquivalencePair` — the dual-path executor
 *                (compile/author → apply → validate → BOQ → compare on
 *                PROD-029's points) + `evaluateProvenanceOnlyControl`;
 *   testkit.ts   the deterministic doubles (the baseline scene resolver,
 *                the BOQ resolution seam), the suite runner + summary,
 *                the mutation twins (the negative controls), the
 *                committed-artifact golden builders and the control-plane
 *                registry lifecycle driver;
 *   index.ts     this surface.
 *
 * Import this module from backend surfaces; the tools-side benchmark
 * runner consumes the COMMITTED ARTIFACTS as data (the workspace
 * boundary matrix forbids tools → packages/backend imports).
 */

/* Model (types + vocabularies + the pure pair validator). */
export {
  EQUIVALENCE_COMPARISON_POINTS,
  EQUIVALENCE_EVAL_ERROR_CODES,
  EQUIVALENCE_EXPECTATIONS,
  EQUIVALENCE_REFUSAL_TAXONOMY,
  EquivalenceEvalError,
  isEquivalenceExpectation,
  validateEquivalencePair,
} from "./model";
export type {
  AgentPathCompile,
  DirectAuthoringInput,
  EquivalenceComparison,
  EquivalenceEvalErrorCode,
  EquivalenceExpectation,
  EquivalenceOutcome,
  EquivalencePair,
  EquivalencePairValidation,
  EquivalencePairValidationFailure,
  EquivalencePathRecord,
  EquivalencePointResult,
  JourneyOutcome,
} from "./model";

/* Corpus (the committed pairs + the scene + the focus table). */
export {
  EQUIVALENCE_CORPUS,
  EQUIVALENCE_FOCI,
  EQUIVALENCE_SCENE,
  EQUIVALENCE_SCENES,
  equivalenceCorpus,
  equivalencePairIds,
  equivalenceSceneOf,
  prerequisiteOperationIdOf,
} from "./corpus";
export type { EquivalenceScene } from "./corpus";

/* Registry wiring (the lane profile + the pinned identities). */
export {
  EQUIVALENCE_CAPABILITY,
  EQUIVALENCE_COMPILER_CODE_VERSION,
  EQUIVALENCE_ENGINE_CODE_VERSION,
  EQUIVALENCE_ENGINE_KIND,
  EQUIVALENCE_EVAL_BENCHMARK_ID,
  EQUIVALENCE_EVAL_CODE_VERSION,
  EQUIVALENCE_EVAL_CONSUMER,
  EQUIVALENCE_EVAL_DECLARED_RESOURCES,
  EQUIVALENCE_EVAL_ENVIRONMENT,
  EQUIVALENCE_EVAL_SUITE_ID,
  EQUIVALENCE_EVAL_SUITE_VERSION,
  EQUIVALENCE_LANE_PROVIDER_ID,
  EQUIVALENCE_LANE_TECHNOLOGY_VERSION,
  EQUIVALENCE_TAXONOMY_VERSION,
  deterministicInhouseLaneProfile,
} from "./registry";

/* Harness (the dual-path executor + the comparison + the controls). */
export {
  boqDeltaLinesOf,
  compareJourneys,
  directIntentOf,
  evaluateEquivalencePair,
  evaluateProvenanceOnlyControl,
} from "./harness";
export type {
  BoqDeltaLine,
  BoqResolutionInput,
  BoqResolverSeam,
  EquivalenceHarnessDoubles,
  ResolvedBoq,
} from "./harness";

/* Testkit (the doubles + the suite runner + the golden builders). */
export {
  EXPECTED_OUTCOMES_PATH,
  SCENARIO_PATH,
  driveEquivalenceRegistryLifecycle,
  equivalenceHarnessDoubles,
  equivalenceOutcomeViewOf,
  expectationFlipTwin,
  goldenExpectedOutcomesJson,
  goldenScenarioSuiteJson,
  runEquivalenceSuite,
  semanticMutationTwin,
} from "./testkit";
export type {
  EquivalenceOutcomeView,
  EquivalenceRegistryLifecycleResult,
  EquivalenceSuiteRun,
  EquivalenceSuiteSummary,
} from "./testkit";
