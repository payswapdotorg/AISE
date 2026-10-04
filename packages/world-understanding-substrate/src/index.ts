/**
 * WORLD-P0-B — the world-understanding-substrate package root.
 *
 * The Understanding-layer substrate lane: provider-neutral typed adapter
 * contracts for the three Layer-2 substrate families — IFC
 * interpretation (IfcOpenShell semantics + the web-ifc browser-runtime
 * alternative, the GBIM-FT-001 recorded direction), exact geometry
 * (OCCT via OCP/CadQuery reference; engine-neutral contract) and
 * field/scientific data processing (ParaView/VTK). Each family
 * contract is proven implementable WITHOUT its substrate by in-memory
 * deterministic substitution doubles.
 *
 * THE FIVE PUBLIC FACES (package.json exports):
 *
 *   "."        → this root      — the lane statement, the control-plane
 *                                  profiles and every family surface;
 *   "./seam"   → src/seam.ts    — the shared law layer (the ten seam
 *                                  laws, the mapping block and its
 *                                  validator, the digest/label
 *                                  disciplines, the failure vocabulary);
 *   "./ifc"    → src/ifc/       — the IFC-interpretation family;
 *   "./geometry" → src/geometry/ — the exact-geometry family;
 *   "./field"  → src/field/     — the scientific-field family.
 *
 * THE SEAM LAWS (binding on every family, enforced by
 * `validateAiseMappingBlock` and drilled by the colocated test suites):
 *
 *   1. substrate ids are NAMESPACED EXTERNAL LABELS, never canonical
 *      AISE identity (ifc-guid / ifc-step-ref / ifc-class /
 *      occt-topology / vtk-dataobject);
 *   2. substrate-extracted values enter as INFERRED, never
 *      OBSERVED/CONFIRMED (uncertainty is never fabricated);
 *   3. unsupported is RECORDED, never computed (HFX-000 closed failure
 *      vocabulary, typed refusals, visible omissions);
 *   4. tolerances are DECLARED, never implicit (carried verbatim;
 *      near-boundary predicates answer within-tolerance);
 *   5. determinism: no network, no clock reads, no randomness, no I/O —
 *      identical requests produce byte-identical content-addressed
 *      results;
 *   6. no substrate is integrated in P0 — the real engines are future
 *      occupants of the ports these contracts prove (adoption gated on
 *      the license matrix recorded in the item's evidence set).
 */

/* The lane statement + the seam's law surface. */
export {
  UNDERSTANDING_SUBSTRATE_LANE_ID,
  UNDERSTANDING_LANE_STATEMENT,
  SUBSTRATE_FAMILIES,
  SUBSTRATE_METHOD_IDENTITIES,
  SUBSTRATE_EXTRACTION_EPISTEMIC_STATUS,
  EXTERNAL_LABEL_NAMESPACES,
  IFC_GUID_PATTERN,
  CANONICAL_DIGEST_PATTERN,
  MAPPING_VALIDATION_FAILURE_KINDS,
  isSubstrateFamily,
  isExternalLabelNamespace,
  isIfcGuidShaped,
  externalLabelValuesOf,
  isCanonicalDigest,
  canonicalDigestOf,
  textDigestOf,
  refused,
  providerDescriptorDigestOf,
  validateAiseMappingBlock,
  deepFreeze,
} from "./seam";
export type {
  SubstrateFamily,
  SubstrateMethodIdentity,
  ExternalLabelNamespace,
  NamespacedExternalLabel,
  SubstrateFailure,
  SubstrateOutcome,
  SubstrateProviderDescriptor,
  SubstrateResultProvenance,
  AiseMappingBlock,
  MappingValidationFailureKind,
  MappingValidationFailure,
  MappingValidation,
} from "./seam";

