/**
 * HFX-301 — the natural-language / direct-manipulation EQUIVALENCE
 * benchmark CHECK RUNNER test (the tools/ pickup wired into the root
 * `bun run verify` — the building-benchmark convention).
 *
 * Exercises `./runner.ts` over the COMMITTED ARTIFACTS as data (the
 * boundary matrix forbids tools → packages/backend imports): the full
 * check report must be clean, and the mandated four-cell, honest-difference
 * and designed-outcome assertions are additionally asserted test-by-test
 * from the committed data.
 *
 * Determinism: pure reads of committed files + pure logic; no clock, no
 * randomness, no network, no engine import.
 */

import { describe, expect, test } from "bun:test";
import { loadEquivalenceArtifacts, verifyEquivalenceArtifacts } from "./runner";

const report = verifyEquivalenceArtifacts();

describe("HFX-301 equivalence-eval: the committed artifacts are coherent", () => {
  test("the full check report is clean", () => {
    expect(report.ok).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(19);
  });

  test("every named check passes (failures list the gap)", () => {
    const failed = report.checks.filter((check) => !check.passed).map((check) => check.id);
    expect(failed).toEqual([]);
  });

  test("the suite is the committed 33-pair corpus across the four cells", () => {
    expect(report.summary.total).toBe(33);
    expect(report.summary.byExpectation).toEqual({
      "agent-clarification": 6,
      "agent-refused": 7,
      "declared-different": 4,
      equivalent: 16,
    });
    expect(report.summary.byObserved).toEqual(report.summary.byExpectation);
    expect(report.summary.expectationMatches).toBe(33);
  });

  test("the artifact identities are pinned (suite, benchmark, code version, corpus digest)", () => {
    const { scenarioSuite, outcomesSuite } = loadEquivalenceArtifacts();
    expect(scenarioSuite["suiteId"]).toBe("equivalence-eval-suite/1");
    expect(scenarioSuite["version"]).toBe("1.0.0");
    expect(scenarioSuite["benchmarkId"]).toBe("equivalence-eval-suite/1");
    expect(scenarioSuite["codeVersion"]).toBe("hfx-301/equivalence-eval/1");
    expect(scenarioSuite["pairCount"]).toBe(33);
    expect(outcomesSuite["suiteId"]).toBe("equivalence-eval-suite/1");
    expect(outcomesSuite["pairCount"]).toBe(33);
    const pins = scenarioSuite["pins"] as Record<string, string>;
    expect(pins["taxonomyVersion"]).toBe("prod-023/refusal-and-operation-taxonomy/1");
    expect(pins["compilerCodeVersion"]).toBe("prod-023/deterministic-grammar/1");
    expect(pins["engineKind"]).toBe("aise-solution-engine");
    expect(pins["engineCodeVersion"]).toBe("1.0.0");
    expect(pins["corpusDigest"]).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("HFX-301 equivalence-eval: CELL 1 — the equivalence proof (the plan's checkpoint)", () => {
  const { outcomes } = loadEquivalenceArtifacts();
  const equivalents = outcomes.filter((outcome) => outcome.observed === "equivalent");

  test("every equivalent pair is canonically identical across all four journey points", () => {
    expect(equivalents.length).toBe(16);
    for (const outcome of equivalents) {
      expect(outcome.comparisonVerdict).toBe("equivalent");
      expect(outcome.equalPoints).toBe(4);
      expect(outcome.divergentPoints ?? []).toEqual([]);
      expect(outcome.differenceKinds).toEqual([]);
    }
  });

  test("the canonical command pair (excavation 1.5 × 2 × 3 m) compares EQUIVALENT", () => {
    const core = outcomes.find((outcome) => outcome.pairId === "eq-excavation-core");
    expect(core?.observed).toBe("equivalent");
    expect(core?.expectationMet).toBe(true);
  });

  test("unit canonicalization and coat counts compare EQUIVALENT", () => {
    for (const pairId of [
      "eq-excavation-units-mixed",
      "eq-block-wall-units",
      "eq-plaster-units-coats",
      "eq-finish-decimal",
    ]) {
      const outcome = outcomes.find((entry) => entry.pairId === pairId);
      expect(outcome?.observed).toBe("equivalent");
    }
  });

  test("the sequencing and replacement clauses compare EQUIVALENT", () => {
    for (const pairId of ["eq-backfill-sequenced", "eq-plaster-replacement"]) {
      const outcome = outcomes.find((entry) => entry.pairId === pairId);
      expect(outcome?.observed).toBe("equivalent");
      expect(outcome?.equalPoints).toBe(4);
    }
  });
});

describe("HFX-301 equivalence-eval: CELL 2 — the honest declared differences", () => {
  const { outcomes } = loadEquivalenceArtifacts();

  test("every declared difference records the closed kind, never hidden", () => {
    for (const outcome of outcomes.filter((o) => o.observed === "declared-different")) {
      expect(outcome.divergentPoints?.length ?? 0).toBeGreaterThan(0);
      expect(outcome.differenceKind).toBe("operation-semantic-failure");
      expect(outcome.differenceKinds).toEqual(["operation-semantic-failure"]);
      expect(outcome.expectationMet).toBe(true);
      expect(outcome.directApplicationOutcome).toBe("applied");
    }
  });

  test("the replacement-clause difference diverges on identity, state and BOQ (verdict stays equal)", () => {
    const outcome = outcomes.find((o) => o.pairId === "dd-plaster-replacement-omitted");
    expect(outcome?.divergentPoints).toEqual(["operation-identity", "state-digest", "boq-line"]);
  });

  test("the sequencing-omitted difference diverges on identity and state only", () => {
    const outcome = outcomes.find((o) => o.pairId === "dd-backfill-sequencing-omitted");
    expect(outcome?.divergentPoints).toEqual(["operation-identity", "state-digest"]);
  });
});

describe("HFX-301 equivalence-eval: the designed agent-path outcomes", () => {
  const { outcomes } = loadEquivalenceArtifacts();

  test("every unsafe-taxonomy reason code is exhibited as an agent-refused pair", () => {
    expect(report.checks.find((check) => check.id === "designed-refusal-taxonomy")?.passed).toBe(
      true,
    );
    const refusals = outcomes.filter((outcome) => outcome.observed === "agent-refused");
    expect(refusals.length).toBe(7);
    const codes = new Set(refusals.map((outcome) => outcome.refusalReasonCode));
    expect([...codes].sort()).toEqual([
      "approval-authority-claim",
      "cost-authority-claim",
      "engine-bypass",
      "raw-geometry-write",
      "readiness-authority-claim",
      "reality-authority-claim",
      "validation-authority-claim",
    ]);
  });

  test("all five clarification slot kinds are exhibited as agent-clarification pairs", () => {
    const clarifications = outcomes.filter((outcome) => outcome.observed === "agent-clarification");
    expect(clarifications.length).toBe(6);
    const slots = new Set(clarifications.flatMap((outcome) => outcome.clarificationSlots ?? []));
    expect([...slots].sort()).toEqual([
      "constraint",
      "dimension",
      "location",
      "material",
      "sequencing",
    ]);
  });

  test("the designed cells produce NO agent journey while the direct path authors", () => {
    for (const outcome of outcomes.filter(
      (o) => o.observed === "agent-refused" || o.observed === "agent-clarification",
    )) {
      expect(outcome.agentCompileKind).not.toBe("operation-intent");
      expect(outcome.directApplicationOutcome).toBe("applied");
      expect(outcome.expectationMet).toBe(true);
    }
  });
});

describe("HFX-301 equivalence-eval: the emission + the independent summary", () => {
  test("every outcome is content-addressed with matched expectations", () => {
    expect(report.checks.find((check) => check.id === "emission-content-addressed")?.passed).toBe(
      true,
    );
  });

  test("the per-cell counts are the committed golden table", () => {
    expect(report.summary.byExpectation).toEqual({
      "agent-clarification": 6,
      "agent-refused": 7,
      "declared-different": 4,
      equivalent: 16,
    });
  });

  test("the aggregate digests are pinned", () => {
    expect(report.summary.provenanceManifestDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(report.summary.benchmarkRecordDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(report.summary.provenanceManifestDigest).toBe(
      "825699a04420e8dd7dd510bbbe5e4cbbe82ce6a697a5820e24d93386e72f9eac",
    );
    expect(report.summary.benchmarkRecordDigest).toBe(
      "6943c18b00b878f8ae88c4a18312da5db36a6dc3f7d509de1c929ebc5dae5420",
    );
  });

  test("the provenance-only control verdict is 'equivalent' (the structural doctrine)", () => {
    expect(report.summary.provenanceOnlyControlVerdict).toBe("equivalent");
  });
});
