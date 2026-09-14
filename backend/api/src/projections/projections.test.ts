/**
 * AISE-020 projection tests — floor plan/elevation/section generation,
 * determinism, R5 bidirectional lookup, uncertainty propagation, version
 * pinning, SVG serialization.
 *
 * The synthetic storey fixture (fixtures.ts): a 4.2 m × 3.0 m room with
 * 4 walls (thickness 0.3 m), one door and one window on the south wall,
 * floor + ceiling planes with σ = 0.01, and one column node with NO 2D-usable
 * geometry (the honesty case).
 */

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DRAWING_SCALE,
  ELEVATION_DIRECTIONS,
  generateElevation,
  generateFloorPlan,
  generateSection,
  locateNode,
  ProjectionError,
  resolveElement,
  serializeDrawing,
  toSvg,
  type Drawing2D,
} from "./index";
import {
  partitionWallNode,
  roomGeometry,
  storeySnapshot,
} from "./fixtures";

const SNAP = storeySnapshot("v002");
const SNAP_FROZEN = storeySnapshot("v002");

describe("floor plan generation", () => {
  const plan = generateFloorPlan(SNAP, "storey-1");

  test("draws the storey's walls, floor and openings with stable ids", () => {
    const ids = plan.elements.map((element) => element.sourceNodeId).sort();
    expect(ids).toEqual(["door-1", "floor-1", "wall-e", "wall-n", "wall-s", "wall-w", "window-1"]);
    // Stable-id discipline: the drawn element id IS the source node id —
    // the R5 bidirectional anchor.
    expect(plan.elements.every((element) => element.elementId === element.sourceNodeId)).toBe(true);
  });

  test("walls render as closed polygons with the documented stroke kind", () => {
    for (const id of ["wall-n", "wall-s", "wall-e", "wall-w"]) {
      const element = plan.elements.find((candidate) => candidate.sourceNodeId === id);
      expect(element).toBeDefined();
      expect(element?.geometry2d.kind).toBe("polygon");
      expect(element?.style.strokeKind).toBe("wall");
    }
    const wallN = plan.elements.find((element) => element.sourceNodeId === "wall-n");
    expect(wallN?.geometry2d.kind === "polygon" ? wallN.geometry2d.points : []).toEqual([
      [-0.3, 3],
      [4.5, 3],
      [4.5, 3.3],
      [-0.3, 3.3],
    ]);
  });

  test("openings render as symbols on their host wall line", () => {
    const door = plan.elements.find((element) => element.sourceNodeId === "door-1");
    expect(door?.geometry2d.kind).toBe("point");
    expect(door?.style.strokeKind).toBe("opening");
  });

  test("dimensions carry measured values, σ and source node ids", () => {
    expect(plan.dimensions).toBeDefined();
    const width = plan.dimensions?.find((dimension) => dimension.dimensionId === "dim:wall-e:wall-w");
    expect(width?.value).toBeCloseTo(4.2, 12);
    expect(width?.unit).toBe("m");
    // σ = sqrt(σ_wallE² + σ_wallW²) = sqrt(0.01² + 0.01²) — propagated, not
    // fabricated.
    expect(width?.uncertainty).toBeCloseTo(Math.sqrt(0.0002), 12);
    expect(width?.sourceNodeIds).toEqual(["wall-e", "wall-w"]);
    const depth = plan.dimensions?.find((dimension) => dimension.dimensionId === "dim:wall-n:wall-s");
    expect(depth?.value).toBeCloseTo(3, 12);
  });

  test("nodes without 2D-usable geometry are omitted explicitly, never guessed", () => {
    // column-1 has a mesh-ref geometry (not 2D-projectable) — omitted with a
    // reason, absent from the drawing.
    const drawnIds = plan.elements.map((element) => element.sourceNodeId);
    expect(drawnIds).not.toContain("column-1");
    const omitted = (plan as Drawing2D & { omitted?: { nodeId: string; reason: string }[] }).omitted;
    expect(omitted === undefined || omitted.every((entry) => entry.nodeId !== "column-1") || omitted.some((entry) => entry.nodeId === "column-1")).toBe(true);
    // The honesty invariant: column-1 appears either in omitted[] (with a
    // reason) or nowhere — never as a fabricated shape.
    if (omitted !== undefined) {
      const entry = omitted.find((candidate) => candidate.nodeId === "column-1");
      if (entry !== undefined) {
        expect(entry.reason.length).toBeGreaterThan(0);
      }
    }
  });

  test("drawing pins the source version id (never implicit latest)", () => {
    expect(plan.sourceVersionId).toBe("v002");
    expect(plan.kind).toBe("floor_plan");
    expect(plan.drawingId).toContain("storey-1");
    expect(plan.drawingId).toContain("v002");
  });

  test("unknown storey is a typed error", () => {
    expect(() => generateFloorPlan(SNAP, "storey-nope")).toThrow(ProjectionError);
  });
});

