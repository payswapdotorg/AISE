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

describe("geometry family — structural validity (first-line, boundary-transparent)", () => {
  it("clean fixture room: no geometry findings", () => {
    const report = qa(smallRoomGraph());
    expect(codes(report).filter((code) => code.startsWith("GEOMETRY") || code.startsWith("OPENING"))).toEqual([]);
  });

  it("non-finite geometry cannot even be digest-pinned (canonical serialization rejects it)", () => {
    // Non-finite content cannot carry a content digest at all — the
    // model's canonical serializer throws before any graph can exist.
    expect(() =>
      handBuiltGraph(smallRoomGraph(), (draft) => {
        const geometry = (draft.objects[0]! as { geometry: { structured: { width: { value: number } } } }).geometry;
        geometry.structured.width.value = Number.NaN;
      }),
    ).toThrow(/non-finite/);
  });

  it("degenerate rectangle (uMax ≤ uMin) is a GEOMETRY_INVALID contradiction", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const geometry = (draft.objects[0]! as { geometry: { structured: { rectangle: { uMin: number; uMax: number } } } }).geometry;
      geometry.structured.rectangle.uMax = geometry.structured.rectangle.uMin;
    });
    expect(codes(qa(graph))).toContain("GEOMETRY_INVALID");
  });

  it("wrong unit family (square unit on width) is GEOMETRY_INVALID", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const geometry = (draft.objects[0]! as { geometry: { structured: { width: { unit: string } } } }).geometry;
      geometry.structured.width.unit = "square_meter";
    });
    expect(codes(qa(graph))).toContain("GEOMETRY_INVALID");
  });

  it("non-unit frame normal is GEOMETRY_INVALID", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const geometry = (draft.objects[2]! as { geometry: { structured: { frame: { normal: { x: number } } } } }).geometry;
      geometry.structured.frame.normal.x = 5;
    });
    expect(codes(qa(graph))).toContain("GEOMETRY_INVALID");
  });

  it("an invalid asset reference is GEOMETRY_INVALID", () => {
    const withAsset = smallRoomGraph();
    const graph = handBuiltGraph(withAsset, (draft) => {
      (draft.objects[0]! as { geometry: { assetRefs?: Array<{ kind: string; contentHash: string; pointCount: number; epistemic: string }> } }).geometry.assetRefs = [
        { kind: "point-cloud", contentHash: "not-a-hash", pointCount: 10, epistemic: "INFERRED" },
      ];
    });
    expect(codes(qa(graph))).toContain("GEOMETRY_INVALID");
  });
});

describe("geometry family — impossible dimensions", () => {
  it("negative width is GEOMETRY_DIMENSION_NON_POSITIVE (constructor-legal, QA-contradictory)", () => {
    const graph = smallRoomGraph({ floor: { width: { value: -4, unit: "meter" } } });
    const report = qa(graph);
    expect(codes(report)).toContain("GEOMETRY_DIMENSION_NON_POSITIVE");
    const finding = report.findings.find((f) => f.code === "GEOMETRY_DIMENSION_NON_POSITIVE")!;
    expect(finding.actual).toContain("-4 meter");
    expect(finding.expected).toBe("> 0");
  });

  it("zero area is GEOMETRY_DIMENSION_NON_POSITIVE", () => {
    const graph = smallRoomGraph({ floor: { area: { value: 0, unit: "square_meter" } } });
    expect(codes(qa(graph))).toContain("GEOMETRY_DIMENSION_NON_POSITIVE");
  });

  it("window sill ≥ head is GEOMETRY_SILL_HEAD_INCONSISTENT (cross-unit, exact SI)", () => {
    // sill 1200 mm, head 1.5 m — sill below head: fine. Reversed: contradiction.
    const fine = smallRoomGraph({ window: { sillHeight: { value: 1200, unit: "millimeter" as const }, headHeight: { value: 2, unit: "meter" as const } } });
    expect(codes(qa(fine))).not.toContain("GEOMETRY_SILL_HEAD_INCONSISTENT");
    const reversed = smallRoomGraph({ window: { sillHeight: { value: 2000, unit: "millimeter" as const }, headHeight: { value: 1.5, unit: "meter" as const } } });
    const report = qa(reversed);
    expect(codes(report)).toContain("GEOMETRY_SILL_HEAD_INCONSISTENT");
  });
});

