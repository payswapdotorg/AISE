import { describe, expect, it } from "vitest";
import {
  assembleEvidenceGraph,
  assembleModelGraph,
  evidenceLink,
  makeRealityObject,
  makeSpaceNode,
  modelProvenance,
  propertyAssertion,
  type PropertyAssertion,
  type RealityModelGraph,
} from "@aise/engineering-model";
import type { AssuranceProfile } from "@aise/shared-contracts";
import {
  computeReadiness,
  readinessReportDigest,
  type DimensionResult,
  type ReadinessReport,
} from "./readiness.js";
import { taskProfile, type TaskProfileRecord } from "./profile.js";
import {
  DOOR,
  MODEL,
  PROJECT,
  SPACE,
  lidarEvidence,
  mappingWith,
  measurementEvidence,
  smallGraph,
  subjects,
  wallHeight,
} from "./testing.js";

const TASK_COUNTER_BASE = { intent: "AS_BUILT" as const };

function profileOf(profile: AssuranceProfile, budget?: { lengthM?: number; areaM2?: number; angleRad?: number }): TaskProfileRecord {
  return taskProfile({
    taskId: `task-${profile.toLowerCase()}`,
    ...TASK_COUNTER_BASE,
    profile,
    ...(budget !== undefined ? { uncertaintyBudget: budget } : {}),
  });
}

function assess(
  graph: RealityModelGraph,
  mapping: Parameters<typeof computeReadiness>[0]["mapping"],
  profile: TaskProfileRecord,
  options: { mappingPresent?: boolean; version?: number } = {},
): ReadinessReport {
  return computeReadiness({
    graph,
    version: options.version ?? 1,
    mapping,
    mappingPresent: options.mappingPresent ?? true,
    profile,
  });
}

function dimensionOf(report: ReadinessReport, name: string): DimensionResult {
  const found = report.dimensions.find((dimension) => dimension.dimension === name);
  if (found === undefined) {
    throw new Error(`dimension ${name} missing from report`);
  }
  return found;
}

function codesOf(report: ReadinessReport, name: string): string[] {
  return dimensionOf(report, name).findings.map((finding) => finding.code);
}

/** The survey-confirmed roomHeight (CONFIRMED measurement with uncertainty). */
function confirmedRoomHeight(measurementId: string, uncertainty: PropertyAssertion["quantity"] extends undefined ? never : { kind: "standard"; u: number }): PropertyAssertion {
  return propertyAssertion({
    key: "roomHeight",
    quantity: { value: 2.7, unit: "meter", uncertainty },
    status: "CONFIRMED",
    kind: "measurement",
    evidenceRefs: [measurementId],
    verifiedBy: "user:site-engineer",
    verifiedAt: "2026-09-06T10:00:00Z",
    method: "test/fixture",
  });
}

describe("boundary discipline (fail-closed computation)", () => {
  it("throws on a tampered graph (digest mismatch)", () => {
    const graph = smallGraph();
    // A shallow copy of a frozen graph is itself unfrozen — deep
    // freeze it so the tamper reaches the DIGEST check (the
    // frozen-content proof fires first on an unfrozen graph).
    const tampered = Object.freeze({ ...graph, digest: "0".repeat(64) }) as RealityModelGraph;
    expect(() => assess(tampered, mappingWith([], []), profileOf("LIGHT"))).toThrowError(/digest/i);
  });

  it("throws on a tampered mapping", () => {
    const graph = smallGraph();
    const lidar = lidarEvidence();
    const mapping = mappingWith([lidar], [{ subject: subjects(1).wallExistence, evidenceId: lidar.evidenceId }]);
    const tampered = Object.freeze({ ...mapping, digest: "0".repeat(64) }) as typeof mapping;
    expect(() => assess(graph, tampered, profileOf("LIGHT"))).toThrowError();
  });
});

describe("model-integrity", () => {
  it("FAILs an empty model with EMPTY_MODEL at every profile", () => {
    const empty = assembleModelGraph({ modelId: MODEL, projectId: PROJECT, spaces: [], objects: [], relationships: [] });
    for (const profile of ["LIGHT", "STANDARD", "HIGH_ASSURANCE", "CRITICAL"] as const) {
      const report = assess(empty, mappingWith([], []), profileOf(profile));
      expect(report.verdict).toBe("NOT_READY");
      expect(dimensionOf(report, "model-integrity").verdict).toBe("FAIL");
      expect(codesOf(report, "model-integrity")).toContain("EMPTY_MODEL");
    }
  });

  it("passes a non-empty model with structural counts", () => {
    const report = assess(smallGraph(), mappingWith([], []), profileOf("LIGHT"));
    const integrity = dimensionOf(report, "model-integrity");
    expect(integrity.verdict).toBe("PASS");
    if (integrity.dimension !== "model-integrity") {
      throw new Error("unreachable");
    }
    expect(integrity.objectCount).toBe(1);
    expect(integrity.spaceCount).toBe(1);
    expect(integrity.assertionCount).toBe(3);
  });
});

