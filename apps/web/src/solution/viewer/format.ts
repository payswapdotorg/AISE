/**
 * PROD-024 — deterministic text/formatting primitives of the solution
 * workspace viewer (internal).
 *
 * Mirrors the AISE-021 workspace `format.ts` discipline byte-for-byte so
 * the same scene always renders BYTE-IDENTICAL SVG: canonical numbers
 * (−0 → 0, 1e-6 rounding, shortest form), XML escaping, padded view boxes.
 * No clock, no randomness, no locale-dependent formatting. Kept LOCAL so
 * the solution module stays self-contained (§4.1 of the work order).
 */

/** A 2D screen point (SVG coordinates; y grows downward). */
export type Point2D = readonly [number, number];

/** Axis-aligned bounds. */
export interface Bounds2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Deterministic number text: canonical 0, 1e-6 rounding, shortest form. */
export function fmt(value: number): string {
  const canonical = value === 0 ? 0 : value;
  const rounded = Math.round(canonical * 1e6) / 1e6;
  return String(rounded);
}

/** XML text/attribute escaping (the five significant characters). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Fraction of the drawing extent added as padding around the content. */
export const VIEW_PAD_FRACTION = 0.05;

/** Minimum extent (drawing units) when the projected content is empty. */
export const VIEW_MIN_EXTENT = 1;

/** Axis-aligned bounds over a point set (empty → unit box at origin). */
export function boundsOfPoints(points: readonly Point2D[]): Bounds2D {
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
    return { minX: 0, minY: 0, maxX: VIEW_MIN_EXTENT, maxY: VIEW_MIN_EXTENT };
  }
  return { minX, minY, maxX, maxY };
}

/** View box + width/height for bounds: 5% padding, 1-unit minimum extent. */
export function paddedViewBox(bounds: Bounds2D): {
  readonly viewBox: string;
  readonly width: string;
  readonly height: string;
} {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const extent = Math.max(width, height);
  const pad = extent > 0 ? extent * VIEW_PAD_FRACTION : VIEW_MIN_EXTENT;
  return {
    viewBox: `${fmt(bounds.minX - pad)} ${fmt(bounds.minY - pad)} ${fmt(width + 2 * pad)} ${fmt(height + 2 * pad)}`,
    width: fmt(width + 2 * pad),
    height: fmt(height + 2 * pad),
  };
}

/** `points` attribute text: "x,y x,y …" in the given (verbatim) order. */
export function pointsAttr(points: readonly Point2D[]): string {
  return points.map((point) => `${fmt(point[0])},${fmt(point[1])}`).join(" ");
}
