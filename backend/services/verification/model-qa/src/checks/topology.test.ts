import { describe, expect, it } from "vitest";
import { runModelQa } from "../runtime.js";
import { handBuiltGraph, smallRoomGraph } from "../testing.js";

const PROFILE = "CRITICAL" as const;

function qa(graph: ReturnType<typeof smallRoomGraph>, profile = PROFILE) {
  return runModelQa({ graph, version: 1, profile });
}

function codes(report: ReturnType<typeof qa>): string[] {
  return report.findings.map((finding) => finding.code);
}

describe("topology family — space hierarchy", () => {
  it("clean fixture room: no topology findings", () => {
    expect(codes(qa(smallRoomGraph())).filter((code) => code.startsWith("HIERARCHY") || code.startsWith("MULTI") || code.startsWith("OPENING_SPACE"))).toEqual([]);
  });

  it("parent rank not strictly lower is HIERARCHY_RANK_INVALID (constructor-bypassed)", () => {
    // ROOM parent BUILDING would be legal (rank 2 < 4); make the parent a
    // ROOM itself — rank 4 is not < 4.
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const space = draft.spaces[0]!;
      const parent = { ...space, spaceId: "sp-parent-room", parentSpaceId: undefined };
      parent.spaceId = "sp-parent-room";
      draft.spaces.push(parent);
      space.parentSpaceId = "sp-parent-room";
    });
    const report = qa(graph);
    expect(codes(report)).toContain("HIERARCHY_RANK_INVALID");
    const finding = report.findings.find((f) => f.code === "HIERARCHY_RANK_INVALID")!;
    expect(finding.outcome).toBe("CONTRADICTION");
    expect(finding.blocking).toBe(true);
  });

  it("a legal parent (ROOM → BUILDING) produces no finding", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const space = draft.spaces[0]!;
      const building = { ...space, spaceId: "sp-building", kind: "BUILDING", parentSpaceId: undefined };
      draft.spaces.push(building);
      space.parentSpaceId = "sp-building";
    });
    expect(codes(qa(graph))).not.toContain("HIERARCHY_RANK_INVALID");
  });
});

describe("topology family — containment claims", () => {
  it("an object claimed by two spaces is MULTI_CONTAINER", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const space = draft.spaces[0]!;
      const otherRoom = { ...space, spaceId: "sp-other-room" };
      draft.spaces.push(otherRoom);
      const object = draft.objects[0]! as { objectId: string };
      draft.relationships.push({ type: "CONTAINS", fromId: "sp-other-room", toId: object.objectId, relationId: "rel-extra-1" });
    });
    const report = qa(graph);
    expect(codes(report)).toContain("MULTI_CONTAINER");
    const finding = report.findings.find((f) => f.code === "MULTI_CONTAINER")!;
    expect(finding.actual).toContain("2 containers");
  });

  it("exactly one container is fine", () => {
    expect(codes(qa(smallRoomGraph()))).not.toContain("MULTI_CONTAINER");
  });
});

describe("topology family — hosting claims", () => {
  it("an opening hosted by two walls is MULTI_HOST", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const door = draft.objects.find((object) => object.objectClass === "DOOR") as { objectId: string };
      // duplicate the wall as a second wall with a fresh identity
      const wall = draft.objects.find((object) => object.objectClass === "WALL") as Record<string, unknown>;
      const secondWall = { ...wall, objectId: `${wall.objectId}2`, contentHash: "6".repeat(64) };
      draft.objects.push(secondWall);
      draft.relationships.push({ type: "CONTAINS", fromId: draft.spaces[0]!.spaceId, toId: secondWall.objectId, relationId: "rel-extra-2" });
      draft.relationships.push({ type: "OPENING_IN", fromId: door.objectId, toId: secondWall.objectId, relationId: "rel-extra-3" });
    });
    const report = qa(graph);
    expect(codes(report)).toContain("MULTI_HOST");
    const finding = report.findings.find((f) => f.code === "MULTI_HOST")!;
    expect(finding.subject.kind).toBe("object");
  });
});

describe("topology family — opening/container consistency", () => {
  it("an opening in a different space than its host wall is OPENING_SPACE_MISMATCH", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const space = draft.spaces[0]!;
      const otherRoom = { ...space, spaceId: "sp-room-b" };
      draft.spaces.push(otherRoom);
      const wall = draft.objects.find((object) => object.objectClass === "WALL") as Record<string, unknown>;
      const wallInB = { ...wall, objectId: `${wall.objectId}b`, contentHash: "7".repeat(64) };
      draft.objects.push(wallInB);
      // door stays in room A; move the wall's containment to room B by
      // re-pointing the wall's CONTAINS edge
      const wallContains = draft.relationships.find(
        (rel) => rel.type === "CONTAINS" && rel.toId === wall.objectId,
      )!;
      const door = draft.objects.find((object) => object.objectClass === "DOOR") as { objectId: string };
      const doorOpening = draft.relationships.find(
        (rel) => rel.type === "OPENING_IN" && rel.fromId === door.objectId,
      )!;
      // host the door on the wall-in-B instead
      doorOpening.toId = wallInB.objectId;
      draft.relationships.push({ type: "CONTAINS", fromId: "sp-room-b", toId: wallInB.objectId, relationId: "rel-extra-4" });
      void wallContains;
    });
    const report = qa(graph);
    expect(codes(report)).toContain("OPENING_SPACE_MISMATCH");
    const finding = report.findings.find((f) => f.code === "OPENING_SPACE_MISMATCH")!;
    expect(finding.detail).toContain("contained by");
  });

  it("opening and host sharing one space is fine", () => {
    expect(codes(qa(smallRoomGraph()))).not.toContain("OPENING_SPACE_MISMATCH");
  });
});

describe("topology family — boundary separation of duties", () => {
  it("a parent-cycle graph is boundary-rejected (INVALID_INPUT), not a finding", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const space = draft.spaces[0]! as { spaceId: string; parentSpaceId?: string };
      space.parentSpaceId = space.spaceId;
    });
    let error: unknown;
    try {
      qa(graph);
    } catch (caught) {
      error = caught;
    }
    expect((error as { code?: string })?.code).toBe("GRAPH_INVALID");
  });
});
