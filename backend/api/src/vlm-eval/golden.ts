/**
 * HFX-201 — the GOLDEN committed-artifact projections.
 *
 * The canonical projection of the benchmark into the two committed
 * artifacts under tools/vlm-eval/ (the tools/reasoning-eval discipline:
 * the tools zone consumes them AS DATA — the workspace boundary matrix
 * forbids tools → packages/backend imports, so the regeneration lives
 * here, in the importable zone):
 *
 *  - `scenario.json` — the corpus suite: the suite/benchmark identities,
 *    the registered variant blocks (ids, versions, license status,
 *    profile digests) and the 24 materialized run scenarios (the Layer-2
 *    scenario + the HFX-201 metadata: matrix cell, behavior class, check
 *    plan, expected grounded kinds);
 *  - `fixtures/expected-outcomes.json` — the golden benchmark run: per
 *    run the classification, the violation rules/kinds, the deterministic
 *    grounded-check verdicts and observation kinds, the revision binding,
 *    the envelope/result digests, the content-addressed record + manifest
 *    ids, the metrics and `expectedMatch`; plus the per-variant summaries
 *    and the provider comparison record.
 *
 * Both projections are canonical JSON (sorted keys, 2-space indent,
 * trailing newline) — byte-stable across runs (the golden.test.ts
 * byte-comparison is the gate).
 */

import { canonicalJsonText } from "../reasoning-eval/model";
import {
  QWEN3_VL_VARIANTS,
  VLM_EVAL_BENCHMARK_ID,
  VLM_EVAL_CODE_VERSION,
  VLM_EVAL_SUITE_ID,
  VLM_EVAL_SUITE_VERSION,
  qwen3VlLicenseStatus,
  qwen3VlVariantIdentity,
  validatedQwen3VlProfile,
} from "./model";
import { VLM_EVAL_CORPUS, vlmEvalRuns } from "./corpus";
import { runVlmBenchmarkLifecycle } from "./registry";

/* ------------------------------------------------------------------ */
/* The scenario suite projection                                         */
/* ------------------------------------------------------------------ */

/** The committed tools/vlm-eval/scenario.json content (canonical JSON). */
export function goldenVlmScenarioSuiteJson(): string {
  const variants = QWEN3_VL_VARIANTS.map((variant) => {
    const identity = qwen3VlVariantIdentity(variant);
    const { profileDigest } = validatedQwen3VlProfile(variant);
    return {
      variant,
      providerId: identity.providerId,
      technologyVersion: identity.technologyVersion,
      capability: identity.capability,
      profileDigest,
      licenseStatus: qwen3VlLicenseStatus(),
    };
  });
  const runs = vlmEvalRuns();
  return canonicalJsonText({
    suiteId: VLM_EVAL_SUITE_ID,
    version: VLM_EVAL_SUITE_VERSION,
    benchmarkId: VLM_EVAL_BENCHMARK_ID,
    codeVersion: VLM_EVAL_CODE_VERSION,
    providerFamily: "qwen3-vl",
    executionMode: "deterministic-in-repo-doubles",
    licenseStatus: qwen3VlLicenseStatus(),
    baseScenarioCount: VLM_EVAL_CORPUS.length,
    runCount: runs.length,
    variants,
    scenarios: runs.map((run) => ({
      scenarioId: run.scenarioId,
      baseScenarioId: run.baseScenarioId,
      variant: run.variant,
      matrixCell: run.matrixCell,
      behaviorClass: run.behaviorClass,
      lane: run.scenario.lane,
      providerRef: run.scenario.providerRef,
      capability: run.scenario.capability,
      input: run.scenario.input,
      expected: run.scenario.expected,
      criteria: run.scenario.criteria,
      checkPlan: run.checkPlan,
      expectedGroundedKinds: run.expectedGroundedKinds,
    })),
  });
}

/* ------------------------------------------------------------------ */
/* The expected-outcomes projection                                      */
/* ------------------------------------------------------------------ */

