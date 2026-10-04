/**
 * WORLD-P4 — the world station's committed RECORD (the PROD-026/031
 * "one record" discipline applied to the world route).
 *
 * WHY A RECORD: the station binding composes the REAL lanes + the
 * deterministic solution engine + the BOQ derivation — Node-side
 * seams whose graphs transitively import `node:crypto` (the
 * identity derivations of `@aise/solution-contract`, the digest
 * helpers of `@aise/provider-registry` and
 * `@aise/world-layer1-experience`). A plain-browser bundle would
 * externalize the builtin and crash exactly the way PROD-030
 * documented — so, exactly as PROD-031's browser mount, the ENGINE
 * EXECUTES NODE-SIDE and the browser renders its outputs VERBATIM:
 * the bound station model is committed ONCE as
 * `station-record.json`, the headless test pins the parity (the
 * live Node binding ≡ the committed record, byte-identical), and
 * the browser mount + its typed interaction reducer (`browser-station.ts`,
 * zero runtime imports) operate only on the record.
 *
 * The record is DATA — every value traces to a lane record (the
 * no-fabrication law): the HUD panels, the element status index
 * (with each element's pick concerns, pre-resolved through the REAL
 * quarantined pipeline), the layer table and the initial camera.
 */

import {
  openReferenceWorldStation,
  pickStationElement,
  type StationElementStatus,
} from "@aise/world-ux";
import type { CameraState } from "@aise/world-reality-substrate";

/* ------------------------------------------------------------------ */
/* The record shape (the browser mount's whole world)                   */
/* ------------------------------------------------------------------ */

/** One element's pre-resolved interaction entry (the pick facts). */
export interface StationRecordElement {
  readonly elementId: string;
  readonly status: StationElementStatus;
  readonly isGhost: boolean;
  readonly label: string | null;
  readonly layerIds: readonly string[];
  readonly evidenceContentIds: readonly string[];
  /** The HUD panels a pick of this element concerns (pre-resolved). */
  readonly concernsPanels: readonly string[];
}

/** The committed station record. */
export interface StationRecord {
  readonly recordKind: "aise.world-station-record/1";
  readonly stationId: string;
  readonly scopeLabel: string;
  readonly composedAt: string;
  readonly initialCamera: CameraState;
  readonly layers: readonly {
    readonly layerId: string;
    readonly name: string;
    readonly visibleByDefault: boolean;
  }[];
  readonly elements: readonly StationRecordElement[];
  readonly hud: {
    readonly panels: readonly {
      readonly panelId: string;
      readonly title: string;
      readonly contentState: string;
      readonly note: string | null;
      readonly data: unknown;
    }[];
  };
}

/* ------------------------------------------------------------------ */
/* The record builder (Node-side — the controlled entry)                */
/* ------------------------------------------------------------------ */

/**
 * Build the station record from the LIVE Node binding (the committed
 * scenario). Every element's pick concerns are resolved through the
 * REAL `pickStationElement` (the quarantined pipeline); every panel
 * value is the bound HUD model, verbatim. Deterministic: the same
 * committed fixtures produce the byte-identical record.
 */
export function buildStationRecord(): StationRecord {
  const station = openReferenceWorldStation();
  if (!station.ok) {
    throw new Error(
      `the world station record builder refused: ${station.failure.detail}`,
    );
  }
  const model = station.value;
  const elements: StationRecordElement[] = [];
  for (const entry of model.scene.elementStatus) {
    const pick = pickStationElement(model.scene, { elementId: entry.elementId });
    if (!pick.ok) {
      throw new Error(
        `the world station record builder could not resolve ${entry.elementId}: ${pick.failure.detail}`,
      );
    }
    elements.push({
      elementId: pick.value.elementId,
      status: pick.value.status,
      isGhost: pick.value.isGhost,
      label: pick.value.label,
      layerIds:
        model.scene.ghostScene.nodes.find((n) => n.elementId === entry.elementId)
          ?.layerIds ?? [],
      evidenceContentIds: pick.value.evidenceContentIds,
      concernsPanels: pick.value.concernsPanels,
    });
  }
  elements.sort((a, b) =>
    a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0,
  );
  const panels = [
    model.hud.objective,
    model.hud.evidence,
    model.hud.constraints,
    model.hud.agent,
    model.hud.validation,
    model.hud.costBoq,
    model.hud.timeline,
  ].map((panel) => ({
    panelId: panel.panelId,
    title: panel.title,
    contentState: panel.contentState,
    note: panel.note,
    data: panel.data,
  }));
  return {
    recordKind: "aise.world-station-record/1",
    stationId: model.stationId,
    scopeLabel: model.scopeLabel,
    composedAt: model.composedAt,
    initialCamera: model.initialCamera,
    layers: model.scene.ghostScene.layers.map((layer) => ({
      layerId: layer.layerId,
      name: layer.name,
      visibleByDefault: layer.visibleByDefault,
    })),
    elements,
    hud: { panels },
  };
}
