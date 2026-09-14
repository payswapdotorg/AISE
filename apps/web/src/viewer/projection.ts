/**
 * AISE-027 — deterministic state-pane projection engine (3D + 2D panes).
 *
 * ⚠ SCOPE DISCIPLINE (mirrors AISE-021 wireframe.ts): this is a WIREFRAME /
 * PLAN projection of the proposed layer's plane boundary polygons — an
 * engineering BROWSING aid, NOT a 3D rendering engine and NOT a geometry
 * authority. Geometry is REFERENCED through the server-assembled geometry
 * records; the viewer never derives, fits, interpolates or completes
 * geometry. What this module does is exactly two things:
 *
 *  - the 3D pane: the AISE-021 documented orthographic AXONOMETRIC
 *    projection (copied VERBATIM — same formulas, same 1 µm quantization,
 *    same worked examples, so the two surfaces stay hand-verifiable
 *    together);
 *  - the 2D pane: the plan (XY) projection — world (x, y, z) ↦ (x, y),
 *    z dropped (a floor-plan-style footprint projection), same
 *    quantization.
 *
 * AXONOMETRIC PROJECTION (AISE-021, documented, hand-verifiable). For a
 * world point p = (x, y, z) in metres and view parameters (azimuth az,
 * elevation el), both in radians:
 *
 *   screenX = x·sin(az) − y·cos(az)
 *   screenY = x·cos(az)·sin(el) + y·sin(az)·sin(el) − z·cos(el)
 *
 * Screen Y grows DOWNWARD as SVG requires. Screen coordinates are
 * QUANTIZED to 1e-6 (one micrometre — the same grid as the SVG number
 * formatting): sin/cos of common angles are not exact in binary floating
 * point (cos(π/2) ≈ 6.1e-17), and quantization kills that dust so model
 * coordinates are hand-verifiable and byte-stable. Worked examples used
 * by the tests (after quantization):
 *
 *   az = π/2, el = 0  →  (x, y, z) ↦ (x, −z)      — a north elevation
 *   az = 0,   el = 0  →  (x, y, z) ↦ (−y, −z)     — an east elevation
 *   az = π/4, el = 0  →  (x, y, z) ↦ ((x−y)·√2/2, −z)
 *
 * HONESTY RULES (mirroring AISE-020/021/026): a candidate node without
 * usable geometry is OMITTED with a stable reason code — geometry is never
 * guessed. Candidates are `element`/`opening` state nodes (the same
 * candidate rule as AISE-021's wireframe, so the intervention viewer's
 * panes and the engineering workspace's panes agree on what is drawing
 * content); container kinds (building/storey/space/…) are structural graph
 * content, not drawing content, and are skipped WITHOUT an omission entry.
 * PROPOSED-REMOVAL nodes are simply absent from the layer's live node set
 * (AISE-026 tombstone semantics) — the BOQ pane renders the removal
 * intent; the geometric panes never draw removed nodes.
 *
 * Nodes are processed in code-unit id order regardless of the caller's
 * array order → byte-identical output for identical input, and
 * shuffle-invariant. Determinism: no clock, no randomness, fixed attribute
 * order, `fmt` canonical numbers.
 */

import type {
  GeometryRecord,
  PaneProjection,
  Point2D,
  ProjectionOmission,
  ProjectedShape,
  Vec3,
  ViewParams,
  ViewerInterventionState,
  ViewerStateNode,
} from "./model";

/** Default axonometric view: 45° azimuth, 30° elevation (AISE-021 default). */
export const DEFAULT_VIEW: ViewParams = {
  azimuthRad: Math.PI / 4,
  elevationRad: Math.PI / 6,
};

/** Candidate kinds for geometric projection (AISE-021 wireframe rule). */
const PROJECTABLE_KINDS: readonly string[] = ["element", "opening"];

/** Geometry-ref kinds that can never be projected by this engine. */
const NON_PROJECTABLE_REF_KINDS: readonly string[] = ["mesh-ref", "point-cloud-ref"];

