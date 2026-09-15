/**
 * AISE-035 — dogfood report tests: per-scenario per-capability outcomes with
 * record ids, honest completeness rows, not-observed propagation, the
 * reproducibility digest (timestamp excluded), and the overall gate.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { LAB_DISCRIMINATION_SPECS, assertReproducible, runDogfoodReport } from "./report";
import { LAB_CLOCK } from "./testkit";

describe("lab dogfood report: assembly and honesty", () => {
  test("the full report carries three baseline rows and three discrimination rows", async () => {
    const report = await runDogfoodReport();
    expect(report.baselineRuns.map((row) => row.scenarioId)).toEqual([
      "lab-room-104-defect",
      "lab-floor-gf-boq",
      "lab-room-204-repair",
    ]);
    expect(report.discriminationRuns).toHaveLength(LAB_DISCRIMINATION_SPECS.length);
    expect(report.discrimination).toHaveLength(3);
  });

  test("every hop of every baseline row carries its real record ids", async () => {
    const report = await runDogfoodReport();
    const rowA = report.baselineRuns[0]!;
    const missionHop = rowA.hops.find((h) => h.hopId === "mission")!;
    expect(missionHop.outcome).toBe("ok");
    expect(missionHop.recordIds[0]).toBe("lab-mission-1");
    const captureHop = rowA.hops.find((h) => h.hopId === "capture")!;
    expect(captureHop.recordIds).toContain("session-lab-room-104-defect-baseline");
    const rowC = report.baselineRuns[2]!;
    expect(rowC.recordIds.realityVersionIds).toEqual(["v002", "v003"]);
    expect(rowC.recordIds.caseId).toBe("case-lab-room-204-repair");
    expect(rowC.recordIds.interventionScenarioId).toBe("scenario-lab-room-204-repair");
    expect(rowC.recordIds.executionRecordId).toBe("execution-lab-room-204-repair-1");
    expect(rowC.recordIds.outcomeId).not.toBeNull();
    // The discrimination row for the corrupted capture honestly stopped.
    const stoppedRow = report.discriminationRuns.find(
      (row) => row.scenarioId === "lab-room-104-defect" && row.kind === "discrimination" && row.stoppedAt !== null,
    );
    expect(stoppedRow).toBeDefined();
    expect(stoppedRow!.stopReason!.code).toBe("INPUT_INCOMPATIBLE");
  });

  test("capture completeness rows quote the assurance verdicts only", async () => {
    const report = await runDogfoodReport();
    const rowA = report.baselineRuns[0]!;
    expect(rowA.captureCompleteness.status).toBe("COMPLETE");
    expect(rowA.captureCompleteness.readiness).toBe("READY");
    expect(rowA.captureCompleteness.basis).toContain("assurance engine");
    // The dropped-evidence discrimination row: INCOMPLETE with typed gaps.
    const droppedRow = report.discriminationRuns.find(
      (row) => row.stoppedAt === null && row.captureCompleteness.status === "INCOMPLETE",
    );
    expect(droppedRow).toBeDefined();
    expect(droppedRow!.captureCompleteness.readiness).toBe("NOT_READY");
    expect(
      droppedRow!.captureCompleteness.gaps.some(
        (gap) => gap.dimensionId === "visual-condition-evidence" && gap.critical,
      ),
    ).toBe(true);
    // The stopped row: UNEVALUATED with the typed pipeline-stop gap.
    const stoppedRow = report.discriminationRuns.find((row) => row.stoppedAt !== null)!;
    expect(stoppedRow.captureCompleteness.status).toBe("INCOMPLETE");
    expect(stoppedRow.captureCompleteness.readiness).toBe("UNEVALUATED");
    expect(stoppedRow.captureCompleteness.gaps[0]!.deficiencyCode).toBe("INPUT_INCOMPATIBLE");
  });

  test("not-observed rows propagate OCCLUDED / NOT_OBSERVED / UNKNOWN verbatim", async () => {
    const report = await runDogfoodReport();
    const statuses = report.notObserved.map((entry) => `${entry.status}:${entry.subjectId}`);
    expect(statuses).toContain("OCCLUDED:surface:room-104:wall-east");
    expect(statuses).toContain("NOT_OBSERVED:node:space:room-104:room.width");
    expect(statuses).toContain("UNKNOWN:surface:room-104:wall-north:defect.depth");
    expect(statuses).toContain("UNKNOWN:surface:room-204:wall-south:defect.depth");
    expect(report.notObserved).toHaveLength(4);
  });

  test("the overall verdict: PASS_WITH_NOTES with all discrimination cases detected", async () => {
    const report = await runDogfoodReport();
    expect(report.overall).toBe("PASS_WITH_NOTES");
    expect(report.criticalViolations).toHaveLength(0);
    expect(report.capabilityFailures).toHaveLength(0);
    // The single non-critical note is the documented hierarchy-coverage one.
    expect(report.nonCriticalViolations).toHaveLength(1);
    expect(report.nonCriticalViolations[0]!.metric).toBe("hierarchy_unlinked_gap_count");
    // The R17 aggregate-hiding proof is recorded in the report.
    expect(report.aggregateHiding).not.toBeNull();
    expect(report.aggregateHiding!.hiddenByAggregates).toBe(true);
    expect(report.aggregateHiding!.aggregateDimensionError!).toBeLessThan(0.02);
    expect(report.aggregateHiding!.aggregateQuantityError!).toBeLessThan(0.02);
    expect(report.aggregateHiding!.criticalViolationCount).toBeGreaterThanOrEqual(3);
  });

  test("per-capability outcomes are listed for every baseline row", async () => {
    const report = await runDogfoodReport();
    for (const row of report.baselineRuns) {
      expect(row.capabilities.length).toBeGreaterThanOrEqual(6);
      for (const capability of row.capabilities) {
        expect(capability.failureCode).toBeNull();
        expect(capability.criticalViolationCount).toBe(0);
      }
    }
  });

  test("the report is loud about its simulated fixture provenance", async () => {
    const report = await runDogfoodReport();
    expect(report.fixtureProvenance).toBe("lab-simulated-capture-v1");
    expect(report.schemaVersion).toBe("lab-dogfood-report/1");
    expect(report.gateThresholdVersion).toBe("lab-gates-1");
  });
});

describe("lab dogfood report: reproducibility", () => {
  test("two full dogfood runs produce byte-identical reports (timestamp excluded)", async () => {
    const first = await runDogfoodReport();
    const second = await runDogfoodReport();
    const check = assertReproducible(first, second);
    expect(check.reproducible).toBe(true);
    expect(check.digestA).toBe(check.digestB);
    expect(first.reproducibilityDigest).toBe(second.reproducibilityDigest);
  });

  test("mutating the timestamp never changes the digest", async () => {
    const report = await runDogfoodReport({ now: () => LAB_CLOCK.report });
    const later = { ...report, generatedAt: "2027-12-31T23:59:59.999Z" };
    const check = assertReproducible(report, later as typeof report);
    expect(check.reproducible).toBe(true);
  });

  test("the report is canonical-JSON stable (no key-order drift)", async () => {
    const report = await runDogfoodReport();
    const text = canonicalJsonStringify(report);
    // Canonical JSON sorts keys — the digest preimage is deterministic.
    expect(text.length).toBeGreaterThan(1000);
    const again = await runDogfoodReport();
    // Timestamps are pinned by the injected default clock, so the FULL
    // canonical text (timestamp included) is stable for pinned clocks.
    expect(canonicalJsonStringify(again)).toBe(text);
  });
});
