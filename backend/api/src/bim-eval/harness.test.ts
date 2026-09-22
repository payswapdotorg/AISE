/**
 * HFX-204 — the bim-eval HARNESS tests: the §HF-2 FIVE-WAY discrimination
 * (perception / retrieval / reasoning / unsupported-data /
 * operation-semantic — each kind asserted by a fixture that fails exactly
 * that way), the four AISE negative-case classes, the
 * natural-language/direct-intent equivalence seam, the no-execution
 * guarantee and the deterministic record/manifest emission.
 */

import { describe, expect, test } from "bun:test";
import {
  validateBenchmarkRecord,
  verifyProvenanceManifest,
} from "@aise/provider-registry";
import {
  classifyEditOutcome,
  evaluateEditFixture,
  evaluateQuestionFixture,
  expectedIntentSemanticsOf,
  intentSemanticsEqual,
  intentSemanticsOf,
  verifyEditIntent,
} from "./harness";
import {
  BIM_EVAL_EDIT_FIXTURES,
  BIM_EVAL_QUESTION_FIXTURES,
  driveBimEvalRegistryLifecycle,
  registryLogForEditFixture,
  registryLogForQuestionFixture,
  runBimEvalSuite,
} from "./testkit";
import type { BimQuestionFixture, BimEditFixture } from "./model";

/* ------------------------------------------------------------------ */

const questionFixtureOf = (fixtureId: string): BimQuestionFixture => {
  const found = BIM_EVAL_QUESTION_FIXTURES.find((fixture) => fixture.fixtureId === fixtureId);
  if (found === undefined) {
    throw new Error(`no committed question fixture '${fixtureId}'`);
  }
  return found;
};

const editFixtureOf = (fixtureId: string): BimEditFixture => {
  const found = BIM_EVAL_EDIT_FIXTURES.find((fixture) => fixture.fixtureId === fixtureId);
  if (found === undefined) {
    throw new Error(`no committed edit fixture '${fixtureId}'`);
  }
  return found;
};

const runQuestion = (fixtureId: string) =>
  evaluateQuestionFixture(questionFixtureOf(fixtureId), registryLogForQuestionFixture(questionFixtureOf(fixtureId)));

const runEdit = (fixtureId: string) =>
  evaluateEditFixture(editFixtureOf(fixtureId), registryLogForEditFixture(editFixtureOf(fixtureId)));

/* ------------------------------------------------------------------ */

