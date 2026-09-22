/**
 * PROD-029 — `backend/api/src/solution-eval/` public surface.
 *
 * The provider-neutral Layer-3 SUBSTITUTION-EVALUATION module: the
 * substitution harness (the HFX-301/302/303 entry point), the committed
 * fixture-substitute matrix, the thin HTTP transport adapter (the Tech Lead
 * mounts the router at the integration station) and the TEST-ONLY testkit.
 *
 * Consumers import from HERE only (the house module discipline):
 *
 *   - HFX-301/302/303 call `evaluateSubstitution` / `runSubstitutionMatrix`
 *     with their scenario + provider-registry event log;
 *   - the Tech Lead wires `handleSolutionEvalRequest` under
 *     `/v1/solution-eval/**`;
 *   - the tools/solution-eval benchmark consumes the committed golden of
 *     the matrix run.
 */

/* Model (types + pure validators + the canonical-boundary guard) --------- */

export {
  SUBSTITUTION_SEAMS,
  SEAM_CAPABILITIES,
  BASELINE_FIXTURE_IDS,
  SEAM_BASELINE_PAIRING,
  SOLUTION_EVAL_ERROR_CODES,
  SUBSTITUTION_SCENARIO_KIND,
  SUBSTITUTION_SCENARIO_SCHEMA_VERSION,
  SUBSTITUTION_EXPECTATIONS,
  COMPARISON_POINT_KINDS,
  DIVERGENCE_KIND_BY_POINT,
  SUBSTITUTION_REFUSAL_KINDS,
  SUBSTITUTION_VERDICTS,
  SolutionEvalError,
  isCanonicalDigest,
  projectCanonicalIntentSemantics,
  projectCanonicalQuantities,
  projectCanonicalValidationChecks,
  projectCanonicalBoqLines,
  projectCanonicalDigest,
  projectCanonicalVerdict,
  parseSubstitutionScenario,
  parseRegistryLogPayload,
} from "./model";
export type {
  SubstitutionSeam,
  BaselineFixtureId,
  SolutionEvalErrorCode,
  SubstituteReference,
  DeclaredExecution,
  SubstitutedRunDeclaration,
  SubstitutionScenario,
  SubstitutionExpectation,
  ComparisonPointKind,
  ComparisonPointResult,
  SubstitutionDivergence,
  SubstitutionRefusalKind,
  SubstitutionRefusal,
  SubstitutionVerdict,
  CanonicalParameter,
  CanonicalTarget,
  CanonicalDependency,
  CanonicalIntentSemantics,
  CanonicalQuantity,
  CanonicalValidationCheck,
  CanonicalBoqLine,
  ProjectionRefusal,
  ProjectionOutcome,
} from "./model";

/* Fixtures (the committed reference data) -------------------------------- */

export {
  WALL_UPGRADE_WORLD,
  CANONICAL_ENGINE_STEPS,
  CANONICAL_BASELINE_STATE_DIGEST,
  CANONICAL_VALIDATION,
  CANONICAL_BOQ_LINES,
  COMPILER_WORLD,
  COMPILER_CORPUS_SLICE,
  CANONICAL_COMPILER_SEMANTICS,
  SUBSTITUTE_PROVIDER_IDS,
  FAITHFUL_VERSION,
  DIVERGENT_VERSION,
  SOLUTION_EVAL_ENVIRONMENT,
  canonicalJsonText,
  canonicalRegistryLog,
  committedScenarioMatrix,
} from "./fixtures";
export type { EngineStepGolden } from "./fixtures";

/* Harness (the evaluation entry point) ----------------------------------- */

export { evaluateSubstitution, runSubstitutionMatrix, cellSummaryOf } from "./harness";
export type {
  SubstitutionEvaluation,
  MatrixCellSummary,
  MatrixRunResult,
} from "./harness";

/* Service + router (the thin transport adapter) -------------------------- */

export { SolutionEvalService, SUBSTITUTION_MATRIX_ID } from "./service";
export type {
  ScenarioValidateRequest,
  ScenarioValidateResponse,
  SubstitutionEvaluateRequest,
  SubstitutionEvaluateResponse,
  MatrixRunRequest,
  MatrixRunResponse,
} from "./service";
export { handleSolutionEvalRequest } from "./router";
export type { SolutionEvalRouteOptions } from "./router";
