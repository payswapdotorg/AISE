/**
 * WORLD-P5 Mount 1 — the GPU browser mount: the SAME world-station
 * React surface (panels, roster, layers — feature-equivalent to the
 * deterministic P4 mount) with the REAL Babylon viewport hosted in the
 * station's viewport element, driven through the SAME typed command
 * reducer (`browser-station.ts`).
 *
 * THE MOUNT LAWS (the P4 parity floor, held):
 *  - the record is the whole world (the committed station record incl.
 *    the P5 viewport projection — the element status index + camera
 *    state remain the mount's authority);
 *  - every interaction flows through the TYPED command vocabulary
 *    (LAW 2): canvas picks produce typed select-element commands
 *    (canonical ids only), camera operations apply the reducer's
 *    camera then mirror it to the real viewport, layer toggles drive
 *    the real AND-semantics visibility;
 *  - the deterministic presentation stays: if the real engine cannot
 *    be created (no WebGL), the mount carries the honest
 *    `data-gpu="unavailable: …"` state and the station remains fully
 *    usable through the deterministic layer (the substitution law's
 *    fallback path);
 *  - ghost distinctness renders for real (the ghost material) and the
 *    ghost-REMOVED element is visually removed while staying
 *    resolvable in the roster (the P3 law).
 *
 * Exposes BOTH typed handles for the journey:
 *   window.__AISE_WORLD_STATION__ — the deterministic P4 handle;
 *   window.__AISE_WORLD_GPU__     — the real-viewport diagnostics
 *     (renderer info, pick, camera, draw calls, mesh census).
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { WorldStation } from "./station";
import type { StationRecord } from "./record";
import {
  initialStationViewState,
  reduceStationCommand,
  type StationCommand,
  type StationViewState,
} from "./browser-station";
import { createBabylonSceneRuntime } from "@aise/world-scene-runtime";
import type {
  BabylonSceneRuntime,
  SceneFrameStats,
  SceneRendererInfo,
} from "@aise/world-scene-runtime";
import type {
  CameraState,
  GeometryReference,
  SceneRuntimeHandle,
} from "@aise/world-reality-substrate";
import recordData from "./station-record.json";

const record = recordData as unknown as StationRecord;

/* ------------------------------------------------------------------ */
/* The viewport geometry resolver (the record's declared boxes)          */
/* ------------------------------------------------------------------ */

const BOXES_BY_ASSET = new Map(record.viewport.boxes.map((b) => [b.assetId, b]));

function recordGeometryResolver(ref: GeometryReference) {
  const box = BOXES_BY_ASSET.get(ref.assetId);
  if (box === undefined) return null;
  return { kind: "box" as const, min: box.min, max: box.max };
}

/* ------------------------------------------------------------------ */
/* The typed interaction state (the reducer is the authority)           */
/* ------------------------------------------------------------------ */

let viewState: StationViewState = initialStationViewState(record);
const commandLog: readonly StationCommand[] = [];
let reactRoot: Root | null = null;
let gpuRuntime: BabylonSceneRuntime | null = null;
let gpuHandle: SceneRuntimeHandle | null = null;
let gpuUnavailableReason: string | null = null;
/** The live canvas pick (set once the real viewport mounts). */
let canvasPickRef:
  | ((x: number, y: number) => { elementId: string | null; ok: boolean; refusal: string | null })
  | null = null;
/** The P5 gesture-capture state (module-level — one viewport mounts). */
let gestureMode: "off" | "armed" | "captured" = "off";
let capturedGestures: {
  readonly pickedElementId: string;
  readonly dragDeltaMetres: readonly [number, number, number];
  readonly gestures: readonly string[];
} | null = null;

function render(): void {
  if (reactRoot === null) return;
  reactRoot.render(
    createElement(WorldStation, {
      record,
      state: viewState,
      dispatch: (command: StationCommand) => dispatchStationCommand(command),
    }),
  );
}

