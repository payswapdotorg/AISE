/**
 * AISE-020 — deterministic 2D vector drawing model.
 *
 * AUTHORITY (spec/architecture-lock.md "Reconstruction", last bullet): 2D
 * representations are PROJECTIONS of the canonical Reality Graph model, never
 * a competing authority. A `Drawing2D` is derived data: it carries the
 * `sourceVersionId` of the graph snapshot it was generated from, its element
 * ids ARE the source graph node ids (the R5 bidirectional-lookup anchor), and
 * it records what could NOT be drawn (`omittedNodes` + stable reason codes)
 * instead of guessing geometry. Nothing drawn here is ever written back to
 * the graph.
 *
 * HONESTY RULES (module-wide):
 *
 *  - Every drawn element is derived ONLY from geometry explicitly present in
 *    the caller-supplied geometry records (plane + boundary polygon). A node
 *    without usable 2D geometry is OMITTED with a stable reason code — never
 *    approximated, interpolated or completed.
 *  - A `Dimension2D` carries the measured value AND its physical 1σ (or null
 *    = unknown). null is NEVER replaced by 0; `serializeDrawing` serializes a
 *    null uncertainty as an ABSENT key (a JSON consumer cannot mistake it
 *    for a measured-exact 0). Confidence does not exist in this vocabulary.
 *  - Determinism: same input snapshot + same options → byte-identical
 *    drawing (canonical JSON, sorted arrays — see the generators).
 *
 * COORDINATE FRAME: drawing coordinates are world metres mapped by
 * `coordinateFrame`: drawing = scale · rotate(−rotationRad) · (world − origin).
 * `scale` is drawing units per metre (1 = native metres, 100 = 1:100 at mm
 * paper convention). Rotation defaults to 0 (axis-aligned graph frames).
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";

/* ------------------------------------------------------------------ */
/* Generator identity                                                  */
/* ------------------------------------------------------------------ */

/** Version stamped on every drawing (determinism pin, like EXTRACTOR_VERSION). */
export const PROJECTION_GENERATOR_VERSION = "aise-projections/1.0";

/** Default drawing scale: 1 drawing unit = 1 metre. */
export const DEFAULT_DRAWING_SCALE = 1;

/* ------------------------------------------------------------------ */
/* Stroke vocabulary (presentation, carried explicitly)                 */
/* ------------------------------------------------------------------ */

export const STROKE_KINDS = ["wall", "boundary", "opening", "dimension", "annotation"] as const;
export type StrokeKind = (typeof STROKE_KINDS)[number];

/**
 * Default stroke weights per stroke kind (drawing units). Section cut marks
 * (SECTION_CUT_WEIGHT) and beyond/faint elements (SECTION_BEYOND_WEIGHT,
 * ELEVATION_BEYOND_WEIGHT) override these per drawing — weights are explicit
 * data on every element, never implied by the consumer.
 */
export const STROKE_WEIGHTS: Readonly<Record<StrokeKind, number>> = {
  wall: 2,
  boundary: 1,
  opening: 2,
  dimension: 1,
  annotation: 1,
};

/** Section: weight of elements the cut plane passes through ("cut marks"). */
export const SECTION_CUT_WEIGHT = 4;

/** Section: weight of elements beyond the cut plane (drawn faint). */
export const SECTION_BEYOND_WEIGHT = 1;

/** Elevation: weight of openings not hosted by a drawn face (drawn faint). */
export const ELEVATION_BEYOND_WEIGHT = 1;

/* ------------------------------------------------------------------ */
/* Geometry vocabulary                                                 */
/* ------------------------------------------------------------------ */

/** Immutable 2D point (drawing units after the coordinate frame is applied). */
export type Point2D = readonly [number, number];

/** Open path through 2D points, in order. */
export interface Polyline2D {
  readonly kind: "polyline";
  readonly points: readonly Point2D[];
}

/** Closed path: last point connects to the first (no explicit repeat). */
export interface Polygon2D {
  readonly kind: "polygon";
  readonly points: readonly Point2D[];
}

/** A located point with a semantic symbol (openings in floor plans). */
export interface PointSymbol2D {
  readonly kind: "point";
  readonly point: Point2D;
  readonly symbol: "door" | "window" | "opening";
}

export type Geometry2D = Polyline2D | Polygon2D | PointSymbol2D;

export interface Style2D {
  readonly strokeKind: StrokeKind;
  readonly strokeWeight: number;
}

export interface Label2D {
  readonly text: string;
  readonly anchor: Point2D;
}

/**
 * Uncertainty carried by a drawn element: the physical 1σ of its source
 * geometry (null = unknown — never 0) and the ids the σ was propagated from.
 */
export interface Uncertainty2D {
  readonly sigma: number | null;
  readonly propagatedFrom: readonly string[];
}

/**
 * One drawn 2D element. `elementId` is STABLE and EQUALS the source
 * RealityNode node id — it is the R5 bidirectional-lookup anchor shared with
 * the 3D and evidence views. `sourceNodeId` repeats it explicitly so future
 * semantic-id sources stay representable without touching this shape.
 */
export interface DrawnElement {
  readonly elementId: string;
  readonly sourceNodeId: string;
  readonly geometry2d: Geometry2D;
  readonly style: Style2D;
  readonly label?: Label2D;
  readonly uncertainty?: Uncertainty2D;
}

/**
 * A drawn dimension: the measured value (metres — the physical measurement,
 * NOT scaled drawing units) with its propagated 1σ (null = unknown) and the
 * two source node ids the measurement was derived from.
 */
