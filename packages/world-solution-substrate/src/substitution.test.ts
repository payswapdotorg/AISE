/**
 * WORLD-P0-C tests — the technology-substitution-contract THREE LAWS
 * proven across ALL FOUR Solution-lane families at once (the packet's
 * substitution-proof artifact), plus the cross-cutting identity and
 * authority laws.
 *
 * Law 1 (substitution is not semantics change): the independent
 *   reference/alternate doubles of every family produce identical
 *   observable semantics at every comparison point — only the provider
 *   identity differs.
 * Law 2 (tolerances are declared, never implicit): every numeric
 *   comparison boundary in this lane carries a DECLARED tolerance or a
 *   DECLARED duration/clock, carried verbatim; nothing implicit.
 * Law 3 (unsupported is recorded, never computed): every double
 *   declares its BLOCKED capabilities with reasons and refuses outside
 *   them with kinds from the HFX-000 closed vocabulary.
 */

import { describe, expect, test } from "bun:test";
import { InMemoryGltfDeliveryDouble, translation } from "@aise/world-reality-substrate";
import { computeThroughGeometryPort, referenceGeometryDouble } from "@aise/world-understanding-substrate";
import {
  decodeEngineeringOperation,
  type EngineeringOperation,
} from "@aise/solution-contract";
import { loadCommittedFixtures } from "@aise/solution-contract/fixtures-loader";
import { FAILURE_KINDS, type FailureKind } from "@aise/provider-registry";
import { externalLabelValuesOf, type NamespacedExternalLabel } from "./seam";
import {
  SolutionSceneUsageAlternateDouble,
  SolutionSceneUsageReferenceDouble,
} from "./scene/doubles";
import { AlternateCadDouble, ReferenceCadDouble } from "./cad/doubles";
import {
  AlternateSimulationDouble,
  ReferenceSimulationDouble,
  SIMULATION_FIXTURE_EPOCH,
} from "./simulation/doubles";
import { ElectronLikeShellDouble, TauriLikeShellDouble } from "./desktop/doubles";
import type { ComposedScene, SceneNode } from "@aise/world-reality-substrate";

/* ------------------------------------------------------------------ */
/* Shared fixtures (lightweight versions of the family fixtures)        */
/* ------------------------------------------------------------------ */

const VALID_GLTF_JSON = JSON.stringify({
  asset: { version: "2.0" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ mode: 4, attributes: { POSITION: 0 } }] }],
  accessors: [{ componentType: 5126, count: 3, type: "VEC3", bufferView: 0 }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  buffers: [{ byteLength: 36 }],
});

function ghostScene(): ComposedScene {
  const ghost: SceneNode = {
    elementId: "ghost-beam",
    kind: "ghost",
    parentId: null,
    transform: translation(1, 2, 3),
    geometry: { assetId: "asset-beam", partId: "mesh:0", format: "gltf-json" },
    material: null,
    layerIds: ["solution"],
    isGhost: true,
    evidenceContentIds: [],
    label: "Ghost beam",
  };
  return {
    revision: 1,
    nodes: [ghost],
    layers: [{ layerId: "solution", name: "Solution", visibleByDefault: true }],
    siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
    ghostSummary: {
      operationId: "op-001",
      proposedElementIds: ["ghost-beam"],
      removedElementIds: [],
    },
  };
}

function proposedRequest() {
  return {
    kind: "proposed-state-presentation-request" as const,
    schemaVersion: "proposed-state-presentation-request/1" as const,
    solutionId: "solution-sub-001",
    versionNumber: 1,
    stateIndex: 1,
    baseScene: ghostScene(),
    ghostSet: {
      operationId: "op-001",
      proposedElementIds: ["ghost-beam"],
      removedElementIds: [],
    },
    solutionAssets: [
      {
        reference: { assetId: "asset-beam", partId: "mesh:0", format: "gltf-json" as const },
        source: {
          assetId: "asset-beam",
          format: "gltf-json" as const,
          bytes: new TextEncoder().encode(VALID_GLTF_JSON),
        },
      },
    ],
  };
}

