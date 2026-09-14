/**
 * AISE-020 — bidirectional object lookup (the R5 acceptance surface).
 *
 * R5: "selecting an object/region in any view can resolve the same stable
 * identifier." Both directions below resolve STABLE ids — the same ids the
 * 3D and evidence views hold for the same model version:
 *
 *  - `resolveElement`: a picked 2D point (any view) → the nearest-first
 *    element ids covering it. Hit-testing covers drawn elements (polygons by
 *    containment, polylines and point symbols by tolerance distance) AND
 *    dimension lines (a hit resolves BOTH source node ids — a dimension is
 *    itself a selection of its two measured walls).
 *  - `locateNode`: a stable node id → where it appears across a set of
 *    drawings (element and dimension entries with axis-aligned bounds).
 *
 * A node with no 2D-projectable geometry (3D/evidence-only) locates to an
 * EMPTY list — absence of a projection is data, not an error.
 *
 * Determinism: distances are computed in a fixed order; equal distances tie
 * on id ordering (code-unit), so the same drawing + point + tolerance always
 * yields the same id sequence.
 */

import {
  ProjectionError,
  type Bounds2D,
  type Drawing2D,
  type DrawingKind,
  type Geometry2D,
  type Point2D,
} from "./model";

/** Result of a point pick: stable element ids, nearest-first. */
export interface ResolveResult {
  readonly elementIds: readonly string[];
}

/** One located appearance of a node in a drawing. */
export interface LocatedEntry {
  readonly drawingKind: DrawingKind;
  /** The drawn element's id, or the dimension id for dimension entries. */
  readonly elementId: string;
  readonly bounds2d: Bounds2D;
}

/**
 * Point → element ids (nearest-first). `tolerance` is the pick radius in
 * drawing units (must be finite and ≥ 0). Containment inside a polygon hits
 * at distance 0; boundary/segment/symbol proximity hits within tolerance.
 */
export function resolveElement(
  drawing: Drawing2D,
  point: Point2D,
  tolerance: number,
): ResolveResult {
  if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
    throw new ProjectionError("invalid_input", "point must be a finite [x, y] pair");
  }
  if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance < 0) {
    throw new ProjectionError("invalid_input", `tolerance must be a finite non-negative number, got ${String(tolerance)}`);
  }

  interface Hit {
    readonly id: string;
    readonly distance: number;
  }
  const hits: Hit[] = [];

  for (const element of drawing.elements) {
    const distance = geometryDistance(element.geometry2d, point);
    if (distance <= tolerance) {
      hits.push({ id: element.elementId, distance });
    }
  }
  for (const dimension of drawing.dimensions) {
    const distance = distanceToSegment(point, dimension.from, dimension.to);
    if (distance <= tolerance) {
      for (const id of dimension.sourceNodeIds) {
        hits.push({ id, distance });
      }
    }
  }

  hits.sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const seen = new Set<string>();
  const elementIds: string[] = [];
  for (const hit of hits) {
    if (!seen.has(hit.id)) {
      seen.add(hit.id);
      elementIds.push(hit.id);
    }
  }
  return { elementIds };
}

/**
 * Node id → appearances across drawings (input array order; within a
 * drawing, elements then dimensions, each in drawing order). Returns an
 * empty list when the node has no 2D projection anywhere — never throws.
 */
export function locateNode(
  drawings: readonly Drawing2D[],
  nodeId: string,
): LocatedEntry[] {
  if (typeof nodeId !== "string" || nodeId.length === 0) {
    throw new ProjectionError("invalid_input", "nodeId must be a non-empty string");
  }
  const entries: LocatedEntry[] = [];
  for (const drawing of drawings) {
    for (const element of drawing.elements) {
      if (element.sourceNodeId === nodeId) {
        entries.push({
          drawingKind: drawing.kind,
          elementId: element.elementId,
          bounds2d: boundsOfGeometry(element.geometry2d),
        });
      }
    }
    for (const dimension of drawing.dimensions) {
      if (dimension.sourceNodeIds.includes(nodeId)) {
        entries.push({
          drawingKind: drawing.kind,
          elementId: dimension.dimensionId,
          bounds2d: boundsOfPoints([dimension.from, dimension.to]),
        });
      }
    }
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/* Hit-testing primitives                                              */
/* ------------------------------------------------------------------ */

/** Distance from a point to drawn geometry (0 inside a closed polygon). */
function geometryDistance(geometry: Geometry2D, point: Point2D): number {
  if (geometry.kind === "point") {
    return distanceToPoint(point, geometry.point);
  }
  if (geometry.kind === "polygon") {
    return pointInPolygon(point, geometry.points) ? 0 : boundaryDistance(point, geometry.points, true);
  }
  return boundaryDistance(point, geometry.points, false);
}

/** Euclidean point distance (fixed operation order). */
function distanceToPoint(a: Point2D, b: Point2D): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/** Even-odd ray-cast containment (deterministic, orientation-independent). */
function pointInPolygon(point: Point2D, polygon: readonly Point2D[]): boolean {
  let inside = false;
  const count = polygon.length;
  for (let i = 0; i < count; i += 1) {
    const current = polygon[i];
    const previous = polygon[(i - 1 + count) % count];
    if (current === undefined || previous === undefined) {
      continue;
    }
    const crosses = current[1] > point[1] !== previous[1] > point[1];
    if (!crosses) {
      continue;
    }
    const intersectionX = ((previous[0] - current[0]) * (point[1] - current[1])) / (previous[1] - current[1]) + current[0];
    if (point[0] < intersectionX) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Minimum distance to the path (polyline) or closed boundary (polygon,
 * including the implicit wrap edge last→first).
 */
function boundaryDistance(point: Point2D, points: readonly Point2D[], closed: boolean): number {
  const count = points.length;
  if (count === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (count === 1) {
    return distanceToPoint(point, points[0] as Point2D);
  }
  let minimum = Number.POSITIVE_INFINITY;
  const segments = closed ? count : count - 1;
  for (let i = 0; i < segments; i += 1) {
    const a = points[i] as Point2D;
    const b = points[(i + 1) % count] as Point2D;
    const distance = distanceToSegment(point, a, b);
    if (distance < minimum) {
      minimum = distance;
    }
  }
  return minimum;
}

/** Distance from a point to the segment a→b (clamped projection). */
function distanceToSegment(point: Point2D, a: Point2D, b: Point2D): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = point[0] - a[0];
  const apy = point[1] - a[1];
  const lengthSquared = abx * abx + aby * aby;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, (apx * abx + apy * aby) / lengthSquared));
  const cx = a[0] + t * abx - point[0];
  const cy = a[1] + t * aby - point[1];
  return Math.sqrt(cx * cx + cy * cy);
}

/* ------------------------------------------------------------------ */
/* Bounds                                                              */
/* ------------------------------------------------------------------ */

/** Axis-aligned bounds of drawn geometry. */
function boundsOfGeometry(geometry: Geometry2D): Bounds2D {
  return boundsOfPoints(geometry.kind === "point" ? [geometry.point] : geometry.points);
}

/** Axis-aligned bounds over a point set (single point → zero extent). */
function boundsOfPoints(points: readonly Point2D[]): Bounds2D {
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
  return { minX, minY, maxX, maxY };
}