export interface Dimension2D {
  readonly dimensionId: string;
  readonly from: Point2D;
  readonly to: Point2D;
  readonly value: number;
  readonly unit: "m";
  readonly uncertainty: number | null;
  readonly sourceNodeIds: readonly [string, string];
}

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

export const DRAWING_KINDS = ["floor_plan", "elevation", "section"] as const;
export type DrawingKind = (typeof DRAWING_KINDS)[number];

export interface CoordinateFrame2D {
  readonly origin: readonly [number, number];
  /** Drawing units per metre. */
  readonly scale: number;
  /** Rotation of the drawing relative to the world frame (radians). */
  readonly rotationRad: number;
}

/** A node that was in scope but could not be drawn, with a stable reason. */
export interface OmittedNode {
  readonly nodeId: string;
  readonly reason: OmissionReason;
}

/**
 * Closed, stable omission-reason vocabulary (never guessed geometry — the
 * reason names WHY):
 *
 *  - "overhead-not-projected-in-plan"  ceilings are not floor-plan content;
 *  - "incompatible-linear-units"       node declares units.linear ≠ "m"
 *                                       (drawings measure in metres only);
 *  - "geometry-ref-absent"             candidate node has no geometry ref;
 *  - "geometry-kind-not-projectable"   ref kind mesh-ref/point-cloud-ref;
 *  - "geometry-unresolved"             ref id absent from the geometry table;
 *  - "boundary-absent"                 plane known but no boundary polygon
 *                                       (extent unknown — never guessed);
 *  - "wall-not-vertical"               |n̂.z| above WALL_VERTICALITY_MAX;
 *  - "plane-absent"                    view classification needs a plane
 *                                       (polygon-only element in elevation);
 *  - "faces-away-from-view"            elevation: normal points away from
 *                                       the viewer (chosen behavior: omit);
 *  - "edge-on-to-view"                 elevation: face parallel to the view
 *                                       direction (no measurable projection);
 *  - "degenerate-projection"           boundary projects to < 2 distinct
 *                                       points, or the polygon plane is
 *                                       undefined.
 */
export const OMISSION_REASONS = [
  "overhead-not-projected-in-plan",
  "incompatible-linear-units",
  "geometry-ref-absent",
  "geometry-kind-not-projectable",
  "geometry-unresolved",
  "boundary-absent",
  "wall-not-vertical",
  "plane-absent",
  "faces-away-from-view",
  "edge-on-to-view",
  "degenerate-projection",
] as const;
export type OmissionReason = (typeof OMISSION_REASONS)[number];

/** Axis-aligned world frame thresholds (named, strict comparisons). */

/** A wall plane is floor-plan projectable only when |n̂.z| is STRICTLY below. */
export const WALL_VERTICALITY_MAX = 0.1;

/** Elevation: a face is drawn only when n̂·(toward viewer) is STRICTLY above. */
export const ELEVATION_VISIBLE_MIN_COMPONENT = 0.1;

/** Elevation: an opening is "hosted" when within this distance of a drawn face. */
export const ELEVATION_HOST_TOLERANCE_M = 0.15;

/** Elevation: opening polygon plane parallel to the view plane (|n̂·axis| ≥). */
export const OPENING_PARALLEL_DOT_MIN = 1 - 1e-6;

/** Projected polygons with |shoelace area| at/below this are polylines. */
export const POLYGON_AREA_EPSILON = 1e-12;

export interface Drawing2D {
  readonly drawingId: string;
  readonly kind: DrawingKind;
  readonly coordinateFrame: CoordinateFrame2D;
  readonly elements: readonly DrawnElement[];
  readonly dimensions: readonly Dimension2D[];
  readonly omittedNodes: readonly OmittedNode[];
  readonly sourceVersionId: string;
  readonly generatedBy: typeof PROJECTION_GENERATOR_VERSION;
}

/** Axis-aligned bounds of drawn geometry (drawing units). */
export interface Bounds2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/* ------------------------------------------------------------------ */
/* Typed errors                                                        */
/* ------------------------------------------------------------------ */

export const PROJECTION_ERROR_CODES = ["invalid_input", "unknown_storey", "unknown_building"] as const;
export type ProjectionErrorCode = (typeof PROJECTION_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (never a bare string error). */
export class ProjectionError extends Error {
  readonly code: ProjectionErrorCode;
  readonly detail: string;

  constructor(code: ProjectionErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ProjectionError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Canonical serialization                                             */
/* ------------------------------------------------------------------ */

/**
 * Deterministic canonical JSON of a drawing (sorted keys, 2-space indent,
 * trailing newline — the shared wire canonicalization).
 *
 * NULL-UNCERTAINTY DISCIPLINE: `uncertainty: null` (dimension) and
 * `sigma: null` (element) serialize as ABSENT keys — "σ unknown" must never
 * be mistakable for a measured-exact 0 by a JSON consumer. Known σ values
 * serialize verbatim.
 */
export function serializeDrawing(drawing: Drawing2D): string {
  return canonicalJsonStringify(stripNullUncertainty(drawing));
}

/** Deep copy dropping null-valued `uncertainty`/`sigma` keys (see header). */
function stripNullUncertainty(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNullUncertainty);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const inner = (value as Record<string, unknown>)[key];
      if (inner === null && (key === "uncertainty" || key === "sigma")) {
        continue;
      }
      out[key] = stripNullUncertainty(inner);
    }
    return out;
  }
  return value;
}
