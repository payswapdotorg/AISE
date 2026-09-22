/**
 * HFX-101 — the PROVIDER COMPARISON (the "provider comparison" evidence the
 * work order demands).
 *
 * The registered MapAnything candidate and the EXISTING deterministic
 * reference path run the SAME corpus over the SAME evidence fixtures; this
 * module aggregates the per-variant outcome counts and builds the PER-LANE
 * comparison records — every row of which is a consolidated
 * `BenchmarkRecord` with the SAME comparability key
 * (`benchmarkId|capability` — the control plane's
 * `benchmarkComparabilityKey`), so a future real-model run slots into the
 * same table without any schema change.
 *
 * The metric deltas are computed over the SHARED content tasks (the tasks
 * both variants evaluated over the same evidence): per task per metric
 * name, the mean |value| of each variant's instances and the delta
 * (MapAnything − reference). The reconstruction-lane deltas are exactly 0
 * — the double's well-grounded reconstruction core is the shared
 * deterministic least-squares fit over the same ground-truth-blind capture
 * view (the provider-substitution demonstration: swapping the provider
 * preserves the canonical semantics). The depth-lane deltas are non-zero —
 * the double's documented metric-depth deviation profile (+0.1% scale,
 * +2mm offset), well within the committed thresholds.
 *
 * HONESTY NOTE (carried by the record itself): the MapAnything side
 * exercises a DETERMINIC IN-REPO DOUBLE standing in for the model — the
 * counts and deltas measure the scripted demonstration capability profile,
 * not measured model behavior; the explicit-gate cells
 * (degraded-evidence/failed-invocation/unsupported-task) are declared
 * behaviors of the REGISTERED MapAnything profile with no counterpart in
 * the reference double (which reconstructs from the capture view
 * unconditionally), so the reference rows cover the shared content tasks
 * only.
 */

import type { FailureKind } from "@aise/provider-registry";
import type { MapAnythingEvalOutcome } from "./harness";
import type { MapAnythingLane } from "./registry";
import { MAPANYTHING_BEHAVIOR_MATRIX_CELLS } from "./model";
import { mapAnythingProfileForVariant } from "./model";
import type { MapAnythingVariantKey } from "./model";

/* ------------------------------------------------------------------ */
/* The per-variant summaries                                            */
/* ------------------------------------------------------------------ */

