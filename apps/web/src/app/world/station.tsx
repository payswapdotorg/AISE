/**
 * WORLD-P4 — the world station SURFACE: the primary spatial
 * environment with the restrained seven-panel HUD (handoff §4).
 *
 * THE COMPOSITION LAW (law #2 — the HUD explains engineering state
 * without replacing the scene): the SCENE owns the viewport; the HUD
 * is a restrained chrome of seven panels around it. The scene here is
 * the DETERMINISTIC PRESENTATION LAYER over the committed station
 * record — the element roster with ghost-distinct status chips, the
 * layer table, the selection and the typed camera readout. The real
 * Babylon GPU surface is the P5 multiplatform mount (BLOCKED headless
 * — see the item's CAPABILITY-BOUNDARIES); every value this surface
 * renders is a verbatim citation of the record (the no-fabrication
 * law; zero network, zero clock — the record is the seed).
 */

import { useReducer } from "react";
import type { ReactNode } from "react";
import type { StationRecord } from "./record";
import {
  initialStationViewState,
  isRecordElementVisible,
  reduceStationCommand,
  resolveRecordElement,
  type StationCommand,
  type StationViewState,
} from "./browser-station";

/* ------------------------------------------------------------------ */
/* The HUD panel chrome (one restrained panel)                          */
/* ------------------------------------------------------------------ */

const PANEL_CLASS_BY_STATE: Readonly<Record<string, string>> = {
  POPULATED: "world-hud-panel world-hud-panel--populated",
  EMPTY: "world-hud-panel world-hud-panel--empty",
  UNAVAILABLE: "world-hud-panel world-hud-panel--unavailable",
};

/** One HUD panel: the honest state + the verbatim data summary. */
function HudPanelView(props: {
  readonly panelId: string;
  readonly title: string;
  readonly contentState: string;
  readonly note: string | null;
  readonly children: ReactNode;
}): ReactNode {
  const cls = PANEL_CLASS_BY_STATE[props.contentState] ?? "world-hud-panel";
  return (
    <section
      id={`world-panel-${props.panelId}`}
      className={cls}
      data-panel-id={props.panelId}
      data-content-state={props.contentState}
    >
      <h3 className="world-hud-panel__title">{props.title}</h3>
      {props.note !== null ? (
        <p className="world-hud-panel__note">{props.note}</p>
      ) : null}
      {props.children}
    </section>
  );
}

/** The verbatim data summary of one panel's bound data. */
function panelSummary(panel: {
  readonly panelId: string;
  readonly contentState: string;
  readonly note: string | null;
  readonly data: unknown;
}): string {
  if (panel.contentState !== "POPULATED" || panel.data === null) {
    return panel.note ?? "no data in scope";
  }
  const data = panel.data as Record<string, unknown>;
  switch (panel.panelId) {
    case "objective": {
      const problem = data.primaryProblem as Record<string, unknown> | null;
      const clashCount = (data.clashProblems as unknown[] | undefined)?.length ?? 0;
      const problemText =
        problem === null ? "no primary problem" : `${problem.title} (${problem.status})`;
      return `${problemText}; ${clashCount} live clash binding(s)`;
    }
    case "evidence":
      return `readiness ${String(data.readinessVerdict)}; ${String(data.gapCount)} gap(s), ${String(data.openRemediationTaskCount)} open task(s)`;
    case "constraints":
      return `${String(data.constraintCount)} governed constraint(s) in scope`;
    case "agent": {
      const operator = data.activeOperator as Record<string, unknown> | null;
      const operatorText =
        operator === null ? "no active operator" : `${String(operator.role)} ${String(operator.operatorId)}`;
      return `${operatorText}; ${String(data.openActionCount)} open bounded action(s)`;
    }
    case "validation": {
      const verdict = data.gateVerdict === null ? "no gate bound" : `gate ${String(data.gateVerdict)}`;
      const replay =
        data.replayVerified === null ? "" : `; replay ${data.replayVerified ? "verified" : "unverified"}`;
      return `${verdict}${replay}`;
    }
    case "cost-boq":
      return `${String(data.lineCount)} projected line(s); ${String(data.epistemicClass)} (BOQ Graph is the quantity authority)`;
    case "timeline":
      return `makespan ${String(data.makespanHours)} h over ${String(data.phaseCount)} phase(s)`;
    default:
      return "panel data";
  }
}

/* ------------------------------------------------------------------ */
/* The scene presentation layer (the deterministic element roster)      */
/* ------------------------------------------------------------------ */

const STATUS_CHIP_CLASS: Readonly<Record<string, string>> = {
  captured: "world-chip world-chip--captured",
  plan: "world-chip world-chip--plan",
  "capture-asset": "world-chip world-chip--capture-asset",
  annotation: "world-chip world-chip--annotation",
  "proposed-ghost": "world-chip world-chip--proposed-ghost",
  "proposed-removed": "world-chip world-chip--proposed-removed",
};

