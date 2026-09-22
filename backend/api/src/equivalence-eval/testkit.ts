/**
 * HFX-301 — the equivalence benchmark TESTKIT (the deterministic doubles
 * + the suite runner + the committed-artifact golden builders).
 *
 * ONE shared implementation of the harness's injected seams so the module
 * tests and the tools-side runner (through the committed artifacts) prove
 * the same thing:
 *
 *  - `equivalenceHarnessDoubles()` — the baseline scene resolver (the
 *    engine's own `TableBaselineGeometryResolver` over the committed
 *    scene's geometry table) + the BOQ resolution seam (the deterministic
 *    `deriveSolutionBoq` of `@aise/solution-boq` — the fail-closed
 *    snapshot gates map an underivable BOQ to `null`, never a throw);
 *  - `runEquivalenceSuite()` — the full corpus through the harness + the
 *    suite summary (per-cell counts, per-pair verdicts, the aggregate
 *    ordered-manifest-id digest);
 *  - the MUTATION TWINS (the intentionally-wrong fixtures of the negative
 *    controls — the expectation-flip twin and the semantic-mutation twin);
 *  - the committed-artifact golden builders (the canonical projections the
 *    backend golden test byte-compares and the regeneration CLI writes);
 *  - the control-plane registry lifecycle over the corpus (the event-
 *    sourcing proof).
 *
 * DETERMINISM: pure functions + frozen data; no I/O (the golden builders
 * RETURN text — the regeneration CLI writes it), no clock, no randomness,
 * no network.
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { TableBaselineGeometryResolver } from "@aise/solution-engine";
import {
  applyRegistryEvent,
  createProviderRegistry,
  replayRegistry,
  sealProvenanceManifest,
  validateBenchmarkRecord,
} from "@aise/provider-registry";
import type {
  BenchmarkRecord,
  ProviderRegistryEvent,
} from "@aise/provider-registry";
import { deriveSolutionBoq as deriveBoq } from "@aise/solution-boq";
import {
  EQUIVALENCE_CAPABILITY,
  EQUIVALENCE_COMPILER_CODE_VERSION,
  EQUIVALENCE_ENGINE_CODE_VERSION,
  EQUIVALENCE_ENGINE_KIND,
  EQUIVALENCE_EVAL_BENCHMARK_ID,
  EQUIVALENCE_EVAL_CODE_VERSION,
  EQUIVALENCE_EVAL_CONSUMER,
  EQUIVALENCE_EVAL_ENVIRONMENT,
  EQUIVALENCE_EVAL_SUITE_ID,
  EQUIVALENCE_EVAL_SUITE_VERSION,
  EQUIVALENCE_LANE_PROVIDER_ID,
  EQUIVALENCE_LANE_TECHNOLOGY_VERSION,
  EQUIVALENCE_TAXONOMY_VERSION,
  deterministicInhouseLaneProfile,
} from "./registry";
import {
  EQUIVALENCE_CORPUS,
  EQUIVALENCE_SCENE,
  equivalenceCorpus,
} from "./corpus";
import {
  evaluateEquivalencePair,
  evaluateProvenanceOnlyControl,
} from "./harness";
import type {
  BoqResolverSeam,
  EquivalenceHarnessDoubles,
} from "./harness";
import type { EquivalenceOutcome, EquivalencePair } from "./model";

/* ------------------------------------------------------------------ */
/* The deterministic doubles (the harness seams)                        */
/* ------------------------------------------------------------------ */

/**
 * The DEFAULT BOQ resolution seam: the deterministic `deriveSolutionBoq`
 * over the validated journey version. The fail-closed snapshot gates (a
 * fail outcome, an uncertified digest, an empty version) map to `null` —
 * the harness records the honestly-underivable BOQ, never a throw.
 */
const defaultBoqResolver: BoqResolverSeam = (input) => {
  try {
    return deriveBoq({ version: input.version, snapshot: input.snapshot });
  } catch {
    return null;
  }
};

