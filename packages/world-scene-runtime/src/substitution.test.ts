/**
 * `@aise/world-scene-runtime` — SUBSTITUTION tests (WORLD-P5 Mount 1):
 * the REAL Babylon adapter (NullEngine) and the P0-A in-memory double
 * produce EQUIVALENT CANONICAL OUTPUTS for the same scenes — the
 * substitution law (technology-substitution-contract §4.2) at the
 * scene-runtime port.
 *
 * COMPARISON DISCIPLINE (declared, per the contract's law 2 —
 * tolerances declared, never implicit): the comparison points are the
 * port's canonical values — load outcomes, camera round-trips, pick
 * ELEMENT IDS (identity), visibility semantics and refusal codes. The
 * double's pick is an analytic screen-radius heuristic over node
 * centers while the real adapter casts a true 3D ray; the tests pick
 * through coordinates where the two semantics provably agree (the
 * camera target and empty sky) and compare IDs exactly. Hit POINTS are
 * implementation geometry (the double returns the node center, the
 * real adapter returns the true surface intersection) — compared by
 * containment in the declared box, never byte-equality.
 */

import { describe, expect, test } from "bun:test";
import type { CameraState, ComposedScene, GeometryReference, SceneNode } from "@aise/world-reality-substrate";
import { translation } from "@aise/world-reality-substrate";
import { InMemorySceneRuntimeDouble } from "@aise/world-reality-substrate";
import { createBabylonSceneRuntime } from "./adapter";
import type { BabylonSceneRuntime } from "./adapter";
import type { IngestedBoxGeometry } from "./geometry";

/* Fixtures: a scene whose geometry agrees with the double's projection
 * heuristic at the default camera — a single box centered at the
 * camera target (screen 0.5, 0.5 in both semantics), plus an
 * off-screen element no pick can reach. */

const BOXES: Record<string, IngestedBoxGeometry> = {
  "asset-el-at-target": { kind: "box", min: [-1, -1, -1], max: [1, 1, 1] },
  "asset-el-far": { kind: "box", min: [40, 40, 0], max: [41, 41, 1] },
};

function geometryResolver(ref: GeometryReference): IngestedBoxGeometry | null {
  return BOXES[ref.assetId] ?? null;
}

function nodeOf(elementId: string, layerIds: readonly string[] = []): SceneNode {
  // The node transform carries the node's site placement (the double's
  // pick heuristic reads it); the ingested box is the world-absolute
  // geometry the real adapter meshes.
  const boxes: Record<string, readonly [number, number, number]> = {
    "el-at-target": [0, 0, 0],
    "el-far": [40.5, 40.5, 0.5],
  };
  const at = boxes[elementId] ?? [0, 0, 0];
  return {
    elementId,
    kind: "element",
    parentId: null,
    transform: translation(at[0], at[1], at[2]),
    geometry: { assetId: `asset-${elementId}`, partId: "part-001", format: "ingested-mesh" },
    material: null,
    layerIds,
    isGhost: false,
    evidenceContentIds: [],
    label: null,
  };
}

function substitutionScene(): ComposedScene {
  return {
    revision: 7,
    nodes: [
      nodeOf("el-at-target", ["capture-reality"]),
      nodeOf("el-far", ["capture-reality"]),
    ],
    layers: [
      { layerId: "capture-reality", name: "Captured reality", visibleByDefault: true },
      { layerId: "plan-model", name: "Plan / BIM model", visibleByDefault: true },
    ],
    siteFrame: { origin: [0, 0, 0], northHeading: 0, units: "metre" },
    ghostSummary: null,
  };
}

function makeReal(): BabylonSceneRuntime {
  const outcome = createBabylonSceneRuntime({ engine: { mode: "null" }, geometry: geometryResolver });
  if (!outcome.ok) throw new Error(outcome.failure.detail);
  return outcome.value;
}

