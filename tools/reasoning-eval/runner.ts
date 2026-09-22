/**
 * PROD-028 — the LAYER-2 REASONING EVALUATION benchmark CHECK RUNNER (the
 * tools/ pickup — the building-benchmark convention).
 *
 * Wired into the root `bun run verify` (this directory's
 * benchmark.test.ts is a tools/ test, picked up by the root `bun test`
 * like tools/building-benchmark/benchmark.test.ts).
 *
 * The boundary matrix forbids tools → packages/backend imports, so this
 * runner consumes the COMMITTED ARTIFACTS AS DATA — exactly the
 * building-benchmark discipline: the committed scenario descriptor
 * (`tools/reasoning-eval/scenario.json`) and the committed expected
 * outcomes (`fixtures/expected-outcomes.json`, regenerated where the
 * harness CAN be imported — see README.md). The LIVE regeneration check
 * (the freshly computed suite equals the committed fixture byte-for-byte)
 * lives in the backend-side golden test for the same boundary reason.
 *
 * What this runner proves over the committed data:
 *
 *  1. COHERENCE — both artifacts parse, their suite/benchmark identities
 *     agree, the scenario ids are unique and align 1:1 with the outcome
 *     ids, and both files are canonical JSON (idempotent under the
 *     sorted-keys 2-space form);
 *  2. THE FIVE-WAY DISCRIMINATION (the §HF-2 exit gate) — per lane,
 *     every applicable closed-vocabulary failure kind is exhibited by at
 *     least one scenario: perception / retrieval / reasoning /
 *     unsupported-data / operation-semantic (+ contract-mismatch on all
 *     three lanes; operation-semantic is document-lane-applicable today —
 *     the BIM-Edit/HFX-204 hook);
 *  3. THE MANDATED NEGATIVE CASES — a hallucinating provider is CAUGHT
 *     (classification + an envelope integrity violation); a provider
 *     answering from the WRONG (but real) evidence is retrieval-failure,
 *     NOT reasoning-failure; an out-of-scope refusal is unsupported-data,
 *     NOT perception-failure; a FABRICATED hit id is unsupported-data,
 *     not a retrieval miss; the SAME empty behavior classifies
 *     retrieval-failure in-scope and unsupported-data out-of-scope;
 *  4. THE CLOSED FAILURE VOCABULARY — every violation kind and every
 *     classification comes from the frozen nine-kind list (mirrored here
 *     as reference data — the package import is boundary-forbidden);
 *  5. THE CONTROL-PLANE EMISSION SHAPE — every outcome carries a
 *     64-hex content-addressed benchmark record id, a 64-hex manifest id
 *     and the three committed metrics, and every scenario's expected
 *     outcome matched (the golden's own consistency);
 *  6. THE ENVELOPE FIXTURE MAP — every scenario bundle carries the
 *     evaluable canonical envelope fields (intent, authorized context,
 *     evidence ids + revisions + facts, offered checks) and the expected
 *     block carries the prediction + the correctness oracle;
 *  7. SUMMARY RECOMPUTATION — the committed suite summary re-derives
 *     from the outcomes alone (independent arithmetic, stated here).
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

export interface OutcomeView {
  readonly scenarioId: string;
  readonly lane: string;
  readonly classification: string;
  readonly violationRules: readonly string[];
  readonly violationKinds: readonly string[];
  readonly resultStatus: string;
  readonly recordId: string;
  readonly manifestId: string;
  readonly envelopeDigest: string;
  readonly metrics: {
    readonly classificationMatch: number;
    readonly envelopeIntegrityViolations: number;
    readonly expectedOutcomeMatch: number;
  };
  readonly expectedMatch: boolean;
}

export interface ScenarioView {
  readonly scenarioId: string;
  readonly lane: string;
  readonly providerRef: { readonly providerId: string; readonly technologyVersion: string };
  readonly capability: string;
  readonly input: { readonly payload: { readonly bundleJson: string; readonly behaviorTag: string } };
  readonly expected: {
    readonly resultStatus: string;
    readonly resultClaim: string | null;
    readonly facts: readonly string[];
    readonly assumptions: readonly string[];
    readonly unknowns: readonly string[];
    readonly evidenceIds: readonly string[];
    readonly deterministicChecks: readonly string[];
    readonly invalidationConditions: readonly string[];
    readonly correctResultStatus: string;
    readonly correctResultClaim: string | null;
    readonly correctAssumptions: readonly string[];
    readonly expectedFailureKind: string;
    readonly expectedViolationRules: readonly string[];
  };
}

export interface ReasoningEvalArtifacts {
  readonly scenarioSuite: Json;
  readonly scenarios: readonly ScenarioView[];
  readonly outcomesSuite: Json;
  readonly outcomes: readonly OutcomeView[];
}

/** Loads the committed artifacts (throws on structural mismatch). */
export function loadReasoningEvalArtifacts(): ReasoningEvalArtifacts {
  const scenarioSuite = asRecord(readJson(SCENARIO_PATH), "scenario.json");
  const outcomesSuite = asRecord(readJson(OUTCOMES_PATH), "expected-outcomes.json");
  const scenarios = (scenarioSuite["scenarios"] as unknown[]).map((entry, index) =>
    asRecord(entry, `scenario.json scenarios[${index}]`),
  ) as unknown as readonly ScenarioView[];
  const outcomes = (outcomesSuite["outcomes"] as unknown[]).map((entry, index) =>
    asRecord(entry, `expected-outcomes.json outcomes[${index}]`),
  ) as unknown as readonly OutcomeView[];
  return { scenarioSuite, scenarios, outcomesSuite, outcomes };
}