/** The committed doubles: the scene's geometry table + the real BOQ deriver. */
export function equivalenceHarnessDoubles(): EquivalenceHarnessDoubles {
  return {
    baselineGeometry: new TableBaselineGeometryResolver({
      ...EQUIVALENCE_SCENE.baselineGeometry,
    }),
    boqResolver: defaultBoqResolver,
  };
}

/* ------------------------------------------------------------------ */
/* The suite runner + the summary                                       */
/* ------------------------------------------------------------------ */

/** The per-pair verdict line (the committed outcome view). */
export interface EquivalenceOutcomeView {
  readonly pairId: string;
  readonly expectation: string;
  readonly observed: string;
  readonly expectationMet: boolean;
  /** The designed agent-path outcome echo (refusal reason / question slots). */
  readonly agentCompileKind: string;
  readonly refusalReasonCode?: string;
  readonly clarificationSlots?: readonly string[];
  readonly directApplicationOutcome: string;
  /** Present iff both paths ran: the comparison verdict + difference kinds. */
  readonly comparisonVerdict?: string;
  readonly differenceKind?: string;
  readonly differenceKinds?: readonly string[];
  readonly divergentPoints?: readonly string[];
  readonly equalPoints?: number;
  readonly benchmarkRecordId: string;
  readonly provenanceManifestId: string;
}

/** Projects an outcome into the committed outcome view (pure). */
export function equivalenceOutcomeViewOf(outcome: EquivalenceOutcome): EquivalenceOutcomeView {
  const comparison = outcome.comparison;
  const divergent =
    comparison === null
      ? []
      : comparison.points.filter((point) => !point.equal).map((point) => point.pointKind);
  const agentCompile = outcome.paths.agentCompile;
  return {
    pairId: outcome.pairId,
    expectation: outcome.expectation,
    observed: outcome.observed,
    expectationMet: outcome.expectationMet,
    agentCompileKind: agentCompile.kind,
    ...(agentCompile.kind === "unsafe-refusal"
      ? { refusalReasonCode: agentCompile.reasonCode }
      : {}),
    ...(agentCompile.kind === "clarification-needed"
      ? {
          clarificationSlots: agentCompile.questions.map((question) => question.slotKind),
        }
      : {}),
    directApplicationOutcome: outcome.paths.directJourney.application.outcome,
    ...(comparison === null
      ? {}
      : {
          comparisonVerdict: comparison.verdict,
          equalPoints: comparison.points.length - divergent.length,
          ...(divergent.length === 0 ? {} : { divergentPoints: divergent }),
          ...(comparison.differenceKind === undefined
            ? {}
            : { differenceKind: comparison.differenceKind }),
          differenceKinds: comparison.differenceKinds,
        }),
    benchmarkRecordId: outcome.benchmarkRecordId,
    provenanceManifestId: outcome.provenanceManifestId,
  };
}

/** The suite summary (the behavior-matrix table + the aggregate digests). */
export interface EquivalenceSuiteSummary {
  readonly total: number;
  readonly byExpectation: Readonly<Record<string, number>>;
  readonly byObserved: Readonly<Record<string, number>>;
  readonly expectationMatches: number;
  /** Every expectation class present in the committed corpus. */
  readonly expectationCoverage: readonly string[];
  /** Every unsafe-taxonomy reason code the agent-refused cell exhibits. */
  readonly refusalTaxonomyCoverage: readonly string[];
  /** Every clarification slot kind the agent-clarification cell exhibits. */
  readonly clarificationSlotCoverage: readonly string[];
  /** The provenance-only control's verdict (the structural doctrine at journey level). */
  readonly provenanceOnlyControlVerdict: string;
  /** sha-256 over the ordered manifest ids (the corpus's provenance fingerprint). */
  readonly provenanceManifestDigest: string;
  /** sha-256 over the ordered record ids. */
  readonly benchmarkRecordDigest: string;
}

