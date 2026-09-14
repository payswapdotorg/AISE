/**
 * Depth/LiDAR fusion reconstruction adapter (AISE-012) — the second provider
 * class behind the frozen AISE contract.
 *
 * Consumes depth-map evidence (+ optional camera poses) and produces ONE
 * point-cloud candidate artifact with per-point provenance to the source
 * evidence ids. The fusion itself lives behind the `DepthFusionBackend` seam
 * (backend.ts); the default backend is REAL deterministic in-process
 * computation, so the descriptor's `availability: "READY"` is honest without
 * any external engine. Epistemic label: fused sensor geometry is
 * `RECONSTRUCTED_FROM_OBSERVED_EVIDENCE` (computed from observed evidence,
 * never `DIRECTLY_OBSERVED`).
 *
 * DETERMINISM: identical requests + identical evidence bytes → byte-identical
 * artifact outputs.
 */

import { parameterDigestOf } from "../../contract";
import type {
  ProviderArtifactOutput,
  ProviderDescriptor,
  ReconstructionOutcome,
  ReconstructionProvider,
  ReconstructionRequest,
} from "../../contract";
import { sha256Hex } from "../../../lib/hash";
import type { EvidenceBytesReader } from "../worldsculpt/backend";
import {
  convertPoseToEngineFrame,
  type AiseCameraPose,
} from "../worldsculpt/conversion";
import type { DepthFusionBackend, DepthFrameInput } from "./backend";
import { DEPTH_FUSION_FRAME, DeterministicDepthFusionBackend } from "./backend";

export const DEPTH_LIDAR_PROVIDER_ID = "depth-lidar-fusion";
export const DEPTH_LIDAR_PROVIDER_VERSION = "1.0.0";
export const DEPTH_LIDAR_ADAPTER_VERSION = "1.0.0";

export interface DepthLidarFusionAdapterConfig {
  /** Fusion backend; defaults to the deterministic in-process backend. */
  readonly backend?: DepthFusionBackend;
  /** Evidence bytes reader — REQUIRED for execution (depth bytes are the input). */
  readonly evidenceReader?: EvidenceBytesReader;
  /** AISE-convention camera poses, converted deterministically per request. */
  readonly cameraPoses?: readonly AiseCameraPose[];
}

const DEPTH_LIMITATIONS: readonly string[] = [
  "per-point measurement uncertainty is not propagated (AISE-013)",
  "points are fused verbatim in the declared world frame — no cross-frame registration refinement",
];

export class DepthLidarFusionAdapter implements ReconstructionProvider {
  readonly descriptor: ProviderDescriptor;
  private readonly backend: DepthFusionBackend;
  private readonly evidenceReader: EvidenceBytesReader | undefined;
  private readonly cameraPoses: readonly AiseCameraPose[];

  constructor(config: DepthLidarFusionAdapterConfig = {}) {
    this.backend = config.backend ?? new DeterministicDepthFusionBackend();
    this.evidenceReader = config.evidenceReader;
    this.cameraPoses = config.cameraPoses ?? [];
    this.descriptor = {
      providerId: DEPTH_LIDAR_PROVIDER_ID,
      providerVersion: DEPTH_LIDAR_PROVIDER_VERSION,
      adapterVersion: DEPTH_LIDAR_ADAPTER_VERSION,
      supportedInputModalities: ["depth_map", "camera_poses"],
      supportedOutputModalities: ["point_cloud"],
      // Honest: the deterministic fusion backend is real local computation.
      availability: "READY",
      requiredInputMetadata: ["contentId", "depthMapExchangeV1"],
      coordinateFrames: [DEPTH_FUSION_FRAME, "site-grid-metric"],
      scaleModes: ["metric-meters"],
      sceneCapabilities: ["depth-map-fusion"],
      objectCapabilities: ["point-cloud-export"],
      uncertaintyCapabilities: ["per-point-source-evidence-id"],
      executionRequirements: {
        gpu: "false",
        runtime: "deterministic-in-process",
        note: "first-party deterministic computation — no third-party runtime",
      },
      networkAccessRequirements: { inference: "none" },
      licenseTerms: {
        name: "AISE-internal",
        gatedWeights: "false",
        termsRef: "repository:backend/api/src/reconstruction/adapters/depth-lidar",
        note: "first-party deterministic implementation — no third-party model dependencies",
      },
      costLatencyCharacteristics: { status: "not-benchmarked", qualification: "AISE-019" },
      benchmarkProfile: { status: "not-qualified", owner: "AISE-019" },
    };
  }

