/**
 * CRITICAL golden projection test (AISE-017, HIGH_ASSURANCE).
 *
 * The full deterministic composition the web workspace composes:
 * golden capture points → AISE-010 extraction → AISE-011
 * ingestion → AISE-017 projection. Every number pinned here is
 * the output of the REAL chain (no mocks, no shortcuts) — the
 * same discipline the backend golden suites pin.
 *
 * Pins (REQ-010 acceptance over the canonical golden room):
 * - AC-090: walls/doors/windows project as vector SEGMENTS,
 *   floor/ceiling as closed vector POLYGONS (plan); the facing
 *   walls project as full POLYGONS in elevation;
 * - AC-091: the door/window sub-segments land inside their
 *   parent wall runs, and dimensions are the canonical
 *   quantities (0.9 m-class door width, 1.2 m-class window
 *   width, 2.7 m room height quantities — never recomputed);
 * - AC-092: the document is structured vector data (points,
 *   segments, polygons — never a raster);
 * - determinism: byte-stable documents across repeated
 *   projections of the same graph.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import {
  exactRoomPoints,
  noisyRoomPoints,
} from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import { project2d } from "./project.js";

const TARGET = { modelId: "model-golden", projectId: "project-golden", spaceId: "room-golden" };

/** The canonical golden v1 graph (the ingestion chain, exactly as the web store seeds it). */
function goldenGraph() {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  return { scene, ...ingestArchitecturalScene(scene, TARGET) };
}

