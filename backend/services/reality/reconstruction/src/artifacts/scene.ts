/**
 * Scene artifact creation and verification (AISE-008).
 *
 * A scene is the composed reconstruction result of one capture
 * session: the frame set, the pose estimates, and the point clouds
 * that were reconstructed from them, joined by an explicit stage
 * record. Like a point cloud it is content-addressed and epistemic
 * state is `INFERRED`.
 *
 * Scene-specific fail-closed behavior:
 * - a scene references its point clouds by (artifactId, contentHash)
 *   and `verifySceneArtifact` resolves every reference and
 *   re-verifies the referenced cloud — tampering with a referenced
 *   cloud invalidates the scene that cites it (cross-artifact
 *   integrity);
 * - a scene with zero point clouds is rejected (EMPTY_SCENE): an
 *   empty scene would present "nothing reconstructed" as a
 *   successful reconstruction;
 * - the pose set corresponds EXACTLY to the frame set (PR #9
 *   review): one pose per scene frame, no pose for a frame the scene
 *   does not carry, and every pose's assetId equals its frame's
 *   assetId. Enforced at creation AND at verification
 *   (`SCENE_POSE_FRAME_MISMATCH`) — the pipeline produces matched
 *   sets, but the artifact gate itself must fail closed on any
 *   missing, foreign, or mismatched coverage, independent of who
 *   constructed the artifact;
 * - every frame and pose that entered reconstruction is part of the
 *   scene content, so the scene hash pins the full input context.
 */
import { randomUUID } from "node:crypto";
import type { ContentHash, EpistemicState, Timestamp, Uuid } from "@aise/shared-contracts";
import { canonicalContentHash } from "../canonical.js";
import { ReconstructionError } from "../errors.js";
import { validateArtifactProvenance, type ArtifactProvenance } from "./provenance.js";
import {
  RECONSTRUCTION_EPISTEMIC_STATE,
  verifyPointCloudArtifact,
  type PointCloudArtifact,
} from "./point-cloud.js";
import type { PoseEstimate } from "../pose/pose.js";

export const SCENE_FORMAT_VERSION = "1.0";

/** A point cloud referenced by a scene (id + content hash pair). */
export interface ScenePointCloudRef {
  readonly artifactId: Uuid;
  readonly contentHash: ContentHash;
}

/** A reconstruction frame referenced by a scene. */
export interface SceneFrameRef {
  readonly frameId: Uuid;
  readonly assetId: Uuid;
  readonly contentHash: ContentHash;
}

/** One completed pipeline stage recorded on the scene. */
export interface SceneStageRecord {
  readonly name:
    | "preprocessing"
    | "pose_estimation"
    | "reconstruction"
    | "scene_composition";
  readonly status: "COMPLETED";
  /** Implementer identity (pipeline id, estimator id, engine id). */
  readonly implementer: string;
}

export interface SceneArtifact {
  readonly artifactId: Uuid;
  readonly kind: "scene";
  readonly formatVersion: typeof SCENE_FORMAT_VERSION;
  readonly sessionId: Uuid;
  readonly frames: readonly SceneFrameRef[];
  readonly poses: readonly PoseEstimate[];
  readonly pointClouds: readonly ScenePointCloudRef[];
  readonly stages: readonly SceneStageRecord[];
  readonly provenance: ArtifactProvenance;
  readonly epistemicState: EpistemicState;
  /** Canonical content hash of the whole scene content. */
  readonly contentHash: ContentHash;
  /** Bookkeeping stamp (not part of the content hash). */
  readonly createdAt: Timestamp;
}

/** Any reconstruction artifact (point cloud or scene). */
export type ReconstructionArtifact = PointCloudArtifact | SceneArtifact;

export interface CreateSceneArtifactInput {
  readonly sessionId: Uuid;
  readonly frames: readonly SceneFrameRef[];
  readonly poses: readonly PoseEstimate[];
  readonly pointClouds: readonly ScenePointCloudRef[];
  readonly provenance: ArtifactProvenance;
  /** Epistemic state; only `INFERRED` (the default) is accepted. */
  readonly epistemicState?: EpistemicState;
  /** Injectable artifact id (tests); default: fresh UUID. */
  readonly artifactId?: Uuid;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => string;
}

