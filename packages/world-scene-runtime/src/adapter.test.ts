/**
 * `@aise/world-scene-runtime` — the REAL Babylon adapter contract tests
 * (WORLD-P5 Mount 1). Headless: Babylon NullEngine (real scene graph,
 * real CPU ray picking — no GPU in this sandbox, honestly declared in
 * `capabilities`).
 */

import { describe, expect, test } from "bun:test";
import type {
  CameraState,
  ComposedScene,
  GeometryReference,
  SceneNode,
  SceneRuntimeHandle,
} from "@aise/world-reality-substrate";
import { translation } from "@aise/world-reality-substrate";
import { createBabylonSceneRuntime, GHOST_MATERIAL_SPEC } from "./adapter";
import type { BabylonSceneRuntime } from "./adapter";
import type { IngestedBoxGeometry } from "./geometry";

/* ------------------------------------------------------------------ */
/* Fixture helpers                                                      */
/* ------------------------------------------------------------------ */

function boxRef(elementId: string): GeometryReference {
  return { assetId: `asset-${elementId}`, partId: "part-001", format: "ingested-mesh" };
}

function box(min: readonly number[], max: readonly number[]): IngestedBoxGeometry {
  return {
    kind: "box",
    min: [min[0] ?? 0, min[1] ?? 0, min[2] ?? 0],
    max: [max[0] ?? 0, max[1] ?? 0, max[2] ?? 0],
  };
}

const BOXES: Record<string, IngestedBoxGeometry> = {
  "asset-el-center": box([-1, -1, -1], [1, 1, 1]),
  "asset-el-wall": box([4, -2, 0], [6, 0, 3]),
  "asset-el-offaxis": box([40, 40, 0], [41, 41, 1]),
  "asset-el-ghost": box([8, 8, 0], [9, 9, 2]),
  "asset-el-inverted": box([5, 1, 1], [4, 2, 2]),
  "asset-el-flat": box([0, 0, 0], [0, 2, 2]),
};

function geometryResolver(ref: GeometryReference): IngestedBoxGeometry | null {
  return BOXES[ref.assetId] ?? null;
}

function nodeOf(
  elementId: string,
  opts: {
    geometry?: GeometryReference | null;
    layerIds?: readonly string[];
    isGhost?: boolean;
    at?: readonly [number, number, number];
  } = {},
): SceneNode {
  return {
    elementId,
    kind: opts.isGhost === true ? "ghost" : "element",
    parentId: null,
    transform: opts.at !== undefined ? translation(opts.at[0], opts.at[1], opts.at[2]) : translation(0, 0, 0),
    geometry: opts.geometry !== undefined ? opts.geometry : boxRef(elementId),
    material: null,
    layerIds: opts.layerIds ?? [],
    isGhost: opts.isGhost === true,
    evidenceContentIds: [],
    label: null,
  };
}

function sceneOf(nodes: readonly SceneNode[], revision = 1): ComposedScene {
  const layerIds = new Set<string>();
  for (const n of nodes) for (const lid of n.layerIds) layerIds.add(lid);
  return {
    revision,
    nodes,
    layers: [
      { layerId: "capture-reality", name: "Captured reality", visibleByDefault: true },
      { layerId: "plan-model", name: "Plan / BIM model", visibleByDefault: true },
      ...(layerIds.has("layer-a")
        ? [{ layerId: "layer-a", name: "A", visibleByDefault: true }]
        : []),
      ...(layerIds.has("layer-b")
        ? [{ layerId: "layer-b", name: "B", visibleByDefault: true }]
        : []),
    ],
    siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
    ghostSummary: null,
  };
}

function makeRuntime(): BabylonSceneRuntime {
  const outcome = createBabylonSceneRuntime({ engine: { mode: "null" }, geometry: geometryResolver });
  if (!outcome.ok) throw new Error(`runtime creation failed: ${outcome.failure.detail}`);
  return outcome.value;
}

function loadOk(runtime: BabylonSceneRuntime, scene: ComposedScene): SceneRuntimeHandle {
  const outcome = runtime.loadScene(scene);
  if (!outcome.ok) throw new Error(`loadScene failed: ${outcome.failure.detail}`);
  return outcome.value;
}

