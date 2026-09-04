/**
 * Versioned baselines and regression reporting (AISE-022,
 * AC-132 + the acceptance's "regression reporting").
 *
 * The baseline IS a versioned benchmark result: a committed JSON
 * record of a previously accepted run (content-pinned by its
 * digest — verified on load; a tampered or format-drifted
 * baseline fails closed). Updating the baseline is a deliberate,
 * reviewable git commit (`--update-baseline` writes the record).
 *
 * Regression semantics (deterministic):
 *
 * - a metric **REGRESSES** when its verdict worsens
 *   (PASS→FAIL, anything→MISSING) or its absolute error grows
 *   beyond the drift epsilon (1e-9 SI — absorbs cross-platform
 *   last-bit float differences while still catching real
 *   degradations; documented, not silent);
 * - a metric **IMPROVES** when its verdict improves or its
 *   error shrinks beyond the epsilon;
 * - otherwise **UNCHANGED**;
 * - a case regresses when any of its metrics regresses; the run
 *   regresses when any gating case regresses (analysis-case
 *   movement is reported but never gates — the degradation
 *   cases are expected to move).
 */
import { BenchmarkError } from "./errors.js";
import { BENCHMARK_SUITE_VERSION } from "./cases.js";
import { benchmarkReportDigest, type BenchmarkReport } from "./report.js";
import type { MetricResult } from "./scoring.js";

/** Cross-platform float drift allowance (SI units). */
export const REGRESSION_DRIFT_EPSILON = 1e-9;

/** One regression comparison row. */
export interface RegressionRow {
  readonly caseId: string;
  readonly metricId: string;
  readonly baselineVerdict: string;
  readonly currentVerdict: string;
  readonly baselineError?: number;
  readonly currentError?: number;
  readonly status: "REGRESSED" | "IMPROVED" | "UNCHANGED";
}

/** The regression comparison of one run against its baseline. */
export interface RegressionReport {
  /** Baseline digest (the version this run compared against). */
  readonly baselineDigest: string;
  readonly rows: readonly RegressionRow[];
  /** REGRESSED iff any GATING case carries a regressed metric. */
  readonly overall: "REGRESSED" | "UNCHANGED" | "IMPROVED";
  readonly counts: { readonly regressed: number; readonly improved: number; readonly unchanged: number };
}

/** Parses and integrity-verifies a baseline record (fail closed). */
export function parseBaseline(json: string, source: string): BenchmarkReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new BenchmarkError("BASELINE_INVALID", `baseline ${source} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, {
      details: { field: "source", value: source },
    });
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new BenchmarkError("BASELINE_INVALID", `baseline ${source} must be a JSON object`);
  }
  const record = parsed as Partial<BenchmarkReport>;
  if (typeof record.digest !== "string" || !/^[0-9a-f]{64}$/.test(record.digest)) {
    throw new BenchmarkError("BASELINE_INVALID", `baseline ${source} digest must be 64-hex`, {
      details: { field: "digest", value: String(record.digest) },
    });
  }
  if (record.suiteVersion !== BENCHMARK_SUITE_VERSION) {
    throw new BenchmarkError(
      "BASELINE_INVALID",
      `baseline ${source} suite version ${String(record.suiteVersion)} does not match the harness version ${BENCHMARK_SUITE_VERSION} (update the baseline deliberately)`,
      { details: { field: "suiteVersion", value: String(record.suiteVersion) } },
    );
  }
  const { digest, ...rest } = record as BenchmarkReport;
  void (record as { benchmarkId?: string }).benchmarkId; // identity passthrough — verified by the digest
  const recomputed = benchmarkReportDigest(rest);
  if (digest !== recomputed) {
    throw new BenchmarkError(
      "BASELINE_INVALID",
      `baseline ${source} failed integrity verification: digest does not match its content (tampered or stale record)`,
      { details: { field: "digest", value: digest, expected: recomputed } },
    );
  }
  return record as BenchmarkReport;
}

/** Serializes a report as the canonical baseline record. */
export function serializeBaseline(report: BenchmarkReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Compares the current run against its baseline (regression reporting). */
export function compareWithBaseline(current: BenchmarkReport, baseline: BenchmarkReport): RegressionReport {
  const rows: RegressionRow[] = [];
  for (const currentCase of current.cases) {
    const baselineCase = baseline.cases.find((candidate) => candidate.caseId === currentCase.caseId);
    if (baselineCase === undefined) {
      // A case present now but not in the baseline: not a
      // regression — the baseline predates the case. Reported
      // honestly per metric as UNCHANGED-from-nothing? No: the
      // case is NEW; its metrics carry no baseline. The report
      // lists nothing (new cases are additions, not regressions).
      continue;
    }
    for (const metric of currentCase.metrics) {
      const baselineMetric = baselineCase.metrics.find((candidate) => candidate.metricId === metric.metricId);
      if (baselineMetric === undefined) {
        continue;
      }
      rows.push(compareMetric(currentCase.caseId, metric, baselineMetric));
    }
  }

  const regressed = rows.filter((row) => row.status === "REGRESSED").length;
  const improved = rows.filter((row) => row.status === "IMPROVED").length;
  const unchanged = rows.length - regressed - improved;

  // Overall: only GATING-case regressions gate.
  const gatingRegression = current.cases.some((currentCase) => {
    if (currentCase.caseClass !== "GATING_CRITICAL" && currentCase.caseClass !== "GATING_HIGH_ASSURANCE") {
      return false;
    }
    return rows.some((row) => row.caseId === currentCase.caseId && row.status === "REGRESSED");
  });
  const overall = gatingRegression ? "REGRESSED" : regressed === 0 && improved > 0 ? "IMPROVED" : "UNCHANGED";

  return {
    baselineDigest: baseline.digest,
    rows: Object.freeze(rows),
    overall,
    counts: { regressed, improved, unchanged },
  };
}

/** Compares one metric current-vs-baseline (deterministic). */
function compareMetric(caseId: string, current: MetricResult, baseline: MetricResult): RegressionRow {
  const verdictWorsened =
    rankOf(current.verdict) > rankOf(baseline.verdict);
  const verdictImproved = rankOf(current.verdict) < rankOf(baseline.verdict);
  const errorGrowth =
    current.absError !== undefined && baseline.absError !== undefined
      ? current.absError - baseline.absError
      : undefined;
  let status: RegressionRow["status"];
  if (verdictWorsened || (errorGrowth !== undefined && errorGrowth > REGRESSION_DRIFT_EPSILON)) {
    status = "REGRESSED";
  } else if (verdictImproved || (errorGrowth !== undefined && errorGrowth < -REGRESSION_DRIFT_EPSILON)) {
    status = "IMPROVED";
  } else {
    status = "UNCHANGED";
  }
  return {
    caseId,
    metricId: current.metricId,
    baselineVerdict: baseline.verdict,
    currentVerdict: current.verdict,
    ...(baseline.absError !== undefined ? { baselineError: baseline.absError } : {}),
    ...(current.absError !== undefined ? { currentError: current.absError } : {}),
    status,
  };
}

/** Verdict severity rank (MISSING is the worst hole). */
function rankOf(verdict: string): number {
  switch (verdict) {
    case "PASS":
      return 0;
    case "FAIL":
      return 1;
    case "MISSING":
      return 2;
    case "REPORTED":
      return 0;
    default:
      return 1;
  }
}
