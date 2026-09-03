/**
 * Reconstruction engine interfaces (AISE-008).
 *
 * Like the pose stage, the geometry-producing stage is a PORT: real
 * reconstruction engines (photogrammetry, depth fusion, SLAM)
 * arrive in later Work Items. The foundation fixes the contract and
 * the fail-closed gate that validates every engine output before it
 * can become artifact state.
 *
 * Contract:
 * - an engine receives the session's validated frames and poses and
 *   returns either a success (non-empty finite points, a non-empty
 *   method label, and optionally a JSON-shaped parameters record
 *   that is fingerprinted into artifact provenance) or an explicit
 *   failure with a reason;
 * - `assertValidReconstructionOutput` enforces all of that and
 *   throws `INVALID_ENGINE_OUTPUT` on violations — an engine cannot
 *   smuggle empty clouds, non-finite geometry, or label-less output
 *   into the pipeline;
 * - engines are registered explicitly; with no engine registered the
 *   pipeline fails closed (`NO_RECONSTRUCTION_ENGINE`) rather than
 *   producing placeholder geometry. The foundation deliberately
 *   ships NO production engine: fabricating geometry without a real
 *   method would violate evidence-over-claims.
 */
import { ReconstructionError } from "../errors.js";
import { canonicalJsonString } from "../canonical.js";
import { isFiniteNumber } from "../validate.js";
import type { PreprocessedFrame } from "../preprocessing/preprocess.js";
import type { PoseEstimate } from "../pose/pose.js";
import type { Uuid } from "@aise/shared-contracts";

/** One point of a reconstructed cloud, in the session-local frame (meters). */
export interface PointCloudPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Optional sRGB color channels, integers in [0, 255]. */
  readonly r?: number;
  readonly g?: number;
  readonly b?: number;
}

/** The input a reconstruction engine receives. */
export interface ReconstructionInput {
  readonly sessionId: Uuid;
  readonly frames: readonly PreprocessedFrame[];
  readonly poses: readonly PoseEstimate[];
}

/** A successful engine output. */
export interface ReconstructionSucceeded {
  readonly status: "succeeded";
  /** Non-empty finite points (validated before artifact creation). */
  readonly points: readonly PointCloudPoint[];
  /** Non-empty method label recorded in artifact provenance. */
  readonly method: string;
  /**
   * Engine-declared parameters record (JSON-shaped). Fingerprinted
   * into provenance; absent means "no parameters".
   */
  readonly parameters?: Record<string, unknown>;
}

/** An explicit engine failure. */
export interface ReconstructionFailed {
  readonly status: "failed";
  readonly reason: string;
}

export type ReconstructionOutput = ReconstructionSucceeded | ReconstructionFailed;

/** The reconstruction stage port. May be synchronous or asynchronous. */
export interface ReconstructionEngine {
  /** Stable engine identity (recorded in artifact provenance). */
  readonly id: string;
  reconstruct(
    input: ReconstructionInput,
  ): Promise<ReconstructionOutput> | ReconstructionOutput;
}

/** Upper bound on points per cloud (fail-closed hygiene, not a claim). */
export const MAX_POINTS_PER_CLOUD = 5_000_000;

/**
 * Fail-closed validation of an engine output. Throws
 * `INVALID_ENGINE_OUTPUT` when: the status is unknown; a success has
 * empty/too many points, non-finite coordinates, out-of-range color
 * channels, an empty method, or unserializable parameters; a failure
 * has an empty reason.
 */
export function assertValidReconstructionOutput(output: ReconstructionOutput): void {
  if (output === null || typeof output !== "object") {
    throw new ReconstructionError("INVALID_ENGINE_OUTPUT", "engine output must be an object with a status");
  }
  // Narrowed through `unknown` so the defensive default branch stays
  // reachable for callers that bypass the compile-time union.
  const status: unknown = (output as { status?: unknown }).status;
  if (status === "failed") {
    const failed = output as ReconstructionFailed;
    if (typeof failed.reason !== "string" || failed.reason.trim() === "") {
      throw new ReconstructionError("INVALID_ENGINE_OUTPUT", "engine failure must carry a non-empty reason");
    }
    return;
  }
  if (status !== "succeeded") {
    throw new ReconstructionError("INVALID_ENGINE_OUTPUT", `unknown engine output status "${String(status)}"`);
  }
  const succeeded = output as ReconstructionSucceeded;

  if (!Array.isArray(succeeded.points) || succeeded.points.length === 0) {
    throw new ReconstructionError("INVALID_ENGINE_OUTPUT", "a successful reconstruction must carry a non-empty points array");
  }
  if (succeeded.points.length > MAX_POINTS_PER_CLOUD) {
    throw new ReconstructionError("INVALID_ENGINE_OUTPUT", `point cloud exceeds the ${MAX_POINTS_PER_CLOUD}-point bound`, {
      details: { pointCount: succeeded.points.length },
    });
  }
  succeeded.points.forEach((point, index) => {
    for (const axis of ["x", "y", "z"] as const) {
      if (!isFiniteNumber(point[axis])) {
        throw new ReconstructionError("INVALID_ENGINE_OUTPUT", `point ${index} has a non-finite ${axis} coordinate`, {
          details: { index, axis, value: point[axis] },
        });
      }
    }
    for (const channel of ["r", "g", "b"] as const) {
      const value = point[channel];
      if (value === undefined) {
        continue;
      }
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 255) {
        throw new ReconstructionError("INVALID_ENGINE_OUTPUT", `point ${index} has an out-of-range ${channel} color channel`, {
          details: { index, channel, value },
        });
      }
    }
  });

  if (typeof succeeded.method !== "string" || succeeded.method.trim() === "") {
    throw new ReconstructionError("INVALID_ENGINE_OUTPUT", "a successful reconstruction must carry a non-empty method label");
  }
  if (succeeded.parameters !== undefined) {
    if (typeof succeeded.parameters !== "object" || succeeded.parameters === null || Array.isArray(succeeded.parameters)) {
      throw new ReconstructionError("INVALID_ENGINE_OUTPUT", "engine parameters must be a JSON object");
    }
    try {
      canonicalJsonString(succeeded.parameters);
    } catch {
      throw new ReconstructionError("INVALID_ENGINE_OUTPUT", "engine parameters must be canonically serializable");
    }
  }
}