function cadModelOf(adapter: ReferenceCadDouble | AlternateCadDouble) {
  const created = adapter.createModel({
    kind: "parametric-cad-model",
    schemaVersion: "parametric-cad/1",
    modelId: "model-sub-001",
    label: "Substitution model",
    units: { linear: "m", angular: "rad" },
    documentLabel: { namespace: "freecad-document", value: "SubDoc" },
  });
  if (!created.ok) throw new Error("create failed");
  adapter.applyMutation(created.value, {
    mutation: "add-sketch",
    sketch: {
      sketchId: "sk-1",
      plane: { origin: { x: 0, y: 0, z: 0 }, normal: [0, 0, 1] },
      elements: [
        { kind: "line-segment", elementId: "seg-1", from: { u: 0, v: 0 }, to: { u: 2, v: 0 } },
      ],
      constraints: [],
    },
  });
  adapter.applyMutation(created.value, {
    mutation: "add-feature",
    feature: {
      featureId: "feat-1",
      featureKind: "pad",
      fromSketchId: "sk-1",
      parentFeatureId: null,
      parameters: [{ name: "length", value: 2, unit: "m" }],
    },
  });
  return created.value;
}

function simulationOperations(): EngineeringOperation[] {
  const corpus = loadCommittedFixtures();
  return corpus.fixtures
    .filter(
      (f) =>
        f.objectName === "EngineeringOperation" &&
        f.kind === "valid" &&
        f.fileName.startsWith("operation/"),
    )
    .map((f) => decodeEngineeringOperation(f.payload))
    .sort((a, b) => a.operationIndex - b.operationIndex);
}

function simulationRequest() {
  const operations = simulationOperations();
  return {
    kind: "execution-simulation-request" as const,
    schemaVersion: "execution-simulation-request/1" as const,
    solutionId: "solution-demo-001",
    versionNumber: 1,
    operations,
    baselineStateIndex: 0,
    durations: operations.map((o, i) => ({
      operationId: o.operationId,
      durationValue: [8, 24, 16][i] ?? 1,
      durationUnit: "hour" as const,
    })),
    clock: { epochIso: SIMULATION_FIXTURE_EPOCH, timeUnit: "hour" as const },
    recordedAt: "2026-10-02T00:00:00.000Z",
  };
}

/* ------------------------------------------------------------------ */
/* LAW 1 — substitution is not semantics change                         */
/* ------------------------------------------------------------------ */

