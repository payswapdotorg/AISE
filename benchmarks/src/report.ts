/**
 * The deterministic, versioned benchmark report (AISE-022,
 * AC-132).
 *
 * A report is:
 *
 * - **machine-readable**: per-case metric results with
 *   ground-truth, observed, error, tolerance, verdict, margin
 *   and source; per-case verdicts; the critical-class analysis;
 * - **reproducible**: identical inputs (the deterministic
 *   fixtures + the deterministic reconstruction chain) produce a
 *   bit-identical report — canonical order (the case registry
 *   order, then the metric spec order), service-computed counts,
 *   a content digest over everything, no timestamps, no
 *   randomness, no ambient state;
 * - **versioned**: the report carries `BENCHMARK_SUITE_VERSION`
 *   and its content digest; the committed baseline record
 *   (`baselines/`) IS a versioned result — updating it is a
 *   deliberate, reviewable git commit;
 * - **integrity-pinned**: the digest is computed by the service
 *   and the baseline is verified against it on load (a tampered
 *   or stale-format baseline fails closed).
 */
import { canonicalContentHash, sha256Hex, canonicalJsonString } from "@aise/engineering-model";
import { BENCHMARK_SUITE_VERSION } from "./cases.js";
import type { CaseResult } from "./scoring.js";
import type { CriticalAnalysis } from "./critical.js";

/** The overall verdict of one benchmark run. */
export type BenchmarkVerdict = "PASS" | "FAIL";

/** Service-computed report counts (canonical key order). */
export interface BenchmarkCounts {
  readonly cases: number;
  readonly gatingCases: number;
  readonly analysisCases: number;
  readonly metricsTotal: number;
  readonly metricsPassed: number;
  readonly metricsFailed: number;
  readonly metricsMissing: number;
}

/** The deterministic result of one benchmark run. */
export interface BenchmarkReport {
  readonly benchmarkId: string;
  readonly suiteVersion: string;
  readonly verdict: BenchmarkVerdict;
  /** Per-case scoring, canonical case order. */
  readonly cases: readonly CaseResult[];
  readonly critical: CriticalAnalysis;
  readonly counts: BenchmarkCounts;
  /** Canonical content digest (the record's version identity). */
  readonly digest: string;
}

/** Input to report assembly. */
export interface BenchmarkReportInput {
  readonly cases: readonly CaseResult[];
  readonly critical: CriticalAnalysis;
}

/** Assembles the deterministic report from the scored cases. */
export function buildBenchmarkReport(input: BenchmarkReportInput): BenchmarkReport {
  const cases = Object.freeze([...input.cases]);
  const gating = cases.filter(
    (result) => result.caseClass === "GATING_CRITICAL" || result.caseClass === "GATING_HIGH_ASSURANCE",
  );
  const analysis = cases.filter((result) => result.caseClass === "ANALYSIS");
  const verdict: BenchmarkVerdict = gating.every((result) => result.verdict === "PASS") ? "PASS" : "FAIL";

  let metricsTotal = 0;
  let metricsPassed = 0;
  let metricsFailed = 0;
  let metricsMissing = 0;
  for (const result of cases) {
    metricsTotal += result.metrics.length;
    metricsPassed += result.counts.pass;
    metricsFailed += result.counts.fail;
    metricsMissing += result.counts.missing;
  }

  const counts: BenchmarkCounts = {
    cases: cases.length,
    gatingCases: gating.length,
    analysisCases: analysis.length,
    metricsTotal,
    metricsPassed,
    metricsFailed,
    metricsMissing,
  };

  const partial: Omit<BenchmarkReport, "digest" | "benchmarkId"> = {
    suiteVersion: BENCHMARK_SUITE_VERSION,
    verdict,
    cases,
    critical: input.critical,
    counts,
  };
  const digest = benchmarkReportDigest(partial);
  return Object.freeze({
    ...partial,
    digest,
    benchmarkId: deriveBenchmarkId(digest),
  });
}

/** Computes the canonical report digest. */
export function benchmarkReportDigest(report: Omit<BenchmarkReport, "digest" | "benchmarkId">): string {
  return canonicalContentHash({
    suiteVersion: report.suiteVersion,
    verdict: report.verdict,
    cases: report.cases.map((result) => [
      result.caseId,
      result.caseClass,
      result.verdict,
      result.metrics.map((metric) => [
        metric.metricId,
        metric.observable,
        metric.expected,
        metric.observed ?? null,
        metric.absError ?? null,
        metric.tolerance,
        metric.verdict,
        metric.margin ?? null,
        metric.source ?? null,
      ]),
      [result.counts.pass, result.counts.fail, result.counts.missing],
    ]),
    critical: {
      headroom: report.critical.headroom.map((row) => [row.caseId, row.worstMargin, row.worstMetricId]),
      criticalMetrics: report.critical.criticalMetrics.map((row) => [
        row.caseId,
        row.metricId,
        row.margin,
        row.tolerance,
      ]),
      degradation: report.critical.degradation.map((row) => [
        row.metricId,
        row.baselineCase,
        row.degradedCase,
        row.baselineError,
        row.degradedError,
        row.delta,
        row.verdict,
      ]),
    },
    counts: report.counts,
  });
}

/** Derives the deterministic benchmark identity from the digest. */
export function deriveBenchmarkId(digest: string): string {
  return sha256Hex(canonicalJsonString(["benchmark-id/v1", digest]));
}
