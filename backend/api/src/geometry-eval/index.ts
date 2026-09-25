/**
 * HFX-302 — `backend/api/src/geometry-eval/` public surface.
 *
 * The governed Layer-3 GEOMETRY/VALIDATION TECHNOLOGY SUBSTITUTION
 * benchmark: the provider-neutral adapter surface (the seam two
 * implementations consume the same canonical operation sequence through),
 * the reference oracle (the canonical engine, wrapped) + the independent
 * discretized reimplementation (the substitute candidate, three committed
 * profiles), the committed corpus (30 sequences across the three-cell
 * behavior matrix), the deterministic dual-lane harness with the
 * declared-tolerance comparison, the control-plane wiring (records +
 * manifests for BOTH lanes), the TEST-ONLY testkit (the doubles, the
 * mutation twins, the golden builders, the historical replay and the
 * registry lifecycle) and the regeneration CLI.
 *
 * Consumers import from HERE only (the house module discipline):
 *
 *   - the backend golden test + the module tests prove the live corpus
 *     against the committed artifacts byte-for-byte;
 *   - the tools/geometry-eval benchmark runner consumes the COMMITTED
 *     ARTIFACTS as data (the workspace boundary matrix forbids tools →
 *     packages/backend imports);
 *   - an external geometry/constraint technology later slots into the
 *     `GeometryProvider` port and faces the identical canonical
 *     projections and declared-tolerance comparisons.
 */

/* Model (types + vocabularies + the tolerance calculus + pure validators). */
export {
  GEOMETRY_EVAL_ERROR_CODES,
  GEOMETRY_IMPLEMENTATION_KINDS,
  GEOMETRY_COMPARISON_POINTS,
  GEOMETRY_DIVERGENCE_KIND_BY_POINT,
  SUBSTITUTION_EXPECTATIONS,
  TOLERANCE_DIMENSIONS,
  TOLERANCE_MODEL_VERSION,
  TOPOLOGY_CONSTRAINT_KINDS,
  GeometryEvalError,
  evaluateQuantityTolerance,
  isSubstitutionExpectation,
  projectCanonicalTopologyConstraints,
  toleranceFor,
  validateGeometryProviderDescriptor,
  validateSubstitutionSequence,
} from "./model";
export type {
  CanonicalTopologyConstraint,
  GeometryComparisonPointKind,
  GeometryEvalErrorCode,
  GeometryImplementationKind,
  GeometryProviderDescriptor,
  GeometryResolution,
  GeometryScene,
  NeutralDependency,
  NeutralOperation,
  NeutralParameter,
  ProjectionOutcome,
  ProjectionRefusal,
  ProviderDescriptorValidation,
  ProviderDescriptorValidationFailure,
  QuantityTolerance,
  SequenceValidation,
  SequenceValidationFailure,
  SubstitutionExpectation,
  SubstitutionSequence,
  ToleranceDimension,
  ToleranceEvaluation,
  TopologyConstraintKind,
} from "./model";

/* The provider-neutral adapter surface (the substitution seam). */
export {
  executeSequence,
} from "./adapter";
export type {
  BoqDerivationInput,
  GeometryExecutionInput,
  GeometryExecutionOutput,
  GeometryProvider,
  LaneProjection,
  ProviderExecutionOutcome,
} from "./adapter";

/* The reference oracle lane (the canonical engine, wrapped). */
export {
  REFERENCE_PROVIDER,
  REFERENCE_PROVIDER_DESCRIPTOR,
  referenceTopologyOf,
} from "./reference";

/* The independent reimplementation lane (the substitute candidate). */
export {
  COARSE_SUBSTITUTE_PROFILE,
  COARSE_SUBSTITUTE_PROVIDER,
  FINE_SUBSTITUTE_PROVIDER,
  RESTRICTED_SUBSTITUTE_PROVIDER,
  SUBSTITUTE_BLOCK_MODULE_HEIGHT,
  SUBSTITUTE_BLOCK_MODULE_LENGTH,
  SUBSTITUTE_ENGINE_KIND,
  coveringModuleCount,
  discretizedCellCount,
  substituteProviderForProfile,
  substituteProviderOf,
  substituteTopologyOf,
  substituteValidationChecksOf,
} from "./substitute";

/* The corpus (the committed sequences + the scene). */
export {
  COMMITTED_PROFILE_IDS,
  COMMITTED_SCENE_IDS,
  GEOMETRY_CORPUS,
  GEOMETRY_SCENE,
  GEOMETRY_SCENES,
  OPERATION_FAMILY_VOCABULARY,
  geometryCorpus,
  geometrySceneOf,
  geometrySequenceIds,
  geometrySequenceOf,
} from "./corpus";

/* Registry wiring (the lane profiles + the pinned identities). */
export {
  GEOMETRY_EVAL_BENCHMARK_ID,
  GEOMETRY_EVAL_CODE_VERSION,
  GEOMETRY_EVAL_CONSUMER,
  GEOMETRY_EVAL_DECLARED_RESOURCES,
  GEOMETRY_EVAL_ENGINE_CODE_VERSION,
  GEOMETRY_EVAL_ENGINE_KIND,
  GEOMETRY_EVAL_ENVIRONMENT,
  GEOMETRY_EVAL_SUITE_ID,
  GEOMETRY_EVAL_SUITE_VERSION,
  GEOMETRY_EVAL_TOLERANCE_MODEL_VERSION,
  GEOMETRY_SUBSTITUTION_CAPABILITY,
  REFERENCE_EXACT_TOLERANCES,
  REFERENCE_LANE_KIND,
  REFERENCE_LANE_PROVIDER_ID,
  REFERENCE_LANE_TECHNOLOGY_VERSION,
  RESTRICTED_PROFILE_OMITTED_FAMILIES,
  SUBSTITUTE_DECLARED_TOLERANCES,
  SUBSTITUTE_IMPLEMENTATION_VERSION,
  SUBSTITUTE_PROFILE_IDS,
  SUBSTITUTE_TECHNOLOGY_VERSION,
  referenceLaneDescriptor,
  referenceLaneProfile,
  substituteLaneDescriptor,
  substituteLaneProfile,
  substituteProfileDescriptorOf,
} from "./registry";
export type { SubstituteProfileId } from "./registry";

/* Harness (the dual-lane executor + the declared-tolerance comparison). */
export { evaluateSubstitutionSequence, referenceProjectionDigestOf } from "./harness";
export type {
  BoqResolverSeam,
  GeometryComparison,
  GeometryComparisonPoint,
  GeometryDivergence,
  GeometryHarnessDoubles,
  ResolvedBoq,
  SubstitutionLaneRecord,
  SubstitutionSequenceOutcome,
} from "./harness";

/* Testkit (the deterministic doubles + the suite runner + the twins + the goldens). */
export {
  OUTCOMES_PATH,
  SCENARIO_PATH,
  boundarySmuggleTwin,
  capabilitySabotageDescriptor,
  doublesWithSubstitute,
  driveGeometryRegistryLifecycle,
  geometryCorpusDigest,
  geometryHarnessDoubles,
  geometryOutcomeViewOf,
  goldenCorpusSuiteJson,
  goldenOutcomesJson,
  replayHistoricalRecords,
  runGeometrySuite,
  toleranceBreachTwin,
  verdictMutationTwin,
} from "./testkit";
export type {
  GeometryOutcomeView,
  GeometryRegistryLifecycleResult,
  GeometrySuiteRun,
  GeometrySuiteSummary,
  HistoricalReplayResult,
} from "./testkit";
