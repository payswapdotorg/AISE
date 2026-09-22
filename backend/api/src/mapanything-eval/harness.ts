/**
 * HFX-101 — the MapAnything provider benchmark HARNESS.
 *
 * `evaluateMapAnythingRun(run, registryLog)` runs ONE benchmark run (one
 * variant over one corpus task) through the FULL Layer-1 evaluation
 * pipeline (the authority is CONSUMED from `backend/api/src/reality-eval`
 * — PROD-027's harness, imported and never modified):
 *
 *   1. the deterministic fixture DOUBLE executes the scenario input (the
 *      MapAnything double, or the EXISTING reference-path double for the
 *      reference variants — both deterministic, no network);
 *   2. the complete scenario (descriptor + declared execution) is
 *      evaluated by the reality-eval `evaluateScenario`: profile resolution
 *      by registry-log REPLAY (never an inline profile), the control
 *      plane's `normalizeResult` boundary, the canonical comparison against
 *      Layer-1's OWN types via the EXISTING benchmark metrics, the
 *      per-instance GATE RULE thresholds, and the content-addressed
 *      `BenchmarkRecord` + `ProvenanceManifest` emission;
 *   3. the lane's OWN metadata assertions are evaluated over the Layer-1
 *      outcome: the expected-verdict match, the expected FAILURE KIND (the
 *      closed vocabulary), the declared measurement uncertainty (the
 *      §HF-1 exit gate's "uncertainty"), the degraded-evidence
 *      capture-requirement + bounded-uncertainty surfacing, and the
 *      failed-invocation non-ready/fallback state (never fabricated
 *      geometry — a failed answer carries NO outputs);
 *   4. the derived RECONSTRUCTION VERSION of the evaluation is addressed
 *      (versions.ts: reprocessing creates a NEW derived version; the
 *      original field evidence is never mutated).
 *
 * The provider lane never becomes a Layer-1 readiness authority: the
 * canonical comparison semantics stay the reality-eval harness's (imported
 * only). Provider replacement changes NOTHING here — swap the profile and
 * the registry log, and the same schema and comparison run.
 *
 * DETERMINISM: no clock, no randomness, no I/O. Identical run + registry
 * log produce byte-identical outcomes (asserted against the committed
 * goldens under tools/mapanything-eval/).
 */

import type { ProviderRegistryEvent } from "@aise/provider-registry";
import { evaluateScenario } from "../reality-eval";
import { completeScenario, validateRealityEvalScenarioDescriptor } from "../reality-eval";
import type { ScenarioEvaluation } from "../reality-eval";
import { executeFixtureProvider } from "../reality-eval/testkit";
import { executeMapAnythingDouble } from "./doubles";
import { mapAnythingEvalRuns } from "./corpus";
import {
  MAPANYTHING_PROVIDER_ID,
  MapAnythingEvalError,
  derivedReconstructionVersionIdOf,
  mapAnythingProfileForVariant,
} from "./model";
import type {
  MapAnythingBehaviorMatrixCell,
  MapAnythingDoubleBehaviorClass,
  MapAnythingEvalRun,
  MapAnythingVariantKey,
  UncertaintyDeclaration,
} from "./model";

/* ------------------------------------------------------------------ */
/* The outcome                                                          */
/* ------------------------------------------------------------------ */

/** The uncertainty characteristics one run's outcome carries (the §HF-1 exit gate). */
export interface MapAnythingOutcomeUncertainty {
  /** The corpus's declared expectation (answer-sigma or refusal-bound). */
  readonly expected: UncertaintyDeclaration | null;
  /** The sigma the double's ANSWER declared (outputs.uncertaintySigmaM; null for refusals). */
  readonly declaredSigmaM: number | null;
  /** The bounded lower-bound sigma the degraded-evidence refusal cited (null otherwise). */
  readonly refusalBoundSigmaM: number | null;
  /**
   * True iff the run's declared uncertainty characteristics match the lane's
   * expectation for THIS variant: the registered candidate must declare the
   * per-answer sigma (or cite the refusal bound); the reference path honestly
   * declares NO per-answer uncertainty (its profiles' calibration is
   * none-declared) — recorded as the reference-path characteristic, never
   * fabricated.
   */
  readonly surfaced: boolean;
}

