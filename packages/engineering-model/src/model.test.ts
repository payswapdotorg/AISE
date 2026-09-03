/**
 * Reality Graph assembly tests: every invariant of
 * `assembleModelGraph` — identity, referential integrity,
 * relationship type constraints, space hierarchy, semantic
 * consistency, canonical ordering, freezing, digest.
 */
import { describe, expect, it } from "vitest";
import { EngineeringModelError } from "./errors.js";
import {
  assembleModelGraph,
  graphEpistemicState,
  makeRealityObject,
  makeRelationship,
  makeSpaceNode,
  type RealityObjectInput,
  type RelationshipInput,
} from "./model.js";
import { HASH_A, objectProvenance, objectRef, planarGeometry, estimateAssertion } from "./testing.js";

const MODEL = "model-1";
const PROJECT = "project-1";
const SPACE = "room-1";

/** A valid WALL object input. */
function wallInput(overrides: Partial<RealityObjectInput> = {}): RealityObjectInput {
  return {
    objectClass: "WALL",
    structuredGeometry: planarGeometry() as never,
    properties: [],
    epistemicState: "INFERRED",
    provenance: objectProvenance(),
    ...overrides,
  };
}

/** A valid DOOR object input (different upstream identity). */
function doorInput(): RealityObjectInput {
  return {
    objectClass: "DOOR",
    structuredGeometry: planarGeometry() as never,
    properties: [],
    epistemicState: "INFERRED",
    provenance: objectProvenance({
      inputs: [objectRef({ objectId: "door-0123456789abcdef", method: "opening/grid-gap-v1" })],
    }),
  };
}

/** Assembles a minimal valid graph: one wall + one door in one space. */
function validGraphInput() {
  const wall = makeRealityObject(MODEL, wallInput());
  const door = makeRealityObject(MODEL, doorInput());
  return {
    modelId: MODEL,
    projectId: PROJECT,
    spaces: [{ spaceId: SPACE, kind: "ROOM" as const }],
    objects: [wallInput(), doorInput()],
    relationships: [
      { type: "CONTAINS" as const, fromId: SPACE, toId: wall.objectId },
      { type: "CONTAINS" as const, fromId: SPACE, toId: door.objectId },
      { type: "OPENING_IN" as const, fromId: door.objectId, toId: wall.objectId },
    ],
  };
}

describe("assembly (the happy path)", () => {
  it("assembles a valid graph with canonical ordering and a digest", () => {
    const graph = assembleModelGraph(validGraphInput());
    expect(graph.modelId).toBe(MODEL);
    expect(graph.projectId).toBe(PROJECT);
    expect(graph.spaces).toHaveLength(1);
    expect(graph.objects).toHaveLength(2);
    expect(graph.relationships).toHaveLength(3);
    expect(graph.digest).toMatch(/^[0-9a-f]{64}$/);
    // Canonical object order: WALL (rank 2) before DOOR (rank 3).
    expect(graph.objects[0]!.objectClass).toBe("WALL");
    expect(graph.objects[1]!.objectClass).toBe("DOOR");
  });

  it("orders relationships canonically (type, from, to)", () => {
    const graph = assembleModelGraph(validGraphInput());
    expect(graph.relationships.map((rel) => rel.type)).toEqual(["CONTAINS", "CONTAINS", "OPENING_IN"]);
  });

  it("deep-freezes the graph (immutable by construction)", () => {
    const graph = assembleModelGraph(validGraphInput());
    expect(Object.isFrozen(graph)).toBe(true);
    expect(Object.isFrozen(graph.objects)).toBe(true);
    expect(Object.isFrozen(graph.objects[0]!)).toBe(true);
    expect(() => {
      (graph.objects as unknown as unknown[]).push({});
    }).toThrow(TypeError);
  });

  it("is digest-invariant to input order (permutation invariance)", () => {
    const input = validGraphInput();
    const reversed = {
      ...input,
      objects: [...input.objects].reverse(),
      relationships: [...input.relationships].reverse(),
      spaces: [...input.spaces].reverse(),
    };
    expect(assembleModelGraph(input).digest).toBe(assembleModelGraph(reversed).digest);
  });

  it("is fully deterministic (bit-identical for the same input)", () => {
    expect(assembleModelGraph(validGraphInput()).digest).toBe(
      assembleModelGraph(validGraphInput()).digest,
    );
  });
});