describe("evidence-coverage", () => {
  it("reports NO_EVIDENCE_MAPPING when the project has no mapping", () => {
    const mapping = mappingWith([], []);
    const report = assess(smallGraph(), mapping, profileOf("STANDARD"), { mappingPresent: false });
    const coverage = dimensionOf(report, "evidence-coverage");
    if (coverage.dimension !== "evidence-coverage") {
      throw new Error("unreachable");
    }
    expect(coverage.verdict).toBe("FAIL"); // ratio 0 < 0.25 at STANDARD
    expect(coverage.coverageRatio).toBe(0);
    expect(codesOf(report, "evidence-coverage")).toContain("NO_EVIDENCE_MAPPING");
    expect(report.assertionTotals.assertions).toBe(3);
    expect(report.assertionTotals.withSupport).toBe(0);
  });

  it("reports NO_EVIDENCE_MAPPING when the mapping carries no live links", () => {
    const report = assess(smallGraph(), mappingWith([lidarEvidence()], []), profileOf("STANDARD"));
    expect(codesOf(report, "evidence-coverage")).toContain("NO_EVIDENCE_MAPPING");
  });

  it("computes the coverage ratio over all assertion subjects", () => {
    const lidar = lidarEvidence();
    const mapping = mappingWith([lidar], [{ subject: subjects(1).wallExistence, evidenceId: lidar.evidenceId }]);
    const report = assess(smallGraph(), mapping, profileOf("LIGHT"));
    const coverage = dimensionOf(report, "evidence-coverage");
    if (coverage.dimension !== "evidence-coverage") {
      throw new Error("unreachable");
    }
    expect(coverage.coverageRatio).toBeCloseTo(1 / 3, 12);
    expect(coverage.verdict).toBe("REPORTED"); // LIGHT: advisory
    expect(report.verdict).toBe("READY"); // nothing required failed
  });

  it("STANDARD passes at 1/3 (≥ 0.25) and fails at 0", () => {
    const lidar = lidarEvidence();
    const partial = mappingWith([lidar], [{ subject: subjects(1).wallExistence, evidenceId: lidar.evidenceId }]);
    expect(assess(smallGraph(), partial, profileOf("STANDARD")).verdict).toBe("READY");
    expect(assess(smallGraph(), mappingWith([], []), profileOf("STANDARD")).verdict).toBe("NOT_READY");
  });

  it("CRITICAL requires full coverage", () => {
    const lidar = lidarEvidence();
    const measurement = measurementEvidence(2.7);
    const two = mappingWith(
      [lidar, measurement],
      [
        { subject: subjects(1).wallExistence, evidenceId: lidar.evidenceId },
        { subject: subjects(1).roomHeight, evidenceId: measurement.evidenceId },
      ],
    );
    const report = assess(smallGraph(), two, profileOf("CRITICAL"));
    expect(dimensionOf(report, "evidence-coverage").verdict).toBe("FAIL"); // 2/3
    expect(report.verdict).toBe("NOT_READY");
  });

  it("lists uncovered CONFIRMED assertions individually (consequential)", () => {
    // CONFIRMED roomHeight citing the measurement, but no link attaches it.
    const measurement = measurementEvidence(2.7);
    const graph = smallGraph({ roomHeight: confirmedRoomHeight(measurement.evidenceId, { kind: "standard", u: 0.005 }) });
    const report = assess(graph, mappingWith([measurement], []), profileOf("STANDARD"));
    const coverageFindings = dimensionOf(report, "evidence-coverage").findings;
    const uncoveredConfirmed = coverageFindings.filter((finding) => finding.code === "UNCOVERED_CONFIRMED_ASSERTION");
    expect(uncoveredConfirmed).toHaveLength(1);
    expect(uncoveredConfirmed[0]!.subjectDescription).toContain("roomHeight");
    // The non-confirmed uncovered assertions are aggregated.
    const aggregate = coverageFindings.filter((finding) => finding.code === "UNCOVERED_ASSERTIONS");
    expect(aggregate).toHaveLength(1);
  });
});

