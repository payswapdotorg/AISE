/**
 * Derived read-view tests: containment, openings, ancestry,
 * interchange references, counts — all derived from the graph,
 * never stored.
 */
import { describe, expect, it } from "vitest";
import {
  assembleModelGraph,
  makeRealityObject,
  type RealityObjectInput,
} from "./model.js";
import {
  containingSpacesOf,
  graphCounts,
  modelEpistemicSummary,
  objectsInSpace,
  objectsOfClass,
  openingsOfWall,
  parentWallOf,
  relationshipsOf,
  spaceAncestry,
  toModelObjectRef,
} from "./query.js";
import { estimateAssertion, objectProvenance, objectRef, planarGeometry } from "./testing.js";

const MODEL = "model-1";
const SPACE = "room-1";

function input(class_: "WALL" | "DOOR" | "WINDOW", sourceObjectId: string): RealityObjectInput {
  return {
    objectClass: class_,
    structuredGeometry: planarGeometry() as never,
    properties: [],
    epistemicState: "INFERRED",
    provenance: objectProvenance({
      inputs: [objectRef({ objectId: sourceObjectId })],
    }),
  };
}

function buildGraph() {
  const wall = input("WALL", "wall-a");
  const wall2 = input("WALL", "wall-b");
  const door = input("DOOR", "door-a");
  const window = input("WINDOW", "window-a");
  const assembled = {
    wall: makeRealityObject(MODEL, wall),
    wall2: makeRealityObject(MODEL, wall2),
    door: makeRealityObject(MODEL, door),
    window: makeRealityObject(MODEL, window),
  };
  const graph = assembleModelGraph({
    modelId: MODEL,
    projectId: "project-1",
    spaces: [
      { spaceId: "site-1", kind: "SITE" },
      { spaceId: "bldg-1", kind: "BUILDING", parentSpaceId: "site-1" },
      {
        spaceId: SPACE,
        kind: "ROOM",
        parentSpaceId: "bldg-1",
        properties: [estimateAssertion("roomHeight", 2.7)],
      },
    ],
    objects: [wall, wall2, door, window],
    relationships: [
      { type: "CONTAINS", fromId: SPACE, toId: assembled.wall.objectId },
      { type: "CONTAINS", fromId: SPACE, toId: assembled.wall2.objectId },
      { type: "CONTAINS", fromId: SPACE, toId: assembled.door.objectId },
      { type: "CONTAINS", fromId: SPACE, toId: assembled.window.objectId },
      { type: "OPENING_IN", fromId: assembled.door.objectId, toId: assembled.wall.objectId },
      { type: "OPENING_IN", fromId: assembled.window.objectId, toId: assembled.wall.objectId },
    ],
  });
  return { graph, assembled };
}

describe("containment views", () => {
  it("derives objects in a space from CONTAINS relationships", () => {
    const { graph } = buildGraph();
    expect(objectsInSpace(graph, SPACE)).toHaveLength(4);
    expect(objectsInSpace(graph, "site-1")).toHaveLength(0);
  });

  it("derives the containing spaces of an object", () => {
    const { graph, assembled } = buildGraph();
    const containers = containingSpacesOf(graph, assembled.wall.objectId);
    expect(containers.map((space) => space.spaceId)).toEqual([SPACE]);
  });

  it("derives space ancestry root-first", () => {
    const { graph } = buildGraph();
    expect(spaceAncestry(graph, SPACE).map((space) => space.spaceId)).toEqual(["site-1", "bldg-1"]);
    expect(spaceAncestry(graph, "site-1")).toHaveLength(0);
  });
});

describe("opening views", () => {
  it("derives the openings of a wall (no stored counts — no drift)", () => {
    const { graph, assembled } = buildGraph();
    const openings = openingsOfWall(graph, assembled.wall.objectId);
    expect(openings).toHaveLength(2);
    expect(openings.map((opening) => opening.objectClass).sort()).toEqual(["DOOR", "WINDOW"]);
    expect(openingsOfWall(graph, assembled.wall2.objectId)).toHaveLength(0);
  });

  it("derives the parent wall of an opening", () => {
    const { graph, assembled } = buildGraph();
    expect(parentWallOf(graph, assembled.door.objectId)?.objectId).toBe(assembled.wall.objectId);
    expect(parentWallOf(graph, assembled.wall.objectId)).toBeUndefined();
  });
});

describe("class and relationship views", () => {
  it("filters objects by class", () => {
    const { graph } = buildGraph();
    expect(objectsOfClass(graph, "WALL")).toHaveLength(2);
    expect(objectsOfClass(graph, "DOOR")).toHaveLength(1);
  });

  it("lists relationships with the entity's role", () => {
    const { graph, assembled } = buildGraph();
    const wallRelations = relationshipsOf(graph, assembled.wall.objectId);
    expect(wallRelations).toHaveLength(3); // CONTAINS(to) + 2× OPENING_IN(to)
    expect(wallRelations.every((rel) => rel.role === "to")).toBe(true);
    const doorRelations = relationshipsOf(graph, assembled.door.objectId);
    expect(doorRelations).toHaveLength(2); // CONTAINS(to) + OPENING_IN(from)
    expect(doorRelations.find((rel) => rel.type === "OPENING_IN")?.role).toBe("from");
  });
});

describe("interchange and summaries", () => {
  it("derives the shared-contract ModelObjectRef", () => {
    const { graph, assembled } = buildGraph();
    const ref = toModelObjectRef(graph, assembled.wall, 3);
    expect(ref).toEqual({ modelId: MODEL, version: 3, objectId: assembled.wall.objectId });
  });

  it("derives graph counts", () => {
    const { graph } = buildGraph();
    const counts = graphCounts(graph);
    expect(counts.spaces).toBe(3);
    expect(counts.objects).toBe(4);
    expect(counts.relationships).toBe(6);
    expect(counts.objectsByClass).toEqual({ WALL: 2, DOOR: 1, WINDOW: 1 });
  });

  it("derives the model epistemic summary (weakest state)", () => {
    const { graph } = buildGraph();
    expect(modelEpistemicSummary(graph)).toBe("INFERRED");
  });
});
