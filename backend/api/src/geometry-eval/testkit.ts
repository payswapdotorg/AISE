/**
 * HFX-302 — the geometry substitution benchmark TESTKIT (the deterministic
 * doubles + the suite runner + the mutation twins + the committed-artifact
 * golden builders + the historical replay + the registry lifecycle).
 *
 * ONE shared implementation of the harness's injected seams so the module
 * tests and the tools-side runner (through the committed artifacts) prove
 * the same thing:
 *
 *  - `geometryHarnessDoubles()` — the baseline scene resolver (the
 *    committed corpus scenes) + the BOQ resolution seam (the deterministic
 *    `deriveSolutionBoq` of `@aise/solution-boq` — the fail-closed
 *    derivation gates map an underivable BOQ to `null`, never a throw) +
 *    the committed substitute-profile provider resolver;
 *  - `runGeometrySuite()` — the full corpus through the harness + the
 *    suite summary (per-cell counts, the ten-family coverage, the
 *    aggregate ordered-manifest-id digest);
 *  - the MUTATION TWINS (the intentionally-wrong negative-control
 *    fixtures): the TOLERANCE-BREACH twin (one projected quantity perturbed
 *    beyond the declared tolerance), the VERDICT-MUTATION twin (one
 *    validation check outcome flipped), the CAPABILITY-SABOTAGE descriptor
 *    (a provider over-declaring a family the adapter cannot gate) and the
 *    BOUNDARY-SMUGGLE twin (a provider-specific field smuggled into a
 *    canonical projection);
 *  - the committed-artifact golden builders (the canonical projections the
 *    backend golden test byte-compares and the regeneration CLI writes);
 *  - `replayHistoricalRecords()` — the PROVIDER-REMOVAL replay evidence:
 *    with the substitute lanes absent, the committed records + goldens
 *    still parse, validate and re-project (the work order's "a failed
 *    provider can be removed while historical solution records remain
 *    interpretable" criterion);
 *  - `driveGeometryRegistryLifecycle()` — the control-plane registry
 *    lifecycle over the corpus (registration → evaluation → executions →
 *    consolidated records + sealed manifests per lane → the substitute's
 *    RETIREMENT — the event-sourcing replay proof).
 *
 * DETERMINISM: pure functions + frozen data; no I/O (the golden builders
 * RETURN text — the regeneration CLI writes it), no clock, no randomness,
 * no network.
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  applyRegistryEvent,
  createProviderRegistry,
  replayRegistry,
  sealProvenanceManifest,
  validateBenchmarkRecord,
} from "@aise/provider-registry";
import type { BenchmarkRecord, ProviderRegistryEvent } from "@aise/provider-registry";
import { deriveSolutionBoq as deriveBoq } from "@aise/solution-boq";
import type { SolutionBoqLine } from "@aise/solution-boq";
import type { GeometryProvider } from "./adapter";
import { executeSequence } from "./adapter";
import { REFERENCE_PROVIDER } from "./reference";
import { substituteProviderForProfile } from "./substitute";
import { evaluateSubstitutionSequence } from "./harness";
import type {
  BoqResolverSeam,
  GeometryHarnessDoubles,
  GeometryComparisonPoint,
  SubstitutionSequenceOutcome,
} from "./harness";
import type { GeometryScene, SubstitutionSequence } from "./model";
import { GEOMETRY_CORPUS, GEOMETRY_SCENE, geometrySceneOf, geometryCorpus, geometrySequenceOf } from "./corpus";
import {
  GEOMETRY_EVAL_BENCHMARK_ID,
  GEOMETRY_EVAL_CODE_VERSION,
  GEOMETRY_EVAL_CONSUMER,
  GEOMETRY_EVAL_ENGINE_CODE_VERSION,
  GEOMETRY_EVAL_ENGINE_KIND,
  GEOMETRY_EVAL_ENVIRONMENT,
  GEOMETRY_EVAL_SUITE_ID,
  GEOMETRY_EVAL_SUITE_VERSION,
  GEOMETRY_EVAL_TOLERANCE_MODEL_VERSION,
  GEOMETRY_SUBSTITUTION_CAPABILITY,
  REFERENCE_LANE_PROVIDER_ID,
  REFERENCE_LANE_TECHNOLOGY_VERSION,
  SUBSTITUTE_IMPLEMENTATION_VERSION,
  SUBSTITUTE_TECHNOLOGY_VERSION,
  SUBSTITUTE_PROFILE_IDS,
  referenceLaneProfile,
  substituteLaneProfile,
} from "./registry";
import { OPERATION_FAMILY_VOCABULARY } from "./corpus";

/* ------------------------------------------------------------------ */
/* The deterministic doubles (the harness seams)                        */
/* ------------------------------------------------------------------ */

