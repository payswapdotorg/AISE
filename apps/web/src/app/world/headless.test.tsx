/**
 * WORLD-P4 — the world route's HEADLESS DETERMINISTIC RENDER JOURNEY
 * (the §-companion of the real-browser smoke): mount the REAL React
 * surface over the COMMITTED station record with ZERO network, ZERO
 * clock reads and ZERO randomness — the record is the only seed.
 *
 * THE PARITY LAWS (pinned here, Node-side):
 *
 *   1. RECORD PARITY — the live Node binding (the REAL lanes + engine
 *      through `openReferenceWorldStation`) produces the
 *      byte-identical station the committed record carries (the
 *      "one record" discipline: the record is never stale);
 *   2. REDUCER PARITY — the browser-safe command reducer produces the
 *      IDENTICAL results as the REAL world-ux transforms for the same
 *      commands (selection, camera operations, layer-visibility
 *      AND-semantics) — one algorithm, pinned;
 *   3. RENDER DETERMINISM — the static render is byte-identical
 *      across repeated mounts (no hidden clock/randomness in the
 *      surface), and the seven honest panel states render.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { StandaloneWorldStation } from "./station";
import type { StationRecord } from "./record";
import { buildStationRecord } from "./record";
import {
  initialStationViewState,
  isRecordElementVisible,
  reduceStationCommand,
  resolveRecordElement,
} from "./browser-station";
import {
  openReferenceWorldStation,
  applyStationSelection,
  applyStationCameraOperation,
  applyStationLayerToggles,
  pickStationElement,
  canonicalJsonStringify,
} from "@aise/world-ux";
import { FIXTURE_WORLD } from "@aise/world-layer1-experience";

const RECORD_PATH = join(import.meta.dir, "station-record.json");
const COMMITTED = JSON.parse(readFileSync(RECORD_PATH, "utf8")) as StationRecord;

describe("LAW 1 — record parity (the one-record discipline)", () => {
  test("the live Node binding reproduces the committed record byte-identically", () => {
    const live = buildStationRecord();
    expect(canonicalJsonStringify(live)).toBe(canonicalJsonStringify(COMMITTED));
  });

  test("the record carries the live station identity + all seven panels + the element index", () => {
    const station = openReferenceWorldStation();
    if (!station.ok) throw new Error(station.failure.detail);
    expect(COMMITTED.stationId).toBe(station.value.stationId);
    expect(COMMITTED.hud.panels.map((panel) => panel.panelId)).toEqual([
      "objective",
      "evidence",
      "constraints",
      "agent",
      "validation",
      "cost-boq",
      "timeline",
    ]);
    expect(COMMITTED.elements.length).toBe(station.value.scene.elementStatus.length);
    /* Every element's pick concerns were resolved through the REAL pipeline. */
    const ghost = COMMITTED.elements.find((element) => element.status === "proposed-ghost");
    expect(ghost).toBeDefined();
    expect(ghost!.concernsPanels).toContain("validation");
    const removed = COMMITTED.elements.find(
      (element) => element.status === "proposed-removed",
    );
    expect(removed).toBeDefined();
    expect(removed!.concernsPanels).toContain("objective");
  });
});