/* ------------------------------------------------------------------ */
/* The check report                                                     */
/* ------------------------------------------------------------------ */

export interface ReasoningEvalArtifactCheck {
  readonly id: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface ReasoningEvalArtifactReport {
  readonly ok: boolean;
  readonly checks: readonly ReasoningEvalArtifactCheck[];
  readonly summary: {
    readonly total: number;
    readonly byLane: Readonly<Record<string, number>>;
    readonly byClassification: Readonly<Record<string, number>>;
    readonly classificationMatches: number;
    readonly expectedMatches: number;
  };
}

/** The per-lane APPLICABLE failure kinds (the fixture map's discrimination contract). */
const APPLICABLE_KINDS_BY_LANE: Readonly<Record<string, readonly string[]>> = {
  "multimodal-reasoning": [
    "perception-failure",
    "retrieval-failure",
    "reasoning-failure",
    "unsupported-data",
    "contract-mismatch",
  ],
  "document-understanding": [
    "perception-failure",
    "retrieval-failure",
    "reasoning-failure",
    "unsupported-data",
    "operation-semantic-failure",
    "contract-mismatch",
  ],
  retrieval: [
    "perception-failure",
    "retrieval-failure",
    "reasoning-failure",
    "unsupported-data",
    "contract-mismatch",
  ],
};

/**
 * Verifies the committed Layer-2 reasoning evaluation artifacts (pure;
 * every check is named, deterministic and listed in the module header).
 */
export function verifyReasoningEvalArtifacts(): ReasoningEvalArtifactReport {
  const { scenarioSuite, scenarios, outcomesSuite, outcomes } = loadReasoningEvalArtifacts();
  const checks: ReasoningEvalArtifactCheck[] = [];
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

  /* 1. Coherence ---------------------------------------------------- */

  const suiteId = String(scenarioSuite["suiteId"] ?? "");
  check(
    "coherence-suite-identity",
    suiteId === "reasoning-eval-suite/1" &&
      String(outcomesSuite["suiteId"] ?? "") === suiteId &&
      String(scenarioSuite["benchmarkId"] ?? "") === "reasoning-eval-suite/1" &&
      String(outcomesSuite["benchmarkId"] ?? "") === "reasoning-eval-suite/1",
    `both artifacts pin suiteId '${suiteId}' and benchmarkId 'reasoning-eval-suite/1'`,
  );
  const scenarioIds = scenarios.map((scenario) => scenario.scenarioId);
  const uniqueIds = new Set(scenarioIds);
  check(
    "coherence-scenario-identity",
    uniqueIds.size === scenarioIds.length && scenarioIds.length === 26,
    `${scenarioIds.length} scenarios with unique ids`,
  );
  const outcomeIds = outcomes.map((outcome) => outcome.scenarioId);
  check(
    "coherence-outcome-alignment",
    outcomeIds.length === scenarioIds.length &&
      scenarioIds.every((id) => outcomeIds.includes(id)) &&
      outcomeIds.every((id) => uniqueIds.has(id)),
    "the outcome ids align 1:1 with the scenario ids",
  );
  check(
    "coherence-canonical-form",
    canonicalJson(readJson(SCENARIO_PATH)) === readFileSync(SCENARIO_PATH, "utf8") &&
      canonicalJson(readJson(OUTCOMES_PATH)) === readFileSync(OUTCOMES_PATH, "utf8"),
    "both committed artifacts are canonical JSON (sorted keys, 2-space, trailing newline)",
  );

  /* 2. The five-way discrimination coverage ------------------------- */

  const byLaneCoverage: Record<string, Set<string>> = {};
  for (const outcome of outcomes) {
    const laneSet = byLaneCoverage[outcome.lane] ?? new Set<string>();
    laneSet.add(outcome.classification);
    byLaneCoverage[outcome.lane] = laneSet;
  }
  const coverageGaps: string[] = [];
  for (const [lane, applicable] of Object.entries(APPLICABLE_KINDS_BY_LANE)) {
    const covered = byLaneCoverage[lane] ?? new Set<string>();
    for (const kind of applicable) {
      if (!covered.has(kind)) {
        coverageGaps.push(`${lane} lacks ${kind}`);
      }
    }
  }
  check(
    "discrimination-lane-coverage",
    coverageGaps.length === 0,
    coverageGaps.length === 0
      ? "every lane exhibits every applicable closed-vocabulary failure kind"
      : `coverage gaps: ${coverageGaps.join("; ")}`,
  );
  const allKinds = new Set(outcomes.map((outcome) => outcome.classification));
  const fiveWay = [
    "perception-failure",
    "retrieval-failure",
    "reasoning-failure",
    "unsupported-data",
    "operation-semantic-failure",
  ];
  check(
    "discrimination-five-way-present",
    fiveWay.every((kind) => allKinds.has(kind)),
    "the §HF-2 five kinds are all present in the committed classifications",
  );

  /* 3. The mandated negative cases ---------------------------------- */

  const hallucination = outcomeOf("vlm-hallucination");
  check(
    "negative-hallucination-caught",
    hallucination.classification === "perception-failure" &&
      hallucination.violationKinds.includes("perception-failure") &&
      hallucination.metrics.envelopeIntegrityViolations >= 1,
    "the hallucinating provider is caught: classification perception-failure + an envelope integrity violation",
  );
  const wrongEvidence = outcomes.filter((outcome) =>
    ["vlm-wrong-evidence", "doc-wrong-section", "retrieval-near-miss"].includes(outcome.scenarioId),
  );
  check(
    "negative-wrong-evidence-is-retrieval",
    wrongEvidence.length === 3 &&
      wrongEvidence.every((outcome) => outcome.classification === "retrieval-failure"),
    "answering from the WRONG (but real) evidence classifies retrieval-failure, not reasoning-failure",
  );
  const refusals = outcomes.filter((outcome) =>
    ["vlm-refusal", "doc-refusal"].includes(outcome.scenarioId),
  );
  check(
    "negative-refusal-is-unsupported",
    refusals.length === 2 &&
      refusals.every(
        (outcome) =>
          outcome.classification === "unsupported-data" &&
          outcome.violationKinds.length === 0,
      ),
    "refusing out-of-scope data classifies unsupported-data (never perception-failure) with no integrity violation (the honest refusal)",
  );
  const emptyInScope = outcomeOf("retrieval-empty-in-scope");
  const emptyOutOfScope = outcomeOf("retrieval-empty-out-of-scope");
  check(
    "negative-empty-behavior-pair",
    emptyInScope.classification === "retrieval-failure" &&
      emptyOutOfScope.classification === "unsupported-data",
    "the SAME empty behavior classifies retrieval-failure in-scope and unsupported-data out-of-scope",
  );
  const fabricatedHit = outcomeOf("retrieval-fabricated-hit");
  check(
    "negative-fabricated-hit-is-unsupported",
    fabricatedHit.classification === "unsupported-data" &&
      fabricatedHit.violationRules.includes("cited-evidence-exists"),
    "a fabricated hit id is unsupported-data (invented support), not a retrieval miss",
  );
  const wrongOperation = outcomeOf("doc-operation-wrong-target");
  check(
    "negative-operation-contract-violation",
    wrongOperation.classification === "operation-semantic-failure" &&
      wrongOperation.violationRules.includes("operation-contract-honored"),
    "an edit proposal violating the operation contract classifies operation-semantic-failure",
  );

  /* 4. The closed failure vocabulary --------------------------------- */

  const vocabularyViolations = outcomes.flatMap((outcome) => [
    ...([outcome.classification].filter((kind) => kind !== "none" && !CLOSED_FAILURE_KINDS.includes(kind))),
    ...outcome.violationKinds.filter((kind) => !CLOSED_FAILURE_KINDS.includes(kind)),
  ]);
  check(
    "vocabulary-closed",
    vocabularyViolations.length === 0,
    vocabularyViolations.length === 0
      ? "every classification and violation kind comes from the closed nine-kind vocabulary"
      : `invented kinds: ${vocabularyViolations.join("; ")}`,
  );

  /* 5. The control-plane emission shape ------------------------------ */

  const digestShape = /^[0-9a-f]{64}$/;
  const malformedArtifacts = outcomes.filter(
    (outcome) =>
      !digestShape.test(outcome.recordId) ||
      !digestShape.test(outcome.manifestId) ||
      !digestShape.test(outcome.envelopeDigest),
  );
  check(
    "emission-content-addressed",
    malformedArtifacts.length === 0,
    "every outcome carries 64-hex recordId/manifestId/envelopeDigest (content-addressed artifacts)",
  );
  const metricShape = outcomes.filter(
    (outcome) =>
      outcome.metrics.classificationMatch !== 1 ||
      outcome.metrics.expectedOutcomeMatch !== 1 ||
      outcome.metrics.envelopeIntegrityViolations !== outcome.violationKinds.length,
  );
  check(
    "emission-metrics-consistent",
    metricShape.length === 0 && outcomes.every((outcome) => outcome.expectedMatch === true),
    "every outcome matched its expected golden (classification + fields + violations), metrics consistent",
  );

  /* 6. The envelope fixture map -------------------------------------- */

  const fixtureMapGaps: string[] = [];
  for (const scenario of scenarios) {
    const bundle = JSON.parse(scenario.input.payload.bundleJson) as Json;
    if (typeof bundle["question"] !== "string" || bundle["question"].length === 0) {
      fixtureMapGaps.push(`${scenario.scenarioId}: no intent`);
    }
    const context = bundle["authorizedContext"];
    if (typeof context !== "object" || context === null) {
      fixtureMapGaps.push(`${scenario.scenarioId}: no authorized context`);
    }
    const evidence = bundle["evidence"];
    if (!Array.isArray(evidence) || evidence.length === 0) {
      fixtureMapGaps.push(`${scenario.scenarioId}: no evidence set`);
    } else {
      for (const entry of evidence as Json[]) {
        if (typeof entry["evidenceId"] !== "string" || typeof entry["revision"] !== "string") {
          fixtureMapGaps.push(`${scenario.scenarioId}: evidence without id/revision`);
        }
        if (!Array.isArray(entry["facts"]) || (entry["facts"] as unknown[]).length === 0) {
          fixtureMapGaps.push(`${scenario.scenarioId}: evidence without ground-truth facts`);
        }
      }
    }
    if (!Array.isArray(bundle["offeredChecks"])) {
      fixtureMapGaps.push(`${scenario.scenarioId}: no offered checks`);
    }
    const expected = scenario.expected;
    if (
      typeof expected.correctResultStatus !== "string" ||
      !Array.isArray(expected.correctAssumptions) ||
      !Array.isArray(expected.invalidationConditions) ||
      !Array.isArray(expected.deterministicChecks) ||
      !Array.isArray(expected.unknowns) ||
      !Array.isArray(expected.assumptions) ||
      !Array.isArray(expected.facts)
    ) {
      fixtureMapGaps.push(`${scenario.scenarioId}: expected block incomplete (prediction or oracle)`);
    }
  }
  check(
    "fixture-map-envelope-fields",
    fixtureMapGaps.length === 0,
    fixtureMapGaps.length === 0
      ? "every bundle carries the evaluable canonical envelope fields and the expected block carries prediction + oracle"
      : `fixture map gaps: ${fixtureMapGaps.slice(0, 5).join("; ")}`,
  );
  const measuredEvidence = (JSON.parse(
    scenarios
      .find((scenario) => scenario.scenarioId === "retrieval-correct")
      ?.input.payload.bundleJson ?? "{}",
  ) as Json)["evidence"] as Json[];
  check(
    "fixture-map-uncertainty-retrieval-lane",
    Array.isArray(measuredEvidence) &&
      measuredEvidence.some((entry) => typeof entry["measurement"] === "object"),
    "the retrieval lane's corpus carries measurement uncertainty (sigma + unit) for canonical propagation",
  );

  /* 7. Summary recomputation (independent arithmetic) ----------------- */

  const byLane: Record<string, number> = {};
  const byClassification: Record<string, number> = {};
  let classificationMatches = 0;
  let expectedMatches = 0;
  for (const outcome of outcomes) {
    byLane[outcome.lane] = (byLane[outcome.lane] ?? 0) + 1;
    byClassification[outcome.classification] = (byClassification[outcome.classification] ?? 0) + 1;
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
    Object.keys(byLane).length === Object.keys(committedByLane ?? {}).length &&
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
  const report = verifyReasoningEvalArtifacts();
  console.log("PROD-028 reasoning-eval — committed artifact check runner");
  console.log(`  scenarios: ${report.summary.total} (matches: ${report.summary.expectedMatches})`);
  for (const lane of Object.keys(report.summary.byLane)) {
    console.log(`  ${lane}: ${report.summary.byLane[lane]} scenarios`);
  }
  for (const entry of report.checks) {
    console.log(`  [${entry.passed ? "pass" : "FAIL"}] ${entry.id}: ${entry.detail}`);
  }
  console.log(report.ok ? "RUNNER: PASS" : "RUNNER: FAIL");
  process.exit(report.ok ? 0 : 1);
}