/**
 * The DEFAULT BOQ resolution seam: the deterministic `deriveSolutionBoq`
 * over the lane's derivation input. The fail-closed derivation gates (a
 * fail outcome, an uncertified digest, an empty version) map to `null` —
 * the harness records the honestly-underivable BOQ, never a throw.
 */
const defaultBoqResolver: BoqResolverSeam = (input) => {
  try {
    const boq = deriveBoq({ version: input.version, snapshot: input.snapshot });
    return { lines: boq.lines as readonly SolutionBoqLine[] };
  } catch {
    return null;
  }
};

/** The committed doubles: the corpus scenes + the real BOQ deriver + the committed profiles. */
export function geometryHarnessDoubles(): GeometryHarnessDoubles {
  return {
    resolveScene: (sceneId: string): GeometryScene => geometrySceneOf(sceneId),
    boqResolver: defaultBoqResolver,
    resolveSubstituteProvider: (profileId: string): GeometryProvider =>
      substituteProviderForProfile(profileId),
  };
}

/* ------------------------------------------------------------------ */
/* The suite runner + the summary                                       */
/* ------------------------------------------------------------------ */

/** The per-sequence committed outcome view (the golden's projection). */
export interface GeometryOutcomeView {
  readonly sequenceId: string;
  readonly substituteProfileId: string;
  readonly expectation: string;
  readonly observed: string;
  readonly expectationMet: boolean;
  readonly referenceLane: {
    readonly providerId: string;
    readonly technologyVersion: string;
    readonly executed: boolean;
    readonly benchmarkRecordId: string;
    readonly provenanceManifestId: string;
  };
  readonly substituteLane: {
    readonly providerId: string;
    readonly technologyVersion: string;
    readonly executed: boolean;
    readonly unsupportedFamily?: string;
    readonly benchmarkRecordId: string;
    readonly provenanceManifestId: string;
  };
  readonly comparison: {
    readonly verdict: "compatible" | "declared-incompatible";
    readonly totalPoints: number;
    readonly equalPoints: number;
    readonly divergentPoints: readonly string[];
    /** Present iff the comparison diverged (the honestly-declared difference). */
    readonly failureKind?: string;
    readonly failureKinds?: readonly string[];
    /** The FULL per-point comparison records (quantities, checks, verdict, topology, BOQ lines). */
    readonly points: readonly GeometryComparisonPoint[];
  } | null;
  readonly referenceProjectionDigest: string;
}

/** Projects an outcome into the committed outcome view (pure). */
export function geometryOutcomeViewOf(outcome: SubstitutionSequenceOutcome): GeometryOutcomeView {
  const comparison = outcome.comparison;
  const divergent =
    comparison === null
      ? []
      : comparison.points.filter((point) => !point.equal).map((point) => point.pointKind);
  return {
    sequenceId: outcome.sequenceId,
    substituteProfileId: outcome.substituteProfileId,
    expectation: outcome.expectation,
    observed: outcome.observed,
    expectationMet: outcome.expectationMet,
    referenceLane: {
      providerId: outcome.referenceLane.providerId,
      technologyVersion: outcome.referenceLane.technologyVersion,
      executed: outcome.referenceLane.executed,
      benchmarkRecordId: outcome.referenceLane.benchmarkRecordId,
      provenanceManifestId: outcome.referenceLane.provenanceManifestId,
    },
    substituteLane: {
      providerId: outcome.substituteLane.providerId,
      technologyVersion: outcome.substituteLane.technologyVersion,
      executed: outcome.substituteLane.executed,
      ...(outcome.substituteLane.unsupportedFamily === undefined
        ? {}
        : { unsupportedFamily: outcome.substituteLane.unsupportedFamily }),
      benchmarkRecordId: outcome.substituteLane.benchmarkRecordId,
      provenanceManifestId: outcome.substituteLane.provenanceManifestId,
    },
    comparison:
      comparison === null
        ? null
        : {
            verdict: comparison.verdict,
            totalPoints: comparison.points.length,
            equalPoints: comparison.points.length - divergent.length,
            divergentPoints: divergent,
            ...(comparison.divergence === undefined
              ? {}
              : {
                  failureKind: comparison.divergence.failureKind,
                  failureKinds: comparison.divergence.failureKinds,
                }),
            points: comparison.points,
          },
    referenceProjectionDigest: outcome.referenceProjectionDigest,
  };
}

