/**
 * Version diff and epistemic-change tests: honest diffs with no
 * correspondence claims.
 */
import { describe, expect, it } from "vitest";
import { EngineeringModelError } from "./errors.js";
import {
  assembleModelGraph,
  makeRealityObject,
  type RealityObjectInput,
} from "./model.js";
import { diffModelGraphs, epistemicChangesBetween } from "./version.js";
import { objectProvenance, objectRef, planarGeometry } from "./testing.js";

const MODEL = "model-1";
const PROJECT = "project-1";
const SPACE = "room-1";

function wallInput(sourceObjectId: string, value = 4): RealityObjectInput {
  return {
    objectClass: "WALL",
    structuredGeometry: planarGeometry() as never,
    properties: [],
    epistemicState: "INFERRED",
    provenance: objectProvenance({
      inputs: [objectRef({ objectId: sourceObjectId, method: "structure/wall-rectangle-v1" })],
      parameters: { sourceObjectId, value },
    }),
  };
}

function graphWith(objects: RealityObjectInput[], modelId = MODEL) {
  const assembled = objects.map((input) => makeRealityObject(modelId, input));
  return assembleModelGraph({
    modelId,
    projectId: PROJECT,
    spaces: [{ spaceId: SPACE, kind: "ROOM" }],
    objects,
    relationships: assembled.map((object) => ({
      type: "CONTAINS" as const,
      fromId: SPACE,
      toId: object.objectId,
    })),
  });
}

describe("diffModelGraphs", () => {
  it("reports identical graphs as identical", () => {
    const a = graphWith([wallInput("wall-a"), wallInput("wall-b")]);
    const b = graphWith([wallInput("wall-a"), wallInput("wall-b")]);
    const diff = diffModelGraphs(a, b, { fromVersion: 1, toVersion: 2 });
    expect(diff.summary.identical).toBe(true);
    expect(diff.addedObjectIds).toHaveLength(0);
    expect(diff.removedObjectIds).toHaveLength(0);
    expect(diff.changedObjects).toHaveLength(0);
  });

  it("reports added and removed objects by identity", () => {
    const a = graphWith([wallInput("wall-a"), wallInput("wall-b")]);
    const b = graphWith([wallInput("wall-b"), wallInput("wall-c")]);
    const diff = diffModelGraphs(a, b, { fromVersion: 1, toVersion: 2 });
    expect(diff.removedObjectIds).toHaveLength(1);
    expect(diff.addedObjectIds).toHaveLength(1);
    expect(diff.summary).toEqual({ added: 1, removed: 1, changed: 0, identical: false });
  });

  it("reports changed content under a persistent identity", () => {
    const a = graphWith([wallInput("wall-a")]);
    const b = graphWith([wallInput("wall-a")]);
    // Same identity inputs; change the content only (e.g. a corrected quantity):
    const mutated = {
      ...b.objects[0]!,
      geometry: undefined,
      properties: b.objects[0]!.properties,
      contentHash: "f".repeat(64),
    } as never;
    // Build the changed graph by assembling with a different content input:
    const changedInput: RealityObjectInput = {
      ...wallInput("wall-a"),
      structuredGeometry: planarGeometry({ width: { value: 4.5, unit: "meter" } }) as never,
    };
    const bChanged = graphWith([changedInput]);
    const diff = diffModelGraphs(a, bChanged, { fromVersion: 1, toVersion: 2 });
    expect(diff.changedObjects).toHaveLength(1);
    expect(diff.changedObjects[0]!.objectId).toBe(
      makeRealityObject(MODEL, wallInput("wall-a")).objectId,
    );
    expect(diff.summary.changed).toBe(1);
    void mutated;
  });

  it("never claims correspondence when identity changed (re-extraction)", () => {
    // wall-a re-extracted with different upstream content → new identity.
    const a = graphWith([wallInput("wall-a")]);
    const b = graphWith([wallInput("wall-a2")]);
    const diff = diffModelGraphs(a, b, { fromVersion: 1, toVersion: 2 });
    expect(diff.removedObjectIds).toHaveLength(1);
    expect(diff.addedObjectIds).toHaveLength(1);
    expect(diff.changedObjects).toHaveLength(0);
  });

  it("reports relationship and space changes", () => {
    const a = graphWith([wallInput("wall-a")]);
    const b = graphWith([wallInput("wall-a")]);
    const diff = diffModelGraphs(a, b, { fromVersion: 1, toVersion: 2 });
    // Same graph → no relationship/space changes.
    expect(diff.addedRelationships).toHaveLength(0);
    expect(diff.removedRelationships).toHaveLength(0);
    expect(diff.addedSpaceIds).toHaveLength(0);
    expect(diff.removedSpaceIds).toHaveLength(0);

    // Different space id → space change.
    const c = assembleModelGraph({
      modelId: MODEL,
      projectId: PROJECT,
      spaces: [{ spaceId: "room-2", kind: "ROOM" }],
      objects: [wallInput("wall-a")],
      relationships: [
        {
          type: "CONTAINS",
          fromId: "room-2",
          toId: makeRealityObject(MODEL, wallInput("wall-a")).objectId,
        },
      ],
    });
    const diffSpaces = diffModelGraphs(a, c, { fromVersion: 1, toVersion: 2 });
    expect(diffSpaces.addedSpaceIds).toEqual(["room-2"]);
    expect(diffSpaces.removedSpaceIds).toEqual([SPACE]);
  });

  it("fails closed on cross-model diffs", () => {
    const a = graphWith([wallInput("wall-a")]);
    const b = graphWith([wallInput("wall-a")], "model-2");
    expect(() => diffModelGraphs(a, b, { fromVersion: 1, toVersion: 2 })).toThrow(
      EngineeringModelError,
    );
  });
});

describe("epistemicChangesBetween", () => {
  it("surfaces epistemic upgrades explicitly (never silent)", () => {
    const a = graphWith([wallInput("wall-a")]);
    const b = graphWith([
      { ...wallInput("wall-a"), epistemicState: "CONFIRMED" as const },
    ]);
    const changes = epistemicChangesBetween(a, b);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.previousState).toBe("INFERRED");
    expect(changes[0]!.currentState).toBe("CONFIRMED");
  });

  it("reports nothing when states are unchanged", () => {
    const a = graphWith([wallInput("wall-a")]);
    const b = graphWith([wallInput("wall-a")]);
    expect(epistemicChangesBetween(a, b)).toHaveLength(0);
  });

  it("ignores objects that no longer exist (identity-based)", () => {
    const a = graphWith([wallInput("wall-a")]);
    const b = graphWith([wallInput("wall-b")]);
    expect(epistemicChangesBetween(a, b)).toHaveLength(0);
  });
});
