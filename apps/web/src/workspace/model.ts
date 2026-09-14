/**
 * AISE-021 — browser engineering workspace: STRUCTURAL INPUT MODEL.
 *
 * ⚠⚠⚠ NO BROWSER-SIDE AUTHORITY (frozen invariant, spec/architecture-lock.md
 * "Authority" #8: UI state is never canonical) ⚠⚠⚠
 *
 * Everything in this module is READ-ONLY DISPLAY DATA. The workspace NEVER
 * fetches, NEVER computes engineering truth, NEVER alters review state and
 * NEVER writes anything back. All facts arrive fully assembled by the server
 * inside `WorkspaceInput` (a drawing pinned to a graph version + a graph
 * snapshot slice + evidence records + an optional server-computed review
 * state + the currently selected node id). The rendered HTML — including the
 * review banner and the selection highlight — is a PROJECTION of that input,
 * nothing more. Selecting a node changes ONLY presentation
 * (`data-selected="true"` attributes + the selection panel), never data.
 *
 * BOUNDARY MATRIX (tools/lib/boundaries.ts): apps may import apps/packages
 * ONLY — apps/web CANNOT import backend/api sources. Therefore the input
 * types below are STRUCTURAL MIRRORS of the backend shapes (AISE-020
 * `Drawing2D` family and the AISE-016 `GraphVersion` slice consumed by
 * AISE-020's `ProjectionInput`): same field names, same JSON shapes, defined
 * locally. A real backend `Drawing2D`/`GraphVersion` serialized over the wire
 * satisfies these types as-is (structural typing); the AUTHORITATIVE
 * generators stay in the backend (AISE-016/020). This module deliberately
 * imports NOTHING.
 */

/* ------------------------------------------------------------------ */
/* 2D drawing structural mirror (AISE-020 projections/model.ts)        */
/* ------------------------------------------------------------------ */

/** Immutable 2D point in drawing units (after the coordinate frame). */
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

/** Presentation vocabulary carried explicitly on every drawn element. */
export type StrokeKind = "wall" | "boundary" | "opening" | "dimension" | "annotation";

export interface Style2D {
  readonly strokeKind: StrokeKind;
  readonly strokeWeight: number;
}

export interface Label2D {
  readonly text: string;
  readonly anchor: Point2D;
}

/**
 * Uncertainty of a drawn element: physical 1σ of its source geometry
 * (null = unknown — NEVER 0) plus the ids the σ propagated from.
 */
export interface Uncertainty2D {
  readonly sigma: number | null;
  readonly propagatedFrom: readonly string[];
}

/**
 * One drawn 2D element. `elementId` and `sourceNodeId` are STABLE and equal
 * the source RealityNode node id — the R5 cross-view identity anchor shared
 * by the 2D, 3D and evidence panes.
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
 * A drawn dimension: the measured value (physical metres, NOT drawing
 * units) with its propagated 1σ (null = unknown — never rendered as ±0) and
 * the two source node ids the measurement was derived from.
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

export type DrawingKind = "floor_plan" | "elevation" | "section";

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
  readonly reason: string;
}

/** Structural mirror of AISE-020's `Drawing2D` (see module header). */
export interface Drawing2D {
  readonly drawingId: string;
  readonly kind: DrawingKind;
  readonly coordinateFrame: CoordinateFrame2D;
  readonly elements: readonly DrawnElement[];
  readonly dimensions: readonly Dimension2D[];
  readonly omittedNodes: readonly OmittedNode[];
  readonly sourceVersionId: string;
  readonly generatedBy: string;
}

/** Axis-aligned bounds (drawing units). */
export interface Bounds2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/* ------------------------------------------------------------------ */
/* Graph snapshot structural slice (GraphVersion-compatible)           */
/* ------------------------------------------------------------------ */

/** 3D world vector in metres (structural mirror of the geometry module). */
export type Vec3 = readonly [number, number, number];

/** Plane n̂·x + d = 0 (structural mirror of the geometry module). */
export interface Plane {
  readonly normal: Vec3;
  readonly d: number;
}

/**
 * Geometry explicitly resolved for one graph geometry-ref id (structural
 * mirror of AISE-020's `PlaneGeometryRecord`): unit normal + offset, the
 * plane offset's physical 1σ when the producer knows it (absent/null =
 * unknown) and the 3D boundary polygon in world metres when known.
 */
export interface PlaneGeometryRecord {
  readonly geometryId: string;
  readonly kind: "plane";
  readonly plane: Plane;
  readonly offsetSigma?: number | null;
  readonly boundaryPolygon?: readonly Vec3[];
}

/** A pure polygon record (e.g. an opening's bounding polygon). */
export interface PolygonGeometryRecord {
  readonly geometryId: string;
  readonly kind: "polygon";
  readonly polygon: readonly Vec3[];
}

export type GeometryRecord = PlaneGeometryRecord | PolygonGeometryRecord;

/** A typed property assertion on a node (value domain of PropertyRecord). */
export interface WorkspaceProperty {
  readonly key: string;
  readonly value: string | number | boolean;
  /** REQUIRED for numeric values; absent for non-numeric. */
  readonly unit?: string;
  readonly epistemicStatus: string;
}

/** Reference to geometry owned elsewhere (never parsed by the workspace). */
export interface WorkspaceGeometryRef {
  readonly kind: "plane" | "polygon" | "mesh-ref" | "point-cloud-ref";
  readonly ref: string;
}

