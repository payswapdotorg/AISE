/**
 * HFX-201 — the CONTROL-PLANE REGISTRY WIRING of the VLM benchmark.
 *
 * Drives BOTH registered Qwen3-VL candidate profiles through the REAL
 * HFX-000 control plane (imported, never modified):
 *
 *   registration (both profiles, separate entries — distinct provider ids
 *   and technology versions, same family) → evaluation-started →
 *   execution-normalized (every one of the 24 corpus runs) →
 *   benchmark-recorded (ONE consolidated content-addressed
 *   `BenchmarkRecord` per variant, validated by `validateBenchmarkRecord`,
 *   carrying provider identity, technology version, the declared resource
 *   profile and the aggregated input digest) → provenance-sealed (ONE
 *   portable `ProvenanceManifest` per variant, sealed +
 *   `verifyProvenanceManifest`-verifiable) → promotion REQUESTED and
 *   REFUSED by the license/use gate (both candidates are evaluation-only:
 *   upstream license terms are not verified as clearing production use —
 *   the refusal is recorded in the append-only log, never silent).
 *
 * The lifecycle is REPLAYABLE: `replayRegistry(events)` re-derives the
 * identical registry state (the event-sourcing proof — asserted here and
 * by the co-located tests). No promotion is admitted: the provider lane
 * never becomes a readiness authority.
 *
 * DETERMINISM: pure computation — no clock (the log order IS the time), no
 * randomness, no I/O. The same construction is byte-identical.
 */

import {
  applyRegistryEvent,
  benchmarkComparabilityKey,
  createProviderRegistry,
  replayRegistry,
  requestPromotion,
  sealProvenanceManifest,
  validateBenchmarkRecord,
  verifyProvenanceManifest,
} from "@aise/provider-registry";
import type {
  BenchmarkRecord,
  EnvironmentFingerprint,
  ProviderProfile,
  ProviderRegistry,
  ProviderRegistryEvent,
  PromotionRefusal,
} from "@aise/provider-registry";
import { canonicalDigestOf, canonicalJsonText } from "../reasoning-eval/model";
import { evaluateVlmScenario } from "./harness";
import type { VlmEvalOutcome } from "./harness";
import {
  QWEN3_VL_VARIANTS,
  VLM_EVAL_BENCHMARK_ID,
  VLM_EVAL_CAPABILITY,
  VLM_EVAL_CODE_VERSION,
  qwen3VlVariantIdentity,
  validatedQwen3VlProfile,
} from "./model";
import type { VlmVariantKey } from "./model";
import { vlmEvalRuns } from "./corpus";
import { compareVlmVariants, vlmVariantSummaryOf } from "./compare";
import type { VlmVariantComparison, VlmVariantRunSummary } from "./compare";

/* ------------------------------------------------------------------ */
/* Constants (declared, never sensed)                                   */
/* ------------------------------------------------------------------ */

/** The DECLARED environment fingerprint of every sealed manifest (never sensed). */
export const VLM_EVAL_ENVIRONMENT: EnvironmentFingerprint = {
  declaredRuntime: "bun",
  declaredPlatform: "aise-hfx201-vlm-provider-benchmark",
  codeVersion: VLM_EVAL_CODE_VERSION,
  statement:
    "declared, not sensed — the benchmark harness never reads the runtime environment " +
    "(determinism contract: identical corpus + registry log produce identical artifacts)",
};

/** The AISE-side consumer identity of the benchmark's provenance manifests. */
export const VLM_EVAL_CONSUMER = {
  consumer: "AISE",
  surface: "hfx-201-vlm-provider-benchmark",
} as const;

/* ------------------------------------------------------------------ */
/* The consolidated variant record                                       */
/* ------------------------------------------------------------------ */

/**
 * Consolidates ONE variant's corpus outcomes into the SINGLE
 * content-addressed control-plane benchmark record the registry consumes:
 * per-scenario metrics with subject ids, the closed-vocabulary failure
 * observations (Layer-2 classifications + integrity violations + the
 * deterministic grounded-check observations), the DECLARED resource
 * observations (from the registered profile's latency/memory envelope —
 * declared metadata, never sensed) and the deterministic reproduction
 * statement (the aggregated input digest + the code version).
 */
