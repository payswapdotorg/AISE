/**
 * WorldSculptAdapter tests (AISE-012) — the core acceptance surface:
 *
 *  - LINEAGE: every artifact's sourceEvidenceIds ⊆ the request's evidence ids
 *    AND exactly the ids the engine candidates actually consumed;
 *  - EPISTEMIC LABELS: engine-flagged generated completion stays
 *    GENERATED_COMPLETION (never upgraded; mutation flips it), and engine
 *    output is NEVER DIRECTLY_OBSERVED;
 *  - DESCRIPTOR HONESTY: no backend → ACCESS_REQUIRED with a complete
 *    license/model-dependency inventory and GPU runtime requirements;
 *  - DETERMINISM: identical request + identical backend response →
 *    byte-identical outputs (adapter level and orchestrator level);
 *  - ORCHESTRATOR ROUND-TRIP: submit → worldsculpt selected → artifacts
 *    stored with lineage intact through the AISE-010 engine.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import type { CandidateArtifact } from "../../contract";
import { createReconstructionOrchestrator } from "../../orchestrator";
import { InMemoryArtifactStore, InMemoryJobStore } from "../../store";
import type { JobRecord } from "../../store";
import { contentIdOf, fixedClock, makeRequest, sequencedIdFactory } from "../../testkit";
import { WorldSculptAdapter, WORLDSCULPT_LICENSE_INVENTORY } from "./adapter";
import type {
  WorldSculptBackend,
  WorldSculptInferenceRequest,
  WorldSculptInferenceResponse,
} from "./backend";
import { DeterministicWorldSculptBackend } from "./simulation";

/** The success branch of the engine response union. */
type WorldSculptSuccess = Extract<WorldSculptInferenceResponse, { ok: true }>;

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

const IDS = [
  contentIdOf("ws-frame-1"),
  contentIdOf("ws-frame-2"),
  contentIdOf("ws-frame-3"),
  contentIdOf("ws-frame-unused"),
] as const;

const REFERENCES_ONLY_NOTE = "references-only preprocessing";

/** Scripted backend: fixed responses, records every engine request. */
class ScriptedBackend implements WorldSculptBackend {
  readonly backendId = "scripted-test";
  readonly requests: WorldSculptInferenceRequest[] = [];

  constructor(private readonly responses: readonly WorldSculptInferenceResponse[]) {}

  async invoke(request: WorldSculptInferenceRequest): Promise<WorldSculptInferenceResponse> {
    this.requests.push(request);
    const index = Math.min(this.requests.length - 1, this.responses.length - 1);
    return this.responses[index] as WorldSculptInferenceResponse;
  }
}

