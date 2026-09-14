/**
 * Depth/LiDAR fusion backend seam (AISE-012) — the second adapter class
 * behind the frozen AISE contract, demonstrating swappability: a local,
 * deterministic depth-map → point-cloud fusion engine instead of an external
 * world model.
 *
 * DEPTH-MAP EVIDENCE EXCHANGE FORMAT v1 (documented, deterministic):
 *   - UTF-8 text, line-oriented (`\n`; a trailing `\r` from CRLF is stripped).
 *   - Blank lines are ignored; lines whose first non-whitespace character is
 *     `#` are comments.
 *   - Every other line carries EXACTLY three whitespace-separated decimal
 *     numbers `x y z` — one 3D point, meters, right-handed y-up world frame
 *     (the engine-native frame). Numbers must parse to finite values.
 *   - Anything else is an invalid payload → the whole fusion fails
 *     INPUT_INCOMPATIBLE naming the offending evidence id (fail-closed).
 *
 * `DeterministicDepthFusionBackend` is REAL deterministic computation (no
 * inference, no network, no clock): it parses the evidence payloads and fuses
 * them verbatim, tagging every point with its source evidence id (per-point
 * provenance). Its execution environment identifies the backend honestly.
 */

import type { ReconstructionFailureCode } from "../../contract";
import type { WorldSculptCameraPose } from "../worldsculpt/backend";

/** Backend-reportable failure codes (PARTIAL is an outcome kind, not a backend state). */
export type DepthFusionBackendFailureCode = Exclude<ReconstructionFailureCode, "PARTIAL">;

/** Canonical fusion output frame. */
export const DEPTH_FUSION_FRAME = "y-up-metric" as const;

/** One depth-map evidence payload as provided to the backend. */
export interface DepthFrameInput {
  readonly evidenceContentId: string;
  /** Raw evidence bytes (the depth-map exchange format). */
  readonly bytes: Uint8Array | null;
}

export interface DepthFusionRequest {
  readonly frames: readonly DepthFrameInput[];
  /** Camera poses (already converted into the engine-native frame). */
  readonly cameraPoses: readonly WorldSculptCameraPose[];
  readonly coordinateFrame: typeof DEPTH_FUSION_FRAME;
}

/** One fused point with per-point provenance. */
export interface FusedPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sourceEvidenceId: string;
}

export interface DepthFusionExecutionEnvironment {
  readonly backend: string;
  readonly engineId: string;
  readonly engineVersion: string;
  readonly hardware: string | null;
}

export type DepthFusionResponse =
  | {
      readonly ok: true;
      readonly points: readonly FusedPoint[];
      readonly perFramePointCounts: readonly {
        readonly evidenceContentId: string;
        readonly pointCount: number;
      }[];
      readonly executionEnvironment: DepthFusionExecutionEnvironment;
    }
  | {
      readonly ok: false;
      readonly code: DepthFusionBackendFailureCode;
      readonly detail: string;
      readonly invalidEvidenceIds?: readonly string[];
    };

/** The fusion engine-facing seam. */
export interface DepthFusionBackend {
  readonly backendId: string;
  invoke(request: DepthFusionRequest): Promise<DepthFusionResponse>;
}

/** Parse depth-map exchange format bytes; null = invalid payload. */
export function parseDepthMapPoints(
  bytes: Uint8Array,
): [number, number, number][] | null {
  const text = new TextDecoder().decode(bytes);
  const points: [number, number, number][] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length !== 3) {
      return null;
    }
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const z = Number(parts[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
    points.push([x, y, z]);
  }
  return points;
}

/**
 * Deterministic depth fusion: parses each frame's payload, fuses the points
 * verbatim in frame order and tags every point with its source evidence id.
 * Bytes missing or malformed for any frame → INPUT_INCOMPATIBLE naming the
 * evidence id(s). No clock, no randomness, no network.
 */
export class DeterministicDepthFusionBackend implements DepthFusionBackend {
  readonly backendId = "deterministic-depth-fusion";

  async invoke(request: DepthFusionRequest): Promise<DepthFusionResponse> {
    const points: FusedPoint[] = [];
    const perFramePointCounts: { evidenceContentId: string; pointCount: number }[] = [];
    const invalidIds: string[] = [];
    for (const frame of request.frames) {
      if (frame.bytes === null) {
        invalidIds.push(frame.evidenceContentId);
        continue;
      }
      const parsed = parseDepthMapPoints(frame.bytes);
      if (parsed === null) {
        invalidIds.push(frame.evidenceContentId);
        continue;
      }
      for (const [x, y, z] of parsed) {
        points.push({ x, y, z, sourceEvidenceId: frame.evidenceContentId });
      }
      perFramePointCounts.push({
        evidenceContentId: frame.evidenceContentId,
        pointCount: parsed.length,
      });
    }
    if (invalidIds.length > 0) {
      return {
        ok: false,
        code: "INPUT_INCOMPATIBLE",
        detail:
          `depth-map evidence payload is missing or not valid depth-map exchange format v1 for ` +
          `${invalidIds.length} evidence id(s): ${invalidIds.join(", ")}`,
        invalidEvidenceIds: invalidIds,
      };
    }
    return {
      ok: true,
      points,
      perFramePointCounts,
      executionEnvironment: {
        backend: this.backendId,
        engineId: "aise-depth-lidar-fusion",
        engineVersion: "1.0.0",
        hardware: "cpu-deterministic",
      },
    };
  }
}
