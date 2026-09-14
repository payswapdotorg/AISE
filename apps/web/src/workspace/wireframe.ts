/**
 * AISE-021 — deterministic 3D ENGINEERING WIREFRAME (the 3D pane).
 *
 * ⚠ SCOPE DISCIPLINE: this is a WIREFRAME projection of plane boundary
 * polygons — an engineering BROWSING aid, NOT a 3D rendering engine. Full 3D
 * rendering (meshes, shading, occlusion, materials, interaction) is OUT OF
 * SCOPE for AISE-021 and deliberately not attempted here. What this module
 * does is exactly one thing: a small, pure, documented orthographic
 * AXONOMETRIC projection of the graph's plane boundary polygons onto SVG
 * polylines, so the 3D pane shows the same stable node ids as the 2D pane
 * (R5 cross-view identity).
 *
 * PROJECTION (documented, hand-verifiable). For a world point p = (x, y, z)
 * in metres and view parameters (azimuth az, elevation el), both in radians:
 *
 *   screenX = x·sin(az) − y·cos(az)
 *   screenY = x·cos(az)·sin(el) + y·sin(az)·sin(el) − z·cos(el)
 *
 * This is the standard orthographic axonometric mapping (camera at azimuth
 * az around the vertical axis, elevation el above the horizontal; screen Y
 * grows DOWNWARD as SVG requires, so +z (up) and "receding" depth both move
 * a point up the screen). Screen coordinates are QUANTIZED to 1e-6 (one
 * micrometre — the same grid as the SVG number formatting): sin/cos of
 * common angles are not exact in binary floating point (cos(π/2) ≈ 6.1e-17),
 * and quantization kills that dust so model coordinates are hand-verifiable
 * and byte-stable. Worked examples used by the tests (after quantization):
 *
 *   az = π/2, el = 0  →  (x, y, z) ↦ (x, −z)      — a north elevation
 *   az = 0,   el = 0  →  (x, y, z) ↦ (−y, −z)     — an east elevation
 *   az = π/4, el = 0  →  (x, y, z) ↦ ((x−y)·√2/2, −z)
 *
 * HONESTY RULES (mirroring AISE-020): a candidate node without usable 3D
 * geometry is OMITTED with a stable reason code — geometry is never guessed,
 * interpolated or completed. Candidates are `element`/`opening` nodes (the
 * geometric kinds); container kinds (building/storey/space/…) are structural
 * graph content, not drawing content, and are skipped without an omission
 * entry. Nodes are processed in code-unit id order regardless of the
 * caller's array order → byte-identical output for identical input.
 *
 * Determinism: no clock, no randomness, fixed attribute order, `fmt`
 * canonical numbers. Same snapshot + same view → byte-identical SVG.
 */

import { boundsOfPoints, escapeHtml, fmt, paddedViewBox, pointsAttr } from "./format";
import type {
  GeometryRecord,
  GraphSnapshot,
  Point2D,
  Vec3,
  ViewParams,
  WorkspaceNode,
} from "./model";

/** Version stamped on every wireframe (determinism pin). */
export const WIREFRAME_GENERATOR_VERSION = "aise-wireframe/1.0";

/** Default axonometric view: 45° azimuth, 30° elevation. */
export const DEFAULT_VIEW: ViewParams = {
  azimuthRad: Math.PI / 4,
  elevationRad: Math.PI / 6,
};

/** Wireframe stroke width (screen units). */
export const WIREFRAME_STROKE_WIDTH = 1.5;

/** Stroke of an unselected wireframe element. */
export const WIREFRAME_STROKE = "#000000";

/** Stroke of the SELECTED wireframe element (highlight, presentation only). */
export const WIREFRAME_SELECTED_STROKE = "#c2410c";

/** Stable wireframe omission reason codes (vocabulary mirrors AISE-020). */
export const WIREFRAME_OMISSION_REASONS = [
  "geometry-ref-absent",
  "geometry-kind-not-projectable",
  "geometry-unresolved",
  "boundary-absent",
  "degenerate-projection",
] as const;
export type WireframeOmissionReason = (typeof WIREFRAME_OMISSION_REASONS)[number];

/** A node that was a candidate but produced no wireframe geometry. */
export interface WireframeOmission {
  readonly nodeId: string;
  readonly reason: WireframeOmissionReason;
}

/** One wireframe element: the projected boundary polygon of ONE node. */
export interface WireframeElement {
  /** STABLE node id — identical to the 2D element id and evidence links. */
  readonly nodeId: string;
  readonly geometryId: string;
  /** Projected screen points, verbatim polygon order, CLOSED explicitly. */
  readonly points: readonly Point2D[];
  readonly closed: boolean;
}

/** The deterministic wireframe projection of a graph snapshot. */
export interface WireframeModel {
  readonly view: ViewParams;
  readonly elements: readonly WireframeElement[];
  readonly omissions: readonly WireframeOmission[];
}

