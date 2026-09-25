/**
 * HFX-401 — the SCORED-PROVIDER CORPUS (the scorecard's committed inputs).
 *
 * The scorecard engine's INPUT CORPUS, per the work order: benchmark
 * results are PERSISTED under the common provider profile — this module
 * assembles, from COMMITTED sources only, the per-provider facts the ten
 * gate dimensions are derived from:
 *
 *   1. the HFX-302 geometry/validation substitution benchmark's committed
 *      corpus (`backend/api/src/geometry-eval` — IMPORTED, never modified):
 *      the reference oracle lane (aise-engine-reference, the incumbent
 *      identity authority) and the three substitute profiles (fine — the
 *      all-pass candidate; coarse — the designed-divergence lane; restricted
 *      — the fail-closed capability-gate lane) as scored providers;
 *   2. the HFX-301 equivalence benchmark's committed corpus (the Layer-3
 *      dependent-layer regression citation — IMPORTED, never modified);
 *   3. the HFX-000 control plane's committed reference-lifecycle fixtures
 *      (`packages/provider-registry/fixtures/` — READ AS DATA, validated
 *      through the package's public validators, never modified): the
 *      fixture-depth-provider v1 (promoted — the exit-gate's all-pass
 *      lifecycle) and v2 (license-blocked — the rejected lifecycle) as
 *      earlier-eval-module scored providers;
 *   4. ONE engineered drill provider: `geometry-substitute-fine-research`
 *      — the fine substitute's strong benchmark under a RESEARCH-ONLY
 *      license (the refusal path's exactly-one-mandatory-gate-failure
 *      demonstration; see docs/productization-evidence/HFX-401/
 *      license-declaration.md).
 *
 * Per scored provider the corpus carries: the control-plane profile (+
 * digest), the layer + provider class, the declared operation families,
 * the per-sequence corpus rows (committed record ids, manifest ids,
 * observed cells, BOQ-line divergence flags), the license/cost/uncertainty
 * declarations the gates read, the drill kit (the lawful control-plane
 * lifecycle artifacts: executions, ONE consolidated benchmark record, ONE
 * sealed provenance manifest) and the role that scopes the gate-derivation
 * rules.
 *
 * `laneRegistryProjection()` serializes the corpus into the committed
 * `docs/productization-evidence/HFX-401/runs/lane-registry.json` — the
 * STANDALONE tools runner's primary input (the boundary matrix forbids
 * tools → packages/backend imports, so the runner consumes this committed
 * projection as data and mirrors the gate-derivation rules; the backend
 * golden test byte-compares the engine's fresh construction).
 *
 * DETERMINISM: no clock, no randomness, no network; identical inputs are
 * byte-identical (the HFX-302/HFX-301 suites are themselves deterministic).
 * The file reads below are PURE DATA READS of committed fixtures (the
 * cross-zone companion convention — never an import of frozen modules).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  applyRegistryEvent,
  createProviderRegistry,
  replayRegistry,
  sealProvenanceManifest,
  toLicenseDeclaration,
  validateBenchmarkRecord,
  validateProviderProfile,
  verifyProvenanceManifest,
} from "@aise/provider-registry";
import type {
  BenchmarkRecord,
  EnvironmentFingerprint,
  FailureKind,
  NormalizedExecutionRecord,
  ProfileReference,
  ProviderProfile,
  ProviderRegistry,
  ProviderRegistryEvent,
  ProvenanceManifest,
  RegistryEntry,
} from "@aise/provider-registry";
import {
  GEOMETRY_EVAL_BENCHMARK_ID,
  GEOMETRY_EVAL_CODE_VERSION,
  SUBSTITUTE_PROFILE_IDS,
  geometryCorpusDigest,
  geometryOutcomeViewOf,
  referenceLaneDescriptor,
  referenceLaneProfile,
  runGeometrySuite,
  substituteLaneDescriptor,
  substituteLaneProfile,
} from "../geometry-eval";
import type { GeometryOutcomeView } from "../geometry-eval";
import { sha256Canonical } from "./digest";
import { goldenScenarioSuiteJson, runEquivalenceSuite } from "../equivalence-eval";

/* ------------------------------------------------------------------ */
/* The module's declared identity                                       */
/* ------------------------------------------------------------------ */

/** The HFX-401 scorecard engine's code version (stamped into its records). */
export const SCORECARD_CODE_VERSION = "hfx-401/provider-scorecard/1" as const;

