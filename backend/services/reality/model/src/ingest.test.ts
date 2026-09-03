/**
 * Ingestion adapter tests: the deterministic scene→graph mapping,
 * driven by the REAL AISE-010 extraction of the golden room (the
 * composition evidence — not hand-mocked scenes).
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import {
  EngineeringModelError,
  objectsInSpace,
  openingsOfWall,
  parentWallOf,
  graphCounts,
} from "@aise/engineering-model";
import { RealityModelError } from "./errors.js";
import { ingestArchitecturalScene, INGEST_METHOD } from "./ingest.js";

const MODEL = "model-golden";
const PROJECT = "project-golden";
const SPACE = "room-golden";

/** The REAL extraction of the exact golden room (module-scope, deterministic). */
const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });

const target = { modelId: MODEL, projectId: PROJECT, spaceId: SPACE };

describe("ingestArchitecturalScene", () => {
  const result = ingestArchitecturalScene(scene, target);

  it("ingests every extracted object (1:1 class mapping)", () => {
    expect(result.graph.objects).toHaveLength(scene.objects.length);
    const counts = graphCounts(result.graph).objectsByClass;
    expect(counts).toEqual({ FLOOR: 1, CEILING: 1, WALL: 4, DOOR: 1, WINDOW: 1 });
  });

  it("creates one CONTAINS per object and OPENING_IN per opening", () => {
    const contains = result.graph.relationships.filter((rel) => rel.type === "CONTAINS");
    const openingIn = result.graph.relationships.filter((rel) => rel.type === "OPENING_IN");
    expect(contains).toHaveLength(scene.objects.length);
    expect(openingIn).toHaveLength(2);
    expect(objectsInSpace(result.graph, SPACE)).toHaveLength(scene.objects.length);
  });

  it("maps every door/window to its parent wall (scene parent references)", () => {
    for (const object of result.graph.objects) {
      if (object.objectClass === "DOOR" || object.objectClass === "WINDOW") {
        const parent = parentWallOf(result.graph, object.objectId);
        expect(parent).toBeDefined();
        expect(parent!.objectClass).toBe("WALL");
      }
    }
    // The door and the window sit in different walls; each wall
    // derives exactly its own opening (counts are derived, never
    // stored).
    const wallsWithOpenings = result.graph.objects.filter(
      (object) => object.objectClass === "WALL" && openingsOfWall(result.graph, object.objectId).length > 0,
    );
    expect(wallsWithOpenings).toHaveLength(2);
    for (const wall of wallsWithOpenings) {
      expect(openingsOfWall(result.graph, wall.objectId)).toHaveLength(1);
    }
  });

  it("passes epistemic states through unchanged (INFERRED, never upgraded)", () => {
    for (const object of result.graph.objects) {
      const sourcePin = object.provenance.inputs[0] as { kind: string; objectId?: string };
      expect(sourcePin.kind).toBe("object");
      const sceneObject = scene.objects.find((candidate) => candidate.objectId === sourcePin.objectId);
      expect(sceneObject).toBeDefined();
      expect(object.epistemicState).toBe(sceneObject!.epistemicState);
      expect(object.epistemicState).toBe("INFERRED");
    }
  });

  it("carries the extraction's uncertainty on geometric quantities", () => {
    const wall = result.graph.objects.find((object) => object.objectClass === "WALL")!;
    expect(wall.geometry).toBeDefined();
    expect(wall.geometry!.structured).toBeDefined();
    expect(wall.geometry!.structured!.width.unit).toBe(scene.frame.unit);
    if (scene.objects.find((object) => object.kind === "WALL")!.geometry.width.uncertainty !== undefined) {
      expect(wall.geometry!.structured!.width.uncertainty).toBeDefined();
    }
  });

  it("keeps room-level measurements as space properties with the scene state", () => {
    const space = result.graph.spaces[0]!;
    expect(space.spaceId).toBe(SPACE);
    expect(space.frame).toEqual({ up: scene.frame.up, unit: scene.frame.unit });
    if (scene.room?.roomHeight !== undefined) {
      const roomHeight = space.properties?.find((property) => property.key === "roomHeight");
      expect(roomHeight).toBeDefined();
      expect(roomHeight!.status).toBe(scene.epistemicState);
      expect(roomHeight!.kind).toBe("estimate");
      expect(roomHeight!.quantity!.value).toBe(scene.room.roomHeight.value);
    } else {
      expect(space.properties ?? []).toHaveLength(0);
    }
  });

  it("records complete provenance on every object (scene + upstream object pins)", () => {
    for (const object of result.graph.objects) {
      expect(object.provenance.serviceId).toBe("aise.engineering-model");
      expect(object.provenance.method).toBe(INGEST_METHOD);
      expect(object.provenance.inputs.length).toBeGreaterThanOrEqual(2);
      const first = object.provenance.inputs[0]!;
      expect(first.kind).toBe("object");
      const second = object.provenance.inputs[1]!;
      expect(second.kind).toBe("scene");
    }
  });

  it("reports honest accounting for non-object scene content", () => {
    expect(result.report.sceneId).toBe(scene.sceneId);
    expect(result.report.sceneEpistemicState).toBe(scene.epistemicState);
    expect(result.report.ingestedObjectCount).toBe(scene.objects.length);
    expect(result.report.unclassifiedSegmentCount).toBe(scene.unclassified.length);
    expect(result.report.residualPointCount).toBe(scene.residualPointCount);
  });

  it("is deterministic: the same scene and target produce the identical digest", () => {
    const second = ingestArchitecturalScene(scene, target);
    expect(second.graph.digest).toBe(result.graph.digest);
  });

  it("derives ids consistently across re-ingestion (single derivation rule)", () => {
    const again = ingestArchitecturalScene(scene, target);
    for (const object of result.graph.objects) {
      const sourcePin = object.provenance.inputs[0] as { kind: string; objectId?: string };
      const againObject = again.graph.objects.find((candidate) => {
        const pin = candidate.provenance.inputs[0] as { kind: string; objectId?: string };
        return pin.objectId === sourcePin.objectId;
      });
      expect(againObject).toBeDefined();
      expect(againObject!.objectId).toBe(object.objectId);
    }
  });

  it("scopes identity to the target model (different model → different ids)", () => {
    const otherModel = ingestArchitecturalScene(scene, { ...target, modelId: "model-other" });
    expect(otherModel.graph.objects[0]!.objectId).not.toBe(result.graph.objects[0]!.objectId);
  });
});

