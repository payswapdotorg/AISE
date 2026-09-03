/**
 * @aise/backend-geometry — the AISE-009 geometry measurement
 * primitives.
 *
 * Deterministic, engineering-grade measurement behind a clean
 * service boundary:
 *
 * - errors    — typed, fail-closed GeometryError (non-retryable by
 *               construction)
 * - units     — explicit length/angle units, exact conversion
 *               factors, fail-closed on mismatch
 * - uncertainty — value + unit + uncertainty/tolerance; confidence
 *               is structurally absent (never substituted)
 * - provenance — method + parameters + content-pinned inputs on
 *               every measurement and fit
 * - epistemic — fits are INFERRED, always; queries carry the
 *               weakest input state; upgrades fail closed
 * - numeric   — deterministic Jacobi eigensolver, pivoting linear
 *               solver, Kása + Gauss-Newton circle fit
 * - fitting   — plane (TLS-PCA + robust LMedS), cylinder
 *               (normal-nullspace axis + cross-section circle),
 *               residual statistics, first-order uncertainty
 *               propagation
 * - query     — point↔point / point↔line / point↔plane distances,
 *               line↔line / line↔plane / plane↔plane angles with
 *               pinned conventions
 * - fixtures  — golden geometric fixtures with ground truth and
 *               acceptance tolerances
 * - runtime   — service composition with bounded-compute defaults
 */
export { GeometryError, toGeometryError, type GeometryErrorCode, type GeometryErrorDetails } from "./errors.js";

export {
  assertAngleUnit,
  assertLengthUnit,
  angleToRadianFactor,
  convertAngle,
  convertLength,
  lengthToMeterFactor,
  requireSameUnit,
  type AngleUnit,
  type LengthUnit,
  type Unit,
} from "./units.js";

export {
  combineStandard,
  convertMeasurement,
  rssStandard,
  scaleStandard,
  scaleUncertaintyRecord,
  toStandardUncertainty,
  validateUncertainty,
  type ExpandedUncertainty,
  type Measurement,
  type StandardMeasurement,
  type StandardUncertainty,
  type Tolerance,
  type Uncertainty,
} from "./uncertainty.js";

export {
  EPISTEMIC_STATES,
  FIT_EPISTEMIC_STATE,
  assertFitEpistemicState,
  assertNoEpistemicUpgrade,
  assertSourceEpistemicState,
  assertValidEpistemicState,
  deriveQueryState,
  epistemicRank,
} from "./epistemic.js";

export {
  GEOMETRY_METHOD_VERSION,
  GEOMETRY_SERVICE_ID,
  measurementProvenance,
  provenanceContentHash,
  validateMeasurementProvenance,
  type EntityInputRef,
  type FitInputRef,
  type GeometryInputRef,
  type MeasurementProvenance,
  type PointSetInputRef,
} from "./provenance.js";

export {
  canonicalContentHash,
  canonicalJsonString,
  sha256Hex,
} from "./canonical.js";

export { DeterministicRng, NOISE_FIXTURE_SEED, ROBUST_SAMPLING_SEED } from "./seeded.js";

export {
  ZERO_VECTOR_EPS,
  assertFiniteNumber,
  assertNonNegativeNumber,
  assertPositiveInteger,
  assertPositiveNumber,
  canonicalizePointSet,
  compareGeomPoints,
  geomPointDistance,
  validateGeomPoint,
  vec3Add,
  vec3Cross,
  vec3Dot,
  vec3FixSign,
  vec3Norm,
  vec3Normalize,
  vec3Scale,
  vec3Sub,
  type GeomPoint,
  type Vec3,
} from "./validate.js";

export {
  eigensystemSymmetric3,
  solveLinear3,
  type Eigen3,
  type Matrix3,
  type Vec3N,
} from "./numeric/matrix.js";

export { MIN_CIRCLE_POINTS, fitCircle2, type Circle2, type Point2 } from "./numeric/circle.js";

export {
  MIN_STD_RESIDUALS,
  classifyInliers,
  computeResidualStats,
  lmedsScale,
  type ResidualStats,
} from "./fitting/residuals.js";

export {
  COLLINEARITY_RATIO,
  DEFAULT_INLIER_SCALE_MULTIPLIER,
  DEFAULT_MAX_PLANE_CANDIDATES,
  MIN_PLANE_POINTS,
  PLANE_FIT_METHOD,
  PLANE_ROBUST_FIT_METHOD,
  fitPlane,
  fitPlaneRobust,
  type FittedPlane,
  type FitPlaneInput,
  type PlaneFitResult,
  type PlaneFitUncertainty,
} from "./fitting/plane.js";

export {
  CYLINDER_FIT_METHOD,
  CYLINDER_ROBUST_FIT_METHOD,
  DEFAULT_AXIS_RATIO_THRESHOLD,
  DEFAULT_CYLINDER_INLIER_SCALE,
  DEFAULT_K_NEAREST,
  DEFAULT_MAX_AXIS_CANDIDATES,
  DEFAULT_MAX_CYLINDER_POINTS,
  DEFAULT_MAX_RMS_RESIDUAL_RATIO,
  DEFAULT_MIN_CROSS_NORM,
  MIN_CYLINDER_POINTS,
  fitCylinder,
  fitCylinderRobust,
  type CylinderFitResult,
  type CylinderFitUncertainty,
  type FitCylinderInput,
  type FitCylinderOptions,
  type FittedCylinder,
} from "./fitting/cylinder.js";

export {
  defineLine,
  definePlane,
  definePoint,
  type EntityOptions,
  type GeometryEntity,
  type LineEntity,
  type PlaneEntity,
  type PointEntity,
} from "./query/entities.js";

export {
  distancePointToLine,
  distancePointToPlane,
  distancePointToPoint,
  signedDistancePointToPlane,
} from "./query/distance.js";

export {
  angleLineToLine,
  angleLineToPlane,
  anglePlaneToPlane,
} from "./query/angle.js";

export {
  CYLINDER_EXACT_ACCEPTANCE,
  CYLINDER_NOISY_ACCEPTANCE,
  CYLINDER_OUTLIER_ACCEPTANCE,
  PLANE_EXACT_ACCEPTANCE,
  PLANE_NOISY_ACCEPTANCE,
  angleFixtures,
  cylinderGroundTruth,
  cylinderWithOutliers,
  exactCylinderPoints,
  exactPlanePoints,
  knownDistancePairs,
  noisyCylinderPoints,
  noisyPlanePoints,
  planeGroundTruth,
  planeNormalGroundTruth,
  pointLineDistanceFixtures,
  pointPlaneDistanceFixtures,
  type Acceptance,
  type AngleFixture,
  type CylinderGroundTruth,
  type GoldenFixture,
  type KnownDistancePair,
  type PlaneGroundTruth,
  type PointLineDistanceFixture,
  type PointPlaneDistanceFixture,
} from "./fixtures/golden.js";

export {
  buildGeometryService,
  type BuildGeometryServiceOptions,
  type GeometryService,
} from "./runtime.js";