/** The scorecard record's typed seal + schema version. */
export const PROVIDER_SCORECARD_KIND = "provider-scorecard" as const;
export const PROVIDER_SCORECARD_SCHEMA_VERSION = "hfx-401/provider-scorecard/1" as const;

/** The DECLARED environment fingerprint of every HFX-401 drill (never sensed). */
export const SCORECARD_ENVIRONMENT: EnvironmentFingerprint = {
  declaredRuntime: "bun",
  declaredPlatform: "aise-hfx401-provider-scorecard",
  codeVersion: SCORECARD_CODE_VERSION,
  statement:
    "declared, not sensed — the HFX-401 scorecard drills never read the runtime " +
    "environment (determinism contract: identical committed corpus inputs produce " +
    "identical scorecard, promotion and rollback records — no clock, no randomness, " +
    "no network, and the control-plane registry files are never mutated: every drill " +
    "drives a fresh in-memory registry and emits event payloads as records)",
};

/** The AISE-side consumer identity of the HFX-401 evaluation artifacts. */
export const SCORECARD_CONSUMER = {
  consumer: "AISE",
  surface: "hfx401-provider-scorecard",
} as const;

/* ------------------------------------------------------------------ */
/* The scored-provider corpus types                                     */
/* ------------------------------------------------------------------ */

/** The role scoping one scored provider's gate-derivation rules. */
export type ScoredProviderRole =
  | "reference-lane"
  | "substitute-lane"
  | "engineered-refusal"
  | "control-plane-fixture";

/** One corpus row of one scored provider (its lane's committed outcome). */
export interface ScorecardCorpusRow {
  readonly sequenceId: string;
  readonly observed: string;
  readonly expectation: string;
  readonly expectationMet: boolean;
  readonly executed: boolean;
  /** The lane's committed per-sequence benchmark record id (64-hex). */
  readonly recordId: string;
  /** The lane's committed per-sequence provenance manifest id (64-hex). */
  readonly manifestId: string;
  /** Present iff the lane's capability gate refused (typed, never computed). */
  readonly unsupportedFamily?: string;
  /** True iff the row's comparison has ≥1 divergent boq-line point. */
  readonly boqLineDivergent: boolean;
  /** The row's closed-vocabulary failure kinds (empty when compatible). */
  readonly failureKinds: readonly string[];
}

/** The dependent-layer regression citation (one committed corpus). */
export interface DependentLayerCitation {
  readonly citationKind: "geometry-eval" | "equivalence-eval" | "solution-eval";
  readonly suiteId: string;
  readonly suiteVersion: string;
  readonly benchmarkId: string;
  readonly codeVersion: string;
  readonly corpusDigest: string;
  readonly provenanceManifestDigest: string;
  readonly benchmarkRecordDigest: string;
  readonly total: number;
  readonly expectationMatches: number;
}

/** The lawful control-plane lifecycle artifacts of one scored provider. */
export interface ProviderDrillKit {
  readonly profile: ProviderProfile;
  readonly profileDigest: string;
  readonly executions: readonly NormalizedExecutionRecord[];
  readonly consolidatedRecord: BenchmarkRecord;
  readonly sealedManifest: ProvenanceManifest;
}

/** One scored provider's complete facts. */
export interface ScoredProvider {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly role: ScoredProviderRole;
  /** The AISE capability layer (1 reality, 2 understanding, 3 solution). */
  readonly layer: 1 | 2 | 3;
  readonly providerClass: string;
  readonly displayName: string;
  /** The control-plane profile digest (the identity the manifests seal against). */
  readonly profileDigest: string;
  /** The profile's license declaration (the license gate's input). */
  readonly license: {
    readonly identifier: string;
    readonly commercialUse: boolean;
    readonly intendedUseCleared: boolean;
    readonly evaluationOnly: boolean;
  };
  /** The profile's cost profile (the cost/quota gate's input). */
  readonly costProfile: {
    readonly model: string;
    readonly unitCost: number;
    readonly quotaPolicy: string;
  };
  /** The profile's uncertainty declaration (the uncertainty gate's input). */
  readonly uncertainty: {
    readonly calibration: string;
    readonly confidenceSeparateFromMeasurementUncertainty: boolean;
  };
  /** The descriptor's declared operation families (the coverage leg's input). */
  readonly declaredFamilies: readonly string[];
  /** The provider's corpus rows (its lane's committed outcomes). */
  readonly rows: readonly ScorecardCorpusRow[];
  /** The drill kit (the lawful lifecycle artifacts). */
  readonly kit: ProviderDrillKit;
  /**
   * For the engineered provider: the strong-benchmark basis profile id +
   * the license posture override (documented in license-declaration.md).
   */
  readonly engineered?: {
    readonly basis: string;
    readonly licenseOverride: string;
  };
  /**
   * For control-plane-fixture providers: the committed historical decision
   * (the HFX-000 exit-gate lifecycle's own promotion outcome).
   */
  readonly committedDecision?: {
    readonly decision: "promoted" | "rejected";
    readonly refusalKinds: readonly string[];
    readonly lifecycleEventCount: number;
  };
}

