/**
 * The AISE-022 scoring/observe suite: the pure functions over a
 * minimal synthetic graph — the MISSING discipline (an absent
 * observable is never a PASS, never silently skipped) and the
 * unit-family fail-closed conversion.
 */
import { describe, expect, it } from "vitest";
import { assembleModelGraph, makeSpaceNode } from "@aise/engineering-model";
import { caseById } from "./cases.js";
import { observeGraph } from "./observe.js";
import { scoreCase } from "./scoring.js";
import { lengthToSiMeters, LENGTH_SI_FACTORS } from "./units.js";
import { isBenchmarkError } from "./errors.js";

/** A minimal empty graph: one ROOM space, no objects, no properties. */
function emptyGraph() {
  return assembleModelGraph({
    modelId: "bench-empty",
    projectId: "bench-empty",
    spaces: [
      makeSpaceNode({
        spaceId: "bench-empty-space",
        kind: "ROOM",
        name: "empty room",
        frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" },
      }),
    ],
    objects: [],
    relationships: [],
  });
}

describe("the MISSING discipline (absence is never compliance)", () => {
  it("an empty reconstruction reports dimension observables MISSING and counts as observed zeros", () => {
    const observations = observeGraph(emptyGraph());
    for (const [key, observation] of Object.entries(observations)) {
      if (key.startsWith("count:")) {
        // A zero count is an OBSERVED value (nothing was
        // extracted) — a real, failing result, not a hole.
        expect(observation.present, `observable ${key}`).toBe(true);
        expect(observation.value).toBe(0);
      } else {
        expect(observation.present, `observable ${key}`).toBe(false);
        expect(observation.value).toBeUndefined();
      }
    }
  });

  it("a gating case over the empty graph FAILs: zero counts are FAILs, absent dimensions are MISSING", () => {
    const exact = caseById("exact-room");
    const result = scoreCase(exact, observeGraph(emptyGraph()));
    expect(result.verdict).toBe("FAIL");
    // 5 count metrics: observed zeros vs expected 1/4 → FAIL.
    // 10 dimension metrics: observables absent → MISSING.
    expect(result.counts).toEqual({ pass: 0, fail: 5, missing: 10 });
    for (const metric of result.metrics) {
      if (metric.observable.startsWith("count:")) {
        expect(metric.verdict).toBe("FAIL");
        expect(metric.observed).toBe(0);
      } else {
        expect(metric.verdict).toBe("MISSING");
        expect(metric.observed).toBeUndefined();
        expect(metric.absError).toBeUndefined();
      }
    }
  });

  it("an analysis case over the empty graph is REPORTED (not silently skipped)", () => {
    const outlier = caseById("outlier-room");
    const result = scoreCase(outlier, observeGraph(emptyGraph()));
    expect(result.verdict).toBe("REPORTED");
    expect(result.counts.missing).toBe(10);
    expect(result.counts.fail).toBe(5);
  });
});

describe("exact SI conversion (fail closed)", () => {
  it("converts the frozen length vocabulary exactly", () => {
    expect(lengthToSiMeters(1, "meter")).toBe(1);
    expect(lengthToSiMeters(1, "millimeter")).toBe(0.001);
    expect(lengthToSiMeters(1, "centimeter")).toBe(0.01);
    expect(lengthToSiMeters(1, "inch")).toBe(0.0254);
    expect(lengthToSiMeters(1, "foot")).toBe(0.3048);
    expect(LENGTH_SI_FACTORS.inch).toBe(0.0254);
  });

  it("unknown or area units fail closed", () => {
    expect(() => lengthToSiMeters(1, "furlong")).toThrowError(/not a length unit/);
    expect(() => lengthToSiMeters(1, "square_meter")).toThrowError(/not a length unit/);
    try {
      lengthToSiMeters(1, "furlong");
    } catch (error) {
      expect(isBenchmarkError(error)).toBe(true);
    }
  });
});
