/**
 * WORLD-P5 Mount 3 — the CHROME browser mount: the GPU mount's full
 * journey (the SAME world-station React surface + the REAL Babylon
 * viewport, feature-equivalent to browser-gpu-mount) composed inside
 * the PRODUCTION HUD CHROME:
 *
 *   - the chrome stylesheet (world-chrome.css) rides IN THE BUNDLE as
 *     text and is injected as a <style data-testid="world-chrome-style">
 *     element — the station surface itself stays untouched (the panels
 *     are data; the chrome is presentation, over the existing BEM
 *     classnames only);
 *   - the station is wrapped in the chrome frame
 *     (`<div class="world-chrome-frame">`), the diegetic full-viewport
 *     console the stylesheet dresses;
 *   - the AUDIO HOOKS (chrome.ts) are wired into the typed command
 *     entry: every dispatched command outcome maps to its cue through
 *     the PURE `audioCueOf` and plays best-effort on the synthesized
 *     gesture-gated sink — audio is PRESENTATION-ONLY (failures are
 *     swallowed; the last computed cue is honest typed state, never
 *     markup);
 *   - the real GPU viewport mounts exactly as the GPU mount mounts it
 *     (canvas picks → typed select-element commands; camera operations
 *     mirror onto the real camera; layer toggles drive the real
 *     AND-semantics), with the deterministic fallback if no WebGL.
 *
 * Exposes the THREE typed handles for the journeys:
 *   window.__AISE_WORLD_STATION__ — the deterministic P4 handle;
 *   window.__AISE_WORLD_GPU__     — the real-viewport diagnostics;
 *   window.__AISE_WORLD_CHROME__  — the chrome's own diagnostics
 *     (stylesheet injection, frame presence, the audio cue state).
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { WorldStation } from "./station";
import type { StationRecord } from "./record";
import {
  initialStationViewState,
  reduceStationCommand,
  resolveRecordElement,
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
// @ts-expect-error — the chrome stylesheet ships as TEXT through the bundler's css->text loader (see the chrome smoke journey's bundle scan); TypeScript has no ambient css-module declaration on this surface, and the text is pure DATA the mount injects as a <style> element below
import chromeCss from "./world-chrome.css";
import {
  audioCueOf,
  createAudioCueSink,
  notifyUserGesture,
  type AudioCueInput,
} from "./chrome";

const record = recordData as unknown as StationRecord;

/* ------------------------------------------------------------------ */
/* The chrome stylesheet (injected once, as data)                       */
/* ------------------------------------------------------------------ */

const chromeCssText: string = chromeCss;