describe("identity", () => {
  it("rejects duplicate object identities (IDENTITY_COLLISION)", () => {
    const input = validGraphInput();
    // Same upstream pin twice → same derived id.
    expect(() => assembleModelGraph({ ...input, objects: [wallInput(), wallInput()] })).toThrow(
      EngineeringModelError,
    );
  });

  it("rejects a space id colliding with an object id", () => {
    const wall = makeRealityObject(MODEL, wallInput());
    const input = validGraphInput();
    expect(() =>
      assembleModelGraph({
        ...input,
        spaces: [{ spaceId: wall.objectId, kind: "ROOM" }],
      }),
    ).toThrow(EngineeringModelError);
  });

  it("derives object ids from the provenance source pin", () => {
    const wall = makeRealityObject(MODEL, wallInput());
    const door = makeRealityObject(MODEL, doorInput());
    expect(wall.objectId).not.toBe(door.objectId);
    expect(wall.objectId).toMatch(/^ro-[0-9a-f]{16}$/);
  });

  it("requires the upstream object reference as the first provenance input", () => {
    expect(() =>
      makeRealityObject(MODEL, {
        ...wallInput(),
        provenance: objectProvenance({
          inputs: [objectRef(), objectRef({ objectId: "door-0123456789abcdef" })],
        }),
      }),
    ).not.toThrow();
    // First input not an object ref → identity undefined → fail closed.
    expect(() =>
      makeRealityObject(MODEL, {
        ...wallInput(),
        provenance: objectProvenance({
          inputs: [
            {
              kind: "scene",
              sceneId: "scene-0123456789abcdef",
              contentHash: HASH_A,
              epistemic: "INFERRED",
            },
          ],
        }),
      }),
    ).toThrow(EngineeringModelError);
  });
});

describe("referential integrity", () => {
  it("rejects relationships with dangling endpoints", () => {
    const input = validGraphInput();
    const dangling: RelationshipInput[] = [
      { type: "CONTAINS", fromId: SPACE, toId: "ro-doesnotexist" },
    ];
    expect(() => assembleModelGraph({ ...input, relationships: dangling })).toThrow(
      EngineeringModelError,
    );
  });

  it("rejects CONTAINS originating at an object (type constraint, not just self-reference)", () => {
    const wall = makeRealityObject(MODEL, wallInput());
    const door = makeRealityObject(MODEL, doorInput());
    const input = validGraphInput();
    expect(() =>
      assembleModelGraph({
        ...input,
        relationships: [{ type: "CONTAINS", fromId: door.objectId, toId: wall.objectId }],
      }),
    ).toThrow(/CONTAINS must originate at a space/);
  });

  it("rejects CONTAINS targeting a space (type constraint, not just self-reference)", () => {
    const input = validGraphInput();
    expect(() =>
      assembleModelGraph({
        ...input,
        spaces: [input.spaces[0]!, { spaceId: "site-1", kind: "SITE" }],
        relationships: [{ type: "CONTAINS", fromId: SPACE, toId: "site-1" }],
      }),
    ).toThrow(/CONTAINS must target an object/);
  });

  it("rejects OPENING_IN from a WALL", () => {
    const wall = makeRealityObject(MODEL, wallInput());
    const door = makeRealityObject(MODEL, doorInput());
    const input = validGraphInput();
    expect(() =>
      assembleModelGraph({
        ...input,
        relationships: [{ type: "OPENING_IN", fromId: wall.objectId, toId: door.objectId }],
      }),
    ).toThrow(EngineeringModelError);
  });

  it("rejects OPENING_IN targeting a non-WALL", () => {
    const door = makeRealityObject(MODEL, doorInput());
    const input = validGraphInput();
    expect(() =>
      assembleModelGraph({
        ...input,
        relationships: [{ type: "OPENING_IN", fromId: door.objectId, toId: door.objectId }],
      }),
    ).toThrow(EngineeringModelError);
  });

  it("rejects duplicate relationship triples", () => {
    const input = validGraphInput();
    const wall = makeRealityObject(MODEL, wallInput());
    const doubled = [
      ...input.relationships,
      { type: "CONTAINS" as const, fromId: SPACE, toId: wall.objectId },
    ];
    expect(() => assembleModelGraph({ ...input, relationships: doubled })).toThrow(
      EngineeringModelError,
    );
  });

  it("rejects objects contained by no space (no orphans)", () => {
    const input = validGraphInput();
    expect(() => assembleModelGraph({ ...input, relationships: [] })).toThrow(
      EngineeringModelError,
    );
  });

  it("rejects a door with no OPENING_IN parent (openings live in walls)", () => {
    const wall = makeRealityObject(MODEL, wallInput());
    const door = makeRealityObject(MODEL, doorInput());
    const input = validGraphInput();
    expect(() =>
      assembleModelGraph({
        ...input,
        relationships: [
          { type: "CONTAINS", fromId: SPACE, toId: wall.objectId },
          { type: "CONTAINS", fromId: SPACE, toId: door.objectId },
        ],
      }),
    ).toThrow(EngineeringModelError);
  });

  it("rejects self-referencing relationships", () => {
    expect(() => makeRelationship({ type: "CONTAINS", fromId: SPACE, toId: SPACE })).toThrow(
      EngineeringModelError,
    );
  });
});

