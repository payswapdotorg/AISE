/**
 * DXF serialization unit tests (AISE-019).
 *
 * Serializer-contract tests over FABRICATED plan documents
 * (plain interface values — the projection itself is AISE-017's
 * tested surface; here we exercise the serializer's own
 * contract: entity shapes, XDATA property mapping, unit
 * declaration, canonical numbers, fail-closed refusals, and
 * byte-stability).
 */
import { describe, expect, it } from "vitest";
import type { ModelLengthUnit } from "@aise/engineering-model";
import type { Plan2dDocument, Primitive2d } from "@aise/backend-export-2d";
import { dxfOf, INSUNITS_OF, wrapText } from "./dxf.js";
import { parseDxfGroups, validateDxf } from "./validate.js";
import { toExportDxfError } from "./errors.js";

// ---------------------------------------------------------------------------
// Fabricated-document fixtures (serializer inputs)
// ---------------------------------------------------------------------------

function polygonPrimitive(overrides: Partial<Primitive2d> & { objectId: string }): Primitive2d {
  return {
    kind: "polygon",
    primitiveId: `plan:${overrides.objectId}`,
    dimensions: {
      length: { value: 4, unit: "meter", si: 4 },
      area: { value: 12, unit: "square_meter", si: 12 },
    },
    points: [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ],
    source: {
      objectId: overrides.objectId,
      objectClass: "FLOOR",
      epistemic: "INFERRED",
      contentHash: "a".repeat(64),
      provenance: {
        serviceId: "svc:semantics",
        method: "extract",
        methodVersion: "1.0.0",
        inputs: [
          { kind: "scene", id: "scene-1", contentHash: "b".repeat(64), epistemic: "OBSERVED" },
        ],
      },
    },
    ...overrides,
  } as Primitive2d;
}

function segmentPrimitive(objectId: string): Primitive2d {
  return {
    kind: "segment",
    primitiveId: `plan:${objectId}`,
    dimensions: { length: { value: 3, unit: "meter", uncertainty: { kind: "standard", u: 0.05 }, si: 3 } },
    start: [0, 0],
    end: [0, 3],
    source: {
      objectId,
      objectClass: "WALL",
      name: "North wall",
      epistemic: "CONFIRMED",
      contentHash: "c".repeat(64),
      provenance: {
        serviceId: "svc:semantics",
        method: "extract",
        methodVersion: "1.0.0",
        inputs: [],
      },
    },
  };
}

function documentOf(
  primitives: readonly Primitive2d[],
  unit: ModelLengthUnit = "meter",
  unprojected: Plan2dDocument["unprojected"] = [],
): Plan2dDocument {
  return {
    kind: "plan-2d",
    modelId: "model-test",
    projectId: "project-test",
    graphDigest: "d".repeat(64),
    view: {
      kind: "plan",
      viewAxis: { x: 0, y: 0, z: -1 },
      basis: { e1: { x: 1, y: 0, z: 0 }, e2: { x: 0, y: 1, z: 0 } },
    },
    unit,
    primitives,
    unprojected,
    limitations: ["limitation one for the record"],
    counts: {
      objects: primitives.length + unprojected.length,
      projected: primitives.length,
      unprojected: unprojected.length,
      polygons: primitives.filter((primitive) => primitive.kind === "polygon").length,
      segments: primitives.filter((primitive) => primitive.kind === "segment").length,
    },
  } as Plan2dDocument;
}

