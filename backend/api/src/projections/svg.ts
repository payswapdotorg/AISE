/**
 * AISE-020 — deterministic minimal SVG serialization.
 *
 * `toSvg(drawing)` renders a Drawing2D as a self-contained SVG document:
 * shapes for every element (polygon / polyline / opening symbol circle +
 * letter), dimension lines with their measured value (± σ ONLY when the σ is
 * known — an unknown σ renders without any ±, never as ±0), and text labels.
 * Stable node ids appear as `data-node-id` attributes (one per element) and
 * dimension ids as `data-dimension-id` — the hooks 021's workspace uses for
 * cross-view selection.
 *
 * DETERMINISM (byte-identical for identical drawings): fixed element order
 * (the drawing's already-sorted arrays), fixed alphabetical attribute order
 * within every tag, fixed coordinate formatting (`fmt`: −0 canonicalized,
 * rounded to 1e-6 to kill float dust, shortest JS number text), no random or
 * generated ids anywhere.
 */

import {
  ProjectionError,
  type Dimension2D,
  type Drawing2D,
  type DrawnElement,
  type Point2D,
} from "./model";

/** Opening symbol radius in metres (× drawing scale). */
const SVG_SYMBOL_RADIUS_M = 0.2;

/** Minimum symbol radius in drawing units (visible at scale 1). */
const SVG_SYMBOL_MIN_RADIUS = 0.5;

/** Text height as a fraction of the drawing extent (min 1 drawing unit). */
const SVG_TEXT_HEIGHT_FRACTION = 0.05;

/** Deterministic number text: canonical 0, 1e-6 rounding, shortest form. */
function fmt(value: number): string {
  const canonical = value === 0 ? 0 : value;
  const rounded = Math.round(canonical * 1e6) / 1e6;
  return String(rounded);
}

/** XML text escaping (labels and dimension values are the only text). */
function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Deterministic SVG document for a drawing. */
export function toSvg(drawing: Drawing2D): string {
  if (drawing === null || typeof drawing !== "object") {
    throw new ProjectionError("invalid_input", "toSvg requires a Drawing2D");
  }
  const points: Point2D[] = [];
  for (const element of drawing.elements) {
    collectElementPoints(element, points);
  }
  for (const dimension of drawing.dimensions) {
    points.push(dimension.from, dimension.to);
  }

  const bounds = boundsOf(points);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const extent = Math.max(width, height);
  const pad = extent > 0 ? extent * 0.05 : 1;
  const fontSize = extent > 0 ? Math.max(extent * SVG_TEXT_HEIGHT_FRACTION, 1) : 1;
  const viewBox = `${fmt(bounds.minX - pad)} ${fmt(bounds.minY - pad)} ${fmt(width + 2 * pad)} ${fmt(height + 2 * pad)}`;
  const [svgWidth, svgHeight] = [fmt(width + 2 * pad), fmt(height + 2 * pad)];

  const lines: string[] = [
    `<svg height="${svgHeight}" viewBox="${viewBox}" width="${svgWidth}" xmlns="http://www.w3.org/2000/svg">`,
  ];
  for (const element of drawing.elements) {
    lines.push(...elementSvg(element, drawing.coordinateFrame.scale, fontSize));
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

function elementSvg(element: DrawnElement, scale: number, fontSize: number): string[] {
  const weight = fmt(element.style.strokeWeight);
  const geometry = element.geometry2d;
  const lines: string[] = [];
  if (geometry.kind === "polygon") {
    lines.push(
      `<polygon data-node-id="${escapeXml(element.elementId)}" fill="none" points="${pointsAttr(geometry.points)}" stroke="#000000" stroke-width="${weight}"/>`,
    );
  } else if (geometry.kind === "polyline") {
    lines.push(
      `<polyline data-node-id="${escapeXml(element.elementId)}" fill="none" points="${pointsAttr(geometry.points)}" stroke="#000000" stroke-width="${weight}"/>`,
    );
  } else {
    const radius = fmt(Math.max(SVG_SYMBOL_MIN_RADIUS, SVG_SYMBOL_RADIUS_M * scale));
    lines.push(
      `<circle cx="${fmt(geometry.point[0])}" cy="${fmt(geometry.point[1])}" data-node-id="${escapeXml(element.elementId)}" fill="none" r="${radius}" stroke="#000000" stroke-width="${weight}"/>`,
    );
    lines.push(
      `<text font-size="${fmt(fontSize)}" x="${fmt(geometry.point[0])}" y="${fmt(geometry.point[1])}">${escapeXml(symbolLetter(geometry.symbol))}</text>`,
    );
  }
  if (element.label !== undefined) {
    lines.push(
      `<text font-size="${fmt(fontSize)}" x="${fmt(element.label.anchor[0])}" y="${fmt(element.label.anchor[1])}">${escapeXml(element.label.text)}</text>`,
    );
  }
  return lines;
}

function symbolLetter(symbol: "door" | "window" | "opening"): string {
  return symbol === "door" ? "D" : symbol === "window" ? "W" : "O";
}

function pointsAttr(points: readonly Point2D[]): string {
  return points.map((point) => `${fmt(point[0])},${fmt(point[1])}`).join(" ");
}

/* ------------------------------------------------------------------ */
/* Dimensions                                                          */
/* ------------------------------------------------------------------ */

function dimensionSvg(dimension: Dimension2D, fontSize: number): string[] {
  const midX = (dimension.from[0] + dimension.to[0]) / 2;
  const midY = (dimension.from[1] + dimension.to[1]) / 2;
  const text =
    dimension.uncertainty === null
      ? `${fmt(dimension.value)} m`
      : `${fmt(dimension.value)} m ±${fmt(dimension.uncertainty)} m`;
  return [
    `<line data-dimension-id="${escapeXml(dimension.dimensionId)}" stroke="#333333" stroke-width="1" x1="${fmt(dimension.from[0])}" x2="${fmt(dimension.to[0])}" y1="${fmt(dimension.from[1])}" y2="${fmt(dimension.to[1])}"/>`,
    `<text font-size="${fmt(fontSize)}" x="${fmt(midX)}" y="${fmt(midY - fontSize)}">${escapeXml(text)}</text>`,
  ];
}

/* ------------------------------------------------------------------ */
/* Bounds                                                              */
/* ------------------------------------------------------------------ */

function boundsOf(points: readonly Point2D[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point[0] < minX) minX = point[0];
    if (point[1] < minY) minY = point[1];
    if (point[0] > maxX) maxX = point[0];
    if (point[1] > maxY) maxY = point[1];
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  return { minX, minY, maxX, maxY };
}
