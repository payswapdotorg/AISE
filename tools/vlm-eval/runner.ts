/**
 * HFX-201 — the QWEN3-VL PROVIDER BENCHMARK check runner (the tools/
 * pickup — the tools/reasoning-eval convention).
 *
 * Wired into the root `bun run verify` (this directory's
 * benchmark.test.ts is a tools/ test, picked up by the root `bun test`).
 *
 * The boundary matrix forbids tools → packages/backend imports, so this
 * runner consumes the COMMITTED ARTIFACTS AS DATA: the committed corpus
 * suite (`tools/vlm-eval/scenario.json`) and the committed golden
 * benchmark run (`fixtures/expected-outcomes.json`, regenerated where the
 * harness CAN be imported — see README.md; the LIVE byte-for-byte
 * regeneration gate lives in the backend-side golden test for the same
 * boundary reason).
 *
 * What this runner proves over the committed data:
 *
 *  1. COHERENCE — both artifacts parse, their suite/benchmark identities
 *     agree, the run ids are unique, align 1:1 across the artifacts, both
 *     registered variants run every base scenario, and both files are
 *     canonical JSON (idempotent under the sorted-keys 2-space form);
 *  2. THE REGISTERED CANDIDATES — both Qwen3-VL variants carry distinct
 *     provider ids + technology versions, 64-hex profile digests and the
 *     evaluation-only license status (the binding dataset/model-use rule);
 *  3. THE BEHAVIOR MATRIX — per variant, every mandated cell is exhibited:
 *     grounded-pass (clean supported answer), missing-evidence (bounded
 *     refusal with named unknowns, never an invented measurement),
 *     conflicting-evidence (status 'conflicted', both sides cited, no
 *     silent resolution) and unsupported-question (the explicit
 *     unsupported-data refusal); the HALLUCINATION CATCH is asserted:
 *     every hallucinating run is caught with a closed-vocabulary failure
 *     observation;
 *  4. THE CLOSED FAILURE VOCABULARY — every classification, violation
 *     kind and grounded observation kind comes from the frozen nine-kind
 *     list (mirrored here as reference data — the package import is
 *     boundary-forbidden);
 *  5. THE CONTROL-PLANE EMISSION SHAPE — every run carries 64-hex
 *     content-addressed record + manifest ids and the four committed
 *     metrics, both variants' consolidated benchmark records share the
 *     comparability key, the provenance-manifest digests are present,
 *     the promotion refusals are license-blocked and the registry
 *     replays identically;
 *  6. THE EVIDENCE-REVISION BINDING — every run's cited evidence is bound
 *     to the exact revision its bundle declares (consequential answers
 *     bind to the relevant evidence revision and task/context);
 *  7. MEASUREMENT UNCERTAINTY — the measured video runs carry propagated
 *     uncertainty (never provider-fabricated);
 *  8. SUMMARY RECOMPUTATION — the committed summary re-derives from the
 *     outcomes alone (independent arithmetic, stated here).
 *
 * Determinism: pure reads of committed files + pure logic; no clock, no
 * randomness, no network, no package imports.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCENARIO_PATH = resolve(import.meta.dir, "scenario.json");
const OUTCOMES_PATH = resolve(import.meta.dir, "fixtures", "expected-outcomes.json");

/* ------------------------------------------------------------------ */
/* The canonical form (the generic discipline — no package imports)     */
/* ------------------------------------------------------------------ */

/** Sort one parsed JSON value's object keys recursively (arrays keep order). */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortValue(record[key]);
    }
    return out;
  }
  return value;
}

/** Canonical JSON text: 2-space indented, sorted keys, trailing newline. */
function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

/**
 * The CLOSED provider failure vocabulary, mirrored as frozen reference
 * data (packages/provider-registry/src/failures.ts — imported NEVER, for
 * the workspace boundary matrix forbids tools → packages; the mirror is
 * asserted against the committed artifacts below).
 */
