/**
 * AISE-020 — deterministic floor-plan generator.
 *
 * Projects one storey of a materialized Reality Graph version snapshot onto
 * the horizontal plane (drop z):
 *
 *  - walls/floors/generic elements → the projected boundary polygon (closed
 *    polygon when the projection has area, polyline when it collapses);
 *  - openings → point symbols anchored at the projected centroid of their
 *    bounding polygon (which lies on their host wall line);
 *  - dimensions → separations of parallel WALL-plane pairs measured with the
 *    geometry library (`dimensionBetweenParallelPlanes`), σ composed from the
 *    planes' explicit offset σ (`propagateUncertainty` — null-safe);
 *
 * HONESTY: a wall plane without a boundary polygon still yields its
 * DIMENSION (a plane pair needs no extent) but is OMITTED as a drawn element
 * ("boundary-absent") — its drawn extent would be a guess. Every omission
 * carries a stable reason code (see OMISSION_REASONS).
 *
 * Determinism: scope nodes are processed id-sorted; elements, dimensions and
 * omissions are emitted id-sorted; the drawing id is content-derived. Same
 * snapshot + same options → byte-identical drawing.
 */

import {
  PARALLEL_ANGLE_TOLERANCE_RAD,
  canonicalZero,
  dimensionBetweenParallelPlanes,
  propagateUncertainty,
  type Plane,
} from "../geometry";
import type { RealityNode } from "../reality";
import {
  DEFAULT_DRAWING_SCALE,
  PROJECTION_GENERATOR_VERSION,
  STROKE_WEIGHTS,
  WALL_VERTICALITY_MAX,
  type CoordinateFrame2D,
  type Dimension2D,
  type DrawnElement,
  type Drawing2D,
  type OmittedNode,
  type Point2D,
  type StrokeKind,
} from "./model";
import {
  applyFrame,
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
  semanticKindOf,
  shapeFromPoints,
  sigmaOf,
  validateScale,
  type ProjectionInput,
} from "./project";

export interface FloorPlanOptions {
  /** Drawing units per metre (default 1 = native metres). */
  readonly scale?: number;
}

/** A wall node's resolved plane + its explicit offset σ. */
interface WallPlaneSource {
  readonly nodeId: string;
  readonly plane: Plane;
  readonly sigma: number | null;
  readonly geometryId: string;
}

export function generateFloorPlan(
  version: ProjectionInput,
  storeyId: string,
  options: FloorPlanOptions = {},
): Drawing2D {
  const resolved = resolveProjectionInput(version);
  const scale = validateScale(options.scale ?? DEFAULT_DRAWING_SCALE);
  const frame: CoordinateFrame2D = { origin: [0, 0], scale, rotationRad: 0 };
  const scopeNodes = scopedNodes(resolved, storeyId);

  const elements: DrawnElement[] = [];
  const omitted: OmittedNode[] = [];
  const wallPlanes: WallPlaneSource[] = [];
  const drawnWorldPoints: Point2D[] = [];
  let floorWorldCentroid: Point2D | null = null;

  for (const candidate of candidatesInScope(scopeNodes, resolved.geometryById)) {
    const node = candidate.node;
    if (candidate.nodeClass === "ceiling") {
      omitted.push(omission(node.nodeId, "overhead-not-projected-in-plan"));
      continue;
    }
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

    if (candidate.nodeClass === "opening") {
      const boundary = boundaryOf(record);
      if (boundary === undefined) {
        omitted.push(omission(node.nodeId, "boundary-absent"));
        continue;
      }
      const centroid = centroid3D(boundary);
      const anchorWorld: Point2D = [canonicalZero(centroid[0]), canonicalZero(centroid[1])];
      elements.push(openingSymbol(node, anchorWorld, frame));
      drawnWorldPoints.push(anchorWorld);
      continue;
    }

    const plane = planeOf(record);
    if (candidate.nodeClass === "wall" && plane !== undefined) {
      if (Math.abs(plane.normal[2]) >= WALL_VERTICALITY_MAX) {
        omitted.push(omission(node.nodeId, "wall-not-vertical"));
        continue;
      }
      wallPlanes.push({ nodeId: node.nodeId, plane, sigma: sigmaOf(record), geometryId: record.geometryId });
    }

    const boundary = boundaryOf(record);
    if (boundary === undefined) {
      // Plane known, extent unknown: the wall still contributes dimensions
      // (wallPlanes above) but its drawn extent would be a guess.
      omitted.push(omission(node.nodeId, "boundary-absent"));
      continue;
    }
    const projected = projectTo2D(boundary, "z");
    const shape = shapeFromPoints([...projected]);
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
      ...(plane !== undefined
        ? { uncertainty: { sigma: sigmaOf(record), propagatedFrom: [record.geometryId] } }
        : {}),
    });
    for (const point of projected) {
      drawnWorldPoints.push(point);
    }
    if (candidate.nodeClass === "floor" && floorWorldCentroid === null) {
      floorWorldCentroid = meanPoint(projected);
    }
  }

  const reference = floorWorldCentroid ?? meanPoint(drawnWorldPoints) ?? [0, 0];
  const dimensions = wallPairDimensions(wallPlanes, reference, frame);

  return {
    drawingId: drawingIdFor("floor_plan", storeyId, { storeyId }, resolved, scale),
    kind: "floor_plan",
    coordinateFrame: frame,
    elements: [...elements].sort((a, b) => ordering(a.elementId, b.elementId)),
    dimensions,
    omittedNodes: [...omitted].sort((a, b) => ordering(a.nodeId, b.nodeId)),
    sourceVersionId: resolved.versionId,
    generatedBy: PROJECTION_GENERATOR_VERSION,
  };
}

