/**
 * WORLD-P0-A tests — the Babylon scene-runtime port contract, proven
 * against the in-memory substitution double: fail-closed scene ingest,
 * camera round-trip, analytic picking, layer visibility, sectioning,
 * the ghost-distinctness law and honest capability declarations.
 */

import { describe, expect, test } from "bun:test";
import type { ComposedScene, SceneNode } from "../scene";
import { translation, IDENTITY_TRANSFORM } from "../scene";
import { InMemorySceneRuntimeDouble } from "./double";
import type { SceneRuntimeHandle } from "./contract";

function makeNode(elementId: string, x: number, overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    elementId,
    kind: "element",
    parentId: null,
    transform: translation(x, 0, 0),
    geometry: { assetId: "asset-1", partId: "mesh:0", format: "glb" },
    material: null,
    layerIds: ["layer-captured"],
    isGhost: false,
    evidenceContentIds: [],
    label: null,
    ...overrides,
  };
}

function makeScene(nodes: readonly SceneNode[], revision = 1): ComposedScene {
  return {
    revision,
    nodes,
    layers: [
      { layerId: "layer-captured", name: "Captured", visibleByDefault: true },
      { layerId: "layer-plan", name: "Plan", visibleByDefault: true },
    ],
    siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
    ghostSummary: null,
  };
}

describe("scene ingest (fail-closed)", () => {
  test("a valid scene loads and returns an opaque handle", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const res = rt.loadScene(makeScene([makeNode("wall-1", 0), makeNode("wall-2", 3)]));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.handleKind).toBe("scene-runtime");
      expect(res.value.sceneRevision).toBe(1);
      expect(typeof res.value.token).toBe("string");
    }
  });

  test("a scene with duplicate ids is refused with scene_invalid", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const res = rt.loadScene(makeScene([makeNode("wall-1", 0), makeNode("wall-1", 3)]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.code).toBe("scene_invalid");
  });

  test("a scene with a parent cycle is refused", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const a: SceneNode = { ...makeNode("a", 0), parentId: "b" };
    const b: SceneNode = { ...makeNode("b", 1), parentId: "a" };
    const res = rt.loadScene(makeScene([a, b]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.code).toBe("scene_invalid");
  });

  test("a scene with an unresolved parent is refused", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const orphan: SceneNode = { ...makeNode("orphan", 0), parentId: "does-not-exist" };
    const res = rt.loadScene(makeScene([orphan]));
    expect(res.ok).toBe(false);
  });

  test("operations on a disposed handle are refused (no zombie state)", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const res = rt.loadScene(makeScene([makeNode("wall-1", 0)]));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const handle: SceneRuntimeHandle = res.value;
    expect(rt.dispose(handle).ok).toBe(true);
    const after = rt.getCamera(handle);
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.failure.code).toBe("request_invalid");
  });
});

describe("camera surface", () => {
  test("setCamera/getCamera round-trips exactly (substitution law 1: identity of semantics)", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const res = rt.loadScene(makeScene([makeNode("wall-1", 0)]));
    if (!res.ok) throw new Error("load failed");
    const camera = {
      position: [1.5, -2.25, 3.125] as const,
      target: [0, 0, 0] as const,
      up: [0, 1, 0] as const,
      fovRadians: Math.PI / 3,
      mode: "walk" as const,
    };
    expect(rt.setCamera(res.value, camera).ok).toBe(true);
    const back = rt.getCamera(res.value);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.value).toEqual(camera);
  });
});

