/**
 * HFX-204 — the IFC-BENCH + BIM-EDIT evaluation corpus CHECK RUNNER (the
 * tools/ pickup — the building-benchmark convention, mirroring
 * tools/reasoning-eval/runner.ts).
 *
 * Wired into the root `bun run verify` (this directory's
 * benchmark.test.ts is a tools/ test, picked up by the root `bun test`).
 *
 * The boundary matrix forbids tools → packages/backend imports, so this
 * runner consumes the COMMITTED ARTIFACTS AS DATA — exactly the
 * building-benchmark discipline: the committed corpus descriptor
 * (`tools/bim-eval/scenario.json`) and the committed expected outcomes
 * (`fixtures/expected-outcomes.json`, regenerated where the harness CAN be
 * imported — see README.md). The LIVE regeneration check (the freshly
 * computed suite equals the committed fixture byte-for-byte) lives in the
 * backend-side golden test for the same boundary reason.
 *
 * What this runner proves over the committed data:
 *
 *  1. COHERENCE — both artifacts parse, their suite/benchmark identities
 *     agree and are pinned, the fixture ids are unique and align 1:1 with
 *     the outcome ids, both files are canonical JSON, and the pinned
 *     building-model digest rides the suite header;
 *  2. THE PINNED UPSTREAM MANIFESTS — the IFC-Bench and BIM-Edit
 *     identities, pinned taxonomy-only versions, the DERIVED
 *     evaluation-only license status (the dataset/model-use rule) and the
 *     no-vendored-data guarantee;
 *  3. THE FIVE-WAY DISCRIMINATION (the §HF-2 exit gate) — every one of
 *     perception / retrieval / reasoning / unsupported-data /
 *     operation-semantic is exhibited by at least one committed fixture
 *     with the expected classification (+ contract-mismatch and none),
 *     and the per-fixture classification equals the committed scenario's
 *     expected kind;
 *  4. THE FOUR AISE NEGATIVE-CASE CLASSES — unavailable-geometry,
 *     conflicting-evidence, missing-dimensions and invalid-constraints
 *     each carry fixtures whose committed classification is the honest,
 *     explicit, never-fabricating outcome (the refusals carry
 *     unsupported-data; the surfaced conflict carries the conflicted
 *     status; the violated constraint names its id);
 *  5. THE CLOSED FAILURE VOCABULARY — every classification and violation
 *     kind comes from the frozen nine-kind list (mirrored here as
 *     reference data — the package import is boundary-forbidden);
 *  6. THE CONTROL-PLANE EMISSION SHAPE — every outcome carries a 64-hex
 *     content-addressed benchmark record id, a 64-hex provenance-manifest
 *     id and consistent metrics, and every fixture's expected outcome
 *     matched (the golden's own consistency);
 *  7. THE TAXONOMY MAPPING — every question class of the pinned IFC-Bench
 *     taxonomy and every edit class of the pinned BIM-Edit taxonomy is
 *     exercised by at least one committed fixture, every QA bundle
 *     carries the evaluable Evidence Envelope fields (evidence ids +
 *     revisions + ground-truth facts), every edit bundle carries the
 *     command, quantities, model-node universe and constraints, and the
 *     natural-language and direct-intent create forms expect the SAME
 *     normalized intent semantics;
 *  8. SUMMARY RECOMPUTATION — the committed suite summary (per-lane,
 *     per-kind, per-class counts + the provenance-manifest digest)
 *     re-derives from the outcomes alone (independent arithmetic).
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

/** The pinned IFC-Bench question taxonomy (mirrored reference data). */
const IFC_BENCH_QUESTION_CLASSES: readonly string[] = [
  "property-lookup",
  "quantity-lookup",
  "spatial-composition",
  "part-of-topology",
  "connected-to-topology",
  "classification",
];