  async execute(request: ReconstructionRequest): Promise<ReconstructionOutcome> {
    if (this.evidenceReader === undefined) {
      return {
        kind: "failure",
        code: "INPUT_INCOMPATIBLE",
        detail:
          `no evidence bytes reader is wired for depth fusion — depth-map bytes are required input; ` +
          `${request.evidenceContentIds.length} evidence id(s) could not be read: ` +
          `${request.evidenceContentIds.join(", ")}`,
        missingEvidenceIds: [...request.evidenceContentIds],
      };
    }

    /* -- Preprocessing: read the depth-map evidence bytes --------------- */
    const frames: DepthFrameInput[] = [];
    const unreadableIds: string[] = [];
    for (const contentId of request.evidenceContentIds) {
      const bytes = await this.evidenceReader.read(contentId);
      if (bytes === null) {
        unreadableIds.push(contentId);
      }
      frames.push({ evidenceContentId: contentId, bytes });
    }
    if (unreadableIds.length > 0) {
      return {
        kind: "failure",
        code: "INPUT_INCOMPATIBLE",
        detail:
          `evidence bytes are not readable for ${unreadableIds.length} content id(s): ` +
          `${unreadableIds.join(", ")} — wire an evidence bytes reader over the capture store`,
        missingEvidenceIds: unreadableIds,
      };
    }

    /* -- Pose conversion + backend invocation --------------------------- */
    const cameraPoses = this.cameraPoses.map((pose, index) =>
      convertPoseToEngineFrame(pose, index),
    );
    let response: DepthFusionResponseAwaited;
    try {
      response = await this.backend.invoke({
        frames,
        cameraPoses,
        coordinateFrame: DEPTH_FUSION_FRAME,
      });
    } catch (error) {
      return {
        kind: "failure",
        code: "EXECUTION_FAILED",
        detail: `the depth fusion backend threw instead of reporting a typed outcome (${
          error instanceof Error ? error.name : "unknown error"
        })`,
      };
    }
    if (!response.ok) {
      return {
        kind: "failure",
        code: response.code,
        detail: `the depth fusion backend reported ${response.code}: ${response.detail}`,
        ...(response.invalidEvidenceIds === undefined
          ? {}
          : { missingEvidenceIds: [...response.invalidEvidenceIds] }),
      };
    }

    /* -- Output normalization: one point-cloud candidate artifact ------- */
    const parameterDigest = parameterDigestOf({
      adapterVersion: DEPTH_LIDAR_ADAPTER_VERSION,
      backend: { backendId: this.backend.backendId },
      formatVersion: "depth-map-exchange-v1",
      coordinateFrame: DEPTH_FUSION_FRAME,
      frameCount: frames.length,
      frames: frames.map((frame) => ({
        evidenceContentId: frame.evidenceContentId,
        bytesSha256: sha256Hex(frame.bytes as Uint8Array),
      })),
      cameraPoses,
    });

    // Lineage: exactly the evidence ids that yielded at least one point.
    const sourceEvidenceIds = response.perFramePointCounts
      .filter((entry) => entry.pointCount > 0)
      .map((entry) => entry.evidenceContentId);

    const artifact: ProviderArtifactOutput = {
      representationType: "point_cloud",
      sourceEvidenceIds,
      modelIdentity: `${response.executionEnvironment.engineId}@${response.executionEnvironment.engineVersion}`,
      parameterDigest,
      coordinateFrame: DEPTH_FUSION_FRAME,
      transforms: cameraPoses.map((pose) => ({
        kind: "camera-pose-y-up-metric",
        parameters: {
          frameIndex: pose.frameIndex,
          position: [...pose.position],
          rotation: pose.rotation,
        },
      })),
      scaleDeclaration: "metric-meters",
      regions: [
        {
          regionId: "fused-depth-cloud",
          epistemicLabel: "RECONSTRUCTED_FROM_OBSERVED_EVIDENCE",
          note: "points fused verbatim from observed depth-map evidence",
        },
      ],
      parameters: {
        // Per-point provenance: [x, y, z, sourceEvidenceId].
        points: response.points.map((point) => [
          point.x,
          point.y,
          point.z,
          point.sourceEvidenceId,
        ]),
      },
      qualityDiagnostics: {
        execution: { ...response.executionEnvironment },
        perFramePointCounts: response.perFramePointCounts.map((entry) => ({ ...entry })),
        totalPointCount: response.points.length,
      },
      limitations: [...DEPTH_LIMITATIONS],
    };
    return { kind: "success", artifacts: [artifact] };
  }
}

/** Depth fusion responses never need an AbortSignal; alias for readability. */
type DepthFusionResponseAwaited = Awaited<ReturnType<DepthFusionBackend["invoke"]>>;
