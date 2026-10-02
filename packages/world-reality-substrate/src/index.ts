/**
 * `@aise/world-reality-substrate` — public API (WORLD-P0-A).
 *
 * House package discipline: the exported surface is types + the four
 * substitution doubles + parse/validation functions ONLY. No I/O, no
 * console, no substrate imports — the package compiles and its tests
 * run with ZERO substrate installed (the substitution law proof).
 */

export * from "./scene";
export * from "./errors";
export type {
  BabylonSceneRuntimeAdapter,
  SceneRuntimeCapabilities,
  SceneRuntimeHandle,
  SceneRuntimeListener,
  PickResult,
} from "./babylon/contract";
export { InMemorySceneRuntimeDouble } from "./babylon/double";
export type {
  CesiumGeospatialAdapter,
  GeospatialCapabilities,
  GeodeticPosition,
  SiteGeoreference,
  SiteContextHandle,
  TilesetReference,
  TilesetHandle,
  GeoreferenceVerdict,
} from "./cesium/contract";
export { InMemoryGeospatialDouble } from "./cesium/double";
export type {
  UsdCompositionAdapter,
  UsdCompositionCapabilities,
  UsdCompositionInput,
  UsdCompositionResult,
  UsdLayerSource,
  UsdVariantSet,
  UsdPayloadRegion,
  UsdTimeSample,
  SceneNodeOverride,
} from "./usd/contract";
export { InMemoryUsdCompositionDouble } from "./usd/double";
export type {
  GltfRuntimeAssetAdapter,
  GltfDeliveryCapabilities,
  GltfAssetSource,
  DeliveredGltfAsset,
} from "./gltf/contract";
export { InMemoryGltfDeliveryDouble } from "./gltf/double";
export {
  validateGltfJson,
  parseGlb,
  GLTF_ISSUE_CODES,
} from "./gltf/parse";
export type { GltfParseResult, GltfValidationIssue, GltfIssueCode, ValidatedGltfAsset } from "./gltf/parse";
export type {
  AssimpIngestAdapter,
  AssimpIngestCapabilities,
  AssimpIngestSource,
  AssimpIngestResult,
  AssimpFormatFamily,
  ExternalLabel,
  IngestedMesh,
} from "./assimp/contract";
export { ASSIMP_FORMAT_FAMILIES } from "./assimp/contract";
export { InMemoryAssimpIngestDouble } from "./assimp/double";