/** Projection modes: the 3D axonometric pane and the 2D plan pane. */
export type ProjectionMode = "axonometric" | "plan";

/** Options selecting the projection mode (axonometric needs the view). */
export type ProjectionOptions =
  | { readonly mode: "axonometric"; readonly view: ViewParams }
  | { readonly mode: "plan" };

/* ------------------------------------------------------------------ */
/* Point projections                                                   */
/* ------------------------------------------------------------------ */

/** 1 µm quantization with −0 canonicalization (see module header). */
function quantize(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Project ONE world point with the AISE-021 axonometric formulas,
 * quantized to the 1 µm grid (float-dust-free, hand-verifiable). Pure and
 * total (finite input → finite output).
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

/**
 * Project ONE world point onto the plan (XY) pane: (x, y, z) ↦ (x, y),
 * quantized to the 1 µm grid. The height axis is DROPPED by the plan
 * projection (a footprint view) — never silently flattened to a false
 * value. Pure and total.
 */
export function projectPointPlan(point: Vec3): Point2D {
  return [quantize(point[0]), quantize(point[1])];
}

/* ------------------------------------------------------------------ */
/* Geometry resolution (read-only; honest omissions)                   */
/* ------------------------------------------------------------------ */

/** Geometric state-node kinds are projection candidates; containers are not. */
function isCandidate(stateNode: ViewerStateNode): boolean {
  return PROJECTABLE_KINDS.includes(stateNode.node.kind);
}

/** Code-unit ordering (locale-independent, matches canonical JSON sorting). */
function byNodeId(a: ViewerStateNode, b: ViewerStateNode): number {
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
}

/** The boundary polygon of a geometry record, when the record carries one. */
function boundaryOf(record: GeometryRecord): readonly Vec3[] | undefined {
  if (record.kind === "plane") {
    return record.boundaryPolygon;
  }
  return record.polygon;
}

/**
 * Project ONE materialized intervention state into a geometric pane.
 * Pure: neither the state nor the geometry records are ever mutated.
 * Candidates are resolved through the geometry table and honestly omitted
 * otherwise (see module header for the reason-code vocabulary).
 */
export function projectPane(
  state: ViewerInterventionState,
  geometries: readonly GeometryRecord[],
  options: ProjectionOptions,
): PaneProjection {
  const geometryById = new Map<string, GeometryRecord>();
  for (const record of geometries) {
    geometryById.set(record.geometryId, record);
  }
  const worldToScreen = (vertex: Vec3): Point2D =>
    options.mode === "axonometric" ? projectPoint(vertex, options.view) : projectPointPlan(vertex);

  const shapes: ProjectedShape[] = [];
  const omissions: ProjectionOmission[] = [];
  for (const stateNode of [...state.nodes].sort(byNodeId)) {
    if (!isCandidate(stateNode)) {
      continue;
    }
    const ref = stateNode.node.geometry;
    if (ref === undefined) {
      omissions.push({ nodeId: stateNode.nodeId, reason: "geometry-ref-absent" });
      continue;
    }
    if (NON_PROJECTABLE_REF_KINDS.includes(ref.kind)) {
      omissions.push({ nodeId: stateNode.nodeId, reason: "geometry-kind-not-projectable" });
      continue;
    }
    const record = geometryById.get(ref.ref);
    if (record === undefined) {
      omissions.push({ nodeId: stateNode.nodeId, reason: "geometry-unresolved" });
      continue;
    }
    const boundary = boundaryOf(record);
    if (boundary === undefined) {
      omissions.push({ nodeId: stateNode.nodeId, reason: "boundary-absent" });
      continue;
    }
    if (boundary.length < 2) {
      omissions.push({ nodeId: stateNode.nodeId, reason: "degenerate-projection" });
      continue;
    }
    shapes.push({
      nodeId: stateNode.nodeId,
      geometryId: record.geometryId,
      points: boundary.map(worldToScreen),
      origin: stateNode.origin,
    });
  }
  return { shapes, omissions };
}
