/**
 * PROD-028 — Layer-2 reasoning evaluation: the public module surface.
 *
 * The provider-neutral evaluation entry point for Layer-2 reasoning
 * capabilities, with the Evidence Envelope as the evaluation target:
 *
 *   model.ts    the canonical envelope semantics, the scenario/bundle
 *               model, the integrity-rule vocabulary and the parsers;
 *   harness.ts  `evaluateScenario` — normalize → map onto the canonical
 *               envelope → verify integrity → classify (the five-way
 *               discrimination) → emit the control-plane BenchmarkRecord
 *               + ProvenanceManifest;
 *   testkit.ts  the deterministic fixture providers (vlm/doc/retrieval)
 *               and the 26-scenario committed catalog + registry-log
 *               builders + the control-plane lifecycle driver;
 *   service.ts  the thin deterministic service (catalog, run, evaluate,
 *               suite) with fail-closed request parsing;
 *   router.ts   the pure route factory the Tech Lead mounts under
 *               /v1/reasoning-eval (transport only);
 *   index.ts    this surface.
 *
 * Import this module from backend surfaces; the tools-side benchmark
 * runner consumes the COMMITTED ARTIFACTS as data (the workspace boundary
 * matrix forbids tools → packages/backend imports).
 */

/* Model (types + vocabularies + parsers). */
export {
  BUNDLE_SCOPES,
  ENVELOPE_INTEGRITY_RULES,
  ENVELOPE_RESULT_STATUSES,
  EVIDENCE_ITEM_KINDS,
  FIXTURE_BEHAVIORS,
  FULL_EVALUATION_CRITERIA,
  REASONING_EVAL_ERROR_CODES,
  REASONING_EVAL_LANES,
  ReasoningEvalError,
  canonicalDigestOf,
  canonicalJsonText,
  isEnvelopeIntegrityRule,
  isEnvelopeResultStatus,
  isReasoningEvalLane,
  parseDeclaredEvidenceEnvelope,
  parseEvidenceQuestionBundle,
  parseReasoningEvalScenario,
  sortCanonicalValue,
} from "./model";
export type {
  BundleScope,
  DeclaredEvidenceEnvelope,
  EnvelopeAgentIdentity,
  EnvelopeIntegrityRule,
  EnvelopeIntegrityViolation,
  EnvelopeOperationContract,
  EnvelopeResultStatus,
  EvidenceItem,
  EvidenceItemKind,
  EvidenceMeasurement,
  EvidenceQuestionBundle,
  EvaluationCriteria,
  ExpectedEnvelopeOutcome,
  FixtureBehavior,
  ProposedOperation,
  ReasoningEvalErrorCode,
  ReasoningEvalLane,
  ReasoningEvalRegistryLog,
  ReasoningEvalScenario,
} from "./model";

/* Harness (the evaluation entry point + the classification tree). */
export {
  REASONING_EVAL_BENCHMARK_ID,
  REASONING_EVAL_CODE_VERSION,
  REASONING_EVAL_CONSUMER,
  REASONING_EVAL_ENVIRONMENT,
  classifyOutcome,
  evaluateScenario,
  verifyEnvelopeIntegrity,
} from "./harness";
export type {
  ExpectedFieldMatches,
  ReasoningEvalOutcome,
} from "./harness";

/* Testkit (the deterministic doubles + the committed catalog). */
export {
  FIXTURE_EMPTY_UNKNOWN,
  LANE_FIXTURE_PROVIDERS,
  REASONING_EVAL_CATALOG,
  REASONING_EVAL_SUITE_ID,
  REASONING_EVAL_SUITE_VERSION,
  driveFixtureRegistryLifecycle,
  executeFixtureProvider,
  fixtureDocProviderProfile,
  fixtureProfileForLane,
  fixtureRefusalDetail,
  fixtureRetrievalProviderProfile,
  fixtureVlmProviderProfile,
  goldenExpectedOutcomesJson,
  goldenScenarioSuiteJson,
  reasoningEvalCatalog,
  registryLogForScenario,
  runReasoningEvalSuite,
  suiteSummaryOf,
} from "./testkit";
export type {
  FixtureRegistryLifecycleResult,
  ReasoningEvalSuiteRun,
  ReasoningEvalSuiteSummary,
} from "./testkit";

/* Service (the thin deterministic service). */
export {
  ReasoningEvalService,
  parseCatalogRequest,
  parseScenarioEvaluateRequest,
  parseScenarioRunRequest,
} from "./service";
export type {
  CatalogRequest,
  ScenarioEvaluateRequest,
  ScenarioRunRequest,
  ScenarioSummary,
  SuiteRunResponse,
} from "./service";

/* Router (the pure route factory — the Lead wires it). */
export { handleReasoningEvalRequest } from "./router";
export type { ReasoningEvalRouteOptions } from "./router";
