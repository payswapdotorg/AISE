/**
 * @aise/backend-semantics — the AISE-010 architectural object
 * extraction.
 *
 * Deterministic, engineering-grade recognition of walls, floors,
 * ceilings, doors, and windows from reconstructed point clouds,
 * behind a clean service boundary:
 *
 * - errors      — typed, fail-closed SemanticsError (wrapped
 *                 AISE-009 causes preserved; non-retryable by
 *                 construction)
 * - validate    — finite-value discipline, unit vocabulary, up-axis
 *                 normalization (SemanticsError at the boundary)
 * - epistemic   — recognition is inference: objects never outrank
 *                 INFERRED; the scene is the weakest of its inputs
 * - provenance  — method + parameters + content-pinned inputs on
 *                 every object and the scene (child → parent wall
 *                 lineage for openings)
 * - segmentation — deterministic sequential plane-RANSAC over the
 *                 AISE-009 TLS fits (local seeded candidates,
 *                 strided scoring, bounded refinement)
 * - classify    — floor/ceiling by scene-level elevation ordering,
 *                 walls by tilt; unclassifiable clusters reported
 *                 with reasons
 * - structure   — oriented rectangles in deterministic in-plane
 *                 frames, dimensions/area with first-order
 *                 uncertainty
 * - openings    — grid coverage-gap detection; doors by floor
 *                 contact, windows by sill; unclassified gaps
 *                 reported with reasons
 * - objects     — content-derived deterministic identities,
 *                 constructor-side provenance/epistemic/no-confidence
 *                 gates
 * - scene       — orchestration, consistency guards (impossible
 *                 architecture fails closed), room summary
 * - fixtures    — golden room scenes with ground truth and
 *                 acceptance tolerances
 * - runtime     — service composition with bounded-compute defaults
 */
export { SemanticsError, toSemanticsError, wrapGeometryFailure, type SemanticsErrorCode, type SemanticsErrorDetails, type ErrorCauseRecord } from "./errors.js";

export {
  EPISTEMIC_STATES,
  EXTRACTION_EPISTEMIC_STATE,
  assertExtractionMaxRank,
  assertNoEpistemicUpgrade,
  assertSourceEpistemicState,
  assertValidEpistemicState,
  deriveCompositeState,
  deriveExtractionState,
  epistemicRank,
} from "./epistemic.js";

export {
  SEMANTICS_SERVICE_ID,
  SEMANTICS_METHOD_VERSION,
  extractionProvenance,
  pointSetInputRef,
  provenanceContentHash,
  validateExtractionProvenance,
  type ExtractionProvenance,
  type ObjectInputRef,
  type PointSetInputRef,
  type SemanticInputRef,
} from "./provenance.js";

export {
  assertFiniteNumber,
  assertLengthUnit,
  assertNonNegativeNumber,
  assertPositiveInteger,
  assertPositiveNumber,
  normalizeUpAxis,
} from "./validate.js";

export {
  DEFAULT_INLIER_DISTANCE,
  DEFAULT_MAX_PLANE_CANDIDATES,
  DEFAULT_MAX_SEGMENTS,
  DEFAULT_MAX_SEGMENT_POINTS,
  DEFAULT_MAX_SEGMENTATION_POINTS,
  DEFAULT_MIN_CLUSTER_POINTS,
  DEFAULT_NEIGHBORHOOD_SIZE,
  DEFAULT_REFINEMENT_ROUNDS,
  SEGMENTATION_METHOD,
  SEGMENTATION_SEED,
  segmentPointCloud,
  segmentationSettings,
  type PlanarCluster,
  type SegmentationInput,
  type SegmentationOptions,
  type SegmentationResult,
  type SegmentationSettings,
} from "./segmentation.js";

export {
  DEFAULT_MIN_FLOOR_CEILING_SEPARATION,
  DEFAULT_MIN_HORIZONTAL_EXTENT,
  DEFAULT_MIN_WALL_EXTENT,
  DEFAULT_TILT_TOLERANCE_DEG,
  HORIZONTAL_CLASSIFY_METHOD,
  WALL_CLASSIFY_METHOD,
  classifyClusters,
  classificationSettings,
  type ClassifiedCluster,
  type ClassificationOptions,
  type ClassificationSettings,
  type ClusterOrientation,
  type ClusterRole,
} from "./classify.js";

export {
  DEFAULT_DOOR_FLOOR_TOLERANCE,
  DEFAULT_DOOR_MAX_HEIGHT,
  DEFAULT_DOOR_MIN_HEIGHT,
  DEFAULT_GRID_RESOLUTION,
  DEFAULT_MAX_GRID_CELLS,
  DEFAULT_MIN_OPENING_AREA,
  DEFAULT_MIN_OPENING_HEIGHT,
  DEFAULT_MIN_OPENING_WIDTH,
  DEFAULT_RECTANGULARITY_THRESHOLD,
  DEFAULT_WINDOW_MIN_SILL,
  OPENING_METHOD,
  findWallOpenings,
  openingSettings,
  type GapMetrics,
  type GapRectangle,
  type OpeningOptions,
  type OpeningRecord,
  type OpeningSettings,
  type UnclassifiedGap,
  type WallContext,
  type WallOpenings,
} from "./openings.js";

export {
  buildHorizontalFrame,
  buildWallFrame,
  rectangleInFrame,
  squareUnitOf,
  type AreaMeasurement,
  type AreaUnit,
  type PlaneFrame,
  type PlaneRectangle,
  type StructuredRectangle,
} from "./structure.js";

export {
  assembleScene,
  compareObjects,
  makeOpeningObject,
  makeSurfaceObject,
  type ArchitecturalObject,
  type ArchitecturalScene,
  type ObjectKind,
  type ObjectQualityMetrics,
  type OpeningObjectInput,
  type SceneAssemblyInput,
  type SurfaceObjectInput,
  type UnclassifiedSegment,
} from "./objects.js";

export {
  DEFAULT_UP,
  SCENE_METHOD,
  extractArchitecturalScene,
  type ExtractionOptions,
  type SceneInput,
} from "./scene.js";

export {
  buildSemanticsService,
  type BuildSemanticsServiceOptions,
  type SemanticsService,
} from "./runtime.js";