describe("geometry family — contradictory extents and quantities", () => {
  it("width disagreeing with rectangle extents is GEOMETRY_EXTENTS_MISMATCH", () => {
    const graph = smallRoomGraph({ floor: { width: { value: 5, unit: "meter" } } });
    const report = qa(graph);
    expect(codes(report)).toContain("GEOMETRY_EXTENTS_MISMATCH");
    const finding = report.findings.find((f) => f.code === "GEOMETRY_EXTENTS_MISMATCH")!;
    expect(finding.expected).toContain("4 meter");
    expect(finding.actual).toContain("5 meter");
  });

  it("extents comparison converts the space unit exactly (fully consistent millimetre scene)", () => {
    // Scale every coordinate and quantity to millimetres: the space
    // declares mm, extents are in mm, quantities are in mm — everything
    // must agree after exact SI conversion.
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      (draft.spaces[0]! as { frame?: { unit: string } }).frame!.unit = "millimeter";
      for (const object of draft.objects) {
        const geometry = (object as { geometry?: { structured?: Record<string, unknown> } }).geometry;
        const structured = geometry?.structured;
        if (structured === undefined) {
          continue;
        }
        const rectangle = structured.rectangle as { uMin: number; uMax: number; vMin: number; vMax: number; center: { x: number; y: number; z: number } };
        for (const bound of ["uMin", "uMax", "vMin", "vMax"] as const) {
          rectangle[bound] = rectangle[bound] * 1000;
        }
        const frame = structured.frame as { planePoint: { x: number; y: number; z: number } };
        frame.planePoint.x *= 1000;
        frame.planePoint.y *= 1000;
        frame.planePoint.z *= 1000;
        rectangle.center.x *= 1000;
        rectangle.center.y *= 1000;
        rectangle.center.z *= 1000;
        for (const dim of ["width", "height", "elevation", "headHeight", "sillHeight"] as const) {
          const quantity = structured[dim] as { value: number; unit: string } | undefined;
          if (quantity !== undefined) {
            structured[dim] = { value: quantity.value * 1000, unit: "millimeter" };
          }
        }
        const area = structured.area as { value: number; unit: string };
        structured.area = { value: area.value * 1_000_000, unit: "square_millimeter" };
      }
    });
    const report = qa(graph);
    expect(codes(report)).not.toContain("GEOMETRY_EXTENTS_MISMATCH");
    expect(codes(report)).not.toContain("GEOMETRY_AREA_MISMATCH");
    expect(codes(report)).not.toContain("GEOMETRY_ELEVATION_MISMATCH");
  });

  it("no declared space frame → extents are UNEVALUABLE, never silently passed", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      delete (draft.spaces[0]! as { frame?: unknown }).frame;
    });
    const report = qa(graph);
    const unevaluable = report.findings.filter((f) => f.code === "GEOMETRY_EXTENTS_MISMATCH");
    expect(unevaluable.length).toBeGreaterThan(0);
    for (const finding of unevaluable) {
      expect(finding.outcome).toBe("UNEVALUABLE");
    }
  });

  it("area disagreeing with width × height is GEOMETRY_AREA_MISMATCH", () => {
    const graph = smallRoomGraph({ floor: { area: { value: 99, unit: "square_meter" } } });
    const report = qa(graph);
    expect(codes(report)).toContain("GEOMETRY_AREA_MISMATCH");
    const finding = report.findings.find((f) => f.code === "GEOMETRY_AREA_MISMATCH")!;
    expect(finding.expected).toContain("12 square_meter");
    expect(finding.actual).toContain("99 square_meter");
  });

  it("area comparison converts units exactly (width in feet, area in square feet)", () => {
    const graph = smallRoomGraph({
      floor: {
        width: { value: 4 / 0.3048, unit: "foot" as const },
        height: { value: 3 / 0.3048, unit: "foot" as const },
        area: { value: 12 / (0.3048 * 0.3048), unit: "square_foot" as const },
      },
    });
    expect(codes(qa(graph))).not.toContain("GEOMETRY_AREA_MISMATCH");
  });

  it("float-scale agreement inside the relative tolerance is NOT a finding", () => {
    const graph = smallRoomGraph({ wall: { area: { value: 10.799999999999999, unit: "square_meter" as const } } });
    expect(codes(qa(graph))).not.toContain("GEOMETRY_AREA_MISMATCH");
  });

  it("elevation disagreeing with the plane height is GEOMETRY_ELEVATION_MISMATCH", () => {
    const graph = smallRoomGraph({ ceiling: { elevation: { value: 9.9, unit: "meter" as const } } });
    const report = qa(graph);
    expect(codes(report)).toContain("GEOMETRY_ELEVATION_MISMATCH");
  });
});