/** The canonical content of a scene: everything except bookkeeping. */
export function sceneContent(artifact: SceneArtifact): Record<string, unknown> {
  return {
    formatVersion: artifact.formatVersion,
    kind: artifact.kind,
    sessionId: artifact.sessionId,
    frames: artifact.frames,
    poses: artifact.poses,
    pointClouds: artifact.pointClouds,
    stages: artifact.stages,
    provenance: artifact.provenance,
    epistemicState: artifact.epistemicState,
  };
}

/**
 * Creates a scene artifact. Validates the frame set, the pose set,
 * the exact frame ↔ pose correspondence (one pose per frame, no
 * foreign poses, matching asset ids), the non-empty point-cloud
 * reference set, provenance and epistemic state; records the four
 * completed stages; computes the content hash. Throws (fail closed)
 * on any violation.
 */
export function createSceneArtifact(input: CreateSceneArtifactInput): SceneArtifact {
  if (typeof input.sessionId !== "string" || input.sessionId.trim() === "") {
    throw new ReconstructionError("VALIDATION_FAILED", "a scene must carry a sessionId");
  }
  if (!Array.isArray(input.frames) || input.frames.length === 0) {
    throw new ReconstructionError("VALIDATION_FAILED", "a scene must reference at least one frame");
  }
  validateSceneFrameRefs(input.frames);
  validatePoseEstimates(input.poses);
  validateSceneFramePoseCorrespondence(input.frames, input.poses);
  if (!Array.isArray(input.pointClouds) || input.pointClouds.length === 0) {
    throw new ReconstructionError("EMPTY_SCENE", "a scene must reference at least one point-cloud artifact");
  }
  validateScenePointCloudRefs(input.pointClouds);
  validateArtifactProvenance(input.provenance);

  const epistemicState = input.epistemicState ?? RECONSTRUCTION_EPISTEMIC_STATE;
  if (epistemicState !== "INFERRED") {
    throw new ReconstructionError(
      "EPISTEMIC_STATE_INVALID",
      `a reconstruction scene may not claim epistemic state "${epistemicState}" — reconstruction output is INFERRED`,
      { details: { claimed: epistemicState, allowed: "INFERRED" } },
    );
  }

  const stages: SceneStageRecord[] = [
    { name: "preprocessing", status: "COMPLETED", implementer: input.provenance.pipelineId },
    { name: "scene_composition", status: "COMPLETED", implementer: input.provenance.pipelineId },
  ];

  const content: Record<string, unknown> = {
    formatVersion: SCENE_FORMAT_VERSION,
    kind: "scene",
    sessionId: input.sessionId,
    frames: input.frames,
    poses: input.poses,
    pointClouds: input.pointClouds,
    stages,
    provenance: input.provenance,
    epistemicState,
  };

  return {
    artifactId: input.artifactId ?? randomUUID(),
    kind: "scene",
    formatVersion: SCENE_FORMAT_VERSION,
    sessionId: input.sessionId,
    frames: input.frames,
    poses: input.poses,
    pointClouds: input.pointClouds,
    stages,
    provenance: input.provenance,
    epistemicState,
    contentHash: canonicalContentHash(content),
    createdAt: (input.now ?? defaultNow)(),
  };
}

/**
 * Verifies a scene artifact end-to-end: structure, epistemic state,
 * provenance, the recomputed scene content hash, and — through the
 * resolver — every referenced point cloud (existence, kind, hash
 * match, and deep verification). Tampering with the scene or with
 * any cloud it cites fails here.
 */