describe("measurement-uncertainty", () => {
  it("reports NO_MEASUREMENTS for estimate-only models (advisory at STANDARD)", () => {
    const report = assess(smallGraph(), mappingWith([], []), profileOf("STANDARD"));
    const dimension = dimensionOf(report, "measurement-uncertainty");
    if (dimension.dimension !== "measurement-uncertainty") {
      throw new Error("unreachable");
    }
    expect(dimension.verdict).toBe("REPORTED");
    expect(codesOf(report, "measurement-uncertainty")).toContain("NO_MEASUREMENTS");
  });

  it("fails a measurement without uncertainty at HIGH_ASSURANCE (AC-071 discipline)", () => {
    const measurement = measurementEvidence(2.7);
    const roomHeight = propertyAssertion({
      key: "roomHeight",
      quantity: { value: 2.7, unit: "meter" },
      status: "OBSERVED",
      kind: "measurement",
      method: "test/fixture",
    });
    const graph = smallGraph({ roomHeight });
    const report = assess(graph, mappingWith([measurement], [{ subject: subjects(1).roomHeight, evidenceId: measurement.evidenceId }]), profileOf("HIGH_ASSURANCE"));
    const dimension = dimensionOf(report, "measurement-uncertainty");
    if (dimension.dimension !== "measurement-uncertainty") {
      throw new Error("unreachable");
    }
    expect(dimension.verdict).toBe("FAIL");
    expect(dimension.measurementCount).toBe(1);
    expect(dimension.measurementsWithUncertainty).toBe(0);
    expect(codesOf(report, "measurement-uncertainty")).toContain("MEASUREMENT_WITHOUT_UNCERTAINTY");
  });

  it("accepts measurements with uncertainty; estimates without uncertainty are not flagged", () => {
    const measurement = measurementEvidence(2.7);
    const roomHeight = propertyAssertion({
      key: "roomHeight",
      quantity: { value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 0.005 } },
      status: "OBSERVED",
      kind: "measurement",
      method: "test/fixture",
    });
    const graph = smallGraph({ roomHeight }); // wallHeight stays an estimate without uncertainty
    const report = assess(graph, mappingWith([measurement], []), profileOf("HIGH_ASSURANCE"));
    const dimension = dimensionOf(report, "measurement-uncertainty");
    if (dimension.dimension !== "measurement-uncertainty") {
      throw new Error("unreachable");
    }
    expect(dimension.verdict).toBe("PASS");
    expect(dimension.measurementCount).toBe(1);
    expect(dimension.measurementsWithUncertainty).toBe(1);
    expect(codesOf(report, "measurement-uncertainty")).toEqual([]);
  });

  it("CRITICAL additionally requires at least one direct measurement", () => {
    // Same graph, but the measurement is withdrawn (estimate-only).
    const report = assess(smallGraph(), mappingWith([], []), profileOf("CRITICAL"));
    const dimension = dimensionOf(report, "measurement-uncertainty");
    if (dimension.dimension !== "measurement-uncertainty") {
      throw new Error("unreachable");
    }
    expect(dimension.verdict).toBe("FAIL");
    expect(codesOf(report, "measurement-uncertainty")).toContain("NO_MEASUREMENTS");
  });
});

describe("confirmed-validity (AC-062/AC-063 into readiness)", () => {
  function confirmedGraph(measurementId: string): RealityModelGraph {
    return smallGraph({ roomHeight: confirmedRoomHeight(measurementId, { kind: "standard", u: 0.005 }) });
  }

  it("passes when every CONFIRMED assertion's citations are live-supported", () => {
    const measurement = measurementEvidence(2.7);
    const mapping = mappingWith([measurement], [{ subject: subjects(1).roomHeight, evidenceId: measurement.evidenceId }]);
    const report = assess(confirmedGraph(measurement.evidenceId), mapping, profileOf("CRITICAL"));
    const dimension = dimensionOf(report, "confirmed-validity");
    if (dimension.dimension !== "confirmed-validity") {
      throw new Error("unreachable");
    }
    expect(dimension.verdict).toBe("PASS");
    expect(dimension.confirmedCount).toBe(1);
    expect(dimension.validCount).toBe(1);
    expect(dimension.invalidatedCount).toBe(0);
  });

  it("retracting the support invalidates the confirmation and fails readiness (AC-063)", () => {
    const measurement = measurementEvidence(2.7);
    // The mapping carries the link AND its retraction — the
    // confirmation is invalidated by removed provenance.
    const link = evidenceLink({
      subject: subjects(1).roomHeight,
      evidenceId: measurement.evidenceId,
      linkedBy: "svc:test",
      linkedAt: "2026-09-02T10:00:00Z",
    });
    const mapping = assembleEvidenceGraph({
      projectId: PROJECT,
      records: [measurement],
      evidenceRetractions: [],
      links: [link],
      linkRetractions: [
        {
          linkId: link.linkId,
          retractedBy: "user:reviewer",
          reason: "flagged at review",
          retractedAt: "2026-09-07T09:00:00Z",
        },
      ],
    });
    const report = assess(confirmedGraph(measurement.evidenceId), mapping, profileOf("STANDARD"));
    const dimension = dimensionOf(report, "confirmed-validity");
    if (dimension.dimension !== "confirmed-validity") {
      throw new Error("unreachable");
    }
    expect(dimension.verdict).toBe("FAIL");
    expect(dimension.invalidatedCount).toBe(1);
    const findings = codesOf(report, "confirmed-validity");
    expect(findings).toContain("INVALIDATED_CONFIRMATION");
    expect(report.verdict).toBe("NOT_READY");
    expect(report.blockingDimensions).toContain("confirmed-validity");
  });

  it("LIGHT reports invalidated confirmations without blocking (advisory)", () => {
    const measurement = measurementEvidence(2.7);
    const graph = confirmedGraph(measurement.evidenceId);
    const mapping = mappingWith([measurement], []); // no link at all
    const report = assess(graph, mapping, profileOf("LIGHT"));
    expect(codesOf(report, "confirmed-validity")).toContain("INVALIDATED_CONFIRMATION");
    expect(dimensionOf(report, "confirmed-validity").verdict).toBe("REPORTED");
    expect(report.verdict).toBe("READY");
  });
});