/**
 * The explicit non-ready/fallback state of a failed invocation: the typed
 * closed-vocabulary failure carries NO outputs (never fabricated geometry)
 * and declares the deterministic reference path as the fallback.
 */
export interface MapAnythingFallbackState {
  readonly nonReady: boolean;
  readonly declaredFallback: string;
  /** True iff the failure detail surfaced the non-ready state + the declared fallback. */
  readonly surfaced: boolean;
}

/** The full deterministic outcome of ONE MapAnything benchmark run. */
export interface MapAnythingEvalOutcome {
  readonly runId: string;
  readonly taskId: string;
  readonly variant: MapAnythingVariantKey;
  readonly matrixCell: MapAnythingBehaviorMatrixCell;
  readonly behaviorClass: MapAnythingDoubleBehaviorClass;
  readonly taskKind: string;
  /** The Layer-1 outcome (verdict, record, manifest, observations — PROD-027's semantics). */
  readonly layer1: ScenarioEvaluation;
  /** True iff the Layer-1 verdict equals the corpus's expected verdict. */
  readonly verdictMatch: boolean;
  /** True iff the observed failure kind equals the corpus's expected failure kind. */
  readonly failureKindMatch: boolean;
  readonly uncertainty: MapAnythingOutcomeUncertainty;
  /** Present iff the run is a failed invocation (the typed failure + explicit fallback). */
  readonly fallbackState: MapAnythingFallbackState | null;
  /** The immutable field-evidence revisions the answer binds to. */
  readonly evidenceRevisions: readonly string[];
  /** The derived reconstruction version of this evaluation (ordinal 1 for a first execution). */
  readonly derivedVersionId: string;
  /**
   * Every expectation matched: the verdict, the failure kind, the
   * uncertainty surfacing and (when required) the fallback state.
   */
  readonly expectedMatch: boolean;
}

/* ------------------------------------------------------------------ */
/* The registry log (the control-plane consumption seam)                 */
/* ------------------------------------------------------------------ */

/**
 * Builds the registry log ONE run consumes: the variant's profile
 * REGISTERED + its evaluation STARTED (exactly what a real MapAnything
 * adapter's executions would be resolved against — the Layer-1 harness
 * replays the log to resolve the profile, never trusting an inline
 * profile).
 */