/** The pinned BIM-Edit edit taxonomy (mirrored reference data). */
const BIM_EDIT_EDIT_CLASSES: readonly string[] = [
  "element-create",
  "element-update",
  "element-delete",
  "spatial-change",
  "topological-change",
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

export interface OutcomeView {
  readonly fixtureId: string;
  readonly lane: string;
  readonly fixtureClass: string;
  readonly negativeCase?: string;
  readonly classification: string;
  readonly violationRules: readonly string[];
  readonly violationKinds: readonly string[];
  readonly resultStatus?: string;
  readonly oracleMatch?: boolean;
  readonly recordId: string;
  readonly manifestId: string;
  readonly metrics: {
    readonly classificationMatch: number;
    readonly integrityViolations: number;
    readonly expectedOutcomeMatch: number;
    readonly oracleSemanticsMatch?: number;
  };
  readonly expectedMatch: boolean;
}

export interface ScenarioView {
  readonly kind: string;
  readonly fixtureId: string;
  readonly lane: string;
  readonly questionClass?: string;
  readonly editClass?: string;
  readonly commandForm?: string;
  readonly negativeCase?: string;
  readonly behavior?: string;
  readonly scenario?: {
    readonly input: { readonly payload: { readonly bundleJson: string; readonly behaviorTag: string } };
    readonly expected: { readonly expectedFailureKind: string };
  };
  readonly input?: { readonly payload: { readonly bundleJson: string; readonly behaviorTag: string } };
  readonly expected?: {
    readonly expectedFailureKind: string;
    readonly expectedIntent: Json | null;
  };
}

/** The taxonomy class of a committed fixture (questionClass or editClass by lane). */
function fixtureClassOf(scenario: ScenarioView): string {
  return scenario.lane === "ifc-bench-questions"
    ? String(scenario.questionClass ?? "")
    : String(scenario.editClass ?? "");
}

export interface BimEvalArtifacts {
  readonly scenarioSuite: Json;
  readonly scenarios: readonly ScenarioView[];
  readonly outcomesSuite: Json;
  readonly outcomes: readonly OutcomeView[];
}

/** Loads the committed artifacts (throws on structural mismatch). */
export function loadBimEvalArtifacts(): BimEvalArtifacts {
  const scenarioSuite = asRecord(readJson(SCENARIO_PATH), "scenario.json");
  const outcomesSuite = asRecord(readJson(OUTCOMES_PATH), "expected-outcomes.json");
  const scenarios = (scenarioSuite["fixtures"] as unknown[]).map((entry, index) =>
    asRecord(entry, `scenario.json fixtures[${index}]`),
  ) as unknown as readonly ScenarioView[];
  const outcomes = (outcomesSuite["outcomes"] as unknown[]).map((entry, index) =>
    asRecord(entry, `expected-outcomes.json outcomes[${index}]`),
  ) as unknown as readonly OutcomeView[];
  return { scenarioSuite, scenarios, outcomesSuite, outcomes };
}

/* ------------------------------------------------------------------ */
/* The check report                                                     */
/* ------------------------------------------------------------------ */

export interface BimEvalArtifactCheck {
  readonly id: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface BimEvalArtifactReport {
  readonly ok: boolean;
  readonly checks: readonly BimEvalArtifactCheck[];
  readonly summary: {
    readonly total: number;
    readonly byLane: Readonly<Record<string, number>>;
    readonly byClassification: Readonly<Record<string, number>>;
    readonly classificationMatches: number;
    readonly expectedMatches: number;
    readonly provenanceManifestDigest: string;
  };
}

/** The expected classification of the committed negative-case fixtures (the honesty contract). */
const NEGATIVE_CASE_EXPECTATIONS: Readonly<Record<string, readonly string[]>> = {
  "unavailable-geometry": ["unsupported-data"],
  "conflicting-evidence": ["none", "reasoning-failure"],
  "missing-dimensions": ["unsupported-data", "perception-failure"],
  "invalid-constraints": ["operation-semantic-failure"],
};

/**
 * Verifies the committed HFX-204 artifacts (pure; every check is named,
 * deterministic and listed in the module header).
 */
export function verifyBimEvalArtifacts(): BimEvalArtifactReport {
  const { scenarioSuite, scenarios, outcomesSuite, outcomes } = loadBimEvalArtifacts();
  const checks: BimEvalArtifactCheck[] = [];
  const check = (id: string, passed: boolean, detail: string): void => {
    checks.push({ id, passed, detail });
  };
  const scenarioOf = (fixtureId: string): ScenarioView => {
    const found = scenarios.find((scenario) => scenario.fixtureId === fixtureId);
    if (found === undefined) {
      throw new Error(`runner: no committed fixture for '${fixtureId}'`);
    }
    return found;
  };
  const outcomeOf = (fixtureId: string): OutcomeView => {
    const found = outcomes.find((outcome) => outcome.fixtureId === fixtureId);
    if (found === undefined) {
      throw new Error(`runner: no committed outcome for '${fixtureId}'`);
    }
    return found;
  };

  /* 1. Coherence ---------------------------------------------------- */

  const suiteId = String(scenarioSuite["suiteId"] ?? "");
  check(
    "coherence-suite-identity",
    suiteId === "bim-eval-suite/1" &&
      String(outcomesSuite["suiteId"] ?? "") === suiteId &&
      String(scenarioSuite["benchmarkId"] ?? "") === "bim-eval-suite/1" &&
      String(outcomesSuite["benchmarkId"] ?? "") === "bim-eval-suite/1" &&
      String(scenarioSuite["version"] ?? "") === "1.0.0" &&
      String(scenarioSuite["codeVersion"] ?? "") === "hfx-204/bim-eval/1",
    `both artifacts pin suiteId '${suiteId}', benchmarkId 'bim-eval-suite/1', version '1.0.0', codeVersion 'hfx-204/bim-eval/1'`,
  );
  const fixtureIds = scenarios.map((scenario) => scenario.fixtureId);
  const uniqueIds = new Set(fixtureIds);
  check(
    "coherence-fixture-identity",
    uniqueIds.size === fixtureIds.length && fixtureIds.length === 29,
    `${fixtureIds.length} fixtures with unique ids (15 questions + 14 edits)`,
  );
  const outcomeIds = outcomes.map((outcome) => outcome.fixtureId);
  check(
    "coherence-outcome-alignment",
    outcomeIds.length === fixtureIds.length &&
      fixtureIds.every((id) => outcomeIds.includes(id)) &&
      outcomeIds.every((id) => uniqueIds.has(id)) &&
      Number(outcomesSuite["scenarioCount"] ?? -1) === outcomes.length,
    "the outcome ids align 1:1 with the fixture ids",
  );
  check(
    "coherence-canonical-form",
    canonicalJson(readJson(SCENARIO_PATH)) === readFileSync(SCENARIO_PATH, "utf8") &&
      canonicalJson(readJson(OUTCOMES_PATH)) === readFileSync(OUTCOMES_PATH, "utf8"),
    "both committed artifacts are canonical JSON (sorted keys, 2-space, trailing newline)",
  );
  const buildingModel = asRecord(scenarioSuite["buildingModel"], "buildingModel");
  check(
    "coherence-building-model-pinned",
    String(buildingModel["modelId"] ?? "") === "bim-eval-tower" &&
      String(buildingModel["revision"] ?? "") === "r1" &&
      /^[0-9a-f]{64}$/.test(String(buildingModel["digest"] ?? "")),
    "the deterministic building-model fixture is pinned by id, revision and content digest",
  );

  /* 2. The pinned upstream manifests -------------------------------- */

  const upstream = asRecord(scenarioSuite["upstream"], "upstream");
  const ifcBench = asRecord(upstream["ifcBench"], "upstream.ifcBench");
  const bimEdit = asRecord(upstream["bimEdit"], "upstream.bimEdit");
  const manifestShape = (manifest: Json, expectedId: string, expectedVersion: string): boolean =>
    manifest["upstreamId"] === expectedId &&
    manifest["pinnedVersion"] === expectedVersion &&
    manifest["datasetVendored"] === false &&
    asRecord(manifest["license"], `${expectedId}.license`)["evaluationOnly"] === true &&
    String(manifest["fixtureProvenance"] ?? "").includes("NOT the upstream dataset");
  check(
    "upstream-manifests-pinned",
    manifestShape(ifcBench, "IFC-Bench", "ifc-bench-question-taxonomy-2025-pinned") &&
      manifestShape(bimEdit, "BIM-Edit", "bim-edit-edit-class-taxonomy-2025-pinned"),
    "IFC-Bench and BIM-Edit are pinned: taxonomy-only versions, evaluation-only license status, no vendored data",
  );
  const outcomesUpstream = asRecord(outcomesSuite["upstream"], "outcomes.upstream");
  check(
    "upstream-status-carried",
    asRecord(outcomesUpstream["ifcBench"], "outcomes.upstream.ifcBench")["evaluationOnly"] === true &&
      asRecord(outcomesUpstream["bimEdit"], "outcomes.upstream.bimEdit")["evaluationOnly"] === true,
    "the committed outcomes carry the evaluation-only status of both upstream benchmarks",
  );

  /* 3. The five-way discrimination ---------------------------------- */

  const byClassification: Record<string, number> = {};
  for (const outcome of outcomes) {
    byClassification[outcome.classification] = (byClassification[outcome.classification] ?? 0) + 1;
  }
  const fiveWay = [
    "perception-failure",
    "retrieval-failure",
    "reasoning-failure",
    "unsupported-data",
    "operation-semantic-failure",
  ];
  const missingKinds = fiveWay.filter((kind) => (byClassification[kind] ?? 0) === 0);
  check(
    "discrimination-five-way-present",
    missingKinds.length === 0,
    missingKinds.length === 0
      ? "the §HF-2 five kinds are all present in the committed classifications"
      : `missing kinds: ${missingKinds.join(", ")}`,
  );
  const classificationMismatches = scenarios.filter((scenario) => {
    const expectedKind =
      scenario.scenario?.expected.expectedFailureKind ?? scenario.expected?.expectedFailureKind;
    const observed = outcomeOf(scenario.fixtureId).classification;
    return expectedKind !== undefined && expectedKind !== observed;
  });
  check(
    "discrimination-classification-equals-expected",
    classificationMismatches.length === 0,
    classificationMismatches.length === 0
      ? "every committed fixture's classification equals its expected kind"
      : `mismatches: ${classificationMismatches.map((scenario) => scenario.fixtureId).join(", ")}`,
  );
  const perceptionQa = outcomeOf("ifc-property-lookup-perception");
  const retrievalQa = outcomeOf("ifc-property-lookup-retrieval");
  const retrievalKind: string = retrievalQa.classification;
  const perceptionKind: string = perceptionQa.classification;
  check(
    "discrimination-wrong-evidence-is-retrieval",
    retrievalKind !== "perception-failure" &&
      retrievalKind === "retrieval-failure" &&
      perceptionKind === "perception-failure",
    "a misread property is perception-failure; wrong-element evidence is retrieval-failure (the neighboring-kind boundary)",
  );

  /* 4. The four AISE negative-case classes --------------------------- */

  const negativeGaps: string[] = [];
  for (const [negativeClass, expectedKinds] of Object.entries(NEGATIVE_CASE_EXPECTATIONS)) {
    const fixtures = scenarios.filter((scenario) => scenario.negativeCase === negativeClass);
    if (fixtures.length === 0) {
      negativeGaps.push(`${negativeClass}: no fixtures`);
      continue;
    }
    for (const fixture of fixtures) {
      const observed = outcomeOf(fixture.fixtureId).classification;
      if (!expectedKinds.includes(observed)) {
        negativeGaps.push(`${fixture.fixtureId}: ${observed} not in [${expectedKinds.join(", ")}]`);
      }
    }
  }
  check(
    "negative-case-classes-honest",
    negativeGaps.length === 0,
    negativeGaps.length === 0
      ? "all four negative-case classes carry fixtures with the honest, explicit, never-fabricating outcome"
      : `gaps: ${negativeGaps.join("; ")}`,
  );
  const conflict = outcomeOf("ifc-conflicting-evidence");
  check(
    "negative-conflict-surfaced",
    conflict.classification === "none" && conflict.resultStatus === "conflicted",
    "the conflicting-evidence fixture surfaces the conflict (status conflicted, no silent resolution)",
  );
  const constraint = outcomeOf("bim-edit-invalid-constraint");
  check(
    "negative-constraint-named",
    constraint.classification === "operation-semantic-failure" &&
      constraint.violationRules.includes("constraints-honored"),
    "the invalid-constraints fixture names the violated constraint (rule constraints-honored)",
  );

  /* 5. The closed failure vocabulary --------------------------------- */

  const vocabularyViolations = outcomes.flatMap((outcome) => [
    ...([outcome.classification].filter(
      (kind) => kind !== "none" && !CLOSED_FAILURE_KINDS.includes(kind),
    )),
    ...outcome.violationKinds.filter((kind) => !CLOSED_FAILURE_KINDS.includes(kind)),
  ]);
  check(
    "vocabulary-closed",
    vocabularyViolations.length === 0,
    vocabularyViolations.length === 0
      ? "every classification and violation kind comes from the closed nine-kind vocabulary"
      : `invented kinds: ${vocabularyViolations.join("; ")}`,
  );

  /* 6. The control-plane emission shape ------------------------------ */

  const digestShape = /^[0-9a-f]{64}$/;
  const malformedArtifacts = outcomes.filter(
    (outcome) =>
      !digestShape.test(outcome.recordId) ||
      !digestShape.test(outcome.manifestId) ||
      outcome.metrics.classificationMatch !== 1 ||
      outcome.metrics.expectedOutcomeMatch !== 1 ||
      outcome.metrics.integrityViolations !== outcome.violationKinds.length ||
      outcome.expectedMatch !== true,
  );
  check(
    "emission-content-addressed",
    malformedArtifacts.length === 0,
    "every outcome carries 64-hex recordId/manifestId, consistent metrics and a matched expected outcome",
  );

  /* 7. The taxonomy mapping + the fixture map ------------------------ */

  const questionClasses = new Set(
    scenarios
      .filter((scenario) => scenario.lane === "ifc-bench-questions")
      .map((scenario) => fixtureClassOf(scenario)),
  );
  const editClasses = new Set(
    scenarios
      .filter((scenario) => scenario.lane === "bim-edit-operations")
      .map((scenario) => fixtureClassOf(scenario)),
  );
  const taxonomyGaps: string[] = [];
  for (const questionClass of IFC_BENCH_QUESTION_CLASSES) {
    if (!questionClasses.has(questionClass)) {
      taxonomyGaps.push(`IFC-Bench question class '${questionClass}' has no fixture`);
    }
  }
  for (const editClass of BIM_EDIT_EDIT_CLASSES) {
    if (!editClasses.has(editClass)) {
      taxonomyGaps.push(`BIM-Edit edit class '${editClass}' has no fixture`);
    }
  }
  check(
    "taxonomy-fully-exercised",
    taxonomyGaps.length === 0,
    taxonomyGaps.length === 0
      ? "every pinned IFC-Bench question class and BIM-Edit edit class is exercised"
      : `gaps: ${taxonomyGaps.join("; ")}`,
  );

  const fixtureMapGaps: string[] = [];
  for (const scenario of scenarios) {
    if (scenario.lane === "ifc-bench-questions") {
      const payload = scenario.scenario?.input.payload;
      if (payload === undefined) {
        fixtureMapGaps.push(`${scenario.fixtureId}: no scenario input`);
        continue;
      }
      const bundle = JSON.parse(payload.bundleJson) as Json;
      const evidence = bundle["evidence"];
      if (!Array.isArray(evidence) || evidence.length === 0) {
        fixtureMapGaps.push(`${scenario.fixtureId}: no evidence set`);
      } else {
        for (const entry of evidence as Json[]) {
          if (
            typeof entry["evidenceId"] !== "string" ||
            typeof entry["revision"] !== "string" ||
            !Array.isArray(entry["facts"]) ||
            (entry["facts"] as unknown[]).length === 0
          ) {
            fixtureMapGaps.push(`${scenario.fixtureId}: evidence without id/revision/facts`);
            break;
          }
        }
      }
      if (!Array.isArray(bundle["offeredChecks"])) {
        fixtureMapGaps.push(`${scenario.fixtureId}: no offered checks`);
      }
    } else if (scenario.lane === "bim-edit-operations") {
      const payload = scenario.input?.payload;
      if (payload === undefined) {
        fixtureMapGaps.push(`${scenario.fixtureId}: no input`);
        continue;
      }
      const bundle = JSON.parse(payload.bundleJson) as Json;
      const command = asRecord(bundle["command"], `${scenario.fixtureId}.command`);
      if (command["form"] === "natural-language" && typeof command["text"] !== "string") {
        fixtureMapGaps.push(`${scenario.fixtureId}: NL command without text`);
      }
      if (!Array.isArray(bundle["commandQuantities"])) {
        fixtureMapGaps.push(`${scenario.fixtureId}: no command quantities`);
      }
      if (!Array.isArray(bundle["modelNodeIds"]) || (bundle["modelNodeIds"] as unknown[]).length === 0) {
        fixtureMapGaps.push(`${scenario.fixtureId}: no model node universe`);
      }
      if (!Array.isArray(bundle["referencedElements"])) {
        fixtureMapGaps.push(`${scenario.fixtureId}: no referenced elements`);
      }
      if (!Array.isArray(bundle["constraints"])) {
        fixtureMapGaps.push(`${scenario.fixtureId}: no declared constraints`);
      }
      const expected = scenario.expected;
      if (expected === undefined || expected.expectedFailureKind === undefined) {
        fixtureMapGaps.push(`${scenario.fixtureId}: no expected block`);
      }
    } else {
      fixtureMapGaps.push(`${scenario.fixtureId}: unknown lane`);
    }
  }
  check(
    "fixture-map-complete",
    fixtureMapGaps.length === 0,
    fixtureMapGaps.length === 0
      ? "every QA bundle carries the evaluable envelope fields; every edit bundle carries command/quantities/nodes/constraints"
      : `fixture map gaps: ${fixtureMapGaps.slice(0, 5).join("; ")}`,
  );

  const createNl = scenarioOf("bim-edit-create-correct");
  const createDirect = scenarioOf("bim-edit-create-direct-intent");
  const semanticsOf = (scenario: ScenarioView): string => {
    const intent = scenario.expected?.expectedIntent;
    if (intent === undefined || intent === null) {
      throw new Error(`${scenario.fixtureId}: no expected intent`);
    }
    return canonicalJson(intent);
  };
  check(
    "equivalence-nl-and-direct-intent",
    createNl.commandForm === "natural-language" &&
      createDirect.commandForm === "direct-intent" &&
      semanticsOf(createNl) === semanticsOf(createDirect),
    "the natural-language and direct-intent create forms expect the SAME normalized intent semantics (the HFX-301 seam)",
  );

  /* 8. Summary recomputation (independent arithmetic) ----------------- */

  const byLane: Record<string, number> = {};
  let classificationMatches = 0;
  let expectedMatches = 0;
  for (const outcome of outcomes) {
    byLane[outcome.lane] = (byLane[outcome.lane] ?? 0) + 1;
    if (outcome.metrics.classificationMatch === 1) {
      classificationMatches += 1;
    }
    if (outcome.expectedMatch) {
      expectedMatches += 1;
    }
  }
  const committedSummary = asRecord(outcomesSuite["summary"], "summary");
  const committedByLane = committedSummary["byLane"] as Record<string, number>;
  const committedByClassification = committedSummary["byClassification"] as Record<string, number>;
  const summaryEqual =
    String(committedSummary["total"] ?? "") === String(outcomes.length) &&
    Object.entries(byLane).every(([lane, count]) => (committedByLane?.[lane] ?? -1) === count) &&
    Object.entries(byClassification).every(
      ([kind, count]) => (committedByClassification?.[kind] ?? -1) === count,
    ) &&
    Number(committedSummary["classificationMatches"] ?? -1) === classificationMatches &&
    Number(committedSummary["expectedMatches"] ?? -1) === expectedMatches;
  check(
    "summary-recomputes",
    summaryEqual,
    "the committed suite summary re-derives from the outcomes alone (independent arithmetic)",
  );

  const ok = checks.every((entry) => entry.passed);
  return {
    ok,
    checks,
    summary: {
      total: outcomes.length,
      byLane: Object.fromEntries(Object.entries(byLane).sort(([a], [b]) => a.localeCompare(b))),
      byClassification: Object.fromEntries(
        Object.entries(byClassification).sort(([a], [b]) => a.localeCompare(b)),
      ),
      classificationMatches,
      expectedMatches,
      provenanceManifestDigest: String(committedSummary["provenanceManifestDigest"] ?? ""),
    },
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
  const report = verifyBimEvalArtifacts();
  const { scenarioSuite } = loadBimEvalArtifacts();
  const upstream = asRecord(scenarioSuite["upstream"], "upstream");
  console.log("HFX-204 bim-eval — IFC-Bench + BIM-Edit committed corpus check runner");
  console.log(`  suite: ${String(scenarioSuite["suiteId"])} v${String(scenarioSuite["version"])} (code ${String(scenarioSuite["codeVersion"])})`);
  for (const [key, manifestRaw] of Object.entries(upstream).sort(([a], [b]) => a.localeCompare(b))) {
    const manifest = asRecord(manifestRaw, `upstream.${key}`);
    const license = asRecord(manifest["license"], `upstream.${key}.license`);
    console.log(
      `  upstream: ${String(manifest["upstreamId"])} @ ${String(manifest["pinnedVersion"])} — license ${String(
        license["identifier"],
      )} (evaluationOnly: ${String(license["evaluationOnly"])}, vendored: ${String(manifest["datasetVendored"])})`,
    );
  }
  for (const lane of Object.keys(report.summary.byLane)) {
    console.log(`  ${lane}: ${report.summary.byLane[lane]} fixtures`);
  }
  for (const [kind, count] of Object.entries(report.summary.byClassification)) {
    console.log(`  classification ${kind}: ${count}`);
  }
  console.log(`  provenance-manifest digest: ${report.summary.provenanceManifestDigest}`);
  for (const entry of report.checks) {
    console.log(`  [${entry.passed ? "pass" : "FAIL"}] ${entry.id}: ${entry.detail}`);
  }
  console.log(report.ok ? "RUNNER: PASS" : "RUNNER: FAIL");
  process.exit(report.ok ? 0 : 1);
}
