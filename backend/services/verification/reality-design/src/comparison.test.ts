import { describe, expect, it } from "vitest";
import {
  compareRealityToDesign,
  validateComparisonReport,
  type DesignElement,
  type RealityElement,
} from "./comparison.js";

const evidence = (label: string) => ({
  contentHash: `${label}-hash`,
  label,
  epistemic: "INFERRED" as const,
});

const design = (overrides: Partial<DesignElement> = {}): DesignElement => ({
  designId: "D-1",
  kind: "wall",
  position: { x: 0, y: 0, z: 0 },
  size: 1,
  provenance: [evidence("design")],
  ...overrides,
});

const reality = (overrides: Partial<RealityElement> = {}): RealityElement => ({
  realityId: "R-1",
  kind: "wall",
  position: { x: 0.01, y: 0, z: 0 },
  size: 1.01,
  provenance: [evidence("reality")],
  ...overrides,
});

describe("AISE-029 comparison", () => {
  it("passes a within-tolerance corresponded element and validates its digest", () => {
    const report = compareRealityToDesign({ unit: "meter", design: [design()], reality: [reality()] });
    expect(report.status).toBe("PASS");
    expect(report.correspondences).toHaveLength(1);
    expect(report.mismatches).toHaveLength(0);
    expect(() => validateComparisonReport(report)).not.toThrow();
  });

  it("reports explicit position and size mismatches with evidence", () => {
    const report = compareRealityToDesign({
      unit: "meter",
      design: [design()],
      reality: [reality({ position: { x: 0.1, y: 0, z: 0 }, size: 1.2 })],
      correspondenceTolerance: 0.2,
      positionTolerance: 0.05,
      sizeTolerance: 0.05,
    });
    expect(report.status).toBe("MISMATCH");
    expect(report.mismatches.map((item) => item.kind).sort()).toEqual(["position", "size"]);
    expect(report.mismatches.every((item) => item.evidence.length >= 2)).toBe(true);
  });

  it("fails closed on ambiguous correspondence", () => {
    const report = compareRealityToDesign({
      unit: "meter",
      design: [design()],
      reality: [
        reality({ realityId: "R-1", position: { x: 0.10, y: 0, z: 0 } }),
        reality({ realityId: "R-2", position: { x: -0.10, y: 0, z: 0 } }),
      ],
      correspondenceTolerance: 0.2,
      ambiguityMargin: 0.01,
    });
    expect(report.status).toBe("AMBIGUOUS");
    expect(report.correspondences).toHaveLength(0);
    expect(report.unmatchedDesign).toEqual(["D-1"]);
    expect(report.unmatchedReality).toEqual(["R-1", "R-2"]);
  });

  it("uses uncertainty for the measured quantity only", () => {
    const report = compareRealityToDesign({
      unit: "meter",
      design: [design({ positionUncertainty: 0.2, size: 1 })],
      reality: [reality({ position: { x: 0.1, y: 0, z: 0 }, positionUncertainty: 0.2, size: 1.12, sizeUncertainty: 0.1 })],
      correspondenceTolerance: 0.2,
      positionTolerance: 0.05,
      sizeTolerance: 0.05,
    });
    expect(report.status).toBe("PASS");
    expect(report.mismatches).toHaveLength(0);
  });

  it("fails closed when provenance is absent", () => {
    expect(() => compareRealityToDesign({
      unit: "meter",
      design: [design({ provenance: [] })],
      reality: [reality()],
    })).toThrow(/provenance/);
  });

  it("is emission-order independent", () => {
    const first = compareRealityToDesign({
      unit: "meter",
      design: [design({ designId: "D-2" }), design({ designId: "D-1" })],
      reality: [reality({ realityId: "R-2" }), reality({ realityId: "R-1" })],
    });
    const second = compareRealityToDesign({
      unit: "meter",
      design: [design({ designId: "D-1" }), design({ designId: "D-2" })],
      reality: [reality({ realityId: "R-1" }), reality({ realityId: "R-2" })],
    });
    expect(second).toEqual(first);
  });

  it("rejects tampering with the content-bound digest", () => {
    const report = compareRealityToDesign({ unit: "meter", design: [design()], reality: [reality()] });
    const tampered = { ...report, status: "MISMATCH" as const };
    expect(() => validateComparisonReport(tampered)).toThrow(/digest/);
  });
});
