import { describe, expect, it } from "vitest";
import { runModelQa } from "../runtime.js";
import { handBuiltGraph, smallRoomGraph } from "../testing.js";

const PROFILE = "CRITICAL" as const;

/** Deep clone for hand-built draft objects (spread is shallow — nested geometry would be shared). */
function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function qa(graph: ReturnType<typeof smallRoomGraph>, profile = PROFILE) {
  return runModelQa({ graph, version: 1, profile });
}

function codes(report: ReturnType<typeof qa>): string[] {
  return report.findings.map((finding) => finding.code);
}

describe("cross-object family — same-class overlap", () => {
  it("clean fixture room: no overlap findings", () => {
    expect(codes(qa(smallRoomGraph())).filter((code) => code.startsWith("OVERLAP") || code.startsWith("DUPLICATE") || code.startsWith("OPENING_OUTSIDE") || code.startsWith("FLOOR_CEILING"))).toEqual([]);
  });

  it("two overlapping floors in one space are OVERLAP_FORBIDDEN", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const floor = draft.objects.find((object) => object.objectClass === "FLOOR") as Record<string, unknown>;
      const overlapping = jsonClone({ ...floor, objectId: "floor-overlap-x", contentHash: "8".repeat(64) }) as Record<string, unknown>;
      // shrink the duplicate so it overlaps but is not identical
      const geometry = overlapping.geometry as { structured: { rectangle: { uMin: number; uMax: number } } };
      geometry.structured.rectangle.uMin = -1;
      geometry.structured.rectangle.uMax = 1;
      draft.objects.push(overlapping);
      draft.relationships.push({
        type: "CONTAINS",
        fromId: draft.spaces[0]!.spaceId,
        toId: overlapping.objectId as string,
        relationId: "rel-x-1",
      });
    });
    const report = qa(graph);
    expect(codes(report)).toContain("OVERLAP_FORBIDDEN");
    const finding = report.findings.find((f) => f.code === "OVERLAP_FORBIDDEN")!;
    expect(finding.outcome).toBe("CONTRADICTION");
    expect(finding.subject.kind).toBe("object");
    expect(finding.related).toHaveLength(1);
  });

  it("two disjoint floors in one space are clean", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const floor = draft.objects.find((object) => object.objectClass === "FLOOR") as Record<string, unknown>;
      const elsewhere = { ...floor, objectId: "floor-disjoint-x", contentHash: "8".repeat(64) } as Record<string, unknown>;
      const geometry = elsewhere.geometry as { structured: { rectangle: { uMin: number; uMax: number } } };
      geometry.structured.rectangle.uMin = 10;
      geometry.structured.rectangle.uMax = 14;
      draft.objects.push(elsewhere);
      draft.relationships.push({
        type: "CONTAINS",
        fromId: draft.spaces[0]!.spaceId,
        toId: elsewhere.objectId as string,
        relationId: "rel-x-2",
      });
    });
    expect(codes(qa(graph))).not.toContain("OVERLAP_FORBIDDEN");
  });

  it("parallel walls in distinct planes cannot overlap (geometric theorem — no finding, no unevaluable)", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const wall = draft.objects.find((object) => object.objectClass === "WALL") as Record<string, unknown>;
      const parallel = jsonClone({ ...wall, objectId: "wall-parallel-y", contentHash: "9".repeat(64) }) as Record<string, unknown>;
      const geometry = parallel.geometry as { structured: { frame: { planePoint: { y: number } } } };
      geometry.structured.frame.planePoint.y = 6; // a different, parallel plane
      draft.objects.push(parallel);
      draft.relationships.push({
        type: "CONTAINS",
        fromId: draft.spaces[0]!.spaceId,
        toId: parallel.objectId as string,
        relationId: "rel-x-3",
      });
    });
    const report = qa(graph);
    expect(codes(report)).not.toContain("OVERLAP_FORBIDDEN");
    expect(report.findings.filter((f) => f.outcome === "UNEVALUABLE")).toHaveLength(0);
  });

  it("same-class objects in different spaces are not compared", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const floor = draft.objects.find((object) => object.objectClass === "FLOOR") as Record<string, unknown>;
      const space = draft.spaces[0]!;
      const otherRoom = { ...space, spaceId: "sp-room-c" };
      draft.spaces.push(otherRoom);
      const clone = { ...floor, objectId: `${floor.objectId}z`, contentHash: "a".repeat(64) };
      draft.objects.push(clone);
      draft.relationships.push({
        type: "CONTAINS",
        fromId: "sp-room-c",
        toId: clone.objectId as string,
        relationId: "rel-x-4",
      });
    });
    expect(codes(qa(graph))).not.toContain("OVERLAP_FORBIDDEN");
    expect(codes(qa(graph))).not.toContain("DUPLICATE_REPRESENTATION");
  });

  it("co-planar but rotated same-class objects are UNEVALUABLE (never absence)", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const floor = draft.objects.find((object) => object.objectClass === "FLOOR") as Record<string, unknown>;
      const rotated = jsonClone({ ...floor, objectId: "floor-rotated-r", contentHash: "b".repeat(64) }) as Record<string, unknown>;
      const geometry = rotated.geometry as {
        structured: { frame: { axisU: { x: number; y: number; z: number }; axisV: { x: number; y: number; z: number } } };
      };
      // rotate axes by 90° in the floor plane
      geometry.structured.frame.axisU = { x: 0, y: 1, z: 0 };
      geometry.structured.frame.axisV = { x: -1, y: 0, z: 0 };
      draft.objects.push(rotated);
      draft.relationships.push({
        type: "CONTAINS",
        fromId: draft.spaces[0]!.spaceId,
        toId: rotated.objectId as string,
        relationId: "rel-x-5",
      });
    });
    const report = qa(graph);
    const unevaluable = report.findings.filter((f) => f.code === "OVERLAP_FORBIDDEN" && f.outcome === "UNEVALUABLE");
    expect(unevaluable.length).toBeGreaterThan(0);
  });
});

