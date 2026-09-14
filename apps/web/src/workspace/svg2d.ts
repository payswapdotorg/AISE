/**
 * AISE-021 — deterministic 2D pane renderer (local SVG presentation).
 *
 * The 2D pane renders the floor-plan `Drawing2D` the server assembled from
 * AISE-020's authoritative generator. apps/web cannot import the backend's
 * `toSvg` (boundary matrix: apps → apps/packages only), so this module
 * MIRRORS its semantics over the same structural `Drawing2D` value:
 *
 *  - one shape per drawn element (`<polygon>` / `<polyline>` / opening
 *    symbol `<circle>` + letter `<text>`), each carrying the element's
 *    `data-node-id` — the R5 cross-view selection anchor;
 *  - dimension lines with `data-dimension-id` and the measured value text:
 *    `«value» m ±«σ» m` ONLY when the σ is known; an unknown σ renders with
 *    NO ± at all — never a fabricated ±0 (the "σ unknown" wording lives in
 *    the workspace measurement strip; the SVG keeps 020's convention);
 *  - fixed element order (the drawing's already-sorted arrays), fixed
 *    alphabetical attribute order, `fmt` canonical numbers → byte-identical
 *    SVG for identical drawings.
 *
 * SELECTION: `selectedNodeId` only toggles `data-selected="true"` plus the
 * highlight stroke on exactly that node's elements — never the geometry,
 * ids or order. This module is pure string rendering: no DOM, no events,
 * no fetching (the workspace is server-rendered; interactivity is a thin
 * navigation shell outside this package's authority).
 */

import { boundsOfPoints, escapeHtml, fmt, paddedViewBox, pointsAttr } from "./format";
import type { Dimension2D, DrawnElement, Drawing2D, Point2D } from "./model";

/** Opening symbol radius in metres (× drawing scale). */
const SVG_SYMBOL_RADIUS_M = 0.2;

/** Minimum symbol radius in drawing units (visible at scale 1). */
const SVG_SYMBOL_MIN_RADIUS = 0.5;

/** Text height as a fraction of the drawing extent (min 1 drawing unit). */
const SVG_TEXT_HEIGHT_FRACTION = 0.05;

/** Stroke of an unselected 2D element. */
export const DRAWING_STROKE = "#000000";

/** Stroke of the SELECTED 2D element (highlight, presentation only). */
export const DRAWING_SELECTED_STROKE = "#c2410c";

/** Dimension line stroke (mirrors AISE-020's svg.ts). */
const DIMENSION_STROKE = "#333333";

/**
 * Deterministic SVG document of a drawing. `selectedNodeId` highlights that
 * node's elements (data-selected + stroke) — presentation only.
 */
export function renderDrawing2dSvg(drawing: Drawing2D, selectedNodeId?: string): string {
  const points: Point2D[] = [];
  for (const element of drawing.elements) {
    collectElementPoints(element, points);
  }
  for (const dimension of drawing.dimensions) {
    points.push(dimension.from, dimension.to);
  }

  const bounds = boundsOfPoints(points);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const extent = Math.max(width, height);
  const fontSize = extent > 0 ? Math.max(extent * SVG_TEXT_HEIGHT_FRACTION, 1) : 1;
  const box = paddedViewBox(bounds);

  const lines: string[] = [
    `<svg height="${box.height}" viewBox="${box.viewBox}" width="${box.width}" xmlns="http://www.w3.org/2000/svg">`,
  ];
  for (const element of drawing.elements) {
    lines.push(...elementSvg(element, drawing.coordinateFrame.scale, fontSize, selectedNodeId));
  }
  for (const dimension of drawing.dimensions) {
    lines.push(...dimensionSvg(dimension, fontSize));
  }
  lines.push("</svg>");
  return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */

function collectElementPoints(element: DrawnElement, into: Point2D[]): void {
  if (element.geometry2d.kind === "point") {
    into.push(element.geometry2d.point);
  } else {
    into.push(...element.geometry2d.points);
  }
  if (element.label !== undefined) {
    into.push(element.label.anchor);
  }
}

function elementSvg(
  element: DrawnElement,
  scale: number,
  fontSize: number,
  selectedNodeId: string | undefined,
): string[] {
  const selected = selectedNodeId !== undefined && selectedNodeId === element.sourceNodeId;
  const stroke = selected ? DRAWING_SELECTED_STROKE : DRAWING_STROKE;
  const selectedAttr = selected ? ` data-selected="true"` : "";
  const weight = fmt(element.style.strokeWeight);
  const geometry = element.geometry2d;
  const lines: string[] = [];
  if (geometry.kind === "polygon") {
    lines.push(
      `<polygon data-node-id="${escapeHtml(element.elementId)}"${selectedAttr} fill="none" points="${pointsAttr(geometry.points)}" stroke="${stroke}" stroke-width="${weight}"/>`,
    );
  } else if (geometry.kind === "polyline") {
    lines.push(
      `<polyline data-node-id="${escapeHtml(element.elementId)}"${selectedAttr} fill="none" points="${pointsAttr(geometry.points)}" stroke="${stroke}" stroke-width="${weight}"/>`,
    );
  } else {
    const radius = fmt(Math.max(SVG_SYMBOL_MIN_RADIUS, SVG_SYMBOL_RADIUS_M * scale));
    lines.push(
      `<circle cx="${fmt(geometry.point[0])}" cy="${fmt(geometry.point[1])}" data-node-id="${escapeHtml(element.elementId)}"${selectedAttr} fill="none" r="${radius}" stroke="${stroke}" stroke-width="${weight}"/>`,
    );
    lines.push(
      `<text font-size="${fmt(fontSize)}" x="${fmt(geometry.point[0])}" y="${fmt(geometry.point[1])}">${escapeHtml(symbolLetter(geometry.symbol))}</text>`,
    );
  }
  if (element.label !== undefined) {
    lines.push(
      `<text font-size="${fmt(fontSize)}" x="${fmt(element.label.anchor[0])}" y="${fmt(element.label.anchor[1])}">${escapeHtml(element.label.text)}</text>`,
    );
  }
  return lines;
}

function symbolLetter(symbol: "door" | "window" | "opening"): string {
  return symbol === "door" ? "D" : symbol === "window" ? "W" : "O";
}

/* ------------------------------------------------------------------ */
/* Dimensions                                                          */
/* ------------------------------------------------------------------ */

function dimensionSvg(dimension: Dimension2D, fontSize: number): string[] {
  const midX = (dimension.from[0] + dimension.to[0]) / 2;
  const midY = (dimension.from[1] + dimension.to[1]) / 2;
  // σ discipline: unknown σ renders with NO ± — never a fabricated ±0.
  const text =
    dimension.uncertainty === null
      ? `${fmt(dimension.value)} m`
      : `${fmt(dimension.value)} m ±${fmt(dimension.uncertainty)} m`;
  return [
    `<line data-dimension-id="${escapeHtml(dimension.dimensionId)}" stroke="${DIMENSION_STROKE}" stroke-width="1" x1="${fmt(dimension.from[0])}" x2="${fmt(dimension.to[0])}" y1="${fmt(dimension.from[1])}" y2="${fmt(dimension.to[1])}"/>`,
    `<text font-size="${fmt(fontSize)}" x="${fmt(midX)}" y="${fmt(midY - fontSize)}">${escapeHtml(text)}</text>`,
  ];
}
