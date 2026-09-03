/**
 * @aise/engineering-model — the AISE-011 Reality Graph core.
 *
 * The canonical engineering-model authority (architecture-lock
 * §1): project/space/object/geometry/property/relationship
 * representation where `RealityObject` is the central abstraction
 * and geometry, topology, properties, evidence/provenance
 * references, epistemic state, uncertainty, relationships and
 * stable identities are all represented — without ever collapsing
 * inference into truth.
 *
 * Module map:
 * - errors      — typed, fail-closed EngineeringModelError
 * - canonical   — canonical JSON + SHA-256 content pinning
 * - epistemic   — the four epistemic states, no-upgrade guard,
 *                 weakest-link derivation, presence vocabulary
 * - quantities  — canonical units, uncertainty (standard /
 *                 expanded / tolerance), the estimate↔measurement
 *                 distinction
 * - assertions  — property assertions: value+unit+status+
 *                 confidence?+uncertainty?+evidence+method+
 *                 verified-by, with every architecture rule
 *                 enforced at construction
 * - geometry    — structured planar geometry + content-pinned
 *                 asset references
 * - provenance  — lineage records (method + parameters +
 *                 content-pinned inputs) for every derived entity
 * - identity    — deterministic object/relation identity and
 *                 deep-freeze immutability
 * - model       — the graph itself: spaces, objects,
 *                 relationships, fail-closed assembly
 * - version     — version metadata records and honest diffs
 *                 (no correspondence claims)
 * - validate    — whole-graph validation for the persistence
 *                 boundary (the store does not trust the caller)
 * - query       — derived read views (never stored)
 *
 * The package is deliberately dependency-minimal: it depends only
 * on `@aise/shared-contracts` (the cross-platform vocabulary).
 * Backend services adapt INTO this vocabulary at their
 * boundaries; the model never imports backend service packages.
 */
export {
  EngineeringModelError,
  toEngineeringModelError,
  type EngineeringErrorDetails,
  type ModelErrorCode,
} from "./errors.js";

export {
  canonicalJsonString,
  canonicalContentHash,
  sha256Hex,
} from "./canonical.js";

export {
  EPISTEMIC_STATES,
  MODEL_PRESENCE_STATES,
  assertNoEpistemicUpgrade,
  assertValidEpistemicState,
  assertValidPresence,
  deriveWeakestState,
  epistemicRank,
  type EpistemicState,
  type ModelPresence,
  type ObservationPresence,
} from "./epistemic.js";

export {
  assertSameUnitFamily,
  assertValidUnit,
  quantityMayBeMeasurement,
  unitFamily,
  validateQuantity,
  validateUncertainty,
  type ExpandedUncertainty,
  type MeasurementKind,
  type ModelAngleUnit,
  type ModelAreaUnit,
  type ModelLengthUnit,
  type ModelUncertainty,
  type ModelUnit,
  type Quantity,
  type StandardUncertainty,
  type Tolerance,
  type UnitFamily,
} from "./quantities.js";

export {
  propertyAssertion,
  type PropertyAssertion,
  type PropertyAssertionInput,
} from "./assertions.js";

export {
  geometryAssetRef,
  structuredPlanarGeometry,
  type GeometryAssetRef,
  type GeometryQualityMetrics,
  type PlaneFrame,
  type PlaneRectangle,
  type Point3,
  type StructuredPlanarGeometry,
  type StructuredPlanarGeometryInput,
  type Vec3,
} from "./geometry.js";

export {
  MODEL_METHOD_VERSION,
  MODEL_SERVICE_ID,
  modelProvenance,
  parametersHash,
  validateModelProvenance,
  type ModelInputRef,
  type ModelProvenance,
  type ObjectInputRef,
  type PointSetInputRef,
  type SceneInputRef,
} from "./provenance.js";

export {
  deepFreeze,
  deriveObjectId,
  deriveRelationId,
  type ObjectIdentityInput,
} from "./identity.js";

export {
  assembleModelGraph,
  graphContentDigest,
  graphEpistemicState,
  makeRelationship,
  makeRealityObject,
  makeSpaceNode,
  type AssembleModelGraphInput,
  type ModelGeometry,
  type RealityModelGraph,
  type RealityObject,
  type RealityObjectClass,
  type RealityObjectInput,
  type Relationship,
  type RelationshipInput,
  type RelationshipType,
  type SpaceCoordinateFrame,
  type SpaceKind,
  type SpaceNode,
  type SpaceNodeInput,
} from "./model.js";

export {
  diffModelGraphs,
  epistemicChangesBetween,
  type ChangedObject,
  type EpistemicChange,
  type ModelVersionDiff,
  type ModelVersionRecord,
} from "./version.js";

export { validateRealityGraph } from "./validate.js";

export {
  containingSpacesOf,
  graphCounts,
  modelEpistemicSummary,
  objectsInSpace,
  objectsOfClass,
  openingsOfWall,
  parentWallOf,
  relationshipsOf,
  spaceAncestry,
  toModelObjectRef,
  type RelationshipView,
} from "./query.js";