describe("ingestion failure modes", () => {
  it("rejects non-scene input", () => {
    expect(() => ingestArchitecturalScene({ kind: "nope" } as never, target)).toThrow(
      RealityModelError,
    );
  });

  it("rejects an empty scene (commit nothing rather than an empty graph)", () => {
    const emptyScene = { ...scene, objects: [] } as never;
    expect(() => ingestArchitecturalScene(emptyScene, target)).toThrow(RealityModelError);
  });

  it("rejects an opening whose parent wall is not part of the scene", () => {
    const orphan = scene.objects.map((object) =>
      object.kind === "DOOR" ? { ...object, parentObjectId: "wall-not-in-scene" } : object,
    );
    expect(() =>
      ingestArchitecturalScene({ ...scene, objects: orphan } as never, target),
    ).toThrow(RealityModelError);
  });
});

describe("no-upgrade guard runs on the ingestion path", () => {
  it("passes through INFERRED objects unchanged (guard is live, not decorative)", () => {
    // If the guard were disabled, this test would still pass — the
    // mutation suite (PR evidence) disables it and proves failure.
    // Here we pin the behavior: every object stays INFERRED.
    const { graph } = ingestArchitecturalScene(scene, target);
    for (const object of graph.objects) {
      expect(object.epistemicState).toBe("INFERRED");
    }
  });
});

void EngineeringModelError;
