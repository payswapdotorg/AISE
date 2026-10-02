/**
 * WORLD-P0-A tests — the OpenUSD composition-semantics port against the
 * in-memory double: per-field opinion strength, explicit variant
 * selection, payload laziness, time evaluation, the identity law
 * (unbound USD paths refused — identity never invented) and
 * determinism (same input → same composed scene).
 */

import { describe, expect, test } from "bun:test";
import type { ComposedScene, SceneNode } from "../scene";
import { translation, uniformScale } from "../scene";
import { InMemoryUsdCompositionDouble } from "./double";
import type { UsdCompositionInput } from "./contract";

function makeNode(elementId: string): SceneNode {
  return {
    elementId,
    kind: "element",
    parentId: null,
    transform: translation(0, 0, 0),
    geometry: { assetId: "asset-1", partId: "mesh:0", format: "glb" },
    material: null,
    layerIds: ["layer-captured"],
    isGhost: false,
    evidenceContentIds: [],
    label: null,
  };
}

function makeScene(): ComposedScene {
  return {
    revision: 1,
    nodes: [makeNode("wall-1"), makeNode("wall-2")],
    layers: [{ layerId: "layer-captured", name: "Captured", visibleByDefault: true }],
    siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
    ghostSummary: null,
  };
}

function makeInput(overrides: Partial<UsdCompositionInput> = {}): UsdCompositionInput {
  const base = makeScene();
  return {
    baseScene: base,
    layers: [],
    variantSets: [],
    payloads: [],
    timeSamples: [],
    selectedVariants: [],
    loadedPayloadRegions: [],
    evaluateAtSeconds: null,
    pathBindings: [
      { usdPath: "/AISE/wall_1", elementId: "wall-1" },
      { usdPath: "/AISE/wall_2", elementId: "wall-2" },
    ],
    ...overrides,
  };
}

describe("layered opinions (per-field strength)", () => {
  test("a stronger layer overrides a weaker layer per-field", () => {
    const usd = new InMemoryUsdCompositionDouble();
    const input = makeInput({
      layers: [
        {
          layerId: "L-weak",
          strength: 1,
          overrides: [
            { elementId: "wall-1", transform: translation(1, 0, 0), label: "weak label" },
          ],
        },
        {
          layerId: "L-strong",
          strength: 10,
          overrides: [{ elementId: "wall-1", transform: translation(9, 0, 0) }],
        },
      ],
    });
    const res = usd.compose(input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const wall = res.value.composedScene.nodes.find((n) => n.elementId === "wall-1");
    // strong layer wins the transform (9) but the weak label survives
    // (the strong layer has no label opinion — per-field, not per-object)
    expect(wall?.transform.matrix[3]).toBe(9);
    expect(wall?.label).toBe("weak label");
    // provenance records both contributing layers
    const fields = res.value.opinionProvenance.filter((p) => p.elementId === "wall-1");
    expect(fields.some((p) => p.sourceLayerId === "L-weak" && p.field === "label")).toBe(true);
    expect(fields.some((p) => p.sourceLayerId === "L-strong" && p.field === "transform")).toBe(true);
  });

  test("composition is deterministic — same input composes to the same scene (substitution law 1)", () => {
    const usd = new InMemoryUsdCompositionDouble();
    const input = makeInput({
      layers: [
        {
          layerId: "L",
          strength: 5,
          overrides: [{ elementId: "wall-2", transform: uniformScale(2) }],
        },
      ],
    });
    const a = usd.compose(input);
    const b = usd.compose(input);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.composedScene).toEqual(b.value.composedScene);
  });
});

