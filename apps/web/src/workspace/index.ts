/**
 * AISE-021 — browser engineering workspace public surface.
 *
 * Synchronized 2D / 3D / evidence browsing of ONE pinned model version with
 * stable cross-view identity (R5). READ the module headers before use:
 *
 *  - model.ts      — structural input types + the NO-BROWSER-AUTHORITY
 *                    invariant (everything is server-assembled, read-only);
 *  - render.ts     — renderWorkspace: the pure input → HTML document
 *                    function (panes, measurement strip, review banner,
 *                    selection panel, honest omissions);
 *  - selection.ts  — resolveSelection / locateNodeInDrawing (the R5 core:
 *                    one stable node id resolves across ALL views);
 *  - wireframe.ts  — project3dWireframe: the deterministic axonometric
 *                    engineering wireframe (NOT a 3D engine);
 *  - svg2d.ts      — the 2D pane SVG presentation (mirrors AISE-020's
 *                    svg semantics over the structural Drawing2D);
 *  - errors.ts     — the single typed error vocabulary.
 *
 * This package renders deterministic HTML/SVG STRINGS server-side (the
 * existing dependency-free convention of apps/web). No browser APIs, no
 * fetch, no client state — see the frozen invariant in model.ts.
 */

export { WorkspaceError, WORKSPACE_ERROR_CODES, type WorkspaceErrorCode } from "./errors";
export { renderWorkspace, measurementText, WORKSPACE_GENERATOR_VERSION } from "./render";
export {
  resolveSelection,
  locateNodeInDrawing,
  viewOf,
} from "./selection";
export {
  DEFAULT_VIEW,
  projectPoint,
  project3dWireframe,
  renderWireframeSvg,
  WIREFRAME_GENERATOR_VERSION,
  WIREFRAME_OMISSION_REASONS,
  type WireframeElement,
  type WireframeModel,
  type WireframeOmission,
  type WireframeOmissionReason,
} from "./wireframe";
export {
  renderDrawing2dSvg,
  DRAWING_STROKE,
  DRAWING_SELECTED_STROKE,
} from "./svg2d";
export type {
  Bounds2D,
  CoordinateFrame2D,
  Dimension2D,
  DrawnElement,
  Drawing2D,
  DrawingKind,
  DrawingEntry,
  EvidenceEntry,
  Geometry2D,
  GeometryRecord,
  GraphSnapshot,
  Label2D,
  OmittedNode,
  Plane,
  PlaneGeometryRecord,
  Point2D,
  PointSymbol2D,
  Polygon2D,
  PolygonGeometryRecord,
  Polyline2D,
  ReviewState,
  SelectionBundle,
  SelectionSigma,
  StrokeKind,
  Style2D,
  Uncertainty2D,
  Vec3,
  ViewName,
  ViewParams,
  WireframeEntry,
  WorkspaceGeometryRef,
  WorkspaceInput,
  WorkspaceNode,
  WorkspaceProperty,
} from "./model";
