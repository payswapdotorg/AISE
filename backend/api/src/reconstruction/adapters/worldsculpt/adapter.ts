/**
 * WorldSculpt reconstruction adapter (AISE-012) — the swappable engine
 * adapter behind the frozen AISE contract (reconstruction/contract.ts).
 *
 * Implements the full provider contract per docs/worldsculpt-integration-
 * strategy.md §AISE-012:
 *
 *   - ADAPTER PACKAGING/ISOLATION: all WorldSculpt knowledge lives in this
 *     package (backend seam + conversion + this adapter). Removing WorldSculpt
 *     removes the package; no AISE data-model change (tested in registry).
 *   - INPUT PREPROCESSING from AISE evidence: frames are packaged as evidence
 *     content references with inline bytes when an EvidenceBytesReader is
 *     injected, otherwise references-only with an explicit diagnostic note.
 *   - CAMERA/POSE/SCALE CONVERSION: conversion.ts (deterministic, unit-tested).
 *   - OUTPUT NORMALIZATION: engine object candidates → per_object_geometry,
 *     mesh (aggregate scene mesh) and semantic_candidates artifacts with
 *     verbatim transforms, quality diagnostics and uncertainty passthrough.
 *   - CANDIDATE OBJECT REGISTRATION + LINEAGE: each artifact's
 *     sourceEvidenceIds is EXACTLY the request evidence the producing engine
 *     candidates consumed (backend-reported frame indices → content ids).
 *   - PROVENANCE AND VERSION PINNING: provider identity/version, model
 *     identity from the backend response, parameterDigest = sha-256 over the
 *     canonical request+configuration capture.
 *   - FAILURE/TIMEOUT/RESOURCE DIAGNOSTICS: backend failures map 1:1 to the
 *     contract's typed failure codes; a missing backend is ACCESS_REQUIRED.
 *   - LICENSE/MODEL DEPENDENCY INVENTORY: declared on the descriptor as
 *     passthrough metadata (gated weights, GPU runtime) — third-party
 *     constraints never enter AISE semantics.
 *
 * EPISTEMIC DISCIPLINE: engine output is NEVER `DIRECTLY_OBSERVED`.
 * Observed-supported candidate geometry is `RECONSTRUCTED_FROM_OBSERVED_
 * EVIDENCE`; engine-flagged generated/completed geometry is
 * `GENERATED_COMPLETION` and is never upgraded. Semantic classifications are
 * `INFERRED`.
 *
 * DETERMINISM: identical requests + identical backend responses →
 * byte-identical artifact outputs (no clock, no randomness, no I/O beyond
 * the injected readers/backend).
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
import type {
  EvidenceBytesReader,
  WorldSculptBackend,
  WorldSculptFrameInput,
  WorldSculptInferenceRequest,
  WorldSculptInferenceResponse,
  WorldSculptObjectCandidate,
} from "./backend";
import { WORLDSCULPT_ENGINE_FRAME, WORLDSCULPT_ENGINE_SCALE } from "./backend";
import {
  CONVENTION_ROTATION_X180,
  convertIntrinsicsToEngine,
  convertPoseToEngineFrame,
  engineScaleDeclaration,
  applyTransform4x4,
  type AiseCameraIntrinsics,
  type AiseCameraPose,
} from "./conversion";

export const WORLDSCULPT_PROVIDER_ID = "worldsculpt";
export const WORLDSCULPT_PROVIDER_VERSION = "0.4.0";
export const WORLDSCULPT_ADAPTER_VERSION = "1.0.0";

const DEFAULT_REQUESTED_SCOPE: readonly string[] = [
  "object_candidates",
  "scene_mesh",
  "semantic_candidates",
];

const REFERENCES_ONLY_NOTE =
  "references-only preprocessing: no evidence bytes reader is wired, so the engine received content references without inline bytes";

/* ------------------------------------------------------------------ */
/* License / model dependency inventory (isolated third-party metadata) */
/* ------------------------------------------------------------------ */