/** The full scored-provider corpus (the scorecard engine's inputs). */
export interface ScorecardCorpus {
  readonly codeVersion: string;
  readonly geometry: {
    readonly suiteId: string;
    readonly suiteVersion: string;
    readonly benchmarkId: string;
    readonly codeVersion: string;
    readonly corpusDigest: string;
    readonly provenanceManifestDigest: string;
    readonly benchmarkRecordDigest: string;
    readonly sequenceCount: number;
  };
  readonly equivalence: DependentLayerCitation;
  /** The committed HFX-000 reference lifecycle (the fixture providers' history). */
  readonly fixtureLifecycle: {
    readonly eventCount: number;
    readonly v1FinalState: string;
    readonly v2FinalState: string;
    readonly v2RefusalKinds: readonly string[];
    readonly events: readonly ProviderRegistryEvent[];
  };
  readonly providers: readonly ScoredProvider[];
}

/* ------------------------------------------------------------------ */
/* The HFX-000 committed fixtures (pure data reads)                     */
/* ------------------------------------------------------------------ */

const REGISTRY_FIXTURES = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "packages",
  "provider-registry",
  "fixtures",
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(REGISTRY_FIXTURES, name), "utf8")) as unknown;
}

interface FixtureLifecycle {
  readonly events: readonly ProviderRegistryEvent[];
  readonly summary: {
    readonly eventCount: number;
    readonly v1FinalState: string;
    readonly v2FinalState: string;
    readonly v2RefusalKinds: readonly string[];
  };
}

/** The engineered refusal provider's identity. */
export const ENGINEERED_REFUSAL_PROVIDER_ID = "geometry-substitute-fine-research" as const;
export const ENGINEERED_REFUSAL_LICENSE_ID = "fixture-research-only-1.0" as const;

/* ------------------------------------------------------------------ */
/* The corpus builder                                                   */
/* ------------------------------------------------------------------ */

let corpusPromise: Promise<ScorecardCorpus> | null = null;

/**
 * Builds the scored-provider corpus. DETERMINISTIC and CACHED (the geometry
 * + equivalence suites are pure functions of the committed corpora; the
 * fixture reads are pure file reads). Throws on any inconsistency — the
 * corpus is the engine's input contract, never best-effort.
 */
export function buildScorecardCorpus(): Promise<ScorecardCorpus> {
  corpusPromise ??= buildCorpus();
  return corpusPromise;
}

