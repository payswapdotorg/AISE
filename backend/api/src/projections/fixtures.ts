/**
 * AISE-020 deterministic test fixtures — TEST SUPPORT ONLY, never imported
 * by production modules (mirrors reality/testkit.ts conventions).
 *
 * The synthetic storey: a 4.2 m × 3.0 m interior room, walls 0.3 m thick and
 * 2.7 m high, interior-face planes (normals point INTO the room — the
 * interior-scan convention), a floor, a door + a window on the south wall,
 * plus deliberately un-projectable nodes (mesh-ref column, unresolved
 * railing ref, geometry-less paint, overhead ceiling).
 *
 * Wall boundaries are "skew hexagons" — 6 of the 8 box corners in the order
 * (xmin,ymin,zmin)→(xmax,ymin,zmin)→(xmax,ymax,zmin)→(xmax,ymax,zmax)→
 * (xmin,ymax,zmax)→(xmin,ymin,zmax) — a closed 3D cycle whose x–y, x–z AND
 * y–z projections each trace the full rectangle outline (some edges
 * doubled, none missing), so the SAME boundary serves plan, elevation and
 * section fixtures.
 *
 * All ids/timestamps fixed; no clock, no randomness.
 */

import type { EpistemicStatus } from "@aise/shared-contracts";
import type { Vec3 } from "../geometry";
import type {
  GeometryRef,
  NodeKind,
  PropertyRecord,
  ProvenanceRecord,
  RealityNode,
  Relationship,
} from "../reality";
import type { GeometryRecord, ProjectionInput } from "./index";

export const FIXED_RECORDED_AT = "2026-01-19T09:00:00.000Z";

const UNITS_M: { readonly linear: "m"; readonly angular: "deg" } = { linear: "m", angular: "deg" };

export function fixtureProvenance(): ProvenanceRecord[] {
  return [{ role: "DERIVED_FROM", sourceArtifactId: "fixture-artifact-001", recordedAt: FIXED_RECORDED_AT }];
}

export function fixtureProperty(
  key: string,
  value: string | number | boolean,
  epistemicStatus: EpistemicStatus = "INFERRED",
): PropertyRecord {
  return {
    key,
    value,
    ...(typeof value === "number" ? { unit: "m" } : {}),
    epistemicStatus,
    provenance: fixtureProvenance(),
  };
}

export function fixtureNode(
  nodeId: string,
  kind: NodeKind,
  properties: readonly PropertyRecord[] = [],
  geometry?: GeometryRef,
  units?: { linear: string; angular: string },
): RealityNode {
  return {
    nodeId,
    kind,
    epistemicStatus: "INFERRED",
    properties: [...properties],
    ...(geometry === undefined ? {} : { geometry }),
    ...(units === undefined ? {} : { units }),
    provenance: fixtureProvenance(),
  };
}