function capture(action: () => unknown): ReturnType<typeof toExportDxfError> {
  try {
    action();
  } catch (error) {
    return toExportDxfError(error);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("unit declaration (units preserved)", () => {
  it("maps every frozen model length unit to its DXF $INSUNITS code", () => {
    expect(INSUNITS_OF.meter).toBe(6);
    expect(INSUNITS_OF.millimeter).toBe(4);
    expect(INSUNITS_OF.centimeter).toBe(5);
    expect(INSUNITS_OF.inch).toBe(1);
    expect(INSUNITS_OF.foot).toBe(2);
  });

  it("emits $INSUNITS/$MEASUREMENT per the document frame unit", () => {
    const metric = dxfOf(documentOf([polygonPrimitive({ objectId: "obj-1" })], "meter"));
    expect(metric.insunits).toBe(6);
    expect(metric.measurement).toBe(1);
    expect(metric.text).toContain("$INSUNITS");
    const imperial = dxfOf(documentOf([polygonPrimitive({ objectId: "obj-1" })], "foot"));
    expect(imperial.insunits).toBe(2);
    expect(imperial.measurement).toBe(0);
  });

  it("fails closed on a unit outside the frozen vocabulary (runtime guard)", () => {
    const bogus = documentOf([polygonPrimitive({ objectId: "obj-1" })], "meter");
    (bogus as { unit: string }).unit = "furlong";
    const error = capture(() => dxfOf(bogus as unknown as Plan2dDocument));
    expect(error?.code).toBe("UNIT_UNMAPPABLE");
    expect(error?.retryable).toBe(false);
  });
});

describe("entity emission (structured CAD geometry)", () => {
  it("emits a closed LWPOLYLINE for a polygon with exact 6-decimal coordinates", () => {
    const result = dxfOf(documentOf([polygonPrimitive({ objectId: "obj-1" })]));
    const groups = parseDxfGroups(result.text);
    const typeIndex = groups.findIndex((group) => group.code === 0 && group.value === "LWPOLYLINE");
    expect(typeIndex).toBeGreaterThanOrEqual(0);
    // Scope to this entity: from its 0/TYPE group to the next 0 group.
    const entity = groups.slice(typeIndex, groups.findIndex((group, index) => index > typeIndex && group.code === 0));
    const vertexCount = Number(entity.find((group) => group.code === 90)?.value);
    expect(vertexCount).toBe(4);
    const xs = entity.filter((group) => group.code === 10).map((group) => Number(group.value));
    const ys = entity.filter((group) => group.code === 20).map((group) => Number(group.value));
    expect(xs).toEqual([0, 4, 4, 0]);
    expect(ys).toEqual([0, 0, 3, 3]);
    const flag = entity.find((group) => group.code === 70)?.value;
    expect(flag).toBe("1"); // closed
    const layer = entity.find((group) => group.code === 8)?.value;
    expect(layer).toBe("FLOOR");
  });

  it("emits a LINE for a segment with start/end coordinates", () => {
    const result = dxfOf(documentOf([segmentPrimitive("obj-2")]));
    const groups = parseDxfGroups(result.text);
    const typeIndex = groups.findIndex((group) => group.code === 0 && group.value === "LINE");
    expect(typeIndex).toBeGreaterThanOrEqual(0);
    const entity = groups.slice(typeIndex, groups.findIndex((group, index) => index > typeIndex && group.code === 0));
    const layer = entity.find((group) => group.code === 8)?.value;
    expect(layer).toBe("WALL");
    const elevations = entity.filter((group) => group.code === 30 || group.code === 31);
    expect(elevations).toHaveLength(2);
  });

  it("preserves canonical entity order (document primitive order)", () => {
    const result = dxfOf(documentOf([segmentPrimitive("obj-a"), polygonPrimitive({ objectId: "obj-b" })]));
    const groups = parseDxfGroups(result.text);
    const types = groups.filter((group) => group.code === 0 && ["LINE", "LWPOLYLINE", "TEXT"].includes(group.value)).map((group) => group.value);
    expect(types.indexOf("LINE")).toBeLessThan(types.indexOf("LWPOLYLINE"));
    // Geometry first, then the text blocks.
    expect(types.lastIndexOf("LWPOLYLINE")).toBeLessThan(types.indexOf("TEXT"));
  });

  it("normalizes -0 coordinates to 0.000000 (canonical-number discipline)", () => {
    const primitive = polygonPrimitive({ objectId: "obj-1" });
    (primitive as unknown as { points: [number, number][] }).points = [
      [-0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ];
    const result = dxfOf(documentOf([primitive]));
    expect(result.text).toContain("0.000000");
    expect(result.text).not.toContain("-0.000000");
  });
});

describe("XDATA property mapping (stable identifiers, AC-102)", () => {
  it("carries identity, class, epistemic passthrough, content hash and quantities verbatim", () => {
    const result = dxfOf(documentOf([segmentPrimitive("obj-2")]));
    const strings = result.text
      .split("\r\n")
      .filter((_, index, all) => index > 0 && all[index - 1] === "1000");
    expect(strings).toContain("objectId=obj-2");
    expect(strings).toContain("objectClass=WALL");
    expect(strings).toContain("name=North wall");
    expect(strings).toContain("epistemic=CONFIRMED");
    expect(strings).toContain(`contentHash=${"c".repeat(64)}`);
    expect(strings).toContain("quantity.length=3.000000 meter +/- 1sigma 0.050000");
    expect(strings).toContain("provenance.service=svc:semantics");
    expect(strings).toContain("provenance.method=extract@1.0.0");
  });

  it("formats expanded uncertainty and tolerance kinds without cross-kind conversion", () => {
    const expanded = segmentPrimitive("obj-e");
    (expanded.dimensions as unknown as { length: unknown }).length = {
      value: 2,
      unit: "meter",
      uncertainty: { kind: "expanded", U: 0.1, coverageFactor: 2 },
      si: 2,
    };
    const tolerance = segmentPrimitive("obj-t");
    (tolerance.dimensions as unknown as { length: unknown }).length = {
      value: 2,
      unit: "meter",
      uncertainty: { kind: "tolerance", lowerOffset: -0.02, upperOffset: 0.02 },
      si: 2,
    };
    const expandedResult = dxfOf(documentOf([expanded]));
    expect(expandedResult.text).toContain("quantity.length=2.000000 meter +/- U(k=2.000000) 0.100000");
    const toleranceResult = dxfOf(documentOf([tolerance]));
    expect(toleranceResult.text).toContain("quantity.length=2.000000 meter +/- tol [-0.020000,0.020000]");
  });

  it("splits over-long XDATA values into continuation chunks (no silent truncation)", () => {
    const primitive = segmentPrimitive("obj-long");
    (primitive.source as { name?: string }).name = "x".repeat(600);
    const result = dxfOf(documentOf([primitive]));
    const strings = result.text
      .split("\r\n")
      .filter((_, index, all) => index > 0 && all[index - 1] === "1000");
    const joined = strings
      .filter((value) => value.startsWith("name=") || value.startsWith("name.cont="))
      .map((value) => value.replace(/^name(\.cont)?=/, ""))
      .join("");
    expect(joined).toBe("x".repeat(600));
    for (const value of strings) {
      expect(value.length).toBeLessThanOrEqual(250);
    }
  });
});

describe("fail-closed refusals (never coerced output)", () => {
  it("rejects non-finite coordinates before any output", () => {
    const primitive = polygonPrimitive({ objectId: "obj-1" });
    (primitive as unknown as { points: [number, number][] }).points = [
      [Number.NaN, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ];
    const error = capture(() => dxfOf(documentOf([primitive])));
    expect(error?.code).toBe("NON_FINITE_INPUT");
    expect(error?.retryable).toBe(false);
  });

  it("rejects unencodable (non-ASCII) text values", () => {
    const primitive = segmentPrimitive("obj-2");
    (primitive.source as { name?: string }).name = "wäll–ö";
    const error = capture(() => dxfOf(documentOf([primitive])));
    expect(error?.code).toBe("TEXT_UNENCODABLE");
  });
});

describe("determinism (byte-stable serialization)", () => {
  it("produces byte-identical text for the same document", () => {
    const document = documentOf([polygonPrimitive({ objectId: "obj-1" }), segmentPrimitive("obj-2")]);
    const first = dxfOf(document);
    const second = dxfOf(document);
    expect(first.text).toBe(second.text);
    expect(first.byteLength).toBe(first.text.length);
  });

  it("the emitted file passes the built-in validator (self-conformance)", () => {
    const result = dxfOf(documentOf([polygonPrimitive({ objectId: "obj-1" }), segmentPrimitive("obj-2")]));
    const validation = validateDxf(result.text);
    expect(validation.ok).toBe(true);
    expect(validation.stats.entities).toBe(result.counts.polylines + result.counts.lines + result.counts.textEntities);
  });

  it("the empty document degrades honestly (no geometry, meta + limitations only)", () => {
    const result = dxfOf(documentOf([]));
    expect(result.counts.primitives).toBe(0);
    expect(result.counts.polylines).toBe(0);
    expect(result.counts.lines).toBe(0);
    expect(result.counts.textEntities).toBeGreaterThan(0);
    const validation = validateDxf(result.text);
    expect(validation.ok).toBe(true);
    expect(validation.stats.entityTypes.TEXT).toBe(result.counts.textEntities);
    expect(result.text).toContain("limitation one for the record");
  });
});

describe("text blocks (meta / limitations / unprojected honesty)", () => {
  it("places the meta identity block with the digest anchor", () => {
    const result = dxfOf(documentOf([polygonPrimitive({ objectId: "obj-1" })]));
    expect(result.text).toContain("AISE PLAN EXPORT (derived state - not a canonical model authority)");
    expect(result.text).toContain("modelId=model-test projectId=project-test");
    expect(result.text).toContain(`graphDigest=${"d".repeat(64)}`);
    expect(result.text).toContain("frameUnit=meter (DXF $INSUNITS=6)");
  });

  it("lists unprojected objects with their honest reasons", () => {
    const unprojected = [
      {
        source: {
          objectId: "obj-asset",
          objectClass: "WALL" as const,
          epistemic: "OBSERVED" as const,
          contentHash: "e".repeat(64),
          provenance: {
            serviceId: "svc:x",
            method: "m",
            methodVersion: "1",
            inputs: [],
          },
        },
        reason: "asset-only-geometry" as const,
      },
    ];
    const result = dxfOf(documentOf([], "meter", unprojected));
    expect(result.text).toContain("UNPROJECTED 1 [asset-only-geometry]:");
    expect(result.text).toContain("obj-asset (WALL, OBSERVED,");
  });

  it("wraps long values deterministically (word wrap + hard split)", () => {
    expect(wrapText("alpha beta gamma", 11)).toEqual(["alpha beta", "gamma"]);
    expect(wrapText("supercalifragilistic", 5)).toEqual(["super", "calif", "ragil", "istic"]);
    expect(wrapText("", 10)).toEqual([]);
  });
});

describe("canonical-zero sub-decimal discipline", () => {
  it("normalizes tiny negative coordinates to +0.000000 (never -0.000000)", () => {
    // -1e-9 formats as "-0.000000" at 6 decimals without the
    // canonical-zero normalization — the byte-stability discipline
    // requires +0.
    const primitive = polygonPrimitive({ objectId: "obj-tiny" });
    (primitive as unknown as { points: [number, number][] }).points = [
      [-1e-9, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ];
    const result = dxfOf(documentOf([primitive]));
    expect(result.text).not.toContain("-0.000000");
    // The first geometry vertex of the LWPOLYLINE entity (the VPORT table
    // boilerplate also carries 10-groups with standard 0.0 forms).
    const groups = parseDxfGroups(result.text);
    const entityStart = groups.findIndex((group) => group.code === 0 && group.value === "LWPOLYLINE");
    const x = groups.slice(entityStart).find((group) => group.code === 10);
    expect(x!.value).toBe("0.000000");
  });
});
