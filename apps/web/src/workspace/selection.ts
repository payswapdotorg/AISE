/**
 * AISE-021 — synchronized selection resolution (the R5 core).
 *
 * R5: "selecting an object/region in any view can resolve the same stable
 * identifier." `resolveSelection(nodeId, input)` is the acceptance surface:
 * given ONE stable node id and the server-assembled workspace input, it
 * gathers everything that id resolves to across ALL views of the same model
 * version — the 2D drawing entries, the 3D wireframe entry, the linked
 * evidence entries, the node's properties and every σ that concerns it —
 * WITHOUT rendering anything. Pure: the input is never mutated; unknown ids
 * resolve to empty lists (absence is data, not an error — mirrors 020).
 *
 * `locateNodeInDrawing` structurally mirrors AISE-020's `locateNode`
 * semantics over the locally-typed `Drawing2D` (elements by `sourceNodeId`
 * + dimensions by `sourceNodeIds` membership): apps/web cannot import the
 * backend module (boundary matrix), but the id vocabulary and matching
 * rules are identical because the underlying JSON shapes are identical.
 */

import { WorkspaceError } from "./errors";
import type {
  Bounds2D,
  Dimension2D,
  Drawing2D,
  DrawingEntry,
  EvidenceEntry,
  Geometry2D,
  GeometryRecord,
  Point2D,
  SelectionBundle,
  SelectionSigma,
  ViewName,
  ViewParams,
  WireframeEntry,
  WorkspaceInput,
  WorkspaceNode,
} from "./model";
import { DEFAULT_VIEW, project3dWireframe } from "./wireframe";

/** Node id → its appearances in ONE drawing (elements then dimensions). */
export function locateNodeInDrawing(drawing: Drawing2D, nodeId: string): DrawingEntry[] {
  const entries: DrawingEntry[] = [];
  for (const element of drawing.elements) {
    if (element.sourceNodeId === nodeId) {
      entries.push({
        drawingKind: drawing.kind,
        elementId: element.elementId,
        entryKind: "element",
        bounds2d: boundsOfGeometry(element.geometry2d),
      });
    }
  }
  for (const dimension of drawing.dimensions) {
    if (dimension.sourceNodeIds.includes(nodeId)) {
      entries.push({
        drawingKind: drawing.kind,
        elementId: dimension.dimensionId,
        entryKind: "dimension",
        bounds2d: boundsOfPoints([dimension.from, dimension.to]),
      });
    }
  }
  return entries;
}

/** Axis-aligned bounds of drawn geometry (point symbol → zero extent). */
function boundsOfGeometry(geometry: Geometry2D): Bounds2D {
  return boundsOfPoints(geometry.kind === "point" ? [geometry.point] : geometry.points);
}

/** Axis-aligned bounds over a point set. */
function boundsOfPoints(points: readonly Point2D[]): Bounds2D {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point[0] < minX) minX = point[0];
    if (point[1] < minY) minY = point[1];
    if (point[0] > maxX) maxX = point[0];
    if (point[1] > maxY) maxY = point[1];
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return { minX, minY, maxX, maxY };
}

/** The view the input pins (explicit or the documented default). */
export function viewOf(input: WorkspaceInput): ViewParams {
  return input.view ?? DEFAULT_VIEW;
}

/**
 * Resolve ONE stable node id across every view of the workspace input.
 * Pure and total on well-formed ids: an id that appears nowhere resolves to
 * empty lists and `resolvedIn: []` — the honest answer, never an error.
 */
export function resolveSelection(nodeId: string, input: WorkspaceInput): SelectionBundle {
  if (typeof nodeId !== "string" || nodeId.length === 0) {
    throw new WorkspaceError("invalid_input", "nodeId must be a non-empty string");
  }

  const node = input.graphSnapshot.nodes.find((candidate) => candidate.nodeId === nodeId);

  const drawingEntries = locateNodeInDrawing(input.drawing, nodeId);

  const wireframeEntries: WireframeEntry[] = [];
  for (const element of project3dWireframe(input.graphSnapshot, viewOf(input)).elements) {
    if (element.nodeId === nodeId) {
      wireframeEntries.push({
        nodeId: element.nodeId,
        geometryId: element.geometryId,
        screenPoints: element.points,
        closed: element.closed,
      });
    }
  }

  const evidenceEntries: EvidenceEntry[] = [];
  for (const entry of input.evidence) {
    if (entry.linkedNodeIds.includes(nodeId)) {
      evidenceEntries.push(entry);
    }
  }

  const dimensions: Dimension2D[] = [];
  for (const dimension of input.drawing.dimensions) {
    if (dimension.sourceNodeIds.includes(nodeId)) {
      dimensions.push(dimension);
    }
  }

  const resolvedIn: ViewName[] = [];
  if (drawingEntries.length > 0) {
    resolvedIn.push("2d");
  }
  if (wireframeEntries.length > 0) {
    resolvedIn.push("3d");
  }
  if (evidenceEntries.length > 0) {
    resolvedIn.push("evidence");
  }

  return {
    nodeId,
    node,
    drawingEntries,
    wireframeEntries,
    evidenceEntries,
    dimensions,
    properties: node === undefined ? [] : [...node.properties],
    sigmas: sigmasOf(nodeId, node, input, dimensions),
    resolvedIn,
  };
}

/**
 * Every σ that concerns the node: the σ of its source geometry record (the
 * plane offset σ, null when the producer did not know it), the σ carried by
 * its drawn 2D elements, and the σ of every dimension derived from it.
 * null stays null — "σ unknown", never a fabricated 0.
 */
function sigmasOf(
  nodeId: string,
  node: WorkspaceNode | undefined,
  input: WorkspaceInput,
  dimensions: readonly Dimension2D[],
): SelectionSigma[] {
  const sigmas: SelectionSigma[] = [];

  if (node?.geometry !== undefined) {
    const record = geometryById(input.graphSnapshot.geometries ?? []).get(node.geometry.ref);
    if (record?.kind === "plane") {
      sigmas.push({
        source: "geometry",
        id: record.geometryId,
        sigma: record.offsetSigma ?? null,
      });
    }
  }

  for (const element of input.drawing.elements) {
    if (element.sourceNodeId === nodeId && element.uncertainty !== undefined) {
      sigmas.push({ source: "element", id: element.elementId, sigma: element.uncertainty.sigma });
    }
  }

  for (const dimension of dimensions) {
    sigmas.push({ source: "dimension", id: dimension.dimensionId, sigma: dimension.uncertainty });
  }

  return sigmas;
}

function geometryById(records: readonly GeometryRecord[]): Map<string, GeometryRecord> {
  const map = new Map<string, GeometryRecord>();
  for (const record of records) {
    map.set(record.geometryId, record);
  }
  return map;
}