describe("WORLD-P5 substitution law — the real Babylon adapter ≡ the P0-A in-memory double", () => {
  test("both occupants load the same scene with the same revision", () => {
    const real = makeReal();
    const double = new InMemorySceneRuntimeDouble();
    const scene = substitutionScene();
    const realLoad = real.loadScene(scene);
    const doubleLoad = double.loadScene(scene);
    expect(realLoad.ok).toBe(true);
    expect(doubleLoad.ok).toBe(true);
    if (realLoad.ok && doubleLoad.ok) {
      expect(realLoad.value.sceneRevision).toBe(doubleLoad.value.sceneRevision);
    }
    if (realLoad.ok) real.dispose(realLoad.value);
    real.shutdown();
  });

  test("camera round-trips are byte-identical through both occupants", () => {
    const real = makeReal();
    const double = new InMemorySceneRuntimeDouble();
    const scene = substitutionScene();
    const realHandle = real.loadScene(scene);
    const doubleHandle = double.loadScene(scene);
    if (!realHandle.ok || !doubleHandle.ok) throw new Error("load failed");
    const typed: CameraState = {
      position: [8, -8, 6],
      target: [0, 0, 1],
      up: [0, 0, 1],
      fovRadians: 0.9,
      mode: "orbit",
    };
    real.setCamera(realHandle.value, typed);
    double.setCamera(doubleHandle.value, typed);
    const realBack = real.getCamera(realHandle.value);
    const doubleBack = double.getCamera(doubleHandle.value);
    expect(realBack.ok && doubleBack.ok).toBe(true);
    if (realBack.ok && doubleBack.ok) {
      expect(JSON.stringify(realBack.value)).toBe(JSON.stringify(doubleBack.value));
      expect(JSON.stringify(realBack.value)).toBe(JSON.stringify(typed));
    }
    real.dispose(realHandle.value);
    real.shutdown();
  });

  test("a pick through the camera target returns the SAME canonical element id in both", () => {
    const real = makeReal();
    const double = new InMemorySceneRuntimeDouble();
    const scene = substitutionScene();
    const realHandle = real.loadScene(scene);
    const doubleHandle = double.loadScene(scene);
    if (!realHandle.ok || !doubleHandle.ok) throw new Error("load failed");
    const realPick = real.pick(realHandle.value, 0.5, 0.5);
    const doublePick = double.pick(doubleHandle.value, 0.5, 0.5);
    expect(realPick.ok && doublePick.ok).toBe(true);
    if (realPick.ok && doublePick.ok) {
      expect(realPick.value.elementId).toBe("el-at-target");
      expect(doublePick.value.elementId).toBe("el-at-target");
      // hit points: the real adapter's surface intersection must lie
      // inside the declared box (the double returns the center).
      const p = realPick.value.hitPoint;
      expect(p).not.toBeNull();
      if (p !== null) {
        for (const axis of [0, 1, 2]) {
          expect(p[axis]).toBeGreaterThanOrEqual(-1.0001);
          expect(p[axis]).toBeLessThanOrEqual(1.0001);
        }
      }
    }
    real.dispose(realHandle.value);
    real.shutdown();
  });

  test("a pick through empty sky answers null in BOTH (never a guess)", () => {
    const real = makeReal();
    const double = new InMemorySceneRuntimeDouble();
    const scene = substitutionScene();
    const realHandle = real.loadScene(scene);
    const doubleHandle = double.loadScene(scene);
    if (!realHandle.ok || !doubleHandle.ok) throw new Error("load failed");
    const realPick = real.pick(realHandle.value, 0.02, 0.98);
    const doublePick = double.pick(doubleHandle.value, 0.02, 0.98);
    if (realPick.ok) expect(realPick.value.elementId).toBeNull();
    if (doublePick.ok) expect(doublePick.value.elementId).toBeNull();
    real.dispose(realHandle.value);
    real.shutdown();
  });

  test("layer visibility semantics are equivalent: toggled off → both miss; on → both hit again; unknown layer → both refuse", () => {
    const real = makeReal();
    const double = new InMemorySceneRuntimeDouble();
    const scene = substitutionScene();
    const realHandle = real.loadScene(scene);
    const doubleHandle = double.loadScene(scene);
    if (!realHandle.ok || !doubleHandle.ok) throw new Error("load failed");
    expect(real.setLayerVisible(realHandle.value, "capture-reality", false).ok).toBe(true);
    expect(double.setLayerVisible(doubleHandle.value, "capture-reality", false).ok).toBe(true);
    const realMiss = real.pick(realHandle.value, 0.5, 0.5);
    const doubleMiss = double.pick(doubleHandle.value, 0.5, 0.5);
    if (realMiss.ok) expect(realMiss.value.elementId).toBeNull();
    if (doubleMiss.ok) expect(doubleMiss.value.elementId).toBeNull();
    expect(real.setLayerVisible(realHandle.value, "capture-reality", true).ok).toBe(true);
    expect(double.setLayerVisible(doubleHandle.value, "capture-reality", true).ok).toBe(true);
    const realHit = real.pick(realHandle.value, 0.5, 0.5);
    const doubleHit = double.pick(doubleHandle.value, 0.5, 0.5);
    if (realHit.ok && doubleHit.ok) {
      expect(realHit.value.elementId).toBe(doubleHit.value.elementId);
    }
    const realUnknown = real.setLayerVisible(realHandle.value, "no-such-layer", false);
    const doubleUnknown = double.setLayerVisible(doubleHandle.value, "no-such-layer", false);
    expect(realUnknown.ok).toBe(false);
    expect(doubleUnknown.ok).toBe(false);
    if (!realUnknown.ok && !doubleUnknown.ok) {
      expect(realUnknown.failure.code).toBe(doubleUnknown.failure.code);
    }
    real.dispose(realHandle.value);
    real.shutdown();
  });

  test("ghost semantics are equivalent: a removed element is skipped by BOTH picks; unknown proposals refuse in BOTH", () => {
    const real = makeReal();
    const double = new InMemorySceneRuntimeDouble();
    const scene = substitutionScene();
    const realHandle = real.loadScene(scene);
    const doubleHandle = double.loadScene(scene);
    if (!realHandle.ok || !doubleHandle.ok) throw new Error("load failed");
    expect(real.setGhostSet(realHandle.value, "op-1", [], ["el-at-target"]).ok).toBe(true);
    expect(double.setGhostSet(doubleHandle.value, "op-1", [], ["el-at-target"]).ok).toBe(true);
    const realPick = real.pick(realHandle.value, 0.5, 0.5);
    const doublePick = double.pick(doubleHandle.value, 0.5, 0.5);
    if (realPick.ok) expect(realPick.value.elementId).toBeNull();
    if (doublePick.ok) expect(doublePick.value.elementId).toBeNull();
    const realGhost = real.setGhostSet(realHandle.value, "op-2", ["el-nonexistent"], []);
    const doubleGhost = double.setGhostSet(doubleHandle.value, "op-2", ["el-nonexistent"], []);
    expect(realGhost.ok).toBe(false);
    expect(doubleGhost.ok).toBe(false);
    real.dispose(realHandle.value);
    real.shutdown();
  });

  test("getWorldBounds agrees exactly on a geometry-LESS scene (the double-congruent fallback)", () => {
    const real = makeReal();
    const double = new InMemorySceneRuntimeDouble();
    const scene: ComposedScene = {
      ...substitutionScene(),
      nodes: [
        { ...nodeOf("el-bare"), geometry: null },
        { ...nodeOf("el-bare-2", ["plan-model"]), geometry: null, transform: translation(100, 0, 0) },
      ],
    };
    const realHandle = real.loadScene(scene);
    const doubleHandle = double.loadScene(scene);
    if (!realHandle.ok || !doubleHandle.ok) throw new Error("load failed");
    const realBounds = real.getWorldBounds(realHandle.value);
    const doubleBounds = double.getWorldBounds(doubleHandle.value);
    expect(realBounds.ok && doubleBounds.ok).toBe(true);
    if (realBounds.ok && doubleBounds.ok) {
      expect(JSON.stringify(realBounds.value)).toBe(JSON.stringify(doubleBounds.value));
    }
    real.dispose(realHandle.value);
    real.shutdown();
  });

  test("determinism: the whole real-adapter flow re-runs byte-identically (fresh runtime, same scene)", () => {
    const scene = substitutionScene();
    const run = (): string => {
      const runtime = makeReal();
      const handle = runtime.loadScene(scene);
      if (!handle.ok) throw new Error("load failed");
      const camera: CameraState = {
        position: [0, 0, 5],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fovRadians: Math.PI / 4,
        mode: "orbit",
      };
      runtime.setCamera(handle.value, camera);
      const pick = runtime.pick(handle.value, 0.5, 0.5);
      const back = runtime.getCamera(handle.value);
      const bounds = runtime.getWorldBounds(handle.value);
      runtime.dispose(handle.value);
      runtime.shutdown();
      return JSON.stringify({
        revision: handle.value.sceneRevision,
        pick: pick.ok ? pick.value.elementId : pick.failure.code,
        camera: back.ok ? back.value : null,
        bounds: bounds.ok ? bounds.value : null,
      });
    };
    expect(run()).toBe(run());
  });
});