describe("variants (explicit AISE selection — never substrate-auto-selected)", () => {
  test("a selected variant applies its overrides", () => {
    const usd = new InMemoryUsdCompositionDouble();
    const input = makeInput({
      variantSets: [
        {
          variantSetId: "clash-option",
          variants: [
            { variantId: "keep", overrides: [] },
            {
              variantId: "raise",
              overrides: [{ elementId: "wall-1", transform: translation(0, 0, 5) }],
            },
          ],
        },
      ],
      selectedVariants: [{ variantSetId: "clash-option", variantId: "raise" }],
    });
    const res = usd.compose(input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const wall = res.value.composedScene.nodes.find((n) => n.elementId === "wall-1");
    expect(wall?.transform.matrix[11]).toBe(5);
  });

  test("an unknown variant selection is refused (fail-closed)", () => {
    const usd = new InMemoryUsdCompositionDouble();
    const res = usd.compose(
      makeInput({
        variantSets: [
          { variantSetId: "vs", variants: [{ variantId: "a", overrides: [] }] },
        ],
        selectedVariants: [{ variantSetId: "vs", variantId: "nope" }],
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.code).toBe("request_invalid");
  });

  test("a selection naming an unknown set is refused", () => {
    const usd = new InMemoryUsdCompositionDouble();
    const res = usd.compose(
      makeInput({ selectedVariants: [{ variantSetId: "ghost-set", variantId: "x" }] }),
    );
    expect(res.ok).toBe(false);
  });
});

describe("payloads (lazy regions — the AISE side decides)", () => {
  test("elements of an unloaded payload region are ABSENT from the composed scene", () => {
    const usd = new InMemoryUsdCompositionDouble();
    const res = usd.compose(
      makeInput({
        payloads: [{ regionId: "scan-heavy", elementIds: ["wall-2"], declaredBytes: 1_000_000 }],
        loadedPayloadRegions: [],
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.composedScene.nodes.some((n) => n.elementId === "wall-2")).toBe(false);
    expect(res.value.unloadedPayloadRegions).toContain("scan-heavy");
  });

  test("loading the region materializes its elements", () => {
    const usd = new InMemoryUsdCompositionDouble();
    const res = usd.compose(
      makeInput({
        payloads: [{ regionId: "scan-heavy", elementIds: ["wall-2"], declaredBytes: 1_000_000 }],
        loadedPayloadRegions: ["scan-heavy"],
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.composedScene.nodes.some((n) => n.elementId === "wall-2")).toBe(true);
    expect(res.value.unloadedPayloadRegions).toHaveLength(0);
  });

  test("an unknown payload load is refused", () => {
    const usd = new InMemoryUsdCompositionDouble();
    const res = usd.compose(makeInput({ loadedPayloadRegions: ["undeclared"] }));
    expect(res.ok).toBe(false);
  });
});

describe("time samples", () => {
  test("evaluation at t selects the sample at/before t (capture replay)", () => {
    const usd = new InMemoryUsdCompositionDouble();
    const res = usd.compose(
      makeInput({
        timeSamples: [
          { timeSeconds: 0, overrides: [{ elementId: "wall-1", transform: translation(1, 0, 0) }] },
          { timeSeconds: 10, overrides: [{ elementId: "wall-1", transform: translation(2, 0, 0) }] },
        ],
        evaluateAtSeconds: 4,
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const wall = res.value.composedScene.nodes.find((n) => n.elementId === "wall-1");
    expect(wall?.transform.matrix[3]).toBe(1); // t=0 sample (latest at/before 4)
  });

  test("null evaluation uses the latest sample", () => {
    const usd = new InMemoryUsdCompositionDouble();
    const res = usd.compose(
      makeInput({
        timeSamples: [
          { timeSeconds: 0, overrides: [{ elementId: "wall-1", transform: translation(1, 0, 0) }] },
          { timeSeconds: 10, overrides: [{ elementId: "wall-1", transform: translation(2, 0, 0) }] },
        ],
        evaluateAtSeconds: null,
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const wall = res.value.composedScene.nodes.find((n) => n.elementId === "wall-1");
    expect(wall?.transform.matrix[3]).toBe(2);
  });
});

describe("identity law (USD paths never become canonical identity)", () => {
  test("an override targeting an element with NO path binding is refused as an identity leak", () => {
    const usd = new InMemoryUsdCompositionDouble();
    const res = usd.compose(
      makeInput({
        layers: [
          {
            layerId: "L",
            strength: 1,
            overrides: [{ elementId: "not-bound-anywhere", transform: translation(1, 0, 0) }],
          },
        ],
        pathBindings: [{ usdPath: "/AISE/wall_1", elementId: "wall-1" }],
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.code).toBe("identity_leak_detected");
  });

  test("capacity laws are enforced (max layers)", () => {
    const usd = new InMemoryUsdCompositionDouble();
    const max = usd.capabilities.maxLayers;
    if (max === null) return;
    const layers = Array.from({ length: max + 1 }, (_, i) => ({
      layerId: `L${i}`,
      strength: i,
      overrides: [],
    }));
    const res = usd.compose(makeInput({ layers }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.code).toBe("substrate_capacity_exceeded");
  });

  test("file I/O is declared BLOCKED honestly", () => {
    const usd = new InMemoryUsdCompositionDouble();
    const io = usd.capabilities.blocked.find((b) => b.capability === "usd-file-io");
    expect(io).toBeDefined();
    expect(io?.reason).toContain("WORLD-P1");
  });
});
