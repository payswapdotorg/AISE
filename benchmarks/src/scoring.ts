/**
 * Automated ground-truth scoring (AISE-022): per-metric
 * PASS/FAIL/MISSING against the fixture ground truth and the
 * fixture's own acceptance tolerances.
 *
 * - **PASS** — |observed − expected| ≤ tolerance;
 * - **FAIL** — the deviation exceeds the tolerance (the
 *   regression the benchmark exists to catch);
 * - **MISSING** — the observable is absent from the
 *   reconstruction output (an honest hole: reported, never
 *   skipped, never fabricated — and never a PASS);
 * - **margin** — the headroom before failure:
 *   (tolerance − |error|) / tolerance (1 = exact; 0 = at the
 *   limit; negative = beyond). The critical-class analysis uses
 *   margins to see regressions COMING, not just after they land.
 */
import type { BenchmarkCase, MetricSpec } from "./cases.js";
import { toleranceFor } from "./cases.js";
import type { Observation } from "./observe.js";

/** The per-metric verdict. */
export type MetricVerdict = "PASS" | "FAIL" | "MISSING";

/** One scored metric. */
export interface MetricResult {
  readonly caseId: string;
  readonly metricId: string;
  readonly observable: string;
  /** Ground truth (SI metres / count). */
  readonly expected: number;
  /** Observed (SI metres / count; absent when MISSING). */
  readonly observed?: number;
  /** |observed − expected| when observed. */
  readonly absError?: number;
  /** The tolerance this metric was scored against (SI). */
  readonly tolerance: number;
  readonly verdict: MetricVerdict;
  /** Headroom before failure (PASS only; 1 = exact). */
  readonly margin?: number;
  /** Where the observed value came from. */
  readonly source?: string;
}

/** One case's scoring result. */
export interface CaseResult {
  readonly caseId: string;
  readonly caseClass: string;
  readonly description: string;
  readonly metrics: readonly MetricResult[];
  /** PASS iff every metric PASSes (gating semantics; analysis cases REPORTED). */
  readonly verdict: "PASS" | "FAIL" | "REPORTED";
  readonly counts: { readonly pass: number; readonly fail: number; readonly missing: number };
}

/** Scores every metric of one case against the observations. */
export function scoreCase(
  benchmarkCase: BenchmarkCase,
  observations: Readonly<Record<string, Observation>>,
): CaseResult {
  const metrics = benchmarkCase.metrics.map((spec) => scoreMetric(benchmarkCase, spec, observations));
  const pass = metrics.filter((metric) => metric.verdict === "PASS").length;
  const fail = metrics.filter((metric) => metric.verdict === "FAIL").length;
  const missing = metrics.filter((metric) => metric.verdict === "MISSING").length;
  const verdict =
    benchmarkCase.caseClass === "ANALYSIS"
      ? (fail + missing > 0 ? "REPORTED" : "PASS")
      : fail + missing > 0
        ? "FAIL"
        : "PASS";
  return {
    caseId: benchmarkCase.caseId,
    caseClass: benchmarkCase.caseClass,
    description: benchmarkCase.description,
    metrics: Object.freeze(metrics),
    verdict,
    counts: { pass, fail, missing },
  };
}

/** Scores one metric spec (deterministic; MISSING never passes). */
export function scoreMetric(
  benchmarkCase: BenchmarkCase,
  spec: MetricSpec,
  observations: Readonly<Record<string, Observation>>,
): MetricResult {
  const observation = observations[spec.observable];
  const tolerance = toleranceFor(benchmarkCase, spec.toleranceKind);
  if (observation === undefined || !observation.present || observation.value === undefined) {
    return {
      caseId: benchmarkCase.caseId,
      metricId: spec.metricId,
      observable: spec.observable,
      expected: spec.expected,
      tolerance,
      verdict: "MISSING",
      ...(observation !== undefined && observation.source !== undefined ? { source: observation.source } : {}),
    };
  }
  const observed = observation.value;
  const absError = Math.abs(observed - spec.expected);
  const verdict: MetricVerdict = absError <= tolerance ? "PASS" : "FAIL";
  const margin = tolerance > 0 ? (tolerance - absError) / tolerance : absError === 0 ? 1 : Number.NEGATIVE_INFINITY;
  return {
    caseId: benchmarkCase.caseId,
    metricId: spec.metricId,
    observable: spec.observable,
    expected: spec.expected,
    observed,
    absError,
    tolerance,
    verdict,
    ...(verdict === "PASS" && Number.isFinite(margin) ? { margin } : {}),
    ...(observation.source !== undefined ? { source: observation.source } : {}),
  };
}
