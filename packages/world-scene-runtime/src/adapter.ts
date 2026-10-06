/**
 * `@aise/world-scene-runtime` — the REAL Babylon.js adapter for the
 * WORLD-P0-A `babylon.scene-runtime/1` port (WORLD-P5 Mount 1).
 *
 * THE CONVERGENCE MOUNT: the P4 route renders the committed station
 * record through the deterministic presentation layer; this adapter is
 * the real 3D scene host behind the same station-record discipline —
 * the record's element status index + camera state are the mount
 * inputs, the P0-A port is the boundary, and the in-memory double
 * (`InMemorySceneRuntimeDouble`) remains the reference semantics
 * (the colocated substitution tests prove equivalent canonical
 * outputs on the same scenes).
 *
 * LAWS (from the P0-A contract, enforced here):
 * 1. The port surface is substrate-neutral — Babylon types appear
 *    ONLY inside this implementation; the public API is typed over
 *    AISE scene-composition types and opaque handles.
 * 2. Identity law — pick results return the `elementId` AISE put in
 *    (meshes are NAMED by the canonical element id); a Babylon mesh id
 *    never crosses the boundary.
 * 3. Fail-closed — a structurally invalid scene is refused with
 *    `scene_invalid` BEFORE any substrate scene call; a geometry
 *    reference the host cannot resolve is refused with
 *    `asset_not_found` (never a partial ingest, never an invented
 *    mesh); an inverted/zero-extent declared box is refused naming it.
 * 4. Ghost states render DISTINCT from captured reality (translucent
 *    emissive material + wireframe) and ghost-REMOVED elements are
 *    disabled visually while their meshes stay resolvable in the scene
 *    graph (the P3 resolvability law carried into the runtime).
 *
 * ENGINE MODES (honest capability declarations):
 *   - `"null"`    — Babylon NullEngine: real scene graph, real CPU
 *                   ray picking, no GPU (the measurement + test mode).
 *   - `"webgl"`   — the real GPU pipeline over a WebGL canvas (the
 *                   browser mount; SwiftShader renders it as software
 *                   GL where no GPU device exists — the engine's own
 *                   renderer string is recorded, never averaged).
 *   - `"webgpu"`  — declared BLOCKED-with-protocol in this delivery:
 *                   WebGPU engine construction is async and cannot
 *                   occupy the port's synchronous surface; the
 *                   protocol is a mount-owned async prelude feeding
 *                   the engine instance in a future item.
 */

import {
  Color3,
  Engine,
  NullEngine,
  Plane,
  Scene,
  StandardMaterial,
  UniversalCamera,
  Vector3,
  MeshBuilder,
} from "@babylonjs/core";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import type {
  CameraState,
  ComposedScene,
  GeometryReference,
  SceneElementId,
  SectionPlane,
  SelectionState,
  WorldBounds,
} from "@aise/world-reality-substrate";
import { validateScene } from "@aise/world-reality-substrate";
import type { SubstrateOutcome } from "@aise/world-reality-substrate";
import type {
  BabylonSceneRuntimeAdapter,
  PickResult,
  SceneRuntimeCapabilities,
  SceneRuntimeHandle,
  SceneRuntimeListener,
} from "@aise/world-reality-substrate";
import type { IngestedMeshGeometry } from "./geometry";
import { ingestedBoxViolations, isIngestedMeshGeometry } from "./geometry";

const PORT = "babylon.scene-runtime/1";

/* ------------------------------------------------------------------ */
/* The substrate-neutral public surface                                 */
/* ------------------------------------------------------------------ */

/** Which substrate engine this adapter occupies the port with. */
export type SceneEngineSelection =
  | { readonly mode: "null" }
  | { readonly mode: "webgl"; readonly canvas: HTMLCanvasElement };

/**
 * How the host resolves AISE geometry references to typed ingested
 * meshes. Return `null` when the host does not carry the asset — the
 * adapter REFUSES the scene load (`asset_not_found`) rather than
 * rendering a partial world (law 3). Never invent geometry here.
 */
export type GeometryResolver = (reference: GeometryReference) => IngestedMeshGeometry | null;

export interface BabylonRuntimeOptions {
  readonly engine: SceneEngineSelection;
  readonly geometry: GeometryResolver;
}