describe("golden room plan projection (real chain)", () => {
  const { scene, graph } = goldenGraph();
  const plan = project2d(graph, { kind: "plan" });

  it("projects all eight objects: 2 polygons (floor/ceiling) + 6 segments (4 walls + door + window)", () => {
    expect(plan.counts.objects).toBe(8);
    expect(plan.counts.projected).toBe(8);
    expect(plan.counts.unprojected).toBe(0);
    expect(plan.counts.polygons).toBe(2);
    expect(plan.counts.segments).toBe(6);
  });

  it("projects the floor to the golden room footprint polygon (canonical corner order)", () => {
    const floor = plan.primitives.find(
      (primitive) => primitive.source.objectClass === "FLOOR",
    )!;
    expect(floor.kind).toBe("polygon");
    if (floor.kind !== "polygon") {
      throw new Error("unreachable");
    }
    expect(floor.points).toHaveLength(4);
    // 4 × 3 m room footprint; extraction float noise tolerated at 1e-6.
    expect(floor.points[0]![0]).toBeCloseTo(0, 6);
    expect(floor.points[0]![1]).toBeCloseTo(0, 6);
    expect(floor.points[1]![0]).toBeCloseTo(4, 6);
    expect(floor.points[1]![1]).toBeCloseTo(0, 6);
    expect(floor.points[2]![0]).toBeCloseTo(4, 6);
    expect(floor.points[2]![1]).toBeCloseTo(3, 6);
    expect(floor.points[3]![0]).toBeCloseTo(0, 6);
    expect(floor.points[3]![1]).toBeCloseTo(3, 6);
    // AC-091: the polygon's dimensions are the canonical quantities.
    expect(floor.dimensions.length!.value).toBeCloseTo(4, 6);
    expect(floor.dimensions.length!.unit).toBe("meter");
    expect(floor.dimensions.height!.value).toBeCloseTo(3, 6);
    expect(floor.dimensions.area!.value).toBeCloseTo(12, 4);
    expect(floor.dimensions.elevation!.value).toBeCloseTo(0, 6);
  });

  it("projects the four walls to run segments on the room boundary lines (x=0, x=4, y=0, y=3)", () => {
    const wallSegments = plan.primitives.filter(
      (primitive) => primitive.source.objectClass === "WALL",
    );
    expect(wallSegments).toHaveLength(4);
    for (const primitive of wallSegments) {
      expect(primitive.kind).toBe("segment");
    }
    const lines = wallSegments.map((primitive) => {
      if (primitive.kind !== "segment") {
        throw new Error("unreachable");
      }
      return { x1: primitive.start[0], y1: primitive.start[1], x2: primitive.end[0], y2: primitive.end[1] };
    });
    // Two vertical runs (x≈0 and x≈4 spanning y), two horizontal runs (y≈0 and y≈3 spanning x).
    const verticalRuns = lines.filter((line) => Math.abs(line.x1 - line.x2) < 1e-6);
    const horizontalRuns = lines.filter((line) => Math.abs(line.y1 - line.y2) < 1e-6);
    expect(verticalRuns).toHaveLength(2);
    expect(horizontalRuns).toHaveLength(2);
    const xs = verticalRuns.map((line) => line.x1).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0, 4);
    expect(xs[1]).toBeCloseTo(4, 4);
    const ys = horizontalRuns.map((line) => line.y1).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(0, 4);
    expect(ys[1]).toBeCloseTo(3, 4);
    for (const run of verticalRuns) {
      expect(Math.abs(run.y2 - run.y1)).toBeGreaterThan(2.5);
    }
    for (const run of horizontalRuns) {
      expect(Math.abs(run.x2 - run.x1)).toBeGreaterThan(3.5);
    }
  });

  it("projects the door as a sub-segment of the y=0 wall run with its canonical width quantity", () => {
    const door = plan.primitives.find(
      (primitive) => primitive.source.objectClass === "DOOR",
    )!;
    expect(door.kind).toBe("segment");
    if (door.kind !== "segment") {
      throw new Error("unreachable");
    }
    // The door sits on the y≈0 wall, spanning x ≈ [1.5, 2.35] (the extracted
    // opening gap — 0.85 m wide, the honest extracted width, not the 0.9 m
    // ground-truth nominal: AC-091 ties dimensions to the MODEL, not to truth).
    expect(door.start[1]).toBeCloseTo(0, 4);
    expect(door.end[1]).toBeCloseTo(0, 4);
    const minX = Math.min(door.start[0], door.end[0]);
    const maxX = Math.max(door.start[0], door.end[0]);
    expect(minX).toBeCloseTo(1.5, 4);
    expect(maxX).toBeCloseTo(2.35, 4);
    // AC-091: dimension is the canonical width quantity, not a coordinate recomputation.
    expect(door.dimensions.length!.value).toBeCloseTo(0.85, 4);
    expect(door.dimensions.length!.unit).toBe("meter");
    expect(door.dimensions.length!.si).toBeCloseTo(0.85, 6);
    expect(door.dimensions.height!.value).toBeCloseTo(2, 4);
    expect(door.dimensions.head!.value).toBeCloseTo(2, 4);
  });

  it("projects the window as a sub-segment of the x=4 wall run with sill/head quantities", () => {
    const window = plan.primitives.find(
      (primitive) => primitive.source.objectClass === "WINDOW",
    )!;
    expect(window.kind).toBe("segment");
    if (window.kind !== "segment") {
      throw new Error("unreachable");
    }
    expect(window.start[0]).toBeCloseTo(4, 4);
    expect(window.end[0]).toBeCloseTo(4, 4);
    const minY = Math.min(window.start[1], window.end[1]);
    const maxY = Math.max(window.start[1], window.end[1]);
    expect(minY).toBeCloseTo(0.95, 4);
    expect(maxY).toBeCloseTo(2.05, 4);
    expect(window.dimensions.length!.value).toBeCloseTo(1.1, 4);
    expect(window.dimensions.sill!.value).toBeCloseTo(0.9, 4);
    expect(window.dimensions.head!.value).toBeCloseTo(2, 4);
  });

  it("carries INFERRED epistemic passthrough for every v1 primitive (no upgrades)", () => {
    for (const primitive of plan.primitives) {
      expect(primitive.source.epistemic).toBe("INFERRED");
    }
  });

  it("traces every primitive to its model object identity and content hash", () => {
    for (const primitive of plan.primitives) {
      const source = graph.objects.find(
        (object) => object.objectId === primitive.source.objectId,
      );
      expect(source).toBeDefined();
      expect(primitive.source.contentHash).toBe(source!.contentHash);
    }
  });

  it("carries the scene provenance pin on primitives (content-pinned input chain)", () => {
    const scenePins = plan.primitives.filter((input) =>
      input.source.provenance.inputs.some((ref) => ref.kind === "scene"),
    );
    expect(scenePins.length).toBe(8);
    const sceneRef = scenePins[0]!.source.provenance.inputs.find((ref) => ref.kind === "scene")!;
    expect(sceneRef.id).toBe(scene.sceneId);
    expect(sceneRef.contentHash).toBe(scene.contentHash);
  });

  it("anchors the document to the graph digest and the declared frame unit", () => {
    expect(plan.graphDigest).toBe(graph.digest);
    expect(plan.unit).toBe("meter");
    expect(plan.view.kind).toBe("plan");
    expect(plan.view.basis.e1).toEqual({ x: 1, y: 0, z: 0 });
    expect(plan.view.basis.e2).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("is byte-stable across repeated projections (determinism of the whole chain)", () => {
    const second = project2d(graph, { kind: "plan" });
    expect(JSON.stringify(second)).toBe(JSON.stringify(plan));
  });
});

describe("golden room elevation projection (real chain)", () => {
  const { graph } = goldenGraph();

  it("projects the y-facing elevation: 3 polygons (y-walls + door) + 5 segments", () => {
    const elevation = project2d(graph, { kind: "elevation", viewDirection: { x: 0, y: 1, z: 0 } });
    expect(elevation.view.kind).toBe("elevation");
    expect(elevation.view.basis.e1).toEqual({ x: 1, y: 0, z: 0 });
    expect(elevation.view.basis.e2).toEqual({ x: 0, y: 0, z: 1 });
    expect(elevation.counts.objects).toBe(8);
    expect(elevation.counts.unprojected).toBe(0);
    expect(elevation.counts.polygons).toBe(3);
    expect(elevation.counts.segments).toBe(5);
    // The door faces the viewer head-on: a full polygon, 0.85 m wide class, floor-contacting.
    const door = elevation.primitives.find(
      (primitive) => primitive.source.objectClass === "DOOR",
    )!;
    expect(door.kind).toBe("polygon");
    // Floor and ceiling collapse to segments at z ≈ 0 and z ≈ 2.7.
    const floor = elevation.primitives.find(
      (primitive) => primitive.source.objectClass === "FLOOR",
    )!;
    expect(floor.kind).toBe("segment");
    if (floor.kind !== "segment") {
      throw new Error("unreachable");
    }
    expect(floor.start[1]).toBeCloseTo(0, 4);
    expect(floor.end[1]).toBeCloseTo(0, 4);
  });

  it("projects the x-facing elevation: 3 polygons (x-walls + window) + 5 segments", () => {
    const elevation = project2d(graph, { kind: "elevation", viewDirection: { x: 1, y: 0, z: 0 } });
    expect(elevation.counts.polygons).toBe(3);
    expect(elevation.counts.segments).toBe(5);
    // The window faces the viewer head-on: a full polygon with sill/head in the image.
    const window = elevation.primitives.find(
      (primitive) => primitive.source.objectClass === "WINDOW",
    )!;
    expect(window.kind).toBe("polygon");
    expect(window.dimensions.sill!.value).toBeCloseTo(0.9, 4);
  });

  it("is deterministic for elevations too (byte-stable)", () => {
    const first = project2d(graph, { kind: "elevation", viewDirection: { x: 0, y: 1, z: 0 } });
    const second = project2d(graph, { kind: "elevation", viewDirection: { x: 0, y: 1, z: 0 } });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe("projection stability across extraction noise (structural, not numeric)", () => {
  it("keeps the same primitive structure for the noisy golden room", () => {
    const scene = extractArchitecturalScene({ points: noisyRoomPoints(), unit: "meter" });
    const { graph } = ingestArchitecturalScene(scene, TARGET);
    const plan = project2d(graph, { kind: "plan" });
    // The extraction acceptance guarantees the same object counts;
    // the projection preserves that structure (2 polygons + 6 segments).
    expect(plan.counts.objects).toBe(8);
    expect(plan.counts.unprojected).toBe(0);
    expect(plan.counts.polygons).toBe(2);
    expect(plan.counts.segments).toBe(6);
    // And remains byte-stable for the same noisy input.
    const again = project2d(graph, { kind: "plan" });
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
  });
});