function countBy(values: readonly string[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/** The mean of |value| over one variant-lane's content-run metric instances, per metric name. */
function meanAbsMetricsOf(
  outcomes: readonly MapAnythingEvalOutcome[],
): Readonly<Record<string, number>> {
  const buckets = new Map<string, number[]>();
  for (const outcome of outcomes) {
    if (outcome.layer1.normalizedResult.status !== "ok") {
      continue;
    }
    for (const metric of outcome.layer1.record.metrics) {
      const bucket = buckets.get(metric.metric) ?? [];
      bucket.push(Math.abs(metric.value));
      buckets.set(metric.metric, bucket);
    }
  }
  const out: Record<string, number> = {};
  for (const [metric, values] of buckets) {
    out[metric] = values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** One variant-lane's summary (the comparison row's core). */
export interface MapAnythingVariantLaneSummary {
  readonly variant: MapAnythingVariantKey;
  readonly lane: MapAnythingLane;
  readonly runCount: number;
  readonly contentRuns: number;
  readonly refusalRuns: number;
  readonly outcomeCounts: Readonly<Record<string, number>>;
  readonly failureKindCounts: Readonly<Record<string, number>>;
  readonly behaviorMatrixCellsPassed: readonly string[];
  readonly meanAbsMetrics: Readonly<Record<string, number>>;
}

/** Summarizes one variant's outcomes over one lane (pure). */
export function mapAnythingVariantLaneSummaryOf(
  variant: MapAnythingVariantKey,
  lane: MapAnythingLane,
  outcomes: readonly MapAnythingEvalOutcome[],
): MapAnythingVariantLaneSummary {
  const mine = outcomes.filter(
    (outcome) =>
      outcome.variant === variant &&
      (outcome.layer1.record.capability === lane),
  );
  const content = mine.filter((outcome) => outcome.layer1.normalizedResult.status === "ok");
  const failureKinds: string[] = [];
  for (const outcome of mine) {
    const kind = outcome.layer1.normalizedResult.failure?.kind;
    if (kind !== undefined) {
      failureKinds.push(kind);
    }
  }
  const cellsPassed = (MAPANYTHING_BEHAVIOR_MATRIX_CELLS as readonly string[]).filter((cell) =>
    mine.some((outcome) => outcome.matrixCell === cell && outcome.expectedMatch),
  );
  return {
    variant,
    lane,
    runCount: mine.length,
    contentRuns: content.length,
    refusalRuns: mine.length - content.length,
    outcomeCounts: countBy(mine.map((outcome) => outcome.layer1.verdict)),
    failureKindCounts: countBy(failureKinds),
    behaviorMatrixCellsPassed: cellsPassed,
    meanAbsMetrics: meanAbsMetricsOf(mine),
  };
}

/* ------------------------------------------------------------------ */
/* The comparison rows + records                                        */
/* ------------------------------------------------------------------ */

/** One variant's row of a lane comparison record. */
export interface MapAnythingLaneComparisonRow {
  readonly role: "registered-candidate" | "reference-path";
  readonly variant: MapAnythingVariantKey;
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly profileDigest: string;
  readonly licenseStatus: string;
  /** The consolidated control-plane benchmark record id (content-addressed). */
  readonly benchmarkRecordId: string;
  /** The sealed provenance manifest id (digest-verifiable). */
  readonly provenanceManifestId: string;
  readonly comparabilityKey: string;
  readonly runCount: number;
  readonly contentRuns: number;
  readonly refusalRuns: number;
  readonly outcomeCounts: Readonly<Record<string, number>>;
  readonly failureKindCounts: Readonly<Record<string, number>>;
  readonly behaviorMatrixCellsPassed: readonly string[];
  readonly meanAbsMetrics: Readonly<Record<string, number>>;
  /** The DECLARED latency/resource profile (from the registered profile — never sensed). */
  readonly resourceProfile: {
    readonly accelerator: string;
    readonly memoryMiB: number;
    readonly latencyMsP50: number;
    readonly latencyMsP95: number;
    readonly costModel: string;
    readonly unitCost: number;
    readonly currency: string;
  };
  /** The uncertainty characteristics (the declared calibration + the per-task expectations). */
  readonly uncertaintyCharacteristics: {
    readonly calibration: string;
    readonly confidenceSeparateFromMeasurementUncertainty: boolean;
    readonly perTask: readonly {
      readonly taskId: string;
      readonly role: string;
      readonly sigmaM: number | null;
      readonly declaredSigmaM: number | null;
    }[];
  };
}

/** One per-task per-metric delta row (over the SHARED content tasks). */
export interface MapAnythingMetricDeltaRow {
  readonly taskId: string;
  readonly metric: string;
  readonly unit: string;
  readonly mapAnythingMeanAbs: number;
  readonly referenceMeanAbs: number;
  readonly delta: number;
}

/** The full per-lane provider comparison record. */
export interface MapAnythingLaneComparison {
  readonly lane: MapAnythingLane;
  readonly benchmarkId: string;
  readonly capability: string;
  readonly comparabilityKey: string;
  /** The rows: the registered candidate first, then the reference path. */
  readonly rows: readonly MapAnythingLaneComparisonRow[];
  /** The content tasks both variants evaluated over the same evidence (the delta join). */
  readonly sharedContentTaskIds: readonly string[];
  readonly metricDeltas: readonly MapAnythingMetricDeltaRow[];
  /** The per-metric aggregate deltas over the shared content tasks. */
  readonly aggregateDeltas: readonly {
    readonly metric: string;
    readonly unit: string;
    readonly mapAnythingMean: number;
    readonly referenceMean: number;
    readonly delta: number;
  }[];
  readonly honestNote: string;
}

/** The honest note every comparison artifact carries. */
export const MAPANYTHING_COMPARISON_HONEST_NOTE: string =
  "the MapAnything side exercises a DETERMINISTIC IN-REPO DOUBLE standing in for the registered " +
  "candidate — the per-variant outcome counts and metric deltas measure the scripted demonstration " +
  "capability profile, not measured model behavior; the reconstruction-lane deltas are exactly 0 because " +
  "the double's well-grounded reconstruction core is the shared deterministic least-squares fit over the " +
  "same ground-truth-blind capture view as the reference double (provider substitution preserves the " +
  "canonical semantics), while the depth-lane deltas reflect the double's documented metric-depth " +
  "deviation profile (+0.1% scale, +2mm offset); the explicit-gate cells (degraded-evidence, " +
  "failed-invocation, unsupported-task-combination) are declared behaviors of the REGISTERED MapAnything " +
  "profile with no counterpart in the reference double (which reconstructs unconditionally), so the " +
  "reference rows cover the shared content tasks only; a future real-model run slots into the same " +
  "benchmark ids, capability lanes and comparability keys without any schema change";

/** The input of `compareMapAnythingLanes` (one consolidated variant-lane). */
export interface MapAnythingComparisonLaneInput {
  readonly variant: MapAnythingVariantKey;
  readonly lane: MapAnythingLane;
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly profileDigest: string;
  readonly benchmarkRecordId: string;
  readonly provenanceManifestId: string;
  readonly outcomes: readonly MapAnythingEvalOutcome[];
}

function meanAbsByMetricOfTask(outcome: MapAnythingEvalOutcome): Readonly<Record<string, number>> {
  const buckets = new Map<string, number[]>();
  for (const metric of outcome.layer1.record.metrics) {
    const bucket = buckets.get(metric.metric) ?? [];
    bucket.push(Math.abs(metric.value));
    buckets.set(metric.metric, bucket);
  }
  const out: Record<string, number> = {};
  for (const [metric, values] of buckets) {
    out[metric] = values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return out;
}

function rowOf(input: MapAnythingComparisonLaneInput): MapAnythingLaneComparisonRow {
  const profile = mapAnythingProfileForVariant(input.variant);
  const summary = mapAnythingVariantLaneSummaryOf(input.variant, input.lane, input.outcomes);
  const isCandidate = input.variant === "mapanything";
  return {
    role: isCandidate ? "registered-candidate" : "reference-path",
    variant: input.variant,
    providerId: input.providerId,
    technologyVersion: input.technologyVersion,
    profileDigest: input.profileDigest,
    licenseStatus: isCandidate ? "evaluation-only" : "reference-path-fixture",
    benchmarkRecordId: input.benchmarkRecordId,
    provenanceManifestId: input.provenanceManifestId,
    comparabilityKey:
      input.lane === "reconstruction"
        ? "reality-eval-reconstruction/1|reconstruction"
        : "reality-eval-depth/1|depth",
    runCount: summary.runCount,
    contentRuns: summary.contentRuns,
    refusalRuns: summary.refusalRuns,
    outcomeCounts: summary.outcomeCounts,
    failureKindCounts: summary.failureKindCounts,
    behaviorMatrixCellsPassed: summary.behaviorMatrixCellsPassed,
    meanAbsMetrics: summary.meanAbsMetrics,
    resourceProfile: {
      accelerator: profile.computeProfile.accelerator,
      memoryMiB: profile.memoryProfile.recommendedMiB,
      latencyMsP50: profile.latencyProfile.expectedMsP50,
      latencyMsP95: profile.latencyProfile.expectedMsP95,
      costModel: profile.costProfile.model,
      unitCost: profile.costProfile.unitCost,
      currency: profile.costProfile.currency,
    },
    uncertaintyCharacteristics: {
      calibration: profile.uncertaintyCharacteristics.calibration,
      confidenceSeparateFromMeasurementUncertainty:
        profile.uncertaintyCharacteristics.confidenceSeparateFromMeasurementUncertainty,
      perTask: input.outcomes.map((outcome) => ({
        taskId: outcome.taskId,
        role: outcome.uncertainty.expected?.role ?? "none",
        sigmaM: outcome.uncertainty.expected?.sigmaM ?? null,
        declaredSigmaM: outcome.uncertainty.declaredSigmaM,
      })),
    },
  };
}

/**
 * Builds the PER-LANE provider comparison records: per lane, the registered
 * MapAnything candidate's row + the existing reference path's row, joined
 * on the comparability key, with the metric deltas over the SHARED content
 * tasks (the tasks both variants evaluated over the same evidence).
 */
export function compareMapAnythingLanes(
  inputs: readonly MapAnythingComparisonLaneInput[],
): readonly MapAnythingLaneComparison[] {
  const lanes: MapAnythingLane[] = ["reconstruction", "depth"];
  const comparisons: MapAnythingLaneComparison[] = [];
  for (const lane of lanes) {
    const laneInputs = inputs.filter((input) => input.lane === lane);
    const candidate = laneInputs.find((input) => input.variant === "mapanything");
    const reference = laneInputs.find((input) => input.variant !== "mapanything");
    if (candidate === undefined || reference === undefined) {
      continue;
    }
    const benchmarkId =
      lane === "reconstruction" ? "reality-eval-reconstruction/1" : "reality-eval-depth/1";
    const comparabilityKey = `${benchmarkId}|${lane}`;

    /* The metric deltas over the SHARED content tasks. */

    const candidateContent = candidate.outcomes.filter(
      (outcome) => outcome.layer1.normalizedResult.status === "ok",
    );
    const referenceContent = reference.outcomes.filter(
      (outcome) => outcome.layer1.normalizedResult.status === "ok",
    );
    const referenceByTask = new Map(
      referenceContent.map((outcome) => [outcome.taskId, outcome]),
    );
    const sharedTaskIds = candidateContent
      .map((outcome) => outcome.taskId)
      .filter((taskId) => referenceByTask.has(taskId))
      .sort((a, b) => a.localeCompare(b));

    const unitByMetric = new Map<string, string>();
    for (const outcome of [...candidateContent, ...referenceContent]) {
      for (const metric of outcome.layer1.record.metrics) {
        unitByMetric.set(metric.metric, metric.unit);
      }
    }
    const deltas: MapAnythingMetricDeltaRow[] = [];
    const aggregateBuckets = new Map<string, { ma: number[]; ref: number[]; unit: string }>();
    for (const taskId of sharedTaskIds) {
      const maOutcome = candidateContent.find((outcome) => outcome.taskId === taskId)!;
      const refOutcome = referenceByTask.get(taskId)!;
      const maMetrics = meanAbsByMetricOfTask(maOutcome);
      const refMetrics = meanAbsByMetricOfTask(refOutcome);
      for (const [metric, maValue] of Object.entries(maMetrics)) {
        const refValue = refMetrics[metric];
        if (refValue === undefined) {
          continue;
        }
        const unit = unitByMetric.get(metric) ?? "n/a";
        deltas.push({
          taskId,
          metric,
          unit,
          mapAnythingMeanAbs: maValue,
          referenceMeanAbs: refValue,
          delta: maValue - refValue,
        });
        const bucket = aggregateBuckets.get(metric) ?? { ma: [], ref: [], unit };
        bucket.ma.push(maValue);
        bucket.ref.push(refValue);
        aggregateBuckets.set(metric, bucket);
      }
    }
    const aggregateDeltas = [...aggregateBuckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([metric, bucket]) => {
        const maMean = bucket.ma.reduce((sum, value) => sum + value, 0) / bucket.ma.length;
        const refMean = bucket.ref.reduce((sum, value) => sum + value, 0) / bucket.ref.length;
        return {
          metric,
          unit: bucket.unit,
          mapAnythingMean: maMean,
          referenceMean: refMean,
          delta: maMean - refMean,
        };
      });

    comparisons.push({
      lane,
      benchmarkId,
      capability: lane,
      comparabilityKey,
      rows: [rowOf(candidate), rowOf(reference)],
      sharedContentTaskIds: sharedTaskIds,
      metricDeltas: deltas.sort(
        (a, b) =>
          a.taskId.localeCompare(b.taskId) || a.metric.localeCompare(b.metric),
      ),
      aggregateDeltas,
      honestNote: MAPANYTHING_COMPARISON_HONEST_NOTE,
    });
  }
  return comparisons;
}

/** The closed-vocabulary failure kinds exhibited across outcomes (sorted). */
export function exhibitedFailureKindsOf(
  outcomes: readonly MapAnythingEvalOutcome[],
): readonly string[] {
  return [
    ...new Set(
      outcomes
        .map((outcome) => outcome.layer1.normalizedResult.failure?.kind)
        .filter((kind): kind is FailureKind => kind !== undefined),
    ),
  ].sort((a, b) => a.localeCompare(b));
}