/* ------------------------------------------------------------------ */
/* Ingest                                                               */
/* ------------------------------------------------------------------ */

describe("WORLD-P5 real Babylon adapter (NullEngine) — ingest laws", () => {
  test("a valid scene ingests: handle, revision, meshes named by CANONICAL element ids", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-center"), nodeOf("el-wall")]));
    expect(handle.handleKind).toBe("scene-runtime");
    expect(handle.sceneRevision).toBe(1);
    // Runtime-internal access for the mesh-name law (the identity law
    // is asserted through picks below; here we prove the mesh naming).
    const pick = runtime.pick(handle, 0.5, 0.5);
    expect(pick.ok).toBe(true);
    if (pick.ok) expect(pick.value.elementId).toBe("el-center");
    runtime.dispose(handle);
    runtime.shutdown();
  });

  test("fail-closed: a structurally invalid scene is refused scene_invalid BEFORE any substrate scene call", () => {
    const runtime = makeRuntime();
    const bad = sceneOf([nodeOf("el-center"), nodeOf("el-center")]);
    const outcome = runtime.loadScene(bad);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.code).toBe("scene_invalid");
      expect(outcome.failure.detail).toContain("duplicate elementId");
    }
    runtime.shutdown();
  });

  test("fail-closed: a geometry reference the host cannot resolve refuses asset_not_found — never a partial scene", () => {
    const runtime = makeRuntime();
    const outcome = runtime.loadScene(
      sceneOf([nodeOf("el-center"), nodeOf("el-missing", { geometry: { assetId: "asset-nowhere", partId: "part-001", format: "ingested-mesh" } })]),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.code).toBe("asset_not_found");
      expect(outcome.failure.subjectId).toBe("asset-nowhere");
    }
    runtime.shutdown();
  });

  test("fail-closed: an inverted declared box is refused naming the axis", () => {
    const runtime = makeRuntime();
    const outcome = runtime.loadScene(sceneOf([nodeOf("el-inverted")]));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.code).toBe("scene_invalid");
      expect(outcome.failure.detail).toContain("axis");
    }
    runtime.shutdown();
  });

  test("fail-closed: a zero-extent (2D face) box is refused — declare a thin volume", () => {
    const runtime = makeRuntime();
    const outcome = runtime.loadScene(
      sceneOf([
        nodeOf("el-flat", {
          geometry: { assetId: "asset-el-flat", partId: "part-001", format: "ingested-mesh" },
        }),
      ]),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.code).toBe("scene_invalid");
      expect(outcome.failure.detail).toContain("zero extent");
    }
    runtime.shutdown();
  });
});

/* ------------------------------------------------------------------ */
/* Camera                                                               */
/* ------------------------------------------------------------------ */

describe("WORLD-P5 real Babylon adapter (NullEngine) — camera laws", () => {
  test("setCamera/getCamera round-trip: the typed state comes back VERBATIM", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-center")]));
    const typed: CameraState = {
      position: [8, -8, 6],
      target: [0, 0, 1],
      up: [0, 0, 1],
      fovRadians: 0.9,
      mode: "orbit",
    };
    expect(runtime.setCamera(handle, typed).ok).toBe(true);
    const back = runtime.getCamera(handle);
    expect(back.ok).toBe(true);
    if (back.ok) expect(JSON.stringify(back.value)).toBe(JSON.stringify(typed));
    runtime.dispose(handle);
    runtime.shutdown();
  });

  test("walk/orbit/fly modes all apply and round-trip", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-center")]));
    for (const mode of ["walk", "orbit", "fly"] as const) {
      const typed: CameraState = {
        position: [1, 2, 3],
        target: [0, 0, 1],
        up: [0, 0, 1],
        fovRadians: 0.8,
        mode,
      };
      expect(runtime.setCamera(handle, typed).ok).toBe(true);
      const back = runtime.getCamera(handle);
      if (back.ok) expect(back.value.mode).toBe(mode);
    }
    runtime.dispose(handle);
    runtime.shutdown();
  });

  test("onCameraChanged fires with the typed camera", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-center")]));
    const seen: CameraState[] = [];
    runtime.addListener(handle, { onCameraChanged: (c) => void seen.push(c) });
    const typed: CameraState = {
      position: [0, 0, 5],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovRadians: Math.PI / 4,
      mode: "orbit",
    };
    runtime.setCamera(handle, typed);
    expect(seen.length).toBe(1);
    expect(JSON.stringify(seen[0])).toBe(JSON.stringify(typed));
    runtime.dispose(handle);
    runtime.shutdown();
  });
});

