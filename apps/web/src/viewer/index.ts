/**
 * AISE-027 — synchronized intervention viewer public surface.
 *
 * Synchronized 3D / 2D / BOQ viewing of ONE intervention scenario's ordered
 * PROPOSED states with Next/Previous layer navigation and stable ids (§027,
 * R11). READ the module headers before use:
 *
 *  - model.ts      — structural input types (AISE-026 mirrors, PROPOSED
 *                    literal seal) + the NO-BROWSER-AUTHORITY invariant;
 *  - sync.ts       — stateAt / frameOf / navigate / verifyStateAlignment
 *                    (THE synchronization core: one frame drives all
 *                    panes; clamped boundary navigation);
 *  - projection.ts — projectPane: the deterministic axonometric (3D) and
 *                    plan (2D) projections of a state's boundary polygons
 *                    (AISE-021 formulas; honest omissions);
 *  - svg.ts        — the shared deterministic pane SVG presentation;
 *  - paneboq.ts    — the BOQ pane: proposed quantities verbatim + proposed
 *                    removals (quantity/cost impacts stay AISE-028's);
 *  - read.ts       — the READ-ONLY data-access seam (InterventionReader,
 *                    always-GET request builders, loadViewerInput with the
 *                    two-read alignment cross-check);
 *  - render.ts     — renderInterventionViewer: the pure input → HTML
 *                    document function (three synchronized panes + the
 *                    navigation strip + the step strip);
 *  - errors.ts     — the single typed error vocabulary.
 *
 * This package renders deterministic HTML/SVG STRINGS server-side (the
 * existing dependency-free convention of apps/web — see workspace/ and
 * boqlens/). No browser APIs, no fetch, no client state, no writes: the
 * viewer is strictly read-only over AISE-026 intervention states and never
 * mutates authoritative reality.
 */

export { ViewerError, VIEWER_ERROR_CODES, type ViewerErrorCode } from "./errors";
export { renderInterventionViewer, VIEWER_GENERATOR_VERSION } from "./render";
export {
  frameOf,
  latestStateIndex,
  navigate,
  navigationTargets,
  stateAt,
  stateCountOf,
  stateIdsOf,
  verifyStateAlignment,
} from "./sync";
export {
  DEFAULT_VIEW,
  projectPane,
  projectPoint,
  projectPointPlan,
  type ProjectionMode,
  type ProjectionOptions,
} from "./projection";
export {
  renderPaneSvg,
  omissionLines,
  emptyPaneLines,
  PANE_STROKE,
  PANE_SELECTED_STROKE,
  PANE_SCENARIO_DASH,
} from "./svg";
export {
  projectStateBoq,
  propertyText,
  removalText,
  rowQuantitiesText,
  renderBoqTable,
} from "./paneboq";
export {
  loadViewerInput,
  scenarioReadRequest,
  stateReadRequest,
  READER_MEMBERS,
  type InterventionReader,
  type LoadViewerOptions,
  type LoadedViewerInput,
  type ViewerGetRequest,
} from "./read";
export {
  NAVIGATION_DIRECTIONS,
  PROJECTION_OMISSION_REASONS,
  type BoqProjection,
  type BoqRemovalRow,
  type BoqRow,
  type GeometryRecord,
  type NavigationDirection,
  type PaneProjection,
  type Plane,
  type PlaneGeometryRecord,
  type Point2D,
  type PolygonGeometryRecord,
  type ProjectedShape,
  type ProjectionOmission,
  type ProjectionOmissionReason,
  type Vec3,
  type ViewParams,
  type ViewerApprovalReference,
  type ViewerFrame,
  type ViewerGeometryRef,
  type ViewerInput,
  type ViewerInterventionState,
  type ViewerInterventionStep,
  type ViewerProposedNode,
  type ViewerProposedProperty,
  type ViewerProposedTombstone,
  type ViewerScenario,
  type ViewerStateNode,
  type ViewerStateRelationship,
  type ViewerStepProvenance,
  type ViewerUnitDeclaration,
} from "./model";