export function verifySceneArtifact(
  scene: SceneArtifact,
  resolveArtifact: (artifactId: Uuid) => ReconstructionArtifact | undefined,
): void {
  if (scene.kind !== "scene") {
    throw new ReconstructionError("VALIDATION_FAILED", `expected a scene artifact, got kind "${String(scene.kind)}"`);
  }
  if (scene.formatVersion !== SCENE_FORMAT_VERSION) {
    throw new ReconstructionError("VALIDATION_FAILED", `unsupported scene format version "${String(scene.formatVersion)}"`);
  }
  if (!Array.isArray(scene.frames) || scene.frames.length === 0) {
    throw new ReconstructionError("VALIDATION_FAILED", "a verified scene must reference at least one frame");
  }
  validateSceneFrameRefs(scene.frames);
  validatePoseEstimates(scene.poses);
  validateSceneFramePoseCorrespondence(scene.frames, scene.poses);
  if (!Array.isArray(scene.pointClouds) || scene.pointClouds.length === 0) {
    throw new ReconstructionError("EMPTY_SCENE", "a verified scene must reference at least one point-cloud artifact");
  }
  validateScenePointCloudRefs(scene.pointClouds);
  if (scene.epistemicState !== "INFERRED") {
    throw new ReconstructionError(
      "EPISTEMIC_STATE_INVALID",
      `a verified scene may not claim epistemic state "${String(scene.epistemicState)}"`,
    );
  }
  validateArtifactProvenance(scene.provenance);

  for (const reference of scene.pointClouds) {
    const resolved = resolveArtifact(reference.artifactId);
    if (resolved === undefined) {
      throw new ReconstructionError("ARTIFACT_NOT_FOUND", `scene references point cloud ${reference.artifactId} which does not exist`, {
        details: { sceneId: scene.artifactId, artifactId: reference.artifactId },
      });
    }
    if (resolved.kind !== "point_cloud") {
      throw new ReconstructionError("SCENE_REFERENCE_INVALID", `scene reference ${reference.artifactId} does not resolve to a point cloud`, {
        details: { sceneId: scene.artifactId, artifactId: reference.artifactId, kind: resolved.kind },
      });
    }
    if (resolved.contentHash !== reference.contentHash) {
      throw new ReconstructionError(
        "SCENE_REFERENCE_INVALID",
        `scene cites point cloud ${reference.artifactId} with hash ${reference.contentHash} but the artifact carries ${resolved.contentHash}`,
        { details: { sceneId: scene.artifactId, artifactId: reference.artifactId, cited: reference.contentHash, actual: resolved.contentHash } },
      );
    }
    // Deep verification of the referenced cloud: a tampered cloud
    // invalidates the scene that cites it.
    verifyPointCloudArtifact(resolved);
  }

  const recomputed = canonicalContentHash(sceneContent(scene));
  if (recomputed !== scene.contentHash) {
    throw new ReconstructionError("INTEGRITY_MISMATCH", "scene content hash does not match its stored content", {
      details: { artifactId: scene.artifactId, stored: scene.contentHash, recomputed },
    });
  }
}

const defaultNow = (): string => new Date().toISOString();

function validateSceneFrameRefs(frames: readonly SceneFrameRef[]): void {
  const seen = new Set<Uuid>();
  frames.forEach((frame, index) => {
    if (typeof frame.frameId !== "string" || frame.frameId.trim() === "") {
      throw new ReconstructionError("VALIDATION_FAILED", `scene frame reference ${index} must carry a frameId`);
    }
    if (frame.assetId !== frame.frameId) {
      // frameId === assetId is a foundation invariant (one committed
      // upload = one frame); a mismatch signals a fabricated frame.
      throw new ReconstructionError("VALIDATION_FAILED", `scene frame reference ${index} must satisfy frameId === assetId`, {
        details: { frameId: frame.frameId, assetId: frame.assetId },
      });
    }
    if (seen.has(frame.frameId)) {
      throw new ReconstructionError("VALIDATION_FAILED", `scene references frame ${frame.frameId} more than once`);
    }
    seen.add(frame.frameId);
    if (!/^[0-9a-f]{64}$/.test(frame.contentHash)) {
      throw new ReconstructionError("VALIDATION_FAILED", `scene frame reference ${index} must carry a lowercase-hex sha-256 contentHash`);
    }
  });
}