describe("space hierarchy", () => {
  it("accepts a descending hierarchy with declared frames", () => {
    const graph = assembleModelGraph({
      modelId: MODEL,
      projectId: PROJECT,
      spaces: [
        { spaceId: "site-1", kind: "SITE" },
        { spaceId: "bldg-1", kind: "BUILDING", parentSpaceId: "site-1" },
        { spaceId: SPACE, kind: "ROOM", parentSpaceId: "bldg-1", frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" } },
      ],
      ...objectsAndRelationshipsFor(validGraphInput()),
    });
    expect(graph.spaces).toHaveLength(3);
  });

  it("rejects unknown parents", () => {
    const input = validGraphInput();
    expect(() =>
      assembleModelGraph({
        ...input,
        spaces: [{ spaceId: SPACE, kind: "ROOM", parentSpaceId: "site-missing" }],
      }),
    ).toThrow(EngineeringModelError);
  });

  it("rejects ascending hierarchy (a room containing a site)", () => {
    const input = validGraphInput();
    expect(() =>
      assembleModelGraph({
        ...input,
        spaces: [
          { spaceId: SPACE, kind: "ROOM" },
          { spaceId: "site-1", kind: "SITE", parentSpaceId: SPACE },
        ],
      }),
    ).toThrow(EngineeringModelError);
  });

  it("rejects self-parenting and cycles", () => {
    const input = validGraphInput();
    expect(() =>
      assembleModelGraph({ ...input, spaces: [{ spaceId: SPACE, kind: "ROOM", parentSpaceId: SPACE }] }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      assembleModelGraph({
        ...input,
        spaces: [
          { spaceId: "a", kind: "LEVEL", parentSpaceId: "b" },
          { spaceId: "b", kind: "FACILITY", parentSpaceId: "a" },
        ],
      }),
    ).toThrow(EngineeringModelError);
  });

  it("validates declared coordinate frames", () => {
    const input = validGraphInput();
    expect(() =>
      assembleModelGraph({
        ...input,
        spaces: [{ spaceId: SPACE, kind: "ROOM", frame: { up: { x: 0, y: 0, z: 2 }, unit: "meter" } }],
      }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      assembleModelGraph({
        ...input,
        spaces: [{ spaceId: SPACE, kind: "ROOM", frame: { up: { x: 0, y: 0, z: 1 }, unit: "degree" as never } }],
      }),
    ).toThrow(EngineeringModelError);
  });
});

describe("entity validation", () => {
  it("rejects invalid space ids and kinds", () => {
    expect(() => makeSpaceNode({ spaceId: "bad id", kind: "ROOM" })).toThrow(EngineeringModelError);
    expect(() => makeSpaceNode({ spaceId: "s", kind: "PLANET" as never })).toThrow(EngineeringModelError);
  });

  it("rejects invalid object classes and epistemic states", () => {
    expect(() => makeRealityObject(MODEL, { ...wallInput(), objectClass: "ROOF" as never })).toThrow(
      EngineeringModelError,
    );
    expect(() => makeRealityObject(MODEL, { ...wallInput(), epistemicState: "GUESSED" as never })).toThrow(
      EngineeringModelError,
    );
  });

  it("rejects duplicate property keys per entity", () => {
    expect(() =>
      makeRealityObject(MODEL, {
        ...wallInput(),
        properties: [estimateAssertion("width", 1), estimateAssertion("width", 2)],
      }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      makeSpaceNode({
        spaceId: SPACE,
        kind: "ROOM",
        properties: [estimateAssertion("h", 1), estimateAssertion("h", 2)],
      }),
    ).toThrow(EngineeringModelError);
  });

  it("rejects invalid model/project ids", () => {
    const input = validGraphInput();
    expect(() => assembleModelGraph({ ...input, modelId: "" })).toThrow(EngineeringModelError);
    expect(() => assembleModelGraph({ ...input, projectId: "bad id" })).toThrow(EngineeringModelError);
  });

  it("validates property assertions on objects (producing path)", () => {
    expect(() =>
      makeRealityObject(MODEL, {
        ...wallInput(),
        properties: [estimateAssertion("width", Number.NaN)],
      }),
    ).toThrow(EngineeringModelError);
  });
});

describe("graph epistemic summary", () => {
  it("derives the weakest state across objects and assertions", () => {
    const graph = assembleModelGraph(validGraphInput());
    expect(graphEpistemicState(graph)).toBe("INFERRED");

    const proposed = assembleModelGraph({
      ...validGraphInput(),
      objects: validGraphInput().objects.map((object) => ({ ...object, epistemicState: "PROPOSED" as const })),
    });
    expect(graphEpistemicState(proposed)).toBe("PROPOSED");
  });

  it("never outranks the weakest member", () => {
    const input = validGraphInput();
    const graph = assembleModelGraph({
      ...input,
      objects: input.objects.map((object, index) =>
        index === 0 ? { ...object, epistemicState: "OBSERVED" as const } : object,
      ),
    });
    expect(graphEpistemicState(graph)).toBe("INFERRED");
  });
});

/** Objects/relationships of a graph input without its spaces (for hierarchy tests). */
function objectsAndRelationshipsFor(input: ReturnType<typeof validGraphInput>) {
  return { objects: input.objects, relationships: input.relationships };
}
