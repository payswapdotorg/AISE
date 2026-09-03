/**
 * @aise/backend-reconstruction — the AISE-008 reconstruction
 * pipeline foundation.
 *
 * Public surface:
 * - capture   — the committed-upload source port (AISE-004 boundary)
 * - preprocessing — asynchronous, integrity-revalidated, deterministic
 * - pose      — the pose port, its fail-closed validator, and the
 *               acquisition-metadata adapter
 * - reconstruction — the engine port and its fail-closed output gate
 * - artifacts — provenance-complete, content-addressed point-cloud
 *               and scene artifacts with verification
 * - state     — the versioned, append-only derived-state store
 * - pipeline  — the asynchronous job runner and the full chain
 * - runtime   — service composition with fail-closed production
 *               defaults
 */
export {
  createFailClosedCaptureSource,
  createStaticCaptureSource,
  type CaptureUploadSource,
  type CommittedCaptureUpload,
  type FailClosedCaptureSourceOptions,
  type StaticCaptureSourceOptions,
} from "./capture/source.js";

export {
  EXCLUDED_ASSET_TYPES,
  PREPROCESSED_SESSION_FORMAT_VERSION,
  RECONSTRUCTABLE_ASSET_TYPES,
  preprocessSession,
  type ExcludedAsset,
  type ExcludedAssetType,
  type PreprocessedFrame,
  type PreprocessedSession,
  type PreprocessSessionOptions,
  type ReconstructableAssetType,
} from "./preprocessing/preprocess.js";

export {
  validatePoseEstimationResult,
  type PoseEstimate,
  type PoseEstimationResult,
  type PoseEstimator,
  type PoseFieldProvenance,
  type PoseFrameFailure,
  type Vec3,
} from "./pose/pose.js";

export {
  ACQUISITION_METADATA_POSE_ESTIMATOR_ID,
  createAcquisitionMetadataPoseAdapter,
  type AcquisitionMetadataPoseAdapterOptions,
} from "./pose/metadata-pose.js";

export {
  MAX_POINTS_PER_CLOUD,
  assertValidReconstructionOutput,
  type PointCloudPoint,
  type ReconstructionEngine,
  type ReconstructionFailed,
  type ReconstructionInput,
  type ReconstructionOutput,
  type ReconstructionSucceeded,
} from "./reconstruction/engine.js";

export {
  parametersFingerprintOf,
  validateArtifactProvenance,
  type ArtifactInput,
  type ArtifactInputRef,
  type ArtifactProvenance,
  type CaptureAssetInputRef,
} from "./artifacts/provenance.js";

export {
  POINT_CLOUD_FORMAT_VERSION,
  RECONSTRUCTION_EPISTEMIC_STATE,
  createPointCloudArtifact,
  pointCloudContent,
  verifyPointCloudArtifact,
  type CreatePointCloudArtifactInput,
  type PointCloudArtifact,
  type PointCloudCoordinateFrame,
} from "./artifacts/point-cloud.js";

export {
  SCENE_FORMAT_VERSION,
  createSceneArtifact,
  sceneContent,
  verifySceneArtifact,
  type CreateSceneArtifactInput,
  type ReconstructionArtifact,
  type SceneArtifact,
  type SceneFrameRef,
  type ScenePointCloudRef,
  type SceneStageRecord,
} from "./artifacts/scene.js";

export {
  createInMemoryReconstructionStateStore,
  type CommitResult,
  type InMemoryReconstructionStateStoreOptions,
  type ReconstructionStateStore,
  type SessionReconstruction,
} from "./state/store.js";

export {
  PIPELINE_ID,
  PIPELINE_VERSION,
  SESSION_LOCAL_FRAME,
  createReconstructionRunner,
  type ReconstructionRunner,
  type ReconstructionRunnerOptions,
} from "./pipeline/runner.js";

export {
  type ReconstructionJobFailure,
  type ReconstructionJobRecord,
  type ReconstructionJobState,
  type ReconstructionJobType,
} from "./pipeline/jobs.js";

export {
  buildReconstructionService,
  type BuildReconstructionServiceOptions,
  type ReconstructionService,
} from "./runtime.js";

export { ReconstructionError, toReconstructionError, type ReconstructionErrorCode } from "./errors.js";

export {
  canonicalContentHash,
  canonicalJsonString,
  sha256Hex,
  sha256HexBytes,
} from "./canonical.js";
