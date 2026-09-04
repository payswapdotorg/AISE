/**
 * The AISE-022 baseline suite: versioned records, integrity
 * verification and regression reporting (AC-132 + the
 * acceptance's "regression reporting").
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isBenchmarkError, type BenchmarkError } from "./errors.js";
import { runBenchmark } from "./run.js";
import {
  REGRESSION_DRIFT_EPSILON,
  compareWithBaseline,
  parseBaseline,
  serializeBaseline,
} from "./baseline.js";
import type { BenchmarkReport } from "./report.js";

const BASELINE_PATH = fileURLToPath(new URL("../baselines/golden-captures.v1.json", import.meta.url));

/** Captures the BenchmarkError a thunk throws (or undefined). */
function capture(thunk: () => unknown): BenchmarkError | undefined {
  try {
    thunk();
    return undefined;
  } catch (error) {
    expect(isBenchmarkError(error)).toBe(true);
    return error as BenchmarkError;
  }
}

/** A deep JSON clone helper (structuredClone is available in Node 24). */
const clone = structuredClone;

describe("the committed baseline record (AC-132: versioned results)", () => {
  it("parses, verifies and round-trips", () => {
    const json = readFileSync(BASELINE_PATH, "utf8");
    const baseline = parseBaseline(json, "baselines/golden-captures.v1.json");
    expect(baseline.verdict).toBe("PASS");
    expect(baseline.suiteVersion).toMatch(/^golden-captures\//);
    expect(baseline.digest).toMatch(/^[0-9a-f]{64}$/);
    // Round-trip: serialize → parse → identical record.
    const round = parseBaseline(serializeBaseline(baseline), "round-trip");
    expect(round.digest).toBe(baseline.digest);
    expect(round.benchmarkId).toBe(baseline.benchmarkId);
  });

  it("the current run matches the committed baseline exactly (no regression)", () => {
    const baseline = parseBaseline(readFileSync(BASELINE_PATH, "utf8"), "baseline");
    const current = runBenchmark();
    expect(current.digest).toBe(baseline.digest);
    const regression = compareWithBaseline(current, baseline);
    expect(regression.overall).toBe("UNCHANGED");
    expect(regression.counts.regressed).toBe(0);
    expect(regression.counts.improved).toBe(0);
    expect(regression.rows.length).toBe(45);
  });

  it("a tampered baseline fails closed (digest re-derivation)", () => {
    const baseline = parseBaseline(readFileSync(BASELINE_PATH, "utf8"), "baseline");
    const tampered = clone(baseline);
    (tampered.cases[0] as { verdict: string }).verdict = "FAIL";
    const error = capture(() => parseBaseline(JSON.stringify(tampered), "tampered"));
    expect(error?.code).toBe("BASELINE_INVALID");
    expect(error?.message).toContain("integrity");
  });

  it("a format-drifted baseline (wrong suite version) fails closed", () => {
    const baseline = parseBaseline(readFileSync(BASELINE_PATH, "utf8"), "baseline");
    const drifted = clone(baseline);
    (drifted as { suiteVersion: string }).suiteVersion = "golden-captures/v0.0.0";
    const error = capture(() => parseBaseline(JSON.stringify(drifted), "drifted"));
    expect(error?.code).toBe("BASELINE_INVALID");
    expect(error?.message).toContain("suite version");
  });

  it("malformed baselines fail closed (not JSON / missing digest)", () => {
    expect(capture(() => parseBaseline("not json", "x"))?.code).toBe("BASELINE_INVALID");
    expect(capture(() => parseBaseline("{}", "x"))?.code).toBe("BASELINE_INVALID");
    expect(capture(() => parseBaseline("[]", "x"))?.code).toBe("BASELINE_INVALID");
  });
});

describe("regression reporting (deterministic semantics)", () => {
  const baseline = parseBaseline(readFileSync(BASELINE_PATH, "utf8"), "baseline");

  function mutateCurrent(fn: (report: BenchmarkReport) => void): BenchmarkReport {
    const mutated = clone(runBenchmark());
    fn(mutated);
    return mutated;
  }

  it("a verdict worsening is REGRESSED (gating case → overall REGRESSED)", () => {
    const current = mutateCurrent((report) => {
      const exact = report.cases.find((c) => c.caseId === "exact-room")!;
      const floorWidth = exact.metrics.find((m) => m.metricId === "floor-width")!;
      (floorWidth as { verdict: string }).verdict = "FAIL";
    });
    const regression = compareWithBaseline(current, baseline);
    expect(regression.overall).toBe("REGRESSED");
    const row = regression.rows.find((r) => r.metricId === "floor-width" && r.caseId === "exact-room")!;
    expect(row.status).toBe("REGRESSED");
    expect(row.baselineVerdict).toBe("PASS");
    expect(row.currentVerdict).toBe("FAIL");
  });

  it("an error growth beyond the drift epsilon is REGRESSED even at PASS verdict", () => {
    const current = mutateCurrent((report) => {
      const exact = report.cases.find((c) => c.caseId === "exact-room")!;
      const floorWidth = exact.metrics.find((m) => m.metricId === "floor-width")!;
      (floorWidth as { absError?: number }).absError = (floorWidth.absError ?? 0) + 10 * REGRESSION_DRIFT_EPSILON;
    });
    const regression = compareWithBaseline(current, baseline);
    expect(regression.overall).toBe("REGRESSED");
    expect(regression.rows.find((r) => r.metricId === "floor-width" && r.caseId === "exact-room")!.status).toBe(
      "REGRESSED",
    );
  });

  it("sub-epsilon error drift is UNCHANGED (cross-platform float tolerance)", () => {
    const current = mutateCurrent((report) => {
      const exact = report.cases.find((c) => c.caseId === "exact-room")!;
      const floorWidth = exact.metrics.find((m) => m.metricId === "floor-width")!;
      (floorWidth as { absError?: number }).absError = (floorWidth.absError ?? 0) + REGRESSION_DRIFT_EPSILON / 10;
    });
    const regression = compareWithBaseline(current, baseline);
    expect(regression.rows.find((r) => r.metricId === "floor-width")!.status).toBe("UNCHANGED");
  });

  it("an error IMPROVEMENT is reported but the overall stays UNCHANGED unless nothing regressed", () => {
    const current = mutateCurrent((report) => {
      const noisy = report.cases.find((c) => c.caseId === "noisy-room")!;
      const floorWidth = noisy.metrics.find((m) => m.metricId === "floor-width")!;
      (floorWidth as { absError?: number }).absError = (floorWidth.absError ?? 0) / 2;
    });
    const regression = compareWithBaseline(current, baseline);
    expect(regression.counts.improved).toBe(1);
    expect(regression.overall).toBe("IMPROVED");
  });

  it("analysis-case regressions are reported but never gate the overall", () => {
    const current = mutateCurrent((report) => {
      const outlier = report.cases.find((c) => c.caseId === "outlier-room")!;
      const wallCount = outlier.metrics.find((m) => m.metricId === "count-wall")!;
      // Worsen the hole: the walls fragment further.
      (wallCount as { verdict: string }).verdict = "MISSING";
      (wallCount as { observed?: number }).observed = 99;
      (wallCount as { absError?: number }).absError = 95;
    });
    const regression = compareWithBaseline(current, baseline);
    const row = regression.rows.find((r) => r.caseId === "outlier-room" && r.metricId === "count-wall");
    expect(row?.status).toBe("REGRESSED"); // reported honestly...
    expect(regression.overall).toBe("UNCHANGED"); // ...but never gating
  });

  it("a MISSING metric is the worst hole (regression from any verdict)", () => {
    const current = mutateCurrent((report) => {
      const noisy = report.cases.find((c) => c.caseId === "noisy-room")!;
      const doorWidth = noisy.metrics.find((m) => m.metricId === "door-width")!;
      (doorWidth as { verdict: string }).verdict = "MISSING";
      delete (doorWidth as { observed?: number }).observed;
      delete (doorWidth as { absError?: number }).absError;
    });
    const regression = compareWithBaseline(current, baseline);
    expect(regression.overall).toBe("REGRESSED");
    expect(regression.rows.find((r) => r.caseId === "noisy-room" && r.metricId === "door-width")!.status).toBe(
      "REGRESSED",
    );
  });

  it("new cases/metrics (absent from the baseline) are not regressions", () => {
    const current = mutateCurrent((report) => {
      // Extra case in current, absent in baseline.
      (report.cases as unknown[]).push(clone(report.cases[0]!));
    });
    const regression = compareWithBaseline(current, baseline);
    expect(regression.overall).not.toBe("REGRESSED");
  });
});
