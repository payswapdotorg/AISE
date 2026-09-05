import { describe, expect, it } from "vitest";
import { compareRealityToDesign } from "./comparison.js";

const evidence = {
  contentHash: "hash",
  label: "fixture",
  epistemic: "OBSERVED" as const,
};

describe("AISE-029 unmatched and validation boundaries", () => {
  it("reports missing design and extra reality elements explicitly", () => {
    const report = compareRealityToDesign({
      unit: "meter",
      design: [{ designId: "D-1", kind: "wall", position: { x: 0, y: 0, z: 0 }, size: 1, provenance: [evidence] }],
      reality: [{ realityId: "R-2", kind: "door", position: { x: 3, y: 0, z: 0 }, size: 2, provenance: [evidence] }],
    });
    expect(report.status).toBe("MISMATCH");
    expect(report.unmatchedDesign).toEqual(["D-1"]);
    expect(report.unmatchedReality).toEqual(["R-2"]);
  });

  it("rejects duplicate source identities before emitting a report", () => {
    expect(() => compareRealityToDesign({
      unit: "meter",
      design: [
        { designId: "D-1", kind: "wall", position: { x: 0, y: 0, z: 0 }, size: 1, provenance: [evidence] },
        { designId: "D-1", kind: "wall", position: { x: 0, y: 0, z: 1 }, size: 1, provenance: [evidence] },
      ],
      reality: [],
    })).toThrow(/duplicate design id/);
  });
});