describe("cross-object family — duplicate representation", () => {
  it("identical same-class geometry in one space is DUPLICATE_REPRESENTATION (supersedes overlap)", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const floor = draft.objects.find((object) => object.objectClass === "FLOOR") as Record<string, unknown>;
      const identical = jsonClone({ ...floor, objectId: "floor-identical-i", contentHash: "c".repeat(64) }) as Record<string, unknown>;
      draft.objects.push(identical);
      draft.relationships.push({
        type: "CONTAINS",
        fromId: draft.spaces[0]!.spaceId,
        toId: identical.objectId as string,
        relationId: "rel-x-6",
      });
    });
    const report = qa(graph);
    expect(codes(report)).toContain("DUPLICATE_REPRESENTATION");
    // the stronger code supersedes OVERLAP_FORBIDDEN for the same pair
    const overlap = report.findings.filter((f) => f.code === "OVERLAP_FORBIDDEN");
    expect(overlap).toHaveLength(0);
  });
});

describe("cross-object family — opening containment", () => {
  it("a door rectangle sticking out of its host wall is OPENING_OUTSIDE_HOST", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const door = draft.objects.find((object) => object.objectClass === "DOOR") as {
        geometry: { structured: { rectangle: { uMin: number; uMax: number } } };
      };
      door.geometry.structured.rectangle.uMin = -3; // outside the wall's u ∈ [-2, 2]
      door.geometry.structured.rectangle.uMax = -2.5;
    });
    const report = qa(graph);
    expect(codes(report)).toContain("OPENING_OUTSIDE_HOST");
    const finding = report.findings.find((f) => f.code === "OPENING_OUTSIDE_HOST")!;
    expect(finding.outcome).toBe("CONTRADICTION");
  });

  it("an opening in a different plane than its host is OPENING_OUTSIDE_HOST (plane mismatch)", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const door = draft.objects.find((object) => object.objectClass === "DOOR") as {
        geometry: {
          structured: {
            frame: { planePoint: { y: number } };
            rectangle: { center: { y: number }; corners: Array<{ y: number }> };
          };
        };
      };
      // move the door's whole plane (frame + center + corners stay
      // mutually consistent — the geometry remains VALID, just not in
      // the host wall's plane)
      door.geometry.structured.frame.planePoint.y = 2.5;
      door.geometry.structured.rectangle.center.y = 2.5;
      for (const corner of door.geometry.structured.rectangle.corners) {
        corner.y = 2.5;
      }
    });
    const report = qa(graph);
    expect(codes(report)).toContain("OPENING_OUTSIDE_HOST");
    expect(report.findings.find((f) => f.code === "OPENING_OUTSIDE_HOST")!.detail).toContain("plane");
  });

  it("edge-touching containment is inside (inclusive bounds)", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const door = draft.objects.find((object) => object.objectClass === "DOOR") as {
        geometry: { structured: { rectangle: { uMin: number; uMax: number } } };
      };
      door.geometry.structured.rectangle.uMin = -2; // exactly the wall edge
      door.geometry.structured.rectangle.uMax = -1;
    });
    expect(codes(qa(graph))).not.toContain("OPENING_OUTSIDE_HOST");
  });
});

describe("cross-object family — floor/ceiling ordering", () => {
  it("a floor at or above a ceiling in the same space is FLOOR_CEILING_ELEVATION_REVERSED", () => {
    const graph = smallRoomGraph({ floor: { elevation: { value: 3.1, unit: "meter" as const } } });
    const report = qa(graph);
    expect(codes(report)).toContain("FLOOR_CEILING_ELEVATION_REVERSED");
    const finding = report.findings.find((f) => f.code === "FLOOR_CEILING_ELEVATION_REVERSED")!;
    expect(finding.related).toHaveLength(1);
  });

  it("the normal floor-below-ceiling room is clean", () => {
    expect(codes(qa(smallRoomGraph()))).not.toContain("FLOOR_CEILING_ELEVATION_REVERSED");
  });

  it("elevation comparison converts units exactly", () => {
    const graph = smallRoomGraph({ floor: { elevation: { value: 0, unit: "meter" as const } } });
    const graphMm = smallRoomGraph({
      floor: { elevation: { value: 0, unit: "meter" as const } },
      ceiling: { elevation: { value: 2700, unit: "millimeter" as const } },
    });
    expect(codes(qa(graphMm))).not.toContain("FLOOR_CEILING_ELEVATION_REVERSED");
    void graph;
  });
});