export function consolidatedVariantRecord(
  variant: VlmVariantKey,
  outcomes: readonly VlmEvalOutcome[],
): BenchmarkRecord {
  const identity = qwen3VlVariantIdentity(variant);
  const { profile } = validatedQwen3VlProfile(variant);
  const mine = outcomes.filter((outcome) => outcome.variant === variant);
  const body = {
    kind: "provider-benchmark-record" as const,
    schemaVersion: "provider-benchmark/1" as const,
    providerId: identity.providerId,
    technologyVersion: identity.technologyVersion,
    benchmarkId: VLM_EVAL_BENCHMARK_ID,
    capability: VLM_EVAL_CAPABILITY,
    metrics: [
      {
        metric: "scenario_count",
        value: mine.length,
        unit: "count",
        detail:
          "the multimodal corpus scenario count the variant executed (image, video, OCR and " +
          "spatial-reference bundles — the same corpus for both variants)",
      },
      {
        metric: "classification_match",
        value: mine.length === 0 ? 0 : mine.filter((o) => o.layer2.fieldMatches.classification).length / mine.length,
        unit: "ratio",
        detail:
          "the Layer-2 five-way discrimination classifications that equal the expected ground truth " +
          "(per-scenario subject ids)",
        ...(mine.length === 0 ? {} : { subjectId: `${variant}-corpus` }),
      },
      {
        metric: "expected_outcome_match",
        value: mine.length === 0 ? 0 : mine.filter((o) => o.expectedMatch).length / mine.length,
        unit: "ratio",
        detail:
          "runs whose canonical envelope, grounded checks and revision binding all matched the golden",
        ...(mine.length === 0 ? {} : { subjectId: `${variant}-corpus` }),
      },
      {
        metric: "grounded_check_failure_observations",
        value: mine.reduce((sum, outcome) => sum + outcome.grounded.observations.length, 0),
        unit: "count",
        detail:
          "closed-vocabulary failure observations emitted by the deterministic grounded-reasoning checks " +
          "(fact derivability, spatial resolution, field recomputation, conflict detection)",
        subjectId: `${variant}-corpus`,
      },
      {
        metric: "measurement_uncertainty_propagated",
        value: mine.filter((outcome) => outcome.layer2.envelope.measurementUncertainty.length > 0).length,
        unit: "count",
        detail:
          "runs whose canonical envelope carried measurement uncertainty propagated VERBATIM from cited " +
          "evidence (never provider-fabricated)",
        subjectId: `${variant}-corpus`,
      },
      {
        metric: "behavior_matrix_cells_passed",
        value: vlmVariantSummaryOf(variant, outcomes).behaviorMatrixCellsPassed.length,
        unit: "count",
        detail:
          "behavior-matrix cells (grounded-pass, missing-evidence, conflicting-evidence, unsupported-question) " +
          "with at least one conforming run",
        subjectId: `${variant}-corpus`,
      },
    ],
    failureObservations: mine.flatMap((outcome) => [
      ...(outcome.layer2.classification === "none"
        ? []
        : [
            {
              kind: outcome.layer2.classification,
              detail: `${outcome.scenarioId}: the observed Layer-2 classification (the five-way discrimination join)`,
            },
          ]),
      ...outcome.layer2.violations.map((violation) => ({
        kind: violation.kind,
        detail: `${outcome.scenarioId} ${violation.rule}: ${violation.detail}`,
      })),
      ...outcome.grounded.observations.map((observation) => ({
        kind: observation.kind,
        detail: `${outcome.scenarioId} ${observation.check}: ${observation.detail}`,
      })),
    ]),
    resourceObservations: {
      compute: `declared-profile:${profile.computeProfile.accelerator}/deterministic-double-execution`,
      memoryMiB: profile.memoryProfile.recommendedMiB,
      latencyMsP50: profile.latencyProfile.expectedMsP50,
      latencyMsP95: profile.latencyProfile.expectedMsP95,
    },
    reproduction: {
      inputsDigest: canonicalDigestOf(mine.map((outcome) => outcome.layer2.inputDigest)),
      codeVersion: VLM_EVAL_CODE_VERSION,
      statement:
        "deterministic reproduction: the variant's scenario input digests (aggregated digest above) through " +
        "the committed fixture doubles at code version (above) always yield these metrics — no clock, no " +
        "randomness, no network",
    },
  };
  const validated = validateBenchmarkRecord(body);
  if (!validated.ok) {
    const issues = validated.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new Error(`vlm benchmark: the consolidated record for '${variant}' failed validation: ${issues}`);
  }
  return validated.record;
}

/* ------------------------------------------------------------------ */
/* The lifecycle                                                         */
/* ------------------------------------------------------------------ */