describe("HFX-204 harness: the question lane (IFC-Bench → Evidence Envelope)", () => {
  test("every question fixture matches its expected outcome (the golden)", () => {
    for (const fixture of BIM_EVAL_QUESTION_FIXTURES) {
      const outcome = evaluateQuestionFixture(fixture, registryLogForQuestionFixture(fixture));
      expect(outcome.layer2.expectedMatch).toBe(true);
      expect(outcome.layer2.fieldMatches.classification).toBe(true);
    }
  });

  test("the emitted benchmark records are valid, content-addressed and version-pinned", () => {
    for (const fixture of BIM_EVAL_QUESTION_FIXTURES) {
      const outcome = evaluateQuestionFixture(fixture, registryLogForQuestionFixture(fixture));
      expect(outcome.benchmarkRecord.benchmarkId).toBe("bim-eval-suite/1");
      expect(outcome.benchmarkRecord.technologyVersion).toBe("1.0.0-fixture-v1");
      expect(outcome.benchmarkRecord.reproduction.codeVersion).toBe("hfx-204/bim-eval/1");
      const validated = validateBenchmarkRecord(
        JSON.parse(JSON.stringify(outcome.benchmarkRecord)),
      );
      expect(validated.ok).toBe(true);
      expect(outcome.provenanceManifest.manifestId).toMatch(/^[0-9a-f]{64}$/);
      const manifestCheck = verifyProvenanceManifest(
        JSON.parse(JSON.stringify(outcome.provenanceManifest)),
      );
      expect(manifestCheck.ok).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */

describe("HFX-204 harness: the edit lane (BIM-Edit → operation intents)", () => {
  test("every edit fixture matches its expected outcome (the golden)", () => {
    for (const fixture of BIM_EVAL_EDIT_FIXTURES) {
      const outcome = evaluateEditFixture(fixture, registryLogForEditFixture(fixture));
      expect(outcome.expectedMatch).toBe(true);
      expect(outcome.fieldMatches.classification).toBe(true);
    }
  });

  test("the resolved intents are proposals — nothing is executed or applied", () => {
    // The evaluation output carries only normalized semantics, violations
    // and governed artifacts; the intent itself is carried verbatim as the
    // provider's proposal and never mutated by the harness.
    const correct = runEdit("bim-edit-update-correct");
    expect(correct.resolvedIntent?.operationType).toBe("element-property-update");
    expect(correct.resolvedIntent?.target.nodeRefs).toEqual(["wall-W1"]);
    // the scripted intent is untouched (the proposal is compared, not applied)
    const script = JSON.parse(
      String((editFixtureOf("bim-edit-update-correct").input.payload as Record<string, unknown>)["variantScript"]),
    ) as { operationType: string };
    expect(script.operationType).toBe("element-property-update");
  });

  test("the emitted benchmark records carry the edit capability and valid manifests", () => {
    for (const fixture of BIM_EVAL_EDIT_FIXTURES) {
      const outcome = evaluateEditFixture(fixture, registryLogForEditFixture(fixture));
      expect(outcome.benchmarkRecord.capability).toBe("fixture-bim-edit-translation");
      const validated = validateBenchmarkRecord(
        JSON.parse(JSON.stringify(outcome.benchmarkRecord)),
      );
      expect(validated.ok).toBe(true);
      const manifestCheck = verifyProvenanceManifest(
        JSON.parse(JSON.stringify(outcome.provenanceManifest)),
      );
      expect(manifestCheck.ok).toBe(true);
    }
  });

  test("the NL and direct-intent create forms resolve to the SAME normalized semantics", () => {
    const nl = runEdit("bim-edit-create-correct");
    const direct = runEdit("bim-edit-create-direct-intent");
    expect(nl.intentSemantics).not.toBeNull();
    expect(direct.intentSemantics).not.toBeNull();
    expect(intentSemanticsEqual(nl.intentSemantics!, direct.intentSemantics!)).toBe(true);
    expect(nl.oracleMatch).toBe(true);
    expect(direct.oracleMatch).toBe(true);
    // provenance differs (agent vs direct-manipulation) — semantics do not
    expect(nl.resolvedIntent?.provenance.origin).toBe("agent");
    expect(direct.resolvedIntent?.provenance.origin).toBe("direct-manipulation");
  });
});

/* ------------------------------------------------------------------ */

describe("HFX-204 harness: the §HF-2 five-way discrimination (per-kind fixtures)", () => {
  test("perception-failure: a misread property is caught by the grounding rule", () => {
    const outcome = runQuestion("ifc-property-lookup-perception");
    expect(outcome.layer2.classification).toBe("perception-failure");
    expect(outcome.layer2.violations.map((violation) => violation.rule)).toEqual([
      "facts-grounded-in-cited-evidence",
    ]);
  });

  test("perception-failure: an invented measurement on the edit lane is caught", () => {
    const outcome = runEdit("bim-edit-invented-dimension");
    expect(outcome.classification).toBe("perception-failure");
    expect(outcome.violations.map((violation) => violation.rule)).toEqual([
      "parameters-grounded-in-bundle",
    ]);
    expect(outcome.intentDecodable).toBe(true);
  });

  test("retrieval-failure: answering from the wrong (but real) element's evidence", () => {
    const outcome = runQuestion("ifc-property-lookup-retrieval");
    expect(outcome.layer2.classification).toBe("retrieval-failure");
    expect(outcome.layer2.classification).not.toBe("reasoning-failure");
    expect(outcome.layer2.violations).toEqual([]);
  });

  test("reasoning-failure: grounded facts, wrong conclusion (the thickness comparison)", () => {
    const outcome = runQuestion("ifc-quantity-lookup-reasoning");
    expect(outcome.layer2.classification).toBe("reasoning-failure");
    expect(outcome.layer2.violations).toEqual([]);
  });

  test("reasoning-failure: silently resolving conflicting evidence is caught", () => {
    const outcome = runQuestion("ifc-conflicting-evidence-silent-resolution");
    expect(outcome.layer2.classification).toBe("reasoning-failure");
  });

  test("unsupported-data: an honest refusal of an absent property is unsupported-data", () => {
    const outcome = runQuestion("ifc-property-lookup-unsupported");
    expect(outcome.layer2.classification).toBe("unsupported-data");
    expect(outcome.layer2.classification).not.toBe("perception-failure");
    expect(outcome.layer2.violations).toEqual([]);
  });

  test("unsupported-data: a fabricated evidence reference is unsupported-data (invented support)", () => {
    const outcome = runQuestion("ifc-fabricated-evidence");
    expect(outcome.layer2.classification).toBe("unsupported-data");
    expect(outcome.layer2.classification).not.toBe("retrieval-failure");
    expect(outcome.layer2.violations.map((violation) => violation.rule)).toEqual([
      "cited-evidence-exists",
    ]);
  });

  test("operation-semantic-failure: a wrong-unit resolution is caught (wrong engineering semantics)", () => {
    const outcome = runEdit("bim-edit-wrong-unit");
    expect(outcome.classification).toBe("operation-semantic-failure");
    expect(outcome.violations.map((violation) => violation.rule)).toEqual([
      "command-semantics-honored",
      "constraints-honored",
    ]);
  });

  test("operation-semantic-failure: a wrong-target resolution is caught (existing but wrong element)", () => {
    const outcome = runEdit("bim-edit-wrong-target");
    expect(outcome.classification).toBe("operation-semantic-failure");
    expect(outcome.violations.map((violation) => violation.rule)).toEqual([
      "command-semantics-honored",
    ]);
  });

  test("contract-mismatch: a malformed envelope is a typed refusal, never a coercion", () => {
    const outcome = runQuestion("ifc-malformed-envelope");
    expect(outcome.layer2.classification).toBe("contract-mismatch");
    expect(outcome.layer2.violations.map((violation) => violation.rule)).toEqual([
      "output-contract-normalizable",
    ]);
  });

  test("contract-mismatch: an undecodable intent payload is a typed refusal", () => {
    const outcome = runEdit("bim-edit-malformed-intent");
    expect(outcome.classification).toBe("contract-mismatch");
    expect(outcome.violations.map((violation) => violation.rule)).toEqual([
      "intent-contract-decodable",
    ]);
    expect(outcome.intentDecodable).toBe(false);
    expect(outcome.resolvedIntent).toBeNull();
  });

  test("all five §HF-2 kinds are exhibited across the committed corpus", () => {
    const run = runBimEvalSuite();
    const kinds = new Set([
      ...run.questionOutcomes.map((outcome) => outcome.layer2.classification),
      ...run.editOutcomes.map((outcome) => outcome.classification),
    ]);
    expect(kinds.has("perception-failure")).toBe(true);
    expect(kinds.has("retrieval-failure")).toBe(true);
    expect(kinds.has("reasoning-failure")).toBe(true);
    expect(kinds.has("unsupported-data")).toBe(true);
    expect(kinds.has("operation-semantic-failure")).toBe(true);
    expect(kinds.has("contract-mismatch")).toBe(true);
    expect(kinds.has("none")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe("HFX-204 harness: the four AISE negative-case classes", () => {
  test("unavailable geometry: the honest refusal names the missing element and fabricates nothing", () => {
    const outcome = runEdit("bim-edit-unavailable-geometry");
    expect(outcome.classification).toBe("unsupported-data");
    expect(outcome.providerFailure?.kind).toBe("unsupported-data");
    expect(outcome.providerFailure?.detail).toContain("wall-W9");
    expect(outcome.providerFailure?.detail).toContain("never a fabricated shape");
    expect(outcome.resolvedIntent).toBeNull();
  });

  test("unavailable geometry: a fabricated target for a nonexistent element is CAUGHT", () => {
    const outcome = runEdit("bim-edit-fabricated-target");
    expect(outcome.classification).toBe("unsupported-data");
    expect(outcome.violations.map((violation) => violation.rule)).toEqual([
      "target-references-existing-elements",
    ]);
    expect(outcome.resolvedIntent).not.toBeNull();
  });

  test("unavailable geometry: the QA lane refuses a question about a nonexistent element", () => {
    const outcome = runQuestion("ifc-unavailable-element");
    expect(outcome.layer2.classification).toBe("unsupported-data");
  });

  test("conflicting evidence: the honest answer SURFACES the conflict (status conflicted, no resolution)", () => {
    const outcome = runQuestion("ifc-conflicting-evidence");
    expect(outcome.layer2.classification).toBe("none");
    expect(outcome.layer2.envelope.resultStatus).toBe("conflicted");
    expect([...outcome.layer2.envelope.evidenceIds].sort()).toEqual([
      "EV-WALL-W3",
      "EV-WALL-W3-INSPECT",
    ]);
    expect(outcome.layer2.envelope.resultClaim).toContain("conflicts");
    expect(outcome.layer2.violations).toEqual([]);
  });

  test("conflicting evidence: silently picking a side is a reasoning failure (no silent resolution)", () => {
    const outcome = runQuestion("ifc-conflicting-evidence-silent-resolution");
    expect(outcome.layer2.classification).toBe("reasoning-failure");
    expect(outcome.layer2.envelope.resultStatus).toBe("supported");
  });

  test("missing dimensions: the honest clarification names the missing parameter and invents nothing", () => {
    const outcome = runEdit("bim-edit-missing-dimensions");
    expect(outcome.classification).toBe("unsupported-data");
    expect(outcome.providerFailure?.detail).toContain("height");
    expect(outcome.providerFailure?.detail).toContain("never an invented measurement");
    expect(outcome.resolvedIntent).toBeNull();
  });

  test("missing dimensions: an invented measurement is caught as a perception failure", () => {
    const outcome = runEdit("bim-edit-invented-dimension");
    expect(outcome.classification).toBe("perception-failure");
    expect(outcome.violations[0]?.detail).toContain("height=2.6");
  });

  test("invalid constraints: the violated constraint is NAMED in the failure observation", () => {
    const outcome = runEdit("bim-edit-invalid-constraint");
    expect(outcome.classification).toBe("operation-semantic-failure");
    expect(outcome.violations.map((violation) => violation.rule)).toEqual(["constraints-honored"]);
    expect(outcome.violations[0]?.detail).toContain("max-opening-width-fire-wall-w1");
    expect(outcome.violations[0]?.detail).toContain("1800");
    expect(outcome.violations[0]?.detail).toContain("1200");
    // the faithful translation still matches the oracle — the COMMAND is invalid
    expect(outcome.oracleMatch).toBe(true);
    const observation = outcome.benchmarkRecord.failureObservations.find((entry) =>
      entry.detail.includes("max-opening-width-fire-wall-w1"),
    );
    expect(observation?.kind).toBe("operation-semantic-failure");
    expect(observation?.detail).toContain("constraints-honored");
  });

  test("invalid constraints: a unit constraint violation is named and classified", () => {
    const outcome = runEdit("bim-edit-wrong-unit");
    const constraintViolation = outcome.violations.find(
      (violation) => violation.rule === "constraints-honored",
    );
    expect(constraintViolation?.detail).toContain("wall-thickness-unit-mm");
    expect(constraintViolation?.detail).toContain("'cm'");
    expect(outcome.classification).toBe("operation-semantic-failure");
  });

  test("the summary's negative-case coverage table lists every mandated class", () => {
    const run = runBimEvalSuite();
    expect(Object.keys(run.summary.negativeCaseCoverage).sort()).toEqual([
      "conflicting-evidence",
      "invalid-constraints",
      "missing-dimensions",
      "unavailable-geometry",
    ]);
    expect(run.summary.negativeCaseCoverage["unavailable-geometry"]?.length).toBeGreaterThanOrEqual(3);
    expect(run.summary.negativeCaseCoverage["conflicting-evidence"]?.length).toBeGreaterThanOrEqual(2);
    expect(run.summary.negativeCaseCoverage["missing-dimensions"]?.length).toBeGreaterThanOrEqual(2);
    expect(run.summary.negativeCaseCoverage["invalid-constraints"]?.length).toBeGreaterThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */

describe("HFX-204 harness: the edit-lane classification tree (unit discrimination)", () => {
  test("an explicitly refused provider result classifies as its own closed kind", () => {
    expect(
      classifyEditOutcome([], { kind: "unsupported-data", detail: "refused" }),
    ).toBe("unsupported-data");
  });

  test("a fabricated target outranks semantics — unsupported-data, not operation-semantic", () => {
    // The precedence is asserted end-to-end by the fixtures above; here the
    // tree ordering itself is pinned:
    expect(classifyEditOutcome(
      [
        { rule: "target-references-existing-elements", kind: "unsupported-data", detail: "" },
        { rule: "command-semantics-honored", kind: "operation-semantic-failure", detail: "" },
      ],
      null,
    )).toBe("unsupported-data");
    expect(classifyEditOutcome(
      [
        { rule: "parameters-grounded-in-bundle", kind: "perception-failure", detail: "" },
        { rule: "command-semantics-honored", kind: "operation-semantic-failure", detail: "" },
      ],
      null,
    )).toBe("perception-failure");
    expect(classifyEditOutcome(
      [{ rule: "intent-contract-decodable", kind: "contract-mismatch", detail: "" }],
      null,
    )).toBe("contract-mismatch");
    expect(classifyEditOutcome(
      [{ rule: "constraints-honored", kind: "operation-semantic-failure", detail: "" }],
      null,
    )).toBe("operation-semantic-failure");
    expect(classifyEditOutcome([], null)).toBe("none");
  });

  test("verifyEditIntent refuses nothing silently: an absent payload carries no violations", () => {
    const violations = verifyEditIntent(
      JSON.parse(
        String(
          (editFixtureOf("bim-edit-unavailable-geometry").input.payload as Record<string, unknown>)["bundleJson"],
        ),
      ),
      null,
      editFixtureOf("bim-edit-unavailable-geometry").expected,
      { payloadPresent: false, decodable: false },
    );
    expect(violations).toEqual([]);
  });

  test("the intent semantic projection is provenance-excluded and order-stable", () => {
    const nl = runEdit("bim-edit-create-correct");
    const semantics = intentSemanticsOf(nl.resolvedIntent!);
    expect(semantics.parameters.map((parameter) => parameter.name)).toEqual([
      "height",
      "length",
      "thickness",
    ]);
    expect(canonicalOf(semantics)).toBe(
      canonicalOf(expectedIntentSemanticsOf(editFixtureOf("bim-edit-create-correct").expected.expectedIntent!)),
    );
  });
});

function canonicalOf(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

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

/* ------------------------------------------------------------------ */

describe("HFX-204 harness: determinism + the registry lifecycle", () => {
  test("identical fixture runs produce byte-identical records and manifests", () => {
    const first = runEdit("bim-edit-create-correct");
    const second = runEdit("bim-edit-create-correct");
    expect(first.benchmarkRecord.recordId).toBe(second.benchmarkRecord.recordId);
    expect(first.provenanceManifest.manifestId).toBe(second.provenanceManifest.manifestId);
    const q1 = runQuestion("ifc-property-lookup-correct");
    const q2 = runQuestion("ifc-property-lookup-correct");
    expect(q1.benchmarkRecord.recordId).toBe(q2.benchmarkRecord.recordId);
  });

  test("the corpus drives the control-plane registry lawfully and replays identically", () => {
    const lifecycle = driveBimEvalRegistryLifecycle();
    expect(lifecycle.replayEqual).toBe(true);
    expect(lifecycle.eventCount).toBe(2 + 2 + 29 + 2 + 2);
    const qa = lifecycle.entries.find((entry) => entry.providerId === "fixture-bim-qa-provider");
    const edit = lifecycle.entries.find((entry) => entry.providerId === "fixture-bim-edit-provider");
    expect(qa?.state).toBe("benchmarked");
    expect(edit?.state).toBe("benchmarked");
    expect(qa?.benchmarkRecordIds.length).toBe(1);
    expect(edit?.benchmarkRecordIds.length).toBe(1);
    expect(qa?.provenanceManifestIds.length).toBe(1);
    expect(edit?.provenanceManifestIds.length).toBe(1);
  });

  test("the suite summary aggregates per-lane and per-kind counts deterministically", () => {
    const run = runBimEvalSuite();
    expect(run.summary.total).toBe(29);
    expect(run.summary.byLane).toEqual({
      "bim-edit-operations": 14,
      "ifc-bench-questions": 15,
    });
    expect(run.summary.expectedMatches).toBe(29);
    expect(run.summary.classificationMatches).toBe(29);
    expect(run.summary.byClassification).toEqual({
      "contract-mismatch": 2,
      none: 13,
      "operation-semantic-failure": 3,
      "perception-failure": 2,
      "reasoning-failure": 2,
      "retrieval-failure": 1,
      "unsupported-data": 6,
    });
    expect(run.summary.byQuestionClass).toEqual({
      classification: 1,
      "connected-to-topology": 1,
      "part-of-topology": 1,
      "property-lookup": 9,
      "quantity-lookup": 2,
      "spatial-composition": 1,
    });
    expect(run.summary.byEditClass).toEqual({
      "element-create": 5,
      "element-delete": 1,
      "element-update": 6,
      "spatial-change": 1,
      "topological-change": 1,
    });
    expect(run.summary.provenanceManifestDigest).toMatch(/^[0-9a-f]{64}$/);
  });
});