/* The IFC-interpretation family surface. */
export {
  IFC_REQUEST_KIND,
  IFC_REQUEST_SCHEMA_VERSION,
  IFC_RESULT_KIND,
  IFC_RESULT_SCHEMA_VERSION,
  IFC_SCHEMA_INTENTS,
  IFC_SOURCE_MEDIA_TYPE,
  IFC_SPATIAL_ROLES,
  IFC_RELATIONSHIP_KINDS,
  IFC_QUANTITY_KINDS,
  IFC_OMISSION_KINDS,
  IFC_REFERENCE_IMPLEMENTATION_NOTE,
  IFC_VALIDATION_FAILURE_KINDS,
  validateIfcInterpretationRequest,
  validateIfcExtractionResult,
  interpretThroughIfcPort,
  ifcDerivationParameters,
  ifcModelDigestOf,
  ifcProvenanceOf,
  ifcRefused,
  MINIMAL_IFC4_STEP_TEXT,
  MINIMAL_IFC4_EVIDENCE_CONTENT_ID,
  MINIMAL_IFC4_MODEL_UNITS,
  MINIMAL_IFC4_RECORDED_AT,
  FULL_INTENTS_REQUEST,
  SPATIAL_ONLY_REQUEST,
  NO_INTENTS_REQUEST,
  INTENT_MISMATCH_REQUEST,
  NOT_STEP_REQUEST,
  EXPECTED_SPATIAL_TREE,
  EXPECTED_ELEMENTS,
  EXPECTED_WALL_CLASSIFICATION,
  EXPECTED_WALL_PROPERTIES,
  EXPECTED_WALL_QUANTITIES,
  EXPECTED_RELATIONSHIP_COUNTS,
  EXPECTED_OMITTED_CLASSES,
  EXPECTED_SKIPPED_REPRESENTATION_COUNT,
  EXPECTED_SCHEMA_IDENTIFIER,
  REFERENCE_IFC_DOUBLE_DESCRIPTOR,
  ALTERNATE_IFC_DOUBLE_DESCRIPTOR,
  referenceIfcDouble,
  alternateIfcDouble,
  quantityUnitOf,
} from "./ifc";
export type {
  IfcSchemaIntent,
  IfcSpatialRole,
  IfcRelationshipKind,
  IfcQuantityKind,
  IfcOmissionKind,
  IfcModelSource,
  IfcExtractionIntents,
  IfcInterpretationRequest,
  IfcSpatialNodeRecord,
  IfcElementRecord,
  IfcPropertyRecord,
  IfcPropertySetRecord,
  IfcQuantityRecord,
  IfcQuantitySetRecord,
  IfcRelationshipRecord,
  IfcOmissionRecord,
  IfcExtractionResult,
  IfcValidationFailure,
  IfcValidationFailureKind,
  IfcRequestValidation,
  IfcResultValidation,
  IfcInterpretationProvider,
} from "./ifc";

/* The exact-geometry family surface. */
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
  REFERENCE_GEOMETRY_DOUBLE_DESCRIPTOR,
  ALTERNATE_GEOMETRY_DOUBLE_DESCRIPTOR,
  referenceGeometryDouble,
  alternateGeometryDouble,
  geometryQuantityUnitOf,
} from "./geometry";
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
} from "./geometry";

/* The scientific-field family surface. */
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
  REFERENCE_FIELD_DOUBLE_DESCRIPTOR,
  ALTERNATE_FIELD_DOUBLE_DESCRIPTOR,
  referenceFieldDouble,
  alternateFieldDouble,
  fieldQuantityUnitOf,
} from "./field";
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
} from "./field";

/* The control-plane profile surface (HFX-000, 15/15 mandatory fields). */
export {
  SUBSTRATE_LANE_ID,
  IFC_INTERPRETATION_CAPABILITY,
  EXACT_GEOMETRY_CAPABILITY,
  SCIENTIFIC_FIELD_CAPABILITY,
  referenceIfcProfile,
  alternateIfcProfile,
  referenceGeometryProfile,
  alternateGeometryProfile,
  referenceFieldProfile,
  alternateFieldProfile,
  SUBSTRATE_PROVIDER_PROFILES,
  SUBSTRATE_PROFILE_PROVIDER_IDS,
} from "./profiles";