/** The ONE command entry: reducer first (LAW 2), then the real viewport. */
function dispatchStationCommand(command: StationCommand): { ok: boolean; refusal: string | null } {
  const reduced = reduceStationCommand(record, viewState, command);
  if (!reduced.ok) {
    return { ok: false, refusal: reduced.refusal };
  }
  viewState = reduced.state;
  (commandLog as StationCommand[]).push(command);
  // Mirror the typed command onto the real viewport (best-effort — the
  // typed state is the authority; the viewport is presentation).
  if (gpuRuntime !== null && gpuHandle !== null) {
    if (command.kind === "camera-operation") {
      gpuRuntime.setCamera(gpuHandle, viewState.camera);
      gpuRuntime.renderOnce(gpuHandle);
    } else if (command.kind === "toggle-layer") {
      gpuRuntime.setLayerVisible(gpuHandle, command.layerId, command.visible);
      gpuRuntime.renderOnce(gpuHandle);
    }
  }
  render();
  return { ok: true, refusal: null };
}

/* ------------------------------------------------------------------ */
/* The real viewport mount                                               */
/* ------------------------------------------------------------------ */

function mountRealViewport(): void {
  const host = document.querySelector<HTMLElement>(".world-scene__viewport");
  if (host === null) {
    gpuUnavailableReason = "the station viewport element is not present";
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.className = "world-scene__gpu-canvas";
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.setAttribute("data-testid", "world-gpu-canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "The real Babylon viewport over the station's declared geometry (software GL renders it where no GPU device exists)",
  );
  /* Contain the absolutely-positioned canvas to the viewport element
   * (the P4 surface file is untouched — this is mount-level
   * presentation CSS). A deterministic square BUFFER (the ray math's
   * aspect) — the engine may resize it to the layout size; the pick
   * normalizes through the rect either way. */
  host.style.position = "relative";
  /* A presentational height for the viewport element (the P4 surface
   * carries no CSS — this is mount-level presentation CSS so the
   * canvas has a real layout and the ray math a sane aspect). */
  if (host.clientHeight < 200) {
    host.style.height = "360px";
  }
  canvas.width = 512;
  canvas.height = 512;
  // The deterministic camera readout + hint stay (the record is the
  // authority); the canvas renders the declared geometry.
  const firstChild = host.firstElementChild;
  if (firstChild !== null) {
    host.insertBefore(canvas, firstChild);
  } else {
    host.appendChild(canvas);
  }

  const runtimeOutcome = createBabylonSceneRuntime({
    engine: { mode: "webgl", canvas },
    geometry: recordGeometryResolver,
  });
  if (!runtimeOutcome.ok) {
    gpuUnavailableReason = runtimeOutcome.failure.detail;
    host.setAttribute("data-gpu", `unavailable: ${gpuUnavailableReason}`);
    canvas.remove();
    return;
  }
  const runtime = runtimeOutcome.value;
  const loadOutcome = runtime.loadScene(record.viewport.scene);
  if (!loadOutcome.ok) {
    gpuUnavailableReason = loadOutcome.failure.detail;
    host.setAttribute("data-gpu", `unavailable: ${gpuUnavailableReason}`);
    runtime.shutdown();
    canvas.remove();
    return;
  }
  const handle = loadOutcome.value;
  const ghostSummary = record.viewport.scene.ghostSummary;
  if (ghostSummary !== null) {
    runtime.setGhostSet(
      handle,
      ghostSummary.operationId,
      ghostSummary.proposedElementIds,
      ghostSummary.removedElementIds,
    );
  }
  runtime.setCamera(handle, record.initialCamera);
  /* Real-substrate warm-up: Babylon compiles material shaders
   * asynchronously — the first render pass(es) prepare effects and may
   * draw nothing; the world is user-visible from the first READY
   * frame. This bounded loop (50 ms ticks, ≤ 2 s) renders until the
   * substrate actually draws, then stops — the same warm-up discipline
   * the P1 measurement harness applies (warm-up frames are never
   * measured). */
  runtime.renderOnce(handle);
  let warmupTicks = 0;
  const warmup = setInterval(() => {
    runtime.renderOnce(handle);
    warmupTicks += 1;
    const stats = runtime.frameStats(handle);
    if ((stats.ok && stats.value.drawCalls > 0) || warmupTicks >= 40) {
      clearInterval(warmup);
    }
  }, 50);

  /* Canvas picks produce TYPED select-element commands (canonical ids). */
  const canvasPick = (x: number, y: number): { elementId: string | null; ok: boolean; refusal: string | null; hitPoint: readonly [number, number, number] | null } => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return { elementId: null, ok: false, refusal: "the canvas has no layout", hitPoint: null };
    }
    const pick = runtime.pick(handle, x, y);
    if (!pick.ok) {
      return { elementId: null, ok: false, refusal: pick.failure.detail, hitPoint: null };
    }
    const elementId = pick.value.elementId;
    if (elementId === null) {
      return { elementId: null, ok: true, refusal: null, hitPoint: null };
    }
    const dispatched = dispatchStationCommand({ kind: "select-element", elementId });
    return { elementId, ok: dispatched.ok, refusal: dispatched.refusal, hitPoint: pick.value.hitPoint };
  };

  /* ---------------------------------------------------------------- */
  /* WORLD-P5 Mount 4 — the DM gesture capture (solution mode). The    */
  /* browser captures the TYPED gesture sequence from REAL viewport   */
  /* picks (pointerdown pick → pointerup pick → the xy site-frame      */
  /* delta between the two hit points). The declared instant + the     */
  /* operator identity are stamped by the SERVING compile              */
  /* (authoring.ts assembleGestureStream) — the browser never reads    */
  /* a clock (the lane's law #9). The compile itself is served-side    */
  /* (Node / the live backend — the crypto-free bundle law).          */
  /* ---------------------------------------------------------------- */
  const authoringBar = document.createElement("div");
  authoringBar.className = "world-authoring-bar";
  authoringBar.setAttribute("data-testid", "world-authoring-bar");
  const armButton = document.createElement("button");
  armButton.type = "button";
  armButton.className = "world-camera-op";
  armButton.setAttribute("data-testid", "world-solution-arm");
  armButton.textContent = "Arm move gesture (solution mode)";
  const authoringStatus = document.createElement("span");
  authoringStatus.setAttribute("data-testid", "world-authoring-status");
  authoringStatus.textContent = "gesture capture: off";
  authoringBar.appendChild(armButton);
  authoringBar.appendChild(authoringStatus);
  host.parentElement?.appendChild(authoringBar);

  let gestureModeLocal: "off" | "armed" | "captured" = "off";
  let grabStart: { elementId: string; hitPoint: readonly [number, number, number] } | null = null;
  armButton.addEventListener("click", () => {
    gestureModeLocal = gestureModeLocal === "off" ? "armed" : "off";
    gestureMode = gestureModeLocal;
    grabStart = null;
    capturedGestures = null;
    authoringStatus.textContent = `gesture capture: ${gestureModeLocal}`;
  });

  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (gestureModeLocal === "armed") {
      const pick = runtime.pick(handle, x, y);
      if (pick.ok && pick.value.elementId !== null && pick.value.hitPoint !== null) {
        grabStart = { elementId: pick.value.elementId, hitPoint: pick.value.hitPoint };
        authoringStatus.textContent = `gesture capture: grabbed ${pick.value.elementId}`;
      } else {
        authoringStatus.textContent = "gesture capture: the grab must land on picked geometry (never a guess)";
      }
      return;
    }
    canvasPick(x, y);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (gestureModeLocal !== "armed" || grabStart === null) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const pick = runtime.pick(handle, x, y);
    if (!pick.ok || pick.value.hitPoint === null) {
      authoringStatus.textContent = "gesture capture: the drop must land on picked geometry (no fabricated ground-plane unproject)";
      return;
    }
    const a = grabStart.hitPoint;
    const b = pick.value.hitPoint;
    const delta: readonly [number, number, number] = [b[0] - a[0], b[1] - a[1], 0];
    if (!Number.isFinite(delta[0]) || !Number.isFinite(delta[1])) {
      authoringStatus.textContent = "gesture capture: the derived delta was not finite — refused";
      return;
    }
    capturedGestures = {
      pickedElementId: grabStart.elementId,
      dragDeltaMetres: delta,
      gestures: ["pick-element", "begin-grab", "drag-by", "drop-at", "commit"],
    };
    gestureModeLocal = "captured";
    gestureMode = "captured";
    authoringStatus.textContent =
      `gesture captured: move ${grabStart.elementId} by (${delta[0].toFixed(2)}, ${delta[1].toFixed(2)}, 0) m — awaiting the serving compile (the declared instant + operator are stamped serve-side)`;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (gestureModeLocal !== "armed" || grabStart === null) return;
    event.preventDefault();
  });

  gpuRuntime = runtime;
  gpuHandle = handle;
  canvasPickRef = canvasPick;
  host.setAttribute("data-gpu", "webgl");
}