/** Two object candidates: obj-1 consumes frames 0+1, obj-2 consumes frame 2. Frame 3 is never consumed. */
function twoCandidateResponse(generatedSecond: boolean): WorldSculptSuccess {
  return {
    ok: true,
    modelIdentity: "ws-checkpoint-2026-01",
    checkpointId: "ckpt-2026-01",
    objectCandidates: [
      {
        objectId: "obj-1",
        semanticLabel: "column",
        confidence: 0.82,
        observedSupport: 0.8,
        generated: false,
        mesh: {
          vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
          faces: [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3],
        },
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        sourceFrameIndices: [0, 1],
        quality: { faces: 4 },
      },
      {
        objectId: "obj-2",
        semanticLabel: null,
        confidence: 0.55,
        observedSupport: 0.4,
        generated: generatedSecond,
        mesh: {
          vertices: [5, 0, 0, 6, 0, 0, 5, 1, 0, 5, 0, 1],
          faces: [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3],
        },
        transform: [1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        sourceFrameIndices: [2],
        quality: null,
      },
    ],
    registrationDiagnostics: { residualRms: 0.012 },
    qualityMetrics: { objects: 2 },
    uncertainty: ["occluded backfaces extrapolated"],
    executionEnvironment: {
      backend: "deterministic-simulation",
      engineId: "worldsculpt",
      engineVersion: "0.4.0-sim",
      hardware: "cpu-simulation",
    },
  };
}

function wsRequest(): ReturnType<typeof makeRequest> {
  return makeRequest({
    evidenceContentIds: [...IDS],
    requestedRepresentations: ["per_object_geometry", "mesh", "semantic_candidates"],
  });
}

function executionOf(artifact: { qualityDiagnostics?: Record<string, unknown> | null }): {
  backend: string;
} {
  return (artifact.qualityDiagnostics as { execution: { backend: string } }).execution;
}

/* ------------------------------------------------------------------ */
/* Lineage (core acceptance)                                            */
/* ------------------------------------------------------------------ */

describe("WorldSculptAdapter: lineage and normalization", () => {
  test("artifact source evidence ids are exactly the engine-consumed frames (lineage)", async () => {
    const adapter = new WorldSculptAdapter({
      backend: new ScriptedBackend([twoCandidateResponse(true)]),
    });
    const outcome = await adapter.execute(wsRequest());
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    const artifacts = outcome.artifacts;
    expect(artifacts.map((artifact) => artifact.representationType)).toEqual([
      "per_object_geometry",
      "per_object_geometry",
      "mesh",
      "semantic_candidates",
    ]);
    const [obj1, obj2, mesh, semantic] = artifacts;

    // Exactly the consumed evidence (never the untouched 4th frame).
    expect(obj1?.sourceEvidenceIds).toEqual([IDS[0], IDS[1]]);
    expect(obj2?.sourceEvidenceIds).toEqual([IDS[2]]);
    expect(mesh?.sourceEvidenceIds).toEqual([IDS[0], IDS[1], IDS[2]]);
    expect(semantic?.sourceEvidenceIds).toEqual([IDS[0], IDS[1]]);
    for (const artifact of artifacts) {
      expect(
        artifact.sourceEvidenceIds?.every((id) => (IDS as readonly string[]).includes(id)) ?? false,
      ).toBe(true);
      expect(artifact.sourceEvidenceIds?.includes(IDS[3]) ?? true).toBe(false);
      expect(artifact.modelIdentity).toBe("ws-checkpoint-2026-01");
      expect(artifact.parameterDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(executionOf(artifact).backend).toBe("deterministic-simulation");
      expect(artifact.coordinateFrame).toBe("worldsculpt-y-up-metric");
      expect(artifact.scaleDeclaration).toBe("metric-meters");
    }
  });

  test("aggregate scene mesh applies object transforms (hand-computed vertices and face offsets)", async () => {
    const adapter = new WorldSculptAdapter({
      backend: new ScriptedBackend([twoCandidateResponse(true)]),
    });
    const outcome = await adapter.execute(wsRequest());
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    const mesh = outcome.artifacts.find((artifact) => artifact.representationType === "mesh");
    const parameters = mesh?.parameters as {
      vertices: number[];
      faces: number[];
      vertexCount: number;
      faceCount: number;
    };
    // obj-1: identity transform; obj-2: translated by +10 in x.
    expect(parameters.vertices).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1,
      15, 0, 0, 16, 0, 0, 15, 1, 0, 15, 0, 1,
    ]);
    // obj-2 faces are offset by obj-1's 4 vertices.
    expect(parameters.faces.slice(0, 3)).toEqual([0, 1, 2]);
    expect(parameters.faces.slice(12, 15)).toEqual([4, 5, 6]);
    expect(parameters.vertexCount).toBe(8);
    expect(parameters.faceCount).toBe(8);
  });

  test("per-object artifacts record the engine transform verbatim plus the frame-convention transform", async () => {
    const adapter = new WorldSculptAdapter({
      backend: new ScriptedBackend([twoCandidateResponse(true)]),
    });
    const outcome = await adapter.execute(wsRequest());
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    const obj2 = outcome.artifacts[1];
    expect(obj2?.transforms?.[0]?.kind).toBe("engine-object-to-world");
    expect(obj2?.transforms?.[0]?.parameters.matrix4x4RowMajor).toEqual([
      1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);
    expect(obj2?.transforms?.[1]?.kind).toBe("aise-to-engine-frame");
  });

  test("without an evidence bytes reader the adapter proceeds references-only with an explicit note", async () => {
    const adapter = new WorldSculptAdapter({
      backend: new ScriptedBackend([twoCandidateResponse(true)]),
    });
    const outcome = await adapter.execute(wsRequest());
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    for (const artifact of outcome.artifacts) {
      expect(artifact.limitations?.join(" ") ?? "").toContain(REFERENCES_ONLY_NOTE);
    }
    const backend = new ScriptedBackend([twoCandidateResponse(true)]);
    const withReader = new WorldSculptAdapter({
      backend,
      evidenceReader: {
        read: async () => new TextEncoder().encode("frame"),
      },
    });
    const read = await withReader.execute(wsRequest());
    expect(read.kind).toBe("success");
    if (read.kind === "success") {
      expect(read.artifacts[0]?.limitations?.join(" ") ?? "").not.toContain(REFERENCES_ONLY_NOTE);
    }
  });

  test("an evidence id whose bytes cannot be read → INPUT_INCOMPATIBLE naming the id", async () => {
    const adapter = new WorldSculptAdapter({
      backend: new ScriptedBackend([twoCandidateResponse(true)]),
      evidenceReader: {
        read: async (contentId) =>
          contentId === IDS[1] ? null : new TextEncoder().encode("frame"),
      },
    });
    const outcome = await adapter.execute(wsRequest());
    expect(outcome).toEqual({
      kind: "failure",
      code: "INPUT_INCOMPATIBLE",
      detail: expect.stringContaining(IDS[1]) as unknown as string,
      missingEvidenceIds: [IDS[1]],
    });
  });
});

/* ------------------------------------------------------------------ */
/* Epistemic labels                                                     */
/* ------------------------------------------------------------------ */

describe("WorldSculptAdapter: epistemic labels", () => {
  test("engine-flagged generated completion is preserved as GENERATED_COMPLETION, never upgraded", async () => {
    const adapter = new WorldSculptAdapter({
      backend: new ScriptedBackend([twoCandidateResponse(true)]),
    });
    const outcome = await adapter.execute(wsRequest());
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    const [obj1, obj2, mesh] = outcome.artifacts;
    expect(obj1?.regions?.[0]?.epistemicLabel).toBe("RECONSTRUCTED_FROM_OBSERVED_EVIDENCE");
    expect(obj2?.regions?.[0]?.epistemicLabel).toBe("GENERATED_COMPLETION");
    expect(obj2?.regions?.[0]?.note).toContain("never upgraded");
    const meshObj2Region = mesh?.regions?.find((region) => region.regionId === "obj-2#generated-completion");
    expect(meshObj2Region?.epistemicLabel).toBe("GENERATED_COMPLETION");
    // Engine output is NEVER directly observed.
    for (const artifact of outcome.artifacts) {
      expect(
        artifact.regions?.every((region) => region.epistemicLabel !== "DIRECTLY_OBSERVED") ?? true,
      ).toBe(true);
    }
  });

  test("mutation: flipping the engine's generated flag flips the epistemic label", async () => {
    const flipped = new WorldSculptAdapter({
      backend: new ScriptedBackend([twoCandidateResponse(false)]),
    });
    const outcome = await flipped.execute(wsRequest());
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") {
      return;
    }
    const obj2 = outcome.artifacts[1];
    expect(obj2?.regions?.[0]?.epistemicLabel).toBe("RECONSTRUCTED_FROM_OBSERVED_EVIDENCE");
    expect(obj2?.regions?.[0]?.epistemicLabel).not.toBe("GENERATED_COMPLETION");
  });
});

