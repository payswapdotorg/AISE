/**
 * AISE-021 deterministic test fixtures — TEST SUPPORT ONLY, never imported
 * by the workspace rendering modules (mirrors the backend testkit/fixtures
 * conventions).
 *
 * apps/web CANNOT import backend sources (boundary matrix: apps →
 * apps/packages only), so this file hand-builds a STRUCTURAL fixture that
 * mirrors AISE-020's synthetic storey shapes: a 4.2 m × 3.0 m interior
 * room, walls 0.3 m thick and 2.7 m high (interior-face planes, normals
 * pointing INTO the room), a floor, a door + a window on the south wall,
 * and deliberately un-projectable nodes (mesh-ref column, unresolved
 * railing ref, geometry-less paint, ceiling plane without boundary).
 *
 * The `Drawing2D` below is hand-serialized to mirror what AISE-020's floor
 * plan generator emits for that storey (elementId === nodeId, wall-pair
 * dimensions with propagated σ, honest omittedNodes). Wall boundaries are
 * "skew hexagons" — 6 of the 8 box corners in the order
 * (xmin,ymin,zmin)→(xmax,ymin,zmin)→(xmax,ymax,zmin)→(xmax,ymax,zmax)→
 * (xmin,ymax,zmax)→(xmin,ymin,zmax) — a closed 3D cycle (the same
 * convention as AISE-020's fixtures).
 *
 * All ids/timestamps fixed; no clock, no randomness.
 */

import type {
  Dimension2D,
  DrawnElement,
  Drawing2D,
  EvidenceEntry,
  GeometryRecord,
  GraphSnapshot,
  ReviewState,
  Vec3,
  WorkspaceInput,
  WorkspaceNode,
  WorkspaceProperty,
} from "./model";

const WALL_HEIGHT = 2.7;
const WALL_THICKNESS = 0.3;

export const FIXTURE_VERSION_ID = "v002";
export const FIXTURE_DRAWING_ID = "fp-storey-1-v002";
export const FIXTURE_GENERATOR = "aise-projections/1.0";

/* ------------------------------------------------------------------ */
/* Graph snapshot (structural slice of a GraphVersion)                 */
/* ------------------------------------------------------------------ */

function prop(key: string, value: string | number | boolean, epistemicStatus = "INFERRED"): WorkspaceProperty {
  return {
    key,
    value,
    ...(typeof value === "number" ? { unit: "m" } : {}),
    epistemicStatus,
  };
}

function node(
  nodeId: string,
  kind: string,
  properties: readonly WorkspaceProperty[],
  geometry?: { kind: "plane" | "polygon" | "mesh-ref" | "point-cloud-ref"; ref: string },
): WorkspaceNode {
  return {
    nodeId,
    kind,
    epistemicStatus: "INFERRED",
    properties: [...properties],
    ...(geometry === undefined ? {} : { geometry }),
  };
}

/** Skew-hexagon boundary of the axis-aligned box [min, max] (see header). */
export function skewHexagon(
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): Vec3[] {
  return [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [max[0], max[1], min[2]],
    [max[0], max[1], max[2]],
    [min[0], max[1], max[2]],
    [min[0], min[1], max[2]],
  ];
}

export function roomNodes(): WorkspaceNode[] {
  return [
    node("building-1", "building", []),
    node("storey-1", "storey", []),
    node("space-1", "space", []),
    node("ceiling-1", "element", [prop("semantic.kind", "ceiling")], { kind: "plane", ref: "geo-ceiling-1" }),
    node("column-1", "element", [prop("semantic.kind", "column")], { kind: "mesh-ref", ref: "mesh-column-1" }),
    node("door-1", "opening", [prop("semantic.kind", "door")], { kind: "polygon", ref: "geo-door-1" }),
    node("floor-1", "element", [prop("semantic.kind", "floor")], { kind: "plane", ref: "geo-floor-1" }),
    node("paint-1", "element", [prop("semantic.kind", "paint")]),
    node("railing-1", "element", [prop("semantic.kind", "railing")], { kind: "plane", ref: "geo-railing-1" }),
    node("wall-e", "element", [prop("semantic.kind", "wall"), prop("height", WALL_HEIGHT, "OBSERVED")], {
      kind: "plane",
      ref: "geo-wall-e",
    }),
    node("wall-n", "element", [prop("semantic.kind", "wall"), prop("height", WALL_HEIGHT, "OBSERVED")], {
      kind: "plane",
      ref: "geo-wall-n",
    }),
    node("wall-s", "element", [prop("semantic.kind", "wall"), prop("height", WALL_HEIGHT, "OBSERVED")], {
      kind: "plane",
      ref: "geo-wall-s",
    }),
    node("wall-w", "element", [prop("semantic.kind", "wall"), prop("height", WALL_HEIGHT, "OBSERVED")], {
      kind: "plane",
      ref: "geo-wall-w",
    }),
    node("window-1", "opening", [prop("semantic.kind", "window")], { kind: "polygon", ref: "geo-window-1" }),
  ];
}

