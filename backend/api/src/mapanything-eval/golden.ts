/**
 * HFX-101 — the GOLDEN committed-artifact projections.
 *
 * The canonical projection of the benchmark into the two committed
 * artifacts under tools/mapanything-eval/ (the tools/reality-eval +
 * tools/vlm-eval discipline: the tools zone consumes them AS DATA — the
 * workspace boundary matrix forbids tools → packages/backend imports, so
 * the regeneration lives here, in the importable zone):
 *
 *  - `scenario.json` — the corpus suite: the suite identity block, the
 *    registered provider blocks (the MapAnything candidate + the two
 *    reference-path providers, with profile digests and license status),
 *    the lane table (the pinned Layer-1 benchmark ids + the comparability
 *    keys), the EIGHT corpus tasks (evidence bundles with revisions +
 *    expected canonical outcomes + criteria) and the TWELVE materialized
 *    runs (the full reality-eval scenario descriptors);
 *  - `fixtures/expected-outcomes.json` — the golden benchmark run: per run
 *    the Layer-1 verdict + observation kinds, the content-addressed record
 *    + the digest-verifiable manifest, the uncertainty characteristics,
 *    the fallback state, the derived reconstruction version, the per-variant
 *    lifecycle blocks (consolidated record ids, provenance-manifest ids,
 *    comparability keys, the license-blocked promotion refusals), the
 *    per-lane provider comparison records, the full append-only registry
 *    event log and the replay proof.
 *
 * Both projections are canonical JSON (sorted keys, 2-space indent,
 * trailing newline) — byte-stable across runs (the golden.test.ts
 * byte-comparison is the gate).
 */

import {
  MAPANYTHING_EVAL_CODE_VERSION,
  MAPANYTHING_EVAL_EXECUTION_MODE,
  MAPANYTHING_EVAL_SUITE_ID,
  MAPANYTHING_EVAL_SUITE_VERSION,
  MAPANYTHING_EVAL_VARIANTS,
  MAPANYTHING_LICENSE_STATUS_EVALUATION_ONLY,
  canonicalDigestOf,
  canonicalJsonText,
  mapAnythingLicenseStatus,
  validatedProfileForVariant,
} from "./model";
import { MAPANYTHING_EVAL_CORPUS, mapAnythingEvalRuns } from "./corpus";
import { runMapAnythingBenchmarkLifecycle } from "./registry";

/* ------------------------------------------------------------------ */
/* The scenario suite projection                                         */
/* ------------------------------------------------------------------ */

/** The committed tools/mapanything-eval/scenario.json content (the VALUE form). */
export function mapAnythingScenarioSuiteValue(): Record<string, unknown> {
  const runs = mapAnythingEvalRuns();
  const providers = MAPANYTHING_EVAL_VARIANTS.map((variant) => {
    const { profile, profileDigest } = validatedProfileForVariant(variant);
    return {
      variant,
      role: variant === "mapanything" ? "registered-candidate" : "reference-path",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      capabilities: [...profile.capabilities],
      licenseStatus:
        variant === "mapanything" ? mapAnythingLicenseStatus() : "reference-path-fixture",
      profileDigest,
    };
  });
  return {
    suiteId: MAPANYTHING_EVAL_SUITE_ID,
    version: MAPANYTHING_EVAL_SUITE_VERSION,
    codeVersion: MAPANYTHING_EVAL_CODE_VERSION,
    executionMode: MAPANYTHING_EVAL_EXECUTION_MODE,
    licenseStatus: MAPANYTHING_LICENSE_STATUS_EVALUATION_ONLY,
    providerFamily: "mapanything",
    taskCount: MAPANYTHING_EVAL_CORPUS.length,
    runCount: runs.length,
    providers,
    lanes: {
      reconstruction: {
        benchmarkId: "reality-eval-reconstruction/1",
        comparabilityKey: "reality-eval-reconstruction/1|reconstruction",
        mapAnythingRunCount: runs.filter(
          (run) => run.variant === "mapanything" && run.task.capability === "reconstruction",
        ).length,
        referenceRunCount: runs.filter(
          (run) => run.variant === "reference-reconstruction",
        ).length,
      },
      depth: {
        benchmarkId: "reality-eval-depth/1",
        comparabilityKey: "reality-eval-depth/1|depth",
        mapAnythingRunCount: runs.filter(
          (run) => run.variant === "mapanything" && run.task.capability === "depth",
        ).length,
        referenceRunCount: runs.filter((run) => run.variant === "reference-depth").length,
      },
    },
    tasks: MAPANYTHING_EVAL_CORPUS.map((task) => ({
      taskId: task.taskId,
      taskVersion: task.taskVersion,
      taskKind: task.taskKind,
      matrixCell: task.matrixCell,
      behaviorClass: task.behaviorClass,
      capability: task.capability,
      scenarioClass: task.matrixCell === "grounded-pass" ? "positive" : "negative",
      expectedFailureKind: task.expectedFailureKind,
      expectedVerdict: task.expectedVerdict,
      expectedFallback: task.expectedFallback ?? null,
      evidenceRevisions: [...task.evidence.evidenceRevisions],
      uncertainty: task.uncertainty,
      expected: task.expected,
      criteria: task.criteria,
      evidence: {
        description: task.evidence.description,
        fixtureId: task.evidence.fixtureId ?? null,
        deviceClass: task.evidence.deviceClass ?? null,
        gridWidth: task.evidence.gridWidth ?? null,
        gridHeight: task.evidence.gridHeight ?? null,
        samples: task.evidence.samples ? [...task.evidence.samples] : null,
        captureSet: task.evidence.captureSet,
      },
    })),
    runs: runs.map((run) => ({
      runId: run.runId,
      taskId: run.taskId,
      variant: run.variant,
      scenario: run.scenario,
    })),
  };
}