/* ------------------------------------------------------------------ */
/* Descriptor honesty (license inventory, availability)                 */
/* ------------------------------------------------------------------ */

describe("WorldSculptAdapter: descriptor honesty", () => {
  test("no backend configured → ACCESS_REQUIRED (not READY) with gated-weight license inventory and GPU runtime", () => {
    const adapter = new WorldSculptAdapter();
    expect(adapter.descriptor.availability).toBe("ACCESS_REQUIRED");
    expect(adapter.descriptor.availability).not.toBe("READY");
    expect(adapter.descriptor.licenseTerms?.gatedWeights).toBe("true");
    expect(adapter.descriptor.licenseTerms?.name).toBe(WORLDSCULPT_LICENSE_INVENTORY.license.name);
    expect(adapter.descriptor.licenseTerms?.termsRef).toBe(WORLDSCULPT_LICENSE_INVENTORY.license.termsRef);
    expect(adapter.descriptor.executionRequirements?.gpu).toBe("true");
    expect(WORLDSCULPT_LICENSE_INVENTORY.license.gatedWeights).toBe(true);
    expect(WORLDSCULPT_LICENSE_INVENTORY.runtimeRequirements.gpu).toBe(true);
    expect(WORLDSCULPT_LICENSE_INVENTORY.modelDependencies.length).toBeGreaterThan(0);
  });

  test("a configured backend → READY", () => {
    const adapter = new WorldSculptAdapter({ backend: new ScriptedBackend([]) });
    expect(adapter.descriptor.availability).toBe("READY");
  });

  test("execute without a backend fails closed as ACCESS_REQUIRED", async () => {
    const adapter = new WorldSculptAdapter();
    const outcome = await adapter.execute(wsRequest());
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.code).toBe("ACCESS_REQUIRED");
      expect(outcome.detail).toContain("no WorldSculpt backend is configured");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Conversion wiring into the engine seam                               */
/* ------------------------------------------------------------------ */

describe("WorldSculptAdapter: camera/pose/scale conversion into the engine request", () => {
  test("AISE intrinsics and poses are converted deterministically before invocation", async () => {
    const backend = new ScriptedBackend([twoCandidateResponse(true)]);
    const adapter = new WorldSculptAdapter({
      backend,
      camera: {
        intrinsics: {
          fxPixels: 640,
          fyPixels: 720,
          cxPixels: 640,
          cyPixels: 360,
          widthPixels: 1280,
          heightPixels: 720,
        },
        poses: [
          {
            position: [1000, -2000, 3000],
            rotation: [
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1],
            ],
            unit: "millimeter",
          },
        ],
      },
    });
    await adapter.execute(wsRequest());
    const engineRequest = backend.requests[0];
    expect(engineRequest?.cameraIntrinsics).toEqual({
      fx: 0.5,
      fy: 1,
      cx: 0.5,
      cy: 0.5,
      widthPixels: 1280,
      heightPixels: 720,
    });
    expect(engineRequest?.cameraPoses[0]?.position).toEqual([1, -2, 3]);
    expect(engineRequest?.cameraPoses[0]?.rotation).toEqual([
      [1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
    ]);
    expect(engineRequest?.coordinateFrame).toBe("worldsculpt-y-up-metric");
    expect(engineRequest?.scaleMode).toBe("metric-meters");
    expect(engineRequest?.frames.map((frame) => frame.evidenceContentId)).toEqual([...IDS]);
    expect(engineRequest?.timeoutMs).toBe(30_000);
    expect(engineRequest?.captureSessionId).toBe("session-capture-1");
  });
});

/* ------------------------------------------------------------------ */
/* Failure mapping and output validation                                */
/* ------------------------------------------------------------------ */

describe("WorldSculptAdapter: failure semantics", () => {
  test("a non-metric scale constraint → INPUT_INCOMPATIBLE (engine is metric only)", async () => {
    const adapter = new WorldSculptAdapter({
      backend: new ScriptedBackend([twoCandidateResponse(true)]),
    });
    const outcome = await adapter.execute({
      ...wsRequest(),
      scaleConstraint: "imperial-feet",
    });
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.code).toBe("INPUT_INCOMPATIBLE");
      expect(outcome.detail).toContain("imperial-feet");
    }
  });

  test("backend failure outcomes map 1:1 to contract failure codes", async () => {
    const adapter = new WorldSculptAdapter({
      backend: new ScriptedBackend([
        { ok: false, code: "UNAVAILABLE", detail: "weights not present on host", diagnostics: { gpu: "missing" } },
      ]),
    });
    const outcome = await adapter.execute(wsRequest());
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.code).toBe("UNAVAILABLE");
      expect(outcome.detail).toContain("weights not present on host");
    }
  });

  test("malformed engine output → OUTPUT_INVALID with a deterministic detail", async () => {
    const good = twoCandidateResponse(true);
    const badTransform = {
      ...good,
      objectCandidates: [
        { ...good.objectCandidates[0]!, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0] },
      ],
    } as unknown as WorldSculptInferenceResponse;
    const badCode = {
      ok: false,
      code: "NOT_A_CODE",
      detail: "broken",
      diagnostics: {},
    } as unknown as WorldSculptInferenceResponse;
    const cases: { response: WorldSculptInferenceResponse; expectedDetailPart: string }[] = [
      { response: { ...good, modelIdentity: "" }, expectedDetailPart: "modelIdentity" },
      { response: badTransform, expectedDetailPart: "transform" },
      { response: badCode, expectedDetailPart: "failure code" },
    ];
    for (const { response, expectedDetailPart } of cases) {
      const adapter = new WorldSculptAdapter({ backend: new ScriptedBackend([response]) });
      const outcome = await adapter.execute(wsRequest());
      expect(outcome.kind).toBe("failure");
      if (outcome.kind === "failure") {
        expect(outcome.code).toBe("OUTPUT_INVALID");
        expect(outcome.detail).toContain(expectedDetailPart);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Determinism                                                          */
/* ------------------------------------------------------------------ */

describe("WorldSculptAdapter: determinism", () => {
  test("identical request + identical backend response → byte-identical outcomes", async () => {
    const response = twoCandidateResponse(true);
    const first = await new WorldSculptAdapter({
      backend: new ScriptedBackend([response]),
    }).execute(wsRequest());
    const second = await new WorldSculptAdapter({
      backend: new ScriptedBackend([response]),
    }).execute(wsRequest());
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
  });

  test("parameter digest is stable per configuration and sensitive to configuration changes", async () => {
    const response = twoCandidateResponse(true);
    const base = await new WorldSculptAdapter({
      backend: new ScriptedBackend([response]),
    }).execute(wsRequest());
    const repeat = await new WorldSculptAdapter({
      backend: new ScriptedBackend([response]),
    }).execute(wsRequest());
    const scoped = await new WorldSculptAdapter({
      backend: new ScriptedBackend([response]),
      requestedScope: ["object_candidates"],
    }).execute(wsRequest());
    expect(base.kind).toBe("success");
    expect(repeat.kind).toBe("success");
    expect(scoped.kind).toBe("success");
    if (base.kind !== "success" || repeat.kind !== "success" || scoped.kind !== "success") {
      return;
    }
    expect(base.artifacts[0]?.parameterDigest).toBe(repeat.artifacts[0]?.parameterDigest);
    expect(base.artifacts[0]?.parameterDigest).not.toBe(scoped.artifacts[0]?.parameterDigest);
  });
});

/* ------------------------------------------------------------------ */
/* Orchestrator round-trip (AISE-010 engine with the adapter registered) */
/* ------------------------------------------------------------------ */

describe("WorldSculptAdapter: orchestrator round-trip with lineage intact", () => {
  function makeOrchestrator() {
    return createReconstructionOrchestrator({
      providers: [new WorldSculptAdapter({ backend: new DeterministicWorldSculptBackend() })],
      jobStore: new InMemoryJobStore(),
      artifactStore: new InMemoryArtifactStore(),
      clock: fixedClock,
      idFactory: sequencedIdFactory("id"),
    });
  }

  test("visual evidence job selects worldsculpt and stores lineage-carrying artifacts", async () => {
    const orchestrator = makeOrchestrator();
    const request = makeRequest({
      requestedRepresentations: ["mesh"],
      declaredInputModalities: ["still_image"],
      evidenceSeeds: ["ws-rt-1", "ws-rt-2", "ws-rt-3"],
    });
    const submitted = await orchestrator.submit(request);
    expect(submitted.state).toBe("dispatching");
    expect(submitted.selection?.selectedProviderId).toBe("worldsculpt");
    const completed = await orchestrator.runToCompletion(submitted.jobId);
    expect(completed.state).toBe("succeeded");
    expect(completed.artifactIds.length).toBeGreaterThan(0);
    for (const artifactId of completed.artifactIds) {
      const artifact: CandidateArtifact | null = await orchestrator.getArtifact(artifactId);
      expect(artifact).not.toBeNull();
      if (artifact === null) {
        continue;
      }
      expect(artifact.providerId).toBe("worldsculpt");
      expect(artifact.providerVersion).toBe("0.4.0");
      expect(artifact.adapterVersion).toBe("1.0.0");
      expect(artifact.modelIdentity).toBe("worldsculpt-simulated-checkpoint");
      expect(artifact.parameterDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(
        artifact.sourceEvidenceIds.every((id) => request.evidenceContentIds.includes(id)),
      ).toBe(true);
      expect(
        artifact.regions.every((region) => region.epistemicLabel !== "DIRECTLY_OBSERVED"),
      ).toBe(true);
      const diagnostics = artifact.qualityDiagnostics as { execution: { backend: string } } | null;
      expect(diagnostics?.execution.backend).toBe("deterministic-simulation");
    }
  });

  test("two full runs over fresh stores produce byte-identical job and artifact records", async () => {
    async function runOnce(): Promise<{ job: JobRecord; artifacts: CandidateArtifact[] }> {
      const orchestrator = makeOrchestrator();
      const request = makeRequest({
        requestedRepresentations: ["mesh"],
        declaredInputModalities: ["still_image"],
        evidenceSeeds: ["ws-rt-1", "ws-rt-2"],
      });
      const job = await orchestrator.runToCompletion((await orchestrator.submit(request)).jobId);
      const artifacts: CandidateArtifact[] = [];
      for (const artifactId of job.artifactIds) {
        const artifact = await orchestrator.getArtifact(artifactId);
        if (artifact !== null) {
          artifacts.push(artifact);
        }
      }
      return { job, artifacts };
    }

    const first = await runOnce();
    const second = await runOnce();
    expect(canonicalJsonStringify(first.job)).toBe(canonicalJsonStringify(second.job));
    expect(canonicalJsonStringify(first.artifacts)).toBe(canonicalJsonStringify(second.artifacts));
  });
});
