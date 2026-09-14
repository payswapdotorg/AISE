/**
 * AISE-020 — 2D projections public surface.
 *
 * Deterministic vector floor plans / elevations / sections projected from
 * the canonical Reality Graph version snapshots (never from "latest"
 * implicitly — `sourceVersionId` is pinned on every drawing), plus the R5
 * bidirectional lookup pair (point → stable ids; stable id → drawings) and
 * deterministic SVG/canonical-JSON serialization for AISE-021's workspace.
 *
 * Read the module headers before use:
 *
 *  - model.ts      — the 2D vector model, honesty rules, typed errors,
 *                    canonical serialization (null σ = absent key);
 *  - project.ts    — ProjectionInput (GraphVersion-compatible structural
 *                    slice) + explicit geometry table, shared helpers;
 *  - floorplan.ts  — storey plan + wall-pair dimensions with propagated σ;
 *  - elevation.ts  — direction views with documented visibility behavior;
 *  - section.ts    — cut-plane sections (cut marks vs faint beyond);
 *  - lookup.ts     — resolveElement / locateNode (R5 acceptance);
 *  - svg.ts        — byte-deterministic minimal SVG.
 *
 * This package is a LIBRARY: no router/server wiring, no store access, no
 * writes back to the graph (2D is a projection, not an authority).
 */

export {
  // generator identity + presentation constants
  PROJECTION_GENERATOR_VERSION,
  DEFAULT_DRAWING_SCALE,
  STROKE_KINDS,
  STROKE_WEIGHTS,
  SECTION_CUT_WEIGHT,
  SECTION_BEYOND_WEIGHT,
  ELEVATION_BEYOND_WEIGHT,
  // classification thresholds (named, documented)
  WALL_VERTICALITY_MAX,
  ELEVATION_VISIBLE_MIN_COMPONENT,
  ELEVATION_HOST_TOLERANCE_M,
  OPENING_PARALLEL_DOT_MIN,
  POLYGON_AREA_EPSILON,
  // vocabulary + typed error
  OMISSION_REASONS,
  PROJECTION_ERROR_CODES,
  ProjectionError,
  // serialization
  serializeDrawing,
} from "./model";

export type {
  Point2D,
  Polyline2D,
  Polygon2D,
  PointSymbol2D,
  Geometry2D,
  StrokeKind,
  Style2D,
  Label2D,
  Uncertainty2D,
  DrawnElement,
  Dimension2D,
  DrawingKind,
  CoordinateFrame2D,
  OmittedNode,
  OmissionReason,
  Drawing2D,
  Bounds2D,
  ProjectionErrorCode,
} from "./model";

export {
  ELEVATION_DIRECTIONS,
  type ElevationDirection,
  type SectionPlaneSpec,
  type ProjectionInput,
  type PlaneGeometryRecord,
  type PolygonGeometryRecord,
  type GeometryRecord,
} from "./project";

export { generateFloorPlan, type FloorPlanOptions } from "./floorplan";
export { generateElevation, type ElevationOptions } from "./elevation";
export { generateSection, type SectionOptions } from "./section";
export { resolveElement, locateNode, type ResolveResult, type LocatedEntry } from "./lookup";
export { toSvg } from "./svg";