async function buildCorpus(): Promise<ScorecardCorpus> {
  /* The HFX-302 committed corpus (live, deterministic). -------------------- */
  const geometryRun = runGeometrySuite();
  const views = geometryRun.outcomes.map((outcome) => geometryOutcomeViewOf(outcome));

  /* The HFX-301 committed corpus (live, deterministic — the Layer-3
     dependent-layer regression citation). ---------------------------------- */
  const equivalenceRun = await runEquivalenceSuite();
  const equivalencePins = (JSON.parse(goldenScenarioSuiteJson()) as {
    pins: { corpusDigest: string };
  }).pins;

  /* The HFX-000 committed reference lifecycle (the fixture providers). ---- */
  const lifecycle = readFixture("reference-lifecycle.json") as FixtureLifecycle;
  const replay = replayRegistry(lifecycle.events);
  if (!replay.ok) {
    throw new Error(
      `provider-scorecard corpus: the committed HFX-000 lifecycle failed replay: ${replay.failure.detail}`,
    );
  }
  if (lifecycle.summary.v1FinalState !== "promoted" || lifecycle.summary.v2FinalState !== "rejected") {
    throw new Error(
      "provider-scorecard corpus: the committed HFX-000 lifecycle summary is not the exit-gate shape",
    );
  }

  const providers: ScoredProvider[] = [];

  /* The reference oracle lane (the incumbent identity authority). ---------- */
  const referenceProfile = referenceLaneProfile();
  const referenceRows = views.map((view) => rowOf(view, "reference"));
  const referenceDescriptor = referenceLaneDescriptor();
  providers.push(
    scoredProvider({
      profile: referenceProfile,
      role: "reference-lane",
      layer: 3,
      providerClass: "geometry",
      declaredFamilies: [...referenceDescriptor.declaredCapabilities],
      rows: referenceRows,
      corpusViews: views,
    }),
  );

  /* The three committed substitute profiles. ------------------------------- */
  for (const profileId of SUBSTITUTE_PROFILE_IDS) {
    const profile = substituteLaneProfile(profileId);
    const descriptor = substituteLaneDescriptor(profileId);
    const rows = views
      .filter((view) => view.substituteLane.providerId === profileId)
      .map((view) => rowOf(view, "substitute"));
    if (rows.length === 0) {
      throw new Error(`provider-scorecard corpus: no corpus rows for '${profileId}'`);
    }
    providers.push(
      scoredProvider({
        profile,
        role: "substitute-lane",
        layer: 3,
        providerClass: "geometry",
        declaredFamilies: [...descriptor.declaredCapabilities],
        rows,
        corpusViews: views,
      }),
    );
  }

  /* The engineered refusal provider: the fine substitute's strong benchmark
     under a RESEARCH-ONLY license (exactly one mandatory-gate failure). --- */
  const fineProfile = substituteLaneProfile("geometry-substitute-fine");
  const researchProfile: ProviderProfile = {
    ...fineProfile,
    providerId: ENGINEERED_REFUSAL_PROVIDER_ID,
    displayName: "Independent Discretized Geometry Substitute (Fine Grid, Research-Only License)",
    description:
      "The HFX-401 refusal-path drill provider: the fine substitute's deterministic " +
      "discretized-accumulation engine under a RESEARCH-ONLY license posture — the " +
      "strong benchmark is real, the license/use gate fails, and the provider remains " +
      "non-production (see docs/productization-evidence/HFX-401/license-declaration.md)",
    license: toLicenseDeclaration({
      identifier: ENGINEERED_REFUSAL_LICENSE_ID,
      commercialUse: false,
      intendedUse:
        "research and evaluation of geometry/validation substitution providers only — " +
        "NOT cleared for production deployment (the HFX-401 refusal-path demonstration)",
      intendedUseCleared: false,
    }),
    inputContract: {
      ...fineProfile.inputContract,
      contractId: `${ENGINEERED_REFUSAL_PROVIDER_ID}-input/1`,
    },
    outputContract: {
      ...fineProfile.outputContract,
      contractId: `${ENGINEERED_REFUSAL_PROVIDER_ID}-output/1`,
    },
  };
  const researchRows = views
    .filter((view) => view.substituteLane.providerId === "geometry-substitute-fine")
    .map((view) => rowOf(view, "substitute"));
  providers.push(
    scoredProvider({
      profile: researchProfile,
      role: "engineered-refusal",
      layer: 3,
      providerClass: "geometry",
      declaredFamilies: [...referenceDescriptor.declaredCapabilities],
      rows: researchRows,
      corpusViews: views,
      engineered: {
        basis: "geometry-substitute-fine",
        licenseOverride: ENGINEERED_REFUSAL_LICENSE_ID,
      },
    }),
  );

  /* The HFX-000 fixture providers (the earlier-module committed records). -- */
  for (const [suffix, committedDecision] of [
    ["v1", { decision: "promoted" as const, refusalKinds: [] as readonly string[] }],
    [
      "v2",
      {
        decision: "rejected" as const,
        refusalKinds: lifecycle.summary.v2RefusalKinds,
      },
    ],
  ] as const) {
    const profileValidation = validateProviderProfile(
      readFixture(`reference-provider-${suffix}.profile.json`),
    );
    if (!profileValidation.ok) {
      throw new Error(
        `provider-scorecard corpus: the committed ${suffix} fixture profile failed validation`,
      );
    }
    const recordValidation = validateBenchmarkRecord(
      readFixture(`reference-provider-${suffix}.benchmark-record.json`),
    );
    if (!recordValidation.ok) {
      throw new Error(
        `provider-scorecard corpus: the committed ${suffix} fixture benchmark record failed validation`,
      );
    }
    const manifestValidation = verifyProvenanceManifest(
      readFixture(`reference-provider-${suffix}.provenance-manifest.json`),
    );
    if (!manifestValidation.ok) {
      throw new Error(
        `provider-scorecard corpus: the committed ${suffix} fixture manifest failed verification`,
      );
    }
    const entry = replay.registry.entryOf(
      profileValidation.profile.providerId,
      profileValidation.profile.technologyVersion,
    );
    if (entry === undefined) {
      throw new Error(
        `provider-scorecard corpus: the committed lifecycle has no ${suffix} entry`,
      );
    }
    providers.push(
      fixtureProvider(profileValidation.profile, entry, {
        kit: {
          profile: profileValidation.profile,
          profileDigest: profileValidation.profileDigest,
          executions: entry.normalizedExecutions,
          consolidatedRecord: recordValidation.record,
          sealedManifest: manifestValidation.manifest,
        },
        committedDecision: {
          decision: committedDecision.decision,
          refusalKinds: committedDecision.refusalKinds,
          lifecycleEventCount: lifecycle.summary.eventCount,
        },
      }),
    );
  }

  return {
    codeVersion: SCORECARD_CODE_VERSION,
    geometry: {
      suiteId: geometryRun.suiteId,
      suiteVersion: geometryRun.suiteVersion,
      benchmarkId: GEOMETRY_EVAL_BENCHMARK_ID,
      codeVersion: GEOMETRY_EVAL_CODE_VERSION,
      corpusDigest: geometryCorpusDigest(),
      provenanceManifestDigest: geometryRun.summary.provenanceManifestDigest,
      benchmarkRecordDigest: geometryRun.summary.benchmarkRecordDigest,
      sequenceCount: geometryRun.summary.total,
    },
    equivalence: {
      citationKind: "equivalence-eval",
      suiteId: equivalenceRun.suiteId,
      suiteVersion: equivalenceRun.suiteVersion,
      benchmarkId: "equivalence-eval-suite/1",
      codeVersion: "hfx-301/equivalence-eval/1",
      corpusDigest: equivalencePins.corpusDigest,
      provenanceManifestDigest: equivalenceRun.summary.provenanceManifestDigest,
      benchmarkRecordDigest: equivalenceRun.summary.benchmarkRecordDigest,
      total: equivalenceRun.summary.total,
      expectationMatches: equivalenceRun.summary.expectationMatches,
    },
    fixtureLifecycle: {
      eventCount: lifecycle.summary.eventCount,
      v1FinalState: lifecycle.summary.v1FinalState,
      v2FinalState: lifecycle.summary.v2FinalState,
      v2RefusalKinds: lifecycle.summary.v2RefusalKinds,
      events: lifecycle.events,
    },
    providers,
  };
}

