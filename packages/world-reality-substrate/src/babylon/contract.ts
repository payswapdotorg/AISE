/**
 * `@aise/world-reality-substrate` — Babylon.js scene-runtime adapter
 * CONTRACT (WORLD-P0-A).
 *
 * The port for the real-time interactive world scene: scene-graph ingest
 * from AISE scene-composition types, camera control (walk/orbit/fly),
 * picking/selection, layer visibility, sectioning, ghost/proposed-state
 * rendering hooks and measurement surfacing.
 *
 * LAWS (enforced by the substitution double + property tests):
 * 1. The contract receives `ComposedScene` and AISE interaction types and
 *    returns OPAQUE handles (`SceneRuntimeHandle`, `PickResult`). Babylon
 *    types NEVER appear in this interface — a conforming implementation
 *    needs no Babylon import to compile against it.
 * 2. Substrate identity never becomes canonical: pick results return the
 *    `elementId` AISE put in, never a Babylon mesh id.
 * 3. Fail-closed: a structurally invalid scene is refused with
 *    `scene_invalid` BEFORE any substrate call; the runtime never renders
 *    a partially-ingested scene.
 * 4. Ghost states are visually distinct by contract — the double proves a
 *    swap cannot make proposed state indistinguishable from captured
 *    reality.
 *
 * GPU note: this contract is headless-implementable (the double renders
 * nothing); actual GPU performance/behavioral measurement is BLOCKED in
 * P0 and owned by WORLD-P1 with the recorded protocol
 * (docs/world-program-evidence/WORLD-P0-A/PERFORMANCE-OBSERVATIONS.md).
 */

import type {
  CameraState,
  ComposedScene,
  SceneElementId,
  SectionPlane,
  SelectionState,
  WorldBounds,
  WorldMeasurement,
} from "../scene";
import type { SubstrateOutcome } from "../errors";

/** Opaque handle to a live scene held by the runtime (never a substrate object). */
export interface SceneRuntimeHandle {
  readonly handleKind: "scene-runtime";
  readonly sceneRevision: number;
  /** Opaque token — implementations may encode anything; callers treat as opaque. */
  readonly token: string;
}

/** Result of a pick (selection) at viewport coordinates. */
export interface PickResult {
  readonly elementId: SceneElementId | null;
  /** World-space hit point when an element was hit, else null. */
  readonly hitPoint: readonly [number, number, number] | null;
}

/** Capability declaration — what THIS runtime implementation supports. */
export interface SceneRuntimeCapabilities {
  readonly maxNodes: number | null;
  readonly supportsSectioning: boolean;
  readonly supportsGhostRendering: boolean;
  readonly supportsWalkMode: boolean;
  readonly supportsFlyMode: boolean;
  readonly supportsMeasurement: boolean;
  /** Named BLOCKED capabilities with the honest reason (law 3 vocabulary). */
  readonly blocked: readonly { readonly capability: string; readonly reason: string }[];
}

/** Listener the runtime calls when the user interacts with the world. */
export interface SceneRuntimeListener {
  onSelectionChanged?(selection: SelectionState): void;
  onCameraChanged?(camera: CameraState): void;
  onMeasurementTaken?(measurement: WorldMeasurement): void;
}

/**
 * The Babylon scene-runtime port. Implementations wrap Babylon.js (the
 * primary substrate per the 2026-10-02 directive) — or any other
 * real-time scene runtime, including the in-memory substitution double
 * (../double.ts) which proves the contract is implementable WITHOUT
 * Babylon at all.
 */
export interface BabylonSceneRuntimeAdapter {
  readonly portId: "babylon.scene-runtime/1";
  /** Honest capability declaration (used fail-closed by `applySection`). */
  readonly capabilities: SceneRuntimeCapabilities;

  /** Ingest a composed scene. Refuses invalid scenes; replaces prior state. */
  loadScene(scene: ComposedScene): SubstrateOutcome<SceneRuntimeHandle>;

  /** Apply a full camera state (mode + pose + fov). */
  setCamera(handle: SceneRuntimeHandle, camera: CameraState): SubstrateOutcome<null>;

  /** Read back the current camera (round-trip with setCamera). */
  getCamera(handle: SceneRuntimeHandle): SubstrateOutcome<CameraState>;

  /** Pick at normalized viewport coords (0..1, origin top-left). */
  pick(
    handle: SceneRuntimeHandle,
    viewportX: number,
    viewportY: number,
  ): SubstrateOutcome<PickResult>;

  /** Set layer visibility by layer id. */
  setLayerVisible(
    handle: SceneRuntimeHandle,
    layerId: string,
    visible: boolean,
  ): SubstrateOutcome<null>;

  /**
   * Apply a section plane. Refused with `unsupported_operation` when the
   * implementation declared `supportsSectioning: false` — never silently
   * ignored (law 3).
   */
  applySection(handle: SceneRuntimeHandle, section: SectionPlane): SubstrateOutcome<null>;

  /**
   * Ghost-state hook: swap the ghost (proposed) overlay set for the given
   * operation. The runtime MUST render ghosts as an overlay distinct from
   * captured reality (the double enforces distinctness structurally).
   */
  setGhostSet(
    handle: SceneRuntimeHandle,
    operationId: string,
    proposedElementIds: readonly SceneElementId[],
    removedElementIds: readonly SceneElementId[],
  ): SubstrateOutcome<null>;

  /** Register interaction listeners. */
  addListener(handle: SceneRuntimeHandle, listener: SceneRuntimeListener): SubstrateOutcome<null>;

  /** Compute world bounds of the loaded scene (for navigation setup). */
  getWorldBounds(handle: SceneRuntimeHandle): SubstrateOutcome<WorldBounds>;

  /** Tear down the scene and release substrate resources. */
  dispose(handle: SceneRuntimeHandle): SubstrateOutcome<null>;
}