describe("epistemic-composition", () => {
  function proposedGraph(): RealityModelGraph {
    const proposedWall = makeRealityObject(MODEL, {
      objectClass: "WALL",
      name: "wall-proposed",
      epistemicState: "PROPOSED",
      provenance: modelProvenance("test/fixture-v2", { fixture: "proposed" }, [
        {
          kind: "object",
          serviceId: "aise.semantics",
          method: "scene/assembly-v1",
          objectId: "upstream-wall-0002",
          contentHash: "c".repeat(64),
          epistemic: "PROPOSED",
        },
      ]),
    });
    return smallGraph({ extraObjects: [proposedWall] });
  }

  it("CRITICAL rejects PROPOSED content", () => {
    const report = assess(proposedGraph(), mappingWith([], []), profileOf("CRITICAL"));
    const dimension = dimensionOf(report, "epistemic-composition");
    if (dimension.dimension !== "epistemic-composition") {
      throw new Error("unreachable");
    }
    expect(dimension.verdict).toBe("FAIL");
    expect(dimension.proposedObjectCount).toBe(1);
    expect(codesOf(report, "epistemic-composition")).toContain("PROPOSED_CONTENT");
    expect(report.verdict).toBe("NOT_READY");
  });

  it("HIGH_ASSURANCE reports PROPOSED content without blocking", () => {
    const report = assess(proposedGraph(), mappingWith([], []), profileOf("HIGH_ASSURANCE"));
    const dimension = dimensionOf(report, "epistemic-composition");
    if (dimension.dimension !== "epistemic-composition") {
      throw new Error("unreachable");
    }
    expect(dimension.verdict).toBe("REPORTED");
    expect(codesOf(report, "epistemic-composition")).toContain("PROPOSED_CONTENT");
  });

  it("counts states and derives the weakest assertion state (passthrough)", () => {
    const report = assess(smallGraph(), mappingWith([], []), profileOf("LIGHT"));
    const summary = report.epistemicSummary;
    expect(summary.objectsByState.INFERRED).toBe(1);
    expect(summary.assertionsByState.INFERRED).toBe(3);
    expect(summary.weakestAssertionState).toBe("INFERRED");
    expect(summary.proposedObjectCount).toBe(0);
    // Epistemic states pass through untouched — the counts equal
    // the graph's own content.
    const graph = smallGraph();
    expect(graph.objects.filter((object) => object.epistemicState === "INFERRED")).toHaveLength(1);
  });
});

