/**
 * The acquisition-metadata pose adapter (AISE-008).
 *
 * The one production `PoseEstimator` of the reconstruction
 * foundation: it carries the device-reported orientation quaternion
 * from each frame's acquisition metadata into the pose stage, with
 * `orientationProvenance: "ACQUISITION_METADATA"`.
 *
 * Honesty guarantees (epistemic discipline):
 * - position is NEVER claimed — `null` with `NOT_ESTABLISHED`. The
 *   v1.0 capture contract carries no device position data, and a
 *   metadata carrier must not invent one;
 * - the quaternion is used verbatim (never renormalized — a repair
 *   would silently rewrite observed evidence);
 * - a frame whose metadata orientation is invalid (non-finite or
 *   zero norm — possible only if it bypassed preprocessing
 *   validation) becomes an explicit `failedFrames` entry, never a
 *   silently dropped or guessed pose.
 */
import type { PreprocessedFrame } from "../preprocessing/preprocess.js";
import { assertOrientationQuaternion } from "../validate.js";
import type {
  PoseEstimate,
  PoseEstimationResult,
  PoseEstimator,
  PoseFrameFailure,
} from "./pose.js";

export const ACQUISITION_METADATA_POSE_ESTIMATOR_ID = "acquisition-metadata-orientation/1.0";

export interface AcquisitionMetadataPoseAdapterOptions {
  /**
   * Overrides the estimator identity recorded in provenance. Tests
   * inject a stable id; production uses the default above.
   */
  readonly id?: string;
}

/**
 * Creates the metadata pose adapter. Synchronous: it only reads
 * already-validated metadata.
 */
export function createAcquisitionMetadataPoseAdapter(
  options: AcquisitionMetadataPoseAdapterOptions = {},
): PoseEstimator {
  const id = options.id ?? ACQUISITION_METADATA_POSE_ESTIMATOR_ID;
  return {
    id,
    estimatePoses: (frames: readonly PreprocessedFrame[]): PoseEstimationResult => {
      const poses: PoseEstimate[] = [];
      const failedFrames: PoseFrameFailure[] = [];

      for (const frame of frames) {
        const quaternion = frame.acquisition?.orientation?.quaternion;
        if (quaternion === undefined) {
          poses.push({
            frameId: frame.frameId,
            assetId: frame.assetId,
            orientation: null,
            orientationProvenance: "NOT_ESTABLISHED",
            position: null,
            positionProvenance: "NOT_ESTABLISHED",
          });
          continue;
        }
        try {
          assertOrientationQuaternion(quaternion, `frames[${frame.frameId}].orientation.quaternion`);
        } catch {
          failedFrames.push({
            frameId: frame.frameId,
            assetId: frame.assetId,
            reason: "invalid_orientation_quaternion",
          });
          continue;
        }
        poses.push({
          frameId: frame.frameId,
          assetId: frame.assetId,
          orientation: quaternion,
          orientationProvenance: "ACQUISITION_METADATA",
          position: null,
          positionProvenance: "NOT_ESTABLISHED",
        });
      }

      return { estimatorId: id, poses, failedFrames };
    },
  };
}
