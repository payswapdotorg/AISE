/**
 * WORLD-P0-B — the IFC family public surface (`src/ifc/`).
 *
 * The provider-neutral IFC-interpretation port (contract), the committed
 * deterministic IFC4 STEP corpus (fixtures + expected facts) and the two
 * in-memory substitution doubles (independent statement-scanning and
 * character-tokenizing parsers — no IfcOpenShell, no web-ifc).
 */

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
} from "./contract";
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
} from "./contract";

export {
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
} from "./corpus";

export {
  REFERENCE_IFC_DOUBLE_DESCRIPTOR,
  ALTERNATE_IFC_DOUBLE_DESCRIPTOR,
  referenceIfcDouble,
  alternateIfcDouble,
  quantityUnitOf,
} from "./doubles";