/** The scene roster: one row per station element, ghost-distinct. */
function SceneRoster(props: {
  readonly record: StationRecord;
  readonly state: StationViewState;
  readonly dispatch: (command: StationCommand) => void;
}): ReactNode {
  const rows = props.record.elements.map((element) => {
    const visible = isRecordElementVisible(props.record, props.state, element);
    const selected = props.state.selectedElementIds.includes(element.elementId);
    const chipClass = STATUS_CHIP_CLASS[element.status] ?? "world-chip";
    return (
      <li key={element.elementId} className="world-roster__row" data-element-id={element.elementId}>
        <button
          type="button"
          className="world-roster__select"
          data-selected={selected ? "true" : undefined}
          data-status={element.status}
          data-ghost={element.isGhost ? "true" : undefined}
          data-visible={visible ? "true" : "false"}
          onClick={() =>
            props.dispatch({ kind: "select-element", elementId: element.elementId })
          }
        >
          <span className={chipClass}>{element.status}</span>
          <span className="world-roster__label">
            {element.label ?? element.elementId.slice(0, 12)}
          </span>
          {element.isGhost ? (
            <span className="world-roster__ghost-mark" aria-hidden="true">
              ◌
            </span>
          ) : null}
        </button>
      </li>
    );
  });
  return (
    <div className="world-scene">
      <div className="world-scene__viewport" role="img" aria-label="The composed station scene — deterministic presentation layer; the GPU surface mounts in the multiplatform convergence item">
        <p className="world-scene__camera">
          camera {props.state.camera.mode}: pos [{props.state.camera.position.join(", ")}] →
          target [{props.state.camera.target.join(", ")}]
        </p>
        <p className="world-scene__hint">
          {props.record.elements.length} elements ·{" "}
          {props.record.elements.filter((element) => element.isGhost).length} proposed ghost(s)
        </p>
      </div>
      <div className="world-scene__layers">
        {props.state.layerVisibility.map((entry) => {
          const layer = props.record.layers.find((l) => l.layerId === entry.layerId);
          return (
            <label key={entry.layerId} className="world-layer-toggle">
              <input
                type="checkbox"
                checked={entry.visible}
                onChange={(event) =>
                  props.dispatch({
                    kind: "toggle-layer",
                    layerId: entry.layerId,
                    visible: event.target.checked,
                  })
                }
              />
              {layer?.name ?? entry.layerId}
            </label>
          );
        })}
      </div>
      <ul className="world-roster" data-testid="world-roster">{rows}</ul>
      {props.state.selectedElementIds.length > 0 ? (
        <p className="world-scene__selection" data-testid="world-selection">
          selected: {props.state.selectedElementIds.join(", ")}
        </p>
      ) : null}
      <div className="world-scene__camera-ops">
        <button
          type="button"
          className="world-camera-op"
          data-testid="world-camera-orbit"
          onClick={() =>
            props.dispatch({
              kind: "camera-operation",
              operation: "orbit-to",
              position: [8, -8, 6],
              target: [0, 0, 1],
            })
          }
        >
          Orbit the site
        </button>
        <button
          type="button"
          className="world-camera-op"
          data-testid="world-camera-walk"
          onClick={() =>
            props.dispatch({
              kind: "camera-operation",
              operation: "walk-to",
              position: [1, 1, 1.7],
              target: [2, 2, 1.7],
            })
          }
        >
          Walk to the wall
        </button>
        <button
          type="button"
          className="world-camera-op"
          data-testid="world-camera-fly"
          onClick={() =>
            props.dispatch({
              kind: "camera-operation",
              operation: "fly-through",
              position: [0, -10, 8],
              target: [0, 0, 1],
            })
          }
        >
          Fly through
        </button>
        <button
          type="button"
          className="world-camera-op"
          data-testid="world-selection-clear"
          onClick={() => props.dispatch({ kind: "clear-selection" })}
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The station root (the scene + the restrained HUD)                    */
/* ------------------------------------------------------------------ */

/** The world station's controlled props (the single-store law: the
 *  mount owns the view state; the station is a pure function of it). */
export interface WorldStationProps {
  readonly record: StationRecord;
  readonly state: StationViewState;
  readonly dispatch: (command: StationCommand) => void;
}

/** The world station: the spatial surface with the seven-panel HUD. */
export function WorldStation(props: WorldStationProps): ReactNode {
  const { state, dispatch } = props;
  const selected =
    state.selectedElementIds.length === 1
      ? resolveRecordElement(props.record, state.selectedElementIds[0]!)
      : null;
  return (
    <main id="world-station" className="world-station" data-station-id={props.record.stationId}>
      <header className="world-station__header">
        <h2 className="world-station__title">
          Engineering world — {props.record.scopeLabel}
        </h2>
        <p className="world-station__meta">
          station {props.record.stationId} · composed {props.record.composedAt} ·
          the HUD explains engineering state without replacing the scene
        </p>
      </header>
      <div className="world-station__body">
        <SceneRoster record={props.record} state={state} dispatch={dispatch} />
        <aside className="world-hud" aria-label="Engineering HUD" data-testid="world-hud">
          {props.record.hud.panels.map((panel) => (
            <HudPanelView
              key={panel.panelId}
              panelId={panel.panelId}
              title={panel.title}
              contentState={panel.contentState}
              note={panel.note}
            >
              <p className="world-hud-panel__summary" data-testid={`world-panel-summary-${panel.panelId}`}>
                {panelSummary(panel)}
              </p>
              {panel.panelId === "objective" && selected !== null && selected.concernsPanels.includes("objective") ? (
                <p className="world-hud-panel__link" data-testid="world-objective-element-link">
                  the selected element ({selected.status}) concerns this objective
                </p>
              ) : null}
            </HudPanelView>
          ))}
        </aside>
      </div>
    </main>
  );
}

/**
 * The standalone station (owning its reducer): the embedding for
 * headless renders and any host without its own store. The browser
 * mount uses the CONTROLLED `WorldStation` over its single store.
 */
export function StandaloneWorldStation(props: {
  readonly record: StationRecord;
}): ReactNode {
  const [state, dispatch] = useReducer(
    (view: StationViewState, command: StationCommand) =>
      reduceStationCommand(props.record, view, command).state,
    props.record,
    initialStationViewState,
  );
  return WorldStation({ record: props.record, state, dispatch });
}
