/**
 * HFX-201 — the VARIANT COMPARISON (the "provider comparison" evidence).
 *
 * The two registered Qwen3-VL profiles run the SAME corpus; this module
 * aggregates the per-variant outcome counts and builds the comparison
 * record every row of which is a `BenchmarkRecord` with the SAME
 * comparability key (`benchmarkId|capability` — the control plane's
 * `benchmarkComparabilityKey`), so a future real-model run slots into the
 * same table without any schema change.
 *
 * HONESTY NOTE (carried by the record itself): both runs exercise
 * DETERMINISTIC IN-REPO DOUBLES standing in for the models — the counts
 * measure the scripted demonstration capability profiles, not measured
 * model behavior.
 */

import type { FailureKind } from "@aise/provider-registry";
import type { VlmEvalOutcome } from "./harness";
import { VLM_EVAL_BENCHMARK_ID, VLM_EVAL_CAPABILITY, QWEN3_VL_VARIANTS } from "./model";
import type { VlmVariantKey } from "./model";

/* ------------------------------------------------------------------ */
/* The per-variant summary                                              */
/* ------------------------------------------------------------------ */

/** The deterministic outcome summary of one variant's corpus run. */
export interface VlmVariantRunSummary {
  readonly variant: VlmVariantKey;
  readonly scenarioCount: number;
  readonly byClassification: Readonly<Record<string, number>>;
  readonly byMatrixCell: Readonly<Record<string, number>>;
  readonly byBehaviorClass: Readonly<Record<string, number>>;
  readonly classificationMatches: number;
  readonly expectedMatches: number;
  readonly groundedFailureObservations: number;
  readonly groundedObservationKinds: Readonly<Record<string, number>>;
  readonly measurementUncertaintyRuns: number;
  readonly behaviorMatrixCellsPassed: readonly string[];
}

