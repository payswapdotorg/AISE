/**
 * Point-cloud artifact creation and verification (AISE-008).
 *
 * A point cloud is the primary geometry product of the
 * reconstruction pipeline. It is:
 *
 * - **Content-addressed**: `contentHash` is the canonical SHA-256 of
 *   everything that constitutes the cloud (points, coordinate
 *   frame, provenance, epistemic state). Bookkeeping (artifactId,
 *   createdAt, pointCount) is excluded from the hash but guarded
 *   structurally, so any content tampering is detectable by
 *   re-verification.
 * - **Epistemically honest**: `epistemicState` is `INFERRED` — a
 *   reconstruction product is derived, never a direct observation;
 *   claiming OBSERVED/CONFIRMED/PROPOSED is rejected at creation and
 *   at verification (EPISTEMIC_STATE_INVALID).
 * - **Frame-honest**: the coordinate frame is declared
 *   (`SESSION_LOCAL`, meters, not georeferenced). A foundation cloud
 *   that claims georeferencing is rejected — that claim would be
 *   unevidenced.
 * - **Provenance-complete**: creation and verification both run the
 *   fail-closed provenance gate.
 */
import { randomUUID } from "node:crypto";
import type { ContentHash, EpistemicState, Timestamp, Uuid } from "@aise/shared-contracts";
import { canonicalContentHash } from "../canonical.js";
import { ReconstructionError } from "../errors.js";
import { isFiniteNumber } from "../validate.js";
import { MAX_POINTS_PER_CLOUD, type PointCloudPoint } from "../reconstruction/engine.js";
import { validateArtifactProvenance, type ArtifactProvenance } from "./provenance.js";

export const POINT_CLOUD_FORMAT_VERSION = "1.0";

/** The only epistemic state a reconstruction product may carry. */
export const RECONSTRUCTION_EPISTEMIC_STATE: EpistemicState = "INFERRED";

/** The declared coordinate frame of a foundation point cloud. */
export interface PointCloudCoordinateFrame {
  readonly type: "SESSION_LOCAL";
  readonly unit: "meters";
  /** Foundation clouds are never georeferenced; the claim must say so. */
  readonly georeferenced: boolean;
}

export interface PointCloudArtifact {
  readonly artifactId: Uuid;
  readonly kind: "point_cloud";
  readonly formatVersion: typeof POINT_CLOUD_FORMAT_VERSION;
  readonly sessionId: Uuid;
  readonly pointCount: number;
  readonly points: readonly PointCloudPoint[];
  readonly coordinateFrame: PointCloudCoordinateFrame;
  readonly provenance: ArtifactProvenance;
  readonly epistemicState: EpistemicState;
  /** Canonical content hash (see module doc). */
  readonly contentHash: ContentHash;
  /** Bookkeeping stamp (not part of the content hash). */
  readonly createdAt: Timestamp;
}

export interface CreatePointCloudArtifactInput {
  readonly sessionId: Uuid;
  readonly points: readonly PointCloudPoint[];
  readonly coordinateFrame: PointCloudCoordinateFrame;
  readonly provenance: ArtifactProvenance;
  /**
   * Epistemic state of the cloud. Only `INFERRED` (the default) is
   * accepted — anything else fails closed.
   */
  readonly epistemicState?: EpistemicState;
  /** Injectable artifact id (tests); default: fresh UUID. */
  readonly artifactId?: Uuid;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => string;
}

/** The canonical content of a cloud: everything except bookkeeping. */
export function pointCloudContent(artifact: PointCloudArtifact): Record<string, unknown> {
  return {
    formatVersion: artifact.formatVersion,
    kind: artifact.kind,
    sessionId: artifact.sessionId,
    points: artifact.points,
    coordinateFrame: artifact.coordinateFrame,
    provenance: artifact.provenance,
    epistemicState: artifact.epistemicState,
  };
}

/**
 * Creates a point-cloud artifact. Validates structure, provenance
 * and epistemic state, then computes the content hash. Throws
 * (fail closed) on any violation — an invalid cloud is never
 * returned.
 */
