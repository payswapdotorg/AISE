/**
 * Unit tests for the deterministic 2D projection core (AISE-017).
 *
 * Coverage discipline (HIGH_ASSURANCE): every acceptance clause
 * of the work order has a pinned test — deterministic geometry
 * projection (exact projected coordinates), measurement/unit
 * fidelity (canonical quantities verbatim + exact SI), and
 * traceable source IDs (object identity, content hash,
 * provenance chain) — plus the fail-closed request validation
 * and the honest unprojected/limitation reporting.
 */
import { describe, expect, it } from "vitest";
import {
  assembleModelGraph,
  makeRealityObject,
  modelProvenance,
  type RealityModelGraph,
  type StructuredPlanarGeometryInput,
  type RealityObjectInput,
} from "@aise/engineering-model";
import { project2d, PLAN_2D_LIMITATIONS } from "./project.js";
import { toExport2dError } from "./errors.js";

// --- deterministic graph fixtures ---------------------------------------------

/** A valid 64-hex content hash for test provenance pins. */
function hashOf(seed: string): string {
  return seed.padEnd(64, "0").slice(0, 64).replace(/[^0-9a-f]/g, "1");
}

/** Builds a rectangle's corners/center exactly from the frame + bounds. */
function rectangleOf(
  frame: { planePoint: { x: number; y: number; z: number }; axisU: { x: number; y: number; z: number }; axisV: { x: number; y: number; z: number } },
  bounds: { uMin: number; uMax: number; vMin: number; vMax: number },
): { center: { x: number; y: number; z: number }; corners: { x: number; y: number; z: number }[] } {
  const at = (u: number, v: number) => ({
    x: frame.planePoint.x + frame.axisU.x * u + frame.axisV.x * v,
    y: frame.planePoint.y + frame.axisU.y * u + frame.axisV.y * v,
    z: frame.planePoint.z + frame.axisU.z * u + frame.axisV.z * v,
  });
  const { uMin, uMax, vMin, vMax } = bounds;
  return {
    center: at((uMin + uMax) / 2, (vMin + vMax) / 2),
    corners: [at(uMin, vMin), at(uMax, vMin), at(uMax, vMax), at(uMin, vMax)],
  };
}

