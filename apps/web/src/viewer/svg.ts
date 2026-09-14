/**
 * AISE-027 — deterministic pane SVG renderer (shared by the 3D and 2D panes).
 *
 * One `<polygon>` per projected shape (closed contour — the projection
 * engine emits closed boundary polygons), each carrying the shape's
 * `data-node-id` — the stable cross-pane identity anchor shared by the 3D,
 * 2D and BOQ panes — plus the 026 `data-origin` traceability hook. Fixed
 * element order (the projection's node-id-sorted shapes), fixed attribute
 * order, `fmt` canonical numbers → byte-identical SVG for identical input.
 *
 * PRESENTATION-ONLY DIFFERENTIATION: scenario-authored shapes (origin
 * "scenario") render with a DASHED stroke — a presentation distinction the
 * viewer draws over 026's verbatim origin vocabulary; it changes no data.
 * `selectedNodeId` toggles `data-selected="true"` plus the highlight
 * stroke on exactly that node's shape — again presentation only. Honest
 * omissions are listed after the drawing as `<li>` entries with their
 * stable reason codes. This module is pure string rendering: no DOM, no
 * events, no fetching.
 */

import { boundsOfPoints, escapeHtml, fmt, paddedViewBox, pointsAttr } from "./format";
import type { PaneProjection, Point2D } from "./model";

/** Pane stroke width (screen units). */
export const PANE_STROKE_WIDTH = 1.5;

/** Stroke of an unselected projected shape. */
export const PANE_STROKE = "#000000";

/** Stroke of the SELECTED shape (highlight, presentation only). */
export const PANE_SELECTED_STROKE = "#c2410c";

/** Dash pattern for scenario-authored (new) elements — presentation only. */
export const PANE_SCENARIO_DASH = "4 2";

/**
 * Deterministic SVG document of a pane projection. `selectedNodeId`
 * highlights that node's shape (data-selected + stroke) — presentation
 * only; geometry, ids and order are untouched.
 */
export function renderPaneSvg(projection: PaneProjection, selectedNodeId?: string): string {
  const allPoints: Point2D[] = [];
  for (const shape of projection.shapes) {
    allPoints.push(...shape.points);
  }
  const box = paddedViewBox(boundsOfPoints(allPoints));
  const lines: string[] = [
    `<svg height="${box.height}" viewBox="${box.viewBox}" width="${box.width}" xmlns="http://www.w3.org/2000/svg">`,
  ];
  for (const shape of projection.shapes) {
    const selected = selectedNodeId !== undefined && selectedNodeId === shape.nodeId;
    const stroke = selected ? PANE_SELECTED_STROKE : PANE_STROKE;
    const scenarioAuthored = shape.origin === "scenario";
    const dashAttr = scenarioAuthored ? ` stroke-dasharray="${PANE_SCENARIO_DASH}"` : "";
    lines.push(
      `<polygon data-node-id="${escapeHtml(shape.nodeId)}" data-origin="${escapeHtml(shape.origin)}"${selected ? ` data-selected="true"` : ""} fill="none" points="${pointsAttr(shape.points)}" stroke="${stroke}" stroke-width="${fmt(PANE_STROKE_WIDTH)}"${dashAttr}/>`,
    );
  }
  lines.push("</svg>");
  return `${lines.join("\n")}\n`;
}

/** Honest omission list items: stable node id + reason code, verbatim order. */
export function omissionLines(projection: PaneProjection): string[] {
  if (projection.omissions.length === 0) {
    return [];
  }
  const lines = [`<ul class="omissions">`];
  for (const omission of projection.omissions) {
    lines.push(
      `<li data-omitted-node-id="${escapeHtml(omission.nodeId)}" data-reason="${escapeHtml(omission.reason)}">${escapeHtml(omission.nodeId)} — ${escapeHtml(omission.reason)}</li>`,
    );
  }
  lines.push(`</ul>`);
  return lines;
}

/** Honest placeholder when a pane has no projectable shapes at all. */
export function emptyPaneLines(what: string): string[] {
  return [`<p class="pane-empty">No ${what} in this state layer.</p>`];
}