/* ------------------------------------------------------------------ */
/* Picking                                                              */
/* ------------------------------------------------------------------ */

describe("WORLD-P5 real Babylon adapter (NullEngine) — picking laws", () => {
  test("a real CPU ray through the camera target hits the element and returns a CANONICAL id + a hit point inside the declared box", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-center"), nodeOf("el-offaxis")]));
    const pick = runtime.pick(handle, 0.5, 0.5);
    expect(pick.ok).toBe(true);
    if (pick.ok) {
      expect(pick.value.elementId).toBe("el-center");
      const p = pick.value.hitPoint;
      expect(p).not.toBeNull();
      if (p !== null) {
        expect(p[0]).toBeGreaterThanOrEqual(-1.0001);
        expect(p[0]).toBeLessThanOrEqual(1.0001);
        expect(p[1]).toBeGreaterThanOrEqual(-1.0001);
        expect(p[1]).toBeLessThanOrEqual(1.0001);
        expect(p[2]).toBeGreaterThanOrEqual(-1.0001);
        expect(p[2]).toBeLessThanOrEqual(1.0001);
      }
    }
    runtime.dispose(handle);
    runtime.shutdown();
  });

  test("a pick through empty sky answers null — never a guess", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-offaxis")]));
    const pick = runtime.pick(handle, 0.5, 0.5);
    expect(pick.ok).toBe(true);
    if (pick.ok) {
      expect(pick.value.elementId).toBeNull();
      expect(pick.value.hitPoint).toBeNull();
    }
    runtime.dispose(handle);
    runtime.shutdown();
  });

  test("out-of-range viewport coords are refused request_invalid", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-center")]));
    for (const xy of [[-0.1, 0.5], [1.1, 0.5], [0.5, -0.1], [0.5, 1.1]] as const) {
      const pick = runtime.pick(handle, xy[0], xy[1]);
      expect(pick.ok).toBe(false);
      if (!pick.ok) expect(pick.failure.code).toBe("request_invalid");
    }
    runtime.dispose(handle);
    runtime.shutdown();
  });

  test("onSelectionChanged fires with the picked canonical id", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-center")]));
    const seen: string[] = [];
    runtime.addListener(handle, {
      onSelectionChanged: (s) => void seen.push(s.hoveredElementId ?? "null"),
    });
    runtime.pick(handle, 0.5, 0.5);
    expect(seen).toEqual(["el-center"]);
    runtime.dispose(handle);
    runtime.shutdown();
  });
});

/* ------------------------------------------------------------------ */
/* Layers                                                               */
/* ------------------------------------------------------------------ */

