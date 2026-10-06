/**
 * WORLD-P5 — the DESKTOP WORLD-STATION CORPUS (Task 7): the ONE
 * committed station record, consumed desktop-side.
 *
 * THE ONE-RECORD LAW (the P4 world-route discipline, carried to the
 * desktop): `apps/web/src/app/world/station-record.json` is the single
 * committed truth of the reference world station — built Node-side by
 * the web route's `record.ts` (the lanes + engine + BOQ binding) and
 * pinned byte-identical to the live binding by the web headless LAW 1
 * test. The desktop imports THAT FILE (an apps→apps import — legal by
 * the workspace boundary matrix, the same law that lets the desktop
 * shell load the web app) — never a copied record, never a forked
 * truth: if the web record changes, this corpus changes with it, by
 * construction.
 *
 * This module is the typed read surface over the record: pure
 * accessors only (stationId, scopeLabel, panelIds, elementCount,
 * viewportBoxCount, ghostElementId, committedAt, initialCamera,
 * ghostSummary — no IO, no clock, no randomness; the JSON import is
 * the only seed). The world journey model (`world-journey.ts`) and its
 * tests consume these; nothing here mutates or re-derives the record.
 */

import type { CameraState, GhostSetSummary } from "@aise/world-reality-substrate";
import type { StationRecord } from "../../../web/src/app/world/record";
import recordData from "../../../web/src/app/world/station-record.json";

/** The ONE committed record, typed through the web route's own record type. */
const record = recordData as unknown as StationRecord;

/** The ONE committed station record (the web route's file, verbatim). */
export const DESKTOP_STATION_RECORD: StationRecord = record;

/** The repo-relative path of the ONE committed record this corpus reads. */
export const WEB_STATION_RECORD_PATH = "apps/web/src/app/world/station-record.json";

/** The viewport box asset prefix (the projection's deterministic addressing). */
const BOX_ASSET_PREFIX = "station-box:";

/** The ghost box asset prefix (BOX_ASSET_PREFIX + "ghost-"). */
const GHOST_BOX_ASSET_PREFIX = `${BOX_ASSET_PREFIX}ghost-`;

/** The station identity (the web route renders the SAME value). */
export function stationId(): string {
  return record.stationId;
}

/** The station's scope label (the project the station governs). */
export function scopeLabel(): string {
  return record.scopeLabel;
}

/** When the record was committed (the record's `composedAt`). */
export function committedAt(): string {
  return record.composedAt;
}

/** The HUD panel ids, in the record's committed order. */
export function panelIds(): readonly string[] {
  return record.hud.panels.map((panel) => panel.panelId);
}

/** The element census (the record's element status index length). */
export function elementCount(): number {
  return record.elements.length;
}

/** The viewport box census (the declared-geometry projection's box table). */
export function viewportBoxCount(): number {
  return record.viewport.boxes.length;
}

/**
 * The ghost element id: the element whose viewport box asset starts
 * with `station-box:ghost-` (the prefix stripped — the projection's
 * deterministic addressing inverts to the element id). Null when the
 * projection declares no ghost box; the journey fails closed on that.
 */
export function ghostElementId(): string | null {
  const box = record.viewport.boxes.find((candidate) =>
    candidate.assetId.startsWith(GHOST_BOX_ASSET_PREFIX),
  );
  return box === undefined ? null : box.assetId.slice(BOX_ASSET_PREFIX.length);
}

/** The record's initial camera (the mount's camera authority). */
export function initialCamera(): CameraState {
  return record.initialCamera;
}

/**
 * The record's ghost summary (the proposed-state facts the GPU-parity
 * leg's ghost set applies): the operation id, the proposed ghost
 * element ids and the removed element ids. Null when the record
 * carries no proposal — the journey fails closed on that.
 */
export function ghostSummary(): GhostSetSummary | null {
  return record.viewport.scene.ghostSummary;
}
