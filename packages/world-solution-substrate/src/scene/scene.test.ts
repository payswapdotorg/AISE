/**
 * WORLD-P0-C tests — the SCENE-USAGE family: the Solution-layer
 * composition of the P0-A ports (ghost law end-to-end, what-if variants
 * through the USD port, solution assets through the glTF port), its
 * contract conformance points and its fail-closed refusal discipline.
 */

import { describe, expect, test } from "bun:test";
import {
  InMemoryGltfDeliveryDouble,
  InMemorySceneRuntimeDouble,
  InMemoryUsdCompositionDouble,
  translation,
  type ComposedScene,
  type GhostSetSummary,
  type PickResult,
  type SceneNode,
  type UsdCompositionAdapter,
  type UsdCompositionResult,
} from "@aise/world-reality-substrate";
import {
  SolutionSceneUsageAlternateDouble,
  SolutionSceneUsageReferenceDouble,
  defaultRealityPorts,
} from "./doubles";
import {
  ghostDistinctnessViolations,
  inventedElementIds,
  variantTrailOf,
  type SolutionSceneUsagePorts,
  type WhatIfVariantRequest,
} from "./contract";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

const VALID_GLTF_JSON = JSON.stringify({
  asset: { version: "2.0", generator: "AISE test" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: "lintel" }],
  meshes: [{ primitives: [{ mode: 4, attributes: { POSITION: 0 } }] }],
  accessors: [{ componentType: 5126, count: 3, type: "VEC3", bufferView: 0 }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  buffers: [{ byteLength: 36 }],
});

const VALID_GLTF_BYTES = new TextEncoder().encode(VALID_GLTF_JSON);

function ghostNode(elementId: string, withGeometry: boolean): SceneNode {
  return {
    elementId,
    kind: "ghost",
    parentId: null,
    transform: translation(1, 2, 3),
    geometry: withGeometry
      ? { assetId: "asset-lintel", partId: "mesh:0", format: "gltf-json" }
      : null,
    material: null,
    layerIds: ["solution"],
    isGhost: true,
    evidenceContentIds: [],
    label: `Ghost ${elementId}`,
  };
}

function realityNode(elementId: string): SceneNode {
  return {
    elementId,
    kind: "element",
    parentId: null,
    transform: translation(0, 0, 0),
    geometry: { assetId: "asset-reality", partId: "mesh:0", format: "glb" },
    material: null,
    layerIds: ["structure"],
    isGhost: false,
    evidenceContentIds: ["evidence-001"],
    label: `Wall ${elementId}`,
  };
}

function baseScene(): ComposedScene {
  return {
    revision: 7,
    nodes: [
      realityNode("wall-001"),
      realityNode("wall-002"),
      ghostNode("ghost-lintel", true),
      ghostNode("ghost-scaffold", false),
    ],
    layers: [
      { layerId: "structure", name: "Structure", visibleByDefault: true },
      { layerId: "solution", name: "Solution", visibleByDefault: true },
    ],
    siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
    ghostSummary: {
      operationId: "op-002",
      proposedElementIds: ["ghost-lintel"],
      removedElementIds: ["wall-002"],
    },
  };
}

const GHOST_SET: GhostSetSummary = {
  operationId: "op-002",
  proposedElementIds: ["ghost-lintel"],
  removedElementIds: ["wall-002"],
};

function proposedRequest(scene: ComposedScene = baseScene()) {
  return {
    kind: "proposed-state-presentation-request" as const,
    schemaVersion: "proposed-state-presentation-request/1" as const,
    solutionId: "solution-demo-001",
    versionNumber: 1,
    stateIndex: 2,
    baseScene: scene,
    ghostSet: GHOST_SET,
    solutionAssets: [
      {
        reference: { assetId: "asset-lintel", partId: "mesh:0", format: "gltf-json" as const },
        source: { assetId: "asset-lintel", format: "gltf-json" as const, bytes: VALID_GLTF_BYTES },
      },
    ],
  };
}

