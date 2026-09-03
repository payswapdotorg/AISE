/**
 * Golden room scene tests (AISE-010, HIGH_ASSURANCE benchmark).
 *
 * Synthetic rooms with ground truth and acceptance tolerances
 * (exact / seeded-noise / deterministic-outlier variants):
 * recognition of wall/floor/ceiling/door/window, structured
 * geometry within acceptance, room summary, honest accounting of
 * unclassified clusters and residual points, epistemic honesty,
 * determinism, and permutation invariance of the full pipeline.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "./scene.js";
import {
  EXACT_ROOM_ACCEPTANCE,
  NOISY_ROOM_ACCEPTANCE,
  OUTLIER_ROOM_ACCEPTANCE,
  exactRoomPoints,
  noisyRoomPoints,
  outlierRoomPoints,
  roomGroundTruth,
  type RoomAcceptance,
} from "./fixtures/golden.js";
import type { ArchitecturalScene } from "./objects.js";
import { toSemanticsError } from "./errors.js";

const UNIT = "meter" as const;
const TRUTH = roomGroundTruth;

/** Extracts a room and asserts the ground-truth object counts. */
function extractRoom(points: Parameters<typeof extractArchitecturalScene>[0]["points"]): ArchitecturalScene {
  return extractArchitecturalScene({ points, unit: UNIT });
}

/** Finds the single object of a kind (fail the test if missing). */
function oneOf(scene: ArchitecturalScene, kind: string) {
  const objects = scene.objects.filter((o) => o.kind === kind);
  expect(objects.length, `expected exactly one ${kind}`).toBe(1);
  return objects[0]!;
}