/** The committed tools/mapanything-eval/scenario.json content (canonical JSON). */
export function goldenMapAnythingScenarioSuiteJson(): string {
  return canonicalJsonText(mapAnythingScenarioSuiteValue());
}

/* ------------------------------------------------------------------ */
/* The expected-outcomes projection                                      */
/* ------------------------------------------------------------------ */

/** The committed tools/mapanything-eval/fixtures/expected-outcomes.json content (canonical JSON). */
export function goldenMapAnythingExpectedOutcomesJson(): string {
  const suite = mapAnythingScenarioSuiteValue();
  const lifecycle = runMapAnythingBenchmarkLifecycle();
  return canonicalJsonText({
    suiteId: MAPANYTHING_EVAL_SUITE_ID,
    version: MAPANYTHING_EVAL_SUITE_VERSION,
    codeVersion: MAPANYTHING_EVAL_CODE_VERSION,
    executionMode: MAPANYTHING_EVAL_EXECUTION_MODE,
    licenseStatus: mapAnythingLicenseStatus(),
    providerFamily: "mapanything",
    runCount: lifecycle.outcomes.length,
    scenarioSetDigest: canonicalDigestOf(suite),
    outcomes: lifecycle.outcomes.map((outcome) => ({
      runId: outcome.runId,
      taskId: outcome.taskId,
      variant: outcome.variant,
      matrixCell: outcome.matrixCell,
      behaviorClass: outcome.behaviorClass,
      taskKind: outcome.taskKind,
      scenarioClass: outcome.layer1.scenarioClass,
      verdict: outcome.layer1.verdict,
      verdictMatch: outcome.verdictMatch,
      failureKindMatch: outcome.failureKindMatch,
      expectedMatch: outcome.expectedMatch,
      normalizedStatus: outcome.layer1.normalizedResult.status,
      normalizedFailure:
        outcome.layer1.normalizedResult.status === "failed" &&
        outcome.layer1.normalizedResult.failure !== undefined
          ? {
              kind: outcome.layer1.normalizedResult.failure.kind,
              detail: outcome.layer1.normalizedResult.failure.detail,
            }
          : null,
      failureObservationKinds: outcome.layer1.failureObservations.map(
        (observation) => observation.kind,
      ),
      criterionViolationCount: outcome.layer1.criterionViolations.length,
      metrics: outcome.layer1.record.metrics.map((metric) => ({
        metric: metric.metric,
        subjectId: metric.subjectId ?? null,
        value: metric.value,
        unit: metric.unit,
      })),
      record: outcome.layer1.record,
      manifest: outcome.layer1.manifest,
      inputDigest: outcome.layer1.record.reproduction.inputsDigest,
      normalizedResultDigest: outcome.layer1.manifest.normalizedResultDigest,
      uncertainty: {
        expectedRole: outcome.uncertainty.expected?.role ?? "none",
        expectedSigmaM: outcome.uncertainty.expected?.sigmaM ?? null,
        declaredSigmaM: outcome.uncertainty.declaredSigmaM,
        refusalBoundSigmaM: outcome.uncertainty.refusalBoundSigmaM,
        surfaced: outcome.uncertainty.surfaced,
      },
      fallbackState: outcome.fallbackState,
      evidenceRevisions: [...outcome.evidenceRevisions],
      derivedVersionId: outcome.derivedVersionId,
    })),
    variants: lifecycle.variants.map((variant) => ({
      variant: variant.variant,
      role: variant.variant === "mapanything" ? "registered-candidate" : "reference-path",
      providerId: variant.providerId,
      technologyVersion: variant.technologyVersion,
      profileDigest: variant.profileDigest,
      licenseStatus: variant.licenseStatus,
      registryState: variant.registryState,
      promotionRefusalKinds: variant.promotionRefusals.map((refusal) => refusal.kind),
      lanes: variant.lanes.map((lane) => ({
        lane: lane.lane,
        runCount: lane.runCount,
        contentRuns: lane.contentRuns,
        refusalRuns: lane.refusalRuns,
        benchmarkRecordId: lane.consolidatedRecord.recordId,
        provenanceManifestId: lane.consolidatedManifest.manifestId,
        comparabilityKey: lane.comparabilityKey,
        registryAttached: lane.registryAttached,
        consolidatedRecord: lane.consolidatedRecord,
        consolidatedManifest: lane.consolidatedManifest,
      })),
    })),
    comparisons: lifecycle.comparisons,
    registryLog: lifecycle.events,
    replayEqual: lifecycle.replayEqual,
  });
}
