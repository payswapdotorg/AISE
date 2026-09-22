/**
 * HFX-101 — the CONTROL-PLANE REGISTRY WIRING of the MapAnything benchmark.
 *
 * Drives the registered MapAnything candidate AND the two existing
 * deterministic reference-path providers (imported from the reality-eval
 * testkit — never modified) through the REAL HFX-000 control plane
 * (imported, never modified):
 *
 *   registration (three separate entries: the MapAnything candidate, the
 *   reference reconstruction provider, the reference depth provider) →
 *   evaluation-started → execution-normalized (every one of the 12 corpus
 *   runs) + provenance-sealed (every per-run manifest) → ONE consolidated
 *   content-addressed `BenchmarkRecord` per provider entry (validated by
 *   `validateBenchmarkRecord`, carrying provider identity, technology
 *   version, the declared resource profile and the aggregated input
 *   digest) → the consolidated provenance manifests (sealed +
 *   `verifyProvenanceManifest`-verifiable) → promotion REQUESTED for the
 *   MapAnything candidate and REFUSED by the license/use gate (the
 *   candidate is evaluation-only: upstream license terms are not verified
 *   as clearing production use — the refusal is recorded in the
 *   append-only log, never silent) → the REPLAY PROOF.
 *
 * COMPARABILITY (the work order's requirement): every per-run record AND
 * every consolidated record carries the SAME pinned Layer-1 benchmark ids
 * as the existing deterministic/reference path (`reality-eval-reconstruction/1`
 * + `reality-eval-depth/1`, one per capability lane), so the records join
 * the reference path's records on the control plane's
 * `benchmarkComparabilityKey` — a future real-model run slots into the
 * same table without any schema change.
 *
 * REGISTRY INTAKE DISCIPLINE (the control plane's own rule): the registry
 * models ONE benchmark-record intake per provider lifecycle (evaluation →
 * benchmarked, single-shot). The MapAnything entry's intake is the
 * RECONSTRUCTION-lane consolidated record (the primary lane of the
 * universal-reconstruction candidate); the DEPTH-lane consolidated record
 * is emitted, validated and sealed into the registry through its own
 * consolidated manifest (a lawful provenance-sealed event from the
 * benchmarked state) — an INTAKE CANDIDATE for the control plane's
 * governed intake flow, exactly like the reality-eval suite's per-scenario
 * records. The reference entries' intakes are their single-lane records.
 *
 * NO PROMOTION is admitted: the candidate is evaluation-only and the gate
 * refuses with the typed `license-blocked` refusal; the reference entries
 * are NOT this lane's candidates — no promotion decision is requested for
 * them here (the control plane owns that decision).
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
import { evaluateMapAnythingRun } from "./harness";
import type { MapAnythingEvalOutcome } from "./harness";
import { mapAnythingEvalRuns } from "./corpus";
import { compareMapAnythingLanes } from "./compare";
import type { MapAnythingLaneComparison } from "./compare";
import {
  MAPANYTHING_EVAL_CODE_VERSION,
  MAPANYTHING_EVAL_VARIANTS,
  MAPANYTHING_PROVIDER_ID,
  MapAnythingEvalError,
  canonicalDigestOf,
  mapAnythingProfileForVariant,
  validatedProfileForVariant,
} from "./model";
import type { MapAnythingVariantKey } from "./model";

/* ------------------------------------------------------------------ */
/* Constants (declared, never sensed)                                   */
/* ------------------------------------------------------------------ */

/** The DECLARED environment fingerprint of every sealed manifest (never sensed). */
export const MAPANYTHING_EVAL_ENVIRONMENT: EnvironmentFingerprint = {
  declaredRuntime: "bun",
  declaredPlatform: "aise-hfx101-mapanything-provider-benchmark",
  codeVersion: MAPANYTHING_EVAL_CODE_VERSION,
  statement:
    "declared, not sensed — the benchmark harness never reads the runtime environment " +
    "(determinism contract: identical corpus + registry log produce identical artifacts)",
};

/** The AISE-side consumer identity of the benchmark's provenance manifests. */
export const MAPANYTHING_EVAL_CONSUMER = {
  consumer: "AISE",
  surface: "hfx-101-mapanything-provider-benchmark",
} as const;

/* ------------------------------------------------------------------ */
/* The consolidated lane records                                         */
/* ------------------------------------------------------------------ */

/**
 * The lane a consolidated record covers (one pinned Layer-1 capability
 * lane — the comparability join).
 */
export type MapAnythingLane = "reconstruction" | "depth";