describe("uncertainty-budget", () => {
  function measuredGraph(
    quantity: { value: number; unit: "meter" | "millimeter" | "degree" | "square_meter"; uncertainty?: { kind: "standard"; u: number } | { kind: "expanded"; U: number; coverageFactor: number } | { kind: "tolerance"; lowerOffset: number; upperOffset: number } },
    status: "OBSERVED" | "INFERRED" = "OBSERVED",
  ): RealityModelGraph {
    const roomHeight = propertyAssertion({
      key: "roomHeight",
      quantity,
      status,
      kind: status === "OBSERVED" ? "measurement" : "estimate",
      method: "test/fixture",
    });
    return smallGraph({ roomHeight });
  }

  it("is NOT_APPLICABLE without a declared budget", () => {
    const report = assess(smallGraph(), mappingWith([], []), profileOf("CRITICAL"));
    expect(dimensionOf(report, "uncertainty-budget").verdict).toBe("NOT_APPLICABLE");
  });

  it("advises CRITICAL tasks without a declared budget (transparency, not refusal)", () => {
    const report = assess(smallGraph(), mappingWith([], []), profileOf("CRITICAL"));
    expect(codesOf(report, "uncertainty-budget")).toContain("NO_ACCURACY_BUDGET");
    expect(report.blockingDimensions).not.toContain("uncertainty-budget");
  });

  it("evaluates a standard uncertainty against the budget in SI", () => {
    const graph = measuredGraph({ value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 0.005 } });
    // HIGH: budget enforced, estimate-without-uncertainty is
    // advisory ambiguity (the wallHeight estimate is reported,
    // not blocking).
    const report = assess(graph, mappingWith([], []), profileOf("HIGH_ASSURANCE", { lengthM: 0.05 }));
    const dimension = dimensionOf(report, "uncertainty-budget");
    if (dimension.dimension !== "uncertainty-budget") {
      throw new Error("unreachable");
    }
    expect(dimension.verdict).toBe("PASS");
    expect(dimension.evaluatedCount).toBe(1);
    expect(dimension.exceededCount).toBe(0);
    expect(dimension.evaluations[0]!.siValue).toBeCloseTo(0.005, 15);
    expect(dimension.evaluations[0]!.siUnit).toBe("meter");
  });

  it("converts millimeter units exactly (5 mm → 0.005 m)", () => {
    const graph = measuredGraph({ value: 2700, unit: "millimeter", uncertainty: { kind: "standard", u: 5 } });
    const report = assess(graph, mappingWith([], []), profileOf("HIGH_ASSURANCE", { lengthM: 0.05 }));
    const dimension = dimensionOf(report, "uncertainty-budget");
    if (dimension.dimension !== "uncertainty-budget") {
      throw new Error("unreachable");
    }
    expect(dimension.evaluations[0]!.siValue).toBeCloseTo(0.005, 12);
    expect(dimension.verdict).toBe("PASS");
  });

  it("fails BUDGET_EXCEEDED when the standard-equivalent exceeds the bound", () => {
    const graph = measuredGraph({ value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 0.005 } });
    const report = assess(graph, mappingWith([], []), profileOf("CRITICAL", { lengthM: 0.001 }));
    const dimension = dimensionOf(report, "uncertainty-budget");
    if (dimension.dimension !== "uncertainty-budget") {
      throw new Error("unreachable");
    }
    expect(dimension.verdict).toBe("FAIL");
    expect(dimension.exceededCount).toBe(1);
    expect(codesOf(report, "uncertainty-budget")).toContain("BUDGET_EXCEEDED");
    expect(report.blockingDimensions).toContain("uncertainty-budget");
  });

  it("divides expanded uncertainty by the coverage factor (algebra, not invention)", () => {
    const graph = measuredGraph({ value: 2.7, unit: "meter", uncertainty: { kind: "expanded", U: 0.01, coverageFactor: 2 } });
    const report = assess(graph, mappingWith([], []), profileOf("HIGH_ASSURANCE", { lengthM: 0.05 }));
    const dimension = dimensionOf(report, "uncertainty-budget");
    if (dimension.dimension !== "uncertainty-budget") {
      throw new Error("unreachable");
    }
    expect(dimension.evaluations[0]!.siValue).toBeCloseTo(0.005, 15);
    expect(dimension.evaluations[0]!.uncertaintyKind).toBe("expanded");
  });

  it("NEVER converts a tolerance — BUDGET_UNEVALUABLE, failing CRITICAL (ambiguity is fail-closed)", () => {
    const graph = measuredGraph({ value: 2.7, unit: "meter", uncertainty: { kind: "tolerance", lowerOffset: -0.01, upperOffset: 0.01 } });
    const critical = assess(graph, mappingWith([], []), profileOf("CRITICAL", { lengthM: 0.05 }));
    const criticalDimension = dimensionOf(critical, "uncertainty-budget");
    if (criticalDimension.dimension !== "uncertainty-budget") {
      throw new Error("unreachable");
    }
    expect(criticalDimension.verdict).toBe("FAIL");
    // Two unevaluable at CRITICAL: the tolerance AND the
    // wallHeight estimate without any uncertainty record —
    // ambiguity fails closed across every quantity-bearing
    // assertion.
    expect(criticalDimension.unevaluableCount).toBe(2);
    const unevaluableFindings = criticalDimension.findings.filter((finding) => finding.code === "BUDGET_UNEVALUABLE");
    expect(unevaluableFindings).toHaveLength(2);
    expect(unevaluableFindings.some((finding) => finding.detail.includes("tolerance"))).toBe(true);
    expect(unevaluableFindings.some((finding) => (finding.subjectDescription ?? "").includes("wallHeight"))).toBe(true);

    // HIGH_ASSURANCE: advisory — the findings are reported, the
    // verdict is not blocked by ambiguity alone.
    const high = assess(graph, mappingWith([], []), profileOf("HIGH_ASSURANCE", { lengthM: 0.05 }));
    expect(codesOf(high, "uncertainty-budget")).toContain("BUDGET_UNEVALUABLE");
    expect(dimensionOf(high, "uncertainty-budget").verdict).toBe("PASS");
  });

  it("values without any uncertainty record are unevaluable against a budget", () => {
    const graph = measuredGraph({ value: 2.7, unit: "meter" });
    const report = assess(graph, mappingWith([], []), profileOf("CRITICAL", { lengthM: 0.05 }));
    expect(codesOf(report, "uncertainty-budget")).toContain("BUDGET_UNEVALUABLE");
    expect(dimensionOf(report, "uncertainty-budget").verdict).toBe("FAIL");
  });

  it("evaluates angle and area families in their SI base units", () => {
    const angleGraph = smallGraph({
      roomHeight: propertyAssertion({
        key: "roomHeight",
        quantity: { value: 90, unit: "degree", uncertainty: { kind: "standard", u: 0.1 } },
        status: "OBSERVED",
        kind: "measurement",
        method: "test/fixture",
      }),
    });
    const angleReport = assess(angleGraph, mappingWith([], []), profileOf("HIGH_ASSURANCE", { angleRad: 0.01 }));
    const angleDimension = dimensionOf(angleReport, "uncertainty-budget");
    if (angleDimension.dimension !== "uncertainty-budget") {
      throw new Error("unreachable");
    }
    expect(angleDimension.evaluations[0]!.siValue).toBeCloseTo(0.1 * (Math.PI / 180), 15);
    expect(angleDimension.evaluations[0]!.siUnit).toBe("radian");
    expect(angleDimension.verdict).toBe("PASS");

    const areaGraph = smallGraph({
      roomHeight: propertyAssertion({
        key: "roomHeight",
        quantity: { value: 12, unit: "square_meter", uncertainty: { kind: "standard", u: 0.1 } },
        status: "OBSERVED",
        kind: "measurement",
        method: "test/fixture",
      }),
    });
    const areaReport = assess(areaGraph, mappingWith([], []), profileOf("HIGH_ASSURANCE", { areaM2: 0.5 }));
    const areaDimension = dimensionOf(areaReport, "uncertainty-budget");
    if (areaDimension.dimension !== "uncertainty-budget") {
      throw new Error("unreachable");
    }
    expect(areaDimension.evaluations[0]!.siValue).toBeCloseTo(0.1, 15);
    expect(areaDimension.evaluations[0]!.siUnit).toBe("square_meter");
  });

  it("skips families the task did not budget", () => {
    const graph = measuredGraph({ value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 5 } }); // 5 m — way over any length budget
    const report = assess(graph, mappingWith([], []), profileOf("HIGH_ASSURANCE", { angleRad: 0.01 }));
    const dimension = dimensionOf(report, "uncertainty-budget");
    if (dimension.dimension !== "uncertainty-budget") {
      throw new Error("unreachable");
    }
    expect(dimension.evaluatedCount).toBe(0); // length not budgeted
    expect(dimension.verdict).toBe("PASS");
  });

  it("budget advisory at STANDARD/LIGHT when declared (REPORTED verdict)", () => {
    const graph = measuredGraph({ value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 5 } });
    const report = assess(graph, mappingWith([], []), profileOf("STANDARD", { lengthM: 0.05 }));
    const dimension = dimensionOf(report, "uncertainty-budget");
    if (dimension.dimension !== "uncertainty-budget") {
      throw new Error("unreachable");
    }
    expect(dimension.verdict).toBe("REPORTED");
    expect(dimension.exceededCount).toBe(1);
    expect(codesOf(report, "uncertainty-budget")).toContain("BUDGET_EXCEEDED");
  });

  it("evaluates estimates too (task accuracy is about the model's values)", () => {
    const graph = measuredGraph({ value: 2.7, unit: "meter", uncertainty: { kind: "standard", u: 0.5 } }, "INFERRED");
    const report = assess(graph, mappingWith([], []), profileOf("HIGH_ASSURANCE", { lengthM: 0.05 }));
    const dimension = dimensionOf(report, "uncertainty-budget");
    if (dimension.dimension !== "uncertainty-budget") {
      throw new Error("unreachable");
    }
    expect(dimension.evaluatedCount).toBe(1);
    expect(dimension.verdict).toBe("FAIL"); // 0.5 m > 0.05 m
  });
});