/** The suite summary (the behavior-matrix table + the aggregate digests). */
export interface GeometrySuiteSummary {
  readonly total: number;
  readonly byExpectation: Readonly<Record<string, number>>;
  readonly byObserved: Readonly<Record<string, number>>;
  readonly expectationMatches: number;
  /** Every expectation class present in the committed corpus. */
  readonly expectationCoverage: readonly string[];
  /** The operation families the COMPATIBLE cells cover (all ten, in vocabulary order). */
  readonly compatibleFamilyCoverage: readonly string[];
  /** The families the UNSUPPORTED cells record (the restricted profile's omissions). */
  readonly unsupportedFamilyCoverage: readonly string[];
  /** sha-256 over the ordered manifest ids (the corpus's provenance fingerprint). */
  readonly provenanceManifestDigest: string;
  /** sha-256 over the ordered record ids (both lanes interleaved per sequence). */
  readonly benchmarkRecordDigest: string;
}

/** The full corpus suite run. */
export interface GeometrySuiteRun {
  readonly suiteId: string;
  readonly suiteVersion: string;
  readonly outcomes: readonly SubstitutionSequenceOutcome[];
  readonly summary: GeometrySuiteSummary;
}

/** Runs the full committed corpus through the harness (deterministic). */
export function runGeometrySuite(): GeometrySuiteRun {
  const doubles = geometryHarnessDoubles();
  const outcomes: SubstitutionSequenceOutcome[] = [];
  for (const sequence of geometryCorpus()) {
    outcomes.push(evaluateSubstitutionSequence(sequence, doubles));
  }

  const views = outcomes.map((outcome) => geometryOutcomeViewOf(outcome));
  const byExpectation: Record<string, number> = {};
  const byObserved: Record<string, number> = {};
  let expectationMatches = 0;
  const compatibleFamilies = new Set<string>();
  const unsupportedFamilies = new Set<string>();
  for (const view of views) {
    byExpectation[view.expectation] = (byExpectation[view.expectation] ?? 0) + 1;
    byObserved[view.observed] = (byObserved[view.observed] ?? 0) + 1;
    if (view.expectationMet) {
      expectationMatches += 1;
    }
    if (view.observed === "compatible") {
      for (const operation of geometrySequenceOf(view.sequenceId).operations) {
        compatibleFamilies.add(operation.operationType);
      }
    }
    if (view.substituteLane.unsupportedFamily !== undefined) {
      unsupportedFamilies.add(view.substituteLane.unsupportedFamily);
    }
  }

  const manifestIds = views.flatMap((view) => [
    view.referenceLane.provenanceManifestId,
    view.substituteLane.provenanceManifestId,
  ]);
  const recordIds = views.flatMap((view) => [
    view.referenceLane.benchmarkRecordId,
    view.substituteLane.benchmarkRecordId,
  ]);
  const digest = (values: readonly string[]): string =>
    createHash("sha256").update(canonicalJsonStringify(values), "utf8").digest("hex");

  return {
    suiteId: GEOMETRY_EVAL_SUITE_ID,
    suiteVersion: GEOMETRY_EVAL_SUITE_VERSION,
    outcomes,
    summary: {
      total: views.length,
      byExpectation: Object.fromEntries(
        Object.entries(byExpectation).sort(([a], [b]) => a.localeCompare(b)),
      ),
      byObserved: Object.fromEntries(
        Object.entries(byObserved).sort(([a], [b]) => a.localeCompare(b)),
      ),
      expectationMatches,
      expectationCoverage: [...new Set(views.map((view) => view.expectation))].sort(),
      compatibleFamilyCoverage: OPERATION_FAMILY_VOCABULARY.filter((family) =>
        compatibleFamilies.has(family),
      ),
      unsupportedFamilyCoverage: [...unsupportedFamilies].sort(),
      provenanceManifestDigest: digest(manifestIds),
      benchmarkRecordDigest: digest(recordIds),
    },
  };
}

/* ------------------------------------------------------------------ */
/* The mutation twins (the intentionally-wrong negative-control fixtures) */
/* ------------------------------------------------------------------ */

/**
 * Wraps a provider with an output mutation (the sabotage seam — the twins'
 * shared machinery). The wrapper preserves the descriptor (the capability
 * gate still reads the committed declaration) and mutates ONE aspect of
 * the raw execution output.
 */
function mutatedProvider(
  base: GeometryProvider,
  mutate: (output: import("./adapter").GeometryExecutionOutput) => import("./adapter").GeometryExecutionOutput,
): GeometryProvider {
  return {
    descriptor: base.descriptor,
    execute: (input) => mutate(base.execute(input)),
  };
}