/** One variant's benchmark lifecycle projection. */
export interface VlmVariantLifecycle {
  readonly variant: VlmVariantKey;
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly profileDigest: string;
  readonly licenseStatus: string;
  readonly outcomes: readonly VlmEvalOutcome[];
  readonly summary: VlmVariantRunSummary;
  readonly consolidatedRecord: BenchmarkRecord;
  readonly provenanceManifest: import("@aise/provider-registry").ProvenanceManifest;
  readonly comparabilityKey: string;
  readonly registryState: string;
  readonly promotionRefusals: readonly PromotionRefusal[];
}

/** The full benchmark lifecycle result (both variants + the comparison + the replay proof). */
export interface VlmBenchmarkLifecycleResult {
  /** The append-only event log (registration → evaluation → executions → benchmarks → provenance → promotion decisions). */
  readonly events: readonly ProviderRegistryEvent[];
  readonly registry: ProviderRegistry;
  readonly outcomes: readonly VlmEvalOutcome[];
  readonly variants: readonly VlmVariantLifecycle[];
  readonly comparison: VlmVariantComparison;
  /** replayRegistry(events) reproduces the identical derived entries (the event-sourcing proof). */
  readonly replayEqual: boolean;
}

/**
 * Runs the FULL benchmark lifecycle deterministically: registers both
 * Qwen3-VL candidate profiles as separate entries, evaluates every corpus
 * run for both variants, records the consolidated benchmark records,
 * seals the portable provenance manifests, requests promotion (REFUSED by
 * the license/use gate — the candidates are evaluation-only) and proves
 * the registry replays identically.
 */