export function createPointCloudArtifact(
  input: CreatePointCloudArtifactInput,
): PointCloudArtifact {
  if (typeof input.sessionId !== "string" || input.sessionId.trim() === "") {
    throw new ReconstructionError("VALIDATION_FAILED", "point cloud must carry a sessionId");
  }
  if (!Array.isArray(input.points) || input.points.length === 0) {
    throw new ReconstructionError("EMPTY_RECONSTRUCTION", "a point-cloud artifact requires at least one point");
  }
  if (input.points.length > MAX_POINTS_PER_CLOUD) {
    throw new ReconstructionError("VALIDATION_FAILED", `point cloud exceeds the ${MAX_POINTS_PER_CLOUD}-point bound`, {
      details: { pointCount: input.points.length },
    });
  }
  validatePointCloudPoints(input.points);
  validateCoordinateFrame(input.coordinateFrame);
  validateArtifactProvenance(input.provenance);

  const epistemicState = input.epistemicState ?? RECONSTRUCTION_EPISTEMIC_STATE;
  if (epistemicState !== "INFERRED") {
    throw new ReconstructionError(
      "EPISTEMIC_STATE_INVALID",
      `a reconstruction point cloud may not claim epistemic state "${epistemicState}" — reconstruction output is INFERRED`,
      { details: { claimed: epistemicState, allowed: "INFERRED" } },
    );
  }

  const content: Record<string, unknown> = {
    formatVersion: POINT_CLOUD_FORMAT_VERSION,
    kind: "point_cloud",
    sessionId: input.sessionId,
    points: input.points,
    coordinateFrame: input.coordinateFrame,
    provenance: input.provenance,
    epistemicState,
  };

  return {
    artifactId: input.artifactId ?? randomUUID(),
    kind: "point_cloud",
    formatVersion: POINT_CLOUD_FORMAT_VERSION,
    sessionId: input.sessionId,
    pointCount: input.points.length,
    points: input.points,
    coordinateFrame: input.coordinateFrame,
    provenance: input.provenance,
    epistemicState,
    contentHash: canonicalContentHash(content),
    createdAt: (input.now ?? defaultNow)(),
  };
}

/**
 * Verifies a point-cloud artifact end-to-end: structure, epistemic
 * state, provenance, derived fields, and the recomputed content
 * hash. Throws `INTEGRITY_MISMATCH` when stored content was mutated,
 * and the structural codes otherwise. A cloud that passes is exactly
 * the cloud that was created.
 */
export function verifyPointCloudArtifact(artifact: PointCloudArtifact): void {
  if (artifact.kind !== "point_cloud") {
    throw new ReconstructionError("VALIDATION_FAILED", `expected a point_cloud artifact, got kind "${String(artifact.kind)}"`);
  }
  if (artifact.formatVersion !== POINT_CLOUD_FORMAT_VERSION) {
    throw new ReconstructionError("VALIDATION_FAILED", `unsupported point-cloud format version "${String(artifact.formatVersion)}"`);
  }
  if (!Array.isArray(artifact.points) || artifact.points.length === 0) {
    throw new ReconstructionError("EMPTY_RECONSTRUCTION", "a verified point cloud must carry at least one point");
  }
  validatePointCloudPoints(artifact.points);
  if (artifact.pointCount !== artifact.points.length) {
    throw new ReconstructionError("VALIDATION_FAILED", "pointCount does not match the points array length", {
      details: { declared: artifact.pointCount, actual: artifact.points.length },
    });
  }
  validateCoordinateFrame(artifact.coordinateFrame);
  if (artifact.epistemicState !== "INFERRED") {
    throw new ReconstructionError(
      "EPISTEMIC_STATE_INVALID",
      `a verified point cloud may not claim epistemic state "${String(artifact.epistemicState)}"`,
    );
  }
  validateArtifactProvenance(artifact.provenance);

  const recomputed = canonicalContentHash(pointCloudContent(artifact));
  if (recomputed !== artifact.contentHash) {
    throw new ReconstructionError("INTEGRITY_MISMATCH", "point-cloud content hash does not match its stored content", {
      details: { artifactId: artifact.artifactId, stored: artifact.contentHash, recomputed },
    });
  }
}

const defaultNow = (): string => new Date().toISOString();

function validatePointCloudPoints(points: readonly PointCloudPoint[]): void {
  points.forEach((point, index) => {
    for (const axis of ["x", "y", "z"] as const) {
      if (!isFiniteNumber(point[axis])) {
        throw new ReconstructionError("VALIDATION_FAILED", `point ${index} has a non-finite ${axis} coordinate`, {
          details: { index, axis },
        });
      }
    }
    for (const channel of ["r", "g", "b"] as const) {
      const value = point[channel];
      if (value === undefined) {
        continue;
      }
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 255) {
        throw new ReconstructionError("VALIDATION_FAILED", `point ${index} has an out-of-range ${channel} color channel`, {
          details: { index, channel, value },
        });
      }
    }
  });
}

function validateCoordinateFrame(frame: PointCloudCoordinateFrame): void {
  if (frame.type !== "SESSION_LOCAL") {
    throw new ReconstructionError("VALIDATION_FAILED", `unsupported coordinate frame type "${String(frame.type)}"`, {
      details: { allowed: "SESSION_LOCAL" },
    });
  }
  if (frame.unit !== "meters") {
    throw new ReconstructionError("VALIDATION_FAILED", `unsupported coordinate unit "${String(frame.unit)}"`, {
      details: { allowed: "meters" },
    });
  }
  if (frame.georeferenced !== false) {
    throw new ReconstructionError("VALIDATION_FAILED", "foundation point clouds must declare georeferenced: false", {
      details: { claimed: frame.georeferenced },
    });
  }
}
