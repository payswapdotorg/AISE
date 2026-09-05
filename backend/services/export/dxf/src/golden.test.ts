/**
 * HIGH_ASSURANCE golden DXF test (AISE-019).
 *
 * The full deterministic composition: golden capture points →
 * AISE-010 extraction → AISE-011 ingestion → AISE-017 plan
 * projection → AISE-019 DXF export. Every pinned number is the
 * output of the REAL chain (no mocks, no shortcuts) — the same
 * discipline the backend golden suites and AISE-017's golden
 * projection pin.
 *
 * Determinism pinning discipline (the AISE-017/018 golden
 * precedent): the upstream extraction chain is bit-stable PER
 * RUNTIME (the fixture and the committed AISE-022 baseline pin
 * tolerances), so this suite pins the EXPORT's structure exactly
 * (entity counts, layers, header declaration, XDATA identity
 * mapping), coordinates by tolerance, and byte-stability against
 * repeat exports of the SAME plan document — never raw digests
 * of freshly re-built chains.
 *
 * Pins (REQ-011 acceptance over the canonical golden room):
 * - AC-101: the plan exports to DXF as structured CAD geometry
 *   (2 closed LWPOLYLINE + 6 LINE) passing the built-in
 *   structural conformance validator;
 * - AC-102: stable identifiers — every entity carries the
 *   canonical objectId/contentHash/epistemic in AISE XDATA,
 *   stable across repeat exports;
 * - AC-103: byte-stable deterministic export and the plan
 *   document unchanged by the export (no canonical mutation).
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints, noisyRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import { project2d, type Plan2dDocument } from "@aise/backend-export-2d";
import type { RealityModelGraph } from "@aise/engineering-model";
import { dxfOf } from "./dxf.js";
import { parseDxfGroups, validateDxf } from "./validate.js";

const TARGET = { modelId: "model-golden", projectId: "project-golden", spaceId: "room-golden" };

/** The canonical golden v1 graph (the ingestion chain, exactly as the web store seeds it). */
function goldenGraph(): RealityModelGraph {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  return ingestArchitecturalScene(scene, TARGET).graph;
}

/** The single chain build the golden assertions pin identity against. */
const goldenGraphOnce = goldenGraph();

function goldenPlan(): Plan2dDocument {
  return project2d(goldenGraphOnce, { kind: "plan" });
}