export interface WorldSculptLicenseInventory {
  readonly engine: string;
  readonly license: { readonly name: string; readonly gatedWeights: boolean; readonly termsRef: string };
  readonly modelDependencies: readonly {
    readonly name: string;
    readonly weights: "gated" | "open";
    readonly licenseRef: string;
  }[];
  readonly runtimeRequirements: {
    readonly gpu: boolean;
    readonly cudaStack: string;
    readonly vramGb: number;
  };
  readonly isolation: string;
}

/**
 * The WorldSculpt third-party constraint inventory. Carried on the provider
 * descriptor as passthrough metadata ONLY — never interpreted by AISE
 * selection or semantics (spec: "License/dependency isolation").
 */
export const WORLDSCULPT_LICENSE_INVENTORY: WorldSculptLicenseInventory = {
  engine: "worldsculpt",
  license: {
    name: "WorldSculpt Research License",
    gatedWeights: true,
    termsRef: "third-party:worldsculpt/license-terms",
  },
  modelDependencies: [
    {
      name: "worldsculpt-multi-object-checkpoint",
      weights: "gated",
      licenseRef: "third-party:worldsculpt/license-terms",
    },
  ],
  runtimeRequirements: { gpu: true, cudaStack: "required-by-engine", vramGb: 24 },
  isolation:
    "third-party license/model dependency metadata — passthrough on the descriptor, never interpreted by AISE semantics",
};

/* ------------------------------------------------------------------ */
/* Adapter configuration                                               */
/* ------------------------------------------------------------------ */

export interface WorldSculptAdapterConfig {
  /** The backend seam. Absent → descriptor ACCESS_REQUIRED, execute fails closed. */
  readonly backend?: WorldSculptBackend;
  /** Optional evidence bytes reader enabling inline frame bytes. */
  readonly evidenceReader?: EvidenceBytesReader;
  /** AISE-convention camera model (converted deterministically per request). */
  readonly camera?: {
    readonly intrinsics?: AiseCameraIntrinsics;
    readonly poses?: readonly AiseCameraPose[];
  };
  /** Engine-requested scope override (default: candidates + mesh + semantics). */
  readonly requestedScope?: readonly string[];
  /** Checkpoint pin (falls back to the backend's own configuration). */
  readonly modelCheckpoint?: string;
}

/* ------------------------------------------------------------------ */
/* Descriptor                                                          */
/* ------------------------------------------------------------------ */

function worldSculptDescriptor(backend: WorldSculptBackend | undefined): ProviderDescriptor {
  const inventory = WORLDSCULPT_LICENSE_INVENTORY;
  return {
    providerId: WORLDSCULPT_PROVIDER_ID,
    providerVersion: WORLDSCULPT_PROVIDER_VERSION,
    adapterVersion: WORLDSCULPT_ADAPTER_VERSION,
    supportedInputModalities: ["still_image", "video", "camera_poses"],
    supportedOutputModalities: ["per_object_geometry", "mesh", "semantic_candidates"],
    availability: backend === undefined ? "ACCESS_REQUIRED" : "READY",
    requiredInputMetadata: ["contentId", "mediaType"],
    coordinateFrames: [WORLDSCULPT_ENGINE_FRAME, "site-grid-metric"],
    scaleModes: ["metric-meters", "metric-millimeter"],
    sceneCapabilities: ["multi-object-compositional", "cluttered-scenes", "severe-occlusion"],
    objectCapabilities: ["object-level-meshes", "metric-world-placement", "semantic-candidates"],
    uncertaintyCapabilities: ["per-candidate-confidence", "observed-support-fraction"],
    executionRequirements: {
      gpu: String(inventory.runtimeRequirements.gpu),
      cudaStack: inventory.runtimeRequirements.cudaStack,
      vramGb: String(inventory.runtimeRequirements.vramGb),
      note: "third-party engine runtime requirements — isolated from AISE semantics",
    },
    networkAccessRequirements: {
      inference: "endpoint-or-configured-local-backend",
      apiKey: "bearer-token-via-environment-variable-name",
    },
    licenseTerms: {
      name: inventory.license.name,
      gatedWeights: String(inventory.license.gatedWeights),
      termsRef: inventory.license.termsRef,
      modelDependencies: inventory.modelDependencies
        .map((dependency) => `${dependency.name}:${dependency.weights}`)
        .join(","),
      note: inventory.isolation,
    },
    costLatencyCharacteristics: { status: "not-benchmarked", qualification: "AISE-019" },
    benchmarkProfile: { status: "not-qualified", owner: "AISE-019" },
  };
}

