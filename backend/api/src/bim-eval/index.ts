/**
 * HFX-204 — the BIM/construction reasoning + operation evaluation corpus:
 * the public module surface.
 *
 * The governed evaluation corpus + harness proving two mappings over the
 * HFX-000 control plane, fully deterministic:
 *
 *   model.ts     the corpus model — the pinned upstream benchmark
 *                manifests (IFC-Bench / BIM-Edit identity, version,
 *                evaluation-only license status, in-repo fixture
 *                provenance), the frozen lane/question/edit/negative-case
 *                vocabularies, the BIM-Edit integrity-rule vocabulary with
 *                its closed-kind mapping, the building-model fixture types
 *                and the fail-closed fixture/bundle/manifest parsers;
 *   registry.ts  the control-plane wiring — the two deterministic fixture
 *                provider profiles (QA + edit translation) and the pinned
 *                suite/benchmark identities;
 *   harness.ts   `evaluateQuestionFixture` / `evaluateEditFixture` — the
 *                two-lane evaluation entry points: the Layer-2 Evidence
 *                Envelope evaluation (imported from reasoning-eval) for
 *                the question lane; the intent decode → integrity →
 *                classification pipeline for the edit lane (compared as a
 *                proposal, never executed); both emit the governed
 *                BenchmarkRecord + ProvenanceManifest;
 *   testkit.ts   the deterministic doubles + the 29-fixture committed
 *                corpus, the suite runner + summary, the committed-artifact
 *                golden builders and the control-plane registry lifecycle
 *                driver;
 *   service.ts   the thin deterministic service (corpus listing, fixture
 *                run, suite run) with fail-closed request parsing;
 *   index.ts     this surface.
 *
 * Import this module from backend surfaces; the tools-side benchmark
 * runner consumes the COMMITTED ARTIFACTS as data (the workspace boundary
 * matrix forbids tools → packages/backend imports).
 */

/* Model (types + vocabularies + pinned manifests + parsers). */
export {
  BIM_EDIT_COMMAND_FORMS,
  BIM_EDIT_CONSTRAINT_KINDS,
  BIM_EDIT_EDIT_CLASSES,
  BIM_EDIT_INTEGRITY_RULES,
  BIM_EDIT_RULE_KINDS,
  BIM_EDIT_UPSTREAM_MANIFEST,
  BIM_EVAL_ERROR_CODES,
  BIM_EVAL_LANES,
  BIM_EVAL_UPSTREAM_MANIFESTS,
  BIM_NEGATIVE_CASE_CLASSES,
  BIM_QUESTION_LANE_PROJECTION,
  BimEvalError,
  IFC_BENCH_QUESTION_CLASSES,
  IFC_BENCH_UPSTREAM_MANIFEST,
  UPSTREAM_BENCHMARK_IDS,
  buildUpstreamBenchmarkManifest,
  canonicalDigestOf,
  canonicalJsonText,
  FULL_EVALUATION_CRITERIA,
  isBimEditEditClass,
  isBimEditIntegrityRule,
  isBimEvalLane,
  isIfcBenchQuestionClass,
  parseBimBuildingModel,
  parseBimEditBundle,
  parseBimEditFixture,
  parseBimQuestionFixture,
  parseUpstreamBenchmarkManifest,
} from "./model";
export type {
  BimBuildingModelFixture,
  BimEditBundle,
  BimEditBundleElementProperty,
  BimEditCommandDirectIntent,
  BimEditCommandForm,
  BimEditCommandNaturalLanguage,
  BimEditConstraint,
  BimEditConstraintKind,
  BimEditEditClass,
  BimEditExpectedIntent,
  BimEditExpectedOutcome,
  BimEditFixture,
  BimEditIntegrityRule,
  BimEditIntegrityViolation,
  BimEditQuantity,
  BimEditReferencedElement,
  BimElementProperty,
  BimEvalErrorCode,
  BimEvalLane,
  BimModelElement,
  BimModelStorey,
  BimModelTopologyRelation,
  BimNegativeCaseClass,
  BimQuestionFixture,
  IfcBenchQuestionClass,
  UpstreamBenchmarkId,
  UpstreamBenchmarkManifest,
} from "./model";

/* Registry wiring (the fixture provider profiles + the pinned identities). */
export {
  BIM_EVAL_BENCHMARK_ID,
  BIM_EVAL_CODE_VERSION,
  BIM_EVAL_CONSUMER,
  BIM_EVAL_DECLARED_RESOURCES,
  BIM_EVAL_ENVIRONMENT,
  BIM_EVAL_LANE_FIXTURE_PROVIDERS,
  BIM_EVAL_SUITE_ID,
  BIM_EVAL_SUITE_VERSION,
  bimLaneOfProvider,
  fixtureBimEditProviderProfile,
  fixtureBimQaProviderProfile,
  fixtureProfileForBimLane,
} from "./registry";

/* Harness (the two-lane evaluation entry points + the classification tree). */
export {
  classifyEditOutcome,
  evaluateEditFixture,
  evaluateQuestionFixture,
  expectedIntentSemanticsOf,
  intentSemanticsEqual,
  intentSemanticsOf,
  verifyEditIntent,
} from "./harness";
export type {
  BimEditFieldMatches,
  BimEditOutcome,
  BimIntentParameterSemantics,
  BimIntentSemantics,
  BimQuestionOutcome,
} from "./harness";

/* Testkit (the deterministic doubles + the committed corpus + the goldens). */
export {
  BIM_EVAL_BUILDING_MODEL,
  BIM_EVAL_EDIT_FIXTURES,
  BIM_EVAL_QUESTION_FIXTURES,
  BIM_QA_EMPTY_UNKNOWN,
  BIM_QA_UNPARSEABLE_UNKNOWN,
  bimEditOutcomeViewOf,
  bimEditRefusalDetail,
  bimEvalEditFixtures,
  bimEvalQuestionFixtures,
  bimEvalSuiteSummaryOf,
  bimQaRefusalDetail,
  bimQuestionOutcomeViewOf,
  buildingModelDigest,
  driveBimEvalRegistryLifecycle,
  executeBimEditProvider,
  executeBimFixtureProvider,
  executeBimQaProvider,
  goldenExpectedOutcomesJson,
  goldenScenarioSuiteJson,
  registryLogForEditFixture,
  registryLogForQuestionFixture,
  runBimEvalSuite,
} from "./testkit";
export type {
  BimEvalOutcomeView,
  BimEvalRegistryLifecycleResult,
  BimEvalSuiteRun,
  BimEvalSuiteSummary,
} from "./testkit";

/* Service (the thin deterministic service). */
export { BimEvalService, parseCatalogRequest, parseFixtureRunRequest } from "./service";
export type { CatalogRequest, FixtureRunRequest, FixtureSummary, SuiteRunResponse } from "./service";