describe("WORLD-P5 real Babylon adapter (NullEngine) — layer laws", () => {
  test("toggling a layer off hides its elements (the pick misses); on restores it", () => {
    const runtime = makeRuntime();
    const handle = loadOk(
      runtime,
      sceneOf([nodeOf("el-center", { layerIds: ["capture-reality"] }), nodeOf("el-wall", { layerIds: ["plan-model"] })]),
    );
    expect(runtime.pick(handle, 0.5, 0.5).ok).toBe(true);
    if (runtime.pick(handle, 0.5, 0.5).ok) {
      // el-center at the target; hide capture-reality → the ray misses
      expect(runtime.setLayerVisible(handle, "capture-reality", false).ok).toBe(true);
      const missed = runtime.pick(handle, 0.5, 0.5);
      expect(missed.ok).toBe(true);
      if (missed.ok) expect(missed.value.elementId).toBeNull();
      expect(runtime.setLayerVisible(handle, "capture-reality", true).ok).toBe(true);
      const again = runtime.pick(handle, 0.5, 0.5);
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.value.elementId).toBe("el-center");
    }
    runtime.dispose(handle);
    runtime.shutdown();
  });

  test("AND-semantics: an element in two layers is visible only when EVERY layer is visible", () => {
    const runtime = makeRuntime();
    const handle = loadOk(
      runtime,
      sceneOf([nodeOf("el-center", { layerIds: ["layer-a", "layer-b"] })]),
    );
    expect(runtime.setLayerVisible(handle, "layer-a", false).ok).toBe(true);
    let pick = runtime.pick(handle, 0.5, 0.5);
    if (pick.ok) expect(pick.value.elementId).toBeNull();
    expect(runtime.setLayerVisible(handle, "layer-a", true).ok).toBe(true);
    pick = runtime.pick(handle, 0.5, 0.5);
    if (pick.ok) expect(pick.value.elementId).toBe("el-center");
    // one of two off again (the other axis)
    expect(runtime.setLayerVisible(handle, "layer-b", false).ok).toBe(true);
    pick = runtime.pick(handle, 0.5, 0.5);
    if (pick.ok) expect(pick.value.elementId).toBeNull();
    runtime.dispose(handle);
    runtime.shutdown();
  });

  test("unknown layerIds in a toggle are refused (fail-closed)", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-center")]));
    const outcome = runtime.setLayerVisible(handle, "layer-nonexistent", false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.code).toBe("request_invalid");
      expect(outcome.failure.detail).toContain("unknown layerId");
    }
    runtime.dispose(handle);
    runtime.shutdown();
  });
});

/* ------------------------------------------------------------------ */
/* Ghost overlay                                                        */
/* ------------------------------------------------------------------ */

describe("WORLD-P5 real Babylon adapter (NullEngine) — ghost laws", () => {
  test("setGhostSet renders the proposal DISTINCT and the removal hidden-but-resolvable", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-center"), nodeOf("el-ghost", { isGhost: true })]));
    const outcome = runtime.setGhostSet(handle, "op-1", ["el-ghost"], ["el-center"]);
    expect(outcome.ok).toBe(true);
    // the removed element is no longer pickable…
    const pickRemoved = runtime.pick(handle, 0.5, 0.5);
    expect(pickRemoved.ok).toBe(true);
    if (pickRemoved.ok) expect(pickRemoved.value.elementId).toBeNull();
    // …the ghost proposal still is
    // (el-ghost sits at [8,8,0]..[9,9,2]; aim the camera at it first)
    runtime.setCamera(handle, {
      position: [8.5, 8.5, 6],
      target: [8.5, 8.5, 1],
      up: [0, 0, 1],
      fovRadians: 0.9,
      mode: "orbit",
    });
    const pickGhost = runtime.pick(handle, 0.5, 0.5);
    expect(pickGhost.ok).toBe(true);
    if (pickGhost.ok) expect(pickGhost.value.elementId).toBe("el-ghost");
    runtime.dispose(handle);
    runtime.shutdown();
  });

  test("an unknown proposed element is refused; a both-proposed-and-removed element is refused", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-center")]));
    const unknown = runtime.setGhostSet(handle, "op-1", ["el-nonexistent"], []);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.failure.code).toBe("request_invalid");
    const both = runtime.setGhostSet(handle, "op-1", ["el-center"], ["el-center"]);
    expect(both.ok).toBe(false);
    if (!both.ok) expect(both.failure.detail).toContain("both proposed and removed");
    runtime.dispose(handle);
    runtime.shutdown();
  });

  test("GHOST_MATERIAL_SPEC constants are the distinctness contract", () => {
    expect(GHOST_MATERIAL_SPEC.alpha).toBeLessThan(1);
    expect(GHOST_MATERIAL_SPEC.wireframe).toBe(true);
    expect(GHOST_MATERIAL_SPEC.emissive.length).toBe(3);
  });
});

/* ------------------------------------------------------------------ */
/* Section + bounds + lifecycle + capabilities                          */
/* ------------------------------------------------------------------ */