/** The lane of a run's capability. */
function laneOfCapability(capability: string): MapAnythingLane {
  if (capability !== "reconstruction" && capability !== "depth") {
    throw new MapAnythingEvalError(
      "invalid_corpus",
      `unknown Layer-1 capability lane '${capability}' — the benchmark runs on the reconstruction and depth lanes`,
    );
  }
  return capability;
}

/**
 * Consolidates ONE variant's outcomes over ONE lane into the SINGLE
 * content-addressed control-plane benchmark record the comparison joins:
 * the summary metrics, the per-instance canonical metric values of every
 * grounded content run (subject ids prefixed by the run id — comparable
 * rows across providers of the same lane), the closed-vocabulary failure
 * observations of the refusal runs, the DECLARED resource observations
 * (from the registered profile's latency/memory envelope — declared
 * metadata, never sensed) and the deterministic reproduction statement
 * (the aggregated input digest + the code version).
 */
export function consolidatedLaneRecord(
  variant: MapAnythingVariantKey,
  lane: MapAnythingLane,
  outcomes: readonly MapAnythingEvalOutcome[],
): BenchmarkRecord {
  const profile = mapAnythingProfileForVariant(variant);
  const mine = outcomes.filter(
    (outcome) => outcome.variant === variant && laneOfCapability(outcome.layer1.record.capability) === lane,
  );
  if (mine.length === 0) {
    throw new MapAnythingEvalError(
      "invalid_corpus",
      `variant '${variant}' has no outcomes on the '${lane}' lane — a consolidated record is never silent`,
    );
  }
  const content = mine.filter((outcome) => outcome.layer1.normalizedResult.status === "ok");
  const refusal = mine.filter((outcome) => outcome.layer1.normalizedResult.status === "failed");

  const summaryMetrics = [
    {
      metric: "run_count",
      value: mine.length,
      unit: "count",
      subjectId: `${variant}-${lane}-corpus`,
      detail:
        `the ${lane}-lane corpus runs of provider '${profile.providerId}' ` +
        `(${profile.technologyVersion}) over the committed benchmark suite`,
    },
    {
      metric: "expected_outcome_match",
      value: mine.filter((outcome) => outcome.expectedMatch).length / mine.length,
      unit: "ratio",
      subjectId: `${variant}-${lane}-corpus`,
      detail:
        "runs whose Layer-1 verdict, expected failure kind, uncertainty and (when required) fallback " +
        "state all matched the corpus's declared expectation",
    },
    {
      metric: "grounded_content_runs",
      value: content.length,
      unit: "count",
      subjectId: `${variant}-${lane}-corpus`,
      detail: "runs that answered contract-validated content (geometry/depth) comparable to the canonical expectation",
    },
    {
      metric: "explicit_refusal_runs",
      value: refusal.length,
      unit: "count",
      subjectId: `${variant}-${lane}-corpus`,
      detail:
        "runs that answered an explicit closed-vocabulary refusal (capture requirement / resource " +
        "exhaustion / unsupported task) — never fabricated geometry",
    },
  ];
  if (variant === MAPANYTHING_PROVIDER_ID) {
    const cells = ["grounded-pass", "degraded-evidence", "failed-invocation", "unsupported-task-combination"];
    summaryMetrics.push({
      metric: "behavior_matrix_cells_passed",
      value: cells.filter(
        (cell) => mine.some((outcome) => outcome.matrixCell === cell && outcome.expectedMatch),
      ).length,
      unit: "count",
      subjectId: `${variant}-${lane}-corpus`,
      detail:
        "the lane's mandated behavior-matrix cells (grounded-pass, degraded-evidence, failed-invocation, " +
        "unsupported-task-combination) with at least one conforming run",
    });
  }

  const instanceMetrics = content.flatMap((outcome) =>
    outcome.layer1.record.metrics
      .filter((metric) => metric.metric !== "criteria_satisfied")
      .map((metric) => ({
        metric: metric.metric,
        value: metric.value,
        unit: metric.unit,
        subjectId: `${outcome.runId}/${metric.subjectId ?? "subject"}`,
        detail: metric.detail,
      })),
  );

  const failureObservations = refusal.flatMap((outcome) =>
    outcome.layer1.failureObservations.map((observation) => ({
      kind: observation.kind,
      detail: `${outcome.runId}: ${observation.detail}`,
    })),
  );

  const body = {
    kind: "provider-benchmark-record" as const,
    schemaVersion: "provider-benchmark/1" as const,
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
    benchmarkId:
      lane === "reconstruction" ? "reality-eval-reconstruction/1" : "reality-eval-depth/1",
    capability: lane,
    metrics: [...summaryMetrics, ...instanceMetrics],
    failureObservations,
    resourceObservations: {
      compute: `declared-profile:${profile.computeProfile.accelerator}/deterministic-double-execution`,
      memoryMiB: profile.memoryProfile.recommendedMiB,
      latencyMsP50: profile.latencyProfile.expectedMsP50,
      latencyMsP95: profile.latencyProfile.expectedMsP95,
    },
    reproduction: {
      inputsDigest: canonicalDigestOf(mine.map((outcome) => outcome.layer1.record.reproduction.inputsDigest)),
      codeVersion: MAPANYTHING_EVAL_CODE_VERSION,
      statement:
        `deterministic reproduction: the ${lane}-lane corpus input digests of provider '${profile.providerId}' ` +
        `(${profile.technologyVersion}) — the aggregated digest above — through the committed fixture doubles ` +
        `at code version (above) always yield these metric values — no clock, no randomness, no network; the ` +
        `benchmark executes deterministic in-repo doubles standing in for the registered candidate`,
    },
  };
  const validated = validateBenchmarkRecord(body);
  if (!validated.ok) {
    const issues = validated.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new MapAnythingEvalError(
      "invalid_corpus",
      `the consolidated ${lane}-lane record for '${variant}' failed control-plane validation: ${issues}`,
    );
  }
  return validated.record;
}