function whatIfRequest(): WhatIfVariantRequest {
  return {
    kind: "what-if-variant-request",
    schemaVersion: "what-if-variant-request/1",
    solutionId: "solution-demo-001",
    versionNumber: 1,
    baseScene: baseScene(),
    variantSets: [
      {
        variantSetId: "lintel-alternative",
        variants: [
          {
            variantId: "steel-section",
            overrides: [
              {
                elementId: "ghost-lintel",
                transform: translation(1.5, 2, 3),
              },
            ],
          },
          {
            variantId: "timber-flush",
            overrides: [{ elementId: "ghost-lintel", visible: false }],
          },
        ],
      },
    ],
    payloads: [
      { regionId: "lintel-payload", elementIds: ["ghost-lintel"], declaredBytes: 2048 },
      { regionId: "scaffold-payload", elementIds: ["ghost-scaffold"], declaredBytes: 4096 },
    ],
    selectedVariants: [{ variantSetId: "lintel-alternative", variantId: "steel-section" }],
    loadedPayloadRegions: ["lintel-payload"],
    pathBindings: [
      { usdPath: "/AISE/ghost_lintel", elementId: "ghost-lintel" },
      { usdPath: "/AISE/wall_001", elementId: "wall-001" },
      { usdPath: "/AISE/wall_002", elementId: "wall-002" },
    ],
    comparisonLabel: "steel vs timber lintel",
  };
}

/* ------------------------------------------------------------------ */
/* Contract conformance                                                 */
/* ------------------------------------------------------------------ */

describe("scene usage — contract conformance", () => {
  test("both doubles carry the port id and honest capabilities", () => {
    for (const adapter of [
      new SolutionSceneUsageReferenceDouble(),
      new SolutionSceneUsageAlternateDouble(),
    ]) {
      expect(adapter.portId).toBe("solution.scene-usage/1");
      expect(adapter.capabilities.supportsProposedStatePresentation).toBe(true);
      expect(adapter.capabilities.supportsWhatIfVariants).toBe(true);
      expect(adapter.capabilities.supportsSolutionAssetDelivery).toBe(true);
      expect(adapter.capabilities.blocked.length).toBeGreaterThan(0);
    }
  });

  test("the usage host composes the three P0-A sibling ports (the composition law)", () => {
    const ports = defaultRealityPorts();
    const adapter = new SolutionSceneUsageReferenceDouble(ports);
    expect(ports.sceneRuntime.portId).toBe("babylon.scene-runtime/1");
    expect(ports.composition.portId).toBe("usd.composition/1");
    expect(ports.assetDelivery.portId).toBe("gltf.runtime-asset/1");
    // the host is constructed OVER the ports — it re-implements none of them
    expect((adapter as unknown as { ports: SolutionSceneUsagePorts }).ports).toBe(ports);
  });
});

/* ------------------------------------------------------------------ */
/* Proposed-state presentation (the ghost law, end-to-end)              */
/* ------------------------------------------------------------------ */