/** Inject the chrome stylesheet into the document head (idempotent). */
function injectChromeStylesheet(): void {
  if (document.querySelector('style[data-testid="world-chrome-style"]') !== null) {
    return;
  }
  const style = document.createElement("style");
  style.setAttribute("data-testid", "world-chrome-style");
  style.textContent = chromeCssText;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/* The audio hooks (presentation-only — never markup, never state)      */
/* ------------------------------------------------------------------ */

const audioSink = createAudioCueSink();
/** The last cue COMPUTED for a dispatched command (honest typed state
 *  for the journey — audio itself never affects the render). */
let lastAudioCue: string | null = null;
/** Has the first user gesture (pointerdown/keydown) been observed? */
let chromeGestureObserved = false;

/** The first pointerdown/keydown unlocks the sink (the autoplay
 *  policy — a captured, once-only listener pair). */
function onFirstUserGesture(): void {
  if (chromeGestureObserved) return;
  chromeGestureObserved = true;
  notifyUserGesture();
  window.removeEventListener("pointerdown", onFirstUserGesture, true);
  window.removeEventListener("keydown", onFirstUserGesture, true);
}

window.addEventListener("pointerdown", onFirstUserGesture, true);
window.addEventListener("keydown", onFirstUserGesture, true);

/** Compute + play the cue for one command outcome (best-effort; the
 *  typed refusal of an unavailable sink is swallowed as the honest,
 *  presentation-only degradation it is). */
function playCueForCommand(command: StationCommand, ok: boolean, hitStatus: string | null): void {
  const cue = audioCueOf({ command, ok, hitStatus });
  lastAudioCue = cue;
  if (cue !== null) {
    audioSink.play(cue);
  }
}

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

function render(): void {
  if (reactRoot === null) return;
  reactRoot.render(
    createElement(
      "div",
      { className: "world-chrome-frame", "data-testid": "world-chrome-frame" },
      createElement(WorldStation, {
        record,
        state: viewState,
        dispatch: (command: StationCommand) => dispatchStationCommand(command),
      }),
    ),
  );
}

/** The ONE command entry: the cue (presentation) first, then the
 *  reducer (LAW 2), then the real viewport. */
function dispatchStationCommand(command: StationCommand): { ok: boolean; refusal: string | null } {
  const reduced = reduceStationCommand(record, viewState, command);
  /* The audio cue mirrors the typed outcome (a ghost selection, a
   * refusal — the pure mapping in chrome.ts); for selections the hit
   * status is the resolved element's governed status. */
  const hitStatus =
    command.kind === "select-element"
      ? (resolveRecordElement(record, command.elementId)?.status ?? null)
      : null;
  playCueForCommand(command, reduced.ok, hitStatus);
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
/* The real viewport mount (the GPU mount's logic, verbatim)            */
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
  const width = host.clientWidth > 0 ? host.clientWidth : 640;
  const height = host.clientHeight > 0 ? host.clientHeight : 360;
  canvas.width = width;
  canvas.height = height;
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
  const canvasPick = (x: number, y: number): { elementId: string | null; ok: boolean; refusal: string | null } => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return { elementId: null, ok: false, refusal: "the canvas has no layout" };
    }
    const pick = runtime.pick(handle, x, y);
    if (!pick.ok) {
      return { elementId: null, ok: false, refusal: pick.failure.detail };
    }
    const elementId = pick.value.elementId;
    if (elementId === null) {
      return { elementId: null, ok: true, refusal: null };
    }
    const dispatched = dispatchStationCommand({ kind: "select-element", elementId });
    return { elementId, ok: dispatched.ok, refusal: dispatched.refusal };
  };
  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvasPick((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
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
  /* The stylesheet lands BEFORE the first commit — the chrome is there
   * for the very first paint (and for the deterministic static render,
   * which never sees it at all). */
  injectChromeStylesheet();
  reactRoot = createRoot(hostElement);
  /* The initial render commits SYNCHRONOUSLY — the real viewport
   * mounts into the committed DOM (React concurrent renders do not
   * commit within the render() call). */
  flushSync(() => {
    render();
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
    /** The P5 chrome handle (the chrome's own honest diagnostics). */
    __AISE_WORLD_CHROME__?: {
      /** Is the chrome stylesheet injected into the document? */
      readonly cssInjected: () => boolean;
      /** Is the chrome frame element present in the DOM? */
      readonly framePresent: () => boolean;
      /** The audio hooks' typed state (available/reason/gesture gate). */
      readonly audioState: () => {
        readonly available: boolean;
        readonly reason: string | null;
        readonly gestureGated: boolean;
      };
      /** The PURE command→cue mapping, exposed for the journey. */
      readonly audioCueOf: (input: AudioCueInput) => string | null;
      /** The last cue computed for a dispatched command (or null). */
      readonly lastCue: () => string | null;
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
  window.__AISE_WORLD_CHROME__ = {
    cssInjected: () =>
      document.querySelector('style[data-testid="world-chrome-style"]') !== null,
    framePresent: () =>
      document.querySelector('[data-testid="world-chrome-frame"]') !== null,
    audioState: () => ({
      available: audioSink.available,
      reason: audioSink.reason,
      gestureGated: chromeGestureObserved,
    }),
    audioCueOf: (input) => audioCueOf(input),
    lastCue: () => lastAudioCue,
  };
}