/* ------------------------------------------------------------------ */
/* The entry                                                             */
/* ------------------------------------------------------------------ */

const hostElement = document.getElementById("world-host");
if (hostElement !== null) {
  reactRoot = createRoot(hostElement);
  /* The initial render commits SYNCHRONOUSLY — the real viewport
   * mounts into the committed DOM (React concurrent renders do not
   * commit within the render() call). */
  flushSync(() => {
    reactRoot?.render(
      createElement(WorldStation, {
        record,
        state: viewState,
        dispatch: (command: StationCommand) => dispatchStationCommand(command),
      }),
    );
  });
  mountRealViewport();
}

declare global {
  interface Window {
    /** The P4 deterministic handle (the typed reducer state). */
    __AISE_WORLD_STATION__?: {
      readonly stationId: string;
      readonly state: () => StationViewState;
      readonly commandLog: () => readonly StationCommand[];
      readonly dispatch: (command: StationCommand) => {
        readonly ok: boolean;
        readonly refusal: string | null;
      };
      readonly resolve: (elementId: string) => {
        readonly elementId: string;
        readonly status: string;
        readonly concernsPanels: readonly string[];
      } | null;
    };
    /** The P5 real-viewport handle (GPU/soft-GL diagnostics + picks). */
    __AISE_WORLD_GPU__?: {
      readonly stationId: string;
      readonly engineState: () => "webgl" | "unavailable";
      readonly unavailableReason: () => string | null;
      readonly rendererInfo: () => SceneRendererInfo | null;
      readonly camera: () => CameraState | null;
      /** A simulated canvas pick: the real ray + the TYPED select command. */
      readonly pickAt: (
        x: number,
        y: number,
      ) => { readonly elementId: string | null; readonly ok: boolean; readonly refusal: string | null } | null;
      readonly meshCensus: () => { readonly meshes: number; readonly activeMeshes: number } | null;
      readonly drawCalls: () => number | null;
      readonly renderOnce: () => SceneFrameStats | null;
    };
    /** The P5 DM gesture capture (the typed stream, awaiting the serving compile). */
    __AISE_WORLD_AUTHORING__?: {
      readonly mode: () => "off" | "armed" | "captured";
      readonly captured: () => {
        readonly pickedElementId: string;
        readonly dragDeltaMetres: readonly [number, number, number];
        readonly gestures: readonly string[];
      } | null;
    };
  }
}

