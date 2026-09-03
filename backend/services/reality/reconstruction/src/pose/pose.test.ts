/**
 * Pose interface tests (AISE-008).
 *
 * Cover the acquisition-metadata adapter (verbatim orientation,
 * explicit NOT_ESTABLISHED, full frame accounting, fail-closed on
 * invalid quaternions) and the fail-closed result validator that
 * gates every estimator output before it can become scene state.
 */
import { describe, expect, it } from "vitest";
import type { PreprocessedFrame } from "../preprocessing/preprocess.js";
import { validatePoseEstimationResult, type PoseEstimate, type PoseEstimationResult } from "./pose.js";
import {
  ACQUISITION_METADATA_POSE_ESTIMATOR_ID,
  createAcquisitionMetadataPoseAdapter,
} from "./metadata-pose.js";
import { buildUpload, type UploadOverrides } from "../testing/test-uploads.js";
import { preprocessSession } from "../preprocessing/preprocess.js";
import { createStaticCaptureSource } from "../capture/source.js";
import { ReconstructionError } from "../errors.js";

const SESSION = "11111111-1111-4111-8111-111111111111";

function framesOf(uploads: UploadOverrides[] = []): readonly PreprocessedFrame[] {
  const source = createStaticCaptureSource(uploads.map((spec) => buildUpload(spec)));
  return preprocessSession(source, SESSION).frames;
}

const VALID_QUATERNION = { x: 0.01, y: -0.02, z: 0.005, w: 0.9996 };

function poseFor(frame: PreprocessedFrame, overrides: Partial<PoseEstimate> = {}): PoseEstimate {
  return {
    frameId: frame.frameId,
    assetId: frame.assetId,
    orientation: null,
    orientationProvenance: "NOT_ESTABLISHED",
    position: null,
    positionProvenance: "NOT_ESTABLISHED",
    ...overrides,
  };
}

describe("acquisition-metadata pose adapter", () => {
  it("carries the metadata orientation verbatim with ACQUISITION_METADATA provenance", async () => {
    const frames = framesOf([{ assetId: "a-asset", orientation: VALID_QUATERNION }]);
    const adapter = createAcquisitionMetadataPoseAdapter();
    const result = await adapter.estimatePoses(frames);

    expect(result.estimatorId).toBe(ACQUISITION_METADATA_POSE_ESTIMATOR_ID);
    expect(result.failedFrames).toEqual([]);
    expect(result.poses).toHaveLength(1);
    expect(result.poses[0]?.orientation).toEqual(VALID_QUATERNION);
    expect(result.poses[0]?.orientationProvenance).toBe("ACQUISITION_METADATA");
  });

  it("never claims a position — explicit NOT_ESTABLISHED", async () => {
    const frames = framesOf([{ assetId: "a-asset", orientation: VALID_QUATERNION }]);
    const result = await createAcquisitionMetadataPoseAdapter().estimatePoses(frames);
    expect(result.poses[0]?.position).toBeNull();
    expect(result.poses[0]?.positionProvenance).toBe("NOT_ESTABLISHED");
  });

  it("states NOT_ESTABLISHED orientation when the metadata carries none", async () => {
    const frames = framesOf([{ assetId: "a-asset" }]);
    const result = await createAcquisitionMetadataPoseAdapter().estimatePoses(frames);
    expect(result.poses[0]?.orientation).toBeNull();
    expect(result.poses[0]?.orientationProvenance).toBe("NOT_ESTABLISHED");
  });

  it("accounts for every frame exactly once (poses + failures)", async () => {
    const frames = framesOf([
      { assetId: "a-asset", orientation: VALID_QUATERNION },
      { assetId: "b-asset" },
      { assetId: "c-asset", orientation: VALID_QUATERNION },
    ]);
    const result = await createAcquisitionMetadataPoseAdapter().estimatePoses(frames);
    expect(result.poses).toHaveLength(3);
    expect(result.failedFrames).toHaveLength(0);
    expect(() => validatePoseEstimationResult(result, frames)).not.toThrow();
  });

  it("fails closed (explicit failure record) on an invalid metadata quaternion", async () => {
    // Preprocessing already rejects invalid quaternions, so this
    // exercises the adapter's own defense-in-depth: a frame that
    // bypassed preprocessing validation still cannot produce a
    // silently-dropped or guessed pose.
    const frames = framesOf([{ assetId: "a-asset" }]);
    const bypassingFrame: PreprocessedFrame = {
      ...frames[0]!,
      acquisition: {
        ...frames[0]!.acquisition,
        orientation: { quaternion: { x: 0, y: 0, z: 0, w: 0 } },
      },
    };
    const result = await createAcquisitionMetadataPoseAdapter().estimatePoses([bypassingFrame]);
    expect(result.poses).toHaveLength(0);
    expect(result.failedFrames).toEqual([
      { frameId: frames[0]?.frameId, assetId: "a-asset", reason: "invalid_orientation_quaternion" },
    ]);
  });

  it("supports an injected estimator id for deterministic provenance", async () => {
    const frames = framesOf([{ assetId: "a-asset" }]);
    const adapter = createAcquisitionMetadataPoseAdapter({ id: "test-estimator/1" });
    expect(adapter.id).toBe("test-estimator/1");
    expect((await adapter.estimatePoses(frames)).estimatorId).toBe("test-estimator/1");
  });
});