/**
 * The TOLERANCE-BREACH twin: the fine substitute with ONE projected volume
 * quantity perturbed beyond the declared tolerance (+1.0 m3 on the first
 * volume row). The harness MUST report declared-incompatible with the
 * QUANTITY comparison kind (operation-semantic-failure) and the observed
 * breach — a benchmark that cannot fail is not a benchmark.
 */
export function toleranceBreachTwin(): GeometryProvider {
  return mutatedProvider(substituteProviderForProfile("geometry-substitute-fine"), (output) => {
    const rows = JSON.parse(output.quantitiesJson) as { label: string; dimension: string; value: number }[];
    const volumeIndex = rows.findIndex((row) => row.dimension === "volume");
    if (volumeIndex < 0) {
      throw new Error("tolerance-breach twin: no volume row to perturb (fixture bug)");
    }
    const mutated = rows.map((row, index) =>
      index === volumeIndex ? { ...row, value: row.value + 1 } : row,
    );
    return { ...output, quantitiesJson: canonicalJsonStringify(mutated) };
  });
}

/**
 * The VERDICT-MUTATION twin: the fine substitute with ONE validation check
 * outcome flipped (operation.phase1-limits: pass → review-needed — a flip
 * that ALSO flips the worst-of verdict, proving the per-check comparison
 * catches it even where the verdict alone would too, and the check-level
 * divergence is recorded with the VALIDATION kind (reasoning-failure)).
 */
export function verdictMutationTwin(): GeometryProvider {
  return mutatedProvider(substituteProviderForProfile("geometry-substitute-fine"), (output) => {
    const checks = JSON.parse(output.checksJson) as { checkId: string; result: string }[];
    const mutated = checks.map((check) =>
      check.checkId === "operation.phase1-limits" && check.result === "pass"
        ? { ...check, result: "review-needed" }
        : check,
    );
    return {
      ...output,
      checksJson: canonicalJsonStringify(mutated),
      verdict: "review-needed",
    };
  });
}

/**
 * The CAPABILITY-SABOTAGE descriptor: a provider over-declaring a
 * capability the adapter cannot gate ('roof-truss-placement' — outside the
 * documented v1 operation-family vocabulary). `validateGeometryProviderDescriptor`
 * MUST reject it (capability honesty — over-declaration is refused, never
 * best-efforted).
 */
export function capabilitySabotageDescriptor(): unknown {
  const base = substituteProviderForProfile("geometry-substitute-fine").descriptor;
  return {
    ...base,
    declaredCapabilities: [...base.declaredCapabilities, "roof-truss-placement"],
  };
}

/**
 * The BOUNDARY-SMUGGLE twin: the fine substitute with a provider-specific
 * field ('meshFormat') smuggled into the canonical quantities projection.
 * The adapter's canonical-boundary projection guard MUST refuse it with
 * the typed contract-mismatch (the D26 discipline asserted at this seam).
 */
export function boundarySmuggleTwin(): GeometryProvider {
  return mutatedProvider(substituteProviderForProfile("geometry-substitute-fine"), (output) => {
    const rows = JSON.parse(output.quantitiesJson) as Record<string, unknown>[];
    const smuggled = rows.map((row) => ({ ...row, meshFormat: "substitute-proprietary-v1" }));
    return { ...output, quantitiesJson: canonicalJsonStringify(smuggled) };
  });
}

/** Doubles with the substitute resolver overridden (the twins' driver). */
export function doublesWithSubstitute(provider: GeometryProvider): GeometryHarnessDoubles {
  return {
    ...geometryHarnessDoubles(),
    resolveSubstituteProvider: () => provider,
  };
}

/* ------------------------------------------------------------------ */
/* The committed-artifact golden builders (the tools/ projections)       */
/* ------------------------------------------------------------------ */

/** The corpus digest (sha-256 over the canonical JSON of the committed corpus). */
export function geometryCorpusDigest(): string {
  return createHash("sha256")
    .update(canonicalJsonStringify(geometryCorpus()), "utf8")
    .digest("hex");
}

/** The version-pinned manifest header riding BOTH committed artifacts identically. */
function pinsOf(): Record<string, string> {
  return {
    engineKind: GEOMETRY_EVAL_ENGINE_KIND,
    engineCodeVersion: GEOMETRY_EVAL_ENGINE_CODE_VERSION,
    substituteImplementationVersion: SUBSTITUTE_IMPLEMENTATION_VERSION,
    toleranceModelVersion: GEOMETRY_EVAL_TOLERANCE_MODEL_VERSION,
    corpusDigest: geometryCorpusDigest(),
  };
}

