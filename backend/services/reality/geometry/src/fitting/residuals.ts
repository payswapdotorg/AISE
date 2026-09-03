/**
 * Residual/error statistics for fits and measurements (AISE-009).
 *
 * Every fit reports the full empirical error profile of its
 * residuals — not just an RMS — because different engineering
 * tasks read different statistics (max error for clearance checks,
 * median for robust scale, RMS for noise models). Residuals are
 * accumulated and reported over the CANONICAL (sorted) residual
 * sequence so every statistic is bit-stable under input
 * permutation (summation order is fixed).
 */
import { GeometryError } from "../errors.js";

/** Empirical statistics of a residual sample. */
export interface ResidualStats {
  /** Number of residuals in the sample. */
  readonly count: number;
  /** Minimum residual (signed). */
  readonly min: number;
  /** Maximum residual (signed). */
  readonly max: number;
  /** Mean residual (signed). */
  readonly mean: number;
  /** Median residual (signed; even counts average the two middle values). */
  readonly median: number;
  /** Root-mean-square residual (always ≥ 0). */
  readonly rms: number;
  /** Sample standard deviation (signed residuals around their mean; ≥ 0). */
  readonly standardDeviation: number;
  /** Largest absolute residual (≥ 0). */
  readonly maxAbs: number;
}

/** Minimum residual count for a sample standard deviation. */
export const MIN_STD_RESIDUALS = 2;

/**
 * Computes residual statistics over a non-empty finite residual
 * sample. The caller supplies residuals; this function sorts a copy
 * (canonical order for the median and for bit-stable summation) —
 * the input array is not mutated.
 */
export function computeResidualStats(residuals: readonly number[]): ResidualStats {
  if (!Array.isArray(residuals) || residuals.length === 0) {
    throw new GeometryError("VALIDATION_FAILED", "residual sample must be non-empty", {
      details: { count: residuals.length },
    });
  }
  for (const [index, value] of residuals.entries()) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new GeometryError("NON_FINITE_INPUT", `residuals[${index}] must be finite`, {
        details: { index, value: String(value) },
      });
    }
  }

  // Canonical order: ascending — fixed summation order + median.
  const sorted = [...residuals].sort((a, b) => a - b);
  const count = sorted.length;

  let sum = 0;
  let sumAbsSq = 0; // Σ r² (for RMS)
  for (const value of sorted) {
    sum += value;
    sumAbsSq += value * value;
  }
  const mean = sum / count;
  const rms = Math.sqrt(sumAbsSq / count);

  const median =
    count % 2 === 1
      ? (sorted[(count - 1) / 2] as number)
      : ((sorted[count / 2 - 1] as number) + (sorted[count / 2] as number)) / 2;

  let variance = 0;
  if (count >= MIN_STD_RESIDUALS) {
    for (const value of sorted) {
      const deviation = value - mean;
      variance += deviation * deviation;
    }
    variance /= count - 1;
  }
  const standardDeviation = Math.sqrt(variance);

  return {
    count,
    min: sorted[0] as number,
    max: sorted[count - 1] as number,
    mean,
    median,
    rms,
    standardDeviation,
    maxAbs: Math.max(
      Math.abs(sorted[0] as number),
      Math.abs(sorted[count - 1] as number),
    ),
  };
}

/**
 * The LMedS (least-median-of-squares) scale estimate:
 * σ̂ = 1.4826 · (1 + 5/(n − p)) · median(|residuals|), the standard
 * finite-sample-corrected robust scale (n = sample size,
 * p = parameter count). Used by the robust fits for inlier
 * classification.
 */
export function lmedsScale(absResiduals: readonly number[], parameterCount: number): number {
  if (absResiduals.length === 0 || !Number.isInteger(parameterCount) || parameterCount < 1) {
    throw new GeometryError("VALIDATION_FAILED", "lmeds scale requires residuals and a parameter count ≥ 1", {
      details: { residualCount: absResiduals.length, parameterCount: String(parameterCount) },
    });
  }
  const n = absResiduals.length;
  if (n <= parameterCount) {
    throw new GeometryError("VALIDATION_FAILED", "lmeds scale requires more residuals than parameters", {
      details: { residualCount: n, parameterCount },
    });
  }
  const sorted = [...absResiduals].sort((a, b) => a - b);
  const median =
    n % 2 === 1
      ? (sorted[(n - 1) / 2] as number)
      : ((sorted[n / 2 - 1] as number) + (sorted[n / 2] as number)) / 2;
  const correction = 1 + 5 / (n - parameterCount);
  return 1.4826 * correction * median;
}

/**
 * Inlier classification for robust fits: |residual| ≤
 * scaleMultiplier · σ̂. Pure function, no state.
 */
export function classifyInliers(
  residuals: readonly number[],
  scale: number,
  scaleMultiplier: number,
): boolean[] {
  const bound = scaleMultiplier * scale;
  return residuals.map((residual) => Math.abs(residual) <= bound);
}