describe("golden room: exact fixture", () => {
  const scene = extractRoom(exactRoomPoints());

  it("recognizes the ground-truth object counts", () => {
    const counts = countKinds(scene);
    expect(counts).toEqual({
      FLOOR: TRUTH.objectCounts.floors,
      CEILING: TRUTH.objectCounts.ceilings,
      WALL: TRUTH.objectCounts.walls,
      DOOR: TRUTH.objectCounts.doors,
      WINDOW: TRUTH.objectCounts.windows,
    });
  });

  it("floor and ceiling dimensions within acceptance", () => {
    const floor = oneOf(scene, "FLOOR");
    const ceiling = oneOf(scene, "CEILING");
    for (const surface of [floor, ceiling]) {
      expect(surface.geometry.width.value).toBeCloseTo(TRUTH.width, 1);
      expect(Math.abs(surface.geometry.width.value - TRUTH.width)).toBeLessThanOrEqual(
        EXACT_ROOM_ACCEPTANCE.dimensionTolerance,
      );
      expect(Math.abs(surface.geometry.height.value - TRUTH.depth)).toBeLessThanOrEqual(
        EXACT_ROOM_ACCEPTANCE.dimensionTolerance,
      );
      expect(surface.geometry.area.unit).toBe("square_meter");
    }
    expect(floor.elevation?.value).toBeCloseTo(0, 6);
    expect(ceiling.elevation?.value).toBeCloseTo(TRUTH.floorToCeilingHeight, 6);
  });

  it("room summary: height within elevation acceptance", () => {
    expect(scene.room).not.toBeNull();
    const height = scene.room?.roomHeight;
    expect(height?.unit).toBe("meter");
    expect(Math.abs((height?.value ?? -1) - TRUTH.floorToCeilingHeight)).toBeLessThanOrEqual(
      EXACT_ROOM_ACCEPTANCE.elevationTolerance,
    );
  });

  it("walls: two long, two short, height within acceptance (boundary rows claimed by floor/ceiling planes)", () => {
    const walls = scene.objects.filter((o) => o.kind === "WALL");
    const widths = walls.map((w) => w.geometry.width.value).sort((a, b) => a - b);
    expect(widths.length).toBe(4);
    expect(Math.abs(widths[2]! - TRUTH.width)).toBeLessThanOrEqual(EXACT_ROOM_ACCEPTANCE.dimensionTolerance);
    expect(Math.abs(widths[0]! - TRUTH.depth)).toBeLessThanOrEqual(EXACT_ROOM_ACCEPTANCE.dimensionTolerance);
    for (const wall of walls) {
      expect(Math.abs(wall.geometry.height.value - TRUTH.floorToCeilingHeight)).toBeLessThanOrEqual(
        EXACT_ROOM_ACCEPTANCE.dimensionTolerance,
      );
    }
  });

  it("door: floor-contacting opening with dimensions within acceptance", () => {
    const door = oneOf(scene, "DOOR");
    expect(Math.abs(door.geometry.width.value - TRUTH.door.width)).toBeLessThanOrEqual(
      EXACT_ROOM_ACCEPTANCE.dimensionTolerance,
    );
    expect(Math.abs(door.geometry.height.value - TRUTH.door.height)).toBeLessThanOrEqual(
      EXACT_ROOM_ACCEPTANCE.dimensionTolerance,
    );
    expect(door.parentObjectId).toMatch(/^wall-[0-9a-f]{16}$/);
    expect(
      scene.objects.some((o) => o.objectId === door.parentObjectId && o.kind === "WALL"),
    ).toBe(true);
    expect(door.headHeight).toBeDefined();
    // The door object carries the grid-quantized uncertainty model.
    expect(door.geometry.width.uncertainty?.kind).toBe("standard");
  });

  it("window: elevated opening with sill and head within acceptance", () => {
    const window = oneOf(scene, "WINDOW");
    expect(Math.abs(window.geometry.width.value - TRUTH.window.width)).toBeLessThanOrEqual(
      EXACT_ROOM_ACCEPTANCE.dimensionTolerance,
    );
    expect(Math.abs(window.geometry.height.value - TRUTH.window.height)).toBeLessThanOrEqual(
      EXACT_ROOM_ACCEPTANCE.dimensionTolerance,
    );
    expect(Math.abs((window.sillHeight?.value ?? -1) - TRUTH.window.sill)).toBeLessThanOrEqual(
      EXACT_ROOM_ACCEPTANCE.dimensionTolerance,
    );
    expect(window.parentObjectId).toMatch(/^wall-[0-9a-f]{16}$/);
  });

  it("honest accounting: no unclassified clusters, no residual points", () => {
    expect(scene.unclassified.length).toBe(0);
    expect(scene.residualPointCount).toBe(0);
  });

  it("every object carries complete provenance and stays INFERRED (no-confidence, no upgrade)", () => {
    for (const object of scene.objects) {
      expect(object.epistemicState).toBe("INFERRED");
      expect(object.provenance.serviceId).toBe("aise.semantics");
      expect(object.provenance.inputs.length).toBeGreaterThan(0);
      expect(object.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(object)).not.toContain("confidence");
    }
    expect(scene.epistemicState).toBe("INFERRED");
    expect(JSON.stringify(scene)).not.toContain("confidence");
  });

  it("walls carry opening counts; openings carry parent lineage", () => {
    const doorWall = scene.objects.find(
      (o) => o.kind === "WALL" && o.openings?.doorCount === 1,
    );
    expect(doorWall).toBeDefined();
    expect(doorWall?.openings?.windowCount).toBe(0);
    const windowWall = scene.objects.find(
      (o) => o.kind === "WALL" && o.openings?.windowCount === 1,
    );
    expect(windowWall).toBeDefined();
    const door = oneOf(scene, "DOOR");
    const window = oneOf(scene, "WINDOW");
    expect(door.provenance.inputs.some((i) => i.kind === "object")).toBe(true);
    expect(window.provenance.inputs.some((i) => i.kind === "object")).toBe(true);
  });

  it("scene provenance records the full pipeline settings and input lineage", () => {
    const provenance = scene.provenance;
    expect(provenance.method).toBe("scene/assembly-v1");
    expect(provenance.parameters.inputPointCount).toBe(exactRoomPoints().length);
    expect(provenance.parameters.unit).toBe(UNIT);
    const input = provenance.inputs[0];
    expect(input?.kind).toBe("point-set");
    if (input?.kind === "point-set") {
      expect(input.pointCount).toBe(exactRoomPoints().length);
    }
  });
});