/* ------------------------------------------------------------------ */
/* Projection                                                          */
/* ------------------------------------------------------------------ */

/**
 * Project ONE world point with the documented axonometric formulas,
 * quantized to the 1 µm grid (float-dust-free, hand-verifiable).
 * Pure and total (finite input → finite output).
 */
export function projectPoint(point: Vec3, view: ViewParams): Point2D {
  const [x, y, z] = point;
  const sinAz = Math.sin(view.azimuthRad);
  const cosAz = Math.cos(view.azimuthRad);
  const sinEl = Math.sin(view.elevationRad);
  const cosEl = Math.cos(view.elevationRad);
  const screenX = quantize(x * sinAz - y * cosAz);
  const screenY = quantize(x * cosAz * sinEl + y * sinAz * sinEl - z * cosEl);
  return [screenX, screenY];
}

/** 1 µm quantization with −0 canonicalization (see module header). */
function quantize(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
}

/** Code-unit ordering (locale-independent, matches canonical JSON sorting). */
function byNodeId(a: WorkspaceNode, b: WorkspaceNode): number {
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
}

/** Geometric element kinds are wireframe candidates; containers are not. */
function isCandidate(node: WorkspaceNode): boolean {
  return node.kind === "element" || node.kind === "opening";
}

/**
 * Project every usable boundary polygon of the snapshot into wireframe
 * elements (node-id sorted) + honest omissions for the rest. Pure: the
 * input is never mutated.
 */
export function project3dWireframe(snapshot: GraphSnapshot, view: ViewParams): WireframeModel {
  const geometryById = new Map<string, GeometryRecord>();
  for (const record of snapshot.geometries ?? []) {
    geometryById.set(record.geometryId, record);
  }

  const elements: WireframeElement[] = [];
  const omissions: WireframeOmission[] = [];
  for (const node of [...snapshot.nodes].sort(byNodeId)) {
    if (!isCandidate(node)) {
      continue;
    }
    const ref = node.geometry;
    if (ref === undefined) {
      omissions.push({ nodeId: node.nodeId, reason: "geometry-ref-absent" });
      continue;
    }
    if (ref.kind === "mesh-ref" || ref.kind === "point-cloud-ref") {
      omissions.push({ nodeId: node.nodeId, reason: "geometry-kind-not-projectable" });
      continue;
    }
    const record = geometryById.get(ref.ref);
    if (record === undefined) {
      omissions.push({ nodeId: node.nodeId, reason: "geometry-unresolved" });
      continue;
    }
    const world = boundaryOf(record);
    if (world === undefined) {
      omissions.push({ nodeId: node.nodeId, reason: "boundary-absent" });
      continue;
    }
    if (world.length < 2) {
      omissions.push({ nodeId: node.nodeId, reason: "degenerate-projection" });
      continue;
    }
    elements.push({
      nodeId: node.nodeId,
      geometryId: record.geometryId,
      points: world.map((vertex) => projectPoint(vertex, view)),
      closed: true,
    });
  }
  return { view, elements, omissions };
}

/** The boundary polygon of a geometry record, when the record carries one. */
function boundaryOf(record: GeometryRecord): readonly Vec3[] | undefined {
  if (record.kind === "plane") {
    return record.boundaryPolygon;
  }
  return record.polygon;
}

/* ------------------------------------------------------------------ */
/* SVG rendering                                                       */
/* ------------------------------------------------------------------ */

/**
 * Deterministic SVG document of the wireframe: one `<polyline>` per element
 * (closed polygons repeat their first point — explicit closure), carrying
 * the element's `data-node-id`. When `selectedNodeId` matches an element,
 * that element gets `data-selected="true"` and the highlight stroke — a
 * PRESENTATION change only; the geometry and ids are untouched.
 */
export function renderWireframeSvg(model: WireframeModel, selectedNodeId?: string): string {
  const allPoints: Point2D[] = [];
  for (const element of model.elements) {
    allPoints.push(...element.points);
  }
  const box = paddedViewBox(boundsOfPoints(allPoints));
  const lines: string[] = [
    `<svg height="${box.height}" viewBox="${box.viewBox}" width="${box.width}" xmlns="http://www.w3.org/2000/svg">`,
  ];
  for (const element of model.elements) {
    const selected = selectedNodeId !== undefined && selectedNodeId === element.nodeId;
    const stroke = selected ? WIREFRAME_SELECTED_STROKE : WIREFRAME_STROKE;
    const points = element.closed ? [...element.points, element.points[0] as Point2D] : element.points;
    lines.push(
      `<polyline data-node-id="${escapeHtml(element.nodeId)}"${selected ? ` data-selected="true"` : ""} fill="none" points="${pointsAttr(points)}" stroke="${stroke}" stroke-width="${fmt(WIREFRAME_STROKE_WIDTH)}"/>`,
    );
  }
  lines.push("</svg>");
  return `${lines.join("\n")}\n`;
}
