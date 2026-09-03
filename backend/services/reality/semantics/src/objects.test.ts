/**
 * Architectural object and scene assembly tests (AISE-010).
 *
 * Constructor-side gates on the PRODUCING path: provenance
 * completeness, epistemic ceiling (no OBSERVED/CONFIRMED output),
 * the structural no-confidence scan, deterministic content-derived
 * identities, and scene consistency guards (impossible architecture
 * fails closed; unclassified is never silently dropped).
 */
import { describe, expect, it } from "vitest";
import {
  assembleScene,
  compareObjects,
  makeOpeningObject,
  makeSurfaceObject,
  type ArchitecturalObject,
  type SceneAssemblyInput,
  type SurfaceObjectInput,
  type OpeningObjectInput,
} from "./objects.js";
import {
  extractionProvenance,
  pointSetInputRef,
  type ExtractionProvenance,
} from "./provenance.js";
import { toSemanticsError } from "./errors.js";
import { buildWallFrame, rectangleInFrame, type StructuredRectangle } from "./structure.js";
import { planeGrid } from "./testing.js";
import type { GeomPoint, Measurement } from "@aise/backend-geometry";

const UNIT = "meter" as const;
const UP = { x: 0, y: 0, z: 1 };

const CLUSTER_POINTS: GeomPoint[] = planeGrid(
  { x: 2, y: 0, z: 1.3 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  21,
  27,
  0.1,
);

function wallGeometry(): StructuredRectangle {
  const frame = buildWallFrame({ x: 2, y: 0, z: 1.3 }, { x: 0, y: 1, z: 0 }, UP);
  return rectangleInFrame(CLUSTER_POINTS, frame, UNIT);
}

function provenance(method: string, params: Record<string, unknown> = { n: 1 }): ExtractionProvenance {
  return extractionProvenance(method, params, [pointSetInputRef(CLUSTER_POINTS, "INFERRED")]);
}

const QUALITY = { pointCount: CLUSTER_POINTS.length, residualRms: 0, residualMaxAbs: 0 };

function surfaceInput(overrides: Partial<SurfaceObjectInput> = {}): SurfaceObjectInput {
  return {
    kind: "WALL",
    geometry: wallGeometry(),
    quality: QUALITY,
    provenance: provenance("classify/wall-tilt-v1"),
    ...overrides,
  };
}

function openingInput(overrides: Partial<OpeningObjectInput> = {}): OpeningObjectInput {
  return {
    kind: "DOOR",
    geometry: wallGeometry(),
    quality: QUALITY,
    parentObjectId: "wall-0123456789abcdef",
    provenance: provenance("opening/grid-gap-v1"),
    ...overrides,
  };
}

const MEASUREMENT: Measurement = { value: 1, unit: UNIT };

function sceneInput(overrides: Partial<SceneAssemblyInput> = {}): SceneAssemblyInput {
  return {
    frame: { up: UP, unit: UNIT },
    objects: [],
    unclassified: [],
    residualPointCount: 0,
    residualPointsContentHash: "0".repeat(64),
    room: null,
    sourceEpistemic: "INFERRED",
    minFloorCeilingSeparation: 1.5,
    provenance: provenance("scene/assembly-v1"),
    ...overrides,
  };
}

describe("makeSurfaceObject", () => {
  it("builds a wall object with a deterministic content-derived identity", () => {
    const geometry = wallGeometry();
    const object = makeSurfaceObject(surfaceInput({ geometry }));
    expect(object.kind).toBe("WALL");
    expect(object.objectId).toMatch(/^wall-[0-9a-f]{16}$/);
    expect(object.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(object.epistemicState).toBe("INFERRED");
    expect(object.geometry).toStrictEqual(geometry);
  });

  it("re-running the constructor yields the bit-identical object (identity is content)", () => {
    const a = makeSurfaceObject(surfaceInput());
    const b = makeSurfaceObject(surfaceInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.objectId).toBe(b.objectId);
  });

  it("different content yields different identities", () => {
    const a = makeSurfaceObject(surfaceInput());
    const b = makeSurfaceObject(surfaceInput({ kind: "FLOOR", elevation: MEASUREMENT }));
    expect(a.objectId).not.toBe(b.objectId);
    expect(b.objectId).toMatch(/^floor-[0-9a-f]{16}$/);
  });

  it("rejects OBSERVED objects — recognition output may never outrank INFERRED", () => {
    const error = capture(() => makeSurfaceObject(surfaceInput({ epistemicState: "OBSERVED" })));
    expect(error?.code).toBe("EPISTEMIC_STATE_INVALID");
  });

  it("rejects CONFIRMED objects", () => {
    const error = capture(() => makeSurfaceObject(surfaceInput({ epistemicState: "CONFIRMED" })));
    expect(error?.code).toBe("EPISTEMIC_STATE_INVALID");
  });

  it("accepts PROPOSED objects (design content propagates weaker, never upgrades)", () => {
    const object = makeSurfaceObject(surfaceInput({ epistemicState: "PROPOSED" }));
    expect(object.epistemicState).toBe("PROPOSED");
  });

  it("rejects incomplete provenance (PROVENANCE_INCOMPLETE on the producing path)", () => {
    const error = capture(() =>
      makeSurfaceObject(surfaceInput({ provenance: { ...provenance("x/y-v1"), inputs: [] } as never })),
    );
    expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
  });

  it("rejects content carrying a confidence field anywhere (structural scan)", () => {
    const error = capture(() =>
      makeSurfaceObject(
        surfaceInput({
          provenance: provenance("classify/wall-tilt-v1", { confidence: 0.9 }),
        }),
      ),
    );
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.message).toContain("confidence");
  });
});

describe("makeOpeningObject", () => {
  it("builds a door with parent lineage", () => {
    const object = makeOpeningObject(openingInput());
    expect(object.kind).toBe("DOOR");
    expect(object.objectId).toMatch(/^door-[0-9a-f]{16}$/);
    expect(object.parentObjectId).toBe("wall-0123456789abcdef");
  });

  it("builds a window with sill/head measurements", () => {
    const object = makeOpeningObject(
      openingInput({
        kind: "WINDOW",
        sillHeight: MEASUREMENT,
        headHeight: MEASUREMENT,
      }),
    );
    expect(object.objectId).toMatch(/^window-[0-9a-f]{16}$/);
    expect(object.sillHeight).toBe(MEASUREMENT);
    expect(object.headHeight).toBe(MEASUREMENT);
  });

  it("rejects OBSERVED openings", () => {
    const error = capture(() => makeOpeningObject(openingInput({ epistemicState: "OBSERVED" })));
    expect(error?.code).toBe("EPISTEMIC_STATE_INVALID");
  });

  it("rejects incomplete provenance", () => {
    const error = capture(() =>
      makeOpeningObject(openingInput({ provenance: { ...provenance("a/b-v1"), method: "BAD" } as never })),
    );
    expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
  });
});

describe("compareObjects (canonical ordering)", () => {
  it("orders by kind rank FLOOR → CEILING → WALL → DOOR → WINDOW, then objectId", () => {
    const mk = (kind: ArchitecturalObject["kind"], id: string): ArchitecturalObject =>
      ({
        objectId: id,
        kind,
        geometry: wallGeometry(),
        quality: QUALITY,
        epistemicState: "INFERRED",
        contentHash: "0".repeat(64),
        provenance: provenance("a/b-v1"),
      }) as ArchitecturalObject;
    const objects = [
      mk("WINDOW", "window-b"),
      mk("DOOR", "door-a"),
      mk("WALL", "wall-z"),
      mk("CEILING", "ceiling-a"),
      mk("FLOOR", "floor-a"),
      mk("WALL", "wall-a"),
    ];
    const sorted = [...objects].sort(compareObjects);
    expect(sorted.map((o) => o.kind)).toEqual([
      "FLOOR",
      "CEILING",
      "WALL",
      "WALL",
      "DOOR",
      "WINDOW",
    ]);
    expect(sorted[2]?.objectId).toBe("wall-a");
    expect(sorted[3]?.objectId).toBe("wall-z");
  });
});

describe("assembleScene (consistency guards)", () => {
  const wallObject = makeSurfaceObject(surfaceInput());
  const doorObject = makeOpeningObject(
    openingInput({
      parentObjectId: wallObject.objectId,
      provenance: provenance("opening/grid-gap-v1", { parent: wallObject.objectId }),
    }),
  );

  it("assembles with canonical ordering and a content-derived scene id", () => {
    const scene = assembleScene(
      sceneInput({ objects: [doorObject, wallObject] }),
    );
    expect(scene.kind).toBe("architectural-scene");
    expect(scene.sceneId).toMatch(/^scene-[0-9a-f]{16}$/);
    expect(scene.objects.map((o) => o.kind)).toEqual(["WALL", "DOOR"]);
    expect(scene.epistemicState).toBe("INFERRED");
    expect(scene.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects duplicate object ids (IDENTITY_COLLISION)", () => {
    const error = capture(() =>
      assembleScene(sceneInput({ objects: [wallObject, wallObject] })),
    );
    expect(error?.code).toBe("IDENTITY_COLLISION");
    expect(error?.details.objectId).toBe(wallObject.objectId);
  });

  it("rejects two objects with identical content (hash collision)", () => {
    const twin = makeSurfaceObject(surfaceInput({ provenance: provenance("classify/wall-tilt-v1", { other: 2 }) }));
    // Force a content collision by re-using the first object's hash.
    const forged: ArchitecturalObject = { ...twin, contentHash: wallObject.contentHash };
    const error = capture(() =>
      assembleScene(sceneInput({ objects: [wallObject, forged] })),
    );
    expect(error?.code).toBe("IDENTITY_COLLISION");
  });

  it("rejects an opening whose parent is not a recognized wall (GEOMETRY_CONTRADICTION)", () => {
    const orphan = makeOpeningObject(
      openingInput({
        parentObjectId: "wall-0123456789abcdef",
        provenance: provenance("opening/grid-gap-v1", { parent: "wall-0123456789abcdef" }),
      }),
    );
    const error = capture(() =>
      assembleScene(sceneInput({ objects: [doorObject, wallObject, orphan] })),
    );
    expect(error?.code).toBe("GEOMETRY_CONTRADICTION");
    expect(error?.details.parentObjectId).toBe("wall-0123456789abcdef");
  });

  it("rejects floor elevation at or above the ceiling (impossible architecture)", () => {
    const floorAt = (z: number): ArchitecturalObject =>
      makeSurfaceObject(
        surfaceInput({
          kind: "FLOOR",
          elevation: { value: z, unit: UNIT },
        }),
      );
    const ceiling = makeSurfaceObject(
      surfaceInput({ kind: "CEILING", elevation: { value: 2.7, unit: UNIT } }),
    );
    const error = capture(() =>
      assembleScene(
        sceneInput({
          objects: [floorAt(2.7), ceiling],
          room: {
            floorElevation: { value: 2.7, unit: UNIT },
            ceilingElevation: { value: 2.7, unit: UNIT },
          },
        }),
      ),
    );
    expect(error?.code).toBe("GEOMETRY_CONTRADICTION");
    expect(error?.message).toContain("strictly below");
  });

  it("rejects floor–ceiling separation below the architectural minimum", () => {
    const error = capture(() =>
      assembleScene(
        sceneInput({
          objects: [],
          room: {
            floorElevation: { value: 0, unit: UNIT },
            ceilingElevation: { value: 1.0, unit: UNIT },
          },
        }),
      ),
    );
    expect(error?.code).toBe("GEOMETRY_CONTRADICTION");
    expect(error?.message).toContain("architectural minimum");
  });

  it("accepts a valid room summary and carries it through", () => {
    const scene = assembleScene(
      sceneInput({
        room: {
          floorElevation: { value: 0, unit: UNIT },
          ceilingElevation: { value: 2.7, unit: UNIT },
          roomHeight: { value: 2.7, unit: UNIT },
        },
      }),
    );
    expect(scene.room?.roomHeight?.value).toBe(2.7);
  });

  it("rejects an upgraded scene epistemic state (no upgrade over inputs)", () => {
    // The scene derives from sourceEpistemic; INFERRED source cannot
    // yield OBSERVED scene (deriveCompositeState would not produce it,
    // so forge one via PROPOSED inputs and an INFERRED override is
    // impossible by construction — verify the guard with an OBSERVED
    // claim injected at assembly).
    const error = capture(() => {
      const scene = assembleScene(
        sceneInput({
          objects: [wallObject],
          sourceEpistemic: "PROPOSED",
        }),
      );
      // The derived state must be PROPOSED (weakest input).
      expect(scene.epistemicState).toBe("PROPOSED");
      // Defense in depth: an object outranking the scene ceiling fails.
      return assembleScene(
        sceneInput({
          objects: [
            { ...wallObject, epistemicState: "OBSERVED" as const },
          ],
          sourceEpistemic: "INFERRED",
        }),
      );
    });
    expect(error?.code).toBe("EPISTEMIC_STATE_INVALID");
  });

  it("the scene state is the weakest of objects and source (never an upgrade)", () => {
    const proposedObject = makeSurfaceObject(surfaceInput({ epistemicState: "PROPOSED" }));
    const scene = assembleScene(
      sceneInput({ objects: [wallObject, proposedObject], sourceEpistemic: "INFERRED" }),
    );
    expect(scene.epistemicState).toBe("PROPOSED");
  });

  it("rejects scene provenance gaps", () => {
    const error = capture(() =>
      assembleScene(sceneInput({ provenance: { ...provenance("scene/assembly-v1"), serviceId: "x" } as never })),
    );
    expect(error?.code).toBe("PROVENANCE_INCOMPLETE");
  });

  it("sorts unclassified segments deterministically by cluster id", () => {
    const scene = assembleScene(
      sceneInput({
        unclassified: [
          { clusterId: "seg-b", pointCount: 1, contentHash: "0".repeat(64), reason: "r" },
          { clusterId: "seg-a", pointCount: 2, contentHash: "1".repeat(64), reason: "r" },
        ],
      }),
    );
    expect(scene.unclassified.map((u) => u.clusterId)).toEqual(["seg-a", "seg-b"]);
  });

  it("rejects scene content carrying a confidence field (whole-scene scan)", () => {
    const error = capture(() =>
      assembleScene(
        sceneInput({
          provenance: provenance("scene/assembly-v1", { confidence: 0.7 }),
        }),
      ),
    );
    expect(error?.code).toBe("VALIDATION_FAILED");
  });
});

/** Captures a SemanticsError from a throwing callback. */
function capture(fn: () => unknown): ReturnType<typeof toSemanticsError> {
  try {
    const result = fn();
    if (result instanceof Error) {
      throw result;
    }
    return null;
  } catch (error) {
    const semantics = toSemanticsError(error);
    expect(semantics, `expected a SemanticsError, got: ${String(error)}`).not.toBeNull();
    return semantics;
  }
}
