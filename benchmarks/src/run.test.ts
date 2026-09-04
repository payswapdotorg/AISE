/**
 * The AISE-022 core suite: the repeatable benchmark run, the
 * ground-truth comparison, the class discipline and the
 * critical-class analysis.
 *
 * Proves the Work Order's acceptance criteria:
 * - **repeatable benchmark run** — the full chain (fixtures →
 *   AISE-010 extraction → AISE-011 ingestion → scoring) replays
 *   bit-identically (digest equality);
 * - **ground-truth comparison** — per-metric PASS/FAIL/MISSING
 *   against the fixtures' ground truth and acceptance
 *   tolerances; the degradation case is honestly REPORTED;
 * - **regression reporting** — covered in baseline.test.ts;
 * - **critical-class analysis** — headroom, the critical-metric
 *   list and the degradation deltas.
 */
import { describe, expect, it } from "vitest";
import { roomGroundTruth } from "@aise/backend-semantics/fixtures/golden";
import {
  BENCHMARK_CASES,
  BENCHMARK_SUITE_VERSION,
  analysisCases,
  caseById,
  gatingCases,
  toleranceFor,
} from "./cases.js";
import { runBenchmark } from "./run.js";
import { REGRESSION_DRIFT_EPSILON } from "./baseline.js";

const report = runBenchmark();

describe("the case registry (AC-130: golden captures with ground truth)", () => {
  it("carries the three v1 golden rooms with their fixture acceptance rules", () => {
    expect(BENCHMARK_CASES.map((benchmarkCase) => benchmarkCase.caseId)).toEqual([
      "exact-room",
      "noisy-room",
      "outlier-room",
    ]);
    for (const benchmarkCase of BENCHMARK_CASES) {
      expect(benchmarkCase.points.length).toBeGreaterThan(0);
      expect(benchmarkCase.metrics.length).toBe(15);
      // Tolerances are REUSED from the fixtures (single authority).
      expect(benchmarkCase.acceptance.dimensionTolerance).toBeGreaterThan(0);
    }
  });

  it("class discipline: two gating cases + one analysis case; exact is CRITICAL", () => {
    expect(gatingCases().map((c) => c.caseId)).toEqual(["exact-room", "noisy-room"]);
    expect(analysisCases().map((c) => c.caseId)).toEqual(["outlier-room"]);
    expect(caseById("exact-room").caseClass).toBe("GATING_CRITICAL");
    expect(caseById("noisy-room").caseClass).toBe("GATING_HIGH_ASSURANCE");
    expect(caseById("outlier-room").caseClass).toBe("ANALYSIS");
  });

  it("tolerances resolve through the fixture acceptance (exact-count = 0)", () => {
    const exact = caseById("exact-room");
    expect(toleranceFor(exact, "exact-count")).toBe(0);
    expect(toleranceFor(exact, "dimension")).toBe(exact.acceptance.dimensionTolerance);
    expect(toleranceFor(exact, "elevation")).toBe(exact.acceptance.elevationTolerance);
  });

  it("caseById fails closed on unknown ids", () => {
    expect(() => caseById("no-such-case")).toThrowError(/unknown benchmark case/);
  });
});

describe("the repeatable benchmark run (ground-truth comparison)", () => {
  it("both gating cases PASS every metric", () => {
    const exact = report.cases.find((c) => c.caseId === "exact-room")!;
    expect(exact.verdict).toBe("PASS");
    expect(exact.counts).toEqual({ pass: 15, fail: 0, missing: 0 });
    const noisy = report.cases.find((c) => c.caseId === "noisy-room")!;
    expect(noisy.verdict).toBe("PASS");
    expect(noisy.counts).toEqual({ pass: 15, fail: 0, missing: 0 });
  });

  it("the overall verdict is PASS (the analysis case never gates)", () => {
    expect(report.verdict).toBe("PASS");
    expect(report.counts).toMatchObject({
      cases: 3,
      gatingCases: 2,
      analysisCases: 1,
      metricsTotal: 45,
      metricsPassed: 43,
      metricsFailed: 2,
      metricsMissing: 0,
    });
  });

  it("the outlier case is honestly REPORTED, not skipped and not gating", () => {
    const outlier = report.cases.find((c) => c.caseId === "outlier-room")!;
    expect(outlier.verdict).toBe("REPORTED");
    // The known degradation: wall fragmentation (6 vs 4) and the
    // window-sill drift under 5% gross outliers.
    const wallCount = outlier.metrics.find((m) => m.metricId === "count-wall")!;
    expect(wallCount.verdict).toBe("FAIL");
    expect(wallCount.observed).toBe(roomGroundTruth.objectCounts.walls + 2);
    const sill = outlier.metrics.find((m) => m.metricId === "window-sill")!;
    expect(sill.verdict).toBe("FAIL");
    expect(outlier.counts.fail).toBe(2);
  });

  it("grid quantization is visible in the exact-room margins (honest tolerance distance)", () => {
    const exact = report.cases.find((c) => c.caseId === "exact-room")!;
    const doorWidth = exact.metrics.find((m) => m.metricId === "door-width")!;
    expect(doorWidth.absError).toBeGreaterThan(0); // 0.05 grid cell — quantized, not exact
    expect(doorWidth.verdict).toBe("PASS");
    const floorWidth = exact.metrics.find((m) => m.metricId === "floor-width")!;
    expect(floorWidth.absError).toBeLessThan(REGRESSION_DRIFT_EPSILON); // floor is exact
  });

  it("the run is REPEATABLE: replay produces the bit-identical report", () => {
    const replay = runBenchmark();
    expect(replay).toEqual(report);
    expect(replay.digest).toBe(report.digest);
    expect(replay.benchmarkId).toBe(report.benchmarkId);
  });

  it("the report carries no timestamps (clock-free digest path)", () => {
    expect(JSON.stringify(report)).not.toMatch(/assessedAt|timestamp|Date/);
    expect(report.suiteVersion).toBe(BENCHMARK_SUITE_VERSION);
  });
});