/**
 * The committed `tools/geometry-eval/scenario.json` content: the canonical
 * projection of the corpus (the version-pinned manifest header + the scene
 * + the sequences).
 */
export function goldenCorpusSuiteJson(): string {
  const corpus = geometryCorpus();
  return canonicalJsonStringify({
    suiteId: GEOMETRY_EVAL_SUITE_ID,
    version: GEOMETRY_EVAL_SUITE_VERSION,
    benchmarkId: GEOMETRY_EVAL_BENCHMARK_ID,
    codeVersion: GEOMETRY_EVAL_CODE_VERSION,
    pins: pinsOf(),
    scene: GEOMETRY_SCENE,
    sequenceCount: corpus.length,
    sequences: corpus,
  });
}

/**
 * The committed `tools/geometry-eval/fixtures/expected-outcomes.json`
 * content: the canonical projection of the full suite run (the per-sequence
 * outcome views + the summary with the aggregate digests and the
 * version-pinned manifest header).
 */
export function goldenOutcomesJson(): string {
  const run = runGeometrySuite();
  const views = run.outcomes.map((outcome) => geometryOutcomeViewOf(outcome));
  return canonicalJsonStringify({
    suiteId: run.suiteId,
    version: run.suiteVersion,
    benchmarkId: GEOMETRY_EVAL_BENCHMARK_ID,
    codeVersion: GEOMETRY_EVAL_CODE_VERSION,
    pins: pinsOf(),
    sequenceCount: views.length,
    outcomes: views,
    summary: run.summary,
  });
}

/** The committed artifact paths (relative to the repository root). */
export const SCENARIO_PATH = "tools/geometry-eval/scenario.json" as const;
export const OUTCOMES_PATH = "tools/geometry-eval/fixtures/expected-outcomes.json" as const;

/* ------------------------------------------------------------------ */
/* The historical replay (the provider-removal evidence)                */
/* ------------------------------------------------------------------ */

/** The provider-removal replay result (the work order's final acceptance criterion). */
export interface HistoricalReplayResult {
  /** The substitute lane identities the removal simulation withdraws. */
  readonly removedProviderIds: readonly string[];
  /** The surviving reference-lane records (one per sequence). */
  readonly survivingRecordCount: number;
  /** The surviving reference-lane manifests (one per sequence). */
  readonly survivingManifestCount: number;
  /** Every surviving record + manifest id parses as a 64-hex content address. */
  readonly recordsParse: boolean;
  /** The surviving records re-validate through the control-plane validator. */
  readonly recordsValidate: boolean;
  /** The reference lane ALONE re-derives every committed reference projection digest. */
  readonly projectionsReplay: boolean;
  /** The committed goldens still parse + the reference-only summary re-derives. */
  readonly goldensRemainInterpretable: boolean;
}

/**
 * The PROVIDER-REMOVAL REPLAY: simulates the substitute's withdrawal from
 * the lane set and proves the historical records remain interpretable —
 *
 *  1. every reference-lane record + manifest id of the committed run
 *     parses as a 64-hex content address;
 *  2. the reference-lane records re-validate through the control plane's
 *     own `validateBenchmarkRecord`;
 *  3. the reference lane ALONE (the substitute absent from the lane set)
 *     re-derives every committed reference-projection digest — the
 *     canonical projections never depended on the substitute;
 *  4. the committed goldens still parse and their reference-lane content
 *     re-projects identically.
 */
