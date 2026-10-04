/**
 * WORLD-P4 — the world station's BROWSER MOUNT (the standalone entry
 * the real-browser smoke journey serves — the PROD-030/031 pattern
 * applied to the world route).
 *
 * The mount is deliberately SELF-CONTAINED and CRYPTO-FREE: it
 * imports ONLY the committed station record (data), the browser-safe
 * interaction layer (zero runtime imports) and the React surface —
 * no lane code, no engine, no Node builtin anywhere in the graph
 * (the engine executed Node-side when the record was committed; the
 * browser renders its outputs verbatim — see record.ts).
 *
 * The page ALSO exposes the station's typed interaction API on
 * `window.__AISE_WORLD_STATION__` so the smoke journey can assert
 * the interaction laws (selection, camera operations, layer toggles,
 * fail-closed refusals) IN the real browser.
 */

import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { WorldStation } from "./station";
import recordData from "./station-record.json";
import {
  initialStationViewState,
  reduceStationCommand,
  resolveRecordElement,
  type StationCommand,
  type StationViewState,
} from "./browser-station";
import type { StationRecord } from "./record";

const record = recordData as unknown as StationRecord;

/** The interactive handle the smoke journey drives (typed commands). */
let viewState: StationViewState = initialStationViewState(record);
const commandLog: readonly StationCommand[] = [];

declare global {
  interface Window {
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
  }
}

const container = document.getElementById("world-host");
if (container !== null) {
  const root = createRoot(container);
  const render = (): void => {
    root.render(
      createElement(WorldStation, {
        record,
        state: viewState,
        dispatch: (command: StationCommand) => {
          const reduced = reduceStationCommand(record, viewState, command);
          viewState = reduced.state;
          (commandLog as StationCommand[]).push(command);
          render();
          return { ok: reduced.ok, refusal: reduced.refusal };
        },
      }),
    );
  };
  window.__AISE_WORLD_STATION__ = {
    stationId: record.stationId,
    state: () => viewState,
    commandLog: () => commandLog,
    dispatch: (command: StationCommand) => {
      const reduced = reduceStationCommand(record, viewState, command);
      viewState = reduced.state;
      (commandLog as StationCommand[]).push(command);
      render();
      return { ok: reduced.ok, refusal: reduced.refusal };
    },
    resolve: (elementId: string) => {
      const element = resolveRecordElement(record, elementId);
      return element === null
        ? null
        : {
            elementId: element.elementId,
            status: element.status,
            concernsPanels: element.concernsPanels,
          };
    },
  };
  render();
}
