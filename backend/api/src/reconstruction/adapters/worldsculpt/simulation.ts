/**
 * Deterministic WorldSculpt simulation backend (AISE-012) — TEST/DEMO
 * support that ships with the adapter package for offline operation.
 *
 * HONESTY: this backend performs NO inference. It synthesizes object
 * candidates deterministically from the engine request (one candidate per
 * input frame, fixed tetrahedral meshes, identity transforms with a frame
 * offset) and STAMPS every response with
 * `executionEnvironment.backend = "deterministic-simulation"` so downstream
 * artifacts can never be presented as real WorldSculpt inference. Tests may
 * alternatively script explicit responses (the script's last entry repeats)
 * to exercise adapter normalization over known engine outputs.
 *
 * Determinism: identical requests → byte-identical responses; no clock, no
 * randomness, no I/O.
 */

import type {
  WorldSculptBackend,
  WorldSculptInferenceRequest,
  WorldSculptInferenceResponse,
  WorldSculptObjectCandidate,
} from "./backend";

/** Fixed unit tetrahedron (local object frame): 4 vertices, 4 faces. */
const TETRA_VERTICES: readonly number[] = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
const TETRA_FACES: readonly number[] = [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3];

/** 4×4 row-major identity with translation (x, 0, 0). */
function identityWithXOffset(x: number): readonly number[] {
  return [1, 0, 0, x, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export interface DeterministicWorldSculptOptions {
  /** Scripted responses; the last entry repeats. Default: synthesize. */
  readonly responses?: readonly WorldSculptInferenceResponse[];
}

export class DeterministicWorldSculptBackend implements WorldSculptBackend {
  readonly backendId = "deterministic-simulation";
  invokeCount = 0;
  private readonly responses: readonly WorldSculptInferenceResponse[] | undefined;

  constructor(options?: DeterministicWorldSculptOptions) {
    this.responses = options?.responses;
  }

  async invoke(
    request: WorldSculptInferenceRequest,
  ): Promise<WorldSculptInferenceResponse> {
    this.invokeCount += 1;
    if (this.responses !== undefined && this.responses.length > 0) {
      const index = Math.min(this.invokeCount - 1, this.responses.length - 1);
      return this.responses[index] as WorldSculptInferenceResponse;
    }
    return synthesizeResponse(request);
  }
}

/** One observed-support candidate per frame, deterministic content. */
function synthesizeResponse(
  request: WorldSculptInferenceRequest,
): WorldSculptInferenceResponse {
  const candidates: WorldSculptObjectCandidate[] = request.frames.map((frame, index) => ({
    objectId: `object-${String(index + 1).padStart(3, "0")}`,
    semanticLabel: index % 2 === 0 ? "simulated-candidate" : null,
    confidence: 0.9,
    observedSupport: 1,
    generated: false,
    mesh: { vertices: TETRA_VERTICES, faces: TETRA_FACES },
    transform: identityWithXOffset(index),
    sourceFrameIndices: [index],
    quality: { faces: 4, vertices: 4 },
  }));
  return {
    ok: true,
    modelIdentity: "worldsculpt-simulated-checkpoint",
    checkpointId: null,
    objectCandidates: candidates,
    registrationDiagnostics: {
      mode: "per-frame-synthesis",
      frameCount: request.frames.length,
      posesProvided: request.cameraPoses.length,
      intrinsicsProvided: request.cameraIntrinsics !== null,
    },
    qualityMetrics: { candidates: candidates.length, simulated: true },
    uncertainty: [
      "simulated response — geometry is synthetic and carries no observational meaning",
    ],
    executionEnvironment: {
      backend: "deterministic-simulation",
      engineId: "worldsculpt",
      engineVersion: "simulated",
      hardware: "cpu-simulation",
    },
  };
}