/* ------------------------------------------------------------------ */
/* The lifecycle                                                         */
/* ------------------------------------------------------------------ */

/** One variant's benchmark lifecycle projection (per provider entry). */
export interface MapAnythingVariantLifecycle {
  readonly variant: MapAnythingVariantKey;
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly profileDigest: string;
  readonly licenseStatus: string;
  readonly lanes: readonly {
    readonly lane: MapAnythingLane;
    readonly runCount: number;
    readonly contentRuns: number;
    readonly refusalRuns: number;
    /** The consolidated content-addressed benchmark record (validated). */
    readonly consolidatedRecord: BenchmarkRecord;
    /** True iff the consolidated record is attached to the registry entry (the single-shot intake). */
    readonly registryAttached: boolean;
    /** The sealed provenance manifest chaining the consolidated record. */
    readonly consolidatedManifest: import("@aise/provider-registry").ProvenanceManifest;
    readonly comparabilityKey: string;
  }[];
  readonly registryState: string;
  /** Present iff a promotion decision was requested for this entry (the MapAnything candidate). */
  readonly promotionRefusals: readonly PromotionRefusal[];
}

/** The full benchmark lifecycle result (all runs + the comparison + the replay proof). */
export interface MapAnythingBenchmarkLifecycleResult {
  /** The append-only event log (registrations → evaluations → executions → intakes → manifests → the promotion decision). */
  readonly events: readonly ProviderRegistryEvent[];
  readonly registry: ProviderRegistry;
  readonly outcomes: readonly MapAnythingEvalOutcome[];
  readonly variants: readonly MapAnythingVariantLifecycle[];
  /** The per-lane provider comparison records (the MapAnything double vs the reference path, joined on the comparability key). */
  readonly comparisons: readonly MapAnythingLaneComparison[];
  /** replayRegistry(events) reproduces the identical derived entries (the event-sourcing proof). */
  readonly replayEqual: boolean;
}

/**
 * Runs the FULL benchmark lifecycle deterministically: registers the
 * MapAnything candidate and the two reference-path providers as separate
 * entries, evaluates every corpus run through the Layer-1 harness with the
 * shared registry log, appends the lawful lifecycle events (execution-
 * normalized + provenance-sealed per run), records the consolidated
 * benchmark records (the single-shot intake per entry), seals the
 * consolidated provenance manifests, requests promotion for the MapAnything
 * candidate (REFUSED by the license/use gate — recorded, never silent) and
 * proves the registry replays identically.
 */
