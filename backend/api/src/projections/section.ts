/**
 * AISE-020 — deterministic section generator.
 *
 * Cuts the version snapshot with a vertical, axis-aligned plane
 * (`{ axis: "x" | "y", position }`) and projects onto the cut view plane
 * (axis "x" → y–z; axis "y" → x–z):
 *
 *  - elements whose boundary polygon INTERSECTS the cut plane (closed
 *    comparison — a grazing vertex counts) are drawn as CUT MARKS with
 *    SECTION_CUT_WEIGHT;
 *  - elements BEYOND the cut plane are drawn FAINT
 *    (SECTION_BEYOND_WEIGHT) — the weight distinction is the documented
 *    cut/beyond encoding, carried as explicit data on every element;
 *  - a boundary polygon is REQUIRED for the intersection test: a plane-only
 *    element has an unknown extent, so whether the cut reaches it would be a
 *    guess → omitted with "boundary-absent";
 *  - openings project as their polygon (polyline when the projection
 *    collapses), cut/faint by the same rule.
 *
 * No viewing direction is mandated by the section-plane spec, so "beyond"
 * covers BOTH sides of the cut (documented; direction selection is a 021
 * viewer concern). Scope: the whole version snapshot.
 */

import {
  DEFAULT_DRAWING_SCALE,
  PROJECTION_GENERATOR_VERSION,
  SECTION_BEYOND_WEIGHT,
  SECTION_CUT_WEIGHT,
  ProjectionError,
  type CoordinateFrame2D,
  type DrawnElement,
  type Drawing2D,
  type OmittedNode,
  type StrokeKind,
} from "./model";
import {
  boundaryOf,
  candidatesInScope,
  drawingIdFor,
  geometryOmissionReason,
  linearUnitsCompatible,
  omission,
  planeOf,
  projectTo2D,
  resolveProjectionInput,
  shapeFromPoints,
  sigmaOf,
  validateScale,
  type DropAxis,
  type ProjectionInput,
  type SectionPlaneSpec,
} from "./project";

export interface SectionOptions {
  /** Drawing units per metre (default 1 = native metres). */
  readonly scale?: number;
}

export function generateSection(
  version: ProjectionInput,
  sectionPlane: SectionPlaneSpec,
  options: SectionOptions = {},
): Drawing2D {
  if (sectionPlane === null || typeof sectionPlane !== "object") {
    throw new ProjectionError("invalid_input", "sectionPlane must be { axis: \"x\"|\"y\", position }");
  }
  if (sectionPlane.axis !== "x" && sectionPlane.axis !== "y") {
    throw new ProjectionError("invalid_input", `sectionPlane.axis must be "x" or "y", got ${String(sectionPlane.axis)}`);
  }
  if (typeof sectionPlane.position !== "number" || !Number.isFinite(sectionPlane.position)) {
    throw new ProjectionError("invalid_input", "sectionPlane.position must be a finite number (metres)");
  }
  const resolved = resolveProjectionInput(version);
  const scale = validateScale(options.scale ?? DEFAULT_DRAWING_SCALE);
  const frame: CoordinateFrame2D = { origin: [0, 0], scale, rotationRad: 0 };
  const drop: DropAxis = sectionPlane.axis;
  const axisIndex = sectionPlane.axis === "x" ? 0 : 1;

  const elements: DrawnElement[] = [];
  const omitted: OmittedNode[] = [];

  for (const candidate of candidatesInScope(resolved.nodes, resolved.geometryById)) {
    const node = candidate.node;
    if (!linearUnitsCompatible(node)) {
      omitted.push(omission(node.nodeId, "incompatible-linear-units"));
      continue;
    }
    const hardReason = geometryOmissionReason(node);
    if (hardReason !== null) {
      omitted.push(omission(node.nodeId, hardReason));
      continue;
    }
    const record = candidate.record;
    if (record === undefined) {
      omitted.push(omission(node.nodeId, "geometry-unresolved"));
      continue;
    }
    const boundary = boundaryOf(record);
    if (boundary === undefined) {
      omitted.push(omission(node.nodeId, "boundary-absent"));
      continue;
    }

    let minSide = Infinity;
    let maxSide = -Infinity;
    for (const vertex of boundary) {
      const side = vertex[axisIndex] - sectionPlane.position;
      if (side < minSide) minSide = side;
      if (side > maxSide) maxSide = side;
    }
    const intersecting = minSide <= 0 && maxSide >= 0;

    const shape = shapeFromPoints([...projectTo2D(boundary, drop)]);
    if (shape === null) {
      omitted.push(omission(node.nodeId, "degenerate-projection"));
      continue;
    }
    const strokeKind: StrokeKind =
      candidate.nodeClass === "wall" ? "wall" : candidate.nodeClass === "opening" ? "opening" : "boundary";
    const plane = planeOf(record);
    elements.push({
      elementId: node.nodeId,
      sourceNodeId: node.nodeId,
      geometry2d: shape,
      style: {
        strokeKind,
        strokeWeight: intersecting ? SECTION_CUT_WEIGHT : SECTION_BEYOND_WEIGHT,
      },
      ...(plane !== undefined
        ? { uncertainty: { sigma: sigmaOf(record), propagatedFrom: [record.geometryId] } }
        : {}),
    });
  }

  const scopeLabel = `${sectionPlane.axis}@${sectionPlane.position}`;
  return {
    drawingId: drawingIdFor(
      "section",
      scopeLabel,
      { axis: sectionPlane.axis, position: sectionPlane.position },
      resolved,
      scale,
    ),
    kind: "section",
    coordinateFrame: frame,
    elements: [...elements].sort((a, b) => ordering(a.elementId, b.elementId)),
    dimensions: [],
    omittedNodes: [...omitted].sort((a, b) => ordering(a.nodeId, b.nodeId)),
    sourceVersionId: resolved.versionId,
    generatedBy: PROJECTION_GENERATOR_VERSION,
  };
}

/** Code-unit ordering (locale-independent, matches canonical JSON sorting). */
function ordering(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
