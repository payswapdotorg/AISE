/**
 * AISE-013 — deterministic geometry and measurement primitives.
 *
 * Package-internal computational library (no router/server surface): the
 * primitives consumed by architectural semantics (015), the Reality Graph
 * (016), 2D projections (020) and the WorldSculpt transform/metric-scale
 * gate duty (docs/worldsculpt-integration-strategy.md § AISE-013).
 *
 * DETERMINISM CONTRACT — every exported function is pure: no I/O, no
 * clock, no randomness, no input mutation. All computations run in a fixed
 * operation order over IEEE 754 doubles, so identical input BITS on the
 * same platform produce identical output bits (float addition is order
 * sensitive — point order is part of the input; permutation effects are
 * bounded and tested at 1e-12 relative in the fitting tests). Degeneracies
 * fail TYPED (GeometryError codes), never silently.
 *
 * UNCERTAINTY DISCIPLINE (architecture-lock "Truth and uncertainty"):
 * measurements carry physical 1σ uncertainties propagated first-order
 * (uncertainty.ts). Confidence — support for a belief — is a different
 * quantity and does not exist anywhere in this module's API; unknown σ is
 * null and stays null (never 0). Mutation/discrimination tests pin all of
 * this.
 */

export {
  GeometryError,
  GEOMETRY_ERROR_CODES,
  isGeometryError,
  type GeometryErrorCode,
} from "./errors";

export {
  // types
  type Mat3,
  type Mat4,
  type Vec3,
  // vector functions
  vec,
  vecAdd,
  vecSub,
  vecScale,
  vecDot,
  vecCross,
  vecNorm,
  vecNormalize,
  canonicalAxisSign,
  canonicalZero,
  // matrix functions
  mat3Identity,
  mat3Multiply,
  mat3Apply,
  mat3Transpose,
  mat3Determinant,
  mat3FromColumns,
  mat3Column,
  mat4Identity,
  mat4Translation,
  mat4FromBasisTranslation,
  mat4Multiply,
  mat4ApplyPoint,
  mat4RotationX,
  mat4RotationY,
  mat4RotationZ,
  mat4RotationAxisAngle,
  lookAtBasis,
  ZERO_NORM_TOLERANCE,
} from "./vector";

export {
  symmetricEigen3,
  EIGENVECTOR_PARALLELISM_EPS,
  type SymmetricEigen,
} from "./eigen";

export {
  fitPlane,
  fitLine,
  COINCIDENT_TOLERANCE,
  COLLINEARITY_RATIO_TOLERANCE,
  type Line,
  type LineFitResult,
  type Plane,
  type PlaneFitResult,
} from "./fitting";

export {
  propagateUncertainty,
  type Measurement,
} from "./uncertainty";

export {
  angleBetween,
  angleBetweenPlanes,
  dimensionBetweenParallelPlanes,
  distancePointPlane,
  distancePointPoint,
  PARALLEL_ANGLE_TOLERANCE_RAD,
  type PointPlaneDistance,
} from "./measure";

export {
  applyTransform,
  validateMetricTransform,
  DEFAULT_MAX_SHEAR_SIN,
  DEFAULT_SCALE_UNIFORMITY_TOLERANCE,
  NON_AFFINE_TOLERANCE,
  SINGULAR_DETERMINANT_TOLERANCE,
  TRANSFORM_ISSUE_CODES,
  type MetricTransformReference,
  type TransformIssue,
  type TransformIssueCode,
  type TransformMeasurement,
  type TransformValidation,
} from "./transform";