export function runMapAnythingBenchmarkLifecycle(): MapAnythingBenchmarkLifecycleResult {
  let registry = createProviderRegistry();
  const events: ProviderRegistryEvent[] = [];
  const apply = (event: ProviderRegistryEvent): void => {
    const result = applyRegistryEvent(registry, event);
    if (!result.ok) {
      throw new MapAnythingEvalError(
        "invalid_corpus",
        `benchmark lifecycle: event '${event.kind}' was refused: ${result.failure.detail}`,
      );
    }
    registry = result.registry;
    events.push(event);
  };

  /* Phase 1 — registration + evaluation start (three separate entries). */

  const profiles = new Map<MapAnythingVariantKey, ProviderProfile>();
  for (const variant of MAPANYTHING_EVAL_VARIANTS) {
    const { profile } = validatedProfileForVariant(variant);
    profiles.set(variant, profile);
    apply({ kind: "provider-registered", profile });
  }
  for (const variant of MAPANYTHING_EVAL_VARIANTS) {
    const profile = profiles.get(variant);
    if (profile === undefined) {
      throw new MapAnythingEvalError("invalid_corpus", `lifecycle: no profile for variant '${variant}'`);
    }
    apply({
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
  }

  /* Phase 2 — every corpus run: evaluate → execution-normalized →
     provenance-sealed (the per-run manifest), in committed order. */

  const runs = mapAnythingEvalRuns();
  const outcomes = runs.map((run) => evaluateMapAnythingRun(run, events));
  for (const outcome of outcomes) {
    const profile = profiles.get(outcome.variant);
    if (profile === undefined) {
      throw new MapAnythingEvalError("invalid_corpus", `lifecycle: no profile for variant '${outcome.variant}'`);
    }
    apply({
      kind: "execution-normalized",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      execution: {
        capability: outcome.layer1.record.capability,
        inputDigest: outcome.layer1.record.reproduction.inputsDigest,
        normalizedResultDigest: outcome.layer1.manifest.normalizedResultDigest,
      },
    });
    apply({ kind: "provenance-sealed", manifest: outcome.layer1.manifest });
  }

  /* Phase 3 — the consolidated records (the single-shot intake per entry)
     + the consolidated manifests. The MapAnything entry's intake is the
     RECONSTRUCTION-lane record (the primary lane); its depth-lane record
     is sealed through its own consolidated manifest (an intake candidate —
     the registry's single-shot intake rule). */

  const variantLifecycles: MapAnythingVariantLifecycle[] = [];
  const comparisonInputs: {
    variant: MapAnythingVariantKey;
    lane: MapAnythingLane;
    providerId: string;
    technologyVersion: string;
    profileDigest: string;
    benchmarkRecordId: string;
    provenanceManifestId: string;
    outcomes: readonly MapAnythingEvalOutcome[];
  }[] = [];

  for (const variant of MAPANYTHING_EVAL_VARIANTS) {
    const profile = profiles.get(variant);
    if (profile === undefined) {
      throw new MapAnythingEvalError("invalid_corpus", `lifecycle: no profile for variant '${variant}'`);
    }
    const { profileDigest } = validatedProfileForVariant(variant);
    const lanes: MapAnythingVariantLifecycle["lanes"][number][] = [];
    const variantOutcomes = outcomes.filter((outcome) => outcome.variant === variant);
    const laneList: MapAnythingLane[] =
      variant === MAPANYTHING_PROVIDER_ID
        ? ["reconstruction", "depth"]
        : variant === "reference-reconstruction"
          ? ["reconstruction"]
          : ["depth"];
    for (const lane of laneList) {
      const record = consolidatedLaneRecord(variant, lane, outcomes);
      const mine = variantOutcomes.filter(
        (outcome) => laneOfCapability(outcome.layer1.record.capability) === lane,
      );
      // The single-shot registry intake: the MapAnything entry's intake is
      // the reconstruction-lane record; the reference entries' intakes are
      // their single-lane records.
      const registryAttached =
        variant === MAPANYTHING_PROVIDER_ID ? lane === "reconstruction" : true;
      if (registryAttached) {
        apply({ kind: "benchmark-recorded", record });
      }
      const manifest = sealProvenanceManifest({
        profile,
        inputDigests: mine.map((outcome) => outcome.layer1.record.reproduction.inputsDigest),
        normalizedResultDigest: canonicalDigestOf(
          mine.map((outcome) => outcome.layer1.manifest.normalizedResultDigest),
        ),
        benchmarkRecords: [record],
        environment: MAPANYTHING_EVAL_ENVIRONMENT,
        consumer: MAPANYTHING_EVAL_CONSUMER,
        reproducibilityStatement:
          `HFX-101 MapAnything provider benchmark (${lane} lane): the registered profile (digest above), the ` +
          `lane's corpus input digests, the normalized result digests and the consolidated benchmark record ` +
          `(digest above) fully determine this evaluation — identical inputs reproduce the identical manifest. ` +
          `The evaluated execution is a deterministic in-repo double standing in for the registered candidate ` +
          `(no live model, no network); the candidate is evaluation-only (upstream license terms not verified).`,
      });
      const manifestCheck = verifyProvenanceManifest(manifest);
      if (!manifestCheck.ok) {
        const issues = manifestCheck.failures
          .map((failure) => `${failure.path}: ${failure.detail}`)
          .join("; ");
        throw new MapAnythingEvalError(
          "invalid_corpus",
          `benchmark lifecycle: the consolidated ${lane}-lane manifest for '${variant}' failed verification: ${issues}`,
        );
      }
      apply({ kind: "provenance-sealed", manifest });
      lanes.push({
        lane,
        runCount: mine.length,
        contentRuns: mine.filter((outcome) => outcome.layer1.normalizedResult.status === "ok").length,
        refusalRuns: mine.filter((outcome) => outcome.layer1.normalizedResult.status === "failed").length,
        consolidatedRecord: record,
        registryAttached,
        consolidatedManifest: manifest,
        comparabilityKey: benchmarkComparabilityKey(record),
      });
      comparisonInputs.push({
        variant,
        lane,
        providerId: profile.providerId,
        technologyVersion: profile.technologyVersion,
        profileDigest,
        benchmarkRecordId: record.recordId,
        provenanceManifestId: manifest.manifestId,
        outcomes: mine,
      });
    }

    /* Phase 4 — the promotion request for the REGISTERED CANDIDATE only:
       the license/use gate REFUSES (the candidate is evaluation-only) and
       the refusal is RECORDED in the append-only log — never silent. The
       reference entries are not this lane's candidates: no promotion
       decision is requested for them (the control plane owns it). */

    let promotionRefusals: readonly PromotionRefusal[] = [];
    let registryState: string;
    if (variant === MAPANYTHING_PROVIDER_ID) {
      const promotion = requestPromotion(
        registry,
        profile.providerId,
        profile.technologyVersion,
      );
      if (!promotion.ok) {
        throw new MapAnythingEvalError(
          "invalid_corpus",
          `benchmark lifecycle: the promotion request was refused: ${promotion.failure.detail}`,
        );
      }
      registry = promotion.registry;
      const decision = promotion.registry.events[promotion.registry.events.length - 1];
      if (decision === undefined || decision.kind !== "promotion-decided") {
        throw new MapAnythingEvalError(
          "invalid_corpus",
          "benchmark lifecycle: the promotion decision event is missing",
        );
      }
      events.push(decision);
      const entry = registry.entryOf(profile.providerId, profile.technologyVersion);
      if (entry === undefined) {
        throw new MapAnythingEvalError(
          "invalid_corpus",
          "benchmark lifecycle: the candidate's entry disappeared after the promotion decision",
        );
      }
      if (entry.state !== "rejected") {
        throw new MapAnythingEvalError(
          "invalid_corpus",
          `benchmark lifecycle: the evaluation-only candidate must end REJECTED (got '${entry.state}')`,
        );
      }
      const licenseRefusals = (entry.promotionDecision?.refusals ?? []).filter(
        (refusal) => refusal.kind === "license-blocked",
      );
      if (licenseRefusals.length === 0) {
        throw new MapAnythingEvalError(
          "invalid_corpus",
          "benchmark lifecycle: the rejection must carry the typed license-blocked refusal",
        );
      }
      promotionRefusals = entry.promotionDecision?.refusals ?? [];
      registryState = entry.state;
    } else {
      const entry = registry.entryOf(profile.providerId, profile.technologyVersion);
      if (entry === undefined) {
        throw new MapAnythingEvalError(
          "invalid_corpus",
          `benchmark lifecycle: the reference entry '${variant}' disappeared`,
        );
      }
      registryState = entry.state;
    }

    variantLifecycles.push({
      variant,
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      profileDigest,
      licenseStatus:
        variant === MAPANYTHING_PROVIDER_ID ? "evaluation-only" : "reference-path-fixture",
      lanes,
      registryState,
      promotionRefusals,
    });
  }

  /* Phase 5 — the event-sourcing proof: replaying the log re-derives the
     identical registry state (every gate, including the license/use gate,
     re-evaluated during replay). */

  const replay = replayRegistry(events);
  if (!replay.ok) {
    throw new MapAnythingEvalError(
      "invalid_corpus",
      `benchmark lifecycle: replay refused (event ${replay.eventIndex}): ${replay.failure.detail}`,
    );
  }
  const projection = (input: ProviderRegistry) =>
    canonicalDigestOf(
      input.entries.map((entry) => ({
        providerId: entry.providerId,
        technologyVersion: entry.technologyVersion,
        state: entry.state,
        benchmarkRecordIds: entry.benchmarkRecords.map((record) => record.recordId),
        provenanceManifestIds: entry.provenanceManifests.map((manifest) => manifest.manifestId),
      })),
    );
  const replayEqual = projection(registry) === projection(replay.registry);

  return {
    events,
    registry,
    outcomes,
    variants: variantLifecycles,
    comparisons: compareMapAnythingLanes(comparisonInputs),
    replayEqual,
  };
}
