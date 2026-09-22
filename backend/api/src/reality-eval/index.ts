/**
 * PROD-027 — the Layer-1 reality evaluation public surface.
 *
 * Consumers (server.ts at the integration station, the tools-side benchmark
 * runner's backend counterpart, future HFX-1xx adapter surfaces, developer
 * tooling) import from HERE only:
 *
 *  - model.ts    — the evaluation scenario types (the provider-neutral
 *                  Layer-1 entry point's data model: capabilities, expected
 *                  CANONICAL outcomes, criteria) + the pure typed
 *                  validators + the committed scenario-set/golden shapes;
 *  - harness.ts  — `evaluateScenario(scenario, registryLog)`: the PURE
 *                  evaluation function (profile resolution by replay,
 *                  control-plane normalization, canonical comparison via
 *                  the EXISTING benchmark metrics, BenchmarkRecord +
 *                  ProvenanceManifest emission, typed refusals);
 *  - service.ts  — the deterministic in-memory event-sourced evaluation
 *                  registry + the typed service errors;
 *  - router.ts   — the PURE route factory (`/v1/reality-eval/**` — not
 *                  mounted; the Tech Lead wires it in server.ts);
 *  - testkit.ts  — the deterministic fixture provider doubles, the
 *                  committed scenario-suite runner and the committed-golden
 *                  loaders (TEST-ONLY I/O);
 *  - regenerate.ts — the committed-artifact regeneration CLI.
 *
 * THE BOUNDARY, restated at the surface: providers are implementation
 * candidates, NEVER canonical Layer-1 truth — provider-specific types stay
 * outside the canonical comparison (typed refusals at the boundary), native
 * payloads stay opaque, and evaluation records + manifests are the only
 * artifacts that flow toward the control plane.
 */

export {
  // capability vocabulary + lane status + pinned benchmark ids
  REALITY_EVAL_CAPABILITIES,
  CAPABILITY_LANE_STATUS,
  LANE_BENCHMARK_IDS,
  // scenario classes + typed seals
  SCENARIO_CLASSES,
  REALITY_EVAL_SCENARIO_KIND,
  REALITY_EVAL_SCENARIO_SCHEMA_VERSION,
  // scenario model
  validateRealityEvalScenarioDescriptor,
  validateRealityEvalScenario,
  completeScenario,
  // committed set + golden shapes
  REALITY_EVAL_SCENARIO_SET_KIND,
  REALITY_EVAL_SCENARIO_SET_SCHEMA_VERSION,
  REALITY_EVAL_OUTCOMES_KIND,
  REALITY_EVAL_OUTCOMES_SCHEMA_VERSION,
  validateRealityEvalScenarioSet,
  scenarioSetDigestOf,
} from "./model";
export type {
  RealityEvalCapability,
  ScenarioClass,
  ExpectedCanonicalOutcome,
  ExpectedOutcomeKind,
  ScenarioMetricThreshold,
  EvaluationCriteria,
  ProviderProfileReference,
  RealityEvalScenarioDescriptor,
  RealityEvalScenario,
  ScenarioValidationFailure,
  ScenarioValidationFailureKind,
  ScenarioValidation,
  ScenarioCompletionValidation,
  RealityEvalScenarioSet,
  ScenarioEvaluationProjection,
  RealityEvalGoldenOutcomes,
  ScenarioSetValidation,
} from "./model";

export {
  // harness identity
  REALITY_EVAL_HARNESS_CODE_VERSION,
  REALITY_EVAL_ENVIRONMENT,
  REALITY_EVAL_CONSUMER,
  // the entry point
  evaluateScenario,
  // canonical projections
  projectReconstructionScene,
  projectDepthGrid,
  // refusals
  SCENARIO_REFUSAL_KINDS,
} from "./harness";
export type {
  ScenarioRefusal,
  ScenarioRefusalKind,
  ScenarioEvaluation,
  ScenarioEvaluationOutcome,
  CriterionViolation,
  ProjectionIssue,
  CanonicalProjectionOutcome,
  ProjectedDepthGrid,
} from "./harness";

export {
  REALITY_EVAL_SERVICE_ERROR_CODES,
  RealityEvalServiceError,
  RealityEvalService,
  parseProfileRegisterRequest,
  parseProviderKeyRequest,
  parseScenarioEvaluateRequest,
  realityEvalEntrySummaryOf,
} from "./service";
export type {
  RealityEvalServiceErrorCode,
  ProfileRegisterRequest,
  ProviderKeyRequest,
  ScenarioEvaluateRequest,
  ScenarioEvaluateResponse,
  RealityEvalEntrySummary,
  ProfileRegisterResponse,
  RegistryQueryResponse,
} from "./service";

export { handleRealityEvalRequest, type RealityEvalRouteOptions } from "./router";