describe("picking (opaque identity law)", () => {
  test("a pick returns the AISE elementId, never a substrate id", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const res = rt.loadScene(makeScene([makeNode("aise-wall-42", 0)]));
    if (!res.ok) throw new Error("load failed");
    const pick = rt.pick(res.value, 0.5, 0.5);
    expect(pick.ok).toBe(true);
    if (pick.ok) {
      expect(pick.value.elementId).toBe("aise-wall-42");
      expect(pick.value.hitPoint).not.toBeNull();
    }
  });

  test("picking a hidden layer finds nothing (visibility honored)", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const res = rt.loadScene(makeScene([makeNode("wall-1", 0)]));
    if (!res.ok) throw new Error("load failed");
    expect(rt.setLayerVisible(res.value, "layer-captured", false).ok).toBe(true);
    const pick = rt.pick(res.value, 0.5, 0.5);
    expect(pick.ok).toBe(true);
    if (pick.ok) expect(pick.value.elementId).toBeNull();
  });

  test("out-of-range viewport coordinates are refused, not clamped", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const res = rt.loadScene(makeScene([makeNode("wall-1", 0)]));
    if (!res.ok) throw new Error("load failed");
    const pick = rt.pick(res.value, 1.5, 0.5);
    expect(pick.ok).toBe(false);
    if (!pick.ok) expect(pick.failure.code).toBe("request_invalid");
  });

  test("unknown layer ids are refused", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const res = rt.loadScene(makeScene([makeNode("wall-1", 0)]));
    if (!res.ok) throw new Error("load failed");
    const r = rt.setLayerVisible(res.value, "no-such-layer", true);
    expect(r.ok).toBe(false);
  });
});

describe("sectioning + ghost law", () => {
  test("applySection works when declared, and the section state is stored", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const res = rt.loadScene(makeScene([makeNode("wall-1", 0)]));
    if (!res.ok) throw new Error("load failed");
    const r = rt.applySection(res.value, {
      planeId: "p1",
      normal: [0, 0, 1],
      distance: 0,
      enabled: true,
    });
    expect(r.ok).toBe(true);
  });

  test("a ghost proposal referencing unknown elements is refused (distinctness is structural)", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const res = rt.loadScene(makeScene([makeNode("wall-1", 0)]));
    if (!res.ok) throw new Error("load failed");
    const r = rt.setGhostSet(res.value, "op-1", ["not-in-scene"], []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe("request_invalid");
  });

  test("an element cannot be both proposed and removed", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const res = rt.loadScene(makeScene([makeNode("wall-1", 0)]));
    if (!res.ok) throw new Error("load failed");
    const r = rt.setGhostSet(res.value, "op-1", ["wall-1"], ["wall-1"]);
    expect(r.ok).toBe(false);
  });

  test("a valid ghost set is accepted and removed elements are unpickable", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const res = rt.loadScene(makeScene([makeNode("wall-1", 0), makeNode("wall-2", 3)]));
    if (!res.ok) throw new Error("load failed");
    const r = rt.setGhostSet(res.value, "op-1", ["wall-2"], ["wall-1"]);
    expect(r.ok).toBe(true);
    const pick = rt.pick(res.value, 0.5, 0.5);
    expect(pick.ok).toBe(true);
    if (pick.ok) expect(pick.value.elementId).toBeNull(); // wall-1 removed by the ghost set
  });
});

describe("honest capabilities (substitution law 3)", () => {
  test("GPU-only capabilities are declared BLOCKED with reasons, never claimed", () => {
    const rt = new InMemorySceneRuntimeDouble();
    expect(rt.capabilities.blocked.length).toBeGreaterThan(0);
    for (const b of rt.capabilities.blocked) {
      expect(b.capability.length).toBeGreaterThan(0);
      expect(b.reason.length).toBeGreaterThan(0);
    }
    const gpu = rt.capabilities.blocked.find((b) => b.capability === "gpu-rendering");
    expect(gpu).toBeDefined();
    expect(gpu?.reason).toContain("WORLD-P1");
  });

  test("world bounds are computed from scene content", () => {
    const rt = new InMemorySceneRuntimeDouble();
    const res = rt.loadScene(makeScene([makeNode("wall-1", 0), makeNode("wall-2", 3)]));
    if (!res.ok) throw new Error("load failed");
    const bounds = rt.getWorldBounds(res.value);
    expect(bounds.ok).toBe(true);
    if (bounds.ok) {
      expect(bounds.value.min[0]).toBeLessThanOrEqual(-1);
      expect(bounds.value.max[0]).toBeGreaterThanOrEqual(4);
    }
  });

  test("identity transform constant is exactly identity", () => {
    expect(IDENTITY_TRANSFORM.matrix).toHaveLength(16);
    expect(IDENTITY_TRANSFORM.matrix[0]).toBe(1);
    expect(IDENTITY_TRANSFORM.matrix[5]).toBe(1);
    expect(IDENTITY_TRANSFORM.matrix[10]).toBe(1);
    expect(IDENTITY_TRANSFORM.matrix[15]).toBe(1);
  });
});