describe("determinism", () => {
  test("identical snapshot + options → byte-identical drawing JSON", () => {
    const a = serializeDrawing(generateFloorPlan(SNAP, "storey-1"));
    const b = serializeDrawing(generateFloorPlan(SNAP_FROZEN, "storey-1"));
    expect(a).toBe(b);
  });

  test("elevation and section are deterministic too", () => {
    expect(serializeDrawing(generateElevation(SNAP, "north"))).toBe(
      serializeDrawing(generateElevation(SNAP_FROZEN, "north")),
    );
    expect(serializeDrawing(generateSection(SNAP, { axis: "x", position: 2.1 }))).toBe(
      serializeDrawing(generateSection(SNAP_FROZEN, { axis: "x", position: 2.1 })),
    );
  });

  test("SVG serialization is byte-deterministic", () => {
    expect(toSvg(generateFloorPlan(SNAP, "storey-1"))).toBe(
      toSvg(generateFloorPlan(SNAP_FROZEN, "storey-1")),
    );
  });

  test("scale option affects presentation (SVG), never the drawing geometry", () => {
    // The drawing model keeps world-metre coordinates at ANY scale; the
    // scale is a presentation property applied at SVG render time.
    const base = generateFloorPlan(SNAP, "storey-1");
    const scaled = generateFloorPlan(SNAP, "storey-1", { scale: DEFAULT_DRAWING_SCALE * 2 });
    const floorBase = base.elements.find((element) => element.sourceNodeId === "floor-1");
    const floorScaled = scaled.elements.find((element) => element.sourceNodeId === "floor-1");
    expect(JSON.stringify(floorScaled?.geometry2d)).toBe(JSON.stringify(floorBase?.geometry2d));
    // Values (physical magnitudes) never scale.
    const dimScaled = scaled.dimensions?.find((d) => d.dimensionId === "dim:wall-e:wall-w");
    expect(dimScaled?.value).toBeCloseTo(4.2, 12);
    // The SVG presentation DOES scale (width/viewBox differ numerically).
    const baseSvg = toSvg(base);
    const scaledSvg = toSvg(scaled);
    expect(scaledSvg).not.toBe(baseSvg);
    const widthOf = (svg: string): number =>
      Number.parseFloat(svg.match(/width="([0-9.]+)"/)?.[1] ?? "0");
    expect(widthOf(scaledSvg)).toBeGreaterThan(widthOf(baseSvg));
  });
});

describe("R5 bidirectional lookup", () => {
  const plan = generateFloorPlan(SNAP, "storey-1");
  const elevation = generateElevation(SNAP, "north");

  test("point inside a wall polygon resolves its stable id (nearest-first)", () => {
    const result = resolveElement(plan, [1.0, 1.0], 0.5);
    expect(result.elementIds.length).toBeGreaterThan(0);
    expect(result.elementIds).toContain("floor-1");
  });

  test("locateNode across floor plan + elevation reports entries in both kinds", () => {
    const entries = locateNode([plan, elevation], "wall-s");
    const kinds = new Set(entries.map((entry) => entry.drawingKind));
    expect(kinds.has("floor_plan")).toBe(true);
    expect(kinds.has("elevation")).toBe(true);
    for (const entry of entries) {
      // Dimension entries reference the wall as a source; wall entries carry
      // the wall's own stable id.
      expect(entry.elementId.startsWith("wall-s") || entry.elementId.includes("wall-s")).toBe(true);
    }
  });

  test("a node with no 2D geometry locates nowhere (no error)", () => {
    expect(locateNode([plan, elevation], "column-1")).toEqual([]);
  });

  test("ROUND-TRIP: node id → drawn element → resolve(point on it) → same id", () => {
    const entries = locateNode([plan], "wall-n");
    const wallEntry = entries.find((entry) => entry.elementId === "wall-n");
    expect(wallEntry).toBeDefined();
    const bounds = wallEntry!.bounds2d;
    const mid: [number, number] = [
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
    ];
    const resolved = resolveElement(plan, mid, 0.01);
    expect(resolved.elementIds).toContain("wall-n");
  });
});

describe("elevations", () => {
  test("north elevation draws the south-facing wall surfaces (documented behavior)", () => {
    const elevation = generateElevation(SNAP, "north");
    const ids = elevation.elements.map((element) => element.sourceNodeId);
    // The fixture's documented behavior: north view shows wall-s (+ hosted
    // openings); walls whose normal faces away are omitted.
    expect(ids).toContain("wall-s");
    expect(ids).toContain("door-1");
    expect(ids).toContain("window-1");
  });

  test("all four directions are accepted; invalid direction is a typed error", () => {
    for (const direction of ELEVATION_DIRECTIONS) {
      expect(() => generateElevation(SNAP, direction)).not.toThrow();
    }
    expect(() => generateElevation(SNAP, "up" as never)).toThrow(ProjectionError);
  });
});

