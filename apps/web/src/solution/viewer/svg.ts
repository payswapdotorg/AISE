/**
 * PROD-024 — deterministic LAYERED SCENE SVG of the solution workspace.
 *
 * ONE SVG document with TWO visually and semantically distinct layers
 * (§4.3 of the work order — the PROD-021 cognitive-separation doctrine):
 *
 *  - the OBSERVED layer (`<g data-layer="observed">`): the authoritative
 *    current-building reality, SOLID strokes, every element carrying
 *    `data-element-id` + `data-epistemic="OBSERVED"`;
 *  - the PROPOSED layer (`<g data-layer="proposed">`): the engine-recorded
 *    operations projected as overlays — DASHED strokes for added material,
 *    DOTTED+cross-marked for removed, every shape carrying
 *    `data-operation-id` + `data-epistemic="PROPOSED"` + the state layer
 *    it appears from.
 *
 * The two layers are NEVER conflated: an observed element cannot render
 * inside the proposed group and vice versa (structural separation, not
 * just color). SELECTION (`data-selected="true"` + the highlight stroke)
 * and ISOLATION (`data-dimmed="true"` on everything outside the isolated
 * operation's affected geometry) are presentation-only toggles — geometry,
 * ids and order are untouched. Fixed element order, fixed attribute order,
 * canonical number text → byte-identical SVG for identical input (no DOM,
 * no events, no fetching — the interactive shell wraps the string).
 */

import { boundsOfPoints, escapeHtml, fmt, paddedViewBox, pointsAttr } from "./format";
import type { Point2D } from "./format";
import { projectPolygon } from "./projection";
import type { ProjectionView } from "./projection";
import type { ObservedScene, ProposedOverlay } from "./model";

/** Version stamped on every scene SVG (determinism pin). */
export const SCENE_SVG_GENERATOR_VERSION = "aise-solution-scene/1.0";

/** Stroke width of observed (authoritative) geometry. */
export const OBSERVED_STROKE_WIDTH = 1.6;

/** Stroke width of proposed overlay geometry. */
export const PROPOSED_STROKE_WIDTH = 1.8;

/** Stroke color of the OBSERVED layer (neutral dark). */
export const OBSERVED_STROKE = "#1c1917";

/** Stroke color of ADDED proposed overlays (distinct, non-blue house tone). */
export const PROPOSED_ADDED_STROKE = "#15803d";

/** Stroke color of REMOVED proposed overlays (distinct warning tone). */
export const PROPOSED_REMOVED_STROKE = "#b91c1c";

/** Stroke color of CHANGED proposed overlays. */
export const PROPOSED_CHANGED_STROKE = "#c2410c";

/** Highlight stroke of the selected shape. */
export const SELECTED_STROKE = "#7c2d12";

/** Dash pattern of ADDED proposed overlays (presentation only). */
export const PROPOSED_ADDED_DASH = "5 3";

/** Dash pattern of REMOVED proposed overlays (presentation only). */
export const PROPOSED_REMOVED_DASH = "2 3";

/** Selection/isolation/highlight request driving one render (presentation only). */
export interface SceneRenderOptions {
  readonly selectedElementId?: string;
  readonly selectedOperationId?: string;
  /** When set, every shape NOT belonging to the isolated operation dims. */
  readonly isolateOperationId?: string;
  /** BOQ-sync highlight: multiple operations highlighted at once. */
  readonly highlightOperationIds?: readonly string[];
  /** BOQ-sync highlight: observed elements whose geometry is referenced. */
  readonly highlightElementIds?: readonly string[];
  /** BOQ-sync highlight: raw geometry refs (element match by reference). */
  readonly highlightGeometryRefs?: readonly string[];
}

/**
 * Deterministic layered SVG document of the scene. `scene` renders the
 * OBSERVED layer; `overlays` (projections of engine-recorded operations,
 * viewer/model.ts) render the PROPOSED layer. Pure string rendering.
 */
