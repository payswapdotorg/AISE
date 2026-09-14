/**
 * AISE-020 — deterministic elevation generator.
 *
 * Projects vertical faces of a Reality Graph version snapshot onto an
 * elevation plane (north/south → x–z; east/west → y–z). CHOSEN AND DOCUMENTED
 * visibility behavior (the work order allows omit-or-faint for away faces):
 *
 *  - a face is DRAWN when its unit normal points toward the viewer
 *    (n̂·toward > ELEVATION_VISIBLE_MIN_COMPONENT, strict);
 *  - a face pointing AWAY is OMITTED with "faces-away-from-view" — with the
 *    interior-scan convention (normals point into the room) the away face is
 *    the same wall seen from the other side, and drawing both would
 *    double-count one physical face;
 *  - a face parallel to the viewing direction is OMITTED with
 *    "edge-on-to-view" (no measurable projection);
 *  - openings are drawn when their polygon's plane is parallel to the view
 *    plane (orientation-independent |n̂·axis| via the geometry library's
 *    `fitPlane`): hosted openings (within ELEVATION_HOST_TOLERANCE_M of a
 *    DRAWN face) at normal weight, un-hosted "beyond" openings FAINT
 *    (ELEVATION_BEYOND_WEIGHT);
 *  - polygon-only elements without an explicit plane are omitted with
 *    "plane-absent" — a visibility classification from a fitted plane would
 *    be derived, not observed.
 *
 * Scope: the whole version by default, or the `contains` closure below
 * `options.buildingId` (typed `unknown_building` when absent). Dimensions are
 * a floor-plan concern (per the work order); elevations carry elements only.
 */

import { distancePointPlane, fitPlane, vecDot, type Plane, type Vec3 } from "../geometry";
import type { RealityNode } from "../reality";
import {
  DEFAULT_DRAWING_SCALE,
  ELEVATION_BEYOND_WEIGHT,
  ELEVATION_HOST_TOLERANCE_M,
  ELEVATION_VISIBLE_MIN_COMPONENT,
  OPENING_PARALLEL_DOT_MIN,
  PROJECTION_GENERATOR_VERSION,
  ProjectionError,
  STROKE_WEIGHTS,
  type CoordinateFrame2D,
  type DrawnElement,
  type Drawing2D,
  type OmittedNode,
  type StrokeKind,
} from "./model";
import {
  ELEVATION_DIRECTIONS,
  boundaryOf,
  candidatesInScope,
  centroid3D,
  drawingIdFor,
  geometryOmissionReason,
  linearUnitsCompatible,
  omission,
  planeOf,
  projectTo2D,
  resolveProjectionInput,
  scopedNodes,
  shapeFromPoints,
  sigmaOf,
  validateScale,
  type DropAxis,
  type ElevationDirection,
  type GeometryRecord,
  type ProjectionInput,
} from "./project";

export interface ElevationOptions {
  /** Drawing units per metre (default 1 = native metres). */
  readonly scale?: number;
  /** Restrict the projection to the contains-closure below this building node. */
  readonly buildingId?: string;
}

/** Viewing geometry per direction: dropped axis + toward-viewer + view axis. */
const ELEVATION_VIEWS: Readonly<
  Record<ElevationDirection, { readonly drop: DropAxis; readonly toward: Vec3; readonly axis: Vec3 }>
> = {
  north: { drop: "y", toward: [0, 1, 0], axis: [0, 1, 0] },
  south: { drop: "y", toward: [0, -1, 0], axis: [0, 1, 0] },
  east: { drop: "x", toward: [1, 0, 0], axis: [1, 0, 0] },
  west: { drop: "x", toward: [-1, 0, 0], axis: [1, 0, 0] },
};

/** An opening deferred to the second pass (input checks already passed). */
interface DeferredOpening {
  readonly node: RealityNode;
  readonly boundary: readonly Vec3[];
  readonly record: GeometryRecord;
}