/** The full corpus suite run. */
export interface EquivalenceSuiteRun {
  readonly suiteId: string;
  readonly suiteVersion: string;
  readonly outcomes: readonly EquivalenceOutcome[];
  readonly summary: EquivalenceSuiteSummary;
}

/** Runs the full committed corpus through the harness (deterministic). */
export async function runEquivalenceSuite(): Promise<EquivalenceSuiteRun> {
  const doubles = equivalenceHarnessDoubles();
  const outcomes: EquivalenceOutcome[] = [];
  for (const pair of equivalenceCorpus()) {
    outcomes.push(await evaluateEquivalencePair(pair, doubles));
  }

  const views = outcomes.map((outcome) => equivalenceOutcomeViewOf(outcome));
  const byExpectation: Record<string, number> = {};
  const byObserved: Record<string, number> = {};
  const refusalTaxonomy = new Set<string>();
  const clarificationSlots = new Set<string>();
  let expectationMatches = 0;
  for (const view of views) {
    byExpectation[view.expectation] = (byExpectation[view.expectation] ?? 0) + 1;
    byObserved[view.observed] = (byObserved[view.observed] ?? 0) + 1;
    if (view.expectationMet) {
      expectationMatches += 1;
    }
    if (view.refusalReasonCode !== undefined) {
      refusalTaxonomy.add(view.refusalReasonCode);
    }
    for (const slot of view.clarificationSlots ?? []) {
      clarificationSlots.add(slot);
    }
  }

  const provenanceOnly = await evaluateProvenanceOnlyControl({
    pairInput: EQUIVALENCE_CORPUS.find(
      (pair) => pair.pairId === "eq-excavation-core",
    ) as EquivalencePair,
    doubles,
  });

  const manifestIds = views.map((view) => view.provenanceManifestId);
  const recordIds = views.map((view) => view.benchmarkRecordId);
  const digest = (values: readonly string[]): string =>
    createHash("sha256").update(canonicalJsonStringify(values), "utf8").digest("hex");

  return {
    suiteId: EQUIVALENCE_EVAL_SUITE_ID,
    suiteVersion: EQUIVALENCE_EVAL_SUITE_VERSION,
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
      refusalTaxonomyCoverage: [...refusalTaxonomy].sort(),
      clarificationSlotCoverage: [...clarificationSlots].sort(),
      provenanceOnlyControlVerdict: provenanceOnly.verdict,
      provenanceManifestDigest: digest(manifestIds),
      benchmarkRecordDigest: digest(recordIds),
    },
  };
}

/* ------------------------------------------------------------------ */
/* The mutation twins (the intentionally-wrong negative-control fixtures) */
/* ------------------------------------------------------------------ */

/**
 * The EXPECTATION-FLIP twin: ONE pair with its expectation class flipped
 * (equivalent → declared-different, with the kind such a declaration
 * requires). The harness MUST report the mismatch — a benchmark that
 * cannot fail is not a benchmark.
 */
export function expectationFlipTwin(): EquivalencePair {
  const source = EQUIVALENCE_CORPUS.find(
    (pair) => pair.pairId === "eq-excavation-core",
  ) as EquivalencePair;
  return {
    ...source,
    pairId: "mutation-expectation-flip",
    expectation: "declared-different",
    declaredDifferenceKind: "operation-semantic-failure",
    notes:
      "INTENTIONALLY-WRONG twin (negative control): the eq-excavation-core pair with its " +
      "expectation flipped to declared-different — the harness must report expectationMet=false",
  };
}

/**
 * The SEMANTIC-MUTATION twin: ONE equivalent pair with a single parameter
 * value changed on the direct side (depth 1.5 m → 2.5 m). The comparison
 * MUST come back declared-different with the parameter-semantics kind.
 */