/** The renderer identity the honest measurement protocol records. */
export interface SceneRendererInfo {
  readonly renderer: string;
  readonly vendor: string;
  readonly version: string;
}

/** Per-frame render statistics (the draw-call measurement surface). */
export interface SceneFrameStats {
  readonly drawCalls: number;
  readonly activeMeshes: number;
}

/**
 * The adapter plus the additive lifecycle + diagnostics extensions the
 * WORLD-P5 measurement protocol requires (render pass, draw-call
 * counts, the renderer string) — the port's `dispose(handle)` releases
 * one scene; `shutdown()` releases the substrate engine itself.
 */
export interface BabylonSceneRuntime extends BabylonSceneRuntimeAdapter {
  /** Render ONE frame of the handle's scene (CPU cost / GPU path). */
  renderOnce(handle: SceneRuntimeHandle): SubstrateOutcome<null>;
  /** The last-render frame statistics (draw calls, active meshes). */
  frameStats(handle: SceneRuntimeHandle): SubstrateOutcome<SceneFrameStats>;
  /** The renderer identity (GPU vendor/driver — honestly null on NullEngine). */
  rendererInfo(): SceneRendererInfo | null;
  /** Tear down the substrate engine (all scenes must be disposed first). */
  shutdown(): void;
}

/* ------------------------------------------------------------------ */
/* Internal per-handle state                                            */
/* ------------------------------------------------------------------ */

interface HandleState {
  readonly token: string;
  readonly scene: ComposedScene;
  readonly babylonScene: Scene;
  readonly camera: UniversalCamera;
  typedCamera: CameraState;
  readonly layerVisible: Map<string, boolean>;
  ghost: { operationId: string; proposed: Set<string>; removed: Set<string> } | null;
  readonly listeners: SceneRuntimeListener[];
  disposed: boolean;
}

/** The ghost material's distinctness constants (law 4 — asserted by tests). */
export const GHOST_MATERIAL_SPEC = {
  alpha: 0.45,
  emissive: [0.18, 0.85, 0.42] as const,
  wireframe: true,
} as const;

const DEFAULT_CAMERA: CameraState = {
  position: [0, 0, 10],
  target: [0, 0, 0],
  up: [0, 1, 0],
  fovRadians: Math.PI / 4,
  mode: "orbit",
};

/* ------------------------------------------------------------------ */
/* The adapter                                                          */
/* ------------------------------------------------------------------ */

