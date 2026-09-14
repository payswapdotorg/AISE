/**
 * AISE-012 reconstruction engine adapters — public surface.
 *
 * Adapter classes: WorldSculpt (external engine, backend-injected) and
 * depth/LiDAR fusion (deterministic local computation). The
 * reference-constrained adapter class is a documented future provider class
 * (see registry.ts).
 */

export { WorldSculptAdapter, WORLDSCULPT_LICENSE_INVENTORY } from "./worldsculpt/adapter";
export type { WorldSculptAdapterConfig, WorldSculptLicenseInventory } from "./worldsculpt/adapter";
export {
  HttpWorldSculptBackend,
  WORLDSCULPT_ENGINE_FRAME,
  WORLDSCULPT_ENGINE_SCALE,
} from "./worldsculpt/backend";
export type {
  EvidenceBytesReader,
  HttpWorldSculptBackendConfig,
  WorldSculptBackend,
  WorldSculptBackendFailureCode,
  WorldSculptCameraIntrinsics,
  WorldSculptCameraPose,
  WorldSculptExecutionEnvironment,
  WorldSculptFrameInput,
  WorldSculptInferenceRequest,
  WorldSculptInferenceResponse,
  WorldSculptMesh,
  WorldSculptObjectCandidate,
} from "./worldsculpt/backend";
export { DeterministicWorldSculptBackend } from "./worldsculpt/simulation";
export type { DeterministicWorldSculptOptions } from "./worldsculpt/simulation";
export {
  CONVENTION_ROTATION_X180,
  applyTransform4x4,
  convertIntrinsicsToEngine,
  convertPoseToEngineFrame,
  engineScaleDeclaration,
  metersPerUnit,
  multiplyMatrix3,
} from "./worldsculpt/conversion";
export type {
  AiseCameraIntrinsics,
  AiseCameraPose,
  AiseLengthUnit,
  EngineScaleDeclaration,
} from "./worldsculpt/conversion";
export { DepthLidarFusionAdapter } from "./depth-lidar/adapter";
export type { DepthLidarFusionAdapterConfig } from "./depth-lidar/adapter";
export {
  DEPTH_FUSION_FRAME,
  DeterministicDepthFusionBackend,
  parseDepthMapPoints,
} from "./depth-lidar/backend";
export type {
  DepthFusionBackend,
  DepthFusionBackendFailureCode,
  DepthFusionRequest,
  DepthFusionResponse,
  DepthFrameInput,
  FusedPoint,
} from "./depth-lidar/backend";
export { createDefaultAiseProviders } from "./registry";
export type { DefaultAiseProvidersOptions } from "./registry";