describe("scene usage — proposed-state presentation", () => {
  test("the happy path: assets delivered, scene loaded, ghost set applied, distinctness proven", () => {
    const adapter = new SolutionSceneUsageReferenceDouble();
    const outcome = adapter.presentProposedState(proposedRequest());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const presentation = outcome.value;
    expect(presentation.solutionId).toBe("solution-demo-001");
    expect(presentation.stateIndex).toBe(2);
    expect(presentation.deliveredAssetIds).toEqual(["asset-lintel"]);
    expect(presentation.resolvedGeometry).toEqual([
      { elementId: "ghost-lintel", assetId: "asset-lintel", partId: "mesh:0" },
    ]);
    expect(presentation.ghostDistinctness.everyProposedMarkedGhost).toBe(true);
    expect(presentation.ghostDistinctness.proposedRemovedDisjoint).toBe(true);
    expect(presentation.ghostDistinctness.runtimeOverlayDeclared).toBe(true);
    expect(presentation.presentationToken).toMatch(/^[0-9a-f]{64}$/);
    expect(presentation.provenance.providerId).toBe(
      "solution-substrate.scene.reference-double",
    );
  });

  test("a ghost proposal on a NON-ghost node is refused before any presentation exists", () => {
    const scene = baseScene();
    const unGhosted: SceneNode = { ...scene.nodes[2]!, isGhost: false };
    const sceneWithRealityLintel = { ...scene, nodes: [scene.nodes[0]!, scene.nodes[1]!, unGhosted] };
    const adapter = new SolutionSceneUsageReferenceDouble();
    const outcome = adapter.presentProposedState(proposedRequest(sceneWithRealityLintel));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("operation-semantic-failure");
    expect(outcome.failure.detail).toContain("ghost-lintel is not marked isGhost");
  });

  test("a proposed element missing from the scene is refused", () => {
    const adapter = new SolutionSceneUsageReferenceDouble();
    const request = proposedRequest();
    const ghostSet: GhostSetSummary = {
      operationId: "op-009",
      proposedElementIds: ["ghost-unknown"],
      removedElementIds: [],
    };
    const outcome = adapter.presentProposedState({ ...request, ghostSet });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("operation-semantic-failure");
    expect(outcome.failure.detail).toContain("ghost-unknown is not in the scene");
  });

  test("an element both proposed and removed is refused (the P0-A law, surfaced at the usage layer)", () => {
    const ghostSet: GhostSetSummary = {
      operationId: "op-002",
      proposedElementIds: ["ghost-lintel"],
      removedElementIds: ["ghost-lintel"],
    };
    const adapter = new SolutionSceneUsageReferenceDouble();
    const outcome = adapter.presentProposedState({ ...proposedRequest(), ghostSet });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("operation-semantic-failure");
    expect(outcome.failure.detail).toContain("both proposed and removed");
  });

  test("an undeliverable solution asset refuses the WHOLE presentation (never partial)", () => {
    const adapter = new SolutionSceneUsageReferenceDouble();
    const request = proposedRequest();
    const badBytes = new TextEncoder().encode("{ this is not gltf");
    const outcome = adapter.presentProposedState({
      ...request,
      solutionAssets: [
        {
          reference: request.solutionAssets[0]!.reference,
          source: { assetId: "asset-lintel", format: "gltf-json", bytes: badBytes },
        },
      ],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("p0a:");
  });

  test("a ghost node whose asset was not delivered is refused", () => {
    const adapter = new SolutionSceneUsageReferenceDouble();
    const request = proposedRequest();
    const outcome = adapter.presentProposedState({ ...request, solutionAssets: [] });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("retrieval-failure");
    expect(outcome.failure.detail).toContain("asset-lintel");
  });

  test("a geometry partId missing from the delivered asset is refused", () => {
    const adapter = new SolutionSceneUsageReferenceDouble();
    const request = proposedRequest();
    const scene = baseScene();
    const ghostWithBadPart: SceneNode = {
      ...scene.nodes[2]!,
      geometry: { assetId: "asset-lintel", partId: "mesh:99", format: "gltf-json" },
    };
    const badPartScene = {
      ...scene,
      nodes: [scene.nodes[0]!, scene.nodes[1]!, ghostWithBadPart],
    };
    const outcome = adapter.presentProposedState({ ...request, baseScene: badPartScene });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.detail).toContain("mesh:99");
  });

  test("picking through a live presentation answers AISE element ids only", () => {
    const adapter = new SolutionSceneUsageReferenceDouble();
    const presented = adapter.presentProposedState(proposedRequest());
    expect(presented.ok).toBe(true);
    if (!presented.ok) return;
    // the P0-A double's analytic picking: ghost-lintel center projects to
    // sx = 0.5 + 1/20 = 0.55, sy = 0.5 - 2/20 = 0.4
    const picked = adapter.pickProposed(presented.value, 0.55, 0.4);
    expect(picked.ok).toBe(true);
    if (picked.ok) {
      expect(picked.value.elementId).toBe("ghost-lintel");
    }
  });

  test("a leaky runtime answering with an unknown element id is refused (the pick identity guard)", () => {
    // wrap the P0-A in-memory runtime so its pick answers a smuggled id
    // (instance-level override — the prototype methods stay intact)
    const leakyRuntime = new InMemorySceneRuntimeDouble();
    leakyRuntime.pick = (): { ok: true; value: PickResult } => ({
      ok: true,
      value: { elementId: "substrate-mesh-42", hitPoint: [0, 0, 0] },
    });
    const ports: SolutionSceneUsagePorts = {
      sceneRuntime: leakyRuntime,
      composition: new InMemoryUsdCompositionDouble(),
      assetDelivery: new InMemoryGltfDeliveryDouble(),
    };
    const adapter = new SolutionSceneUsageReferenceDouble(ports);
    const presented = adapter.presentProposedState(proposedRequest());
    expect(presented.ok).toBe(true);
    if (!presented.ok) return;
    const picked = adapter.pickProposed(presented.value, 0.55, 0.4);
    expect(picked.ok).toBe(false);
    if (picked.ok) return;
    expect(picked.failure.kind).toBe("contract-mismatch");
    expect(picked.failure.detail).toContain("substrate-mesh-42");
  });

  test("dispose tears the presentation down and a second dispose refuses", () => {
    const adapter = new SolutionSceneUsageReferenceDouble();
    const presented = adapter.presentProposedState(proposedRequest());
    expect(presented.ok).toBe(true);
    if (!presented.ok) return;
    expect(adapter.disposePresentation(presented.value).ok).toBe(true);
    const second = adapter.disposePresentation(presented.value);
    expect(second.ok).toBe(false);
  });

  test("the asset lane is usable independently (deliver + resolve semantics)", () => {
    const adapter = new SolutionSceneUsageReferenceDouble();
    const delivered = adapter.deliverSolutionAsset({
      assetId: "asset-lintel",
      format: "gltf-json",
      bytes: VALID_GLTF_BYTES,
    });
    expect(delivered.ok).toBe(true);
    if (delivered.ok) {
      expect(delivered.value.partIds).toContain("mesh:0");
    }
    const refused = adapter.deliverSolutionAsset({
      assetId: "asset-bad",
      format: "gltf-json",
      bytes: new TextEncoder().encode("nope"),
    });
    expect(refused.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* What-if variants (USD composition + ghost discipline + identity law) */
/* ------------------------------------------------------------------ */

describe("scene usage — what-if variants", () => {
  test("the happy path: composition + variant trail + ghost discipline all proven", () => {
    const adapter = new SolutionSceneUsageReferenceDouble();
    const outcome = adapter.presentWhatIfVariants(whatIfRequest());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const presentation = outcome.value;
    expect(presentation.comparisonLabel).toBe("steel vs timber lintel");
    expect(presentation.composedScene.revision).toBe(8); // base 7 + 1
    expect(presentation.variantTrail).toEqual([
      {
        variantSetId: "lintel-alternative",
        variantId: "steel-section",
        overriddenElementIds: ["ghost-lintel"],
      },
    ]);
    expect(presentation.everyVariantTargetIsGhost).toBe(true);
    expect(presentation.unloadedPayloadRegions).toEqual(["scaffold-payload"]);
    // the composed ghost node carries the variant's transform opinion
    const composedGhost = presentation.composedScene.nodes.find(
      (n) => n.elementId === "ghost-lintel",
    );
    expect(composedGhost?.transform.matrix[3]).toBe(1.5);
    // the opinion provenance records the variant as the contributor
    expect(
      presentation.opinionProvenance.some(
        (p) => p.sourceLayerId === "variant:lintel-alternative/steel-section",
      ),
    ).toBe(true);
    expect(presentation.presentationToken).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a variant targeting CAPTURED reality (a non-ghost node) is refused", () => {
    const request = whatIfRequest();
    const targetingReality: WhatIfVariantRequest = {
      ...request,
      variantSets: [
        {
          variantSetId: "lintel-alternative",
          variants: [
            {
              variantId: "move-the-wall",
              overrides: [{ elementId: "wall-001", transform: translation(9, 9, 9) }],
            },
          ],
        },
      ],
      selectedVariants: [{ variantSetId: "lintel-alternative", variantId: "move-the-wall" }],
    };
    const adapter = new SolutionSceneUsageReferenceDouble();
    const outcome = adapter.presentWhatIfVariants(targetingReality);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("operation-semantic-failure");
    expect(outcome.failure.detail).toContain("wall-001");
    expect(outcome.failure.detail).toContain("not marked isGhost");
  });

  test("an override with no USD path binding surfaces the P0-A identity-leak refusal verbatim", () => {
    const request = whatIfRequest();
    // the ghost lintel loses its USD path binding: the variant override
    // targets an element the composition source cannot name — identity
    // can never be invented to rescue it
    const unbound: WhatIfVariantRequest = {
      ...request,
      pathBindings: [
        { usdPath: "/AISE/wall_001", elementId: "wall-001" },
        { usdPath: "/AISE/wall_002", elementId: "wall-002" },
      ],
    };
    const adapter = new SolutionSceneUsageReferenceDouble();
    const outcome = adapter.presentWhatIfVariants(unbound);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("p0a:identity_leak_detected");
    expect(outcome.failure.detail).toContain("ghost-lintel");
  });

  test("a composition port that INVENTS element identity is refused (the composed-identity law)", () => {
    const inner = new InMemoryUsdCompositionDouble();
    const inventingComposition: UsdCompositionAdapter = {
      portId: inner.portId,
      capabilities: inner.capabilities,
      compose(input): { ok: true; value: UsdCompositionResult } {
        const base = inner.compose(input);
        if (!base.ok) {
          throw new Error("unexpected refusal in the wrapping double");
        }
        const inventedNode: SceneNode = {
          ...base.value.composedScene.nodes[0]!,
          elementId: "substrate-invented-node",
        };
        return {
          ok: true,
          value: {
            ...base.value,
            composedScene: {
              ...base.value.composedScene,
              nodes: [...base.value.composedScene.nodes, inventedNode],
            },
          },
        };
      },
    };
    const ports: SolutionSceneUsagePorts = {
      sceneRuntime: new InMemorySceneRuntimeDouble(),
      composition: inventingComposition,
      assetDelivery: new InMemoryGltfDeliveryDouble(),
    };
    const adapter = new SolutionSceneUsageReferenceDouble(ports);
    const outcome = adapter.presentWhatIfVariants(whatIfRequest());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("substrate-invented-node");
  });

  test("a composition port that UN-GHOSTS a variant target is refused", () => {
    const inner = new InMemoryUsdCompositionDouble();
    const unGhostingComposition: UsdCompositionAdapter = {
      portId: inner.portId,
      capabilities: inner.capabilities,
      compose(input): { ok: true; value: UsdCompositionResult } {
        const base = inner.compose(input);
        if (!base.ok) {
          throw new Error("unexpected refusal in the wrapping double");
        }
        const nodes = base.value.composedScene.nodes.map((n) =>
          n.elementId === "ghost-lintel" ? { ...n, isGhost: false } : n,
        );
        return {
          ok: true,
          value: {
            ...base.value,
            composedScene: { ...base.value.composedScene, nodes },
          },
        };
      },
    };
    const ports: SolutionSceneUsagePorts = {
      sceneRuntime: new InMemorySceneRuntimeDouble(),
      composition: unGhostingComposition,
      assetDelivery: new InMemoryGltfDeliveryDouble(),
    };
    const adapter = new SolutionSceneUsageReferenceDouble(ports);
    const outcome = adapter.presentWhatIfVariants(whatIfRequest());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("un-ghosted");
  });
});

/* ------------------------------------------------------------------ */
/* The pure law helpers                                                 */
/* ------------------------------------------------------------------ */

describe("scene usage — the pure law helpers", () => {
  test("ghostDistinctnessViolations lists every structural violation", () => {
    expect(ghostDistinctnessViolations(baseScene(), GHOST_SET)).toEqual([]);
    const badSet: GhostSetSummary = {
      operationId: "op-x",
      proposedElementIds: ["wall-001", "ghost-missing"],
      removedElementIds: ["ghost-lintel"],
    };
    const violations = ghostDistinctnessViolations(baseScene(), badSet);
    expect(violations).toContain("proposed element wall-001 is not marked isGhost");
    expect(violations).toContain("proposed element ghost-missing is not in the scene");
  });

  test("inventedElementIds detects substrate-invented identity", () => {
    const base = baseScene();
    const withExtra = {
      ...base,
      nodes: [...base.nodes, ghostNode("substrate-extra", false)],
    };
    expect(inventedElementIds(base, withExtra, [])).toEqual(["substrate-extra"]);
    expect(inventedElementIds(base, base, [])).toEqual([]);
    // declared payload element ids are legitimate
    expect(inventedElementIds(base, withExtra, ["substrate-extra"])).toEqual([]);
  });

  test("variantTrailOf records exactly the selected variants' targets", () => {
    const trail = variantTrailOf(whatIfRequest().variantSets, [
      { variantSetId: "lintel-alternative", variantId: "steel-section" },
    ]);
    expect(trail).toHaveLength(1);
    expect(trail[0]?.overriddenElementIds).toEqual(["ghost-lintel"]);
    // unknown selections contribute nothing (the P0-A port refuses them)
    expect(
      variantTrailOf(whatIfRequest().variantSets, [
        { variantSetId: "missing-set", variantId: "x" },
      ]),
    ).toHaveLength(0);
  });
});
