/**
 * AISE-035 — ground-truth tests: every asserted value is hand-computable
 * and reviewer-verifiable (exact plane equations, exact dimensions, exact
 * BOQ quantity equivalents, exact expected node sets, honest
 * not-observed declarations, deterministic noise).
 */

import { describe, expect, test } from "bun:test";
import { vecDot } from "../geometry";
import { scenarioById } from "./scenarios";
import { groundTruthOf, elementNodeId, hierarchyNodeIds, spaceNodeId } from "./groundtruth";
import {
  buildCaptureAssets,
  encodeDepthMapFrame,
  LAB_DEVICE_SIGMA_M,
} from "./testkit";
import { exactGridPoints } from "./runner";

describe("lab ground truth: exact geometry (hand-computable)", () => {
  test("room 104: exact planes and dimensions (width 4.0 x depth 3.0 x height 2.5)", () => {
    const truth = groundTruthOf(scenarioById("lab-room-104-defect"));
    const planeOf = (surfaceId: string) =>
      truth.surfaces.find((s) => s.surfaceId === surfaceId)!.plane;
    expect(planeOf("surface:room-104:floor")).toEqual({ normal: [0, 0, 1], d: 0 });
    expect(planeOf("surface:room-104:ceiling")).toEqual({ normal: [0, 0, -1], d: 2.5 });
    expect(planeOf("surface:room-104:wall-north")).toEqual({ normal: [0, -1, 0], d: 0 });
    expect(planeOf("surface:room-104:wall-south")).toEqual({ normal: [0, 1, 0], d: -3 });
    expect(planeOf("surface:room-104:wall-west")).toEqual({ normal: [-1, 0, 0], d: 0 });
    expect(planeOf("surface:room-104:wall-east")).toEqual({ normal: [1, 0, 0], d: -4 });
    const byKey = new Map(truth.dimensions.map((d) => [d.propertyKey, d] as const));
    expect(byKey.get("room.depth")?.valueM).toBe(3);
    expect(byKey.get("room.height")?.valueM).toBe(2.5);
    // room.width is NOT a dimension of this room — the east wall is occluded.
    expect(byKey.has("room.width")).toBe(false);
  });

  test("ground floor: 18 surfaces at disjoint origins; 9 exact dimensions", () => {
    const truth = groundTruthOf(scenarioById("lab-floor-gf-boq"));
    expect(truth.surfaces).toHaveLength(18);
    expect(truth.dimensions).toHaveLength(9);
    // Disjoint room placement (documented occupancy model).
    const roomB = truth.rooms.find((r) => r.roomLabel === "room-b")!;
    expect([roomB.originX, roomB.originY]).toEqual([20, 30]);
    const roomC = truth.rooms.find((r) => r.roomLabel === "room-c")!;
    expect([roomC.originX, roomC.originY]).toEqual([50, 10]);
    // Hand-computed wall-plane offsets at the displaced origins.
    const wallBNorth = truth.surfaces.find((s) => s.surfaceId === "surface:room-b:wall-north")!;
    expect(wallBNorth.plane).toEqual({ normal: [0, -1, 0], d: 30 });
    const wallCWest = truth.surfaces.find((s) => s.surfaceId === "surface:room-c:wall-west")!;
    expect(wallCWest.plane).toEqual({ normal: [-1, 0, 0], d: 50 });
  });

  test("every exact grid point satisfies its plane equation EXACTLY (IEEE 754)", () => {
    for (const scenario of ["lab-room-104-defect", "lab-floor-gf-boq", "lab-room-204-repair"]) {
      const truth = groundTruthOf(scenarioById(scenario));
      for (const surface of truth.surfaces) {
        const points = exactGridPoints(surface);
        expect(points).toHaveLength(surface.gridSide * surface.gridSide);
        for (const point of points) {
          expect(vecDot(surface.plane.normal, point) + surface.plane.d).toBe(0);
        }
      }
    }
  });

  test("the door's bounding polygon lies on its host wall, verbatim vertices", () => {
    const truth = groundTruthOf(scenarioById("lab-room-104-defect"));
    const door = truth.openings[0]!;
    expect(door.kind).toBe("door");
    expect(door.reachesFloor).toBe(true);
    expect(door.boundingPolygon).toHaveLength(4);
    // Verbatim rectangle: x=0 plane, y in [1.05, 1.95], z in [0, 2.05]
    // (parametric reconstruction; toBeCloseTo absorbs IEEE rounding).
    for (const vertex of door.boundingPolygon) {
      expect(vertex[0]).toBeCloseTo(0, 12);
      expect(vertex[1]).toBeGreaterThanOrEqual(1.05 - 1e-9);
      expect(vertex[1]).toBeLessThanOrEqual(1.95 + 1e-9);
      expect(vertex[2]).toBeGreaterThanOrEqual(-1e-9);
      expect(vertex[2]).toBeLessThanOrEqual(2.05 + 1e-9);
    }
    expect(door.boundingPolygon[0]![1]).toBeCloseTo(1.05, 12);
    expect(door.boundingPolygon[0]![2]).toBeCloseTo(0, 12);
    expect(door.boundingPolygon[2]![1]).toBeCloseTo(1.95, 12);
    expect(door.boundingPolygon[2]![2]).toBeCloseTo(2.05, 12);
    // All polygon vertices are ON the west wall plane (x = 0).
    for (const vertex of door.boundingPolygon) {
      expect(vecDot([-1, 0, 0], vertex) + 0).toBe(0);
    }
  });
});