describe("golden room: noisy fixture (seeded σ = 0.01 m)", () => {
  const scene = extractRoom(noisyRoomPoints());
  const acceptance: RoomAcceptance = NOISY_ROOM_ACCEPTANCE;

  it("still recognizes the ground-truth object counts", () => {
    expect(countKinds(scene)).toEqual({
      FLOOR: 1,
      CEILING: 1,
      WALL: 4,
      DOOR: 1,
      WINDOW: 1,
    });
  });

  it("room height within the noisy elevation tolerance", () => {
    expect(
      Math.abs((scene.room?.roomHeight?.value ?? -1) - TRUTH.floorToCeilingHeight),
    ).toBeLessThanOrEqual(acceptance.elevationTolerance);
  });

  it("door and window dimensions within the noisy dimension tolerance", () => {
    const door = oneOf(scene, "DOOR");
    const window = oneOf(scene, "WINDOW");
    expect(Math.abs(door.geometry.width.value - TRUTH.door.width)).toBeLessThanOrEqual(
      acceptance.dimensionTolerance,
    );
    expect(Math.abs(door.geometry.height.value - TRUTH.door.height)).toBeLessThanOrEqual(
      acceptance.dimensionTolerance,
    );
    expect(Math.abs(window.geometry.width.value - TRUTH.window.width)).toBeLessThanOrEqual(
      acceptance.dimensionTolerance,
    );
    expect(Math.abs(window.geometry.height.value - TRUTH.window.height)).toBeLessThanOrEqual(
      acceptance.dimensionTolerance,
    );
    expect(Math.abs((window.sillHeight?.value ?? -1) - TRUTH.window.sill)).toBeLessThanOrEqual(
      acceptance.dimensionTolerance,
    );
  });

  it("floor/ceiling/wall dimensions within the noisy tolerance", () => {
    const floor = oneOf(scene, "FLOOR");
    expect(Math.abs(floor.geometry.width.value - TRUTH.width)).toBeLessThanOrEqual(
      acceptance.dimensionTolerance,
    );
    const walls = scene.objects.filter((o) => o.kind === "WALL");
    expect(walls.length).toBe(4);
    for (const wall of walls) {
      expect(Math.abs(wall.geometry.height.value - TRUTH.floorToCeilingHeight)).toBeLessThanOrEqual(
        acceptance.dimensionTolerance,
      );
    }
  });

  it("honest about residual points (noise points join no cluster)", () => {
    expect(scene.residualPointCount).toBeGreaterThan(0);
  });

  it("per-point σ flows into opening measurements when stated", () => {
    const sceneWithSigma = extractArchitecturalScene({
      points: noisyRoomPoints(),
      unit: UNIT,
      perPointStandardUncertainty: 0.01,
    });
    const window = oneOf(sceneWithSigma, "WINDOW");
    const sigma = window.geometry.width.uncertainty?.kind === "standard"
      ? window.geometry.width.uncertainty.u
      : Number.NaN;
    const sigmaDim = Math.sqrt((Math.SQRT2 * 0.05 / Math.sqrt(12)) ** 2 + (Math.SQRT2 * 0.01) ** 2);
    expect(sigma).toBeCloseTo(sigmaDim, 9);
  });
});

describe("golden room: outlier fixture (5% deterministic displacement)", () => {
  const scene = extractRoom(outlierRoomPoints());
  const acceptance: RoomAcceptance = OUTLIER_ROOM_ACCEPTANCE;

  it("still recognizes floor, ceiling, the door, and the window", () => {
    const counts = countKinds(scene);
    expect(counts.FLOOR).toBe(1);
    expect(counts.CEILING).toBe(1);
    expect(counts.DOOR).toBe(1);
    expect(counts.WINDOW).toBe(1);
  });

  it("recognizes at least the four true walls (ghost planes reported honestly, never hidden)", () => {
    expect(scene.objects.filter((o) => o.kind === "WALL").length).toBeGreaterThanOrEqual(4);
    // Everything that is not a true object is reported, not dropped.
    expect(scene.unclassified.length + scene.residualPointCount).toBeGreaterThan(0);
  });

  it("room height within acceptance (outliers do not corrupt the floor/ceiling)", () => {
    expect(
      Math.abs((scene.room?.roomHeight?.value ?? -1) - TRUTH.floorToCeilingHeight),
    ).toBeLessThanOrEqual(acceptance.elevationTolerance);
  });

  it("door and window dimensions within acceptance", () => {
    const door = oneOf(scene, "DOOR");
    const window = oneOf(scene, "WINDOW");
    expect(Math.abs(door.geometry.width.value - TRUTH.door.width)).toBeLessThanOrEqual(
      acceptance.dimensionTolerance,
    );
    expect(Math.abs(door.geometry.height.value - TRUTH.door.height)).toBeLessThanOrEqual(
      acceptance.dimensionTolerance,
    );
    expect(Math.abs(window.geometry.width.value - TRUTH.window.width)).toBeLessThanOrEqual(
      acceptance.dimensionTolerance,
    );
    expect(Math.abs((window.sillHeight?.value ?? -1) - TRUTH.window.sill)).toBeLessThanOrEqual(
      acceptance.dimensionTolerance,
    );
  });
});