describe("validatePoseEstimationResult — fail-closed gate", () => {
  it("accepts the adapter's own output for the frames it was given", async () => {
    const frames = framesOf([
      { assetId: "a-asset", orientation: VALID_QUATERNION },
      { assetId: "b-asset" },
    ]);
    const result = await createAcquisitionMetadataPoseAdapter().estimatePoses(frames);
    expect(() => validatePoseEstimationResult(result, frames)).not.toThrow();
  });

  it("rejects a result that omits a frame (silent drop)", () => {
    const frames = framesOf([{ assetId: "a-asset" }, { assetId: "b-asset" }]);
    const result = syncOf(createAcquisitionMetadataPoseAdapter().estimatePoses(frames));
    const truncated = { ...result, poses: result.poses.slice(0, 1) };
    expectError(() => validatePoseEstimationResult(truncated, frames));
  });

  it("rejects a duplicated frame", () => {
    const frames = framesOf([{ assetId: "a-asset" }]);
    const result = syncOf(createAcquisitionMetadataPoseAdapter().estimatePoses(frames));
    const doubled = { ...result, poses: [...result.poses, ...result.poses] };
    expectError(() => validatePoseEstimationResult(doubled, frames));
  });

  it("rejects a pose for a foreign frame", () => {
    const frames = framesOf([{ assetId: "a-asset" }]);
    const result = syncOf(createAcquisitionMetadataPoseAdapter().estimatePoses(frames));
    const foreign = {
      ...result,
      poses: [
        poseFor({ ...frames[0]!, frameId: "not-a-frame" }, {
          orientation: VALID_QUATERNION,
          orientationProvenance: "ACQUISITION_METADATA",
        }),
      ],
    };
    expectError(() => validatePoseEstimationResult(foreign, frames));
  });

  it("rejects a mismatched assetId on a known frame", () => {
    const frames = framesOf([{ assetId: "a-asset" }]);
    const result = syncOf(createAcquisitionMetadataPoseAdapter().estimatePoses(frames));
    const mismatched = {
      ...result,
      poses: [poseFor(frames[0]!, { assetId: "other-asset" })],
    };
    expectError(() => validatePoseEstimationResult(mismatched, frames));
  });

  it("rejects a null orientation labeled as established", () => {
    const frames = framesOf([{ assetId: "a-asset" }]);
    const result = syncOf(createAcquisitionMetadataPoseAdapter().estimatePoses(frames));
    const lying = {
      ...result,
      poses: [poseFor(frames[0]!, { orientationProvenance: "ESTIMATED" })],
    };
    expectError(() => validatePoseEstimationResult(lying, frames));
  });

  it("rejects an orientation value labeled NOT_ESTABLISHED", () => {
    const frames = framesOf([{ assetId: "a-asset", orientation: VALID_QUATERNION }]);
    const result = syncOf(createAcquisitionMetadataPoseAdapter().estimatePoses(frames));
    const lying = {
      ...result,
      poses: [
        poseFor(frames[0]!, {
          orientation: VALID_QUATERNION,
          orientationProvenance: "NOT_ESTABLISHED",
        }),
      ],
    };
    expectError(() => validatePoseEstimationResult(lying, frames));
  });

  it("rejects an invalid quaternion in a pose", () => {
    const frames = framesOf([{ assetId: "a-asset" }]);
    const result = syncOf(createAcquisitionMetadataPoseAdapter().estimatePoses(frames));
    const invalid = {
      ...result,
      poses: [
        poseFor(frames[0]!, {
          orientation: { x: Number.NaN, y: 0, z: 0, w: 1 },
          orientationProvenance: "ACQUISITION_METADATA",
        }),
      ],
    };
    expectError(() => validatePoseEstimationResult(invalid, frames));
  });

  it("rejects a non-finite position", () => {
    const frames = framesOf([{ assetId: "a-asset" }]);
    const result = syncOf(createAcquisitionMetadataPoseAdapter().estimatePoses(frames));
    const invalid = {
      ...result,
      poses: [
        poseFor(frames[0]!, {
          position: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 },
          positionProvenance: "ESTIMATED",
        }),
      ],
    };
    expectError(() => validatePoseEstimationResult(invalid, frames));
  });

  it("rejects a failure record without a reason", () => {
    const frames = framesOf([{ assetId: "a-asset" }]);
    const invalid = {
      estimatorId: "test/1",
      poses: [],
      failedFrames: [{ frameId: frames[0]!.frameId, assetId: frames[0]!.assetId, reason: "" }],
    };
    expectError(() => validatePoseEstimationResult(invalid, frames));
  });

  it("rejects an empty estimator id", () => {
    const frames = framesOf([{ assetId: "a-asset" }]);
    const invalid = {
      estimatorId: "",
      poses: [],
      failedFrames: [],
    };
    expectError(() => validatePoseEstimationResult(invalid, frames));
  });

  it("rejects a frame accounted as both pose and failure", () => {
    const frames = framesOf([{ assetId: "a-asset" }]);
    const result = syncOf(createAcquisitionMetadataPoseAdapter().estimatePoses(frames));
    const both = {
      ...result,
      failedFrames: [
        { frameId: frames[0]!.frameId, assetId: frames[0]!.assetId, reason: "conflict" },
      ],
    };
    expectError(() => validatePoseEstimationResult(both, frames));
  });
});

/** The adapter is synchronous; unwrap its sync-or-async port return for gate tests. */
function syncOf(result: PoseEstimationResult | Promise<PoseEstimationResult>): PoseEstimationResult {
  if (result instanceof Promise) {
    throw new Error("adapter unexpectedly returned a promise");
  }
  return result;
}

function expectError(fn: () => unknown): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ReconstructionError);
  expect((caught as ReconstructionError).code).toBe("INVALID_POSE_OUTPUT");
}
