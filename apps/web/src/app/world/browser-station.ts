/**
 * WORLD-P4 — the world station's BROWSER-SAFE interaction layer.
 *
 * ZERO runtime imports (types only): this module compiles into a
 * plain-browser bundle with NO Node builtin anywhere in its graph
 * (the PROD-030/031 law — see record.ts for why the station itself
 * binds Node-side). The browser renders the COMMITTED station record
 * verbatim; every interaction is a PURE command reducer over the
 * record's pre-resolved element index.
 *
 * THE PARITY LAW (pinned by the headless test): for the same
 * commands, this reducer produces the IDENTICAL results as the REAL
 * world-ux transforms (`applyStationSelection`,
 * `applyStationCameraOperation`, the pick concerns, the layer
 * visibility AND-semantics) — the same typed laws, one algorithm,
 * pinned byte-identical by `headless.test.tsx`.
 */

import type { CameraState } from "@aise/world-reality-substrate";
import type { StationRecord, StationRecordElement } from "./record";

/* ------------------------------------------------------------------ */
/* The typed station commands (the closed vocabulary)                   */
/* ------------------------------------------------------------------ */

/** The station command vocabulary — a CLOSED set. */
export const STATION_COMMAND_KINDS = [
  "select-element",
  "clear-selection",
  "camera-operation",
  "toggle-layer",
] as const;
export type StationCommandKind = (typeof STATION_COMMAND_KINDS)[number];

/** One typed command the station surface dispatches. */
export type StationCommand =
  | { readonly kind: "select-element"; readonly elementId: string }
  | { readonly kind: "clear-selection" }
  | {
      readonly kind: "camera-operation";
      readonly operation: "orbit-to" | "walk-to" | "fly-through";
      readonly position: readonly [number, number, number];
      readonly target: readonly [number, number, number];
    }
  | { readonly kind: "toggle-layer"; readonly layerId: string; readonly visible: boolean };

/* ------------------------------------------------------------------ */
/* The station view state (what the reducer tracks)                     */
/* ------------------------------------------------------------------ */

/** The live interaction state the station surface renders. */
export interface StationViewState {
  readonly selectedElementIds: readonly string[];
  readonly hoveredElementId: string | null;
  readonly camera: CameraState;
  readonly layerVisibility: readonly { readonly layerId: string; readonly visible: boolean }[];
}

/** The initial view state (the record's defaults). */
export function initialStationViewState(record: StationRecord): StationViewState {
  return {
    selectedElementIds: [],
    hoveredElementId: null,
    camera: record.initialCamera,
    layerVisibility: record.layers.map((layer) => ({
      layerId: layer.layerId,
      visible: layer.visibleByDefault,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* The pure query layer (the record's pre-resolved index)               */
/* ------------------------------------------------------------------ */

/** Resolve one element from the record's index (canonical ids only). */
export function resolveRecordElement(
  record: StationRecord,
  elementId: string,
): StationRecordElement | null {
  return record.elements.find((element) => element.elementId === elementId) ?? null;
}

/**
 * The layer-visibility AND-semantics (the P0-A runtime law): an
 * element is visible iff EVERY layer it belongs to is visible; an
 * element with no layers is visible (vacuous truth).
 */
export function isRecordElementVisible(
  record: StationRecord,
  state: StationViewState,
  element: StationRecordElement,
): boolean {
  if (element.layerIds.length === 0) {
    return true;
  }
  const visibleByLayer = new Map(
    state.layerVisibility.map((entry) => [entry.layerId, entry.visible]),
  );
  return element.layerIds.every((layerId) => visibleByLayer.get(layerId) ?? true);
}

/**
 * The camera-operation law (the world-ux surface contract): the
 * operation kind sets the MODE (orbit-to → orbit, walk-to → walk,
 * fly-through → fly); positions must be finite; the fov carries over.
 */
export function applyRecordCameraOperation(
  camera: CameraState,
  operation: StationCommand extends never ? never : Extract<
    StationCommand,
    { kind: "camera-operation" }
  >,
): CameraState | null {
  const finite = (values: readonly number[]): boolean =>
    values.every((value) => Number.isFinite(value));
  if (!finite(operation.position) || !finite(operation.target)) {
    return null;
  }
  const mode =
    operation.operation === "orbit-to"
      ? ("orbit" as const)
      : operation.operation === "walk-to"
        ? ("walk" as const)
        : ("fly" as const);
  return {
    position: operation.position,
    target: operation.target,
    up: camera.up,
    fovRadians: camera.fovRadians,
    mode,
  };
}

/* ------------------------------------------------------------------ */
/* The command reducer (pure — the station's whole interaction law)     */
/* ------------------------------------------------------------------ */

/**
 * Reduce one typed command over the station view state. PURE +
 * fail-closed: an unknown element id, an unknown layer id or a
 * non-finite camera position leaves the state UNCHANGED and answers
 * the typed refusal (never a guess, never a crash).
 */
export function reduceStationCommand(
  record: StationRecord,
  state: StationViewState,
  command: StationCommand,
): { readonly state: StationViewState; readonly ok: boolean; readonly refusal: string | null } {
  switch (command.kind) {
    case "select-element": {
      const element = resolveRecordElement(record, command.elementId);
      if (element === null) {
        return {
          state,
          ok: false,
          refusal: `element ${command.elementId} is not part of this station scene`,
        };
      }
      const selected = [...new Set([...state.selectedElementIds, element.elementId])];
      return { state: { ...state, selectedElementIds: selected }, ok: true, refusal: null };
    }
    case "clear-selection":
      return { state: { ...state, selectedElementIds: [] }, ok: true, refusal: null };
    case "camera-operation": {
      const next = applyRecordCameraOperation(state.camera, command);
      if (next === null) {
        return {
          state,
          ok: false,
          refusal: "camera operation position/target must be finite (site-frame metres)",
        };
      }
      return { state: { ...state, camera: next }, ok: true, refusal: null };
    }
    case "toggle-layer": {
      const known = record.layers.some((layer) => layer.layerId === command.layerId);
      if (!known) {
        return {
          state,
          ok: false,
          refusal: `unknown layerId in toggle: ${command.layerId}`,
        };
      }
      return {
        state: {
          ...state,
          layerVisibility: state.layerVisibility.map((entry) =>
            entry.layerId === command.layerId
              ? { layerId: entry.layerId, visible: command.visible }
              : entry,
          ),
        },
        ok: true,
        refusal: null,
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* The world hash codec (the station's deep-link space)                 */
/* ------------------------------------------------------------------ */

/** The world route's query (the deep-linked element + panel + phase). */
export interface WorldRouteQuery {
  readonly element?: string;
  readonly panel?: string;
  readonly phase?: string;
}

/** Parse the world station's hash query (`#/world?element=…`). PURE. */
export function parseWorldHashQuery(hash: string): WorldRouteQuery {
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) {
    return {};
  }
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  const element = params.get("element");
  const panel = params.get("panel");
  const phase = params.get("phase");
  return {
    ...(element === null ? {} : { element }),
    ...(panel === null ? {} : { panel }),
    ...(phase === null ? {} : { phase }),
  };
}

/** Format the world station's hash query (round-trips verbatim). PURE. */
export function formatWorldHashQuery(query: WorldRouteQuery): string {
  const params = new URLSearchParams();
  if (query.element !== undefined) {
    params.set("element", query.element);
  }
  if (query.panel !== undefined) {
    params.set("panel", query.panel);
  }
  if (query.phase !== undefined) {
    params.set("phase", query.phase);
  }
  const text = params.toString();
  return text.length === 0 ? "#/world" : `#/world?${text}`;
}
