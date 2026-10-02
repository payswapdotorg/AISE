/**
 * The in-memory substitution DOUBLE for the Babylon scene-runtime port
 * (WORLD-P0-A).
 *
 * Proves the contract is implementable with ZERO substrate: no Babylon
 * import, no WebGL, no GPU. Semantics are structural — transforms are
 * composed analytically, picking is analytic ray-vs-bounds, ghost
 * distinctness is a structural guarantee — so property tests can verify
 * the three substitution laws against a fully deterministic
 * implementation. A real Babylon adapter maps the same semantics onto
 * the Babylon scene graph; the double is the reference semantics.
 */

import type {
  CameraState,
  ComposedScene,
  SceneElementId,
  SectionPlane,
  SelectionState,
  WorldBounds,
} from "../scene";
import { validateScene } from "../scene";
import type { SubstrateOutcome } from "../errors";
import { ok, refuse } from "../errors";
import type {
  BabylonSceneRuntimeAdapter,
  PickResult,
  SceneRuntimeCapabilities,
  SceneRuntimeHandle,
  SceneRuntimeListener,
} from "./contract";

const PORT = "babylon.double";

interface DoubleState {
  scene: ComposedScene;
  handleToken: string;
  camera: CameraState;
  layerVisible: Map<string, boolean>;
  section: SectionPlane | null;
  ghost: { operationId: string; proposed: Set<string>; removed: Set<string> } | null;
  listeners: SceneRuntimeListener[];
  disposed: boolean;
}

/** Bounds of a single node computed from its translation (analytic). */
function nodeCenter(scene: ComposedScene, elementId: string): readonly [number, number, number] | null {
  const node = scene.nodes.find((n) => n.elementId === elementId);
  if (!node) return null;
  // translation components live at matrix indices 3, 7, 11
  const m = node.transform.matrix;
  return [m[3] ?? 0, m[7] ?? 0, m[11] ?? 0];
}

/**
 * The double. `capabilities` declares sectioning/ghost/measurement
 * supported structurally; GPU-only behaviors (rendering, shading) are
 * declared BLOCKED with the honest reason.
 */
export class InMemorySceneRuntimeDouble implements BabylonSceneRuntimeAdapter {
  readonly portId = "babylon.scene-runtime/1" as const;
  readonly capabilities: SceneRuntimeCapabilities = {
    maxNodes: null,
    supportsSectioning: true,
    supportsGhostRendering: true,
    supportsWalkMode: true,
    supportsFlyMode: true,
    supportsMeasurement: true,
    blocked: [
      { capability: "gpu-rendering", reason: "in-memory double: no GPU — WORLD-P1 protocol" },
      { capability: "shading", reason: "in-memory double: no material system" },
    ],
  };

  private states = new Map<string, DoubleState>();
  private nextToken = 1;

  loadScene(scene: ComposedScene): SubstrateOutcome<SceneRuntimeHandle> {
    const violations = validateScene(scene);
    if (violations.length > 0) {
      return refuse("scene_invalid", PORT, `scene validation failed: ${violations.join("; ")}`);
    }
    const token = `double-${this.nextToken++}`;
    const layerVisible = new Map<string, boolean>();
    for (const layer of scene.layers) {
      layerVisible.set(layer.layerId, layer.visibleByDefault);
    }
    this.states.set(token, {
      scene,
      handleToken: token,
      camera: {
        position: [0, 0, 10],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fovRadians: Math.PI / 4,
        mode: "orbit",
      },
      layerVisible,
      section: null,
      ghost: null,
      listeners: [],
      disposed: false,
    });
    return ok({ handleKind: "scene-runtime", sceneRevision: scene.revision, token });
  }

  private state(handle: SceneRuntimeHandle): DoubleState | null {
    const s = this.states.get(handle.token);
    if (!s || s.disposed) return null;
    return s;
  }

  setCamera(handle: SceneRuntimeHandle, camera: CameraState): SubstrateOutcome<null> {
    const s = this.state(handle);
    if (!s) return refuse("request_invalid", PORT, "unknown or disposed handle");
    s.camera = camera;
    for (const l of s.listeners) l.onCameraChanged?.(camera);
    return ok(null);
  }

  getCamera(handle: SceneRuntimeHandle): SubstrateOutcome<CameraState> {
    const s = this.state(handle);
    if (!s) return refuse("request_invalid", PORT, "unknown or disposed handle");
    return ok(s.camera);
  }