export function roomRelationships(): unknown[] {
  return [
    { relationshipId: "rel-bldg-storey", fromNodeId: "building-1", toNodeId: "storey-1", kind: "contains" },
    { relationshipId: "rel-storey-space", fromNodeId: "storey-1", toNodeId: "space-1", kind: "contains" },
    { relationshipId: "rel-space-floor", fromNodeId: "space-1", toNodeId: "floor-1", kind: "contains" },
    { relationshipId: "rel-space-wall-e", fromNodeId: "space-1", toNodeId: "wall-e", kind: "contains" },
    { relationshipId: "rel-space-wall-n", fromNodeId: "space-1", toNodeId: "wall-n", kind: "contains" },
    { relationshipId: "rel-space-wall-s", fromNodeId: "space-1", toNodeId: "wall-s", kind: "contains" },
    { relationshipId: "rel-space-wall-w", fromNodeId: "space-1", toNodeId: "wall-w", kind: "contains" },
    { relationshipId: "rel-door-opens", fromNodeId: "door-1", toNodeId: "space-1", kind: "opens-into" },
  ];
}

export function roomGeometries(): GeometryRecord[] {
  return [
    {
      geometryId: "geo-wall-w",
      kind: "plane",
      plane: { normal: [1, 0, 0], d: 0 },
      offsetSigma: 0.01,
      boundaryPolygon: skewHexagon([-WALL_THICKNESS, -WALL_THICKNESS, 0], [0, 3 + WALL_THICKNESS, WALL_HEIGHT]),
    },
    {
      geometryId: "geo-wall-e",
      kind: "plane",
      plane: { normal: [-1, 0, 0], d: 4.2 },
      offsetSigma: 0.01,
      boundaryPolygon: skewHexagon([4.2, -WALL_THICKNESS, 0], [4.2 + WALL_THICKNESS, 3 + WALL_THICKNESS, WALL_HEIGHT]),
    },
    {
      // No offsetSigma: the producer did not know it — σ stays null.
      geometryId: "geo-wall-s",
      kind: "plane",
      plane: { normal: [0, 1, 0], d: 0 },
      boundaryPolygon: skewHexagon([-WALL_THICKNESS, -WALL_THICKNESS, 0], [4.2 + WALL_THICKNESS, 0, WALL_HEIGHT]),
    },
    {
      geometryId: "geo-wall-n",
      kind: "plane",
      plane: { normal: [0, -1, 0], d: 3 },
      offsetSigma: 0.02,
      boundaryPolygon: skewHexagon([-WALL_THICKNESS, 3, 0], [4.2 + WALL_THICKNESS, 3 + WALL_THICKNESS, WALL_HEIGHT]),
    },
    {
      geometryId: "geo-floor-1",
      kind: "plane",
      plane: { normal: [0, 0, 1], d: 0 },
      offsetSigma: 0.005,
      boundaryPolygon: [
        [0, 0, 0],
        [4.2, 0, 0],
        [4.2, 3, 0],
        [0, 3, 0],
      ],
    },
    {
      // Plane WITHOUT boundary polygon: extent unknown — honestly omitted.
      geometryId: "geo-ceiling-1",
      kind: "plane",
      plane: { normal: [0, 0, -1], d: WALL_HEIGHT },
    },
    {
      geometryId: "geo-door-1",
      kind: "polygon",
      polygon: [
        [0.5, 0, 0],
        [1.5, 0, 0],
        [1.5, 0, 2.1],
        [0.5, 0, 2.1],
      ],
    },
    {
      geometryId: "geo-window-1",
      kind: "polygon",
      polygon: [
        [2.2, 0, 0.9],
        [3.2, 0, 0.9],
        [3.2, 0, 2.1],
        [2.2, 0, 2.1],
      ],
    },
    // NOTE: no geo-railing-1 record — the ref is deliberately unresolved.
  ];
}

export function storeySnapshot(versionId = FIXTURE_VERSION_ID): GraphSnapshot {
  return {
    versionId,
    nodes: roomNodes(),
    relationships: roomRelationships(),
    geometries: roomGeometries(),
  };
}

/* ------------------------------------------------------------------ */
/* Floor-plan drawing (hand-serialized mirror of a 020 output)         */
/* ------------------------------------------------------------------ */

function wallElement(
  nodeId: string,
  rectangle: readonly [number, number, number, number],
  sigma: number | null,
  geometryId: string,
): DrawnElement {
  const [minX, minY, maxX, maxY] = rectangle;
  return {
    elementId: nodeId,
    sourceNodeId: nodeId,
    geometry2d: {
      kind: "polygon",
      points: [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
      ],
    },
    style: { strokeKind: "wall", strokeWeight: 2 },
    uncertainty: { sigma, propagatedFrom: [geometryId] },
  };
}