export function fixtureRelationship(
  relationshipId: string,
  fromNodeId: string,
  toNodeId: string,
  kind: Relationship["kind"] = "contains",
): Relationship {
  return { relationshipId, fromNodeId, toNodeId, kind, provenance: fixtureProvenance() };
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

/* ------------------------------------------------------------------ */
/* The synthetic storey                                                */
/* ------------------------------------------------------------------ */

const WALL_HEIGHT = 2.7;
const WALL_THICKNESS = 0.3;

export function roomNodes(): RealityNode[] {
  return [
    fixtureNode("building-1", "building", [], undefined, UNITS_M),
    fixtureNode("storey-1", "storey", [], undefined, UNITS_M),
    fixtureNode("space-1", "space", [], undefined, UNITS_M),
    fixtureNode("ceiling-1", "element", [fixtureProperty("semantic.kind", "ceiling")], { kind: "plane", ref: "geo-ceiling-1" }, UNITS_M),
    fixtureNode("column-1", "element", [fixtureProperty("semantic.kind", "column")], { kind: "mesh-ref", ref: "mesh-column-1" }, UNITS_M),
    fixtureNode("door-1", "opening", [fixtureProperty("semantic.kind", "door")], { kind: "polygon", ref: "geo-door-1" }, UNITS_M),
    fixtureNode("floor-1", "element", [fixtureProperty("semantic.kind", "floor")], { kind: "plane", ref: "geo-floor-1" }, UNITS_M),
    fixtureNode("paint-1", "element", [fixtureProperty("semantic.kind", "paint")], undefined, UNITS_M),
    fixtureNode("railing-1", "element", [fixtureProperty("semantic.kind", "railing")], { kind: "plane", ref: "geo-railing-1" }, UNITS_M),
    fixtureNode("wall-e", "element", [fixtureProperty("semantic.kind", "wall")], { kind: "plane", ref: "geo-wall-e" }, UNITS_M),
    fixtureNode("wall-n", "element", [fixtureProperty("semantic.kind", "wall")], { kind: "plane", ref: "geo-wall-n" }, UNITS_M),
    fixtureNode("wall-s", "element", [fixtureProperty("semantic.kind", "wall")], { kind: "plane", ref: "geo-wall-s" }, UNITS_M),
    fixtureNode("wall-w", "element", [fixtureProperty("semantic.kind", "wall")], { kind: "plane", ref: "geo-wall-w" }, UNITS_M),
    fixtureNode("window-1", "opening", [fixtureProperty("semantic.kind", "window")], { kind: "polygon", ref: "geo-window-1" }, UNITS_M),
  ];
}

export function roomRelationships(): Relationship[] {
  return [
    fixtureRelationship("rel-bldg-storey", "building-1", "storey-1"),
    fixtureRelationship("rel-storey-space", "storey-1", "space-1"),
    fixtureRelationship("rel-space-ceiling", "space-1", "ceiling-1"),
    fixtureRelationship("rel-space-column", "space-1", "column-1"),
    fixtureRelationship("rel-space-door", "space-1", "door-1"),
    fixtureRelationship("rel-space-floor", "space-1", "floor-1"),
    fixtureRelationship("rel-space-paint", "space-1", "paint-1"),
    fixtureRelationship("rel-space-railing", "space-1", "railing-1"),
    fixtureRelationship("rel-space-wall-e", "space-1", "wall-e"),
    fixtureRelationship("rel-space-wall-n", "space-1", "wall-n"),
    fixtureRelationship("rel-space-wall-s", "space-1", "wall-s"),
    fixtureRelationship("rel-space-wall-w", "space-1", "wall-w"),
    fixtureRelationship("rel-space-window", "space-1", "window-1"),
    fixtureRelationship("rel-door-opens", "door-1", "space-1", "opens-into"),
  ];
}

export function roomGeometry(): GeometryRecord[] {
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
  ];
}

/** A vNNN-pinned projection input of the synthetic storey. */
export function storeySnapshot(versionId = "v002"): ProjectionInput {
  return {
    versionId,
    nodes: roomNodes(),
    relationships: roomRelationships(),
    geometries: roomGeometry(),
  };
}

/** Deep-freeze (purity assertions must fail on any input mutation). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      for (const item of value) {
        deepFreeze(item);
      }
    } else {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        deepFreeze((value as Record<string, unknown>)[key]);
      }
    }
    Object.freeze(value);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Compositional variant fixtures                                      */
/* ------------------------------------------------------------------ */

/** A wall with a plane but NO boundary polygon (extent unknown). */
export function partitionWallNode(): RealityNode {
  return fixtureNode("wall-c", "element", [fixtureProperty("semantic.kind", "wall")], { kind: "plane", ref: "geo-wall-c" }, UNITS_M);
}

export function partitionWallGeometry(): GeometryRecord {
  return { geometryId: "geo-wall-c", kind: "plane", plane: { normal: [1, 0, 0], d: 2 }, offsetSigma: 0.01 };
}

/** A tilted wall plane (|n̂.z| = 0.447 > WALL_VERTICALITY_MAX). */
export function tiltedWallNode(): RealityNode {
  return fixtureNode("wall-tilt", "element", [fixtureProperty("semantic.kind", "wall")], { kind: "plane", ref: "geo-wall-tilt" }, UNITS_M);
}

export function tiltedWallGeometry(): GeometryRecord {
  return { geometryId: "geo-wall-tilt", kind: "plane", plane: { normal: [1, 0, 0.5], d: 5 } };
}

/** A wall declaring feet (drawings measure in metres only). */
export function feetWallNode(): RealityNode {
  return fixtureNode("partition-ft", "element", [fixtureProperty("semantic.kind", "wall")], { kind: "plane", ref: "geo-partition-ft" }, { linear: "ft", angular: "deg" });
}

export function feetWallGeometry(): GeometryRecord {
  return {
    geometryId: "geo-partition-ft",
    kind: "plane",
    plane: { normal: [1, 0, 0], d: 2 },
    boundaryPolygon: skewHexagon([1.85, -WALL_THICKNESS, 0], [2.15, 3 + WALL_THICKNESS, WALL_HEIGHT]),
  };
}