/** The committed tools/vlm-eval/fixtures/expected-outcomes.json content (canonical JSON). */
export function goldenVlmExpectedOutcomesJson(): string {
  const lifecycle = runVlmBenchmarkLifecycle();
  return canonicalJsonText({
    suiteId: VLM_EVAL_SUITE_ID,
    version: VLM_EVAL_SUITE_VERSION,
    benchmarkId: VLM_EVAL_BENCHMARK_ID,
    codeVersion: VLM_EVAL_CODE_VERSION,
    providerFamily: "qwen3-vl",
    executionMode: "deterministic-in-repo-doubles",
    licenseStatus: qwen3VlLicenseStatus(),
    runCount: lifecycle.outcomes.length,
    variants: lifecycle.variants.map((variant) => ({
      variant: variant.variant,
      providerId: variant.providerId,
      technologyVersion: variant.technologyVersion,
      profileDigest: variant.profileDigest,
      licenseStatus: variant.licenseStatus,
      registryState: variant.registryState,
      benchmarkRecordId: variant.consolidatedRecord.recordId,
      provenanceManifestId: variant.provenanceManifest.manifestId,
      comparabilityKey: variant.comparabilityKey,
      promotionRefusalKinds: variant.promotionRefusals.map((refusal) => refusal.kind),
    })),
    outcomes: lifecycle.outcomes.map((outcome) => ({
      scenarioId: outcome.scenarioId,
      baseScenarioId: outcome.baseScenarioId,
      variant: outcome.variant,
      matrixCell: outcome.matrixCell,
      behaviorClass: outcome.behaviorClass,
      classification: outcome.layer2.classification,
      violationRules: outcome.layer2.violations.map((violation) => violation.rule),
      violationKinds: outcome.layer2.violations.map((violation) => violation.kind),
      groundedVerdicts: outcome.grounded.verdicts.map((verdict) => ({
        check: verdict.check,
        verdict: verdict.verdict,
      })),
      groundedObservationKinds: outcome.grounded.observationKinds,
      groundedFailureObservations: outcome.grounded.observations.length,
      groundedPass: outcome.grounded.groundedPass,
      resultStatus: outcome.layer2.envelope.resultStatus,
      resultClaim: outcome.layer2.envelope.resultClaim,
      evidenceIds: outcome.layer2.envelope.evidenceIds,
      evidenceRevisions: outcome.layer2.envelope.evidenceRevisions,
      measurementUncertainty: outcome.layer2.envelope.measurementUncertainty,
      revisionBindingOk: outcome.revisionBinding.ok,
      envelopeDigest: outcome.layer2.envelopeDigest,
      inputDigest: outcome.layer2.inputDigest,
      normalizedResultDigest: outcome.layer2.normalizedResultDigest,
      recordId: outcome.layer2.benchmarkRecord.recordId,
      manifestId: outcome.layer2.provenanceManifest.manifestId,
      metrics: {
        classificationMatch: outcome.layer2.fieldMatches.classification ? 1 : 0,
        envelopeIntegrityViolations: outcome.layer2.violations.length,
        expectedOutcomeMatch: outcome.expectedMatch ? 1 : 0,
        groundedFailureObservations: outcome.grounded.observations.length,
      },
      expectedMatch: outcome.expectedMatch,
    })),
    summary: {
      total: lifecycle.outcomes.length,
      byVariant: Object.fromEntries(
        lifecycle.variants.map((variant) => [variant.variant, variant.summary]),
      ),
      byClassification: Object.fromEntries(
        Object.entries(
          lifecycle.outcomes.reduce<Record<string, number>>((counts, outcome) => {
            counts[outcome.layer2.classification] =
              (counts[outcome.layer2.classification] ?? 0) + 1;
            return counts;
          }, {}),
        ).sort(([a], [b]) => a.localeCompare(b)),
      ),
      byMatrixCell: Object.fromEntries(
        Object.entries(
          lifecycle.outcomes.reduce<Record<string, number>>((counts, outcome) => {
            counts[outcome.matrixCell] = (counts[outcome.matrixCell] ?? 0) + 1;
            return counts;
          }, {}),
        ).sort(([a], [b]) => a.localeCompare(b)),
      ),
      classificationMatches: lifecycle.outcomes.filter(
        (outcome) => outcome.layer2.fieldMatches.classification,
      ).length,
      expectedMatches: lifecycle.outcomes.filter((outcome) => outcome.expectedMatch).length,
      groundedFailureObservations: lifecycle.outcomes.reduce(
        (sum, outcome) => sum + outcome.grounded.observations.length,
        0,
      ),
    },
    comparison: lifecycle.comparison,
    replayEqual: lifecycle.replayEqual,
  });
}