export function semanticMutationTwin(): EquivalencePair {
  const source = EQUIVALENCE_CORPUS.find(
    (pair) => pair.pairId === "eq-excavation-core",
  ) as EquivalencePair;
  return {
    ...source,
    pairId: "mutation-semantic-parameter",
    expectation: "equivalent",
    direct: {
      ...source.direct,
      parameters: source.direct.parameters.map((parameter) =>
        parameter.name === "depth" ? { ...parameter, value: 2.5 } : parameter,
      ),
      interactionDetail:
        "INTENTIONALLY-WRONG twin (negative control): the direct side's depth mutated " +
        "from 1.5 m to 2.5 m",
    },
    notes:
      "INTENTIONALLY-WRONG twin (negative control): one parameter value changed on the " +
      "direct side of an equivalent pair — the comparison must catch it with the " +
      "parameter-semantics difference kind",
  };
}

/* ------------------------------------------------------------------ */
/* The committed-artifact golden builders (the tools/ projections)       */
/* ------------------------------------------------------------------ */

/**
 * The committed `tools/equivalence-eval/scenario.json` content: the
 * canonical projection of the corpus (the version-pinned manifest header:
 * taxonomy version, engine kind+codeVersion, compiler codeVersion, corpus
 * digest; the scene; the pairs).
 */
export function goldenScenarioSuiteJson(): string {
  const corpus = equivalenceCorpus();
  const corpusDigest = createHash("sha256")
    .update(canonicalJsonStringify(corpus), "utf8")
    .digest("hex");
  return canonicalJsonStringify({
    suiteId: EQUIVALENCE_EVAL_SUITE_ID,
    version: EQUIVALENCE_EVAL_SUITE_VERSION,
    benchmarkId: EQUIVALENCE_EVAL_BENCHMARK_ID,
    codeVersion: EQUIVALENCE_EVAL_CODE_VERSION,
    pins: {
      taxonomyVersion: EQUIVALENCE_TAXONOMY_VERSION,
      compilerCodeVersion: EQUIVALENCE_COMPILER_CODE_VERSION,
      engineKind: EQUIVALENCE_ENGINE_KIND,
      engineCodeVersion: EQUIVALENCE_ENGINE_CODE_VERSION,
      corpusDigest,
    },
    scene: EQUIVALENCE_SCENE,
    pairCount: corpus.length,
    pairs: corpus,
  });
}

/**
 * The committed `tools/equivalence-eval/fixtures/expected-outcomes.json`
 * content: the canonical projection of the full suite run (the per-pair
 * outcome views + the summary with the aggregate digests and the
 * version-pinned manifest header).
 */
export async function goldenExpectedOutcomesJson(): Promise<string> {
  const run = await runEquivalenceSuite();
  const views = run.outcomes.map((outcome) => equivalenceOutcomeViewOf(outcome));
  const corpusDigest = createHash("sha256")
    .update(canonicalJsonStringify(equivalenceCorpus()), "utf8")
    .digest("hex");
  return canonicalJsonStringify({
    suiteId: run.suiteId,
    version: run.suiteVersion,
    benchmarkId: EQUIVALENCE_EVAL_BENCHMARK_ID,
    codeVersion: EQUIVALENCE_EVAL_CODE_VERSION,
    pins: {
      taxonomyVersion: EQUIVALENCE_TAXONOMY_VERSION,
      compilerCodeVersion: EQUIVALENCE_COMPILER_CODE_VERSION,
      engineKind: EQUIVALENCE_ENGINE_KIND,
      engineCodeVersion: EQUIVALENCE_ENGINE_CODE_VERSION,
      corpusDigest,
    },
    pairCount: views.length,
    outcomes: views,
    summary: run.summary,
  });
}

/* ------------------------------------------------------------------ */
/* The control-plane registry lifecycle over the corpus                 */
/* ------------------------------------------------------------------ */

