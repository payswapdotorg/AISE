/**
 * Pose interfaces (AISE-008).
 *
 * The pose stage of the reconstruction pipeline is a PORT, not an
 * implementation: photogrammetric/SLAM pose estimation arrives in
 * later Work Items. What this foundation fixes is the contract every
 * pose estimator must satisfy:
 *
 * - A pose is per-frame, and every field is either established with
 *   an explicit provenance label or explicitly `NOT_ESTABLISHED`
 *   (`null` value). Unknown is stated, never implied by omission.
 * - The metadata adapter below is the one production implementation:
 *   device-reported orientation from acquisition metadata, position
 *   never claimed. It is honest about what it is — a carrier of
 *   observed metadata, not a photogrammetric estimate.
 * - `validatePoseEstimationResult` is the fail-closed gate the
 *   pipeline applies to ANY estimator output: every input frame is
 *   accounted for exactly once (in `poses` or `failedFrames`), no
 *   foreign frames, valid quaternions or `null`, and a non-empty
 *   estimator id. A malformed result never reaches artifact state.
 */
import type { OrientationQuaternion, Uuid } from "@aise/shared-contracts";
import { ReconstructionError } from "../errors.js";
import { assertOrientationQuaternion, isFiniteNumber } from "../validate.js";
import type { PreprocessedFrame } from "../preprocessing/preprocess.js";

/** How a pose field's value was established. */
export type PoseFieldProvenance = "ACQUISITION_METADATA" | "ESTIMATED" | "NOT_ESTABLISHED";

/** A 3D position in the session-local frame (meters). */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One frame's pose: each field established with provenance or null. */
export interface PoseEstimate {
  readonly frameId: Uuid;
  readonly assetId: Uuid;
  readonly orientation: OrientationQuaternion | null;
  readonly orientationProvenance: PoseFieldProvenance;
  readonly position: Vec3 | null;
  readonly positionProvenance: PoseFieldProvenance;
}

/** A frame the estimator could not produce a pose for, with a reason. */
export interface PoseFrameFailure {
  readonly frameId: Uuid;
  readonly assetId: Uuid;
  readonly reason: string;
}

/** The result of estimating poses for a set of frames. */
export interface PoseEstimationResult {
  readonly estimatorId: string;
  readonly poses: readonly PoseEstimate[];
  readonly failedFrames: readonly PoseFrameFailure[];
}

/** The pose stage port. May be synchronous or asynchronous. */
export interface PoseEstimator {
  /** Stable estimator identity (recorded in artifact provenance). */
  readonly id: string;
  estimatePoses(frames: readonly PreprocessedFrame[]): Promise<PoseEstimationResult> | PoseEstimationResult;
}

const VALID_PROVENANCE: readonly string[] = [
  "ACQUISITION_METADATA",
  "ESTIMATED",
  "NOT_ESTABLISHED",
];

/**
 * Fail-closed validation of an estimator result against the frames
 * it was given. Throws `INVALID_POSE_OUTPUT` on any violation:
 * unknown/missing/duplicated frames, foreign frame references,
 * invalid quaternions or positions, empty estimator id, or failure
 * records without a reason.
 */