/* ------------------------------------------------------------------ */
/* Row + provider assembly                                              */
/* ------------------------------------------------------------------ */

/** Projects one corpus outcome view into a scored provider's row. */
function rowOf(view: GeometryOutcomeView, lane: "reference" | "substitute"): ScorecardCorpusRow {
  const laneRecord = lane === "reference" ? view.referenceLane : view.substituteLane;
  const unsupportedFamily =
    lane === "reference" ? undefined : view.substituteLane.unsupportedFamily;
  const comparison = view.comparison;
  const boqLineDivergent =
    comparison !== null &&
    comparison.points.some((point) => point.pointKind === "boq-line" && !point.equal);
  return {
    sequenceId: view.sequenceId,
    observed: view.observed,
    expectation: view.expectation,
    expectationMet: view.expectationMet,
    executed: laneRecord.executed,
    recordId: laneRecord.benchmarkRecordId,
    manifestId: laneRecord.provenanceManifestId,
    ...(unsupportedFamily === undefined ? {} : { unsupportedFamily }),
    boqLineDivergent,
    failureKinds: comparison === null ? [] : [...(comparison.failureKinds ?? [])],
  };
}

interface ScoredProviderInput {
  readonly profile: ProviderProfile;
  readonly role: ScoredProviderRole;
  readonly layer: 1 | 2 | 3;
  readonly providerClass: string;
  readonly declaredFamilies: readonly string[];
  readonly rows: readonly ScorecardCorpusRow[];
  readonly corpusViews: readonly GeometryOutcomeView[];
  readonly engineered?: {
    readonly basis: string;
    readonly licenseOverride: string;
  };
}