function countBy(values: readonly string[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Computes whether one behavior-matrix cell has at least one CONFORMING
 * run in the variant's outcomes (the cell's mandated behavior exhibited):
 *
 *  - grounded-pass: a clean supported/grounded answer (classification
 *    'none', no integrity violation, no grounded observation);
 *  - unsupported-question: the explicit refusal (classification
 *    'unsupported-data', no violation, no grounded observation);
 *  - missing-evidence: a bounded refusal/clarification (result status
 *    'unsupported', non-empty unknowns, no grounded observation);
 *  - conflicting-evidence: the surfaced conflict (status 'conflicted',
 *    no grounded observation).
 */
function cellConforms(outcome: VlmEvalOutcome, cell: string): boolean {
  const clean = outcome.layer2.classification !== undefined &&
    outcome.grounded.groundedPass &&
    outcome.revisionBinding.ok;
  if (!clean) {
    return false;
  }
  switch (cell) {
    case "grounded-pass":
      return outcome.matrixCell === "grounded-pass" &&
        outcome.layer2.classification === "none" &&
        outcome.layer2.violations.length === 0;
    case "unsupported-question":
      return outcome.matrixCell === "unsupported-question" &&
        outcome.layer2.classification === "unsupported-data" &&
        outcome.layer2.violations.length === 0;
    case "missing-evidence":
      return outcome.matrixCell === "missing-evidence" &&
        outcome.layer2.envelope.resultStatus === "unsupported" &&
        outcome.layer2.envelope.unknowns.length > 0;
    case "conflicting-evidence":
      return outcome.matrixCell === "conflicting-evidence" &&
        outcome.layer2.envelope.resultStatus === "conflicted";
    default:
      return false;
  }
}

/** Summarizes one variant's outcomes (pure; the coverage table is sorted). */
export function vlmVariantSummaryOf(
  variant: VlmVariantKey,
  outcomes: readonly VlmEvalOutcome[],
): VlmVariantRunSummary {
  const mine = outcomes.filter((outcome) => outcome.variant === variant);
  const groundedKinds: string[] = [];
  let groundedFailureObservations = 0;
  let measurementUncertaintyRuns = 0;
  for (const outcome of mine) {
    groundedKinds.push(...outcome.grounded.observationKinds);
    groundedFailureObservations += outcome.grounded.observations.length;
    if (outcome.layer2.envelope.measurementUncertainty.length > 0) {
      measurementUncertaintyRuns += 1;
    }
  }
  const cellsPassed = ["grounded-pass", "missing-evidence", "conflicting-evidence", "unsupported-question"]
    .filter((cell) => mine.some((outcome) => cellConforms(outcome, cell)))
    .sort((a, b) => a.localeCompare(b));
  return {
    variant,
    scenarioCount: mine.length,
    byClassification: countBy(mine.map((outcome) => outcome.layer2.classification)),
    byMatrixCell: countBy(mine.map((outcome) => outcome.matrixCell)),
    byBehaviorClass: countBy(mine.map((outcome) => outcome.behaviorClass)),
    classificationMatches: mine.filter((outcome) => outcome.layer2.fieldMatches.classification).length,
    expectedMatches: mine.filter((outcome) => outcome.expectedMatch).length,
    groundedFailureObservations,
    groundedObservationKinds: countBy(groundedKinds),
    measurementUncertaintyRuns,
    behaviorMatrixCellsPassed: cellsPassed,
  };
}

/* ------------------------------------------------------------------ */
/* The comparison record                                                */
/* ------------------------------------------------------------------ */

/** One variant's row of the comparison record. */
export interface VlmVariantComparisonRow {
  readonly variant: VlmVariantKey;
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly profileDigest: string;
  readonly licenseStatus: string;
  /** The consolidated control-plane benchmark record id (content-addressed). */
  readonly benchmarkRecordId: string;
  /** The sealed provenance manifest id (digest-verifiable). */
  readonly provenanceManifestId: string;
  readonly comparabilityKey: string;
  readonly scenarioCount: number;
  readonly outcomeCounts: Readonly<Record<string, number>>;
  readonly groundedObservationCounts: Readonly<Record<string, number>>;
  readonly classificationMatches: number;
  readonly expectedMatches: number;
  readonly groundedFailureObservations: number;
  readonly measurementUncertaintyRuns: number;
  readonly behaviorMatrixCellsPassed: readonly string[];
}

/** The full provider-comparison record over the same corpus. */
export interface VlmVariantComparison {
  readonly benchmarkId: string;
  readonly capability: string;
  readonly comparabilityKey: string;
  readonly rows: readonly VlmVariantComparisonRow[];
  readonly honestNote: string;
}

/** The honest note every comparison artifact carries. */
export const VLM_COMPARISON_HONEST_NOTE: string =
  "both runs exercise DETERMINISTIC IN-REPO DOUBLES standing in for the registered Qwen3-VL candidates — " +
  "the per-variant outcome counts measure the scripted demonstration capability profiles, not measured model " +
  "behavior; a future real-model run slots into the same benchmark id, capability and comparability key " +
  "without any schema change";

/**
 * Builds the provider comparison record: one row per registered variant
 * over the SAME corpus, joined by the comparability key.
 */
export function compareVlmVariants(
  summaries: readonly {
    readonly variant: VlmVariantKey;
    readonly providerId: string;
    readonly technologyVersion: string;
    readonly profileDigest: string;
    readonly benchmarkRecordId: string;
    readonly provenanceManifestId: string;
    readonly outcomes: readonly VlmEvalOutcome[];
  }[],
): VlmVariantComparison {
  const rows = QWEN3_VL_VARIANTS.flatMap((variant) => {
    const entry = summaries.find((candidate) => candidate.variant === variant);
    if (entry === undefined) {
      return [];
    }
    const summary = vlmVariantSummaryOf(variant, entry.outcomes);
    return [
      {
        variant,
        providerId: entry.providerId,
        technologyVersion: entry.technologyVersion,
        profileDigest: entry.profileDigest,
        licenseStatus: "evaluation-only",
        benchmarkRecordId: entry.benchmarkRecordId,
        provenanceManifestId: entry.provenanceManifestId,
        comparabilityKey: `${VLM_EVAL_BENCHMARK_ID}|${VLM_EVAL_CAPABILITY}`,
        scenarioCount: summary.scenarioCount,
        outcomeCounts: summary.byClassification,
        groundedObservationCounts: summary.groundedObservationKinds,
        classificationMatches: summary.classificationMatches,
        expectedMatches: summary.expectedMatches,
        groundedFailureObservations: summary.groundedFailureObservations,
        measurementUncertaintyRuns: summary.measurementUncertaintyRuns,
        behaviorMatrixCellsPassed: summary.behaviorMatrixCellsPassed,
      },
    ];
  });
  return {
    benchmarkId: VLM_EVAL_BENCHMARK_ID,
    capability: VLM_EVAL_CAPABILITY,
    comparabilityKey: `${VLM_EVAL_BENCHMARK_ID}|${VLM_EVAL_CAPABILITY}`,
    rows,
    honestNote: VLM_COMPARISON_HONEST_NOTE,
  };
}

/** The closed-vocabulary classification kinds exhibited across outcomes (sorted). */
export function exhibitedFailureKindsOf(outcomes: readonly VlmEvalOutcome[]): readonly string[] {
  return [
    ...new Set(
      outcomes
        .map((outcome) => outcome.layer2.classification)
        .filter((kind): kind is FailureKind => kind !== "none"),
    ),
  ].sort((a, b) => a.localeCompare(b));
}
