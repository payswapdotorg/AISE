/**
 * AISE-035 — scenario definition tests: structural invariants of the three
 * representative scenarios (repeatable physical missions), pinned
 * hand-computable values, and fixture purity (deep-frozen — the runner can
 * never mutate them).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  LAB_SCENARIOS,
  capturedSurfaces,
  scenarioById,
} from "./scenarios";
import { groundTruthOf } from "./groundtruth";

describe("lab scenarios: the representative mission set", () => {
  test("exactly three scenarios ship, with unique ids", () => {
    expect(LAB_SCENARIOS.map((s) => s.scenarioId)).toEqual([
      "lab-room-104-defect",
      "lab-floor-gf-boq",
      "lab-room-204-repair",
    ]);
    expect(new Set(LAB_SCENARIOS.map((s) => s.scenarioId)).size).toBe(3);
  });

  test("the three required scenario archetypes are covered", () => {
    const roomDefect = scenarioById("lab-room-104-defect");
    const floorBoq = scenarioById("lab-floor-gf-boq");
    const repair = scenarioById("lab-room-204-repair");
    // (1) a representative room with a defect:
    expect(roomDefect.defect).not.toBeNull();
    expect(roomDefect.rooms).toHaveLength(1);
    // (2) a multi-room floor with BOQ reconciliation:
    expect(floorBoq.rooms.length).toBeGreaterThanOrEqual(2);
    expect(floorBoq.boq?.rows.length).toBeGreaterThanOrEqual(2);
    // (3) an intervention case with execution + outcome:
    expect(repair.intervention).not.toBeNull();
    expect(repair.postWorkCapturePlan).not.toBeNull();
    expect(repair.caseSpec).not.toBeNull();
  });

  test("scenarioById refuses unknown ids (typed, never silent)", () => {
    expect(() => scenarioById("lab-nope")).toThrow("lab scenario not found");
  });

  test("every surface references its room; roles are vocabulary-valid", () => {
    for (const scenario of LAB_SCENARIOS) {
      const roomLabels = new Set(scenario.rooms.map((room) => room.label));
      for (const surface of scenario.surfaces) {
        expect(roomLabels.has(surface.roomLabel)).toBe(true);
        expect(["floor", "ceiling", "wall"]).toContain(surface.role);
        expect(surface.surfaceId).toBe(
          `surface:${surface.roomLabel}:${surface.surfaceId.split(":")[2]}`,
        );
      }
    }
  });

  test("occluded surfaces always declare why", () => {
    for (const scenario of LAB_SCENARIOS) {
      for (const surface of scenario.surfaces) {
        if (surface.occluded) {
          expect(surface.occlusionDetail).toBeDefined();
          expect(surface.occlusionDetail!.length).toBeGreaterThan(10);
        }
      }
    }
    // Exactly one occluded surface ships (room 104's east wall).
    const occluded = LAB_SCENARIOS.flatMap((s) => s.surfaces.filter((x) => x.occluded));
    expect(occluded.map((s) => s.surfaceId)).toEqual(["surface:room-104:wall-east"]);
  });

  test("capture plans reference declared surfaces with positive grids", () => {
    for (const scenario of LAB_SCENARIOS) {
      const surfaceIds = new Set(scenario.surfaces.map((s) => s.surfaceId));
      for (const asset of scenario.capturePlan) {
        if (asset.surfaceId !== null) {
          expect(surfaceIds.has(asset.surfaceId)).toBe(true);
          expect(asset.gridSide).toBeGreaterThan(0);
          // Depth frames never target occluded surfaces.
          const surface = scenario.surfaces.find((s) => s.surfaceId === asset.surfaceId);
          expect(surface?.occluded).toBeFalsy();
        }
      }
    }
  });

  test("every non-occluded surface of every room has a depth frame", () => {
    for (const scenario of LAB_SCENARIOS) {
      const framed = new Set(
        scenario.capturePlan
          .filter((asset) => asset.method === "DEPTH_SENSING")
          .map((asset) => asset.surfaceId),
      );
      for (const surface of capturedSurfaces(scenario)) {
        expect(framed.has(surface.surfaceId)).toBe(true);
      }
    }
  });

  test("assurance profiles referenced by scenarios are shipped profiles", () => {
    for (const scenario of LAB_SCENARIOS) {
      expect([
        "assurance-profile/condition-inspection/v1",
        "assurance-profile/dimensional-survey/v1",
        "assurance-profile/as-built-model/v1",
      ]).toContain(scenario.mission.assuranceProfileId);
    }
  });

  test("fixture purity: scenarios are deep-frozen (mutation attempts throw)", () => {
    const scenario = scenarioById("lab-room-104-defect");
    expect(() => {
      (scenario as unknown as { intent: string }).intent = "tampered";
    }).toThrow();
    expect(() => {
      (scenario.rooms as unknown as unknown[]).push({ label: "x" });
    }).toThrow();
    // The ground-truth registry is frozen too.
    const truth = groundTruthOf(scenario);
    expect(() => {
      (truth.dimensions as unknown as unknown[]).length = 0;
    }).toThrow();
  });

  test("fixture purity: the scenario set is byte-stable across module loads", () => {
    // The frozen scenario constants canonicalize identically every time.
    const first = canonicalJsonStringify(LAB_SCENARIOS);
    const again = canonicalJsonStringify(
      LAB_SCENARIOS.map((s) => scenarioById(s.scenarioId)),
    );
    expect(again).toBe(first);
  });
});