/** The registry lifecycle projection of the corpus run. */
export interface EquivalenceRegistryLifecycleResult {
  readonly eventCount: number;
  readonly providerState: string;
  readonly benchmarkRecordCount: number;
  readonly provenanceManifestCount: number;
  /** replayRegistry(events) reproduces the identical derived state (the event-sourcing proof). */
  readonly replayEqual: boolean;
}

/**
 * Drives the committed corpus through the REAL control-plane registry:
 * registration → evaluation-started → execution-normalized per pair →
 * ONE consolidated benchmark record → ONE sealed provenance manifest
 * under the deterministic in-house lane. No promotion is requested —
 * promotion semantics belong to HFX-401's scorecard.
 */
export async function driveEquivalenceRegistryLifecycle(): Promise<EquivalenceRegistryLifecycleResult> {
  let registry = createProviderRegistry();
  const events: ProviderRegistryEvent[] = [];
  const apply = (event: ProviderRegistryEvent): void => {
    const result = applyRegistryEvent(registry, event);
    if (!result.ok) {
      throw new Error(
        `equivalence eval registry lifecycle: event '${event.kind}' was refused: ` +
          `${result.failure.detail}`,
      );
    }
    registry = result.registry;
    events.push(event);
  };

  const profile = deterministicInhouseLaneProfile();
  apply({ kind: "provider-registered", profile });
  apply({
    kind: "evaluation-started",
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
  });

  const run = await runEquivalenceSuite();
  for (const outcome of run.outcomes) {
    apply({
      kind: "execution-normalized",
      providerId: EQUIVALENCE_LANE_PROVIDER_ID,
      technologyVersion: EQUIVALENCE_LANE_TECHNOLOGY_VERSION,
      execution: {
        capability: EQUIVALENCE_CAPABILITY,
        inputDigest: createHash("sha256")
          .update(canonicalJsonStringify({ pairId: outcome.pairId }))
          .digest("hex"),
        normalizedResultDigest: createHash("sha256")
          .update(canonicalJsonStringify({ observed: outcome.observed, met: outcome.expectationMet }))
          .digest("hex"),
      },
    });
  }

  const views = run.outcomes.map((outcome) => equivalenceOutcomeViewOf(outcome));
  const consolidated = consolidateLaneRecord(views);
  apply({ kind: "benchmark-recorded", record: consolidated });
  apply({
    kind: "provenance-sealed",
    manifest: sealProvenanceManifest({
      profile,
      inputDigests: views.map((view) =>
        createHash("sha256")
          .update(canonicalJsonStringify({ pairId: view.pairId }))
          .digest("hex"),
      ),
      normalizedResultDigest: run.summary.provenanceManifestDigest,
      benchmarkRecords: [consolidated],
      environment: EQUIVALENCE_EVAL_ENVIRONMENT,
      consumer: EQUIVALENCE_EVAL_CONSUMER,
      reproducibilityStatement:
        "HFX-301 equivalence benchmark (consolidated lane record): the registered in-house " +
        "lane, the corpus pairs' input digests, the per-pair normalized result digests and " +
        "the consolidated benchmark record (digest above) fully determine this evaluation — " +
        "identical inputs reproduce the identical manifest",
    }),
  });

  const entry = registry.entries.find(
    (candidate) => candidate.providerId === EQUIVALENCE_LANE_PROVIDER_ID,
  );
  if (entry === undefined) {
    throw new Error(
      "equivalence eval registry lifecycle: the lane provider entry is missing after the run",
    );
  }
  const replay = replayRegistry(events);
  if (!replay.ok) {
    throw new Error(
      `equivalence eval registry lifecycle: replay refused: ${replay.failure.detail}`,
    );
  }
  const replayEntry = replay.registry.entries.find(
    (candidate) => candidate.providerId === EQUIVALENCE_LANE_PROVIDER_ID,
  );
  if (replayEntry === undefined) {
    throw new Error("equivalence eval registry lifecycle: the replayed entry is missing");
  }
  return {
    eventCount: events.length,
    providerState: entry.state,
    benchmarkRecordCount: entry.benchmarkRecords.length,
    provenanceManifestCount: entry.provenanceManifests.length,
    replayEqual:
      entry.state === replayEntry.state &&
      entry.benchmarkRecords.length === replayEntry.benchmarkRecords.length &&
      entry.provenanceManifests.length === replayEntry.provenanceManifests.length &&
      canonicalJsonStringify(
        entry.benchmarkRecords.map((record) => record.recordId),
      ) ===
        canonicalJsonStringify(
          replayEntry.benchmarkRecords.map((record) => record.recordId),
        ) &&
      canonicalJsonStringify(
        entry.provenanceManifests.map((manifest) => manifest.manifestId),
      ) ===
        canonicalJsonStringify(
          replayEntry.provenanceManifests.map((manifest) => manifest.manifestId),
        ),
  };
}