/**
 * Minimal structural slice of a materialized `RealityNode`: a full backend
 * node (with its provenance, units, acquisition refs, …) is assignable as-is
 * — extra fields are ignored by the workspace.
 */
export interface WorkspaceNode {
  readonly nodeId: string;
  readonly kind: string;
  readonly epistemicStatus: string;
  readonly properties: readonly WorkspaceProperty[];
  readonly geometry?: WorkspaceGeometryRef;
}

/**
 * Minimal structural slice of a materialized `GraphVersion` (the shape
 * AISE-020's `ProjectionInput` consumes): `versionId`, `nodes`,
 * `relationships`, explicit geometry table.
 */
export interface GraphSnapshot {
  readonly versionId: string;
  readonly nodes: readonly WorkspaceNode[];
  readonly relationships?: readonly unknown[];
  readonly geometries?: readonly GeometryRecord[];
}

/* ------------------------------------------------------------------ */
/* Evidence + review (server-assembled facts, displayed verbatim)      */
/* ------------------------------------------------------------------ */

/**
 * One evidence record as assembled by the server (the workspace NEVER
 * queries the Evidence Graph). `linkedNodeIds` are the SAME stable node ids
 * the 2D and 3D panes carry — evidence linking is by identity, not geometry.
 */
export interface EvidenceEntry {
  readonly evidenceId: string;
  readonly method: string;
  readonly linkedNodeIds: readonly string[];
  /** True when the Evidence Graph has invalidated this record. */
  readonly invalidated?: boolean;
  readonly note?: string;
}

/**
 * Review state AS COMPUTED BY THE SERVER. ⚠ The workspace displays this
 * VERBATIM in a banner — it never computes, infers, alters or defaults a
 * review status. There is deliberately NO API here to set or change review
 * state: that authority lives outside the browser, always.
 */
export interface ReviewState {
  readonly reviewer: string;
  readonly status: "approved" | "rejected" | "pending";
  readonly note: string;
  readonly at: string;
}

/* ------------------------------------------------------------------ */
/* 3D wireframe view parameters                                        */
/* ------------------------------------------------------------------ */

/**
 * Orthographic axonometric view parameters (radians). Presentation-only:
 * they change the PROJECTION of the wireframe, never any data.
 */
export interface ViewParams {
  /** Rotation of the model about the vertical (z) axis. */
  readonly azimuthRad: number;
  /** Viewing elevation above the horizontal plane. */
  readonly elevationRad: number;
}

/* ------------------------------------------------------------------ */
/* Selection bundle (the R5 acceptance surface)                        */
/* ------------------------------------------------------------------ */

/** The synchronized views a node id can resolve in. */
export type ViewName = "2d" | "3d" | "evidence";

/** One located appearance of a node in the 2D drawing. */
export interface DrawingEntry {
  readonly drawingKind: DrawingKind;
  readonly elementId: string;
  readonly entryKind: "element" | "dimension";
  readonly bounds2d: Bounds2D;
}

/** One located appearance of a node in the 3D wireframe. */
export interface WireframeEntry {
  readonly nodeId: string;
  readonly geometryId: string;
  readonly screenPoints: readonly Point2D[];
  readonly closed: boolean;
}

/** A σ attached to the selected node, with its stable source id. */
export interface SelectionSigma {
  readonly source: "geometry" | "element" | "dimension";
  readonly id: string;
  readonly sigma: number | null;
}

/**
 * The bundle `resolveSelection(nodeId, input)` returns: everything the ONE
 * stable node id resolves to across ALL views of the same model version —
 * 2D drawing entries, 3D wireframe entries, linked evidence entries, the
 * node's properties and every σ that concerns it. This is the R5
 * acceptance object: "selecting an object/region in any view can resolve
 * the same stable identifier."
 */
export interface SelectionBundle {
  readonly nodeId: string;
  readonly node: WorkspaceNode | undefined;
  readonly drawingEntries: readonly DrawingEntry[];
  readonly wireframeEntries: readonly WireframeEntry[];
  readonly evidenceEntries: readonly EvidenceEntry[];
  readonly dimensions: readonly Dimension2D[];
  readonly properties: readonly WorkspaceProperty[];
  readonly sigmas: readonly SelectionSigma[];
  readonly resolvedIn: readonly ViewName[];
}

/* ------------------------------------------------------------------ */
/* Workspace input (server-assembled, read-only)                       */
/* ------------------------------------------------------------------ */

/**
 * EVERYTHING the workspace renders. Assembled entirely server-side; the
 * browser never fetches, never derives and never mutates it.
 */
export interface WorkspaceInput {
  /** Floor-plan drawing pinned to `sourceVersionId` (AISE-020 output). */
  readonly drawing: Drawing2D;
  /** Graph snapshot slice for the SAME version (wireframe + properties). */
  readonly graphSnapshot: GraphSnapshot;
  /** Evidence records linked by stable node ids (never fetched here). */
  readonly evidence: readonly EvidenceEntry[];
  /** The currently selected stable node id (presentation only). */
  readonly selectedNodeId?: string;
  /** Server-computed review state, rendered verbatim (never altered). */
  readonly review?: ReviewState;
  /** Axonometric view parameters for the 3D pane (default when absent). */
  readonly view?: ViewParams;
}
