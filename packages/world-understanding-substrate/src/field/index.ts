/**
 * WORLD-P0-B — the FIELD family public surface (`src/field/`).
 *
 * The provider-neutral scientific-field port (contract), the committed
 * deterministic fixture corpus (a 3x3 structured grid with scalar and
 * vector sample tables + hand-computed exact facts) and the two
 * in-memory substitution doubles (direct closed-form discrete kernels
 * and a generic array-kernel decomposition — no ParaView, no VTK).
 */

export {
  FIELD_REQUEST_KIND,
  FIELD_REQUEST_SCHEMA_VERSION,
  FIELD_RESULT_KIND,
  FIELD_RESULT_SCHEMA_VERSION,
  FIELD_OPERATION_KINDS,
  FIELD_QUANTITY_KINDS,
  FIELD_REFERENCE_IMPLEMENTATION_NOTE,
  FIELD_VALIDATION_FAILURE_KINDS,
  validateFieldComputationRequest,
  validateFieldComputationResult,
  computeThroughFieldPort,
  fieldDerivationParameters,
  fieldModelDigestOf,
  fieldProvenanceOf,
  fieldRefused,
} from "./contract";
export type {
  FieldOperationKind,
  FieldQuantityKind,
  FieldPoint2,
  FieldVector2,
  FieldGridDeclaration,
  ScalarFieldDeclaration,
  VectorFieldDeclaration,
  FieldToleranceDeclaration,
  FieldUnitDeclaration,
  FieldOperation,
  FieldComputationRequest,
  FieldMeasurementRecord,
  FieldPredicateRecord,
  FieldComputationResult,
  FieldValidationFailure,
  FieldValidationFailureKind,
  FieldRequestValidation,
  FieldResultValidation,
  FieldComputationProvider,
} from "./contract";

export {
  FIELD_FIXTURE_SUBJECT_REF,
  FIELD_FIXTURE_EVIDENCE_CONTENT_ID,
  FIELD_FIXTURE_RECORDED_AT,
  FIELD_FIXTURE_TOLERANCE,
  FIELD_FIXTURE_UNITS,
  FIELD_FIXTURE_GRID,
  FIELD_FIXTURE_SCALAR_FIELD,
  FIELD_FIXTURE_VECTOR_FIELD,
  FIELD_FIXTURE_MAGNITUDE_NODE,
  FIELD_FIXTURE_DIVERGENCE_NODE,
  FULL_FIELD_REQUEST,
  MEASUREMENTS_ONLY_FIELD_REQUEST,
  PREDICATES_ONLY_FIELD_REQUEST,
  NO_FIELD_OPERATIONS_REQUEST,
  EXPECTED_FIELD_EXTENT,
  EXPECTED_FIELD_MEAN,
  EXPECTED_FIELD_NORM_L1,
  EXPECTED_FIELD_VECTOR_MAGNITUDE,
  EXPECTED_FIELD_DIVERGENCE,
  EXPECTED_FIELD_INTEGRAL,
  EXPECTED_ABOVE_VERDICT,
  EXPECTED_NEAR_THRESHOLD_VERDICT,
  EXPECTED_BELOW_VERDICT,
  EXPECTED_ABOVE_SIGNED_MARGIN,
  EXPECTED_BELOW_SIGNED_MARGIN,
  NEAR_THRESHOLD_NODE_VALUE,
  NEAR_THRESHOLD_DECLARED,
  EXPECTED_FIELD_TOLERANCE_BAND,
  FIELD_FIXTURE_NODE_OF,
} from "./corpus";

export {
  REFERENCE_FIELD_DOUBLE_DESCRIPTOR,
  ALTERNATE_FIELD_DOUBLE_DESCRIPTOR,
  referenceFieldDouble,
  alternateFieldDouble,
  fieldQuantityUnitOf,
} from "./doubles";