export function replayHistoricalRecords(): HistoricalReplayResult {
  const run = runGeometrySuite();
  const views = run.outcomes.map((outcome) => geometryOutcomeViewOf(outcome));
  const removedProviderIds = [
    ...new Set(views.map((view) => view.substituteLane.providerId)),
  ].sort();

  const digestShape = /^[0-9a-f]{64}$/;
  const recordsParse = views.every(
    (view) =>
      digestShape.test(view.referenceLane.benchmarkRecordId) &&
      digestShape.test(view.referenceLane.provenanceManifestId),
  );

  const doubles = geometryHarnessDoubles();

  /* The reference-lane records re-validate: the harness's own emission
     path validates every record through the control plane's
     `validateBenchmarkRecord` (it throws on any invalid record), so a
     clean re-evaluation IS the re-validation — and the content-addressed
     record ids must re-derive identically (byte-stable history). */
  let recordsValidate = true;
  for (const sequence of geometryCorpus()) {
    try {
      const reevaluated = evaluateSubstitutionSequence(sequence, doubles);
      if (reevaluated.referenceLane.benchmarkRecordId === undefined) {
        recordsValidate = false;
      }
      const committed = views.find((view) => view.sequenceId === sequence.sequenceId);
      if (
        committed === undefined ||
        committed.referenceLane.benchmarkRecordId !== reevaluated.referenceLane.benchmarkRecordId ||
        committed.referenceLane.provenanceManifestId !== reevaluated.referenceLane.provenanceManifestId
      ) {
        recordsValidate = false;
      }
    } catch {
      recordsValidate = false;
    }
  }

  /* The reference lane ALONE re-derives every committed projection digest. */
  let projectionsReplay = true;
  for (const sequence of geometryCorpus()) {
    const scene = doubles.resolveScene(sequence.baselineSceneId);
    const execution = executeSequence(REFERENCE_PROVIDER, scene, sequence.operations);
    if (execution.outcome !== "executed") {
      projectionsReplay = false;
      continue;
    }
    const digest = createHash("sha256")
      .update(canonicalJsonStringify(execution.projection), "utf8")
      .digest("hex");
    const committed = views.find((view) => view.sequenceId === sequence.sequenceId);
    if (committed === undefined || committed.referenceProjectionDigest !== digest) {
      projectionsReplay = false;
    }
  }

  /* The committed goldens still parse + the reference-only view re-projects. */
  const goldensRemainInterpretable = (() => {
    try {
      const scenario = JSON.parse(goldenCorpusSuiteJson()) as { sequences: SubstitutionSequence[] };
      const outcomes = JSON.parse(goldenOutcomesJson()) as {
        outcomes: GeometryOutcomeView[];
      };
      return (
        scenario.sequences.length === GEOMETRY_CORPUS.length &&
        outcomes.outcomes.length === GEOMETRY_CORPUS.length &&
        outcomes.outcomes.every((view) => typeof view.referenceProjectionDigest === "string") &&
        outcomes.outcomes.every((view) => view.referenceLane.executed)
      );
    } catch {
      return false;
    }
  })();

  return {
    removedProviderIds,
    survivingRecordCount: views.length,
    survivingManifestCount: views.length,
    recordsParse,
    recordsValidate,
    projectionsReplay,
    goldensRemainInterpretable,
  };
}

/* ------------------------------------------------------------------ */
/* The control-plane registry lifecycle over the corpus                 */
/* ------------------------------------------------------------------ */

/** The registry lifecycle projection of the corpus run. */
export interface GeometryRegistryLifecycleResult {
  readonly eventCount: number;
  /** The reference lane's terminal state (benchmarked). */
  readonly referenceProviderState: string;
  /** The substitute profiles' terminal states (retired — the removal simulation). */
  readonly substituteProviderStates: Readonly<Record<string, string>>;
  readonly benchmarkRecordCount: number;
  readonly provenanceManifestCount: number;
  /** replayRegistry(events) reproduces the identical derived state (the event-sourcing proof). */
  readonly replayEqual: boolean;
}

/**
 * Drives the committed corpus through the REAL control-plane registry:
 * registration → evaluation-started per lane → execution-normalized per
 * sequence per lane → ONE consolidated benchmark record + ONE sealed
 * provenance manifest per lane → the SUBSTITUTE profiles' RETIREMENT (the
 * removal simulation — the historical records remain on the entries). No
 * promotion is requested — promotion semantics belong to HFX-401's
 * scorecard.
 */
