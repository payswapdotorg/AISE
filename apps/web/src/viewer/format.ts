/**
 * AISE-027 — deterministic text/formatting primitives (internal).
 *
 * Mirrors the AISE-021 workspace/format.ts and AISE-024 boqlens/format.ts
 * discipline (local documented copies — the sibling apps/web modules are
 * deliberately self-contained) so the same input always produces
 * BYTE-IDENTICAL output:
 *
 *  - `fmt` canonicalizes −0 to 0, rounds to 1e-6 to kill float dust and
 *    emits the shortest JS number text (mirrors AISE-020's svg.ts `fmt`);
 *  - `escapeHtml` escapes the five XML-significant characters for text and
 *    double-quoted attributes;
 *  - `boundsOfPoints` / `paddedViewBox` derive axis-aligned bounds and the
 *    padded viewBox the same way AISE-020's svg.ts does (5% padding, 1 unit
 *    minimum extent);
 *  - `stableStringify` renders a JSON text with RECURSIVELY SORTED keys —
 *    a local, order-insensitive canonicalization used ONLY for read-back
 *    agreement checks in read.ts. It is NOT an id derivation: state ids
 *    stay AISE-026's sha256 authority and are never re-derived here.
 *
 * No clock, no randomness, no locale-dependent formatting anywhere.
 */

import type { Point2D } from "./model";

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
export function boundsOfPoints(points: readonly Point2D[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
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

/**
 * View box + width/height for an axis-aligned bounds: 5% padding (minimum
 * 1 unit extent), the same convention as AISE-020's svg.ts.
 */
export function paddedViewBox(bounds: {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}): {
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

/**
 * Order-insensitive canonical JSON text (recursively sorted object keys,
 * arrays verbatim). Used ONLY to compare two server-supplied records for
 * READ-BACK AGREEMENT (read.ts); never to derive identities.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value) ?? "null";
}