/* ------------------------------------------------------------------ */
/* Openings                                                           */
/* ------------------------------------------------------------------ */

/** Symbol anchored at the projected centroid of the opening's boundary. */
function openingSymbol(
  node: RealityNode,
  anchorWorld: Point2D,
  frame: CoordinateFrame2D,
): DrawnElement {
  const anchor = applyFrame(frame, anchorWorld);
  const semantic = semanticKindOf(node);
  const symbol: "door" | "window" | "opening" =
    semantic === "door" ? "door" : semantic === "window" ? "window" : "opening";
  return {
    elementId: node.nodeId,
    sourceNodeId: node.nodeId,
    geometry2d: { kind: "point", point: anchor, symbol },
    style: { strokeKind: "opening", strokeWeight: STROKE_WEIGHTS.opening },
    label: { text: symbol, anchor },
  };
}

/* ------------------------------------------------------------------ */
/* Dimensions                                                          */
/* ------------------------------------------------------------------ */

/**
 * Pair every pair of parallel vertical wall planes (in nodeId-sorted order)
 * and emit the measured separation with propagated σ. Non-parallel pairs are
 * skipped (they are not room extents, and the library would reject them).
 */
function wallPairDimensions(
  walls: readonly WallPlaneSource[],
  reference: Point2D,
  frame: CoordinateFrame2D,
): Dimension2D[] {
  const dimensions: Dimension2D[] = [];
  for (let i = 0; i < walls.length; i += 1) {
    for (let j = i + 1; j < walls.length; j += 1) {
      const first = walls[i];
      const second = walls[j];
      if (first === undefined || second === undefined) {
        continue;
      }
      const alignment = Math.abs(
        first.plane.normal[0] * second.plane.normal[0] +
          first.plane.normal[1] * second.plane.normal[1] +
          first.plane.normal[2] * second.plane.normal[2],
      );
      const deviation = Math.acos(Math.min(1, alignment));
      if (deviation > PARALLEL_ANGLE_TOLERANCE_RAD) {
        continue;
      }
      const measurement = dimensionBetweenParallelPlanes(first.plane, second.plane);
      const uncertainty = propagateUncertainty(measurement.value, [1, 1], [first.sigma, second.sigma]).uncertainty;
      const pair: [string, string] = ordering(first.nodeId, second.nodeId) <= 0
        ? [first.nodeId, second.nodeId]
        : [second.nodeId, first.nodeId];
      dimensions.push({
        dimensionId: `dim:${pair[0]}:${pair[1]}`,
        from: applyFrame(frame, footOnTrace(reference, first.plane)),
        to: applyFrame(frame, footOnTrace(reference, second.plane)),
        value: measurement.value,
        unit: "m",
        uncertainty,
        sourceNodeIds: pair,
      });
    }
  }
  return dimensions.sort((a, b) => ordering(a.dimensionId, b.dimensionId));
}

/**
 * Foot of the perpendicular from `reference` onto the plane's horizontal
 * trace (n.x·x + n.y·y + d = 0). Verticality of the wall guarantees the
 * 2D normal length is ≥ sqrt(1 − WALL_VERTICALITY_MAX²) > 0.
 */
function footOnTrace(reference: Point2D, plane: Plane): Point2D {
  const length = Math.sqrt(plane.normal[0] * plane.normal[0] + plane.normal[1] * plane.normal[1]);
  const nx = plane.normal[0] / length;
  const ny = plane.normal[1] / length;
  const d = plane.d / length;
  const signed = nx * reference[0] + ny * reference[1] + d;
  return [canonicalZero(reference[0] - signed * nx), canonicalZero(reference[1] - signed * ny)];
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Code-unit ordering (locale-independent, matches canonical JSON sorting). */
function ordering(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Arithmetic mean of 2D points in order; null for empty input. */
function meanPoint(points: readonly Point2D[]): Point2D | null {
  if (points.length === 0) {
    return null;
  }
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
  }
  return [canonicalZero(x / points.length), canonicalZero(y / points.length)];
}