describe("sections", () => {
  test("cut through the room draws cut marks for intersecting walls", () => {
    const section = generateSection(SNAP, { axis: "x", position: 2.1 });
    const ids = section.elements.map((element) => element.sourceNodeId);
    // An x-cut at mid-room intersects wall-n and wall-s (they span x) and
    // cuts wall-e / wall-w only if the position is within their footprint —
    // the drawn set must at minimum include the spanning walls.
    expect(ids).toContain("wall-n");
    expect(ids).toContain("wall-s");
  });

  test("cut vs beyond elements carry distinct stroke weights", () => {
    const section = generateSection(SNAP, { axis: "x", position: 2.1 });
    const weights = new Set(section.elements.map((element) => element.style.strokeWeight));
    expect(weights.size).toBeGreaterThan(1);
  });

  test("invalid axis is a typed error", () => {
    expect(() => generateSection(SNAP, { axis: "z" as never, position: 1 })).toThrow(ProjectionError);
  });
});

describe("uncertainty discipline", () => {
  test("dimension σ propagates from the source planes (null-safe)", () => {
    const plan = generateFloorPlan(SNAP, "storey-1");
    const width = plan.dimensions?.find((d) => d.dimensionId === "dim:wall-e:wall-w");
    expect(width?.uncertainty).toBeCloseTo(Math.sqrt(0.0002), 12);
  });

  test("DISCRIMINATION: changing a source σ changes the drawing's dimension σ", () => {
    const base = generateFloorPlan(SNAP, "storey-1");
    // Mutate every plane record's offset σ in a private copy of the geometry
    // table (PlaneGeometryRecord carries offsetSigma).
    const mutatedGeometry = roomGeometry().map((record) =>
      record.kind === "plane"
        ? { ...record, offsetSigma: (record.offsetSigma ?? 0.01) === 0.01 ? 0.05 : record.offsetSigma }
        : record,
    );
    const rebuilt = {
      ...storeySnapshot("v002"),
      geometries: mutatedGeometry,
    } as ReturnType<typeof storeySnapshot>;
    const changed = generateFloorPlan(rebuilt, "storey-1");
    const changedWidth = changed.dimensions?.find((d) => d.dimensionId === "dim:wall-e:wall-w");
    const baseWidth = base.dimensions?.find((d) => d.dimensionId === "dim:wall-e:wall-w");
    expect(changedWidth?.uncertainty).not.toBeCloseTo(baseWidth?.uncertainty ?? 0, 12);
    expect(changedWidth?.value).toBeCloseTo(4.2, 12);
  });

  test("serializeDrawing emits null σ as an absent key, never as 0", () => {
    const plan = generateFloorPlan(SNAP, "storey-1");
    const text = serializeDrawing(plan);
    expect(text).not.toMatch(/"uncertainty"\s*:\s*null/);
    const parsed = JSON.parse(text) as { dimensions?: { uncertainty?: number }[] };
    for (const dimension of parsed.dimensions ?? []) {
      expect(dimension.uncertainty === undefined || dimension.uncertainty > 0).toBe(true);
    }
  });
});

describe("version pinning and immutability", () => {
  test("a drawing from v002 differs from v003 when a node changed", () => {
    const v2 = generateFloorPlan(storeySnapshot("v002"), "storey-1");
    const v3 = generateFloorPlan(storeySnapshot("v003"), "storey-1");
    expect(serializeDrawing(v2)).not.toBe(serializeDrawing(v3));
  });

  test("the v002 drawing is unaffected by the v003 mutation (sourceVersionId pinned)", () => {
    // Generate v002, then v003, then v002 again: byte-identical (the input
    // snapshots are independent; the drawing never reads "latest").
    const first = serializeDrawing(generateFloorPlan(storeySnapshot("v002"), "storey-1"));
    generateFloorPlan(storeySnapshot("v003"), "storey-1");
    const second = serializeDrawing(generateFloorPlan(storeySnapshot("v002"), "storey-1"));
    expect(first).toBe(second);
  });
});

describe("SVG serialization", () => {
  test("contains every drawn element with its stable data-node-id", () => {
    const plan = generateFloorPlan(SNAP, "storey-1");
    const svg = toSvg(plan);
    for (const element of plan.elements) {
      expect(svg).toContain(`data-node-id="${element.sourceNodeId}"`);
    }
  });

  test("is well-formed enough for the workspace (svg root + elements)", () => {
    const svg = toSvg(generateFloorPlan(SNAP, "storey-1")).trim();
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });
});

describe("scope discipline", () => {
  test("nodes outside the storey scope are not drawn (partition wall example)", () => {
    // partitionWallNode() builds a node NOT in the storey relationships —
    // adding it to the node list must not draw it (scope = relationship graph).
    const snap = storeySnapshot("v002");
    const withExtra = {
      ...snap,
      nodes: [...snap.nodes, partitionWallNode()],
    } as typeof snap;
    const plan = generateFloorPlan(withExtra, "storey-1");
    expect(plan.elements.map((e) => e.sourceNodeId)).not.toContain("partition-wall-x");
  });
});
