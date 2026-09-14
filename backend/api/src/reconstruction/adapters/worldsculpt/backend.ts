/**
 * WorldSculpt backend seam (AISE-012) — the engine-facing boundary.
 *
 * AUTHORITY DISCIPLINE (docs/worldsculpt-integration-strategy.md,
 * spec/reconstruction-engine-contract.md):
 *
 *  - AISE builds AROUND WorldSculpt, never becomes it. This seam is the ONLY
 *    place WorldSculpt-native shapes exist; the adapter (adapter.ts) owns all
 *    translation between these shapes and the frozen AISE contract
 *    (reconstruction/contract.ts). Removing WorldSculpt removes this file and
 *    the adapter — NO AISE data-model change.
 *  - HONESTY CONSTRAINT: this sandbox/repo ships NO GPU, NO WorldSculpt
 *    weights and NO inference endpoint. The seam therefore ships (a)
 *    `HttpWorldSculptBackend` — a REAL endpoint invocation (fetch + timeout +
 *    typed failure mapping), configurable but NOT exercised against any live
 *    endpoint by this repository, and (b) `DeterministicWorldSculptBackend`
 *    (simulation.ts) — an offline deterministic simulation whose responses
 *    always identify themselves via
 *    `executionEnvironment.backend = "deterministic-simulation"` so
 *    simulated output can never be presented as real inference.
 *  - NEVER THROWS: `invoke` always resolves to a typed outcome
 *    (`WorldSculptInferenceResponse` is a success/failure union mapped to the
 *    spec's failure codes). A backend that throws is an adapter defect and is
 *    defensively converted by the adapter to `EXECUTION_FAILED`.
 *  - LICENSE/DEPENDENCY ISOLATION: no WorldSculpt license, weight or CUDA
 *    assumption may leak into AISE semantics; third-party constraints live
 *    only in the adapter's descriptor metadata (license inventory, see
 *    adapter.ts).
 *
 * Engine-native conventions (the conversion target of conversion.ts):
 *   coordinate frame "worldsculpt-y-up-metric": right-handed, +X right,
 *   +Y up, −Z forward (camera looks down −Z), camera-to-world, METERS.
 *   Camera intrinsics are normalized (focal lengths and principal point in
 *   units of image width/height). Object transforms are 4×4 row-major
 *   local-object → engine-world matrices, recorded VERBATIM by the adapter.
 */

import { Buffer } from "node:buffer";
import type { ReconstructionFailureCode } from "../../contract";

/** Backend-reportable failure codes (PARTIAL is an outcome kind, not a backend state). */
export type WorldSculptBackendFailureCode = Exclude<ReconstructionFailureCode, "PARTIAL">;

/** Canonical engine coordinate frame identifier. */
export const WORLDSCULPT_ENGINE_FRAME = "worldsculpt-y-up-metric" as const;

/** Canonical engine scale declaration. */
export const WORLDSCULPT_ENGINE_SCALE = "metric-meters" as const;

/* ------------------------------------------------------------------ */
/* Evidence bytes access (injected, optional)                          */
/* ------------------------------------------------------------------ */

/**
 * Read verbatim evidence source bytes by content id. `null` means the content
 * id has no registered bytes. Production wiring adapts the capture store;
 * tests inject stubs. Absent entirely → the adapter preprocesses frames as
 * references-only with an explicit diagnostic note.
 */
export interface EvidenceBytesReader {
  read(contentId: string): Promise<Uint8Array | null>;
}

/* ------------------------------------------------------------------ */
/* Engine-native request                                               */
/* ------------------------------------------------------------------ */

/** One input frame: the AISE evidence reference (+ inline bytes when available). */
export interface WorldSculptFrameInput {
  readonly evidenceContentId: string;
  /** Inline frame bytes; null when no evidence bytes reader is wired. */
  readonly bytes: Uint8Array | null;
  /** Preprocessing note carried to the engine (e.g. references-only). */
  readonly note: string | null;
}

/** Normalized pinhole intrinsics (focal/principal in width/height units). */
export interface WorldSculptCameraIntrinsics {
  readonly fx: number;
  readonly fy: number;
  readonly cx: number;
  readonly cy: number;
  readonly widthPixels: number;
  readonly heightPixels: number;
}

/** 3×3 row-major rotation matrix. */
export type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

/** Camera-to-world pose in the engine frame (see header conventions). */
export interface WorldSculptCameraPose {
  /** Index into the request's frame list this pose belongs to. */
  readonly frameIndex: number;
  readonly position: readonly [number, number, number];
  readonly rotation: Matrix3;
}