export function floorPlanDrawing(sourceVersionId = FIXTURE_VERSION_ID): Drawing2D {
  const elements: readonly DrawnElement[] = [
    wallElement("wall-e", [4.2, -WALL_THICKNESS, 4.2 + WALL_THICKNESS, 3 + WALL_THICKNESS], 0.01, "geo-wall-e"),
    wallElement("wall-n", [-WALL_THICKNESS, 3, 4.2 + WALL_THICKNESS, 3 + WALL_THICKNESS], 0.02, "geo-wall-n"),
    wallElement("wall-s", [-WALL_THICKNESS, -WALL_THICKNESS, 4.2 + WALL_THICKNESS, 0], null, "geo-wall-s"),
    wallElement("wall-w", [-WALL_THICKNESS, -WALL_THICKNESS, 0, 3 + WALL_THICKNESS], 0.01, "geo-wall-w"),
    {
      elementId: "floor-1",
      sourceNodeId: "floor-1",
      geometry2d: {
        kind: "polygon",
        points: [
          [0, 0],
          [4.2, 0],
          [4.2, 3],
          [0, 3],
        ],
      },
      style: { strokeKind: "boundary", strokeWeight: 1 },
      uncertainty: { sigma: 0.005, propagatedFrom: ["geo-floor-1"] },
    },
    {
      elementId: "door-1",
      sourceNodeId: "door-1",
      geometry2d: { kind: "point", point: [1, 0], symbol: "door" },
      style: { strokeKind: "opening", strokeWeight: 2 },
    },
    {
      elementId: "window-1",
      sourceNodeId: "window-1",
      geometry2d: { kind: "point", point: [2.7, 0], symbol: "window" },
      style: { strokeKind: "opening", strokeWeight: 2 },
    },
  ];

  const dimensions: readonly Dimension2D[] = [
    {
      dimensionId: "dim:wall-e:wall-w",
      from: [0, -0.6],
      to: [4.2, -0.6],
      value: 4.2,
      unit: "m",
      uncertainty: 0.01,
      sourceNodeIds: ["wall-e", "wall-w"],
    },
    {
      // σ unknown: renders "σ unknown" — never ±0.
      dimensionId: "dim:wall-n:wall-s",
      from: [-0.6, 3],
      to: [-0.6, 0],
      value: 3,
      unit: "m",
      uncertainty: null,
      sourceNodeIds: ["wall-n", "wall-s"],
    },
  ];

  return {
    drawingId: FIXTURE_DRAWING_ID,
    kind: "floor_plan",
    coordinateFrame: { origin: [0, 0], scale: 1, rotationRad: 0 },
    elements,
    dimensions,
    omittedNodes: [
      { nodeId: "ceiling-1", reason: "overhead-not-projected-in-plan" },
      { nodeId: "column-1", reason: "geometry-kind-not-projectable" },
      { nodeId: "railing-1", reason: "geometry-unresolved" },
      { nodeId: "paint-1", reason: "geometry-ref-absent" },
    ],
    sourceVersionId,
    generatedBy: FIXTURE_GENERATOR,
  };
}

/* ------------------------------------------------------------------ */
/* Evidence + review                                                   */
/* ------------------------------------------------------------------ */

export function workspaceEvidence(): EvidenceEntry[] {
  return [
    {
      evidenceId: "ev-001",
      method: "plane-fit/lidar",
      linkedNodeIds: ["wall-e", "wall-w"],
      note: "interior scan, two passes",
    },
    {
      evidenceId: "ev-002",
      method: "manual-tape",
      linkedNodeIds: ["wall-n"],
      note: "measured 3.00 m clear width",
    },
    {
      evidenceId: "ev-003",
      method: "photo",
      linkedNodeIds: ["wall-s"],
      invalidated: true,
      note: "superseded by lidar pass 2",
    },
    {
      evidenceId: "ev-004",
      method: "thermal-imaging",
      linkedNodeIds: ["window-1"],
    },
  ];
}

export function reviewState(status: ReviewState["status"] = "approved"): ReviewState {
  return {
    reviewer: "eng-reviewer@example.org",
    status,
    note: "Geometry matches the field walk on 2026-01-18.",
    at: "2026-01-20T10:00:00.000Z",
  };
}

/* ------------------------------------------------------------------ */
/* Assembled workspace inputs                                          */
/* ------------------------------------------------------------------ */

/** The base workspace input: no selection, no review (presentation-free). */
export function workspaceInput(overrides: Partial<WorkspaceInput> = {}): WorkspaceInput {
  return {
    drawing: floorPlanDrawing(),
    graphSnapshot: storeySnapshot(),
    evidence: workspaceEvidence(),
    ...overrides,
  };
}

/** A workspace input WITH review + a selected wall (the full surface). */
export function reviewedWorkspaceInput(selectedNodeId = "wall-n"): WorkspaceInput {
  return workspaceInput({ selectedNodeId, review: reviewState("approved") });
}

/** Deep-freeze (purity tests: rendering must not mutate the input). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