export function generateElevation(
  version: ProjectionInput,
  direction: ElevationDirection,
  options: ElevationOptions = {},
): Drawing2D {
  if (!(ELEVATION_DIRECTIONS as readonly string[]).includes(direction)) {
    throw new ProjectionError("invalid_input", `direction must be one of ${ELEVATION_DIRECTIONS.join("|")}`);
  }
  const resolved = resolveProjectionInput(version);
  const scale = validateScale(options.scale ?? DEFAULT_DRAWING_SCALE);
  const frame: CoordinateFrame2D = { origin: [0, 0], scale, rotationRad: 0 };
  const view = ELEVATION_VIEWS[direction];
  const scopeNodes =
    options.buildingId !== undefined
      ? scopedNodes(resolved, options.buildingId, "unknown_building")
      : resolved.nodes;

  const elements: DrawnElement[] = [];
  const omitted: OmittedNode[] = [];
  const drawnFacePlanes: Plane[] = [];
  const deferredOpenings: DeferredOpening[] = [];

  for (const candidate of candidatesInScope(scopeNodes, resolved.geometryById)) {
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

    if (candidate.nodeClass === "opening") {
      deferredOpenings.push({ node, boundary, record });
      continue;
    }

    const plane = planeOf(record);
    if (plane === undefined) {
      omitted.push(omission(node.nodeId, "plane-absent"));
      continue;
    }
    const component = vecDot(plane.normal, view.toward);
    if (component <= -ELEVATION_VISIBLE_MIN_COMPONENT) {
      omitted.push(omission(node.nodeId, "faces-away-from-view"));
      continue;
    }
    if (component <= ELEVATION_VISIBLE_MIN_COMPONENT) {
      omitted.push(omission(node.nodeId, "edge-on-to-view"));
      continue;
    }
    const shape = shapeFromPoints([...projectTo2D(boundary, view.drop)]);
    if (shape === null) {
      omitted.push(omission(node.nodeId, "degenerate-projection"));
      continue;
    }
    const strokeKind: StrokeKind = candidate.nodeClass === "wall" ? "wall" : "boundary";
    elements.push({
      elementId: node.nodeId,
      sourceNodeId: node.nodeId,
      geometry2d: shape,
      style: { strokeKind, strokeWeight: STROKE_WEIGHTS[strokeKind] },
      uncertainty: { sigma: sigmaOf(record), propagatedFrom: [record.geometryId] },
    });
    if (candidate.nodeClass === "wall") {
      drawnFacePlanes.push(plane);
    }
  }

  for (const opening of deferredOpenings) {
    const node = opening.node;
    let openingPlane: Plane;
    try {
      openingPlane = fitPlane(opening.boundary).plane;
    } catch {
      omitted.push(omission(node.nodeId, "degenerate-projection"));
      continue;
    }
    if (Math.abs(vecDot(openingPlane.normal, view.axis)) < OPENING_PARALLEL_DOT_MIN) {
      omitted.push(omission(node.nodeId, "edge-on-to-view"));
      continue;
    }
    const shape = shapeFromPoints([...projectTo2D(opening.boundary, view.drop)]);
    if (shape === null) {
      omitted.push(omission(node.nodeId, "degenerate-projection"));
      continue;
    }
    const centroid = centroid3D(opening.boundary);
    const hosted = drawnFacePlanes.some(
      (face) => distancePointPlane(centroid, null, face).absolute <= ELEVATION_HOST_TOLERANCE_M,
    );
    const plane = planeOf(opening.record);
    elements.push({
      elementId: node.nodeId,
      sourceNodeId: node.nodeId,
      geometry2d: shape,
      style: {
        strokeKind: "opening",
        strokeWeight: hosted ? STROKE_WEIGHTS.opening : ELEVATION_BEYOND_WEIGHT,
      },
      ...(plane !== undefined
        ? { uncertainty: { sigma: sigmaOf(opening.record), propagatedFrom: [opening.record.geometryId] } }
        : {}),
    });
  }

  const scopeLabel =
    options.buildingId !== undefined ? `${direction}:${options.buildingId}` : direction;
  return {
    drawingId: drawingIdFor(
      "elevation",
      scopeLabel,
      { direction, buildingId: options.buildingId ?? null },
      resolved,
      scale,
    ),
    kind: "elevation",
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
