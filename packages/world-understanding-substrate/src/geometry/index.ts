/**
 * WORLD-P0-B — the GEOMETRY family public surface (`src/geometry/`).
 *
 * The provider-neutral exact-geometry port (contract), the committed
 * deterministic fixture corpus (declared shapes + hand-computed exact
 * facts) and the two in-memory substitution doubles (direct closed-form
 * coordinate-expression kernels and a generic vector-kernel
 * decomposition — no OCCT, no OCP, no CadQuery).
 */

export {
  GEOMETRY_REQUEST_KIND,
  GEOMETRY_REQUEST_SCHEMA_VERSION,
  GEOMETRY_RESULT_KIND,
  GEOMETRY_RESULT_SCHEMA_VERSION,
  GEOMETRY_SHAPE_KINDS,
  GEOMETRY_OPERATION_KINDS,
  GEOMETRY_QUANTITY_KINDS,
  GEOMETRY_REFERENCE_IMPLEMENTATION_NOTE,
  GEOMETRY_VALIDATION_FAILURE_KINDS,
  validateGeometryComputationRequest,
  validateGeometryComputationResult,
  computeThroughGeometryPort,
  geometryDerivationParameters,
  geometryModelDigestOf,
  geometryProvenanceOf,
  geometryRefused,
} from "./contract";
export type {
  GeometryShapeKind,
  GeometryOperationKind,
  GeometryQuantityKind,
  GeometryPoint3,
  GeometryToleranceDeclaration,
  GeometryUnitDeclaration,
  GeometryShapeDeclaration,
  GeometryOperation,
  GeometryComputationRequest,
  GeometryMeasurementRecord,
  GeometryPredicateRecord,
  GeometryComputationResult,
  GeometryValidationFailure,
  GeometryValidationFailureKind,
  GeometryRequestValidation,
  GeometryResultValidation,
  GeometryComputationProvider,
} from "./contract";

export {
  GEOMETRY_FIXTURE_SUBJECT_REF,
  GEOMETRY_FIXTURE_EVIDENCE_CONTENT_ID,
  GEOMETRY_FIXTURE_RECORDED_AT,
  GEOMETRY_FIXTURE_TOLERANCE,
  GEOMETRY_FIXTURE_UNITS,
  GEOMETRY_FIXTURE_SHAPES,
  FULL_GEOMETRY_REQUEST,
  MEASUREMENTS_ONLY_REQUEST,
  PREDICATES_ONLY_REQUEST,
  NO_OPERATIONS_REQUEST,
  EXPECTED_DISTANCE_POINT_POINT,
  EXPECTED_DISTANCE_POINT_SEGMENT,
  EXPECTED_SEGMENT_LENGTH,
  EXPECTED_POLYGON_AREA,
  EXPECTED_BOX_VOLUME,
  EXPECTED_INSIDE_VERDICT,
  EXPECTED_NEAR_BOUNDARY_VERDICT,
  EXPECTED_OUTSIDE_VERDICT,
  EXPECTED_INSIDE_SIGNED_DISTANCE,
  NEAR_BOUNDARY_POINT_X,
  NEAR_BOUNDARY_POLYGON_EDGE_X,
  EXPECTED_TOLERANCE_BAND,
} from "./corpus";

export {
  REFERENCE_GEOMETRY_DOUBLE_DESCRIPTOR,
  ALTERNATE_GEOMETRY_DOUBLE_DESCRIPTOR,
  referenceGeometryDouble,
  alternateGeometryDouble,
  geometryQuantityUnitOf,
} from "./doubles";