describe("lab ground truth: expected state (nodes, BOQ, assurance)", () => {
  test("room 104's expected node set excludes the occluded wall's element", () => {
    const scenario = scenarioById("lab-room-104-defect");
    const truth = groundTruthOf(scenario);
    expect(truth.expectedNodeIds).toContain(elementNodeId("surface:room-104:wall-north"));
    expect(truth.expectedNodeIds).not.toContain(elementNodeId("surface:room-104:wall-east"));
    expect(truth.expectedNodeIds).toContain(spaceNodeId("room-104"));
    expect(truth.expectedNodeIds).toContain("opening:room-104:door-west");
    // The full hierarchy is part of the expected set.
    for (const id of hierarchyNodeIds(scenario)) {
      expect(truth.expectedNodeIds).toContain(id);
    }
    // 4 hierarchy + 1 space + 5 captured elements + 1 opening = 11 nodes.
    expect(truth.expectedNodeIds).toHaveLength(11);
  });

  test("ground floor's expected node set: 4 + 3 + 18 = 25 nodes", () => {
    const truth = groundTruthOf(scenarioById("lab-floor-gf-boq"));
    expect(truth.expectedNodeIds).toHaveLength(25);
    for (const room of ["room-a", "room-b", "room-c"]) {
      expect(truth.expectedNodeIds).toContain(spaceNodeId(room));
      expect(truth.expectedNodeIds).toContain(elementNodeId(`surface:${room}:floor`));
    }
  });

  test("BOQ equivalents are hand-computed: floor areas 20/14/9 (sum 43); repair 9", () => {
    const floor = groundTruthOf(scenarioById("lab-floor-gf-boq"));
    const row1 = floor.boq!.rows[0]!;
    expect(row1.nodeQuantities.map((q) => q.truth)).toEqual([20, 14, 9]);
    expect(row1.aggregateTruth).toBe(43);
    expect(row1.expectedTargets).toEqual([
      "element:room-a:floor",
      "element:room-b:floor",
      "element:room-c:floor",
    ]);
    const row2 = floor.boq!.rows[1]!;
    expect(row2.expectedTargets).toBe("unmapped");
    const repair = groundTruthOf(scenarioById("lab-room-204-repair"));
    const repairRow = repair.boq!.rows[0]!;
    expect(repairRow.nodeQuantities[0]!.truth).toBe(9); // 3.6 × 2.5
    expect(repairRow.nodeQuantities[0]!.nodeId).toBe("element:room-204:wall-south");
    expect(repairRow.expectedTargets).toHaveLength(5);
  });

  test("expected assurance outcomes per scenario (verdict + completeness)", () => {
    const a = groundTruthOf(scenarioById("lab-room-104-defect")).assurance;
    expect(a.readiness).toBe("READY");
    expect(a.captureCompleteness).toBe("COMPLETE");
    expect(a.dimensionOutcomes["visual-condition-evidence"]).toBe("satisfied");
    const b = groundTruthOf(scenarioById("lab-floor-gf-boq")).assurance;
    expect(b.readiness).toBe("READY_WITH_NOTES");
    expect(b.dimensionOutcomes["material-epistemic-floor"]).toBe("not_satisfied");
    const c = groundTruthOf(scenarioById("lab-room-204-repair"));
    expect(c.assurance.readiness).toBe("READY");
    expect(c.postWorkAssurance?.readiness).toBe("READY_WITH_NOTES");
    expect(c.postWorkAssurance?.dimensionOutcomes["defect-size-uncertainty"]).toBe(
      "insufficient_data",
    );
  });

  test("not-observed declarations are first-class ground truth", () => {
    const a = groundTruthOf(scenarioById("lab-room-104-defect")).notObserved;
    const statuses = new Map(a.map((entry) => [entry.subjectId, entry.status] as const));
    expect(statuses.get("surface:room-104:wall-east")).toBe("OCCLUDED");
    expect(statuses.get("node:space:room-104:room.width")).toBe("NOT_OBSERVED");
    expect(statuses.get("surface:room-104:wall-north:defect.depth")).toBe("UNKNOWN");
    const c = groundTruthOf(scenarioById("lab-room-204-repair")).notObserved;
    expect(
      c.some((entry) => entry.subjectId === "surface:room-204:wall-south:defect.depth"),
    ).toBe(true);
    // The fully-captured floor declares none.
    expect(groundTruthOf(scenarioById("lab-floor-gf-boq")).notObserved).toHaveLength(0);
  });
});

