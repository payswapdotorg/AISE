/**
 * PROD-028 — the LAYER-2 REASONING EVALUATION benchmark CHECK RUNNER
 * test (the tools/ pickup wired into the root `bun run verify` — the
 * building-benchmark convention).
 *
 * Exercises `./runner.ts` over the COMMITTED ARTIFACTS as data (the
 * boundary matrix forbids tools → packages/backend imports): the full
 * check report must be clean, and the mandated discrimination assertions
 * are additionally asserted test-by-test from the committed data.
 *
 * Determinism: pure reads of committed files + pure logic; no clock, no
 * randomness, no network, no engine import.
 */

import { describe, expect, test } from "bun:test";
import {
  loadReasoningEvalArtifacts,
  verifyReasoningEvalArtifacts,
} from "./runner";

const report = verifyReasoningEvalArtifacts();

describe("PROD-028 reasoning-eval: the committed artifacts are coherent", () => {
  test("the full check report is clean", () => {
    expect(report.ok).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(15);
  });

  test("every named check passes (failures list the gap)", () => {
    const failed = report.checks.filter((check) => !check.passed).map((check) => check.id);
    expect(failed).toEqual([]);
  });

  test("the suite is the committed 26-scenario catalog across three lanes", () => {
    expect(report.summary.total).toBe(26);
    expect(report.summary.byLane).toEqual({
      "document-understanding": 8,
      "multimodal-reasoning": 9,
      retrieval: 9,
    });
    expect(report.summary.classificationMatches).toBe(26);
    expect(report.summary.expectedMatches).toBe(26);
  });

  test("the artifact identities are pinned (suite, benchmark, code version)", () => {
    const { scenarioSuite, outcomesSuite } = loadReasoningEvalArtifacts();
    expect(scenarioSuite["suiteId"]).toBe("reasoning-eval-suite/1");
    expect(scenarioSuite["version"]).toBe("1.0.0");
    expect(scenarioSuite["benchmarkId"]).toBe("reasoning-eval-suite/1");
    expect(scenarioSuite["codeVersion"]).toBe("prod-028/reasoning-eval/1");
    expect(outcomesSuite["suiteId"]).toBe("reasoning-eval-suite/1");
    expect(outcomesSuite["scenarioCount"]).toBe(26);
  });
});

describe("PROD-028 reasoning-eval: the five-way discrimination (the HF-2 exit gate)", () => {
  const { outcomes } = loadReasoningEvalArtifacts();
  const outcomeOf = (scenarioId: string) => {
    const found = outcomes.find((outcome) => outcome.scenarioId === scenarioId);
    if (found === undefined) {
      throw new Error(`no committed outcome for '${scenarioId}'`);
    }
    return found;
  };

  test("per lane: every applicable failure kind is exhibited", () => {
    expect(report.checks.find((check) => check.id === "discrimination-lane-coverage")?.passed).toBe(true);
  });

  test("the five HF-2 kinds are all present across the committed classifications", () => {
    expect(report.checks.find((check) => check.id === "discrimination-five-way-present")?.passed).toBe(true);
    expect(report.summary.byClassification["perception-failure"]).toBeGreaterThan(0);
    expect(report.summary.byClassification["retrieval-failure"]).toBeGreaterThan(0);
    expect(report.summary.byClassification["reasoning-failure"]).toBeGreaterThan(0);
    expect(report.summary.byClassification["unsupported-data"]).toBeGreaterThan(0);
    expect(report.summary.byClassification["operation-semantic-failure"]).toBeGreaterThan(0);
  });

  test("a hallucinated-but-plausible answer is CAUGHT (integrity violation + the right kind)", () => {
    const outcome = outcomeOf("vlm-hallucination");
    expect(outcome.classification).toBe("perception-failure");
    expect(outcome.violationRules).toEqual(["facts-grounded-in-cited-evidence"]);
    expect(outcome.metrics.envelopeIntegrityViolations).toBe(1);
  });

  test("answering from wrong evidence is retrieval-failure, NOT reasoning-failure", () => {
    expect(outcomeOf("vlm-wrong-evidence").classification).toBe("retrieval-failure");
    expect(outcomeOf("doc-wrong-section").classification).toBe("retrieval-failure");
    expect(outcomeOf("retrieval-near-miss").classification).toBe("retrieval-failure");
    expect(outcomeOf("vlm-wrong-evidence").violationRules).toEqual([]);
  });

  test("refusing out-of-scope data is unsupported-data, NOT perception-failure (and clean)", () => {
    expect(outcomeOf("vlm-refusal").classification).toBe("unsupported-data");
    expect(outcomeOf("vlm-refusal").violationRules).toEqual([]);
    expect(outcomeOf("doc-refusal").classification).toBe("unsupported-data");
  });

  test("a fabricated evidence reference is unsupported-data (invented support ≠ retrieval miss)", () => {
    const outcome = outcomeOf("retrieval-fabricated-hit");
    expect(outcome.classification).toBe("unsupported-data");
    expect(outcome.classification).not.toBe("retrieval-failure");
    expect(outcome.violationRules).toEqual(["cited-evidence-exists"]);
  });

  test("the empty-behavior pair: same behavior, different ground truth, different kind", () => {
    expect(outcomeOf("retrieval-empty-in-scope").classification).toBe("retrieval-failure");
    expect(outcomeOf("retrieval-empty-out-of-scope").classification).toBe("unsupported-data");
  });

  test("an operation contract violation is operation-semantic-failure", () => {
    const outcome = outcomeOf("doc-operation-wrong-target");
    expect(outcome.classification).toBe("operation-semantic-failure");
    expect(outcome.violationRules).toEqual(["operation-contract-honored"]);
  });

  test("contract-mismatch envelopes are caught on every lane (identity/checks rules)", () => {
    expect(outcomeOf("vlm-missing-identity").classification).toBe("contract-mismatch");
    expect(outcomeOf("vlm-implicit-assumptions").classification).toBe("contract-mismatch");
    expect(outcomeOf("doc-fabricated-check").classification).toBe("contract-mismatch");
    expect(outcomeOf("retrieval-fabricated-check").classification).toBe("contract-mismatch");
  });
});