/** A floor: horizontal rectangle 4 × 3 m at z = 0 (the golden footprint). */
function floorGeometry(): StructuredPlanarGeometryInput {
  const frame = {
    planePoint: { x: 2, y: 1.5, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    axisU: { x: 1, y: 0, z: 0 },
    axisV: { x: 0, y: 1, z: 0 },
  };
  return {
    shape: "planar-rectangle",
    frame,
    rectangle: { uMin: -2, uMax: 2, vMin: -1.5, vMax: 1.5, ...rectangleOf(frame, { uMin: -2, uMax: 2, vMin: -1.5, vMax: 1.5 }) },
    width: { value: 4, unit: "meter" },
    height: { value: 3, unit: "meter" },
    area: { value: 12, unit: "square_meter" },
    elevation: { value: 0, unit: "meter" },
    quality: { pointCount: 4000, residualRms: 0.004, residualMaxAbs: 0.012 },
  };
}

/** A wall: vertical rectangle 3 × 2.7 m on the x = 0 plane. */
function wallGeometry(): StructuredPlanarGeometryInput {
  const frame = {
    planePoint: { x: 0, y: 1.5, z: 1.35 },
    normal: { x: 1, y: 0, z: 0 },
    axisU: { x: 0, y: 1, z: 0 },
    axisV: { x: 0, y: 0, z: 1 },
  };
  return {
    shape: "planar-rectangle",
    frame,
    rectangle: { uMin: -1.5, uMax: 1.5, vMin: -1.35, vMax: 1.35, ...rectangleOf(frame, { uMin: -1.5, uMax: 1.5, vMin: -1.35, vMax: 1.35 }) },
    width: { value: 3, unit: "meter" },
    height: { value: 2.7, unit: "meter" },
    area: { value: 8.1, unit: "square_meter" },
    quality: { pointCount: 3000, residualRms: 0.006, residualMaxAbs: 0.02 },
  };
}

/** A door: vertical rectangle 0.9 × 2.1 m on the x = 0 plane. */
function doorGeometry(): StructuredPlanarGeometryInput {
  const frame = {
    planePoint: { x: 0, y: 2, z: 1.05 },
    normal: { x: 1, y: 0, z: 0 },
    axisU: { x: 0, y: 1, z: 0 },
    axisV: { x: 0, y: 0, z: 1 },
  };
  return {
    shape: "planar-rectangle",
    frame,
    rectangle: { uMin: -0.45, uMax: 0.45, vMin: -1.05, vMax: 1.05, ...rectangleOf(frame, { uMin: -0.45, uMax: 0.45, vMin: -1.05, vMax: 1.05 }) },
    width: { value: 0.9, unit: "meter" },
    height: { value: 2.1, unit: "meter" },
    area: { value: 1.89, unit: "square_meter" },
    headHeight: { value: 2.1, unit: "meter" },
    quality: { pointCount: 500, residualRms: 0.01, residualMaxAbs: 0.03 },
  };
}

/** An oblique plane: normal tilted off every axis (neither parallel nor perpendicular to plan/elevation views). */
function obliqueGeometry(): StructuredPlanarGeometryInput {
  const s = Math.sqrt(1 / 3);
  const t = Math.sqrt(1 / 2);
  const r = Math.sqrt(1 / 6);
  const frame = {
    planePoint: { x: 0, y: 0, z: 0 },
    normal: { x: s, y: s, z: s },
    axisU: { x: t, y: -t, z: 0 },
    axisV: { x: r, y: r, z: -2 * r },
  };
  return {
    shape: "planar-rectangle",
    frame,
    rectangle: { uMin: -1, uMax: 1, vMin: -1, vMax: 1, ...rectangleOf(frame, { uMin: -1, uMax: 1, vMin: -1, vMax: 1 }) },
    width: { value: 2, unit: "meter" },
    height: { value: 2, unit: "meter" },
    area: { value: 4, unit: "square_meter" },
    quality: { pointCount: 100, residualRms: 0.01, residualMaxAbs: 0.03 },
  };
}

/** A provenance pin unique per seed (deterministic identities; upstream object first — the model contract). */
function provenanceOf(seed: string): ReturnType<typeof modelProvenance> {
  return modelProvenance("test/unit-2d", { fixture: seed }, [
    {
      kind: "object",
      serviceId: "test.semantics",
      method: "test/extraction",
      objectId: `obj-${seed}`,
      contentHash: hashOf(seed),
      epistemic: "INFERRED",
    },
  ]);
}

interface FixtureObject {
  readonly objectClass: RealityObjectInput["objectClass"];
  readonly seed: string;
  readonly geometry?: StructuredPlanarGeometryInput;
  readonly assetOnly?: boolean;
  readonly epistemic?: RealityObjectInput["epistemicState"];
}

const MODEL_ID = "model-unit-2d";
const SPACE_ID = "room-unit-2d";

/**
 * Unit-fixture graph: every object is CONTAINED by the room (the
 * referential-integrity contract); doors/windows get an
 * OPENING_IN parent wall (auto-appended when the fixture list has
 * none — graph validity only); the projection itself reads only
 * objects + frame, never the relationships.
 */
function simpleGraph(
  requested: readonly FixtureObject[],
  frame: { up: { x: number; y: number; z: number }; unit: "meter" } = {
    up: { x: 0, y: 0, z: 1 },
    unit: "meter",
  },
): RealityModelGraph {
  const objects = [...requested];
  const needsWall = requested.some(
    (fixture) => fixture.objectClass === "DOOR" || fixture.objectClass === "WINDOW",
  );
  const hasWall = requested.some((fixture) => fixture.objectClass === "WALL");
  if (needsWall && !hasWall) {
    objects.push({ objectClass: "WALL", seed: "parent-wall", geometry: wallGeometry() });
  }
  const inputs = objects.map((fixture) => ({
    objectClass: fixture.objectClass,
    ...(fixture.geometry !== undefined ? { structuredGeometry: fixture.geometry } : {}),
    ...(fixture.assetOnly === true
      ? {
          assetRefs: [
            {
              kind: "point-cloud" as const,
              contentHash: hashOf(`asset-${fixture.seed}`),
              pointCount: 50,
              epistemic: "INFERRED" as const,
            },
          ],
        }
      : {}),
    epistemicState: fixture.epistemic ?? "INFERRED",
    provenance: provenanceOf(fixture.seed),
  }));
  // Object identities are content-derived; build first, then bind containment.
  const built = inputs.map((input) => makeRealityObject(MODEL_ID, input));
  const firstWallId = built.find((object, index) => objects[index]!.objectClass === "WALL")?.objectId;
  // Every object is contained by the room; openings additionally hang off
  // the first wall fixture (the model contract: every opening has an
  // OPENING_IN parent wall). The projection itself never reads
  // relationships — this is graph validity only.
  const relationships = built.flatMap((object, index) => {
    const containment = { type: "CONTAINS" as const, fromId: SPACE_ID, toId: object.objectId };
    const isOpening = objects[index]!.objectClass === "DOOR" || objects[index]!.objectClass === "WINDOW";
    return isOpening
      ? [containment, { type: "OPENING_IN" as const, fromId: object.objectId, toId: firstWallId! }]
      : [containment];
  });
  return assembleModelGraph({
    modelId: MODEL_ID,
    projectId: "project-unit-2d",
    spaces: [{ spaceId: SPACE_ID, kind: "ROOM", frame }],
    objects: inputs,
    relationships,
  });
}

// --- view bases ----------------------------------------------------------------

describe("view basis derivation", () => {
  it("derives the plan basis from the declared up axis (X right, Y up, viewer above)", () => {
    const graph = simpleGraph([{ objectClass: "FLOOR", seed: "a", geometry: floorGeometry() }]);
    const document = project2d(graph, { kind: "plan" });
    expect(document.view.kind).toBe("plan");
    expect(document.view.viewAxis).toEqual({ x: 0, y: 0, z: -1 });
    expect(document.view.basis.e1).toEqual({ x: 1, y: 0, z: 0 });
    expect(document.view.basis.e2).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("derives the elevation basis from the view direction (image-right = d × up, image-up = up)", () => {
    const graph = simpleGraph([{ objectClass: "WALL", seed: "a", geometry: wallGeometry() }]);
    const document = project2d(graph, { kind: "elevation", viewDirection: { x: 0, y: 1, z: 0 } });
    expect(document.view.kind).toBe("elevation");
    expect(document.view.viewAxis).toEqual({ x: 0, y: 1, z: 0 });
    expect(document.view.basis.e1).toEqual({ x: 1, y: 0, z: 0 });
    expect(document.view.basis.e2).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("switches the plan basis when up is the world X axis (deterministic priority Y over Z)", () => {
    const graph = simpleGraph(
      [{ objectClass: "WALL", seed: "a", geometry: wallGeometry() }],
      { up: { x: 1, y: 0, z: 0 }, unit: "meter" },
    );
    const document = project2d(graph, { kind: "plan" });
    // up = +X → least-aligned world axis is Y (priority over Z on ties);
    // e2 = up × e1 = (0,0,1); the viewer looks along −X with (right, up) = (Y, Z).
    expect(document.view.basis.e1).toEqual({ x: 0, y: 1, z: 0 });
    expect(document.view.basis.e2).toEqual({ x: 0, y: 0, z: 1 });
    expect(document.view.viewAxis).toEqual({ x: -1, y: 0, z: 0 });
  });
});

// --- deterministic geometry projection ------------------------------------------

describe("plan projection geometry", () => {
  it("projects a horizontal floor to a closed polygon in canonical corner order", () => {
    const graph = simpleGraph([{ objectClass: "FLOOR", seed: "a", geometry: floorGeometry() }]);
    const document = project2d(graph, { kind: "plan" });
    expect(document.primitives).toHaveLength(1);
    const primitive = document.primitives[0]!;
    expect(primitive.kind).toBe("polygon");
    if (primitive.kind !== "polygon") {
      throw new Error("unreachable");
    }
    expect(primitive.points).toEqual([
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ]);
  });

  it("projects a vertical wall to a line segment spanning its run", () => {
    const graph = simpleGraph([{ objectClass: "WALL", seed: "a", geometry: wallGeometry() }]);
    const document = project2d(graph, { kind: "plan" });
    const primitive = document.primitives[0]!;
    expect(primitive.kind).toBe("segment");
    if (primitive.kind !== "segment") {
      throw new Error("unreachable");
    }
    expect(primitive.start).toEqual([0, 0]);
    expect(primitive.end).toEqual([0, 3]);
  });

  it("projects a door to a sub-segment of the wall run (its own extent)", () => {
    const graph = simpleGraph([{ objectClass: "DOOR", seed: "a", geometry: doorGeometry() }]);
    const document = project2d(graph, { kind: "plan" });
    const primitive = document.primitives.find(
      (candidate) => candidate.source.objectClass === "DOOR",
    )!;
    expect(primitive.kind).toBe("segment");
    if (primitive.kind !== "segment") {
      throw new Error("unreachable");
    }
    expect(primitive.start).toEqual([0, 1.55]);
    expect(primitive.end).toEqual([0, 2.45]);
  });

  it("emits primitives in canonical graph object order (class rank, then objectId)", () => {
    const graph = simpleGraph([
      { objectClass: "WALL", seed: "zz", geometry: wallGeometry() },
      { objectClass: "FLOOR", seed: "aa", geometry: floorGeometry() },
      { objectClass: "DOOR", seed: "mm", geometry: doorGeometry() },
    ]);
    const document = project2d(graph, { kind: "plan" });
    expect(document.primitives.map((primitive) => primitive.source.objectClass)).toEqual([
      "FLOOR",
      "WALL",
      "DOOR",
    ]);
  });
});

describe("elevation projection geometry", () => {
  it("projects a wall facing the viewer to a full polygon (canonical corners, X-right/Z-up)", () => {
    const graph = simpleGraph([{ objectClass: "WALL", seed: "a", geometry: wallGeometry() }]);
    // The wall's normal is (1,0,0); viewing along +X faces it head-on.
    const document = project2d(graph, { kind: "elevation", viewDirection: { x: 1, y: 0, z: 0 } });
    const primitive = document.primitives[0]!;
    expect(primitive.kind).toBe("polygon");
    if (primitive.kind !== "polygon") {
      throw new Error("unreachable");
    }
    // e1 = d × up = (1,0,0) × (0,0,1) = (0,-1,0): image-x = −y; image-y = z.
    expect(primitive.points).toEqual([
      [0, 0],
      [-3, 0],
      [-3, 2.7],
      [0, 2.7],
    ]);
  });

  it("projects a floor to a segment in elevation (the plane collapses to a line)", () => {
    const graph = simpleGraph([{ objectClass: "FLOOR", seed: "a", geometry: floorGeometry() }]);
    const document = project2d(graph, { kind: "elevation", viewDirection: { x: 0, y: 1, z: 0 } });
    const primitive = document.primitives[0]!;
    expect(primitive.kind).toBe("segment");
    if (primitive.kind !== "segment") {
      throw new Error("unreachable");
    }
    // e1 = +X, e2 = +Z: the floor spans x ∈ [0,4] at z = 0.
    expect(primitive.start).toEqual([0, 0]);
    expect(primitive.end).toEqual([4, 0]);
  });
});

// --- measurement/unit fidelity (AC-091) ------------------------------------------

describe("dimension fidelity", () => {
  it("carries the canonical quantities verbatim and converts exactly to SI", () => {
    const geometry: StructuredPlanarGeometryInput = {
      ...wallGeometry(),
      width: { value: 10, unit: "foot", uncertainty: { kind: "standard", u: 0.01 } },
      height: { value: 120, unit: "inch" },
      area: { value: 120, unit: "square_foot" },
    };
    const graph = simpleGraph([{ objectClass: "WALL", seed: "a", geometry }]);
    const document = project2d(graph, { kind: "plan" });
    const dimensions = document.primitives[0]!.dimensions;
    expect(dimensions.length).toBeDefined();
    expect(dimensions.length!.value).toBe(10);
    expect(dimensions.length!.unit).toBe("foot");
    expect(dimensions.length!.uncertainty).toEqual({ kind: "standard", u: 0.01 });
    expect(dimensions.length!.si).toBeCloseTo(3.048, 12);
    expect(dimensions.height!.unit).toBe("inch");
    expect(dimensions.height!.si).toBeCloseTo(3.048, 12);
    expect(dimensions.area!.unit).toBe("square_foot");
    expect(dimensions.area!.si).toBeCloseTo(120 * 0.3048 * 0.3048, 12);
  });

  it("declares the model's frame unit as the document's coordinate unit", () => {
    const graph = simpleGraph([{ objectClass: "FLOOR", seed: "a", geometry: floorGeometry() }]);
    const document = project2d(graph, { kind: "plan" });
    expect(document.unit).toBe("meter");
  });

  it("rejects a quantity unit outside the frozen vocabulary (defense in depth, fail closed)", () => {
    const graph = simpleGraph([{ objectClass: "WALL", seed: "a", geometry: wallGeometry() }]);
    // The graph constructors enforce the vocabulary upstream; this probe
    // bypasses them with a raw (cast) graph to prove the projection's own guard.
    const tampered = {
      ...graph,
      objects: graph.objects.map((object) => ({
        ...object,
        geometry: {
          ...object.geometry,
          structured: {
            ...object.geometry?.structured,
            width: { value: 3, unit: "cubit" },
          },
        },
      })),
    } as unknown as RealityModelGraph;
    expect(() => project2d(tampered, { kind: "plan" })).toThrow(/frozen vocabulary/);
  });
});

// --- traceable source IDs --------------------------------------------------------

describe("source traceability", () => {
  it("carries the source object identity, class, content hash, and epistemic state", () => {
    const graph = simpleGraph([{ objectClass: "WALL", seed: "a", geometry: wallGeometry() }]);
    const [object] = graph.objects;
    const document = project2d(graph, { kind: "plan" });
    const primitive = document.primitives[0]!;
    expect(primitive.primitiveId).toBe(`plan:${object!.objectId}`);
    expect(primitive.source.objectId).toBe(object!.objectId);
    expect(primitive.source.objectClass).toBe("WALL");
    expect(primitive.source.contentHash).toBe(object!.contentHash);
    expect(primitive.source.epistemic).toBe("INFERRED");
  });

  it("passes the epistemic state through exactly — CONFIRMED stays CONFIRMED, INFERRED never upgrades", () => {
    const graph = simpleGraph([
      { objectClass: "DOOR", seed: "confirmed-door", geometry: doorGeometry(), epistemic: "CONFIRMED" },
      { objectClass: "WALL", seed: "inferred-wall", geometry: wallGeometry(), epistemic: "INFERRED" },
    ]);
    const document = project2d(graph, { kind: "plan" });
    const states = document.primitives.map((primitive) => primitive.source.epistemic);
    expect(states).toContain("CONFIRMED");
    expect(states).toContain("INFERRED");
    for (const primitive of document.primitives) {
      const source = graph.objects.find((object) => object.objectId === primitive.source.objectId);
      expect(source).toBeDefined();
      expect(primitive.source.epistemic).toBe(source!.epistemicState);
    }
  });

  it("carries the provenance chain: service, method, and content-pinned inputs", () => {
    const graph = simpleGraph([{ objectClass: "WALL", seed: "a", geometry: wallGeometry() }]);
    const document = project2d(graph, { kind: "plan" });
    const provenance = document.primitives[0]!.source.provenance;
    expect(provenance.serviceId).toBe("aise.engineering-model");
    expect(provenance.method).toBe("test/unit-2d");
    expect(provenance.inputs).toHaveLength(1);
    expect(provenance.inputs[0]!.kind).toBe("object");
    expect(provenance.inputs[0]!.id).toBe("test.semantics/obj-a");
    expect(provenance.inputs[0]!.contentHash).toBe(hashOf("a"));
    expect(provenance.inputs[0]!.epistemic).toBe("INFERRED");
  });

  it("anchors the document to the exact graph digest it was projected from", () => {
    const graph = simpleGraph([{ objectClass: "FLOOR", seed: "a", geometry: floorGeometry() }]);
    const document = project2d(graph, { kind: "plan" });
    expect(document.graphDigest).toBe(graph.digest);
    expect(document.modelId).toBe("model-unit-2d");
    expect(document.projectId).toBe("project-unit-2d");
  });
});

// --- honest limitations and unprojected objects ----------------------------------

describe("honest reporting", () => {
  it("lists asset-only objects as unprojected with their reason", () => {
    const graph = simpleGraph([
      { objectClass: "WALL", seed: "a", geometry: wallGeometry() },
      { objectClass: "WALL", seed: "b", assetOnly: true },
    ]);
    const document = project2d(graph, { kind: "plan" });
    expect(document.counts.objects).toBe(2);
    expect(document.counts.projected).toBe(1);
    expect(document.counts.unprojected).toBe(1);
    expect(document.unprojected[0]!.reason).toBe("asset-only-geometry");
    expect(document.unprojected[0]!.source.objectId).toBeDefined();
  });

  it("lists geometry-less objects as unprojected with their reason", () => {
    const graph = simpleGraph([{ objectClass: "WALL", seed: "bare" }]);
    const document = project2d(graph, { kind: "plan" });
    expect(document.unprojected[0]!.reason).toBe("no-structured-geometry");
  });

  it("refuses to approximate oblique planes — unprojected, reason oblique-plane", () => {
    const graph = simpleGraph([{ objectClass: "WALL", seed: "tilted", geometry: obliqueGeometry() }]);
    const document = project2d(graph, { kind: "plan" });
    expect(document.primitives).toHaveLength(0);
    expect(document.unprojected).toHaveLength(1);
    expect(document.unprojected[0]!.reason).toBe("oblique-plane");
  });

  it("mirrors the upstream ±10° classification tolerance: a slightly tilted wall still projects (segment), a 30° tilt does not", () => {
    // A wall frame tilted ε ≈ 0.0004 rad around its run axis — the
    // noisy-extraction class. Upstream AISE-010 accepted this plane as a
    // WALL within its 10° tilt tolerance; the projection must not be
    // stricter than its authority.
    const tilt = (radians: number): StructuredPlanarGeometryInput => {
      const frame = {
        planePoint: { x: 0, y: 1.5, z: 1.35 },
        normal: { x: Math.cos(radians), y: 0, z: Math.sin(radians) },
        axisU: { x: 0, y: 1, z: 0 },
        axisV: { x: -Math.sin(radians), y: 0, z: Math.cos(radians) },
      };
      const bounds = { uMin: -1.5, uMax: 1.5, vMin: -1.35, vMax: 1.35 };
      return {
        shape: "planar-rectangle" as const,
        frame,
        rectangle: { ...bounds, ...rectangleOf(frame, bounds) },
        width: { value: 3, unit: "meter" as const },
        height: { value: 2.7, unit: "meter" as const },
        area: { value: 8.1, unit: "square_meter" as const },
        quality: { pointCount: 3000, residualRms: 0.006, residualMaxAbs: 0.02 },
      };
    };
    const slightlyTilted = simpleGraph([
      { objectClass: "WALL", seed: "noisy-wall", geometry: tilt(0.0004) },
    ]);
    const document = project2d(slightlyTilted, { kind: "plan" });
    expect(document.primitives).toHaveLength(1);
    expect(document.primitives[0]!.kind).toBe("segment");

    // A 30° tilt — outside the mirrored tolerance: honest refusal.
    const steep = simpleGraph([{ objectClass: "WALL", seed: "steep-wall", geometry: tilt((30 * Math.PI) / 180) }]);
    const refused = project2d(steep, { kind: "plan" });
    expect(refused.primitives).toHaveLength(0);
    expect(refused.unprojected).toHaveLength(1);
    expect(refused.unprojected[0]!.reason).toBe("oblique-plane");
  });

  it("embeds the explicit v1 limitations in the document", () => {
    const graph = simpleGraph([{ objectClass: "FLOOR", seed: "a", geometry: floorGeometry() }]);
    const document = project2d(graph, { kind: "plan" });
    expect(document.limitations).toBe(PLAN_2D_LIMITATIONS);
    expect(document.limitations.length).toBeGreaterThanOrEqual(8);
    expect(document.limitations.some((limitation) => limitation.includes("thickness"))).toBe(true);
    expect(document.limitations.some((limitation) => limitation.includes("never recomputed"))).toBe(true);
  });
});

// --- fail-closed request validation ----------------------------------------------

describe("fail-closed validation", () => {
  const graph = simpleGraph([{ objectClass: "WALL", seed: "a", geometry: wallGeometry() }]);

  it("rejects a non-unit elevation view direction", () => {
    const failure = capture(() => project2d(graph, { kind: "elevation", viewDirection: { x: 0, y: 2, z: 0 } }));
    expect(failure?.code).toBe("VIEW_DIRECTION_INVALID");
  });

  it("rejects a vertical (non-horizontal) elevation view direction", () => {
    const failure = capture(() => project2d(graph, { kind: "elevation", viewDirection: { x: 0, y: 0, z: 1 } }));
    expect(failure?.code).toBe("VIEW_DIRECTION_NOT_HORIZONTAL");
  });

  it("rejects a non-finite elevation view direction", () => {
    const failure = capture(() => project2d(graph, { kind: "elevation", viewDirection: { x: Number.NaN, y: 0, z: 0 } }));
    expect(failure?.code).toBe("VIEW_DIRECTION_INVALID");
  });

  it("rejects a graph whose first space has no declared frame", () => {
    const wallInput = {
      objectClass: "WALL" as const,
      epistemicState: "INFERRED" as const,
      provenance: provenanceOf("a"),
      structuredGeometry: wallGeometry(),
    };
    const wall = makeRealityObject(MODEL_ID, wallInput);
    const frameless = assembleModelGraph({
      modelId: MODEL_ID,
      projectId: "project-unit-2d",
      spaces: [{ spaceId: SPACE_ID, kind: "ROOM" }],
      objects: [wallInput],
      relationships: [{ type: "CONTAINS" as const, fromId: SPACE_ID, toId: wall.objectId }],
    });
    const failure = capture(() => project2d(frameless, { kind: "plan" }));
    expect(failure?.code).toBe("FRAME_DECLARATION_MISSING");
  });

  it("is non-retryable by construction (deterministic input)", () => {
    const failure = capture(() => project2d(graph, { kind: "elevation", viewDirection: { x: 0, y: 0, z: 1 } }));
    expect(failure?.retryable).toBe(false);
  });
});

// --- determinism -------------------------------------------------------------------

describe("determinism", () => {
  it("produces structurally identical documents for identical inputs", () => {
    const graph = simpleGraph([
      { objectClass: "FLOOR", seed: "a", geometry: floorGeometry() },
      { objectClass: "WALL", seed: "b", geometry: wallGeometry() },
      { objectClass: "DOOR", seed: "c", geometry: doorGeometry() },
      { objectClass: "WALL", seed: "d", assetOnly: true },
    ]);
    const first = project2d(graph, { kind: "plan" });
    const second = project2d(graph, { kind: "plan" });
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

/** Captures an Export2dError from a throwing call (fail-closed inspection). */
function capture(call: () => unknown): ReturnType<typeof toExport2dError> {
  try {
    call();
    return null;
  } catch (error) {
    const typed = toExport2dError(error);
    expect(typed).not.toBeNull();
    return typed;
  }
}