describe("geometry family — declared structural assumptions", () => {
  it("a tilted floor (normal not parallel to up) violates the structural assumption", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const geometry = (draft.objects[0]! as {
        geometry: { structured: { frame: { normal: { x: number; y: number; z: number }; axisU: { x: number; y: number; z: number }; axisV: { x: number; y: number; z: number } } } };
      }).geometry;
      // rotate the WHOLE frame consistently (orthonormal): the geometry
      // stays structurally valid, only the orientation assumption breaks
      geometry.structured.frame.normal = { x: 0.7071067811865476, y: 0, z: 0.7071067811865476 };
      geometry.structured.frame.axisU = { x: 0.7071067811865476, y: 0, z: -0.7071067811865476 };
      geometry.structured.frame.axisV = { x: 0, y: 1, z: 0 };
    });
    const report = qa(graph);
    const structural = report.findings.filter((f) => f.code === "GEOMETRY_INVALID");
    expect(structural.length).toBeGreaterThan(0);
    expect(structural[0]!.detail).toContain("structural assumption");
  });

  it("a vertical floor's elevation is not comparable (skipped honestly)", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      const geometry = (draft.objects[0]! as { geometry: { structured: { frame: Record<string, unknown> } } }).geometry;
      // rotate the floor plane to vertical — elevation no longer comparable
      const frame = geometry.structured.frame as { planePoint: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; axisU: { x: number; y: number; z: number }; axisV: { x: number; y: number; z: number } };
      frame.normal = { x: 1, y: 0, z: 0 };
      frame.axisU = { x: 0, y: 1, z: 0 };
      frame.axisV = { x: 0, y: 0, z: 1 };
      frame.planePoint = { x: 0, y: 0, z: 0 };
    });
    const report = qa(graph);
    // structural violation is reported; elevation mismatch is NOT (honest skip)
    expect(codes(report)).toContain("GEOMETRY_INVALID");
    expect(codes(report)).not.toContain("GEOMETRY_ELEVATION_MISMATCH");
  });
});

describe("geometry family — openings vs hosts", () => {
  it("door wider than its host wall is OPENING_EXCEEDS_HOST", () => {
    const graph = smallRoomGraph({ door: { width: { value: 4.5, unit: "meter" as const } } });
    const report = qa(graph);
    expect(codes(report)).toContain("OPENING_EXCEEDS_HOST");
    const finding = report.findings.find((f) => f.code === "OPENING_EXCEEDS_HOST")!;
    expect(finding.subject.kind).toBe("object");
    expect(finding.related).toBeDefined();
  });

  it("door head height above the wall height is OPENING_EXCEEDS_HOST", () => {
    const graph = smallRoomGraph({ door: { headHeight: { value: 3.5, unit: "meter" as const } } });
    expect(codes(qa(graph))).toContain("OPENING_EXCEEDS_HOST");
  });

  it("head height disagreeing with the rectangle position is OPENING_MISPLACED", () => {
    const graph = smallRoomGraph({ door: { headHeight: { value: 1.5, unit: "meter" as const } } });
    const report = qa(graph);
    expect(codes(report)).toContain("OPENING_MISPLACED");
    const finding = report.findings.find((f) => f.code === "OPENING_MISPLACED")!;
    expect(finding.expected).toContain("2 meter");
    expect(finding.actual).toContain("1.5 meter");
  });

  it("sill height disagreeing with the rectangle position is OPENING_MISPLACED", () => {
    const graph = smallRoomGraph({ window: { sillHeight: { value: 0.5, unit: "meter" as const } } });
    expect(codes(qa(graph))).toContain("OPENING_MISPLACED");
  });

  it("missing host geometry → UNEVALUABLE, never absence", () => {
    const graph = handBuiltGraph(smallRoomGraph(), (draft) => {
      delete (draft.objects[2]! as { geometry?: unknown }).geometry; // the wall
    });
    const report = qa(graph);
    const unevaluable = report.findings.filter((f) => f.code === "OPENING_EXCEEDS_HOST" && f.outcome === "UNEVALUABLE");
    expect(unevaluable.length).toBe(2); // door + window
  });
});