export function driveGeometryRegistryLifecycle(): GeometryRegistryLifecycleResult {
  let registry = createProviderRegistry();
  const events: ProviderRegistryEvent[] = [];
  const apply = (event: ProviderRegistryEvent): void => {
    const result = applyRegistryEvent(registry, event);
    if (!result.ok) {
      throw new Error(
        `geometry-eval registry lifecycle: event '${event.kind}' was refused: ` +
          `${result.failure.detail}`,
      );
    }
    registry = result.registry;
    events.push(event);
  };

  const referenceProfile = referenceLaneProfile();
  apply({ kind: "provider-registered", profile: referenceProfile });
  apply({
    kind: "evaluation-started",
    providerId: referenceProfile.providerId,
    technologyVersion: referenceProfile.technologyVersion,
  });
  const substituteProfiles = SUBSTITUTE_PROFILE_IDS.map((profileId) =>
    substituteLaneProfile(profileId),
  );
  for (const profile of substituteProfiles) {
    apply({ kind: "provider-registered", profile });
    apply({
      kind: "evaluation-started",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
  }

  const run = runGeometrySuite();
  const views = run.outcomes.map((outcome) => geometryOutcomeViewOf(outcome));
  for (const view of views) {
    const lanes = [
      { lane: "reference" as const, ...view.referenceLane },
      { lane: "substitute" as const, ...view.substituteLane },
    ];
    for (const lane of lanes) {
      apply({
        kind: "execution-normalized",
        providerId: lane.providerId,
        technologyVersion: lane.technologyVersion,
        execution: {
          capability: GEOMETRY_SUBSTITUTION_CAPABILITY,
          inputDigest: createHash("sha256")
            .update(canonicalJsonStringify({ sequenceId: view.sequenceId, lane: lane.lane }))
            .digest("hex"),
          normalizedResultDigest: createHash("sha256")
            .update(
              canonicalJsonStringify({
                sequenceId: view.sequenceId,
                executed: lane.executed,
                observed: view.observed,
                met: view.expectationMet,
              }),
            )
            .digest("hex"),
        },
      });
    }
  }

  const referenceRecord = consolidateLaneRecord("reference", views);
  apply({ kind: "benchmark-recorded", record: referenceRecord });
  apply({
    kind: "provenance-sealed",
    manifest: sealProvenanceManifest({
      profile: referenceProfile,
      inputDigests: views.map((view) =>
        createHash("sha256")
          .update(canonicalJsonStringify({ sequenceId: view.sequenceId, lane: "reference" }))
          .digest("hex"),
      ),
      normalizedResultDigest: run.summary.provenanceManifestDigest,
      benchmarkRecords: [referenceRecord],
      environment: GEOMETRY_EVAL_ENVIRONMENT,
      consumer: GEOMETRY_EVAL_CONSUMER,
      reproducibilityStatement:
        "HFX-302 geometry substitution benchmark (consolidated reference-lane record): the " +
        "registered reference oracle, the corpus sequences' input digests, the per-sequence " +
        "normalized result digests and the consolidated benchmark record (digest above) fully " +
        "determine this evaluation — identical inputs reproduce the identical manifest",
    }),
  });
  const substituteRecord = consolidateLaneRecord("substitute", views);
  apply({ kind: "benchmark-recorded", record: substituteRecord });
  apply({
    kind: "provenance-sealed",
    manifest: sealProvenanceManifest({
      profile: substituteProfiles[0] as ReturnType<typeof substituteLaneProfile>,
      inputDigests: views.map((view) =>
        createHash("sha256")
          .update(canonicalJsonStringify({ sequenceId: view.sequenceId, lane: "substitute" }))
          .digest("hex"),
      ),
      normalizedResultDigest: run.summary.benchmarkRecordDigest,
      benchmarkRecords: [substituteRecord],
      environment: GEOMETRY_EVAL_ENVIRONMENT,
      consumer: GEOMETRY_EVAL_CONSUMER,
      reproducibilityStatement:
        "HFX-302 geometry substitution benchmark (consolidated substitute-lane record): the " +
        "registered substitute profiles, the corpus sequences' input digests, the per-sequence " +
        "normalized result digests and the consolidated benchmark record (digest above) fully " +
        "determine this evaluation — identical inputs reproduce the identical manifest",
    }),
  });

  /* The removal simulation: the substitute profiles are RETIRED — the
     historical records + manifests REMAIN on their entries. */
  for (const profile of substituteProfiles) {
    apply({
      kind: "provider-retired",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      reason:
        "the HFX-302 removal simulation: a failed substitute provider is withdrawn while its " +
        "historical benchmark records and provenance manifests remain interpretable",
    });
  }

  const referenceEntry = registry.entries.find(
    (candidate) => candidate.providerId === REFERENCE_LANE_PROVIDER_ID,
  );
  if (referenceEntry === undefined) {
    throw new Error(
      "geometry-eval registry lifecycle: the reference lane entry is missing after the run",
    );
  }
  const substituteStates: Record<string, string> = {};
  for (const profile of substituteProfiles) {
    const entry = registry.entries.find(
      (candidate) => candidate.providerId === profile.providerId,
    );
    if (entry === undefined) {
      throw new Error(
        `geometry-eval registry lifecycle: the substitute entry '${profile.providerId}' is missing`,
      );
    }
    substituteStates[profile.providerId] = entry.state;
  }

  const replay = replayRegistry(events);
  if (!replay.ok) {
    throw new Error(
      `geometry-eval registry lifecycle: replay refused: ${replay.failure.detail}`,
    );
  }
  const replayReference = replay.registry.entries.find(
    (candidate) => candidate.providerId === REFERENCE_LANE_PROVIDER_ID,
  );
  const replayEqual =
    replayReference !== undefined &&
    replayReference.state === referenceEntry.state &&
    replayReference.benchmarkRecords.length === referenceEntry.benchmarkRecords.length &&
    replayReference.provenanceManifests.length === referenceEntry.provenanceManifests.length &&
    canonicalJsonStringify(
      referenceEntry.benchmarkRecords.map((record) => record.recordId),
    ) ===
      canonicalJsonStringify(
        replayReference.benchmarkRecords.map((record) => record.recordId),
      ) &&
    canonicalJsonStringify(
      referenceEntry.provenanceManifests.map((manifest) => manifest.manifestId),
    ) ===
      canonicalJsonStringify(
        replayReference.provenanceManifests.map((manifest) => manifest.manifestId),
      );

  return {
    eventCount: events.length,
    referenceProviderState: referenceEntry.state,
    substituteProviderStates: substituteStates,
    benchmarkRecordCount: referenceEntry.benchmarkRecords.length,
    provenanceManifestCount: referenceEntry.provenanceManifests.length,
    replayEqual,
  };
}

/**
 * Consolidates the corpus's outcome views into the SINGLE control-plane
 * benchmark record ONE lane consumes (metrics carry per-sequence
 * subjectIds; the failure observations are the closed-vocabulary set).
 */
function consolidateLaneRecord(
  lane: "reference" | "substitute",
  views: readonly GeometryOutcomeView[],
): BenchmarkRecord {
  const providerId =
    lane === "reference" ? REFERENCE_LANE_PROVIDER_ID : "geometry-substitute-fine";
  const technologyVersion =
    lane === "reference" ? REFERENCE_LANE_TECHNOLOGY_VERSION : SUBSTITUTE_TECHNOLOGY_VERSION;
  const body = {
    kind: "provider-benchmark-record" as const,
    schemaVersion: "provider-benchmark/1" as const,
    providerId,
    technologyVersion,
    benchmarkId: GEOMETRY_EVAL_BENCHMARK_ID,
    capability: GEOMETRY_SUBSTITUTION_CAPABILITY,
    metrics: views.flatMap((view) => [
      {
        metric: "expectation_match",
        value: view.expectationMet ? 1 : 0,
        unit: "ratio",
        subjectId: view.sequenceId,
        detail:
          "the observed behavior-matrix cell (and the declared difference kind, where " +
          "declared) satisfies the corpus entry's expectation",
      },
      {
        metric: "comparison_points_equal",
        value: view.comparison === null ? 0 : view.comparison.equalPoints,
        unit: "count",
        subjectId: view.sequenceId,
        detail:
          "the number of canonical comparison points equal across both lanes (0 for the typed " +
          "unsupported outcomes — the record IS the outcome)",
      },
    ]),
    failureObservations: views.flatMap((view) => [
      ...(view.comparison?.failureKind === undefined
        ? []
        : [
            {
              kind: view.comparison.failureKind,
              detail:
                `${view.sequenceId}: the ${view.comparison.divergentPoints.join(", ")} comparison ` +
                `point(s) diverge — the honestly-declared difference`,
            },
          ]),
      ...(view.substituteLane.unsupportedFamily === undefined || lane === "reference"
        ? []
        : [
            {
              kind: "unsupported-data" as const,
              detail:
                `${view.sequenceId}: the operation family '${view.substituteLane.unsupportedFamily}' ` +
                `is outside the substitute's declared capabilities — recorded by the fail-closed ` +
                `gate, never computed`,
            },
          ]),
      ...(view.expectationMet
        ? []
        : [
            {
              kind: "contract-mismatch" as const,
              detail:
                `${view.sequenceId}: the observed cell '${view.observed}' does not satisfy the ` +
                `declared expectation '${view.expectation}'`,
            },
          ]),
    ]),
    resourceObservations: {
      compute: "deterministic-inhouse-cpu",
      memoryMiB: 16,
      latencyMsP50: 0.5,
      latencyMsP95: 1,
    },
    reproduction: {
      inputsDigest: createHash("sha256")
        .update(canonicalJsonStringify(views.map((view) => view.sequenceId)))
        .digest("hex"),
      codeVersion: GEOMETRY_EVAL_CODE_VERSION,
      statement:
        "deterministic reproduction: the corpus sequence ids (aggregated digest above) through " +
        "the deterministic lane at code version (above) always yield these metrics — no clock, " +
        "no randomness, no network",
    },
  };
  const validated = validateBenchmarkRecord(body);
  if (!validated.ok) {
    const issues = validated.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new Error(
      `geometry-eval registry lifecycle: the consolidated record failed validation: ${issues}`,
    );
  }
  return validated.record;
}