export function validatePoseEstimationResult(
  result: PoseEstimationResult,
  frames: readonly PreprocessedFrame[],
): void {
  if (typeof result.estimatorId !== "string" || result.estimatorId.trim() === "") {
    throw new ReconstructionError("INVALID_POSE_OUTPUT", "pose estimation result must carry a non-empty estimatorId");
  }
  if (!Array.isArray(result.poses) || !Array.isArray(result.failedFrames)) {
    throw new ReconstructionError("INVALID_POSE_OUTPUT", "pose estimation result must carry poses and failedFrames arrays");
  }

  const frameIds = new Set(frames.map((frame) => frame.frameId));
  const accounted = new Set<Uuid>();

  for (const pose of result.poses) {
    if (!frameIds.has(pose.frameId)) {
      throw new ReconstructionError("INVALID_POSE_OUTPUT", `pose references unknown frame ${pose.frameId}`, {
        details: { frameId: pose.frameId },
      });
    }
    if (accounted.has(pose.frameId)) {
      throw new ReconstructionError("INVALID_POSE_OUTPUT", `frame ${pose.frameId} appears more than once in the pose result`, {
        details: { frameId: pose.frameId },
      });
    }
    const frame = frames.find((candidate) => candidate.frameId === pose.frameId);
    if (frame !== undefined && pose.assetId !== frame.assetId) {
      throw new ReconstructionError("INVALID_POSE_OUTPUT", `pose for frame ${pose.frameId} carries a mismatched assetId`, {
        details: { frameId: pose.frameId, poseAssetId: pose.assetId, frameAssetId: frame.assetId },
      });
    }
    accounted.add(pose.frameId);
    validatePoseProvenance(pose, pose.frameId);
  }

  for (const failure of result.failedFrames) {
    if (!frameIds.has(failure.frameId)) {
      throw new ReconstructionError("INVALID_POSE_OUTPUT", `failure references unknown frame ${failure.frameId}`, {
        details: { frameId: failure.frameId },
      });
    }
    if (accounted.has(failure.frameId)) {
      throw new ReconstructionError("INVALID_POSE_OUTPUT", `frame ${failure.frameId} appears as both pose and failure`, {
        details: { frameId: failure.frameId },
      });
    }
    if (typeof failure.reason !== "string" || failure.reason.trim() === "") {
      throw new ReconstructionError("INVALID_POSE_OUTPUT", `failure for frame ${failure.frameId} must carry a reason`, {
        details: { frameId: failure.frameId },
      });
    }
    accounted.add(failure.frameId);
  }

  const missing = [...frameIds].filter((frameId) => !accounted.has(frameId));
  if (missing.length > 0) {
    throw new ReconstructionError(
      "INVALID_POSE_OUTPUT",
      "every input frame must be accounted for exactly once (pose or failure)",
      { details: { missingFrameIds: missing } },
    );
  }
}

function validatePoseProvenance(pose: PoseEstimate, frameId: Uuid): void {
  if (!VALID_PROVENANCE.includes(pose.orientationProvenance)) {
    throw new ReconstructionError("INVALID_POSE_OUTPUT", `pose for frame ${frameId} has invalid orientationProvenance`, {
      details: { frameId, orientationProvenance: pose.orientationProvenance },
    });
  }
  if (!VALID_PROVENANCE.includes(pose.positionProvenance)) {
    throw new ReconstructionError("INVALID_POSE_OUTPUT", `pose for frame ${frameId} has invalid positionProvenance`, {
      details: { frameId, positionProvenance: pose.positionProvenance },
    });
  }
  if (pose.orientation === null && pose.orientationProvenance !== "NOT_ESTABLISHED") {
    throw new ReconstructionError("INVALID_POSE_OUTPUT", `pose for frame ${frameId} has null orientation but claims it is established`, {
      details: { frameId, orientationProvenance: pose.orientationProvenance },
    });
  }
  if (pose.orientation !== null && pose.orientationProvenance === "NOT_ESTABLISHED") {
    throw new ReconstructionError("INVALID_POSE_OUTPUT", `pose for frame ${frameId} carries an orientation labeled NOT_ESTABLISHED`, {
      details: { frameId },
    });
  }
  if (pose.orientation !== null) {
    try {
      assertOrientationQuaternion(pose.orientation, `poses[${frameId}].orientation`);
    } catch (error) {
      throw new ReconstructionError(
        "INVALID_POSE_OUTPUT",
        `pose for frame ${frameId} carries an invalid orientation quaternion`,
        { details: { frameId, cause: error instanceof Error ? error.message : String(error) } },
      );
    }
  }
  if (pose.position === null && pose.positionProvenance !== "NOT_ESTABLISHED") {
    throw new ReconstructionError("INVALID_POSE_OUTPUT", `pose for frame ${frameId} has null position but claims it is established`, {
      details: { frameId, positionProvenance: pose.positionProvenance },
    });
  }
  if (pose.position !== null && pose.positionProvenance === "NOT_ESTABLISHED") {
    throw new ReconstructionError("INVALID_POSE_OUTPUT", `pose for frame ${frameId} carries a position labeled NOT_ESTABLISHED`, {
      details: { frameId },
    });
  }
  if (pose.position !== null) {
    for (const component of [pose.position.x, pose.position.y, pose.position.z]) {
      if (!isFiniteNumber(component)) {
        throw new ReconstructionError("INVALID_POSE_OUTPUT", `pose for frame ${frameId} has a non-finite position component`, {
          details: { frameId, component },
        });
      }
    }
  }
}