export function runVlmBenchmarkLifecycle(): VlmBenchmarkLifecycleResult {
  let registry = createProviderRegistry();
  const events: ProviderRegistryEvent[] = [];
  const apply = (event: ProviderRegistryEvent): void => {
    const result = applyRegistryEvent(registry, event);
    if (!result.ok) {
      throw new Error(`vlm benchmark lifecycle: event '${event.kind}' was refused: ${result.failure.detail}`);
    }
    registry = result.registry;
    events.push(event);
  };

  // Phase 1 — registration + evaluation start (both profiles, separate entries).
  const profiles = new Map<VlmVariantKey, ProviderProfile>();
  for (const variant of QWEN3_VL_VARIANTS) {
    const { profile } = validatedQwen3VlProfile(variant);
    profiles.set(variant, profile);
    apply({ kind: "provider-registered", profile });
    apply({
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
  }

  // Phase 2 — every normalized execution while the entries are in the
  // evaluation state (the lawful-transition table requires this order).
  const runs = vlmEvalRuns();
  const outcomes = runs.map((scenario) => evaluateVlmScenario(scenario));
  for (const outcome of outcomes) {
    const profile = profiles.get(outcome.variant);
    if (profile === undefined) {
      throw new Error(`vlm benchmark lifecycle: no profile for variant '${outcome.variant}'`);
    }
    apply({
      kind: "execution-normalized",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      execution: {
        capability: outcome.layer2.capability,
        inputDigest: outcome.layer2.inputDigest,
        normalizedResultDigest: outcome.layer2.normalizedResultDigest,
      },
    });
  }

  // Phase 3 — the consolidated benchmark record + the sealed provenance
  // manifest per variant (benchmark intake moves the entry to
  // 'benchmarked'; provenance seals against the profile digest).
  const variantLifecycles: VlmVariantLifecycle[] = [];
  const comparisonInputs: {
    variant: VlmVariantKey;
    providerId: string;
    technologyVersion: string;
    profileDigest: string;
    benchmarkRecordId: string;
    provenanceManifestId: string;
    outcomes: readonly VlmEvalOutcome[];
  }[] = [];
  for (const variant of QWEN3_VL_VARIANTS) {
    const profile = profiles.get(variant);
    if (profile === undefined) {
      throw new Error(`vlm benchmark lifecycle: no profile for variant '${variant}'`);
    }
    const { profileDigest } = validatedQwen3VlProfile(variant);
    const mine = outcomes.filter((outcome) => outcome.variant === variant);
    const record = consolidatedVariantRecord(variant, outcomes);
    apply({ kind: "benchmark-recorded", record });
    const manifest = sealProvenanceManifest({
      profile,
      inputDigests: mine.map((outcome) => outcome.layer2.inputDigest),
      normalizedResultDigest: canonicalDigestOf(
        mine.map((outcome) => outcome.layer2.normalizedResultDigest),
      ),
      benchmarkRecords: [record],
      environment: VLM_EVAL_ENVIRONMENT,
      consumer: VLM_EVAL_CONSUMER,
      reproducibilityStatement:
        "HFX-201 VLM provider benchmark: the registered candidate profile (digest above), the variant's " +
        "scenario input digests, the normalized result digests and the consolidated benchmark record " +
        "(digest above) fully determine this evaluation — identical inputs reproduce the identical manifest. " +
        "The evaluated execution is a deterministic in-repo double standing in for the model (no live model, " +
        "no network); the candidate is evaluation-only (upstream license terms not verified).",
    });
    const manifestCheck = verifyProvenanceManifest(manifest);
    if (!manifestCheck.ok) {
      const issues = manifestCheck.failures
        .map((failure) => `${failure.path}: ${failure.detail}`)
        .join("; ");
      throw new Error(`vlm benchmark lifecycle: the sealed manifest failed verification: ${issues}`);
    }
    apply({ kind: "provenance-sealed", manifest });

    // Phase 4 — promotion requested: the license/use gate REFUSES (the
    // candidates are evaluation-only) and the refusal is RECORDED in the
    // append-only log — never silent.
    const promotion = requestPromotion(
      registry,
      profile.providerId,
      profile.technologyVersion,
    );
    if (!promotion.ok) {
      throw new Error(`vlm benchmark lifecycle: the promotion request was refused: ${promotion.failure.detail}`);
    }
    registry = promotion.registry;
    const decision = promotion.registry.events[promotion.registry.events.length - 1];
    if (decision === undefined || decision.kind !== "promotion-decided") {
      throw new Error("vlm benchmark lifecycle: the promotion decision event is missing");
    }
    events.push(decision);
    const entry = registry.entryOf(profile.providerId, profile.technologyVersion);
    if (entry === undefined) {
      throw new Error("vlm benchmark lifecycle: the entry disappeared after the promotion decision");
    }
    if (entry.state !== "rejected") {
      throw new Error(
        `vlm benchmark lifecycle: the evaluation-only candidate must end REJECTED (got '${entry.state}')`,
      );
    }
    const licenseRefusals = (entry.promotionDecision?.refusals ?? []).filter(
      (refusal) => refusal.kind === "license-blocked",
    );
    if (licenseRefusals.length === 0) {
      throw new Error(
        "vlm benchmark lifecycle: the rejection must carry the typed license-blocked refusal",
      );
    }

    variantLifecycles.push({
      variant,
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      profileDigest,
      licenseStatus: "evaluation-only",
      outcomes: mine,
      summary: vlmVariantSummaryOf(variant, outcomes),
      consolidatedRecord: record,
      provenanceManifest: manifest,
      comparabilityKey: benchmarkComparabilityKey(record),
      registryState: entry.state,
      promotionRefusals: entry.promotionDecision?.refusals ?? [],
    });
    comparisonInputs.push({
      variant,
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      profileDigest,
      benchmarkRecordId: record.recordId,
      provenanceManifestId: manifest.manifestId,
      outcomes: mine,
    });
  }

  // The event-sourcing proof: replaying the log re-derives the identical
  // registry state (every gate re-evaluated during replay).
  const replay = replayRegistry(events);
  if (!replay.ok) {
    throw new Error(`vlm benchmark lifecycle: replay refused: ${replay.failure.detail}`);
  }
  const replayEqual = canonicalJsonText(
    registry.entries.map((entry) => ({
      providerId: entry.providerId,
      technologyVersion: entry.technologyVersion,
      state: entry.state,
      benchmarkRecordIds: entry.benchmarkRecords.map((record) => record.recordId),
      provenanceManifestIds: entry.provenanceManifests.map((manifest) => manifest.manifestId),
    })),
  ) === canonicalJsonText(
    replay.registry.entries.map((entry) => ({
      providerId: entry.providerId,
      technologyVersion: entry.technologyVersion,
      state: entry.state,
      benchmarkRecordIds: entry.benchmarkRecords.map((record) => record.recordId),
      provenanceManifestIds: entry.provenanceManifests.map((manifest) => manifest.manifestId),
    })),
  );

  return {
    events,
    registry,
    outcomes,
    variants: variantLifecycles,
    comparison: compareVlmVariants(comparisonInputs),
    replayEqual,
  };
}
