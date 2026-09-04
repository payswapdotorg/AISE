/**
 * Critical-class analysis (AISE-022 acceptance): headroom and
 * robustness reporting — the benchmark's early-warning and
 * degradation-quantification layer.
 *
 * - **Headroom** — per gating case, the worst metric margin
 *   (how close the reconstruction is to failing its tightest
 *   tolerance). A shrinking margin is a regression arriving; the
 *   analysis makes it visible BEFORE the verdict flips.
 * - **Critical-class metrics** — the metrics running at ≤ 25%
 *   headroom in any gating case: the tight ones (exact-room
 *   elevations run at 1e-6 tolerance; dimension metrics run at
 *   grid-quantization distances). Listed with their margins.
 * - **Degradation** — per-metric absolute-error deltas of the
 *   degradation cases (noisy, outlier) against the CRITICAL
 *   baseline case (exact): the quantified noise/outlier
 *   sensitivity of the reconstruction — expected degradation,
 *   measured, not hidden.
 */
import type { CaseResult, MetricResult } from "./scoring.js";

/** The worst-margin summary of one gating case. */
export interface CaseHeadroom {
  readonly caseId: string;
  /** The margin closest to zero (the tightest metric). */
  readonly worstMargin: number;
  /** The metric id carrying the worst margin. */
  readonly worstMetricId: string;
  /** All PASS metrics, worst-first. */
  readonly tightest: readonly { readonly metricId: string; readonly margin: number }[];
}

/** A critical-class (tight-headroom) metric. */
export interface CriticalMetric {
  readonly caseId: string;
  readonly metricId: string;
  readonly margin: number;
  readonly tolerance: number;
}

/** One degradation comparison row. */
export interface DegradationRow {
  readonly metricId: string;
  readonly baselineCase: string;
  readonly degradedCase: string;
  /** Baseline absolute error (SI). */
  readonly baselineError: number;
  /** Degraded absolute error (SI). */
  readonly degradedError: number;
  /** Degraded − baseline (positive = degraded). */
  readonly delta: number;
  readonly verdict: "DEGRADED" | "IMPROVED" | "UNCHANGED";
}

/** The critical-class analysis of one benchmark run. */
export interface CriticalAnalysis {
  readonly headroom: readonly CaseHeadroom[];
  /** Metrics at ≤ 25% headroom in a gating case (early-warning list). */
  readonly criticalMetrics: readonly CriticalMetric[];
  /** Degradation deltas of analysis/degraded cases vs the CRITICAL baseline. */
  readonly degradation: readonly DegradationRow[];
}

/** The headroom threshold for the critical-class list (≤ 25% left). */
export const CRITICAL_MARGIN_THRESHOLD = 0.25;

/** Computes the critical-class analysis over the scored cases. */
export function analyzeCritical(cases: readonly CaseResult[]): CriticalAnalysis {
  const gating = cases.filter(
    (result) => result.caseClass === "GATING_CRITICAL" || result.caseClass === "GATING_HIGH_ASSURANCE",
  );
  const baseline = cases.find((result) => result.caseClass === "GATING_CRITICAL");

  const headroom: CaseHeadroom[] = gating.map((result) => headroomOf(result));
  const criticalMetrics: CriticalMetric[] = [];
  for (const result of gating) {
    for (const metric of result.metrics) {
      if (metric.margin !== undefined && metric.margin <= CRITICAL_MARGIN_THRESHOLD) {
        criticalMetrics.push({
          caseId: result.caseId,
          metricId: metric.metricId,
          margin: metric.margin,
          tolerance: metric.tolerance,
        });
      }
    }
  }

  const degradation: DegradationRow[] = [];
  if (baseline !== undefined) {
    for (const degraded of cases) {
      if (degraded.caseId === baseline.caseId) {
        continue;
      }
      for (const metric of degraded.metrics) {
        if (metric.absError === undefined) {
          continue;
        }
        const baselineMetric = baseline.metrics.find((candidate) => candidate.metricId === metric.metricId);
        if (baselineMetric?.absError === undefined) {
          continue;
        }
        const delta = metric.absError - baselineMetric.absError;
        degradation.push({
          metricId: metric.metricId,
          baselineCase: baseline.caseId,
          degradedCase: degraded.caseId,
          baselineError: baselineMetric.absError,
          degradedError: metric.absError,
          delta,
          verdict: delta > 1e-12 ? "DEGRADED" : delta < -1e-12 ? "IMPROVED" : "UNCHANGED",
        });
      }
    }
  }

  return {
    headroom: Object.freeze(headroom),
    criticalMetrics: Object.freeze(criticalMetrics),
    degradation: Object.freeze(degradation),
  };
}

/** The worst-margin summary of one case. */
function headroomOf(result: CaseResult): CaseHeadroom {
  const withMargins = result.metrics
    .filter((metric): metric is MetricResult & { margin: number } => metric.margin !== undefined)
    .map((metric) => ({ metricId: metric.metricId, margin: metric.margin }))
    .sort((a, b) => a.margin - b.margin);
  const worst = withMargins[0];
  return {
    caseId: result.caseId,
    worstMargin: worst?.margin ?? 1,
    worstMetricId: worst?.metricId ?? "(all exact)",
    tightest: Object.freeze(withMargins),
  };
}