function validateScenePointCloudRefs(refs: readonly ScenePointCloudRef[]): void {
  const seen = new Set<Uuid>();
  refs.forEach((reference, index) => {
    if (typeof reference.artifactId !== "string" || reference.artifactId.trim() === "") {
      throw new ReconstructionError("VALIDATION_FAILED", `scene point-cloud reference ${index} must carry an artifactId`);
    }
    if (seen.has(reference.artifactId)) {
      throw new ReconstructionError("VALIDATION_FAILED", `scene references point cloud ${reference.artifactId} more than once`);
    }
    seen.add(reference.artifactId);
    if (!/^[0-9a-f]{64}$/.test(reference.contentHash)) {
      throw new ReconstructionError("VALIDATION_FAILED", `scene point-cloud reference ${index} must carry a lowercase-hex sha-256 contentHash`);
    }
  });
}

/**
 * The exact frame ↔ pose correspondence invariant (PR #9 review):
 * the pose set must cover the scene's frame set exactly — every
 * scene frame carries exactly one pose (uniqueness is already
 * enforced by `validatePoseEstimates`, coverage here), no pose is
 * carried for a frame outside the scene, and every pose's assetId
 * equals its frame's assetId. A scene that violates this would
 * present poses not anchored in the frames it claims, or frames
 * without poses — it is not a coherent reconstruction record and
 * fails closed with `SCENE_POSE_FRAME_MISMATCH`, at creation and at
 * verification alike.
 */
function validateSceneFramePoseCorrespondence(
  frames: readonly SceneFrameRef[],
  poses: readonly PoseEstimate[],
): void {
  const frameByFrameId = new Map<Uuid, SceneFrameRef>();
  for (const frame of frames) {
    frameByFrameId.set(frame.frameId, frame);
  }

  const posedFrameIds = new Set<Uuid>();
  for (const pose of poses) {
    const frame = frameByFrameId.get(pose.frameId);
    if (frame === undefined) {
      throw new ReconstructionError(
        "SCENE_POSE_FRAME_MISMATCH",
        `scene carries a pose for frame ${pose.frameId} which is not one of its frames`,
        { details: { frameId: pose.frameId, poseAssetId: pose.assetId } },
      );
    }
    if (pose.assetId !== frame.assetId) {
      throw new ReconstructionError(
        "SCENE_POSE_FRAME_MISMATCH",
        `pose for frame ${pose.frameId} carries a mismatched assetId`,
        {
          details: {
            frameId: pose.frameId,
            poseAssetId: pose.assetId,
            frameAssetId: frame.assetId,
          },
        },
      );
    }
    posedFrameIds.add(pose.frameId);
  }

  const missingFrameIds = frames
    .filter((frame) => !posedFrameIds.has(frame.frameId))
    .map((frame) => frame.frameId);
  if (missingFrameIds.length > 0) {
    throw new ReconstructionError(
      "SCENE_POSE_FRAME_MISMATCH",
      "every scene frame must carry exactly one pose — frames without poses: " +
        missingFrameIds.join(", "),
      { details: { missingFrameIds } },
    );
  }
}

/** Validates a standalone pose list (used at scene creation/verification). */
function validatePoseEstimates(poses: readonly PoseEstimate[]): void {
  if (!Array.isArray(poses)) {
    throw new ReconstructionError("VALIDATION_FAILED", "scene poses must be an array");
  }
  const seen = new Set<Uuid>();
  poses.forEach((pose, index) => {
    if (typeof pose.frameId !== "string" || pose.frameId.trim() === "") {
      throw new ReconstructionError("VALIDATION_FAILED", `scene pose ${index} must carry a frameId`);
    }
    if (seen.has(pose.frameId)) {
      throw new ReconstructionError("VALIDATION_FAILED", `scene carries more than one pose for frame ${pose.frameId}`);
    }
    seen.add(pose.frameId);
  });
}