describe("golden room DXF export (real chain)", () => {
  const plan = goldenPlan();
  const result = dxfOf(plan);

  it("exports all eight projected objects: 2 LWPOLYLINE + 6 LINE (AC-101)", () => {
    expect(result.counts.primitives).toBe(8);
    expect(result.counts.polylines).toBe(2);
    expect(result.counts.lines).toBe(6);
    const validation = validateDxf(result.text);
    expect(validation.ok).toBe(true);
    expect(validation.stats.entityTypes.LWPOLYLINE).toBe(2);
    expect(validation.stats.entityTypes.LINE).toBe(6);
  });

  it("declares the frame unit in the header (units preserved, meter/metric)", () => {
    expect(result.unit).toBe("meter");
    expect(result.insunits).toBe(6);
    expect(result.measurement).toBe(1);
    expect(result.text).toContain("AC1015");
    const groups = parseDxfGroups(result.text);
    const insunitsIndex = groups.findIndex((group) => group.value === "$INSUNITS");
    expect(Number(groups[insunitsIndex + 1]!.value)).toBe(6);
  });

  it("emits the class layers plus the three AISE meta layers", () => {
    const validation = validateDxf(result.text);
    for (const layer of ["WALL", "FLOOR", "CEILING", "DOOR", "WINDOW", "AISE-META", "AISE-LIMITS", "AISE-UNPROJECTED"]) {
      expect(validation.stats.layers).toContain(layer);
    }
    expect(result.counts.layers).toBe(8);
  });

  it("projects the floor footprint polygon at the golden room coordinates (tolerance-pinned)", () => {
    const groups = parseDxfGroups(result.text);
    // Find the FLOOR LWPOLYLINE: entity groups are 0/TYPE, 5/handle,
    // 100/AcDbEntity, 8/layer — so the layer name is at index+3.
    const entityStart = groups.findIndex(
      (group, index) =>
        group.code === 0 && group.value === "LWPOLYLINE" && groups[index + 3]?.value === "FLOOR",
    );
    expect(entityStart).toBeGreaterThanOrEqual(0);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let index = entityStart; index < groups.length; index += 1) {
      const group = groups[index]!;
      if (group.code === 0 && index !== entityStart) {
        break;
      }
      if (group.code === 10) {
        xs.push(Number(groups[index + 0]!.value));
      }
      if (group.code === 20) {
        ys.push(Number(group.value));
      }
    }
    expect(xs).toHaveLength(4);
    // 4 × 3 m room footprint; extraction float noise tolerated at 1e-6.
    expect(xs[0]).toBeCloseTo(0, 6);
    expect(xs[1]).toBeCloseTo(4, 6);
    expect(xs[2]).toBeCloseTo(4, 6);
    expect(xs[3]).toBeCloseTo(0, 6);
    expect(ys[0]).toBeCloseTo(0, 6);
    expect(ys[1]).toBeCloseTo(0, 6);
    expect(ys[2]).toBeCloseTo(3, 6);
    expect(ys[3]).toBeCloseTo(3, 6);
  });

  it("carries every objectId/contentHash/epistemic in AISE XDATA (AC-102 identity mapping)", () => {
    const xdataValues = result.text
      .split("\r\n")
      .filter((_, index, all) => index > 0 && all[index - 1] === "1000");
    for (const primitive of plan.primitives) {
      expect(xdataValues).toContain(`objectId=${primitive.source.objectId}`);
      expect(xdataValues).toContain(`contentHash=${primitive.source.contentHash}`);
      expect(xdataValues).toContain(`epistemic=${primitive.source.epistemic}`);
    }
    // The golden v1 chain is all INFERRED (epistemic passthrough, never upgraded).
    expect(xdataValues.filter((value) => value === "epistemic=INFERRED")).toHaveLength(8);
  });

  it("anchors the drawing to the exact graph digest", () => {
    expect(result.graphDigest).toBe(plan.graphDigest);
    expect(result.text).toContain(`graphDigest=${plan.graphDigest}`);
  });

  it("is byte-stable: repeated exports of the same plan document agree byte-for-byte (AC-103)", () => {
    const first = dxfOf(plan);
    const second = dxfOf(plan);
    expect(first.text).toBe(second.text);
    expect(first.text).toBe(result.text);
    expect(first.byteLength).toBe(first.text.length);
  });

  it("does not mutate the plan document (derived state, no canonical authority change)", () => {
    const before = JSON.stringify(plan);
    dxfOf(plan);
    expect(JSON.stringify(plan)).toBe(before);
    // The plan document is anchored to THE graph it was projected from
    // (single chain build — the AISE-022 discipline: fresh same-process
    // rebuilds can flip bit-exact bound variants, so identity is pinned
    // against the same graph object, not a second build).
    expect(plan.graphDigest).toBe(goldenGraphOnce.digest);
  });

  it("embeds the AISE-017 projection limitations as visible text (honest display)", () => {
    for (const marker of ["AISE-017 PROJECTION LIMITATION 1:", "AISE-017 PROJECTION LIMITATION 9:"]) {
      expect(result.text).toContain(marker);
    }
    const validation = validateDxf(result.text);
    expect(validation.stats.entityTypes.TEXT).toBe(result.counts.textEntities);
    expect(result.counts.textEntities).toBeGreaterThan(9);
  });
});

describe("golden noisy room DXF export (structural stability)", () => {
  it("keeps the same structure for the noisy golden room and stays byte-stable per document", () => {
    const scene = extractArchitecturalScene({ points: noisyRoomPoints(), unit: "meter" });
    const graph = ingestArchitecturalScene(scene, TARGET).graph;
    const noisyPlan = project2d(graph, { kind: "plan" });
    const noisy = dxfOf(noisyPlan);
    expect(noisy.counts.primitives).toBe(8);
    expect(noisy.counts.polylines).toBe(2);
    expect(noisy.counts.lines).toBe(6);
    expect(validateDxf(noisy.text).ok).toBe(true);
    expect(dxfOf(noisyPlan).text).toBe(noisy.text);
  });
});