describe("scene extraction: epistemic and input gates", () => {
  it("PROPOSED source propagates PROPOSED (never upgraded to INFERRED)", () => {
    const scene = extractArchitecturalScene({
      points: exactRoomPoints(),
      unit: UNIT,
      sourceEpistemic: "PROPOSED",
    });
    expect(scene.epistemicState).toBe("PROPOSED");
    expect(scene.objects.every((o) => o.epistemicState === "PROPOSED")).toBe(true);
  });

  it("OBSERVED source still yields INFERRED objects (recognition is inference)", () => {
    const scene = extractArchitecturalScene({
      points: exactRoomPoints(),
      unit: UNIT,
      sourceEpistemic: "OBSERVED",
    });
    expect(scene.objects.every((o) => o.epistemicState === "INFERRED")).toBe(true);
    // The scene is the weakest of INFERRED objects and OBSERVED source.
    expect(scene.epistemicState).toBe("INFERRED");
  });

  it("rejects unknown units (VALIDATION_FAILED)", () => {
    const error = capture(() =>
      extractArchitecturalScene({ points: exactRoomPoints(), unit: "furlong" as never }),
    );
    expect(error?.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a zero up axis (DEGENERATE_GEOMETRY — no guessed orientation)", () => {
    const error = capture(() =>
      extractArchitecturalScene({ points: exactRoomPoints(), unit: UNIT, up: { x: 0, y: 0, z: 0 } }),
    );
    expect(error?.code).toBe("DEGENERATE_GEOMETRY");
  });

  it("rejects invalid per-point uncertainty", () => {
    const error = capture(() =>
      extractArchitecturalScene({
        points: exactRoomPoints(),
        unit: UNIT,
        perPointStandardUncertainty: -0.5,
      }),
    );
    expect(error?.code).toBe("VALIDATION_FAILED");
  });

  it("honors a declared non-default up axis (y-up scene)", () => {
    // Rotate the room: swap y and z so +Y is up.
    const points = exactRoomPoints().map((p) => ({ x: p.x, y: p.z, z: p.y }));
    const scene = extractArchitecturalScene({ points, unit: UNIT, up: { x: 0, y: 1, z: 0 } });
    const counts = countKinds(scene);
    expect(counts.FLOOR).toBe(1);
    expect(counts.CEILING).toBe(1);
    expect(counts.WALL).toBe(4);
    expect(counts.DOOR).toBe(1);
    expect(counts.WINDOW).toBe(1);
  });
});

describe("scene extraction: determinism", () => {
  it("bit-identical full-scene extraction across re-runs", () => {
    const a = extractRoom(exactRoomPoints());
    const b = extractRoom(exactRoomPoints());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("permutation invariance: input order never changes the scene", () => {
    const points = exactRoomPoints();
    const shuffled = [...points];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = (i * 7919) % (i + 1);
      const tmp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = tmp;
    }
    const a = extractRoom(points);
    const b = extractRoom(shuffled);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.sceneId).toBe(b.sceneId);
  });

  it("deterministic on the noisy fixture (seeded noise)", () => {
    const a = extractRoom(noisyRoomPoints());
    const b = extractRoom(noisyRoomPoints());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

function countKinds(scene: ArchitecturalScene): Record<string, number> {
  const counts: Record<string, number> = { FLOOR: 0, CEILING: 0, WALL: 0, DOOR: 0, WINDOW: 0 };
  for (const object of scene.objects) {
    counts[object.kind] = (counts[object.kind] ?? 0) + 1;
  }
  return counts;
}

/** Captures a SemanticsError from a throwing callback. */
function capture(fn: () => unknown): ReturnType<typeof toSemanticsError> {
  try {
    fn();
  } catch (error) {
    const semantics = toSemanticsError(error);
    expect(semantics, "expected a SemanticsError").not.toBeNull();
    return semantics;
  }
  throw new Error("expected the call to throw");
}