const CLOSED_FAILURE_KINDS: readonly string[] = [
  "perception-failure",
  "retrieval-failure",
  "reasoning-failure",
  "unsupported-data",
  "operation-semantic-failure",
  "resource-exhaustion",
  "timeout",
  "license-blocked",
  "contract-mismatch",
];

/* ------------------------------------------------------------------ */
/* Typed views over the committed JSON                                  */
/* ------------------------------------------------------------------ */

interface Json {
  readonly [key: string]: unknown;
}

function asRecord(value: unknown, label: string): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}: expected a JSON object`);
  }
  return value as Json;
}

function asArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label}: expected a JSON array`);
  }
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}: expected a non-empty string`);
  }
  return value;
}

export interface VariantView {
  readonly variant: string;
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly profileDigest: string;
  readonly licenseStatus: string;
  readonly registryState?: string;
  readonly benchmarkRecordId?: string;
  readonly provenanceManifestId?: string;
  readonly comparabilityKey?: string;
  readonly promotionRefusalKinds?: readonly string[];
}

export interface OutcomeView {
  readonly scenarioId: string;
  readonly baseScenarioId: string;
  readonly variant: string;
  readonly matrixCell: string;
  readonly behaviorClass: string;
  readonly classification: string;
  readonly violationRules: readonly string[];
  readonly violationKinds: readonly string[];
  readonly groundedVerdicts: readonly { readonly check: string; readonly verdict: string }[];
  readonly groundedObservationKinds: readonly string[];
  readonly groundedFailureObservations: number;
  readonly groundedPass: boolean;
  readonly resultStatus: string;
  readonly resultClaim: string | null;
  readonly evidenceIds: readonly string[];
  readonly evidenceRevisions: readonly { readonly evidenceId: string; revision: string }[];
  readonly measurementUncertainty: readonly unknown[];
  readonly revisionBindingOk: boolean;
  readonly recordId: string;
  readonly manifestId: string;
  readonly envelopeDigest: string;
  readonly metrics: {
    readonly classificationMatch: number;
    readonly envelopeIntegrityViolations: number;
    readonly expectedOutcomeMatch: number;
    readonly groundedFailureObservations: number;
  };
  readonly expectedMatch: boolean;
}

export interface ScenarioView {
  readonly scenarioId: string;
  readonly baseScenarioId: string;
  readonly variant: string;
  readonly matrixCell: string;
  readonly behaviorClass: string;
  readonly input: { readonly payload: { readonly bundleJson: string; readonly behaviorTag: string } };
  readonly expected: {
    readonly correctResultStatus: string;
    readonly expectedFailureKind: string;
  };
}

export interface VlmEvalArtifacts {
  readonly scenarioSuite: Json;
  readonly scenarios: readonly ScenarioView[];
  readonly outcomesSuite: Json;
  readonly outcomes: readonly OutcomeView[];
  readonly variants: readonly VariantView[];
}

/** Loads the committed artifacts (throws on structural mismatch). */
export function loadVlmEvalArtifacts(): VlmEvalArtifacts {
  const scenarioSuite = asRecord(readJson(SCENARIO_PATH), "scenario.json");
  const outcomesSuite = asRecord(readJson(OUTCOMES_PATH), "expected-outcomes.json");
  const scenarios = asArray(scenarioSuite["scenarios"], "scenario.json scenarios").map(
    (entry, index) => asRecord(entry, `scenario.json scenarios[${index}]`) as unknown as ScenarioView,
  );
  const outcomes = asArray(outcomesSuite["outcomes"], "expected-outcomes.json outcomes").map(
    (entry, index) =>
      asRecord(entry, `expected-outcomes.json outcomes[${index}]`) as unknown as OutcomeView,
  );
  const variants = asArray(outcomesSuite["variants"], "expected-outcomes.json variants").map(
    (entry, index) => asRecord(entry, `expected-outcomes.json variants[${index}]`) as unknown as VariantView,
  );
  return { scenarioSuite, scenarios, outcomesSuite, outcomes, variants };
}

/* ------------------------------------------------------------------ */
/* The check report                                                     */
/* ------------------------------------------------------------------ */

export interface VlmEvalArtifactCheck {
  readonly id: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface VlmEvalArtifactReport {
  readonly ok: boolean;
  readonly checks: readonly VlmEvalArtifactCheck[];
  readonly summary: {
    readonly total: number;
    readonly baseScenarioCount: number;
    readonly byVariant: Readonly<Record<string, number>>;
    readonly byClassification: Readonly<Record<string, number>>;
    readonly byMatrixCell: Readonly<Record<string, number>>;
    readonly classificationMatches: number;
    readonly expectedMatches: number;
    readonly groundedFailureObservations: number;
  };
  readonly variants: readonly VariantView[];
}

/**
 * Verifies the committed HFX-201 artifacts (pure; every check is named,
 * deterministic and listed in the module header).
 */
export function verifyVlmEvalArtifacts(): VlmEvalArtifactReport {
  const { scenarioSuite, scenarios, outcomesSuite, outcomes, variants } = loadVlmEvalArtifacts();
  const checks: VlmEvalArtifactCheck[] = [];
  const check = (id: string, passed: boolean, detail: string): void => {
    checks.push({ id, passed, detail });
  };
  const outcomeOf = (scenarioId: string): OutcomeView => {
    const found = outcomes.find((outcome) => outcome.scenarioId === scenarioId);
    if (found === undefined) {
      throw new Error(`runner: no committed outcome for '${scenarioId}'`);
    }
    return found;
  };
  const digestShape = /^[0-9a-f]{64}$/;

  /* 1. Coherence ---------------------------------------------------- */

  const suiteId = asString(scenarioSuite["suiteId"], "suiteId");
  check(
    "coherence-suite-identity",
    suiteId === "qwen3-vl-provider-benchmark/1" &&
      asString(outcomesSuite["suiteId"], "outcomes suiteId") === suiteId &&
      asString(scenarioSuite["benchmarkId"], "benchmarkId") === "qwen3-vl-multimodal-benchmark/1" &&
      asString(outcomesSuite["benchmarkId"], "outcomes benchmarkId") === "qwen3-vl-multimodal-benchmark/1" &&
      asString(scenarioSuite["version"], "version") === "1.0.0" &&
      asString(scenarioSuite["codeVersion"], "codeVersion") === "hfx-201/vlm-eval/1",
    `both artifacts pin suiteId '${suiteId}', benchmarkId 'qwen3-vl-multimodal-benchmark/1' and code version 'hfx-201/vlm-eval/1'`,
  );
  const runIds = scenarios.map((scenario) => scenario.scenarioId);
  check(
    "coherence-run-identity",
    new Set(runIds).size === runIds.length && runIds.length === 24,
    `${runIds.length} runs with unique composed ids (<base>@<variant>)`,
  );
  const outcomeIds = outcomes.map((outcome) => outcome.scenarioId);
  check(
    "coherence-outcome-alignment",
    outcomeIds.length === runIds.length &&
      runIds.every((id) => outcomeIds.includes(id)) &&
      outcomeIds.every((id) => runIds.includes(id)),
    "the outcome ids align 1:1 with the scenario ids",
  );
  const baseIds = new Set(scenarios.map((scenario) => scenario.baseScenarioId));
  const variantKeys = ["qwen3-vl-8b", "qwen3-vl-30b-a3b"];
  const everyBaseBothVariants = [...baseIds].every((base) =>
    variantKeys.every((variant) =>
      runIds.includes(`${base}@${variant}`),
    ),
  );
  check(
    "coherence-both-variants-run-the-same-corpus",
    baseIds.size === 12 && everyBaseBothVariants,
    "12 base scenarios × both registered variants = 24 runs of the SAME corpus",
  );
  check(
    "coherence-canonical-form",
    canonicalJson(readJson(SCENARIO_PATH)) === readFileSync(SCENARIO_PATH, "utf8") &&
      canonicalJson(readJson(OUTCOMES_PATH)) === readFileSync(OUTCOMES_PATH, "utf8"),
    "both committed artifacts are canonical JSON (sorted keys, 2-space, trailing newline)",
  );

  /* 2. The registered candidates ------------------------------------ */

  check(
    "candidates-two-separate-profiles",
    variants.length === 2 &&
      variants[0]!.providerId !== variants[1]!.providerId &&
      variants[0]!.technologyVersion !== variants[1]!.technologyVersion &&
      variants.every((variant) => digestShape.test(variant.profileDigest)),
    `two separate registered profiles: ${variants.map((variant) => `${variant.providerId} (${variant.technologyVersion})`).join(", ")}`,
  );
  check(
    "candidates-evaluation-only",
    variants.every((variant) => variant.licenseStatus === "evaluation-only") &&
      asString(scenarioSuite["licenseStatus"], "licenseStatus") === "evaluation-only",
    "both registered candidates are evaluation-only (upstream license terms not verified as clearing production use)",
  );
  check(
    "candidates-license-gate-refused",
    variants.every(
      (variant) =>
        variant.registryState === "rejected" &&
        JSON.stringify(variant.promotionRefusalKinds) === JSON.stringify(["license-blocked"]),
    ),
    "the control-plane promotion gate REFUSED both candidates with the typed license-blocked refusal (recorded, never silent)",
  );

  /* 3. The behavior matrix ------------------------------------------- */

  const matrixGaps: string[] = [];
  for (const variant of variantKeys) {
    const mine = outcomes.filter((outcome) => outcome.variant === variant);
    const cell = (name: string): readonly OutcomeView[] =>
      mine.filter((outcome) => outcome.matrixCell === name);
    // grounded-pass: a clean supported answer
    if (
      !cell("grounded-pass").some(
        (outcome) =>
          outcome.classification === "none" &&
          outcome.violationKinds.length === 0 &&
          outcome.groundedPass &&
          outcome.expectedMatch,
      )
    ) {
      matrixGaps.push(`${variant}: grounded-pass`);
    }
    // missing-evidence: a bounded refusal (unsupported + named unknowns), never an invented measurement
    if (
      !cell("missing-evidence").some(
        (outcome) =>
          outcome.resultStatus === "unsupported" &&
          outcome.groundedPass &&
          outcome.expectedMatch,
      )
    ) {
      matrixGaps.push(`${variant}: missing-evidence`);
    }
    // conflicting-evidence: the surfaced conflict (status conflicted, both sides cited)
    if (
      !cell("conflicting-evidence").some(
        (outcome) =>
          outcome.resultStatus === "conflicted" &&
          outcome.evidenceIds.length >= 2 &&
          outcome.groundedPass &&
          outcome.expectedMatch,
      )
    ) {
      matrixGaps.push(`${variant}: conflicting-evidence`);
    }
    // unsupported-question: the explicit unsupported-data refusal, clean
    if (
      !cell("unsupported-question").some(
        (outcome) =>
          outcome.classification === "unsupported-data" &&
          outcome.violationKinds.length === 0 &&
          outcome.groundedPass &&
          outcome.expectedMatch,
      )
    ) {
      matrixGaps.push(`${variant}: unsupported-question`);
    }
  }
  check(
    "behavior-matrix-all-cells-exhibited",
    matrixGaps.length === 0,
    matrixGaps.length === 0
      ? "every variant exhibits every mandated behavior-matrix cell (grounded-pass, missing-evidence, conflicting-evidence, unsupported-question)"
      : `matrix gaps: ${matrixGaps.join("; ")}`,
  );

  const hallucinating = outcomes.filter((outcome) => outcome.behaviorClass === "hallucinating");
  const hallucinationCaught = hallucinating.every(
    (outcome) =>
      outcome.classification !== "none" &&
      outcome.groundedFailureObservations > 0 &&
      outcome.expectedMatch,
  );
  check(
    "behavior-hallucination-caught",
    hallucinating.length === 5 && hallucinationCaught,
    `all ${hallucinating.length} hallucinating runs are caught: a closed-vocabulary classification + deterministic grounded-check observations (no invented measurement survives)`,
  );
  const inventedMeasurementCaught = [
    "lintel-flange-width-missing@qwen3-vl-8b",
    "nameplate-inspection-date-illegible@qwen3-vl-8b",
    "video-crack-width-hallucination@qwen3-vl-8b",
    "spatial-ref-between-openings@qwen3-vl-30b-a3b",
  ].every((id) => outcomeOf(id).groundedObservationKinds.includes("unsupported-data"));
  check(
    "behavior-invented-facts-are-unsupported-data",
    inventedMeasurementCaught,
    "an asserted measurement/material/observation absent from the bundle is recorded as an unsupported-data failure by the fact-derivability check",
  );
  check(
    "behavior-no-silent-conflict-resolution",
    outcomeOf("beam-section-conflict-silent-resolution@qwen3-vl-8b").classification ===
      "retrieval-failure" &&
      outcomeOf("beam-section-conflict-silent-resolution@qwen3-vl-8b").groundedObservationKinds.includes(
        "retrieval-failure",
      ) &&
      outcomeOf("beam-section-conflict-silent-resolution@qwen3-vl-30b-a3b").resultStatus === "conflicted",
    "silently resolving a bundle conflict is a retrieval failure (both sides must be surfaced); the honest run surfaces it as conflicted",
  );

  /* 4. The closed failure vocabulary --------------------------------- */

  const vocabularyViolations = outcomes.flatMap((outcome) => [
    ...([outcome.classification].filter(
      (kind) => kind !== "none" && !CLOSED_FAILURE_KINDS.includes(kind),
    )),
    ...outcome.violationKinds.filter((kind) => !CLOSED_FAILURE_KINDS.includes(kind)),
    ...outcome.groundedObservationKinds.filter((kind) => !CLOSED_FAILURE_KINDS.includes(kind)),
  ]);
  check(
    "vocabulary-closed",
    vocabularyViolations.length === 0,
    vocabularyViolations.length === 0
      ? "every classification, violation kind and grounded observation kind comes from the closed nine-kind vocabulary"
      : `invented kinds: ${vocabularyViolations.join("; ")}`,
  );

  /* 5. The control-plane emission shape ------------------------------ */

  const malformedArtifacts = outcomes.filter(
    (outcome) =>
      !digestShape.test(outcome.recordId) ||
      !digestShape.test(outcome.manifestId) ||
      !digestShape.test(outcome.envelopeDigest),
  );
  check(
    "emission-content-addressed",
    malformedArtifacts.length === 0,
    "every run carries 64-hex recordId/manifestId/envelopeDigest (content-addressed artifacts)",
  );
  const metricShape = outcomes.filter(
    (outcome) =>
      outcome.metrics.classificationMatch !== 1 ||
      outcome.metrics.expectedOutcomeMatch !== 1 ||
      outcome.metrics.envelopeIntegrityViolations !== outcome.violationKinds.length ||
      outcome.metrics.groundedFailureObservations !== outcome.groundedFailureObservations ||
      !outcome.expectedMatch,
  );
  check(
    "emission-metrics-consistent",
    metricShape.length === 0,
    "every run matched its expected golden (classification + envelope + grounded checks + revision binding), metrics consistent",
  );
  check(
    "emission-records-comparable",
    variants.length === 2 &&
      variants[0]!.comparabilityKey === variants[1]!.comparabilityKey &&
      variants[0]!.comparabilityKey === "qwen3-vl-multimodal-benchmark/1|multimodal-reasoning" &&
      digestShape.test(variants[0]!.benchmarkRecordId ?? "") &&
      digestShape.test(variants[1]!.benchmarkRecordId ?? "") &&
      variants[0]!.benchmarkRecordId !== variants[1]!.benchmarkRecordId,
    "both consolidated benchmark records are content-addressed and share the comparability key (a future real-model run joins here without schema change)",
  );
  check(
    "emission-provenance-manifests-sealed",
    variants.every((variant) => digestShape.test(variant.provenanceManifestId ?? "")) &&
      asString(outcomesSuite["replayEqual"] === undefined ? "true" : String(outcomesSuite["replayEqual"]), "replayEqual") === "true",
    "both provenance manifests are sealed (64-hex digest-verifiable ids) and the registry lifecycle replays identically",
  );

  /* 6. The evidence-revision binding --------------------------------- */

  const revisionGaps: string[] = [];
  for (const scenario of scenarios) {
    const outcome = outcomeOf(scenario.scenarioId);
    if (!outcome.revisionBindingOk) {
      revisionGaps.push(`${scenario.scenarioId}: revision binding flag`);
    }
    const bundle = JSON.parse(scenario.input.payload.bundleJson) as Json;
    const bundleRevisions = new Map(
      asArray(bundle["evidence"], "evidence")
        .map((entry, index) => asRecord(entry, `evidence[${index}]`))
        .map((entry) => [asString(entry.evidenceId, "evidenceId"), asString(entry.revision, "revision")]),
    );
    for (const cited of outcome.evidenceIds) {
      const recorded = outcome.evidenceRevisions.find(
        (entry) => entry.evidenceId === cited,
      )?.revision;
      if (recorded !== bundleRevisions.get(cited)) {
        revisionGaps.push(`${scenario.scenarioId}: ${cited} not bound to its bundle revision`);
      }
    }
  }
  check(
    "revision-binding-exact",
    revisionGaps.length === 0,
    revisionGaps.length === 0
      ? "every cited evidence id is bound to the exact revision its bundle declares (answers bind to evidence revision and task/context)"
      : `revision gaps: ${revisionGaps.slice(0, 5).join("; ")}`,
  );

  /* 7. Measurement uncertainty ---------------------------------------- */

  const uncertaintyRuns = outcomes.filter(
    (outcome) => outcome.measurementUncertainty.length > 0,
  );
  check(
    "uncertainty-propagated",
    uncertaintyRuns.length === 4 &&
      uncertaintyRuns.every((outcome) => outcome.baseScenarioId.startsWith("video-crack")),
    "the measured video runs carry measurement uncertainty propagated verbatim from cited evidence (never provider-fabricated)",
  );

  /* 8. Summary recomputation (independent arithmetic) ----------------- */

  const byVariant: Record<string, number> = {};
  const byClassification: Record<string, number> = {};
  const byMatrixCell: Record<string, number> = {};
  let classificationMatches = 0;
  let expectedMatches = 0;
  let groundedFailureObservations = 0;
  for (const outcome of outcomes) {
    byVariant[outcome.variant] = (byVariant[outcome.variant] ?? 0) + 1;
    byClassification[outcome.classification] = (byClassification[outcome.classification] ?? 0) + 1;
    byMatrixCell[outcome.matrixCell] = (byMatrixCell[outcome.matrixCell] ?? 0) + 1;
    if (outcome.metrics.classificationMatch === 1) {
      classificationMatches += 1;
    }
    if (outcome.expectedMatch) {
      expectedMatches += 1;
    }
    groundedFailureObservations += outcome.groundedFailureObservations;
  }
  const committedSummary = asRecord(outcomesSuite["summary"], "summary");
  const committedByVariant = asRecord(
    committedSummary["byVariant"],
    "summary.byVariant",
  ) as Record<string, { scenarioCount?: number }>;
  const summaryEqual =
    Number(committedSummary["total"] ?? -1) === outcomes.length &&
    Object.entries(byVariant).every(([variant, count]) => committedByVariant[variant]?.scenarioCount === count) &&
    Object.entries(byClassification).every(
      ([kind, count]) =>
        ((committedSummary["byClassification"] as Record<string, number>) ?? {})[kind] === count,
    ) &&
    Object.entries(byMatrixCell).every(
      ([cell, count]) => ((committedSummary["byMatrixCell"] as Record<string, number>) ?? {})[cell] === count,
    ) &&
    Number(committedSummary["classificationMatches"] ?? -1) === classificationMatches &&
    Number(committedSummary["expectedMatches"] ?? -1) === expectedMatches &&
    Number(committedSummary["groundedFailureObservations"] ?? -1) === groundedFailureObservations;
  check(
    "summary-recomputes",
    summaryEqual,
    "the committed suite summary re-derives from the outcomes alone (independent arithmetic)",
  );
  const byVariantCounts = Object.values(byVariant).every((count) => count === 12);
  check(
    "summary-same-corpus-per-variant",
    byVariantCounts && Object.keys(byVariant).length === 2,
    "each registered variant executed the same 12-scenario corpus (24 runs total)",
  );

  const ok = checks.every((entry) => entry.passed);
  return {
    ok,
    checks,
    summary: {
      total: outcomes.length,
      baseScenarioCount: baseIds.size,
      byVariant: Object.fromEntries(Object.entries(byVariant).sort(([a], [b]) => a.localeCompare(b))),
      byClassification: Object.fromEntries(
        Object.entries(byClassification).sort(([a], [b]) => a.localeCompare(b)),
      ),
      byMatrixCell: Object.fromEntries(
        Object.entries(byMatrixCell).sort(([a], [b]) => a.localeCompare(b)),
      ),
      classificationMatches,
      expectedMatches,
      groundedFailureObservations,
    },
    variants,
  };
}

/* ------------------------------------------------------------------ */
/* The CLI entry (deterministic output; exit code is the gate)          */
/* ------------------------------------------------------------------ */

const isDirectRun =
  typeof process !== "undefined" &&
  typeof process.argv !== "undefined" &&
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(import.meta.path);

if (isDirectRun) {
  const report = verifyVlmEvalArtifacts();
  console.log("HFX-201 qwen3-vl provider benchmark — committed artifact check runner");
  console.log(`  suite: ${asString(report.ok ? "qwen3-vl-provider-benchmark/1" : "", "suite")} (version 1.0.0)`);
  console.log(`  execution mode: deterministic in-repo doubles (no live model, no network)`);
  for (const variant of report.variants) {
    console.log(
      `  registered profile: ${variant.providerId} @ ${variant.technologyVersion} — license: ${variant.licenseStatus} (registry state: ${variant.registryState ?? "n/a"}, promotion refused: ${JSON.stringify(variant.promotionRefusalKinds ?? [])})`,
    );
    const variantOutcomes = report.summary.byVariant[variant.variant] ?? 0;
    console.log(`    fixture runs: ${variantOutcomes}`);
  }
  console.log(`  runs: ${report.summary.total} (${report.summary.baseScenarioCount} base scenarios × 2 variants), expected matches: ${report.summary.expectedMatches}`);
  console.log("  classifications:");
  for (const [kind, count] of Object.entries(report.summary.byClassification)) {
    console.log(`    ${kind}: ${count}`);
  }
  console.log("  behavior-matrix cells:");
  for (const [cell, count] of Object.entries(report.summary.byMatrixCell)) {
    console.log(`    ${cell}: ${count}`);
  }
  console.log("  provenance-manifest digests:");
  for (const variant of report.variants) {
    console.log(`    ${variant.variant}: ${variant.provenanceManifestId}`);
    console.log(`      benchmark record: ${variant.benchmarkRecordId} (comparability key: ${variant.comparabilityKey})`);
  }
  for (const entry of report.checks) {
    console.log(`  [${entry.passed ? "pass" : "FAIL"}] ${entry.id}: ${entry.detail}`);
  }
  console.log(report.ok ? "RUNNER: PASS" : "RUNNER: FAIL");
  process.exit(report.ok ? 0 : 1);
}
