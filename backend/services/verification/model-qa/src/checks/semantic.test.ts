import { describe, expect, it } from "vitest";
import { runModelQa } from "../runtime.js";
import { handBuiltGraph, smallRoomGraph } from "../testing.js";
import { propertyAssertion } from "@aise/engineering-model";

const PROFILE = "CRITICAL" as const;

function qa(graph: ReturnType<typeof smallRoomGraph>, profile = PROFILE) {
  return runModelQa({ graph, version: 1, profile });
}

function codes(report: ReturnType<typeof qa>): string[] {
  return report.findings.map((finding) => finding.code);
}

describe("semantic family — kind/geometry field compatibility", () => {
  it("clean fixture room: no semantic findings", () => {
    expect(codes(qa(smallRoomGraph())).filter((code) => code.startsWith("KIND_") || code.startsWith("PROPERTY_"))).toEqual([]);
  });

  it("a WALL carrying elevation is KIND_FIELD_INCOMPATIBLE (elevation belongs to FLOOR/CEILING)", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const wall = draft.objects.find((object) => object.objectClass === "WALL") as {
        geometry: { structured: { elevation?: unknown } };
      };
      wall.geometry.structured.elevation = { value: 1.35, unit: "meter" };
    });
    const report = qa(graph);
    expect(codes(report)).toContain("KIND_FIELD_INCOMPATIBLE");
    const finding = report.findings.find((f) => f.code === "KIND_FIELD_INCOMPATIBLE")!;
    expect(finding.expected).toContain("FLOOR/CEILING");
    expect(finding.actual).toContain("elevation on WALL");
  });

  it("a DOOR carrying sillHeight is KIND_FIELD_INCOMPATIBLE (sill belongs to WINDOW)", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const door = draft.objects.find((object) => object.objectClass === "DOOR") as {
        geometry: { structured: { sillHeight?: unknown } };
      };
      door.geometry.structured.sillHeight = { value: 0.5, unit: "meter" };
    });
    const report = qa(graph);
    expect(codes(report)).toContain("KIND_FIELD_INCOMPATIBLE");
  });

  it("a FLOOR carrying headHeight is KIND_FIELD_INCOMPATIBLE", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const floor = draft.objects.find((object) => object.objectClass === "FLOOR") as {
        geometry: { structured: { headHeight?: unknown } };
      };
      floor.geometry.structured.headHeight = { value: 2, unit: "meter" };
    });
    expect(codes(qa(graph))).toContain("KIND_FIELD_INCOMPATIBLE");
  });

  it("a WINDOW with sill+head and a DOOR with head are the legal carriers", () => {
    expect(codes(qa(smallRoomGraph()))).not.toContain("KIND_FIELD_INCOMPATIBLE");
  });
});

describe("semantic family — property vs geometry", () => {
  it("a width property disagreeing with the geometry width is PROPERTY_GEOMETRY_CONTRADICTION", () => {
    const graph = smallRoomGraph({
      floorProperties: [
        propertyAssertion({ key: "width", quantity: { value: 5, unit: "meter" }, status: "INFERRED", kind: "estimate" }),
      ],
    });
    const report = qa(graph);
    expect(codes(report)).toContain("PROPERTY_GEOMETRY_CONTRADICTION");
    const finding = report.findings.find((f) => f.code === "PROPERTY_GEOMETRY_CONTRADICTION")!;
    expect(finding.subject.kind).toBe("property");
    expect(finding.expected).toContain("4 meter");
    expect(finding.actual).toContain("5 meter");
    expect(finding.epistemic?.assertionStatus).toBe("INFERRED");
  });

  it("the same value in a different unit is consistent (exact SI conversion)", () => {
    const graph = smallRoomGraph({
      floorProperties: [
        propertyAssertion({ key: "width", quantity: { value: 4000, unit: "millimeter" }, status: "INFERRED", kind: "estimate" }),
      ],
    });
    expect(codes(qa(graph))).not.toContain("PROPERTY_GEOMETRY_CONTRADICTION");
  });

  it("a property in a different unit family is not a geometry contradiction", () => {
    const graph = smallRoomGraph({
      floorProperties: [
        propertyAssertion({ key: "width", quantity: { value: 30, unit: "degree" }, status: "INFERRED", kind: "estimate" }),
      ],
    });
    expect(codes(qa(graph))).not.toContain("PROPERTY_GEOMETRY_CONTRADICTION");
  });

  it("a non-dimension property key never participates", () => {
    const graph = smallRoomGraph({
      floorProperties: [
        propertyAssertion({ key: "fireRating", quantity: { value: 60, unit: "meter" }, status: "INFERRED", kind: "estimate" }),
      ],
    });
    expect(codes(qa(graph))).not.toContain("PROPERTY_GEOMETRY_CONTRADICTION");
  });

  it("presence assertions carry no value and never contradict geometry", () => {
    const graph = smallRoomGraph({
      floorProperties: [
        propertyAssertion({ key: "width", presence: "NOT_OBSERVED", status: "INFERRED" }),
      ],
    });
    expect(codes(qa(graph))).not.toContain("PROPERTY_GEOMETRY_CONTRADICTION");
  });

  it("a matching width property is consistent", () => {
    const graph = smallRoomGraph({
      floorProperties: [
        propertyAssertion({ key: "width", quantity: { value: 4, unit: "meter" }, status: "INFERRED", kind: "estimate" }),
      ],
    });
    expect(codes(qa(graph))).not.toContain("PROPERTY_GEOMETRY_CONTRADICTION");
  });
});

describe("semantic family — honest gaps (documented, not invented)", () => {
  it("duplicate/conflicting property keys per entity are excluded by the boundary (regression)", () => {
    const duplicate = handBuiltGraph(smallRoomGraph(), (draft) => {
      const floor = draft.objects.find((object) => object.objectClass === "FLOOR") as { properties: unknown[] };
      const assertion = propertyAssertion({ key: "width", quantity: { value: 4, unit: "meter" }, status: "INFERRED", kind: "estimate" });
      floor.properties = [assertion, { ...assertion }];
    });
    let error: unknown;
    try {
      qa(duplicate);
    } catch (caught) {
      error = caught;
    }
    expect((error as { code?: string })?.code).toBe("GRAPH_INVALID");
  });
});