if (typeof window !== "undefined") {
  window.__AISE_WORLD_STATION__ = {
    stationId: record.stationId,
    state: () => viewState,
    commandLog: () => commandLog,
    dispatch: (command) => dispatchStationCommand(command),
    resolve: (elementId) => {
      const element = record.elements.find((e) => e.elementId === elementId);
      if (element === undefined) return null;
      return {
        elementId: element.elementId,
        status: element.status,
        concernsPanels: element.concernsPanels,
      };
    },
  };
  window.__AISE_WORLD_GPU__ = {
    stationId: record.stationId,
    engineState: () => (gpuRuntime !== null ? "webgl" : "unavailable"),
    unavailableReason: () => gpuUnavailableReason,
    rendererInfo: () => gpuRuntime?.rendererInfo() ?? null,
    camera: () => {
      if (gpuRuntime === null || gpuHandle === null) return null;
      const outcome = gpuRuntime.getCamera(gpuHandle);
      return outcome.ok ? outcome.value : null;
    },
    pickAt: (x, y) => {
      if (gpuRuntime === null || gpuHandle === null) return null;
      return canvasPickRef !== null ? canvasPickRef(x, y) : null;
    },
    meshCensus: () => {
      if (gpuRuntime === null || gpuHandle === null) return null;
      const stats = gpuRuntime.frameStats(gpuHandle);
      if (!stats.ok) return null;
      return { meshes: record.viewport.boxes.length, activeMeshes: stats.value.activeMeshes };
    },
    drawCalls: () => {
      if (gpuRuntime === null || gpuHandle === null) return null;
      const stats = gpuRuntime.frameStats(gpuHandle);
      return stats.ok ? stats.value.drawCalls : null;
    },
    renderOnce: () => {
      if (gpuRuntime === null || gpuHandle === null) return null;
      const rendered = gpuRuntime.renderOnce(gpuHandle);
      if (!rendered.ok) return null;
      const stats = gpuRuntime.frameStats(gpuHandle);
      return stats.ok ? stats.value : null;
    },
  };
  window.__AISE_WORLD_AUTHORING__ = {
    mode: () => gestureMode,
    captured: () => capturedGestures,
  };
}
