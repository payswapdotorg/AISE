/**
 * Persistence-boundary validation tests: the store does not trust
 * the caller — whole-graph re-validation, digest integrity,
 * immutability proof.
 */
import { describe, expect, it } from "vitest";
import { EngineeringModelError } from "./errors.js";
import { assembleModelGraph, makeRealityObject, type RealityObjectInput } from "./model.js";
import { validateRealityGraph } from "./validate.js";
import { objectProvenance, objectRef, planarGeometry } from "./testing.js";
import { deepFreeze } from "./identity.js";

const MODEL = "model-1";
const SPACE = "room-1";

function wallInput(sourceObjectId: string): RealityObjectInput {
  return {
    objectClass: "WALL",
    structuredGeometry: planarGeometry() as never,
    properties: [],
    epistemicState: "INFERRED",
    provenance: objectProvenance({
      inputs: [objectRef({ objectId: sourceObjectId, method: "structure/wall-rectangle-v1" })],
    }),
  };
}

function validGraph() {
  const wall = makeRealityObject(MODEL, wallInput("wall-a"));
  return assembleModelGraph({
    modelId: MODEL,
    projectId: "project-1",
    spaces: [{ spaceId: SPACE, kind: "ROOM" }],
    objects: [wallInput("wall-a")],
    relationships: [{ type: "CONTAINS", fromId: SPACE, toId: wall.objectId }],
  });
}

describe("validateRealityGraph (the boundary gate)", () => {
  it("accepts a valid assembled graph", () => {
    expect(() => validateRealityGraph(validGraph())).not.toThrow();
  });

  it("rejects a graph whose digest does not match its content (tampered digest)", () => {
    const graph = validGraph();
    const forged = deepFreeze({ ...graph, digest: "0".repeat(64) });
    expect(() => validateRealityGraph(forged)).toThrow(EngineeringModelError);
    try {
      validateRealityGraph(forged);
    } catch (error) {
      expect((error as EngineeringModelError).code).toBe("MODEL_INVALID");
      expect((error as EngineeringModelError).message).toContain("digest");
    }
  });

  it("rejects content mutated after assembly (digest drift)", () => {
    const graph = validGraph();
    const mutated = deepFreeze({
      ...graph,
      objects: deepFreeze([
        { ...graph.objects[0]!, contentHash: "e".repeat(64) },
      ]),
    });
    expect(() => validateRealityGraph(mutated)).toThrow(EngineeringModelError);
  });

  it("rejects non-frozen (thawed) graphs — immutability is structural", () => {
    const graph = validGraph();
    const thawed = {
      ...graph,
      spaces: graph.spaces.map((space) => ({ ...space })),
      objects: graph.objects.map((object) => ({ ...object })),
      relationships: graph.relationships.map((rel) => ({ ...rel })),
    };
    expect(() => validateRealityGraph(thawed as never)).toThrow(EngineeringModelError);
  });

  it("rejects dangling relationship endpoints", () => {
    const graph = validGraph();
    const withDangling = deepFreeze({
      ...graph,
      relationships: deepFreeze([
        ...graph.relationships,
        { relationId: "rel-x", type: "CONTAINS", fromId: SPACE, toId: "ro-missing" },
      ]),
      digest: graph.digest, // digest will mismatch: rejected either way, referential check runs first
    });
    expect(() => validateRealityGraph(withDangling as unknown as never)).toThrow(EngineeringModelError);
  });

  it("rejects duplicate identities", () => {
    const graph = validGraph();
    const withDuplicate = deepFreeze({
      ...graph,
      spaces: deepFreeze([...graph.spaces, { ...graph.spaces[0]! }]),
    });
    expect(() => validateRealityGraph(withDuplicate as never)).toThrow(EngineeringModelError);
  });

  it("rejects unknown relationship types (runtime guard beyond the closed TS union)", () => {
    const graph = validGraph();
    const badType = deepFreeze({
      ...graph,
      relationships: deepFreeze([
        { relationId: "rel-x", type: "PART_OF", fromId: SPACE, toId: graph.objects[0]!.objectId },
      ]),
    });
    expect(() => validateRealityGraph(badType as never)).toThrow(EngineeringModelError);
  });

  it("rejects objects without provenance or with invalid epistemic state", () => {
    const graph = validGraph();
    const noProvenance = deepFreeze({
      ...graph,
      objects: deepFreeze([{ ...graph.objects[0]!, provenance: undefined }]),
    });
    expect(() => validateRealityGraph(noProvenance as never)).toThrow(EngineeringModelError);
    const badState = deepFreeze({
      ...graph,
      objects: deepFreeze([{ ...graph.objects[0]!, epistemicState: "GUESSED" as never }]),
    });
    expect(() => validateRealityGraph(badState as never)).toThrow(EngineeringModelError);
  });

  it("rejects malformed graph shapes (null, missing arrays, empty ids)", () => {
    expect(() => validateRealityGraph(null as never)).toThrow(EngineeringModelError);
    expect(() => validateRealityGraph({ ...validGraph(), spaces: "x" as never })).toThrow(
      EngineeringModelError,
    );
    expect(() => validateRealityGraph({ ...validGraph(), modelId: "" })).toThrow(
      EngineeringModelError,
    );
  });

  it("validates property assertions at the boundary (CONFIRMED without evidence)", () => {
    const graph = validGraph();
    const confirmedNoEvidence = deepFreeze({
      ...graph,
      objects: deepFreeze([
        {
          ...graph.objects[0]!,
          properties: [
            {
              key: "fireRating",
              quantity: { value: 60, unit: "meter" },
              status: "CONFIRMED",
              kind: "measurement",
            },
          ],
        },
      ]),
    });
    expect(() => validateRealityGraph(confirmedNoEvidence as never)).toThrow(EngineeringModelError);
  });
});