describe("lab capture fixtures: deterministic noise over real contracts", () => {
  test("identical fixture inputs produce byte-identical depth frames (rerun pin)", () => {
    const scenario = scenarioById("lab-room-104-defect");
    const truth = groundTruthOf(scenario);
    const plan = scenario.capturePlan.filter((a) => a.method === "DEPTH_SENSING");
    const first = buildCaptureAssets(scenario, truth, plan);
    const second = buildCaptureAssets(scenario, truth, plan);
    expect(first.map((a) => a.contentId)).toEqual(second.map((a) => a.contentId));
    for (const asset of first) {
      expect(asset.bytes).toEqual(second.find((x) => x.assetId === asset.assetId)!.bytes);
    }
  });

  test("noise displaces points along the surface normal within ~4σ of the declared σ", () => {
    const scenario = scenarioById("lab-room-104-defect");
    const truth = groundTruthOf(scenario);
    const plan = scenario.capturePlan.filter((a) => a.method === "DEPTH_SENSING");
    const assets = buildCaptureAssets(scenario, truth, plan);
    const surfaceTruth = truth.surfaces.find((s) => s.surfaceId === "surface:room-104:floor")!;
    const frame = assets.find((a) => a.surfaceId === "surface:room-104:floor")!;
    // Parse the encoded frame and verify the displacement statistics.
    const text = new TextDecoder().decode(frame.bytes);
    const points = text
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("#"))
      .map((line) => line.split(/\s+/).map(Number));
    expect(points).toHaveLength(64);
    let rms = 0;
    for (const point of points) {
      const residual = vecDot(surfaceTruth.plane.normal, point as [number, number, number]);
      rms += residual * residual;
    }
    rms = Math.sqrt(rms / points.length);
    // The along-normal RMS must sit near the declared σ (loose statistical
    // bounds; the exact value is pinned by determinism tests elsewhere).
    expect(rms).toBeGreaterThan(LAB_DEVICE_SIGMA_M * 0.3);
    expect(rms).toBeLessThan(LAB_DEVICE_SIGMA_M * 2);
  });

  test("the depth-map exchange format encodes exactly three numbers per line", () => {
    const bytes = encodeDepthMapFrame("surface:x", [
      [0.1, 0.2, 0.3],
      [-1.5, 2.25, 3.125],
    ]);
    const text = new TextDecoder().decode(bytes);
    const lines = text.split("\n").filter((line) => line !== "");
    expect(lines[0]).toBe("# aise-lab depth-map frame surface:x (exchange v1)");
    expect(lines[1]).toBe("0.100000 0.200000 0.300000");
    expect(lines[2]).toBe("-1.500000 2.250000 3.125000");
  });

  test("injected geometry errors displace exactly along the declared normal", () => {
    const scenario = scenarioById("lab-floor-gf-boq");
    const truth = groundTruthOf(scenario);
    const plan = [scenario.capturePlan.find((a) => a.assetId === "depth:surface:room-b:wall-west")!];
    const clean = buildCaptureAssets(scenario, truth, plan)[0]!;
    const dirty = buildCaptureAssets(scenario, truth, plan, {
      injectedGeometryError: { assetId: "depth:surface:room-b:wall-west", offsetM: 0.15 },
    })[0]!;
    // The west wall's outward normal is (-1, 0, 0): the dirty points move
    // exactly -0.15 m in x (plus the same noise realization).
    const parse = (bytes: Uint8Array): number[][] =>
      new TextDecoder()
        .decode(bytes)
        .split("\n")
        .filter((line) => line !== "" && !line.startsWith("#"))
        .map((line) => line.split(/\s+/).map(Number));
    const cleanPoints = parse(clean.bytes);
    const dirtyPoints = parse(dirty.bytes);
    expect(dirtyPoints.length).toBe(cleanPoints.length);
    for (let index = 0; index < cleanPoints.length; index += 1) {
      const cleanPoint = cleanPoints[index]!;
      const dirtyPoint = dirtyPoints[index]!;
      expect(dirtyPoint[0]).toBeCloseTo(cleanPoint[0]! - 0.15, 6);
      expect(dirtyPoint[1]).toBeCloseTo(cleanPoint[1]!, 9);
      expect(dirtyPoint[2]).toBeCloseTo(cleanPoint[2]!, 9);
    }
  });
});