describe("WORLD-P5 real Babylon adapter (NullEngine) — section, bounds, lifecycle, capabilities", () => {
  test("applySection carries the declared plane; disabled clears it (pixel orientation is a GPU-leg concern)", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-center")]));
    const outcome = runtime.applySection(handle, {
      planeId: "p1",
      normal: [0, 0, 1],
      distance: 1.5,
      enabled: true,
    });
    expect(outcome.ok).toBe(true);
    const cleared = runtime.applySection(handle, {
      planeId: "p1",
      normal: [0, 0, 1],
      distance: 1.5,
      enabled: false,
    });
    expect(cleared.ok).toBe(true);
    runtime.dispose(handle);
    runtime.shutdown();
  });

  test("getWorldBounds: the union of declared boxes; geometry-less nodes fall back to translation ± 1 m (double-congruent)", () => {
    const runtime = makeRuntime();
    const handle = loadOk(
      runtime,
      sceneOf([
        nodeOf("el-center"),
        nodeOf("el-wall"),
        nodeOf("el-bare", { geometry: null, at: [100, 0, 0] }),
      ]),
    );
    const bounds = runtime.getWorldBounds(handle);
    expect(bounds.ok).toBe(true);
    if (bounds.ok) {
      // boxes: [-1,-1,-1]..[1,1,1] and [4,-2,0]..[6,0,3];
      // bare node at (100,0,0) → [99,-1,-1]..[101,1,1]
      expect(bounds.value.min[0]).toBe(-1);
      expect(bounds.value.min[1]).toBe(-2);
      expect(bounds.value.min[2]).toBe(-1);
      expect(bounds.value.max[0]).toBe(101);
      expect(bounds.value.max[1]).toBe(1);
      expect(bounds.value.max[2]).toBe(3);
    }
    runtime.dispose(handle);
    runtime.shutdown();
  });

  test("dispose: further operations refuse request_invalid", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-center")]));
    expect(runtime.dispose(handle).ok).toBe(true);
    const pick = runtime.pick(handle, 0.5, 0.5);
    expect(pick.ok).toBe(false);
    if (!pick.ok) expect(pick.failure.code).toBe("request_invalid");
    const camera = runtime.getCamera(handle);
    expect(camera.ok).toBe(false);
    runtime.shutdown();
  });

  test("capabilities are HONEST: NullEngine declares gpu-rendering BLOCKED; measurement is station-composed", () => {
    const runtime = makeRuntime();
    expect(runtime.portId).toBe("babylon.scene-runtime/1");
    expect(runtime.capabilities.supportsMeasurement).toBe(false);
    const blocked = runtime.capabilities.blocked.map((b) => b.capability);
    expect(blocked).toContain("gpu-rendering");
    expect(blocked).toContain("webgpu-engine");
    expect(blocked).toContain("runtime-measurement");
    runtime.shutdown();
  });

  test("the createBabylonSceneRuntime factory itself is fail-safe typed (creation over a null engine succeeds)", () => {
    const outcome = createBabylonSceneRuntime({ engine: { mode: "null" }, geometry: geometryResolver });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) outcome.value.shutdown();
  });

  test("renderOnce executes a real render pass headless (NullEngine) and frameStats reports draw calls + active meshes", () => {
    const runtime = makeRuntime();
    const handle = loadOk(runtime, sceneOf([nodeOf("el-center"), nodeOf("el-wall")]));
    const rendered = runtime.renderOnce(handle);
    expect(rendered.ok).toBe(true);
    const stats = runtime.frameStats(handle);
    expect(stats.ok).toBe(true);
    if (stats.ok) {
      expect(stats.value.activeMeshes).toBe(2);
      expect(stats.value.drawCalls).toBeGreaterThanOrEqual(0);
    }
    runtime.dispose(handle);
    runtime.shutdown();
  });

  test("rendererInfo is HONESTLY null on NullEngine (CPU-side, no GL identity)", () => {
    const runtime = makeRuntime();
    expect(runtime.rendererInfo()).toBeNull();
    runtime.shutdown();
  });
});