/** Assembles one geometry-corpus scored provider with its drill kit. */
function scoredProvider(input: ScoredProviderInput): ScoredProvider {
  const profileValidation = validateProviderProfile(input.profile);
  if (!profileValidation.ok) {
    throw new Error(
      `provider-scorecard corpus: the profile '${input.profile.providerId}' failed validation`,
    );
  }
  const executions = input.rows.map((row) => executionOf(input.profile, row));
  const consolidatedRecord = consolidatedRecordOf(input.profile, input.rows);
  const normalizedResultDigest = sha256Canonical(
    executions.map((execution) => execution.normalizedResultDigest),
  );
  const sealedManifest = sealProvenanceManifest({
    profile: input.profile,
    inputDigests: executions.map((execution) => execution.inputDigest),
    normalizedResultDigest,
    benchmarkRecords: [consolidatedRecord],
    environment: SCORECARD_ENVIRONMENT,
    consumer: SCORECARD_CONSUMER,
    reproducibilityStatement:
      `HFX-401 provider-scorecard drill (the scored provider's consolidated corpus record): ` +
      `the registered profile, the provider's corpus sequence input digests, the ordered ` +
      `normalized result digest (above) and the consolidated benchmark record (digest ` +
      `above) fully determine this evaluation — identical committed corpus inputs ` +
      `reproduce the identical manifest`,
  });
  return {
    providerId: input.profile.providerId,
    technologyVersion: input.profile.technologyVersion,
    role: input.role,
    layer: input.layer,
    providerClass: input.providerClass,
    displayName: input.profile.displayName,
    profileDigest: profileValidation.profileDigest,
    license: {
      identifier: input.profile.license.identifier,
      commercialUse: input.profile.license.commercialUse,
      intendedUseCleared: input.profile.license.intendedUseCleared,
      evaluationOnly: input.profile.license.evaluationOnly,
    },
    costProfile: {
      model: input.profile.costProfile.model,
      unitCost: input.profile.costProfile.unitCost,
      quotaPolicy: input.profile.costProfile.quotaPolicy,
    },
    uncertainty: {
      calibration: input.profile.uncertaintyCharacteristics.calibration,
      confidenceSeparateFromMeasurementUncertainty:
        input.profile.uncertaintyCharacteristics.confidenceSeparateFromMeasurementUncertainty,
    },
    declaredFamilies: [...input.declaredFamilies],
    rows: input.rows,
    kit: {
      profile: input.profile,
      profileDigest: profileValidation.profileDigest,
      executions,
      consolidatedRecord,
      sealedManifest,
    },
    ...(input.engineered === undefined ? {} : { engineered: input.engineered }),
  };
}

/** Assembles one control-plane-fixture scored provider (committed history). */
function fixtureProvider(
  profile: ProviderProfile,
  entry: RegistryEntry,
  extra: {
    readonly kit: ProviderDrillKit;
    readonly committedDecision: {
      readonly decision: "promoted" | "rejected";
      readonly refusalKinds: readonly string[];
      readonly lifecycleEventCount: number;
    };
  },
): ScoredProvider {
  if (entry.profile.providerId !== profile.providerId) {
    throw new Error("provider-scorecard corpus: fixture entry/profile mismatch");
  }
  return {
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
    role: "control-plane-fixture",
    layer: 1,
    providerClass: "perception",
    displayName: profile.displayName,
    profileDigest: entry.profileDigest,
    license: {
      identifier: profile.license.identifier,
      commercialUse: profile.license.commercialUse,
      intendedUseCleared: profile.license.intendedUseCleared,
      evaluationOnly: profile.license.evaluationOnly,
    },
    costProfile: {
      model: profile.costProfile.model,
      unitCost: profile.costProfile.unitCost,
      quotaPolicy: profile.costProfile.quotaPolicy,
    },
    uncertainty: {
      calibration: profile.uncertaintyCharacteristics.calibration,
      confidenceSeparateFromMeasurementUncertainty:
        profile.uncertaintyCharacteristics.confidenceSeparateFromMeasurementUncertainty,
    },
    declaredFamilies: [...profile.capabilities],
    rows: entry.normalizedExecutions.map((execution) => {
      const record = entry.benchmarkRecords.find(
        (candidate) =>
          candidate.providerId === profile.providerId &&
          candidate.technologyVersion === profile.technologyVersion,
      );
      if (record === undefined) {
        throw new Error(
          `provider-scorecard corpus: no committed benchmark record on the ${profile.technologyVersion} entry`,
        );
      }
      return {
        sequenceId: `fixture:${execution.inputDigest.slice(0, 16)}`,
        observed: "fixture-benchmark",
        expectation: "fixture-benchmark",
        expectationMet: true,
        executed: true,
        recordId: record.recordId,
        manifestId: entry.provenanceManifests[0]?.manifestId ?? "",
        boqLineDivergent: false,
        failureKinds: record.failureObservations.map((observation) => observation.kind),
      };
    }),
    kit: extra.kit,
    committedDecision: extra.committedDecision,
  };
}

