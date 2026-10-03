/**
 * @aise/world-reality-substrate — the WORLD-P0-A public surface.
 *
 * The Layer-1 reality substrate contracts: five typed adapter lanes
 * (Babylon scene runtime, CesiumJS geospatial context, OpenUSD composition
 * semantics, glTF/GLB runtime delivery, Assimp-format ingest), the closed
 * five-kind substrate failure vocabulary, opaque substrate handles with
 * provider-id quarantine, the REAL fail-closed glTF 2.0/GLB v2 parser and
 * validator with the byte-identical canonical extraction rule, the AISE
 * scene-composition types, the real WGS84 ellipsoid mathematics, and the
 * shared six-check lane-conformance harness.
 *
 * Substitution law (spec/technology-substitution-contract.md): substrates
 * are implementation components, never AISE authorities — no substrate
 * type or id crosses the canonical boundary. External technology is never
 * canonical truth.
 */

export {
  SUBSTRATE_FAILURE_KINDS,
  SUBSTRATE_FAILURE_VOCABULARY,
  isSubstrateFailureKind,
  malformedInput,
  unsupportedFormat,
  contractMismatch,
  capabilityUnavailable,
  resourceLimitExceeded,
  failClosed,
  thrownMessage,
} from "./outcome";
export type {
  SubstrateFailureKind,
  SubstrateFailureDefinition,
  SubstrateFailure,
  SubstrateOutcome,
} from "./outcome";

export {
  SUBSTRATE_LANES,
  CANONICAL_ID_PREFIX,
  SUBSTRATE_HANDLE_PREFIX,
  isSubstrateLane,
  mintSubstrateHandle,
  parseSubstrateHandle,
  isSubstrateHandle,
  handleBelongsToLane,
  isCanonicalAiseId,
  quarantineCanonicalId,
  quarantineProviderRef,
  digestHex,
} from "./identity";
export type { SubstrateLane, ParsedSubstrateHandle } from "./identity";

export {
  contractCanonicalJson,
  contractDigest,
  capabilityIds,
  runLaneConformance,
} from "./conformance";
export type {
  CapabilityOwner,
  CapabilityStatement,
  SubstrateLaneContract,
  SubstrateProvenance,
  SubstrateArtifact,
  CapabilityExercise,
  LaneConformanceSubject,
  ConformanceCheckResult,
  LaneConformanceReport,
} from "./conformance";

export {
  GLB_LIMITS,
  GLB_MAGIC,
  GLB_VERSION,
  GLB_CHUNK_TYPE_JSON,
  GLB_CHUNK_TYPE_BIN,
  parseGlb,
  encodeGlb,
  extractCanonicalGeometry,
  buildCanonicalGlb,
  canonicalGltfDocument,
  GLB_CONTAINER_ISSUE_CODES,
  GLB_CONTAINER_ISSUE_KIND,
} from "./glb";
export type { GlbIssueCode, GlbContainerInfo, ParsedGlb, CanonicalExtraction, CanonicalPrimitiveExtraction } from "./glb";

export {
  GLTF_DOCUMENT_ISSUE_CODES,
  GLTF_DOCUMENT_ISSUE_KIND,
  GLTF_ACCESSOR_TYPES,
  GLTF_COMPONENT_TYPES,
  GLTF_INDEX_COMPONENT_TYPES,
  GLTF_PRIMITIVE_MODES,
  COMPONENT_SIZE,
  COMPONENT_COUNT,
  SUPPORTED_REQUIRED_EXTENSIONS,
  validateGltfDocument,
} from "./gltf";
export type {
  GltfDocumentIssueCode,
  GltfAccessorType,
  GltfComponentType,
  GltfAccessor,
  GltfBufferView,
  GltfBuffer,
  GltfPrimitive,
  GltfMesh,
  GltfNode,
  GltfScene,
  GltfDocument,
  ContainerFacts,
  GltfIssue,
} from "./gltf";

export {
  composeSceneSpec,
  composedCanonicalJson,
  isCanonicalValue,
  isSpecPath,
  isVariantDecoratedPath,
  variantDecoratedPath,
} from "./composition";
export type {
  CanonicalValue,
  SceneOpinion,
  SceneLayer,
  VariantArc,
  ReferenceArc,
  PayloadArc,
  CompositionArc,
  CompositionSpec,
  ComposeOptions,
  OpinionStrengthClass,
  WinningOpinionProvenance,
  ResolvedField,
  ComposedSpec,
} from "./composition";

export {
  MAT4_IDENTITY,
  mat4Multiply,
  composeTransform,
  transformPoint,
  mat4CanonicalJson,
  rayIntersectAabb,
  aabbOfPoints,
} from "./linalg";
export type { Mat4, Vec3, Quat, Aabb, RayHit } from "./linalg";

export {
  WGS84,
  WGS84_B,
  WGS84_E2,
  WGS84_EP2,
  VINCENTY_MAX_ITERATIONS,
  geodeticToEcef,
  surfaceEcef,
  ecefToGeodetic,
  ecefChordDistance,
  vincentyInverse,
  ellipsoidNormal,
  isSurfacePointVisible,
} from "./wgs84";
export type { Geodetic, Ecef, VincentyResult } from "./wgs84";

export { seededRandom, seededFloats, seededIntegers } from "./seeded";
export type { SeededRandom } from "./seeded";

export {
  babylonLaneSubject,
  cesiumLaneSubject,
  usdLaneSubject,
  gltfLaneSubject,
  assimpLaneSubject,
  REALITY_LANE_SUBJECTS,
  sniffFormatFamily,
  canonicalStlAscii,
  canonicalPlyAscii,
} from "./lanes";
export type { SourceFrameDeclaration } from "./lanes";