describe("LAW 2 — reducer parity (the browser interaction layer ≡ the real transforms)", () => {
  test("selection parity: the reducer's selection equals applyStationSelection", () => {
    const station = openReferenceWorldStation();
    if (!station.ok) throw new Error(station.failure.detail);
    const target = COMMITTED.elements.find(
      (element) => element.status === "proposed-removed",
    )!;
    const real = applyStationSelection(station.value.scene, [target.elementId, "plan-slab-001"]);
    expect(real.ok).toBe(true);
    if (!real.ok) return;
    let view = initialStationViewState(COMMITTED);
    view = reduceStationCommand(COMMITTED, view, {
      kind: "select-element",
      elementId: target.elementId,
    }).state;
    view = reduceStationCommand(COMMITTED, view, {
      kind: "select-element",
      elementId: "plan-slab-001",
    }).state;
    expect(view.selectedElementIds).toEqual(real.value.selectedElementIds);
  });

  test("unknown-element selection fails closed in BOTH layers", () => {
    const station = openReferenceWorldStation();
    if (!station.ok) throw new Error(station.failure.detail);
    const real = applyStationSelection(station.value.scene, ["element-unknown-42"]);
    expect(real.ok).toBe(false);
    const reduced = reduceStationCommand(COMMITTED, initialStationViewState(COMMITTED), {
      kind: "select-element",
      elementId: "element-unknown-42",
    });
    expect(reduced.ok).toBe(false);
    expect(reduced.refusal).toContain("not part of this station scene");
  });

  test("camera parity: orbit/walk/fly produce the identical camera states", () => {
    const station = openReferenceWorldStation();
    if (!station.ok) throw new Error(station.failure.detail);
    const operations = [
      { operation: "orbit-to" as const, position: [8, -8, 6] as const, target: [0, 0, 1] as const },
      { operation: "walk-to" as const, position: [1, 1, 1.7] as const, target: [2, 2, 1.7] as const },
      { operation: "fly-through" as const, position: [0, -10, 8] as const, target: [0, 0, 1] as const },
    ];
    let camera = station.value.initialCamera;
    let view = initialStationViewState(COMMITTED);
    for (const operation of operations) {
      const real = applyStationCameraOperation(camera, {
        ...operation,
        fovRadians: null,
      });
      expect(real.ok).toBe(true);
      if (!real.ok) return;
      camera = real.value;
      const reduced = reduceStationCommand(COMMITTED, view, {
        kind: "camera-operation",
        operation: operation.operation,
        position: [...operation.position] as [number, number, number],
        target: [...operation.target] as [number, number, number],
      });
      expect(reduced.ok).toBe(true);
      view = reduced.state;
      expect(canonicalJsonStringify(view.camera)).toBe(canonicalJsonStringify(camera));
    }
  });

  test("layer-visibility parity: the AND-semantics agrees with applyStationLayerToggles", () => {
    const station = openReferenceWorldStation();
    if (!station.ok) throw new Error(station.failure.detail);
    const real = applyStationLayerToggles(FIXTURE_WORLD, [
      { layerId: "plan-model", visible: false },
    ]);
    expect(real.ok).toBe(true);
    if (!real.ok) return;
    const visibilityByElement = new Map(
      real.value.elementVisibility.map((entry) => [entry.elementId, entry.visible]),
    );
    let view = initialStationViewState(COMMITTED);
    view = reduceStationCommand(COMMITTED, view, {
      kind: "toggle-layer",
      layerId: "plan-model",
      visible: false,
    }).state;
    for (const element of COMMITTED.elements) {
      const recordVisible = isRecordElementVisible(COMMITTED, view, element);
      const realVisible = visibilityByElement.get(element.elementId);
      if (realVisible !== undefined) {
        expect(recordVisible).toBe(realVisible);
      }
    }
  });

  test("pick-concerns parity: the record's concerns equal pickStationElement's", () => {
    const station = openReferenceWorldStation();
    if (!station.ok) throw new Error(station.failure.detail);
    for (const element of COMMITTED.elements) {
      const real = pickStationElement(station.value.scene, {
        elementId: element.elementId,
      });
      expect(real.ok).toBe(true);
      if (!real.ok) continue;
      expect(element.concernsPanels).toEqual(real.value.concernsPanels);
      expect(element.status).toBe(real.value.status);
    }
  });

  test("resolveRecordElement answers null for unknown ids (never a guess)", () => {
    expect(resolveRecordElement(COMMITTED, "element-unknown-42")).toBe(null);
  });
});

describe("LAW 3 — render determinism (the headless mount)", () => {
  test("the station renders with the seven honest panels and the scene roster", () => {
    const markup = renderToStaticMarkup(
      createElement(StandaloneWorldStation, { record: COMMITTED }),
    );
    /* The station chrome. */
    expect(markup).toContain('id="world-station"');
    expect(markup).toContain(`data-station-id="${COMMITTED.stationId}"`);
    /* All seven panels with their honest states. */
    for (const panel of COMMITTED.hud.panels) {
      expect(markup).toContain(`id="world-panel-${panel.panelId}"`);
      expect(markup).toContain(`data-panel-id="${panel.panelId}"`);
      expect(markup).toContain(`data-content-state="${panel.contentState}"`);
    }
    /* The committed fixtures bind every panel POPULATED. */
    expect(markup.includes('data-content-state="POPULATED"')).toBe(true);
    /* The scene roster + ghost-distinct chips. */
    expect(markup).toContain('data-testid="world-roster"');
    expect(markup).toContain('data-status="proposed-ghost"');
    expect(markup).toContain('data-status="proposed-removed"');
    expect(markup).toContain('data-ghost="true"');
    /* The HUD-explains-never-replaces law is stated in the chrome. */
    expect(markup).toContain("without replacing the scene");
  });

  test("repeated renders are byte-identical (no hidden clock/randomness)", () => {
    const first = renderToStaticMarkup(createElement(StandaloneWorldStation, { record: COMMITTED }));
    const second = renderToStaticMarkup(createElement(StandaloneWorldStation, { record: COMMITTED }));
    expect(second).toBe(first);
  });

  test("the minimal record renders with honest EMPTY panels (never fabricated)", () => {
    const minimal: StationRecord = {
      ...COMMITTED,
      stationId: "0000000000000000",
      elements: COMMITTED.elements.slice(0, 1),
      hud: {
        panels: COMMITTED.hud.panels.map((panel) => ({
          ...panel,
          contentState: "EMPTY",
          note: "nothing in scope",
          data: null,
        })),
      },
    };
    const markup = renderToStaticMarkup(createElement(StandaloneWorldStation, { record: minimal }));
    expect(markup).toContain('data-content-state="EMPTY"');
    expect(markup).toContain("nothing in scope");
  });
});