describe("confidence (reporting only — never a verdict input)", () => {
  function graphWithConfidence(confidence: number): RealityModelGraph {
    return smallGraph({
      roomHeight: propertyAssertion({
        key: "roomHeight",
        quantity: { value: 3.0, unit: "meter" },
        status: "INFERRED",
        kind: "estimate",
        confidence,
        method: "test/fixture",
      }),
    });
  }

  it("aggregates count, min, and mean", () => {
    const low = graphWithConfidence(0.25);
    const graph = smallGraph({
      roomHeight: propertyAssertion({
        key: "roomHeight",
        quantity: { value: 3.0, unit: "meter" },
        status: "INFERRED",
        kind: "estimate",
        confidence: 0.75,
        method: "test/fixture",
      }),
      wallProperties: [wallHeight({ confidence: 0.25 })],
    });
    const report = assess(graph, mappingWith([], []), profileOf("STANDARD"));
    expect(report.confidenceSummary.assertionsWithConfidence).toBe(2);
    expect(report.confidenceSummary.minConfidence).toBe(0.25);
    expect(report.confidenceSummary.meanConfidence).toBeCloseTo(0.5, 12);
    expect(report.assertionTotals.confidenceBearing).toBe(2);
    void low;
  });

  it("reports zero-confidence models without undefined aggregates", () => {
    const report = assess(smallGraph(), mappingWith([], []), profileOf("STANDARD"));
    expect(report.confidenceSummary).toEqual({ assertionsWithConfidence: 0 });
    expect(report.confidenceSummary.minConfidence).toBeUndefined();
    expect(report.confidenceSummary.meanConfidence).toBeUndefined();
  });

  it("confidence values NEVER change verdicts (non-substitution, AC-070/071)", () => {
    const mapping = mappingWith([], []);
    const low = assess(graphWithConfidence(0.01), mapping, profileOf("CRITICAL"));
    const high = assess(graphWithConfidence(0.99), mapping, profileOf("CRITICAL"));
    expect(low.verdict).toBe(high.verdict);
    expect(low.blockingDimensions).toEqual(high.blockingDimensions);
    expect(low.dimensions).toEqual(high.dimensions); // identical dimension results
    expect(low.assertionTotals.confidenceBearing).toBe(1);
    // Only the confidence summary differs — and the digest (confidence is content).
    expect(high.confidenceSummary.meanConfidence).toBe(0.99);
    expect(readinessReportDigest(low)).not.toBe(readinessReportDigest(high));
  });

  it("no dimension result carries confidence data (structural separation)", () => {
    const report = assess(graphWithConfidence(0.5), mappingWith([], []), profileOf("CRITICAL"));
    const serialized = JSON.stringify(report.dimensions);
    expect(serialized).not.toContain("confidence");
    expect(serialized).not.toContain("meanConfidence");
  });
});

