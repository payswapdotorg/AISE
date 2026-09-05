/**
 * The AISE-017 2D workspace view suite: the read-only projection
 * acceptance over the golden model.
 *
 * The 2D surface must serve: the deterministic view enumeration
 * (plan + wall-facing elevations), the authoritative LATEST
 * version (including review decisions — the CONFIRMED door of
 * the reviewed v2), the verbatim document with its trace anchors,
 * the honest limitation/unprojected blocks, and NO write
 * affordance anywhere (the browser is never a canonical
 * authority; the governed decision path lives in /review).
 */
import { describe, expect, it } from "vitest";
import { plan2dViews, projectPlan2dWorkspace, Plan2dViewError } from "./plan-view";
import { getVersion, listVersions } from "@/server/model-store";

const MODEL = "model-golden-room";

describe("deterministic view enumeration (derived from the graph)", () => {
  it("enumerates the plan plus one elevation per distinct wall-normal direction", () => {
    const stored = getVersion(MODEL, 2)!;
    const options = plan2dViews(stored.graph);
    expect(options.map((option) => option.key)).toEqual(["plan", "elev+x", "elev+y"]);
    expect(options[0]!.label).toBe("Plan — viewed from above");
    expect(options[1]!.label).toBe("Elevation — looking +X");
    expect(options[2]!.label).toBe("Elevation — looking +Y");
    expect(options[1]!.request.kind).toBe("elevation");
  });

  it("is stable across repeated derivation (determinism)", () => {
    const stored = getVersion(MODEL, 2)!;
    expect(plan2dViews(stored.graph)).toEqual(plan2dViews(stored.graph));
  });
});

describe("the 2D workspace view of the golden v2 (the review frontier)", () => {
  it("serves the latest reviewed version with the authority trace anchors", () => {
    const view = projectPlan2dWorkspace(MODEL, 2, "plan");
    expect(view.modelId).toBe(MODEL);
    expect(view.projectId).toBe("project-golden-room");
    expect(view.version).toBe(2);
    expect(view.versions).toEqual([1, 2]);
    expect(view.graphDigest).toBe(getVersion(MODEL, 2)!.graph.digest);
    expect(view.viewKey).toBe("plan");
    expect(view.viewLabel).toBe("Plan — viewed from above");
  });

  it("serves the reviewed CONFIRMED door epistemic passthrough (v2 review decisions are visible in 2D)", () => {
    const view = projectPlan2dWorkspace(MODEL, 2, "plan");
    const door = view.document.primitives.find(
      (primitive) => primitive.source.objectClass === "DOOR",
    )!;
    // The reviewed v2 confirmed the door's existence: the 2D surface
    // serves the CURRENT authoritative state — never a stale v1 shape.
    expect(door.source.epistemic).toBe("CONFIRMED");
    const wall = view.document.primitives.find(
      (primitive) => primitive.source.objectClass === "WALL",
    )!;
    expect(wall.source.epistemic).toBe("INFERRED");
  });

  it("serves the plan document verbatim: 2 polygons + 6 segments, 0 unprojected, limitations embedded", () => {
    const view = projectPlan2dWorkspace(MODEL, 2, "plan");
    expect(view.document.counts).toEqual({
      objects: 8,
      projected: 8,
      unprojected: 0,
      polygons: 2,
      segments: 6,
    });
    expect(view.document.limitations.length).toBeGreaterThanOrEqual(8);
    expect(view.document.unit).toBe("meter");
  });

  it("serves the +X elevation on demand (wall-facing full polygons)", () => {
    const view = projectPlan2dWorkspace(MODEL, 2, "elev+x");
    expect(view.viewKey).toBe("elev+x");
    expect(view.document.view.kind).toBe("elevation");
    expect(view.document.counts.polygons).toBe(3);
    expect(view.document.counts.segments).toBe(5);
  });

  it("traces every primitive to its source object in the served version's graph", () => {
    const view = projectPlan2dWorkspace(MODEL, 2, "plan");
    const graph = getVersion(MODEL, 2)!.graph;
    for (const primitive of view.document.primitives) {
      const source = graph.objects.find(
        (object) => object.objectId === primitive.source.objectId,
      );
      expect(source).toBeDefined();
      expect(primitive.source.contentHash).toBe(source!.contentHash);
    }
  });

  it("computes the drawing bounds over the golden footprint (display convenience, derived)", () => {
    const view = projectPlan2dWorkspace(MODEL, 2, "plan");
    // The 4 × 3 m room footprint with a small extraction margin.
    expect(view.drawing.minX).toBeCloseTo(0, 4);
    expect(view.drawing.minY).toBeCloseTo(0, 4);
    expect(view.drawing.maxX).toBeCloseTo(4, 4);
    expect(view.drawing.maxY).toBeCloseTo(3, 4);
  });

  it("is byte-stable across repeated compositions (determinism)", () => {
    const first = projectPlan2dWorkspace(MODEL, 2, "plan");
    const second = projectPlan2dWorkspace(MODEL, 2, "plan");
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("contains NO write affordance (read-only surface — the browser is never canonical authority)", () => {
    const serialized = JSON.stringify(projectPlan2dWorkspace(MODEL, 2, "plan"));
    for (const forbidden of ["applyDecision", "commitModelVersion", "decide", "retract"]) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
  });

  it("serves v1 identically in structure (immutable history remains viewable)", () => {
    const v1 = projectPlan2dWorkspace(MODEL, 1, "plan");
    expect(v1.version).toBe(1);
    expect(v1.document.counts.projected).toBe(8);
    const door = v1.document.primitives.find(
      (primitive) => primitive.source.objectClass === "DOOR",
    )!;
    // v1 predates the review pass: the door is INFERRED there.
    expect(door.source.epistemic).toBe("INFERRED");
  });
});

describe("fail-closed view resolution", () => {
  it("rejects an unknown model", () => {
    expect(() => projectPlan2dWorkspace("model-nope", 2, "plan")).toThrow(Plan2dViewError);
  });

  it("rejects an unknown version", () => {
    expect(() => projectPlan2dWorkspace(MODEL, 99, "plan")).toThrow(Plan2dViewError);
  });

  it("rejects an unknown view key (no silent fallback)", () => {
    expect(() => projectPlan2dWorkspace(MODEL, 2, "elev+z")).toThrow(Plan2dViewError);
    expect(() => projectPlan2dWorkspace(MODEL, 2, "axonometric")).toThrow(Plan2dViewError);
  });

  it("rejects a view key that exists only in another model's geometry (no cross-model leakage)", () => {
    // The golden room has no Z-facing walls: elev+z is not enumerable.
    const options = plan2dViews(getVersion(MODEL, 2)!.graph);
    expect(options.some((option) => option.key === "elev+z")).toBe(false);
  });
});

describe("version chain integration", () => {
  it("every committed version is servable through the 2D surface", () => {
    for (const version of listVersions(MODEL).map((record) => record.version)) {
      const view = projectPlan2dWorkspace(MODEL, version, "plan");
      expect(view.version).toBe(version);
      expect(view.document.graphDigest).toBe(getVersion(MODEL, version)!.graph.digest);
    }
  });
});