describe("PROD-028 reasoning-eval: the closed vocabulary and the emission shape", () => {
  const { outcomes } = loadReasoningEvalArtifacts();

  test("every classification and violation kind comes from the closed vocabulary", () => {
    expect(report.checks.find((check) => check.id === "vocabulary-closed")?.passed).toBe(true);
    const kinds = new Set(outcomes.flatMap((outcome) => outcome.violationKinds));
    // the deterministic fixture doubles never exhaust, time out or license-block
    for (const unused of ["resource-exhaustion", "timeout", "license-blocked"]) {
      expect(kinds.has(unused)).toBe(false);
    }
  });

  test("every outcome is content-addressed (64-hex record, manifest and envelope digests)", () => {
    expect(report.checks.find((check) => check.id === "emission-content-addressed")?.passed).toBe(true);
    for (const outcome of outcomes) {
      expect(outcome.recordId).toMatch(/^[0-9a-f]{64}$/);
      expect(outcome.manifestId).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("every scenario matched its expected golden (classifications are ASSERTED, not just scored)", () => {
    expect(outcomes.every((outcome) => outcome.expectedMatch)).toBe(true);
    expect(outcomes.every((outcome) => outcome.metrics.classificationMatch === 1)).toBe(true);
  });

  test("the committed summary recomputes from the outcomes alone", () => {
    expect(report.checks.find((check) => check.id === "summary-recomputes")?.passed).toBe(true);
  });
});

describe("PROD-028 reasoning-eval: the envelope fixture map over the committed data", () => {
  const { scenarios } = loadReasoningEvalArtifacts();

  test("every bundle carries the evaluable canonical envelope fields", () => {
    expect(report.checks.find((check) => check.id === "fixture-map-envelope-fields")?.passed).toBe(true);
    for (const scenario of scenarios) {
      const bundle = JSON.parse(scenario.input.payload.bundleJson) as Record<string, unknown>;
      expect(typeof bundle["question"]).toBe("string");
      expect(Array.isArray(bundle["evidence"])).toBe(true);
      expect(Array.isArray(bundle["offeredChecks"])).toBe(true);
      expect(bundle["authorizedContext"]).toBeDefined();
    }
  });

  test("the retrieval lane's corpus carries measurement uncertainty; the other lanes declare none today", () => {
    expect(report.checks.find((check) => check.id === "fixture-map-uncertainty-retrieval-lane")?.passed).toBe(true);
    const vlmScenario = scenarios.find((scenario) => scenario.scenarioId === "vlm-correct");
    const vlmBundle = JSON.parse(String(vlmScenario?.input.payload.bundleJson)) as Record<string, unknown>;
    for (const entry of vlmBundle["evidence"] as Record<string, unknown>[]) {
      expect(entry["measurement"]).toBeUndefined();
    }
  });

  test("the expected blocks carry the prediction AND the evaluator-side correctness oracle", () => {
    for (const scenario of scenarios) {
      expect(scenario.expected.correctResultStatus).toBeDefined();
      expect(Array.isArray(scenario.expected.correctAssumptions)).toBe(true);
      expect(scenario.expected.expectedFailureKind).toBeDefined();
    }
  });
});