  pick(handle: SceneRuntimeHandle, viewportX: number, viewportY: number): SubstrateOutcome<PickResult> {
    const s = this.state(handle);
    if (!s) return refuse("request_invalid", PORT, "unknown or disposed handle");
    if (viewportX < 0 || viewportX > 1 || viewportY < 0 || viewportY > 1) {
      return refuse("request_invalid", PORT, `viewport coords out of range: ${viewportX},${viewportY}`);
    }
    // analytic picking: nearest visible node whose center projects inside a
    // fixed screen-space radius — deterministic, substrate-free
    let best: { elementId: string; depth: number; point: readonly [number, number, number] } | null = null;
    for (const node of s.scene.nodes) {
      const visible = node.layerIds.every((lid) => s.layerVisible.get(lid) ?? true);
      if (!visible) continue;
      if (s.ghost?.removed.has(node.elementId)) continue;
      const center = nodeCenter(s.scene, node.elementId);
      if (!center) continue;
      const depth = center[2];
      // deterministic screen projection of the center (orthographic-ish)
      const sx = 0.5 + center[0] / 20;
      const sy = 0.5 - center[1] / 20;
      const dist = Math.hypot(sx - viewportX, sy - viewportY);
      if (dist < 0.05 && (best === null || depth < best.depth)) {
        best = { elementId: node.elementId, depth, point: center };
      }
    }
    const result: PickResult =
      best === null
        ? { elementId: null, hitPoint: null }
        : { elementId: best.elementId, hitPoint: best.point };
    const selection: SelectionState = {
      selectedElementIds: result.elementId ? [result.elementId] : [],
      hoveredElementId: result.elementId,
    };
    for (const l of s.listeners) l.onSelectionChanged?.(selection);
    return ok(result);
  }

  setLayerVisible(handle: SceneRuntimeHandle, layerId: string, visible: boolean): SubstrateOutcome<null> {
    const s = this.state(handle);
    if (!s) return refuse("request_invalid", PORT, "unknown or disposed handle");
    if (!s.scene.layers.some((l) => l.layerId === layerId)) {
      return refuse("request_invalid", PORT, `unknown layerId: ${layerId}`);
    }
    s.layerVisible.set(layerId, visible);
    return ok(null);
  }

  applySection(handle: SceneRuntimeHandle, section: SectionPlane): SubstrateOutcome<null> {
    const s = this.state(handle);
    if (!s) return refuse("request_invalid", PORT, "unknown or disposed handle");
    if (!this.capabilities.supportsSectioning) {
      return refuse("unsupported_operation", PORT, "sectioning not supported by this runtime");
    }
    s.section = section;
    return ok(null);
  }

  setGhostSet(
    handle: SceneRuntimeHandle,
    operationId: string,
    proposedElementIds: readonly SceneElementId[],
    removedElementIds: readonly SceneElementId[],
  ): SubstrateOutcome<null> {
    const s = this.state(handle);
    if (!s) return refuse("request_invalid", PORT, "unknown or disposed handle");
    if (!this.capabilities.supportsGhostRendering) {
      return refuse("unsupported_operation", PORT, "ghost rendering not supported by this runtime");
    }
    // structural distinctness law: ghost element ids must exist in the scene
    // and must not overlap the removed set
    const known = new Set(s.scene.nodes.map((n) => n.elementId));
    for (const id of proposedElementIds) {
      if (!known.has(id)) {
        return refuse("request_invalid", PORT, `ghost proposal references unknown element ${id}`);
      }
      if (removedElementIds.includes(id)) {
        return refuse("request_invalid", PORT, `element ${id} is both proposed and removed`);
      }
    }
    s.ghost = {
      operationId,
      proposed: new Set(proposedElementIds),
      removed: new Set(removedElementIds),
    };
    return ok(null);
  }

  addListener(handle: SceneRuntimeHandle, listener: SceneRuntimeListener): SubstrateOutcome<null> {
    const s = this.state(handle);
    if (!s) return refuse("request_invalid", PORT, "unknown or disposed handle");
    s.listeners.push(listener);
    return ok(null);
  }

  getWorldBounds(handle: SceneRuntimeHandle): SubstrateOutcome<WorldBounds> {
    const s = this.state(handle);
    if (!s) return refuse("request_invalid", PORT, "unknown or disposed handle");
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const node of s.scene.nodes) {
      const m = node.transform.matrix;
      const x = m[3] ?? 0, y = m[7] ?? 0, z = m[11] ?? 0;
      minX = Math.min(minX, x - 1); maxX = Math.max(maxX, x + 1);
      minY = Math.min(minY, y - 1); maxY = Math.max(maxY, y + 1);
      minZ = Math.min(minZ, z - 1); maxZ = Math.max(maxZ, z + 1);
    }
    if (!Number.isFinite(minX)) {
      return ok({ min: [0, 0, 0], max: [0, 0, 0] });
    }
    return ok({ min: [minX, minY, minZ], max: [maxX, maxY, maxZ] });
  }

  dispose(handle: SceneRuntimeHandle): SubstrateOutcome<null> {
    const s = this.states.get(handle.token);
    if (!s) return refuse("request_invalid", PORT, "unknown handle");
    s.disposed = true;
    this.states.delete(handle.token);
    return ok(null);
  }
}