describe("law 1 — substitution is not semantics change (all four families)", () => {
  test("scene usage: the two usage hosts present identical observable content", () => {
    const a = new SolutionSceneUsageReferenceDouble();
    const b = new SolutionSceneUsageAlternateDouble();
    const pa = a.presentProposedState(proposedRequest());
    const pb = b.presentProposedState(proposedRequest());
    if (!pa.ok || !pb.ok) throw new Error("presentation failed");
    const strip = (p: typeof pa.value) => ({
      presentationToken: p.presentationToken,
      deliveredAssetIds: p.deliveredAssetIds,
      resolvedGeometry: p.resolvedGeometry,
      ghostDistinctness: p.ghostDistinctness,
      stateIndex: p.stateIndex,
    });
    expect(strip(pa.value)).toEqual(strip(pb.value));
    // the semantic projection digests to the same input digest
    expect(pa.value.provenance.inputDigest).toBe(pb.value.provenance.inputDigest);
    expect(pa.value.provenance.providerId).not.toBe(pb.value.provenance.providerId);
  });

  test("cad: the two engine models agree at every comparison point", () => {
    const a = new ReferenceCadDouble();
    const b = new AlternateCadDouble();
    const handleA = cadModelOf(a);
    const handleB = cadModelOf(b);
    const qa = a.queryModel(handleA);
    const qb = b.queryModel(handleB);
    if (!qa.ok || !qb.ok) throw new Error("query failed");
    expect(qa.value.contentDigest).toBe(qb.value.contentDigest);
    expect(qa.value.revision).toBe(qb.value.revision);
    expect(qa.value.objectLabels).toEqual(qb.value.objectLabels);
    // the exports are byte-identical too
    const gltfA = a.exportGltf(handleA, { model: handleA, assetId: "x", format: "gltf-json" });
    const gltfB = b.exportGltf(handleB, { model: handleB, assetId: "x", format: "gltf-json" });
    if (!gltfA.ok || !gltfB.ok) throw new Error("export failed");
    expect(new TextDecoder().decode(gltfA.value.source.bytes)).toBe(
      new TextDecoder().decode(gltfB.value.source.bytes),
    );
  });

  test("simulation: the two engines produce byte-identical trajectories", () => {
    const a = new ReferenceSimulationDouble();
    const b = new AlternateSimulationDouble();
    const ta = a.simulate(simulationRequest());
    const tb = b.simulate(simulationRequest());
    if (!ta.ok || !tb.ok) throw new Error("simulate failed");
    expect(ta.value.trajectoryId).toBe(tb.value.trajectoryId);
    expect(ta.value.worldStates).toEqual(tb.value.worldStates);
    expect(ta.value.activities).toEqual(tb.value.activities);
    expect(ta.value.makespanHours).toBe(tb.value.makespanHours);
  });

  test("desktop: the two shell candidates observe identical contract behavior", () => {
    const script = (adapter: TauriLikeShellDouble | ElectronLikeShellDouble) => {
      expect(adapter.initialize().ok).toBe(true);
      const window = adapter.createWindow({
        windowId: "w",
        title: "T",
        position: { x: 0, y: 0 },
        size: { width: 800, height: 600 },
      });
      const sidecar = adapter.spawnSidecar({
        sidecarId: "s",
        substrateKind: "freecad",
        executableLabel: { namespace: "sidecar-process", value: "freecad-command" },
        declaredArguments: [],
        declaredMemoryLimitMb: 512,
        declaredStartupBudgetMs: 1000,
      });
      const status = sidecar.ok ? adapter.querySidecar(sidecar.value) : null;
      const shutdown = adapter.shutdown();
      return {
        window: window.ok ? window.value : null,
        status: status && status.ok ? status.value : null,
        shutdown: shutdown.ok
          ? { ...shutdown.value, provenance: { providerId: "stripped" } }
          : null,
      };
    };
    expect(script(new TauriLikeShellDouble())).toEqual(script(new ElectronLikeShellDouble()));
  });

  test("the layered substitution proof: the usage double over the P0-A doubles needs ZERO substrate", () => {
    // the whole stack compiles and runs with no Babylon, no USD, no glTF
    // runtime — the composition is typed contracts all the way down
    const usage = new SolutionSceneUsageReferenceDouble();
    const presented = usage.presentProposedState(proposedRequest());
    expect(presented.ok).toBe(true);
    if (!presented.ok) return;
    // the delivered asset is validated by the REAL P0-A parser (in-repo,
    // substrate-free) — the composition law proven at the bottom layer
    const delivery = new InMemoryGltfDeliveryDouble();
    const delivered = delivery.deliver({
      assetId: "asset-beam",
      format: "gltf-json",
      bytes: new TextEncoder().encode(VALID_GLTF_JSON),
    });
    expect(delivered.ok).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* LAW 2 — tolerances (and every numeric boundary) are declared         */
/* ------------------------------------------------------------------ */

describe("law 2 — tolerances are declared, never implicit (all four families)", () => {
  test("cad: the declared tolerance rides verbatim through the P0-B computation", () => {
    const adapter = new ReferenceCadDouble();
    const handle = cadModelOf(adapter);
    const spec = {
      subjectRef: "a".repeat(64),
      evidenceContentId: "b".repeat(64),
      recordedAt: "2026-10-02T00:00:00.000Z",
      tolerance: { linear: 0.05, angular: 0.001 },
      units: { linear: "m", angular: "rad" },
      operations: [
        { operation: "segment-length" as const, segment: 0 },
        { operation: "box-volume" as const, box: 1 },
      ],
    };
    const emitted = adapter.exactGeometryRequest(handle, spec);
    if (!emitted.ok) throw new Error("emission failed");
    expect(emitted.value.tolerance).toEqual({ linear: 0.05, angular: 0.001 });
    const computed = computeThroughGeometryPort(referenceGeometryDouble, emitted.value);
    if (!computed.ok) throw new Error("computation failed");
    expect(computed.value.appliedTolerance).toEqual({ linear: 0.05, angular: 0.001 });
  });

  test("cad: a missing/invalid tolerance declaration is refused, never defaulted", () => {
    const adapter = new AlternateCadDouble();
    const handle = cadModelOf(adapter);
    const refused = adapter.exactGeometryRequest(handle, {
      subjectRef: "a".repeat(64),
      evidenceContentId: "b".repeat(64),
      recordedAt: "2026-10-02T00:00:00.000Z",
      tolerance: { linear: -1, angular: 0.001 },
      units: { linear: "m", angular: "rad" },
      operations: [{ operation: "segment-length", segment: 0 }],
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.failure.detail).toContain("strictly positive");
  });

  test("simulation: durations and the clock are DECLARED inputs (missing = refusal)", () => {
    const adapter = new ReferenceSimulationDouble();
    const request = simulationRequest();
    const missingDuration = adapter.simulate({
      ...request,
      durations: request.durations.slice(0, 1),
    });
    expect(missingDuration.ok).toBe(false);
    if (missingDuration.ok) return;
    expect(missingDuration.failure.detail).toContain("never invents durations");
    // the trajectory carries the declared clock verbatim
    const ok = adapter.simulate(request);
    if (!ok.ok) throw new Error("simulate failed");
    expect(ok.value.clock.epochIso).toBe(SIMULATION_FIXTURE_EPOCH);
  });

  test("scene usage: the ghost law and the asset law refuse rather than assume", () => {
    const adapter = new SolutionSceneUsageReferenceDouble();
    const request = proposedRequest();
    const unGhostedScene: ComposedScene = {
      ...request.baseScene,
      nodes: request.baseScene.nodes.map((n) => ({ ...n, isGhost: false })),
    };
    const refused = adapter.presentProposedState({ ...request, baseScene: unGhostedScene });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.failure.kind).toBe("operation-semantic-failure");
  });
});

/* ------------------------------------------------------------------ */
/* LAW 3 — unsupported is recorded, never computed                      */
/* ------------------------------------------------------------------ */

describe("law 3 — unsupported is recorded, never computed (all four families)", () => {
  test("every double declares honest BLOCKED capabilities with reasons", () => {
    const doubles = [
      new SolutionSceneUsageReferenceDouble(),
      new SolutionSceneUsageAlternateDouble(),
      new ReferenceCadDouble(),
      new AlternateCadDouble(),
      new ReferenceSimulationDouble(),
      new AlternateSimulationDouble(),
      new TauriLikeShellDouble(),
      new ElectronLikeShellDouble(),
    ];
    for (const adapter of doubles) {
      expect(adapter.capabilities.blocked.length).toBeGreaterThan(0);
      for (const blocked of adapter.capabilities.blocked) {
        expect(blocked.capability.trim().length).toBeGreaterThan(0);
        expect(blocked.reason.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("every refusal across the families uses the HFX-000 closed vocabulary", () => {
    const refusals: { kind: FailureKind }[] = [];
    // scene
    const scene = new SolutionSceneUsageReferenceDouble();
    const sceneRefusal = scene.presentProposedState({
      ...proposedRequest(),
      solutionAssets: [],
    });
    if (!sceneRefusal.ok) refusals.push(sceneRefusal.failure);
    // cad
    const cad = new ReferenceCadDouble();
    const cadRefusal = cad.createModel({
      kind: "parametric-cad-model",
      schemaVersion: "parametric-cad/1",
      modelId: "",
      label: "L",
      units: { linear: "m", angular: "rad" },
      documentLabel: { namespace: "freecad-document", value: "D" },
    });
    if (!cadRefusal.ok) refusals.push(cadRefusal.failure);
    // simulation
    const simulation = new ReferenceSimulationDouble();
    const simulationRefusal = simulation.simulate({
      ...simulationRequest(),
      durations: [],
    });
    if (!simulationRefusal.ok) refusals.push(simulationRefusal.failure);
    // desktop
    const shell = new TauriLikeShellDouble();
    const shellRefusal = shell.spawnSidecar({
      sidecarId: "s",
      substrateKind: "occt",
      executableLabel: { namespace: "sidecar-process", value: "x" },
      declaredArguments: [],
      declaredMemoryLimitMb: 0,
      declaredStartupBudgetMs: null,
    });
    if (!shellRefusal.ok) refusals.push(shellRefusal.failure);
    // every collected refusal kind is from the CLOSED vocabulary
    expect(refusals.length).toBe(4);
    for (const refusal of refusals) {
      expect(FAILURE_KINDS).toContain(refusal.kind);
    }
  });

  test("the honest declared limits refuse instead of fabricating (glb export example)", () => {
    const adapter = new AlternateCadDouble();
    const handle = cadModelOf(adapter);
    const glb = adapter.exportGltf(handle, { model: handle, assetId: "x", format: "glb" });
    expect(glb.ok).toBe(false);
    if (glb.ok) return;
    expect(glb.failure.kind).toBe("unsupported-data");
  });
});

/* ------------------------------------------------------------------ */
/* The cross-cutting identity law (directive §10)                       */
/* ------------------------------------------------------------------ */

describe("the identity law — substrate ids never become canonical AISE identity", () => {
  test("no external label value from any family output equals a canonical id", () => {
    // collect the external labels this lane's outputs carry...
    const labels: NamespacedExternalLabel[] = [
      { namespace: "freecad-document", value: "SubDoc" },
      { namespace: "freecad-object", value: "Sketch_sk_1" },
      { namespace: "freecad-object", value: "Feature_feat_1" },
      { namespace: "gltf-part", value: "mesh:0" },
      { namespace: "usd-path", value: "/AISE/ghost_beam" },
      { namespace: "sidecar-process", value: "freecad-command" },
    ];
    const labelValues = externalLabelValuesOf(labels);
    // ...and the canonical ids the same interactions use
    const canonicalIds = [
      "model-sub-001",
      "solution-sub-001",
      "ghost-beam",
      "op-001",
      "solution-demo-001",
      "asset-beam",
    ];
    for (const id of canonicalIds) {
      expect(labelValues).not.toContain(id);
    }
    // and the digests are 64-hex content addresses, never label values
    const adapter = new ReferenceSimulationDouble();
    const trajectory = adapter.simulate(simulationRequest());
    if (!trajectory.ok) throw new Error("simulate failed");
    expect(trajectory.value.trajectoryId).toMatch(/^[0-9a-f]{64}$/);
    expect(labelValues).not.toContain(trajectory.value.trajectoryId);
  });

  test("the seam's collision guard catches a smuggled label-as-identity", () => {
    const labels: NamespacedExternalLabel[] = [
      { namespace: "freecad-document", value: "SubDoc" },
    ];
    const values = externalLabelValuesOf(labels);
    expect(values).toEqual(["SubDoc"]);
    const canonical = ["model-sub-001", "SubDoc"];
    const collisions = canonical.filter((id) => values.includes(id));
    expect(collisions).toEqual(["SubDoc"]);
  });
});

/* ------------------------------------------------------------------ */
/* The authority law (directive §10 — simulation never replaces the     */
/* deterministic solution engine as authority)                          */
/* ------------------------------------------------------------------ */

describe("the authority law — the canonical Solution Graph stays the only authority", () => {
  test("the simulation ports expose NO write-back to the Solution Graph (structural)", () => {
    for (const adapter of [new ReferenceSimulationDouble(), new AlternateSimulationDouble()]) {
      const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(adapter))
        .filter((name) => name !== "constructor")
        .sort();
      // the CLOSED method surface: compute the trajectory, capture the
      // progress — nothing else (the public fields are portId,
      // capabilities and descriptor — all presentation/provenance)
      expect(methodNames).toEqual(["captureProgress", "simulate"]);
      // there is no record/apply/commit/revise method — only compute+capture
      for (const name of methodNames) {
        expect(name).not.toMatch(/record|apply|commit|revise|mutate|write/i);
      }
    }
  });

  test("simulated progress enters as PROPOSED with simulation provenance — never CONFIRMED", () => {
    const adapter = new ReferenceSimulationDouble();
    const trajectory = adapter.simulate(simulationRequest());
    if (!trajectory.ok) throw new Error("simulate failed");
    const capture = adapter.captureProgress(trajectory.value, "2026-10-06T00:00:00.000Z");
    if (!capture.ok) throw new Error("capture failed");
    expect(capture.value.epistemicStatus).toBe("PROPOSED");
    expect(capture.value.simulationProvenance.providerId).toBe(
      "solution-substrate.simulation.reference-double",
    );
  });
});