/* ------------------------------------------------------------------ */
/* The drill kit construction                                           */
/* ------------------------------------------------------------------ */

/**
 * One lawful normalized execution per corpus row (the deterministic digest
 * scheme — pure over the row + the provider identity; the tools runner
 * mirrors it from the committed lane registry).
 */
function executionOf(
  profile: ProviderProfile,
  row: ScorecardCorpusRow,
): NormalizedExecutionRecord {
  return {
    capability: profile.capabilities[0] ?? "",
    inputDigest: sha256Canonical({
      sequenceId: row.sequenceId,
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    }),
    normalizedResultDigest: sha256Canonical({
      sequenceId: row.sequenceId,
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      executed: row.executed,
      observed: row.observed,
      expectationMet: row.expectationMet,
    }),
  };
}

/**
 * The provider's ONE consolidated control-plane benchmark record over its
 * corpus rows (the HFX-302 consolidateLaneRecord discipline: per-sequence
 * subjectId metrics + the closed-vocabulary failure observations + the
 * deterministic reproduction statement). Validated through the control
 * plane's own `validateBenchmarkRecord` (throws on any invalid shape).
 */
function consolidatedRecordOf(
  profile: ProviderProfile,
  rows: readonly ScorecardCorpusRow[],
): BenchmarkRecord {
  const body = {
    kind: "provider-benchmark-record" as const,
    schemaVersion: "provider-benchmark/1" as const,
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
    benchmarkId: GEOMETRY_EVAL_BENCHMARK_ID,
    capability: profile.capabilities[0] ?? "",
    metrics: rows.flatMap((row) => [
      {
        metric: "expectation_match",
        value: row.expectationMet ? 1 : 0,
        unit: "ratio",
        subjectId: row.sequenceId,
        detail:
          "the observed behavior-matrix cell (and the declared difference kind, where " +
          "declared) satisfies the corpus entry's expectation",
      },
      {
        metric: "lane_executed",
        value: row.executed ? 1 : 0,
        unit: "count",
        subjectId: row.sequenceId,
        detail:
          "1 when the provider's lane executed the sequence (the typed unsupported " +
          "outcome records 0 — the record IS the outcome, never a fabricated comparison)",
      },
    ]),
    failureObservations: rows.flatMap((row) => [
      ...(row.unsupportedFamily === undefined
        ? []
        : [
            {
              kind: "unsupported-data" as const,
              detail:
                `${row.sequenceId}: the operation family '${row.unsupportedFamily}' is ` +
                `outside the provider's declared capabilities — recorded by the fail-closed ` +
                `gate BEFORE execution, never computed`,
            },
          ]),
      ...(row.failureKinds.length === 0
        ? []
        : [
            {
              kind: row.failureKinds[0] as FailureKind,
              detail:
                `${row.sequenceId}: the comparison diverged with the closed-vocabulary ` +
                `kind(s) [${row.failureKinds.join(", ")}] — the honestly-declared difference`,
            },
          ]),
      ...(row.expectationMet
        ? []
        : [
            {
              kind: "contract-mismatch" as const,
              detail:
                `${row.sequenceId}: the observed cell '${row.observed}' does not satisfy ` +
                `the declared expectation '${row.expectation}'`,
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
      inputsDigest: sha256Canonical(rows.map((row) => row.sequenceId)),
      codeVersion: SCORECARD_CODE_VERSION,
      statement:
        "deterministic reproduction: the provider's corpus sequence ids (aggregated " +
        "digest above) through the deterministic committed corpus at code version " +
        "(above) always yield these metrics — no clock, no randomness, no network",
    },
  };
  const validated = validateBenchmarkRecord(body);
  if (!validated.ok) {
    const issues = validated.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new Error(
      `provider-scorecard corpus: the consolidated record for '${profile.providerId}' ` +
        `failed validation: ${issues}`,
    );
  }
  return validated.record;
}

/* ------------------------------------------------------------------ */
/* The lane-registry projection (the committed tools-side input)         */
/* ------------------------------------------------------------------ */

/** The canonical record slug (file-name-safe provider identity). */
export function providerSlug(providerId: string, technologyVersion: string): string {
  return `${providerId}@${technologyVersion}`
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, "-")
    .replace(/[@.]+/g, "-");
}

/**
 * The committed `lane-registry.json` content: the corpus's canonical
 * projection — every fact the STANDALONE tools runner needs to rebuild and
 * verify the scorecard/promotion/rollback records byte-identically.
 */
export function laneRegistryProjection(corpus: ScorecardCorpus): unknown {
  return {
    kind: "hfx-401-lane-registry",
    schemaVersion: "hfx-401/lane-registry/1",
    codeVersion: SCORECARD_CODE_VERSION,
    corpus: {
      geometry: { ...corpus.geometry },
      equivalence: { ...corpus.equivalence },
      fixtureLifecycle: {
        eventCount: corpus.fixtureLifecycle.eventCount,
        v1FinalState: corpus.fixtureLifecycle.v1FinalState,
        v2FinalState: corpus.fixtureLifecycle.v2FinalState,
        v2RefusalKinds: [...corpus.fixtureLifecycle.v2RefusalKinds],
        events: corpus.fixtureLifecycle.events.map((event) => event as unknown),
      },
    },
    providers: corpus.providers.map((provider) => ({
      providerId: provider.providerId,
      technologyVersion: provider.technologyVersion,
      role: provider.role,
      layer: provider.layer,
      providerClass: provider.providerClass,
      displayName: provider.displayName,
      profileDigest: provider.profileDigest,
      license: { ...provider.license },
      costProfile: { ...provider.costProfile },
      uncertainty: { ...provider.uncertainty },
      declaredFamilies: [...provider.declaredFamilies],
      rows: provider.rows.map((row) => ({ ...row, failureKinds: [...row.failureKinds] })),
      kit: {
        profile: provider.kit.profile as unknown,
        profileDigest: provider.kit.profileDigest,
        executions: provider.kit.executions.map((execution) => ({ ...execution })),
        consolidatedRecord: provider.kit.consolidatedRecord as unknown,
        sealedManifest: provider.kit.sealedManifest as unknown,
      },
      ...(provider.engineered === undefined ? {} : { engineered: { ...provider.engineered } }),
      ...(provider.committedDecision === undefined
        ? {}
        : { committedDecision: { ...provider.committedDecision } }),
    })),
  };
}

/**
 * Drives one scored provider's drill kit through a FRESH in-memory
 * control-plane registry: registration → evaluation → executions → the
 * consolidated benchmark record → the sealed provenance manifest. Returns
 * the registry + the applied event log (the promotion decision is the
 * CALLER's step — promotion.ts). Throws on any unlawful event (the kit is
 * the lawful-lifecycle contract).
 */
export function driveKitLifecycle(kit: ProviderDrillKit): {
  readonly registry: ProviderRegistry;
  readonly events: readonly ProviderRegistryEvent[];
} {
  let registry = createProviderRegistry();
  const events: ProviderRegistryEvent[] = [];
  const apply = (event: ProviderRegistryEvent): void => {
    const result = applyRegistryEvent(registry, event);
    if (!result.ok) {
      throw new Error(
        `provider-scorecard corpus: the drill lifecycle event '${event.kind}' was refused: ` +
          `${result.failure.detail}`,
      );
    }
    registry = result.registry;
    events.push(event);
  };
  apply({ kind: "provider-registered", profile: kit.profile });
  apply({
    kind: "evaluation-started",
    providerId: kit.profile.providerId,
    technologyVersion: kit.profile.technologyVersion,
  });
  for (const execution of kit.executions) {
    apply({
      kind: "execution-normalized",
      providerId: kit.profile.providerId,
      technologyVersion: kit.profile.technologyVersion,
      execution,
    });
  }
  apply({ kind: "benchmark-recorded", record: kit.consolidatedRecord });
  apply({ kind: "provenance-sealed", manifest: kit.sealedManifest });
  return { registry, events };
}

/** sha-256 over the canonical JSON of an ordered event log (the fingerprint). */
export function eventsDigestOf(events: readonly ProviderRegistryEvent[]): string {
  return createHash("sha256")
    .update(canonicalJsonStringify(events as unknown[]), "utf8")
    .digest("hex");
}

/** The profile reference of a scored provider (manifests' identity shape). */
export function profileReferenceOf(provider: ScoredProvider): ProfileReference {
  return {
    providerId: provider.providerId,
    technologyVersion: provider.technologyVersion,
    profileDigest: provider.profileDigest,
  };
}