describe("critical-class analysis", () => {
  it("headroom exists for both gating cases with the worst metric identified", () => {
    expect(report.critical.headroom.map((row) => row.caseId)).toEqual(["exact-room", "noisy-room"]);
    const exact = report.critical.headroom.find((row) => row.caseId === "exact-room")!;
    expect(exact.worstMargin).toBeGreaterThan(0);
    expect(exact.worstMargin).toBeLessThanOrEqual(1);
    expect(exact.worstMetricId).not.toHaveLength(0);
  });

  it("the critical-metric list contains the tight grid-quantized exact-room metrics", () => {
    const ids = report.critical.criticalMetrics.map((metric) => `${metric.caseId}/${metric.metricId}`);
    expect(ids).toContain("exact-room/wall-height");
    expect(ids).toContain("exact-room/door-height");
    expect(ids).toContain("exact-room/window-width");
    expect(ids).toContain("exact-room/window-height");
    for (const metric of report.critical.criticalMetrics) {
      expect(metric.margin).toBeLessThanOrEqual(0.25);
    }
  });

  it("degradation rows quantify the noisy and outlier cases against the exact baseline", () => {
    const noisy = report.critical.degradation.filter((row) => row.degradedCase === "noisy-room");
    const outlier = report.critical.degradation.filter((row) => row.degradedCase === "outlier-room");
    expect(noisy.length).toBe(15);
    expect(outlier.length).toBe(15);
    // Noise degrades dimensions (positive deltas) — the quantified
    // sensitivity the analysis exists to report.
    const floorWidth = noisy.find((row) => row.metricId === "floor-width")!;
    expect(floorWidth.delta).toBeGreaterThan(0);
    // The sill drift under outliers is captured as degradation.
    const sill = outlier.find((row) => row.metricId === "window-sill")!;
    expect(sill.degradedError).toBeGreaterThan(0);
    void roomGroundTruth;
  });
});
import { buildBenchmarkReport, benchmarkReportDigest } from "./report.js";
import { analyzeCritical } from "./critical.js";
import type { CaseResult } from "./scoring.js";

/** A deep JSON clone helper. */
const clone = structuredClone;

describe("the report verdict discipline (gating cases gate)", () => {
  it("a FAILING gating case makes the overall verdict FAIL (never a lucky PASS)", () => {
    const failing = clone(report.cases.find((c) => c.caseId === "exact-room")!) as CaseResult;
    // Degrade one metric past its tolerance (grid quantization worsens).
    const width = failing.metrics.find((m) => m.metricId === "floor-width")!;
    (width as { verdict: string }).verdict = "FAIL";
    (failing as { verdict: string }).verdict = "FAIL";
    (failing.counts as { pass: number; fail: number }).pass = 14;
    (failing.counts as { pass: number; fail: number }).fail = 1;
    const rebuilt = buildBenchmarkReport({
      cases: [failing, ...report.cases.filter((c) => c.caseId !== "exact-room")],
      critical: report.critical,
    });
    expect(rebuilt.verdict).toBe("FAIL");
    expect(rebuilt.counts.metricsFailed).toBe(3); // outlier's 2 + the injected 1
  });

  it("a MISSING metric in a gating case makes the overall verdict FAIL", () => {
    const holed = clone(report.cases.find((c) => c.caseId === "noisy-room")!) as CaseResult;
    const height = holed.metrics.find((m) => m.metricId === "room-height")!;
    (height as { verdict: string }).verdict = "MISSING";
    delete (height as { observed?: number }).observed;
    (holed as { verdict: string }).verdict = "FAIL";
    (holed.counts as { pass: number; missing: number }).pass = 14;
    (holed.counts as { pass: number; missing: number }).missing = 1;
    const rebuilt = buildBenchmarkReport({
      cases: [...report.cases.filter((c) => c.caseId !== "noisy-room"), holed],
      critical: report.critical,
    });
    expect(rebuilt.verdict).toBe("FAIL");
    expect(rebuilt.counts.metricsMissing).toBe(1);
  });

  it("a failing ANALYSIS case alone never fails the overall verdict", () => {
    const degraded = clone(report.cases.find((c) => c.caseId === "outlier-room")!) as CaseResult;
    (degraded as { verdict: string }).verdict = "REPORTED";
    const rebuilt = buildBenchmarkReport({
      cases: [
        report.cases.find((c) => c.caseId === "exact-room")!,
        report.cases.find((c) => c.caseId === "noisy-room")!,
        degraded,
      ],
      critical: report.critical,
    });
    expect(rebuilt.verdict).toBe("PASS");
  });

  it("the digest changes when any scored content changes (report tamper evidence)", () => {
    const failing = clone(report.cases.find((c) => c.caseId === "exact-room")!) as CaseResult;
    const width = failing.metrics.find((m) => m.metricId === "floor-width")!;
    (width as { verdict: string }).verdict = "FAIL";
    const rebuilt = buildBenchmarkReport({
      cases: [failing, ...report.cases.filter((c) => c.caseId !== "exact-room")],
      critical: report.critical,
    });
    expect(rebuilt.digest).not.toBe(report.digest);
    expect(benchmarkReportDigest(rebuilt)).toBe(rebuilt.digest);
    void analyzeCritical;
  });
});