/* ------------------------------------------------------------------ */
/* Engine response validation (OUTPUT_INVALID boundary)                */
/* ------------------------------------------------------------------ */

type ValidatedSuccess = Extract<WorldSculptInferenceResponse, { ok: true }>;
type ValidatedFailure = Extract<WorldSculptInferenceResponse, { ok: false }>;

type EngineResponseCheck =
  | { kind: "success"; response: ValidatedSuccess }
  | { kind: "failure"; response: ValidatedFailure }
  | { kind: "invalid"; detail: string };

const BACKEND_FAILURE_CODES: ReadonlySet<string> = new Set([
  "INPUT_INCOMPATIBLE",
  "RESOURCE_INSUFFICIENT",
  "EXECUTION_FAILED",
  "OUTPUT_INVALID",
  "QUALITY_INSUFFICIENT",
  "UNAVAILABLE",
  "ACCESS_REQUIRED",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Runtime validation of backend responses (the HTTP backend parses wire JSON;
 * nothing downstream may trust it). Malformed engine output → "invalid",
 * which the adapter reports as OUTPUT_INVALID with a deterministic detail.
 */
function checkEngineResponse(value: WorldSculptInferenceResponse): EngineResponseCheck {
  if (!isPlainObject(value)) {
    return { kind: "invalid", detail: "engine response must be an object" };
  }
  if (value.ok === false) {
    if (typeof value.code !== "string" || !BACKEND_FAILURE_CODES.has(value.code)) {
      return { kind: "invalid", detail: "engine failure response carries an unknown failure code" };
    }
    if (typeof value.detail !== "string") {
      return { kind: "invalid", detail: "engine failure response detail must be a string" };
    }
    return { kind: "failure", response: value };
  }
  if (typeof value.modelIdentity !== "string" || value.modelIdentity.length === 0) {
    return { kind: "invalid", detail: "engine response modelIdentity must be a non-empty string" };
  }
  if (value.checkpointId !== null && typeof value.checkpointId !== "string") {
    return { kind: "invalid", detail: "engine response checkpointId must be a string or null" };
  }
  if (!Array.isArray(value.objectCandidates)) {
    return { kind: "invalid", detail: "engine response objectCandidates must be an array" };
  }
  for (let index = 0; index < value.objectCandidates.length; index += 1) {
    const candidate = value.objectCandidates[index];
    const label = `engine response objectCandidates[${index}]`;
    if (!isPlainObject(candidate)) {
      return { kind: "invalid", detail: `${label} must be an object` };
    }
    if (typeof candidate.objectId !== "string" || candidate.objectId.length === 0) {
      return { kind: "invalid", detail: `${label}.objectId must be a non-empty string` };
    }
    if (candidate.semanticLabel !== null && typeof candidate.semanticLabel !== "string") {
      return { kind: "invalid", detail: `${label}.semanticLabel must be a string or null` };
    }
    if (candidate.confidence !== null && !isFiniteNumber(candidate.confidence)) {
      return { kind: "invalid", detail: `${label}.confidence must be a finite number or null` };
    }
    if (candidate.observedSupport !== null && !isFiniteNumber(candidate.observedSupport)) {
      return { kind: "invalid", detail: `${label}.observedSupport must be a finite number or null` };
    }
    if (typeof candidate.generated !== "boolean") {
      return { kind: "invalid", detail: `${label}.generated must be a boolean` };
    }
    if (!Array.isArray(candidate.transform) || candidate.transform.length !== 16) {
      return { kind: "invalid", detail: `${label}.transform must be 16 numbers (4×4 row-major)` };
    }
    if (candidate.transform.some((entry) => !isFiniteNumber(entry))) {
      return { kind: "invalid", detail: `${label}.transform entries must be finite numbers` };
    }
    if (!Array.isArray(candidate.sourceFrameIndices)) {
      return { kind: "invalid", detail: `${label}.sourceFrameIndices must be an array` };
    }
    if (candidate.sourceFrameIndices.some((entry) => !Number.isInteger(entry) || entry < 0)) {
      return { kind: "invalid", detail: `${label}.sourceFrameIndices entries must be non-negative integers` };
    }
    if (candidate.mesh !== null) {
      const mesh = candidate.mesh;
      if (!isPlainObject(mesh) || !Array.isArray(mesh.vertices) || !Array.isArray(mesh.faces)) {
        return { kind: "invalid", detail: `${label}.mesh must carry vertices and faces arrays` };
      }
      if (mesh.vertices.length % 3 !== 0 || mesh.vertices.some((v) => !isFiniteNumber(v))) {
        return { kind: "invalid", detail: `${label}.mesh.vertices must be finite xyz triples` };
      }
      const vertexCount = mesh.vertices.length / 3;
      if (
        mesh.faces.length % 3 !== 0 ||
        mesh.faces.some((f) => !Number.isInteger(f) || f < 0 || f >= vertexCount)
      ) {
        return { kind: "invalid", detail: `${label}.mesh.faces must index existing vertices` };
      }
    }
    if (candidate.quality !== null && !isPlainObject(candidate.quality)) {
      return { kind: "invalid", detail: `${label}.quality must be an object or null` };
    }
  }
  if (!isPlainObject(value.registrationDiagnostics)) {
    return { kind: "invalid", detail: "engine response registrationDiagnostics must be an object" };
  }
  if (!isPlainObject(value.qualityMetrics)) {
    return { kind: "invalid", detail: "engine response qualityMetrics must be an object" };
  }
  if (!Array.isArray(value.uncertainty) || value.uncertainty.some((u) => typeof u !== "string")) {
    return { kind: "invalid", detail: "engine response uncertainty must be an array of strings" };
  }
  const environment = value.executionEnvironment;
  if (
    !isPlainObject(environment) ||
    typeof environment.backend !== "string" ||
    environment.backend.length === 0 ||
    typeof environment.engineId !== "string" ||
    typeof environment.engineVersion !== "string" ||
    (environment.hardware !== null && typeof environment.hardware !== "string")
  ) {
    return { kind: "invalid", detail: "engine response executionEnvironment is malformed" };
  }
  return { kind: "success", response: value };
}

/* ------------------------------------------------------------------ */
/* Output normalization                                                */
/* ------------------------------------------------------------------ */

/** Deduplicated, ascending frame indices → evidence content ids (lineage). */
function lineageFrameIds(
  indices: readonly number[],
  frameIds: readonly string[],
): string[] {
  return [...new Set(indices)]
    .sort((a, b) => a - b)
    .map((index) => frameIds[index] as string);
}

/** Aggregate scene mesh: object meshes transformed into the engine world frame. */
function assembleSceneMesh(
  candidates: readonly { mesh: { vertices: readonly number[]; faces: readonly number[] }; transform: readonly number[] }[],
): { vertices: number[]; faces: number[] } | null {
  const vertices: number[] = [];
  const faces: number[] = [];
  for (const candidate of candidates) {
    const baseVertex = vertices.length / 3;
    for (let v = 0; v + 2 < candidate.mesh.vertices.length; v += 3) {
      const transformed = applyTransform4x4(candidate.transform, [
        candidate.mesh.vertices[v] as number,
        candidate.mesh.vertices[v + 1] as number,
        candidate.mesh.vertices[v + 2] as number,
      ]);
      vertices.push(transformed[0], transformed[1], transformed[2]);
    }
    for (let f = 0; f + 2 < candidate.mesh.faces.length; f += 3) {
      faces.push(
        (candidate.mesh.faces[f] as number) + baseVertex,
        (candidate.mesh.faces[f + 1] as number) + baseVertex,
        (candidate.mesh.faces[f + 2] as number) + baseVertex,
      );
    }
  }
  return vertices.length === 0 ? null : { vertices, faces };
}

/** Reproducible configuration capture (feeds the parameter digest). */
function configurationCapture(
  adapterVersion: string,
  backendId: string,
  engineRequest: WorldSculptInferenceRequest,
): Record<string, unknown> {
  return {
    adapterVersion,
    backend: { backendId },
    coordinateFrame: engineRequest.coordinateFrame,
    scaleMode: engineRequest.scaleMode,
    requestedScope: [...engineRequest.requestedScope],
    preprocessing: {
      mode: engineRequest.frames.some((frame) => frame.bytes !== null) ? "inline-bytes" : "references-only",
      frameCount: engineRequest.frames.length,
      frames: engineRequest.frames.map((frame) => ({
        evidenceContentId: frame.evidenceContentId,
        bytesSha256: frame.bytes === null ? null : sha256Hex(frame.bytes),
      })),
    },
    cameraIntrinsics: engineRequest.cameraIntrinsics,
    cameraPoses: engineRequest.cameraPoses,
    timeoutMs: engineRequest.timeoutMs,
    modelCheckpoint: engineRequest.modelCheckpoint,
  };
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

export class WorldSculptAdapter implements ReconstructionProvider {
  readonly descriptor: ProviderDescriptor;
  private readonly backend: WorldSculptBackend | undefined;
  private readonly evidenceReader: EvidenceBytesReader | undefined;
  private readonly config: WorldSculptAdapterConfig;

  constructor(config: WorldSculptAdapterConfig = {}) {
    this.config = config;
    this.backend = config.backend;
    this.evidenceReader = config.evidenceReader;
    this.descriptor = worldSculptDescriptor(this.backend);
  }

  async execute(request: ReconstructionRequest): Promise<ReconstructionOutcome> {
    if (this.backend === undefined) {
      return {
        kind: "failure",
        code: "ACCESS_REQUIRED",
        detail:
          "no WorldSculpt backend is configured — the adapter is registered but not usable; " +
          "configure HttpWorldSculptBackend (endpoint, timeout, credential env var) or an explicit simulation backend",
      };
    }

    /* -- Preprocessing: package AISE evidence as engine frames ----------- */
    const frames: WorldSculptFrameInput[] = [];
    const unreadableIds: string[] = [];
    if (this.evidenceReader === undefined) {
      for (const contentId of request.evidenceContentIds) {
        frames.push({ evidenceContentId: contentId, bytes: null, note: REFERENCES_ONLY_NOTE });
      }
    } else {
      for (const contentId of request.evidenceContentIds) {
        const bytes = await this.evidenceReader.read(contentId);
        if (bytes === null) {
          unreadableIds.push(contentId);
        }
        frames.push({ evidenceContentId: contentId, bytes, note: null });
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
    }

    /* -- Camera/pose/scale conversion into the engine-native frame ------ */
    const cameraIntrinsics =
      this.config.camera?.intrinsics === undefined
        ? null
        : convertIntrinsicsToEngine(this.config.camera.intrinsics);
    const cameraPoses = (this.config.camera?.poses ?? []).map((pose, index) =>
      convertPoseToEngineFrame(pose, index),
    );

    const scaleMode = engineScaleDeclaration(request.scaleConstraint);
    if (scaleMode === null) {
      return {
        kind: "failure",
        code: "INPUT_INCOMPATIBLE",
        detail:
          `scale constraint '${request.scaleConstraint}' is not supported by the WorldSculpt ` +
          "engine (metric only)",
      };
    }

    const engineRequest: WorldSculptInferenceRequest = {
      captureSessionId: request.captureSessionId,
      frames,
      cameraIntrinsics,
      cameraPoses,
      coordinateFrame: WORLDSCULPT_ENGINE_FRAME,
      scaleMode,
      requestedScope: [...(this.config.requestedScope ?? DEFAULT_REQUESTED_SCOPE)],
      timeoutMs: request.policyConstraints.timeoutMs,
      modelCheckpoint: this.config.modelCheckpoint ?? null,
    };

    /* -- Backend invocation (never a raw throw) -------------------------- */
    let response: WorldSculptInferenceResponse;
    try {
      response = await this.backend.invoke(engineRequest);
    } catch (error) {
      return {
        kind: "failure",
        code: "EXECUTION_FAILED",
        detail: `the WorldSculpt backend threw instead of reporting a typed outcome (${describeThrown(error)})`,
      };
    }

    const check = checkEngineResponse(response);
    if (check.kind === "invalid") {
      return { kind: "failure", code: "OUTPUT_INVALID", detail: check.detail };
    }
    if (check.kind === "failure") {
      return {
        kind: "failure",
        code: check.response.code,
        detail: `the WorldSculpt backend reported ${check.response.code}: ${check.response.detail}`,
      };
    }

    /* -- Output normalization ------------------------------------------- */
    const success = check.response;
    const frameIds = frames.map((frame) => frame.evidenceContentId);
    const referencesOnly = this.evidenceReader === undefined;
    const parameterDigest = parameterDigestOf(
      configurationCapture(WORLDSCULPT_ADAPTER_VERSION, this.backend.backendId, engineRequest),
    );
    const execution = {
      backend: success.executionEnvironment.backend,
      engineId: success.executionEnvironment.engineId,
      engineVersion: success.executionEnvironment.engineVersion,
      checkpointId: success.checkpointId,
      hardware: success.executionEnvironment.hardware,
    };
    const baseLimitations = [...success.uncertainty];
    if (referencesOnly) {
      baseLimitations.push(REFERENCES_ONLY_NOTE);
    }

    const outputs: ProviderArtifactOutput[] = [];
    const meshedCandidates: {
      candidate: WorldSculptObjectCandidate;
      mesh: { vertices: readonly number[]; faces: readonly number[] };
      frameIndices: readonly number[];
    }[] = [];

    for (const candidate of success.objectCandidates) {
      if (candidate.mesh !== null) {
        meshedCandidates.push({ candidate, mesh: candidate.mesh, frameIndices: candidate.sourceFrameIndices });
      }
      outputs.push({
        representationType: "per_object_geometry",
        sourceEvidenceIds: lineageFrameIds(candidate.sourceFrameIndices, frameIds),
        modelIdentity: success.modelIdentity,
        parameterDigest,
        coordinateFrame: WORLDSCULPT_ENGINE_FRAME,
        transforms: [
          { kind: "engine-object-to-world", parameters: { matrix4x4RowMajor: [...candidate.transform] } },
          {
            kind: "aise-to-engine-frame",
            parameters: {
              rotation: CONVENTION_ROTATION_X180,
              translation: [0, 0, 0],
              note: "AISE y-down/z-forward (unit-bearing poses) → engine y-up/−z-forward meters",
            },
          },
        ],
        scaleDeclaration: WORLDSCULPT_ENGINE_SCALE,
        regions: [
          candidate.generated
            ? {
                regionId: `${candidate.objectId}#generated-completion`,
                epistemicLabel: "GENERATED_COMPLETION",
                note: "engine-flagged generated/completed geometry beyond observed support — never upgraded",
              }
            : {
                regionId: `${candidate.objectId}#reconstructed`,
                epistemicLabel: "RECONSTRUCTED_FROM_OBSERVED_EVIDENCE",
                note: `engine-reported observed support: ${candidate.observedSupport ?? "unknown"}`,
              },
        ],
        parameters: {
          objectId: candidate.objectId,
          semanticLabel: candidate.semanticLabel,
          confidence: candidate.confidence,
          observedSupport: candidate.observedSupport,
          generated: candidate.generated,
          mesh: candidate.mesh,
        },
        qualityDiagnostics: {
          execution,
          registration: success.registrationDiagnostics,
          engineQualityMetrics: success.qualityMetrics,
          candidateQuality: candidate.quality,
        },
        limitations: baseLimitations,
      });
    }

    const sceneMesh = assembleSceneMesh(
      meshedCandidates.map(({ mesh, candidate }) => ({ mesh, transform: candidate.transform })),
    );
    if (sceneMesh !== null) {
      const sceneIndices = meshedCandidates.flatMap(({ frameIndices }) => frameIndices);
      outputs.push({
        representationType: "mesh",
        sourceEvidenceIds: lineageFrameIds(sceneIndices, frameIds),
        modelIdentity: success.modelIdentity,
        parameterDigest,
        coordinateFrame: WORLDSCULPT_ENGINE_FRAME,
        transforms: [
          {
            kind: "aise-to-engine-frame",
            parameters: {
              rotation: CONVENTION_ROTATION_X180,
              translation: [0, 0, 0],
              note: "AISE y-down/z-forward (unit-bearing poses) → engine y-up/−z-forward meters",
            },
          },
        ],
        scaleDeclaration: WORLDSCULPT_ENGINE_SCALE,
        regions: meshedCandidates.map(({ candidate }) => ({
          regionId: `${candidate.objectId}#${candidate.generated ? "generated-completion" : "reconstructed"}`,
          epistemicLabel: candidate.generated
            ? ("GENERATED_COMPLETION" as const)
            : ("RECONSTRUCTED_FROM_OBSERVED_EVIDENCE" as const),
          note: candidate.generated
            ? "engine-flagged generated/completed geometry — never upgraded"
            : "geometry reconstructed from observed evidence",
        })),
        parameters: {
          vertexCount: sceneMesh.vertices.length / 3,
          faceCount: sceneMesh.faces.length / 3,
          vertices: sceneMesh.vertices,
          faces: sceneMesh.faces,
        },
        qualityDiagnostics: {
          execution,
          registration: success.registrationDiagnostics,
          engineQualityMetrics: success.qualityMetrics,
        },
        limitations: baseLimitations,
      });
    }

    const labeled = success.objectCandidates.filter((candidate) => candidate.semanticLabel !== null);
    if (labeled.length > 0) {
      const semanticIndices = labeled.flatMap((candidate) => candidate.sourceFrameIndices);
      outputs.push({
        representationType: "semantic_candidates",
        sourceEvidenceIds: lineageFrameIds(semanticIndices, frameIds),
        modelIdentity: success.modelIdentity,
        parameterDigest,
        coordinateFrame: WORLDSCULPT_ENGINE_FRAME,
        transforms: [],
        scaleDeclaration: WORLDSCULPT_ENGINE_SCALE,
        regions: [
          {
            regionId: "semantic-candidates",
            epistemicLabel: "INFERRED",
            note: "semantic classifications inferred by the engine from observed frames — not direct observations",
          },
        ],
        parameters: {
          candidates: labeled.map((candidate) => ({
            objectId: candidate.objectId,
            semanticLabel: candidate.semanticLabel,
            confidence: candidate.confidence,
            generated: candidate.generated,
          })),
        },
        qualityDiagnostics: {
          execution,
          registration: success.registrationDiagnostics,
          engineQualityMetrics: success.qualityMetrics,
        },
        limitations: baseLimitations,
      });
    }

    return { kind: "success", artifacts: outputs };
  }
}

function describeThrown(error: unknown): string {
  return error instanceof Error ? `${error.name}` : "unknown error";
}