/**
 * Consolidates the corpus's outcome views into the SINGLE control-plane
 * benchmark record the registry consumes (metrics carry per-pair
 * subjectIds; the failure observations are the closed-vocabulary set).
 */
function consolidateLaneRecord(views: readonly EquivalenceOutcomeView[]): BenchmarkRecord {
  const body = {
    kind: "provider-benchmark-record" as const,
    schemaVersion: "provider-benchmark/1" as const,
    providerId: EQUIVALENCE_LANE_PROVIDER_ID,
    technologyVersion: EQUIVALENCE_LANE_TECHNOLOGY_VERSION,
    benchmarkId: EQUIVALENCE_EVAL_BENCHMARK_ID,
    capability: EQUIVALENCE_CAPABILITY,
    metrics: views.flatMap((view) => [
      {
        metric: "expectation_match",
        value: view.expectationMet ? 1 : 0,
        unit: "ratio",
        subjectId: view.pairId,
        detail:
          "the observed behavior-matrix cell (and the declared difference kind, where " +
          "declared) satisfies the corpus entry's expectation",
      },
      {
        metric: "comparison_points_equal",
        value: view.equalPoints ?? 0,
        unit: "count",
        subjectId: view.pairId,
        detail:
          "the number of PROD-029 canonical comparison points equal across both authoring " +
          "paths (0 for the designed agent-path outcome cells)",
      },
    ]),
    failureObservations: views.flatMap((view) => [
      ...(view.differenceKind === undefined
        ? []
        : [
            {
              kind: view.differenceKind,
              detail: `${view.pairId}: the ${view.differenceKinds?.join(", ")} point(s) ` +
                `diverge — the honestly-declared difference`,
            },
          ]),
      ...(view.expectationMet
        ? []
        : [
            {
              kind: "contract-mismatch" as const,
              detail: `${view.pairId}: the observed cell '${view.observed}' does not satisfy ` +
                `the declared expectation '${view.expectation}'`,
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
        .update(canonicalJsonStringify(views.map((view) => view.pairId)))
        .digest("hex"),
      codeVersion: EQUIVALENCE_EVAL_CODE_VERSION,
      statement:
        "deterministic reproduction: the corpus pair ids (aggregated digest above) through " +
        "the deterministic in-house lane at code version (above) always yield these metrics — " +
        "no clock, no randomness, no network",
    },
  };
  const validated = validateBenchmarkRecord(body);
  if (!validated.ok) {
    const issues = validated.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new Error(
      `equivalence eval registry lifecycle: the consolidated record failed validation: ${issues}`,
    );
  }
  return validated.record;
}

/* ------------------------------------------------------------------ */
/* The regeneration support (the committed-artifact paths)              */
/* ------------------------------------------------------------------ */

/** The committed artifact paths (relative to the repository root). */
export const SCENARIO_PATH = "tools/equivalence-eval/scenario.json" as const;
export const EXPECTED_OUTCOMES_PATH = "tools/equivalence-eval/fixtures/expected-outcomes.json" as const;