export interface WorldSculptInferenceRequest {
  readonly captureSessionId: string | null;
  readonly frames: readonly WorldSculptFrameInput[];
  readonly cameraIntrinsics: WorldSculptCameraIntrinsics | null;
  readonly cameraPoses: readonly WorldSculptCameraPose[];
  readonly coordinateFrame: typeof WORLDSCULPT_ENGINE_FRAME;
  readonly scaleMode: typeof WORLDSCULPT_ENGINE_SCALE;
  /** Engine-requested output scope (e.g. object candidates, scene mesh). */
  readonly requestedScope: readonly string[];
  /** Declared execution-timeout policy (milliseconds), carried not enforced here. */
  readonly timeoutMs: number;
  readonly modelCheckpoint: string | null;
}

/* ------------------------------------------------------------------ */
/* Engine-native response                                              */
/* ------------------------------------------------------------------ */

/** Triangular mesh in the object's LOCAL frame (flat xyz / vertex-index triples). */
export interface WorldSculptMesh {
  readonly vertices: readonly number[];
  readonly faces: readonly number[];
}

/** One reconstructed object candidate. */
export interface WorldSculptObjectCandidate {
  readonly objectId: string;
  readonly semanticLabel: string | null;
  /** Engine-reported confidence, [0, 1]. */
  readonly confidence: number | null;
  /** Fraction of geometry backed by observations, [0, 1]. */
  readonly observedSupport: number | null;
  /** ENGINE FLAG: geometry generated/completed beyond observed support. */
  readonly generated: boolean;
  readonly mesh: WorldSculptMesh | null;
  /** 4×4 row-major local→world transform in the engine frame (verbatim). */
  readonly transform: readonly number[];
  /** Lineage: indices into the request's frames this candidate consumed. */
  readonly sourceFrameIndices: readonly number[];
  readonly quality: Readonly<Record<string, unknown>> | null;
}

/** Where and how the response was produced — the honesty marker. */
export interface WorldSculptExecutionEnvironment {
  /** Backend identity, e.g. "http" or "deterministic-simulation". */
  readonly backend: string;
  readonly engineId: string;
  readonly engineVersion: string;
  readonly hardware: string | null;
}

/**
 * The typed outcome of one backend invocation. Success carries the object
 * candidates and diagnostics; failure carries a spec failure code, a
 * deterministic detail string and diagnostics (endpoint, status, timeout —
 * NEVER a credential value).
 */
export type WorldSculptInferenceResponse =
  | {
      readonly ok: true;
      readonly modelIdentity: string;
      readonly checkpointId: string | null;
      readonly objectCandidates: readonly WorldSculptObjectCandidate[];
      readonly registrationDiagnostics: Readonly<Record<string, unknown>>;
      readonly qualityMetrics: Readonly<Record<string, unknown>>;
      readonly uncertainty: readonly string[];
      readonly executionEnvironment: WorldSculptExecutionEnvironment;
    }
  | {
      readonly ok: false;
      readonly code: WorldSculptBackendFailureCode;
      readonly detail: string;
      readonly diagnostics: Readonly<Record<string, unknown>>;
    };

/** The engine-facing seam: one invocation, always a typed outcome. */
export interface WorldSculptBackend {
  /** Backend identity for configuration capture and execution metadata. */
  readonly backendId: string;
  invoke(
    request: WorldSculptInferenceRequest,
    signal?: AbortSignal,
  ): Promise<WorldSculptInferenceResponse>;
}

/* ------------------------------------------------------------------ */
/* HTTP backend                                                        */
/* ------------------------------------------------------------------ */

export interface HttpWorldSculptBackendConfig {
  /** WorldSculpt inference endpoint (POST target). */
  readonly endpointUrl: string;
  /** Request timeout in milliseconds (enforced via AbortSignal.timeout). */
  readonly timeoutMs: number;
  /** Checkpoint identity to pin (configuration capture / version pinning). */
  readonly modelCheckpoint?: string;
  /** NAME of the environment variable holding the API key (never the value). */
  readonly apiKeyEnvVar?: string;
}

/** Minimal fetch shape (injectable for deterministic tests). */
export type FetchLike = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<Response>;

/**
 * REAL endpoint invocation behind the seam. HTTP/network outcomes map to the
 * spec's failure codes:
 *
 *   timeout / abort / network error / other 5xx → EXECUTION_FAILED
 *   401 / 403 → ACCESS_REQUIRED
 *   404 / 503 → UNAVAILABLE
 *   other 4xx (input rejection) → INPUT_INCOMPATIBLE
 *
 * The API key is read from the configured environment variable NAME only and
 * is sent exclusively in the `authorization` header — it is NEVER placed in
 * details, diagnostics or payloads. When the variable is configured but unset
 * the backend fails ACCESS_REQUIRED naming the variable name (not its value).
 *
 * The response body is expected to BE a `WorldSculptInferenceResponse` in
 * wire form (the adapter validates it and reports OUTPUT_INVALID on malformed
 * engine output). A non-JSON body is EXECUTION_FAILED (broken endpoint).
 */