describe("verdict assembly and report discipline", () => {
  it("a fully supported, measured, bounded model is READY at CRITICAL", () => {
    const measurement = measurementEvidence(2.7);
    const lidar = lidarEvidence();
    const graph = smallGraph({
      roomHeight: confirmedRoomHeight(measurement.evidenceId, { kind: "standard", u: 0.005 }),
      wallProperties: [
        propertyAssertion({
          key: "wallHeight",
          quantity: { value: 2.4, unit: "meter", uncertainty: { kind: "standard", u: 0.01 } },
          status: "OBSERVED",
          kind: "measurement",
          method: "test/fixture",
        }),
      ],
    });
    const mapping = mappingWith(
      [measurement, lidar],
      [
        { subject: subjects(1).roomHeight, evidenceId: measurement.evidenceId },
        { subject: subjects(1).wallHeight, evidenceId: measurement.evidenceId },
        { subject: subjects(1).wallExistence, evidenceId: lidar.evidenceId },
      ],
    );
    const report = assess(graph, mapping, profileOf("CRITICAL", { lengthM: 0.05 }));
    expect(report.verdict).toBe("READY");
    expect(report.blockingDimensions).toEqual([]);
    expect(report.assertionTotals).toEqual({
      assertions: 3,
      withSupport: 3,
      confirmed: 1,
      confirmedValid: 1,
      confirmedInvalidated: 0,
      measurements: 2,
      measurementsWithUncertainty: 2,
      proposedAssertions: 0,
      proposedObjects: 0,
      confidenceBearing: 0,
    });
  });

  it("advisory findings never block (STANDARD ready with NO_MEASUREMENTS advisory)", () => {
    const lidar = lidarEvidence();
    const mapping = mappingWith(
      [lidar],
      [
        { subject: subjects(1).wallExistence, evidenceId: lidar.evidenceId },
        { subject: subjects(1).roomHeight, evidenceId: lidar.evidenceId },
        { subject: subjects(1).wallHeight, evidenceId: lidar.evidenceId },
      ],
    );
    const report = assess(smallGraph(), mapping, profileOf("STANDARD"));
    expect(codesOf(report, "measurement-uncertainty")).toContain("NO_MEASUREMENTS"); // advisory
    expect(report.verdict).toBe("READY");
  });

  it("pins every input identity (model, version, digests, task)", () => {
    const graph = smallGraph();
    const mapping = mappingWith([], []);
    const profile = profileOf("STANDARD");
    const report = assess(graph, mapping, profile, { version: 7 });
    expect(report.modelId).toBe(MODEL);
    expect(report.version).toBe(7);
    expect(report.graphDigest).toBe(graph.digest);
    expect(report.mappingDigest).toBe(mapping.digest);
    expect(report.profileDigest).toBe(profile.digest);
    expect(report.taskId).toBe(profile.taskId);
    expect(report.intent).toBe("AS_BUILT");
    expect(report.assuranceProfile).toBe("STANDARD");
  });

  it("is deterministic: identical inputs yield bit-identical reports", () => {
    const graph = smallGraph();
    const mapping = mappingWith([lidarEvidence()], [{ subject: subjects(1).wallExistence, evidenceId: lidarEvidence().evidenceId }]);
    const profile = profileOf("CRITICAL", { lengthM: 0.05 });
    const a = assess(graph, mapping, profile);
    const b = assess(graph, mapping, profile);
    expect(a).toEqual(b);
    expect(readinessReportDigest(a)).toBe(readinessReportDigest(b));
  });

  it("freezes the report, its dimensions, and its findings", () => {
    const report = assess(smallGraph(), mappingWith([], []), profileOf("STANDARD"));
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.dimensions)).toBe(true);
    for (const dimension of report.dimensions) {
      expect(Object.isFrozen(dimension.findings)).toBe(true);
    }
  });

  it("orders dimensions canonically and findings deterministically", () => {
    const report = assess(smallGraph(), mappingWith([], []), profileOf("CRITICAL"));
    expect(report.dimensions.map((dimension) => dimension.dimension)).toEqual([
      "model-integrity",
      "evidence-coverage",
      "measurement-uncertainty",
      "confirmed-validity",
      "epistemic-composition",
      "uncertainty-budget",
    ]);
    const findings = report.dimensions.flatMap((dimension) => dimension.findings);
    const dimensionOrder = [
      "model-integrity",
      "evidence-coverage",
      "measurement-uncertainty",
      "confirmed-validity",
      "epistemic-composition",
      "uncertainty-budget",
    ];
    for (let index = 1; index < findings.length; index += 1) {
      const previous = dimensionOrder.indexOf(findings[index - 1]!.dimension);
      const current = dimensionOrder.indexOf(findings[index]!.dimension);
      expect(previous).toBeLessThanOrEqual(current);
    }
  });

  it("version pins the support join: v1-pinned links do not cover a v2 assessment", () => {
    const lidar = lidarEvidence();
    const mapping = mappingWith([lidar], [{ subject: subjects(1).wallExistence, evidenceId: lidar.evidenceId }]);
    const v1 = assess(smallGraph(), mapping, profileOf("LIGHT"), { version: 1 });
    const v2 = assess(smallGraph(), mapping, profileOf("LIGHT"), { version: 2 });
    const v1Coverage = dimensionOf(v1, "evidence-coverage");
    const v2Coverage = dimensionOf(v2, "evidence-coverage");
    if (v1Coverage.dimension !== "evidence-coverage" || v2Coverage.dimension !== "evidence-coverage") {
      throw new Error("unreachable");
    }
    expect(v1Coverage.coverageRatio).toBeCloseTo(1 / 3, 12);
    expect(v2Coverage.coverageRatio).toBe(0); // subjects are version-scoped
  });
});

describe("empty-graph edge", () => {
  it("space-without-objects models still assess (spaces count)", () => {
    const graph = assembleModelGraph({
      modelId: MODEL,
      projectId: PROJECT,
      spaces: [
        makeSpaceNode({
          spaceId: SPACE,
          kind: "ROOM",
          frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" },
        }),
      ],
      objects: [],
      relationships: [],
    });
    const report = assess(graph, mappingWith([], []), profileOf("LIGHT"));
    expect(dimensionOf(report, "model-integrity").verdict).toBe("PASS");
    void DOOR;
  });
});