export function mapAnythingRegistryLogFor(run: MapAnythingEvalRun): ProviderRegistryEvent[] {
  const profile = mapAnythingProfileForVariant(run.variant);
  return [
    { kind: "provider-registered", profile },
    {
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* The entry point                                                      */
/* ------------------------------------------------------------------ */

/**
 * Evaluates ONE benchmark run (deterministic): the double executes → the
 * Layer-1 harness evaluates (profile resolution by replay, normalization,
 * canonical comparison via the EXISTING benchmark metrics, record + manifest
 * emission) → the lane's metadata assertions are evaluated.
 *
 * Throws {@link MapAnythingEvalError} for CALLER/wiring bugs only (an
 * invalid corpus run, a Layer-1 refusal over a committed scenario). Every
 * PROVIDER-side outcome — refusals, capture requirements, resource
 * exhaustion, unsupported tasks — is a first-class value in the returned
 * {@link MapAnythingEvalOutcome}.
 */
export function evaluateMapAnythingRun(
  run: MapAnythingEvalRun,
  registryLog: readonly ProviderRegistryEvent[] = mapAnythingRegistryLogFor(run),
): MapAnythingEvalOutcome {
  /* 1. The committed scenario descriptor must validate (an authoring bug otherwise). */

  const descriptorValidation = validateRealityEvalScenarioDescriptor(run.scenario);
  if (!descriptorValidation.ok) {
    const issues = descriptorValidation.failures
      .map((failure) => `${failure.path}: ${failure.kind}: ${failure.detail}`)
      .join("; ");
    throw new MapAnythingEvalError(
      "invalid_corpus",
      `run '${run.runId}': the scenario descriptor failed the reality-eval validator: ${issues}`,
    );
  }

  /* 2. The deterministic double executes (the candidate or the reference path). */

  const profile = mapAnythingProfileForVariant(run.variant);
  const declaredExecution =
    run.variant === MAPANYTHING_PROVIDER_ID
      ? executeMapAnythingDouble(profile, run.scenario.input)
      : executeFixtureProvider(profile, run.scenario.input);

  /* 3. The Layer-1 evaluation (PROD-027's harness — the imported authority). */

  const scenario = completeScenario(run.scenario, declaredExecution);
  const outcome = evaluateScenario(scenario, registryLog);
  if (!outcome.ok) {
    throw new MapAnythingEvalError(
      "layer1_refused",
      `run '${run.runId}' was refused by the Layer-1 harness (${outcome.refusal.kind}): ` +
        `${outcome.refusal.detail}`,
    );
  }
  const layer1 = outcome.evaluation;

  /* 4. The lane's metadata assertions. */

  const verdictMatch = layer1.verdict === run.task.expectedVerdict;
  const observedKind = layer1.normalizedResult.failure?.kind ?? null;
  const expectedKind = run.task.expectedFailureKind;
  const failureKindMatch =
    expectedKind === "none" ? observedKind === null : observedKind === expectedKind;

  const declaredSigmaM =
    layer1.normalizedResult.status === "ok" &&
    typeof layer1.normalizedResult.outputs?.["uncertaintySigmaM"] === "number"
      ? (layer1.normalizedResult.outputs["uncertaintySigmaM"] as number)
      : null;
  const expectedUncertainty = run.task.uncertainty;
  const refusalDetail =
    layer1.normalizedResult.status === "failed" && layer1.normalizedResult.failure !== undefined
      ? layer1.normalizedResult.failure.detail
      : "";
  const refusalBoundSigmaM =
    expectedUncertainty !== null &&
    expectedUncertainty.role === "refusal-bound" &&
    refusalDetail.includes(`sigma >= ${expectedUncertainty.sigmaM}`)
      ? expectedUncertainty.sigmaM
      : null;
  const uncertainty: MapAnythingOutcomeUncertainty = {
    expected: expectedUncertainty,
    declaredSigmaM,
    refusalBoundSigmaM,
    surfaced:
      run.variant === MAPANYTHING_PROVIDER_ID
        ? expectedUncertainty === null
          ? declaredSigmaM === null
          : expectedUncertainty.role === "answer-sigma"
            ? declaredSigmaM === expectedUncertainty.sigmaM
            : refusalBoundSigmaM !== null
        : declaredSigmaM === null,
  };

  const expectedFallback = run.task.expectedFallback;
  const fallbackState: MapAnythingFallbackState | null =
    run.task.matrixCell === "failed-invocation" && layer1.normalizedResult.status === "failed"
      ? {
          nonReady: true,
          declaredFallback: expectedFallback ?? "",
          surfaced:
            refusalDetail.includes("non-ready") &&
            (expectedFallback === undefined || refusalDetail.includes(expectedFallback)),
        }
      : null;

  const derivedVersionId = derivedReconstructionVersionIdOf({
    runId: run.runId,
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
    inputDigest: layer1.record.reproduction.inputsDigest,
    ordinal: 1,
  });

  const expectedMatch =
    verdictMatch &&
    failureKindMatch &&
    uncertainty.surfaced &&
    (fallbackState === null || fallbackState.surfaced);

  return {
    runId: run.runId,
    taskId: run.taskId,
    variant: run.variant,
    matrixCell: run.task.matrixCell,
    behaviorClass: run.task.behaviorClass,
    taskKind: run.task.taskKind,
    layer1,
    verdictMatch,
    failureKindMatch,
    uncertainty,
    fallbackState,
    evidenceRevisions: [...run.task.evidence.evidenceRevisions],
    derivedVersionId,
    expectedMatch,
  };
}

/** Runs the full committed run corpus (12 runs — every task × its variants, committed order). */
export function evaluateMapAnythingRunCorpus(
  runs?: readonly MapAnythingEvalRun[],
): readonly MapAnythingEvalOutcome[] {
  const list = runs ?? mapAnythingEvalRuns();
  return list.map((run) => evaluateMapAnythingRun(run, mapAnythingRegistryLogFor(run)));
}