export function createBabylonSceneRuntime(
  options: BabylonRuntimeOptions,
): SubstrateOutcome<BabylonSceneRuntime> {
  let engine: NullEngine | Engine;
  if (options.engine.mode === "null") {
    engine = new NullEngine({
      renderWidth: 512,
      renderHeight: 512,
      textureSize: 64,
      deterministicLockstep: false,
      lockstepMaxSteps: 1,
    });
  } else {
    engine = new Engine(options.engine.canvas, true, {}, false);
  }

  const capabilities: SceneRuntimeCapabilities = {
    maxNodes: null,
    supportsSectioning: true,
    supportsGhostRendering: true,
    supportsWalkMode: true,
    supportsFlyMode: true,
    // Honest: the runtime does not compute measurements — WORLD-P5
    // composes measurement at the station layer from typed picks.
    supportsMeasurement: false,
    blocked: [
      ...(options.engine.mode === "null"
        ? [
            {
              capability: "gpu-rendering",
              reason:
                "NullEngine — real scene graph and CPU ray picking only; the GPU frame/draw legs of the WORLD-P1/P5 measurement protocol require a real GPU device",
            },
          ]
        : []),
      {
        capability: "webgpu-engine",
        reason:
          "WebGPU engine construction is asynchronous and cannot occupy the port's synchronous surface in this delivery (recorded protocol: a mount-owned async prelude in a future item)",
      },
      {
        capability: "runtime-measurement",
        reason:
          "WORLD-P5 composes measurement at the station layer from typed picks — the runtime itself does not compute measurements",
      },
    ],
  };

  const states = new Map<string, HandleState>();
  const instrumentations = new Map<string, SceneInstrumentation>();
  let nextToken = 1;

  function state(handle: SceneRuntimeHandle): HandleState | null {
    const s = states.get(handle.token);
    if (!s || s.disposed) return null;
    return s;
  }

  function refuseRequest<T>(detail: string): SubstrateOutcome<T> {
    return {
      ok: false,
      failure: { code: "request_invalid", port: PORT, detail, subjectId: null },
    };
  }

  /** Apply the typed camera to the Babylon camera (site frame ≡ world). */
  function applyTypedCamera(s: HandleState, camera: CameraState): void {
    s.camera.position.set(camera.position[0], camera.position[1], camera.position[2]);
    s.camera.upVector.set(camera.up[0], camera.up[1], camera.up[2]);
    s.camera.setTarget(new Vector3(camera.target[0], camera.target[1], camera.target[2]));
    s.camera.fov = camera.fovRadians;
  }

  /** Resolve one node's visibility under the AND-semantics law. */
  function nodeVisible(s: HandleState, elementId: SceneElementId): boolean {
    const node = s.scene.nodes.find((n) => n.elementId === elementId);
    if (!node) return false;
    if (s.ghost?.removed.has(elementId)) return false;
    return node.layerIds.every((lid) => s.layerVisible.get(lid) ?? true);
  }

  /** Re-apply effective visibility to one element's meshes. */
  function refreshElementEnabled(s: HandleState, elementId: SceneElementId): void {
    for (const mesh of s.babylonScene.meshes) {
      if (mesh.name !== elementId) continue;
      mesh.setEnabled(nodeVisible(s, elementId));
    }
  }

  function ghostMaterial(scene: Scene): StandardMaterial {
    const mat = new StandardMaterial("aise-ghost-material", scene);
    mat.alpha = GHOST_MATERIAL_SPEC.alpha;
    mat.emissiveColor = new Color3(
      GHOST_MATERIAL_SPEC.emissive[0],
      GHOST_MATERIAL_SPEC.emissive[1],
      GHOST_MATERIAL_SPEC.emissive[2],
    );
    mat.wireframe = GHOST_MATERIAL_SPEC.wireframe;
    return mat;
  }

  function baseMaterial(scene: Scene, isGhost: boolean): StandardMaterial {
    if (isGhost) return ghostMaterial(scene);
    const mat = new StandardMaterial("aise-base-material", scene);
    mat.diffuseColor = new Color3(0.62, 0.6, 0.56);
    return mat;
  }

  const adapter: BabylonSceneRuntime = {
    portId: PORT,
    capabilities,

    loadScene(scene: ComposedScene): SubstrateOutcome<SceneRuntimeHandle> {
      // Law 3 — validate BEFORE any substrate scene call.
      const violations = validateScene(scene);
      if (violations.length > 0) {
        return {
          ok: false,
          failure: {
            code: "scene_invalid",
            port: PORT,
            detail: `scene validation failed: ${violations.join("; ")}`,
            subjectId: null,
          },
        };
      }
      // Resolve every geometry reference BEFORE building meshes — a
      // missing or malformed asset refuses the whole load (never a
      // partially-ingested scene, never an invented mesh).
      const resolved = new Map<SceneElementId, IngestedMeshGeometry>();
      for (const node of scene.nodes) {
        if (node.geometry === null) continue;
        const geometry = options.geometry(node.geometry);
        if (geometry === null) {
          return {
            ok: false,
            failure: {
              code: "asset_not_found",
              port: PORT,
              detail:
                `element ${node.elementId} references asset ${node.geometry.assetId} ` +
                `part ${node.geometry.partId} which the host geometry resolver does not carry — ` +
                "deliver the asset or clear the reference (never a partial scene)",
              subjectId: node.geometry.assetId,
            },
          };
        }
        if (!isIngestedMeshGeometry(geometry)) {
          return {
            ok: false,
            failure: {
              code: "scene_invalid",
              port: PORT,
              detail:
                `element ${node.elementId} references asset ${node.geometry.assetId} whose ` +
                "payload is outside the closed ingested-mesh vocabulary",
              subjectId: node.geometry.assetId,
            },
          };
        }
        const boxViolations = ingestedBoxViolations(geometry);
        if (boxViolations.length > 0) {
          return {
            ok: false,
            failure: {
              code: "scene_invalid",
              port: PORT,
              detail:
                `element ${node.elementId} asset ${node.geometry.assetId}: ${boxViolations.join("; ")}`,
              subjectId: node.geometry.assetId,
            },
          };
        }
        const dx = (geometry.max[0] ?? 0) - (geometry.min[0] ?? 0);
        const dy = (geometry.max[1] ?? 0) - (geometry.min[1] ?? 0);
        const dz = (geometry.max[2] ?? 0) - (geometry.min[2] ?? 0);
        if (dx <= 0 || dy <= 0 || dz <= 0) {
          return {
            ok: false,
            failure: {
              code: "scene_invalid",
              port: PORT,
              detail:
                `element ${node.elementId} asset ${node.geometry.assetId} declares a box with ` +
                `zero extent (${String(dx)} × ${String(dy)} × ${String(dz)}) — a 2D face cannot ` +
                "be meshed as a box; declare a thin volume",
              subjectId: node.geometry.assetId,
            },
          };
        }
        resolved.set(node.elementId, geometry);
      }

      // Build the Babylon scene (one scene per handle; prior handles
      // remain valid — loadScene on the SAME adapter is a fresh scene,
      // the host decides when to dispose prior handles).
      const babylonScene = new Scene(engine);
      const token = `babylon-${String(nextToken++)}`;
      const camera = new UniversalCamera(`${token}-camera`, new Vector3(0, 0, 10), babylonScene);
      babylonScene.activeCamera = camera;

      for (const node of scene.nodes) {
        const geometry = resolved.get(node.elementId);
        if (!geometry) continue; // no reference → no mesh (never invented)
        const min = geometry.min;
        const max = geometry.max;
        const mesh = MeshBuilder.CreateBox(
          node.elementId,
          {
            width: (max[0] ?? 0) - (min[0] ?? 0),
            height: (max[1] ?? 0) - (min[1] ?? 0),
            depth: (max[2] ?? 0) - (min[2] ?? 0),
          },
          babylonScene,
        );
        // The declared ingested box is WORLD-ABSOLUTE in the site frame
        // (the AISE-side convention of the ingested-mesh vocabulary) —
        // the node transform rides as metadata, never a second offset.
        mesh.position.set(
          ((min[0] ?? 0) + (max[0] ?? 0)) / 2,
          ((min[1] ?? 0) + (max[1] ?? 0)) / 2,
          ((min[2] ?? 0) + (max[2] ?? 0)) / 2,
        );
        // Force the world matrix NOW — Babylon computes world matrices
        // lazily (at render), and picking/bounds MUST see the placed
        // box, never the local-space one (verified: a lazy matrix
        // produces phantom hits from stale local bounds).
        mesh.computeWorldMatrix(true);
        mesh.metadata = { elementId: node.elementId };
        mesh.material = baseMaterial(babylonScene, node.isGhost);
      }

      const layerVisible = new Map<string, boolean>();
      for (const layer of scene.layers) {
        layerVisible.set(layer.layerId, layer.visibleByDefault);
      }
      const s: HandleState = {
        token,
        scene,
        babylonScene,
        camera,
        typedCamera: DEFAULT_CAMERA,
        layerVisible,
        ghost: null,
        listeners: [],
        disposed: false,
      };
      applyTypedCamera(s, DEFAULT_CAMERA);
      for (const node of scene.nodes) {
        refreshElementEnabled(s, node.elementId);
      }
      states.set(token, s);
      const instrumentation = new SceneInstrumentation(s.babylonScene);
      instrumentation.captureFrameTime = true;
      instrumentations.set(token, instrumentation);
      return {
        ok: true,
        value: { handleKind: "scene-runtime", sceneRevision: scene.revision, token },
      };
    },

    setCamera(handle: SceneRuntimeHandle, camera: CameraState): SubstrateOutcome<null> {
      const s = state(handle);
      if (!s) return refuseRequest("unknown or disposed handle");
      s.typedCamera = camera;
      applyTypedCamera(s, camera);
      for (const l of s.listeners) l.onCameraChanged?.(camera);
      return { ok: true, value: null };
    },

    getCamera(handle: SceneRuntimeHandle): SubstrateOutcome<CameraState> {
      const s = state(handle);
      if (!s) return refuseRequest("unknown or disposed handle");
      return { ok: true, value: s.typedCamera };
    },

    pick(
      handle: SceneRuntimeHandle,
      viewportX: number,
      viewportY: number,
    ): SubstrateOutcome<PickResult> {
      const s = state(handle);
      if (!s) return refuseRequest("unknown or disposed handle");
      if (viewportX < 0 || viewportX > 1 || viewportY < 0 || viewportY > 1) {
        return refuseRequest(`viewport coords out of range: ${String(viewportX)},${String(viewportY)}`);
      }
      const width = engine.getRenderWidth();
      const height = engine.getRenderHeight();
      const pickInfo = s.babylonScene.pick(viewportX * width, viewportY * height);
      const result: PickResult =
        pickInfo !== null && pickInfo.hit && pickInfo.pickedMesh !== null
          ? {
              // Law 2 — the CANONICAL AISE element id (meshes are named
              // by it); never a substrate mesh id.
              elementId: pickInfo.pickedMesh.name,
              hitPoint:
                pickInfo.pickedPoint !== null
                  ? [pickInfo.pickedPoint.x, pickInfo.pickedPoint.y, pickInfo.pickedPoint.z]
                  : null,
            }
          : { elementId: null, hitPoint: null };
      const selection: SelectionState = {
        selectedElementIds: result.elementId !== null ? [result.elementId] : [],
        hoveredElementId: result.elementId,
      };
      for (const l of s.listeners) l.onSelectionChanged?.(selection);
      return { ok: true, value: result };
    },

    setLayerVisible(
      handle: SceneRuntimeHandle,
      layerId: string,
      visible: boolean,
    ): SubstrateOutcome<null> {
      const s = state(handle);
      if (!s) return refuseRequest("unknown or disposed handle");
      if (!s.scene.layers.some((l) => l.layerId === layerId)) {
        return refuseRequest(`unknown layerId: ${layerId}`);
      }
      s.layerVisible.set(layerId, visible);
      for (const node of s.scene.nodes) {
        refreshElementEnabled(s, node.elementId);
      }
      return { ok: true, value: null };
    },

    applySection(handle: SceneRuntimeHandle, section: SectionPlane): SubstrateOutcome<null> {
      const s = state(handle);
      if (!s) return refuseRequest("unknown or disposed handle");
      if (!capabilities.supportsSectioning) {
        return {
          ok: false,
          failure: {
            code: "unsupported_operation",
            port: PORT,
            detail: "sectioning not supported by this runtime",
            subjectId: null,
          },
        };
      }
      // Babylon 8 scene.clipPlane is a Plane (ax+by+cz+d=0). AISE's
      // SectionPlane declares keep-side n·p ≥ distance → the boundary
      // plane is n·p − distance = 0 → Plane(n, −distance). The PIXEL-
      // LEVEL orientation (which half visually clips) is Babylon's
      // documented plane-side behavior and is verified on the GPU legs
      // (BLOCKED headless — recorded in WORLD-P5 evidence).
      s.babylonScene.clipPlane = section.enabled
        ? new Plane(
            section.normal[0],
            section.normal[1],
            section.normal[2],
            -section.distance,
          )
        : null;
      return { ok: true, value: null };
    },

    setGhostSet(
      handle: SceneRuntimeHandle,
      operationId: string,
      proposedElementIds: readonly SceneElementId[],
      removedElementIds: readonly SceneElementId[],
    ): SubstrateOutcome<null> {
      const s = state(handle);
      if (!s) return refuseRequest("unknown or disposed handle");
      if (!capabilities.supportsGhostRendering) {
        return {
          ok: false,
          failure: {
            code: "unsupported_operation",
            port: PORT,
            detail: "ghost rendering not supported by this runtime",
            subjectId: null,
          },
        };
      }
      // The P0-A double's structural laws, carried verbatim.
      const known = new Set(s.scene.nodes.map((n) => n.elementId));
      for (const id of proposedElementIds) {
        if (!known.has(id)) {
          return refuseRequest(`ghost proposal references unknown element ${id}`);
        }
        if (removedElementIds.includes(id)) {
          return refuseRequest(`element ${id} is both proposed and removed`);
        }
      }
      s.ghost = {
        operationId,
        proposed: new Set(proposedElementIds),
        removed: new Set(removedElementIds),
      };
      // Ghost distinctness: proposed elements carry the ghost material
      // (an overlay — base meshes are never mutated for non-ghosts);
      // removed elements are visually disabled while their meshes STAY
      // in the scene graph (the resolvability law).
      const ghostMat = ghostMaterial(s.babylonScene);
      for (const id of proposedElementIds) {
        for (const mesh of s.babylonScene.meshes) {
          if (mesh.name === id) mesh.material = ghostMat;
        }
      }
      for (const node of s.scene.nodes) {
        refreshElementEnabled(s, node.elementId);
      }
      return { ok: true, value: null };
    },

    addListener(handle: SceneRuntimeHandle, listener: SceneRuntimeListener): SubstrateOutcome<null> {
      const s = state(handle);
      if (!s) return refuseRequest("unknown or disposed handle");
      s.listeners.push(listener);
      return { ok: true, value: null };
    },

    getWorldBounds(handle: SceneRuntimeHandle): SubstrateOutcome<WorldBounds> {
      const s = state(handle);
      if (!s) return refuseRequest("unknown or disposed handle");
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      const meshed = new Set(s.babylonScene.meshes.map((m) => m.name));
      for (const node of s.scene.nodes) {
        if (meshed.has(node.elementId)) {
          for (const mesh of s.babylonScene.meshes) {
            if (mesh.name !== node.elementId) continue;
            const bb = mesh.getBoundingInfo().boundingBox;
            minX = Math.min(minX, bb.minimumWorld.x);
            minY = Math.min(minY, bb.minimumWorld.y);
            minZ = Math.min(minZ, bb.minimumWorld.z);
            maxX = Math.max(maxX, bb.maximumWorld.x);
            maxY = Math.max(maxY, bb.maximumWorld.y);
            maxZ = Math.max(maxZ, bb.maximumWorld.z);
          }
        } else {
          // The double's reference fallback: translation ± 1 m.
          const m = node.transform.matrix;
          const x = m[3] ?? 0, y = m[7] ?? 0, z = m[11] ?? 0;
          minX = Math.min(minX, x - 1); maxX = Math.max(maxX, x + 1);
          minY = Math.min(minY, y - 1); maxY = Math.max(maxY, y + 1);
          minZ = Math.min(minZ, z - 1); maxZ = Math.max(maxZ, z + 1);
        }
      }
      if (!Number.isFinite(minX)) {
        return { ok: true, value: { min: [0, 0, 0], max: [0, 0, 0] } };
      }
      return { ok: true, value: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] } };
    },

    dispose(handle: SceneRuntimeHandle): SubstrateOutcome<null> {
      const s = states.get(handle.token);
      if (!s) return refuseRequest("unknown handle");
      s.disposed = true;
      instrumentations.get(handle.token)?.dispose();
      instrumentations.delete(handle.token);
      s.babylonScene.dispose();
      states.delete(handle.token);
      return { ok: true, value: null };
    },

    renderOnce(handle: SceneRuntimeHandle): SubstrateOutcome<null> {
      const s = state(handle);
      if (!s) return refuseRequest("unknown or disposed handle");
      s.babylonScene.render();
      return { ok: true, value: null };
    },

    frameStats(handle: SceneRuntimeHandle): SubstrateOutcome<SceneFrameStats> {
      const s = state(handle);
      if (!s) return refuseRequest("unknown or disposed handle");
      const instrumentation = instrumentations.get(handle.token);
      if (!instrumentation) return refuseRequest("instrumentation missing for handle");
      return {
        ok: true,
        value: {
          drawCalls: instrumentation.drawCallsCounter.current,
          activeMeshes: s.babylonScene.getActiveMeshes().length,
        },
      };
    },

    rendererInfo(): SceneRendererInfo | null {
      // The honest GPU vendor/driver record (the measurement protocol's
      // law: hardware-declared, never averaged). NullEngine has no GL —
      // null (CPU-side, recorded as such).
      if (options.engine.mode === "null") return null;
      const glInfo = engine.getGlInfo();
      return {
        renderer: glInfo.renderer ?? "unknown",
        vendor: glInfo.vendor ?? "unknown",
        version: glInfo.version ?? "unknown",
      };
    },

    shutdown(): void {
      engine.dispose();
    },
  };

  return { ok: true, value: adapter };
}