export class HttpWorldSculptBackend implements WorldSculptBackend {
  readonly backendId = "http";

  constructor(
    private readonly config: HttpWorldSculptBackendConfig,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
    private readonly envLookup: (name: string) => string | undefined = (name) => process.env[name],
  ) {}

  async invoke(
    request: WorldSculptInferenceRequest,
    callerSignal?: AbortSignal,
  ): Promise<WorldSculptInferenceResponse> {
    const apiKey =
      this.config.apiKeyEnvVar === undefined
        ? null
        : (this.envLookup(this.config.apiKeyEnvVar) ?? null);
    if (this.config.apiKeyEnvVar !== undefined && apiKey === null) {
      return {
        ok: false,
        code: "ACCESS_REQUIRED",
        detail:
          `API key environment variable '${this.config.apiKeyEnvVar}' is not set — ` +
          "the WorldSculpt endpoint requires credentials",
        diagnostics: { backend: this.backendId, apiKeyEnvVar: this.config.apiKeyEnvVar },
      };
    }

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (apiKey !== null) {
      headers.authorization = `Bearer ${apiKey}`;
    }

    const timeoutSignal = AbortSignal.timeout(this.config.timeoutMs);
    const signal =
      callerSignal === undefined ? timeoutSignal : AbortSignal.any([callerSignal, timeoutSignal]);
    const startedAtMs = Date.now();

    let response: Response;
    try {
      response = await this.fetchImpl(this.config.endpointUrl, {
        method: "POST",
        headers,
        body: serializeWireRequest(request),
        signal,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAtMs;
      const timedOut =
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      return {
        ok: false,
        code: "EXECUTION_FAILED",
        detail: timedOut
          ? `request to the WorldSculpt endpoint timed out after ${this.config.timeoutMs}ms`
          : `the WorldSculpt endpoint could not be reached (${describeError(error)})`,
        diagnostics: {
          backend: this.backendId,
          endpointUrl: this.config.endpointUrl,
          timeoutMs: this.config.timeoutMs,
          reason: timedOut ? "timeout" : "network-error",
          durationMs,
        },
      };
    }

    if (response.status === 401 || response.status === 403) {
      return httpFailure(this.config.endpointUrl, response, "ACCESS_REQUIRED", "the endpoint rejected the credentials");
    }
    if (response.status === 404 || response.status === 503) {
      return httpFailure(this.config.endpointUrl, response, "UNAVAILABLE", "the WorldSculpt endpoint is not available");
    }
    if (response.status >= 400 && response.status < 500) {
      return httpFailure(this.config.endpointUrl, response, "INPUT_INCOMPATIBLE", "the endpoint rejected the request payload");
    }
    if (response.status < 200 || response.status >= 300) {
      return httpFailure(this.config.endpointUrl, response, "EXECUTION_FAILED", "the endpoint reported a server error");
    }

    let body: unknown;
    try {
      body = JSON.parse(await response.text());
    } catch {
      return {
        ok: false,
        code: "EXECUTION_FAILED",
        detail: "the WorldSculpt endpoint returned a non-JSON body",
        diagnostics: {
          backend: this.backendId,
          endpointUrl: this.config.endpointUrl,
          httpStatus: response.status,
          reason: "non-json-body",
          durationMs: Date.now() - startedAtMs,
        },
      };
    }
    return body as WorldSculptInferenceResponse;
  }
}

function httpFailure(
  endpointUrl: string,
  response: Response,
  code: WorldSculptBackendFailureCode,
  reason: string,
): WorldSculptInferenceResponse {
  return {
    ok: false,
    code,
    detail: `${reason} (HTTP ${response.status})`,
    diagnostics: {
      backend: "http",
      endpointUrl,
      httpStatus: response.status,
    },
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return "unknown network failure";
}

/**
 * Deterministic wire serialization: fixed key order, frames as content
 * references with optional base64 inline bytes. The task id is deliberately
 * absent (orchestration identity, not an engine input); the capture session
 * id is carried for engine-side session correlation.
 */
function serializeWireRequest(request: WorldSculptInferenceRequest): string {
  const wire = {
    captureSessionId: request.captureSessionId,
    frames: request.frames.map((frame) => ({
      evidenceContentId: frame.evidenceContentId,
      bytesBase64: frame.bytes === null ? null : Buffer.from(frame.bytes).toString("base64"),
      note: frame.note,
    })),
    cameraIntrinsics: request.cameraIntrinsics,
    cameraPoses: request.cameraPoses,
    coordinateFrame: request.coordinateFrame,
    scaleMode: request.scaleMode,
    requestedScope: [...request.requestedScope],
    timeoutMs: request.timeoutMs,
    modelCheckpoint: request.modelCheckpoint,
  };
  return JSON.stringify(wire);
}