export function renderSceneSvg(
  scene: ObservedScene,
  overlays: readonly ProposedOverlay[],
  view: ProjectionView,
  projection: "plan" | "axonometric",
  options: SceneRenderOptions = {},
): string {
  const observedProjected = scene.elements.map((element) => ({
    element,
    polygons: element.polygons.map((polygon) =>
      projectPolygon(polygon, view, projection),
    ),
  }));
  const overlayProjected = overlays.map((overlay) => ({
    overlay,
    polygons: overlay.polygons.map((polygon) =>
      projectPolygon(polygon, view, projection),
    ),
  }));

  const allPoints: Point2D[] = [];
  for (const entry of observedProjected) {
    for (const polygon of entry.polygons) {
      allPoints.push(...polygon);
    }
  }
  for (const entry of overlayProjected) {
    for (const polygon of entry.polygons) {
      allPoints.push(...polygon);
    }
  }
  const box = paddedViewBox(boundsOfPoints(allPoints));

  const lines: string[] = [
    `<svg height="${box.height}" viewBox="${box.viewBox}" width="${box.width}" xmlns="http://www.w3.org/2000/svg">`,
  ];

  /* ---- The OBSERVED layer (authoritative; solid strokes). ---- */
  lines.push(`<g data-layer="observed" data-epistemic-class="OBSERVED">`);
  for (const entry of observedProjected) {
    const element = entry.element;
    const selected = options.selectedElementId === element.elementId;
    const highlighted =
      options.highlightElementIds?.includes(element.elementId) === true ||
      element.geometryRefs.some((ref) => options.highlightGeometryRefs?.includes(ref.ref) === true);
    const dimmed =
      options.isolateOperationId !== undefined &&
      !overlayTouches(options.isolateOperationId, element.elementId, overlays);
    for (const polygon of entry.polygons) {
      const weight = selected
        ? OBSERVED_STROKE_WIDTH + 0.6
        : highlighted
          ? OBSERVED_STROKE_WIDTH + 0.8
          : OBSERVED_STROKE_WIDTH;
      lines.push(
        `<polygon data-element-id="${escapeHtml(element.elementId)}" data-epistemic="OBSERVED"${selected ? ` data-selected="true"` : ""}${highlighted ? ` data-boq-highlight="true"` : ""}${dimmed ? ` data-dimmed="true"` : ""} fill="none" points="${pointsAttr(polygon)}" stroke="${selected ? SELECTED_STROKE : OBSERVED_STROKE}" stroke-width="${fmt(weight)}"${dimmed ? ` opacity="0.25"` : ""}/>`,
      );
    }
  }
  lines.push(`</g>`);

  /* ---- The PROPOSED layer (engine-recorded overlays; dashed/dotted). ---- */
  lines.push(`<g data-layer="proposed" data-epistemic-class="PROPOSED">`);
  for (const entry of overlayProjected) {
    const overlay = entry.overlay;
    const selected = options.selectedOperationId === overlay.operationId;
    const highlighted = options.highlightOperationIds?.includes(overlay.operationId) === true;
    const inIsolation =
      options.isolateOperationId === undefined ||
      options.isolateOperationId === overlay.operationId;
    const stroke =
      overlay.direction === "added"
        ? PROPOSED_ADDED_STROKE
        : overlay.direction === "removed"
          ? PROPOSED_REMOVED_STROKE
          : PROPOSED_CHANGED_STROKE;
    const dash =
      overlay.direction === "removed" ? PROPOSED_REMOVED_DASH : PROPOSED_ADDED_DASH;
    for (const polygon of entry.polygons) {
      lines.push(
        `<polygon data-operation-id="${escapeHtml(overlay.operationId)}" data-epistemic="PROPOSED" data-operation-type="${escapeHtml(overlay.operationType)}" data-visible-from-layer="${fmt(overlay.visibleFromStateIndex)}" data-direction="${escapeHtml(overlay.direction)}"${selected ? ` data-selected="true"` : ""}${highlighted ? ` data-boq-highlight="true"` : ""}${inIsolation ? "" : ` data-dimmed="true"`} fill="none" points="${pointsAttr(polygon)}" stroke="${selected ? SELECTED_STROKE : stroke}" stroke-dasharray="${dash}" stroke-width="${fmt(selected || highlighted ? PROPOSED_STROKE_WIDTH + 0.6 : PROPOSED_STROKE_WIDTH)}"${inIsolation ? "" : ` opacity="0.2"`}/>`,
      );
    }
  }
  lines.push(`</g>`);
  lines.push(`</svg>`);
  return `${lines.join("\n")}\n`;
}

/** Whether an overlay anchors to the given observed element (isolation join). */
function overlayTouches(
  operationId: string,
  elementId: string,
  overlays: readonly ProposedOverlay[],
): boolean {
  return overlays.some(
    (overlay) =>
      overlay.operationId === operationId &&
      (overlay.anchoredElementIds.includes(elementId) ||
        overlay.affectedNodeRefs.includes(elementId)),
  );
}

/**
 * The textual alternative of the scene (the accessible description of the
 * viewer — WCAG): observed elements and proposed overlays listed with
 * their real-world labels, epistemic classes and operation identities.
 */
export function sceneTextAlternative(
  scene: ObservedScene,
  overlays: readonly ProposedOverlay[],
): string {
  const observed = scene.elements
    .map((element) => `${element.label} (observed ${element.kind}, ${element.facts.length} recorded facts)`)
    .join("; ");
  const proposed =
    overlays.length === 0
      ? "no proposed work visible at this step"
      : overlays.map((overlay) => `${overlay.label} (proposed, ${overlay.direction})`).join("; ");
  return `Observed building: ${observed}. Proposed at this step: ${proposed}.`;
}
