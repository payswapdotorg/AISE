/**
 * HFX-201 — the QWEN3-VL PROVIDER BENCHMARK check runner test (the tools/
 * pickup wired into the root `bun run verify` — the tools/reasoning-eval
 * convention).
 *
 * Exercises `./runner.ts` over the COMMITTED ARTIFACTS as data (the
 * boundary matrix forbids tools → packages/backend imports): the full
 * check report must be clean, and the mandated behavior-matrix +
 * hallucination-catch assertions are additionally asserted test-by-test
 * from the committed data — THESE TESTS FAIL IF THE MANDATED BEHAVIOR
 * REGRESSES.
 *
 * Determinism: pure reads of committed files + pure logic; no clock, no
 * randomness, no network, no engine import.
 */

import { describe, expect, test } from "bun:test";
import { loadVlmEvalArtifacts, verifyVlmEvalArtifacts } from "./runner";

const report = verifyVlmEvalArtifacts();

describe("HFX-201 vlm-eval: the committed artifacts are coherent", () => {
  test("the full check report is clean", () => {
    expect(report.ok).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(20);
  });

  test("every named check passes (failures list the gap)", () => {
    const failed = report.checks.filter((check) => !check.passed).map((check) => check.id);
    expect(failed).toEqual([]);
  });

  test("the suite is the committed 24-run corpus (12 base scenarios × 2 variants)", () => {
    expect(report.summary.total).toBe(24);
    expect(report.summary.baseScenarioCount).toBe(12);
    expect(report.summary.byVariant).toEqual({
      "qwen3-vl-8b": 12,
      "qwen3-vl-30b-a3b": 12,
    });
    expect(report.summary.classificationMatches).toBe(24);
    expect(report.summary.expectedMatches).toBe(24);
  });

  test("the artifact identities are pinned (suite, benchmark, code version, execution mode)", () => {
    const { scenarioSuite, outcomesSuite } = loadVlmEvalArtifacts();
    expect(scenarioSuite["suiteId"]).toBe("qwen3-vl-provider-benchmark/1");
    expect(scenarioSuite["version"]).toBe("1.0.0");
    expect(scenarioSuite["benchmarkId"]).toBe("qwen3-vl-multimodal-benchmark/1");
    expect(scenarioSuite["codeVersion"]).toBe("hfx-201/vlm-eval/1");
    expect(scenarioSuite["executionMode"]).toBe("deterministic-in-repo-doubles");
    expect(scenarioSuite["providerFamily"]).toBe("qwen3-vl");
    expect(outcomesSuite["suiteId"]).toBe("qwen3-vl-provider-benchmark/1");
    expect(outcomesSuite["runCount"]).toBe(24);
  });
});

describe("HFX-201 vlm-eval: the two registered candidate profiles", () => {
  test("two SEPARATE profiles with distinct ids + versions and 64-hex digests", () => {
    expect(report.checks.find((check) => check.id === "candidates-two-separate-profiles")?.passed).toBe(true);
    const { variants } = loadVlmEvalArtifacts();
    expect(variants.map((variant) => variant.providerId).sort()).toEqual([
      "qwen3-vl-30b-a3b",
      "qwen3-vl-8b",
    ]);
    expect(variants[0]!.technologyVersion).not.toBe(variants[1]!.technologyVersion);
    for (const variant of variants) {
      expect(variant.profileDigest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("both candidates are evaluation-only and the promotion gate refused them", () => {
    expect(report.checks.find((check) => check.id === "candidates-evaluation-only")?.passed).toBe(true);
    expect(report.checks.find((check) => check.id === "candidates-license-gate-refused")?.passed).toBe(true);
    for (const variant of report.variants) {
      expect(variant.licenseStatus).toBe("evaluation-only");
      expect(variant.registryState).toBe("rejected");
      expect(variant.promotionRefusalKinds).toEqual(["license-blocked"]);
    }
  });
});

describe("HFX-201 vlm-eval: the behavior matrix (the mandated cells)", () => {
  const { outcomes } = loadVlmEvalArtifacts();
  const outcomeOf = (scenarioId: string) => {
    const found = outcomes.find((outcome) => outcome.scenarioId === scenarioId);
    if (found === undefined) {
      throw new Error(`no committed outcome for '${scenarioId}'`);
    }
    return found;
  };

  test("every variant exhibits every mandated cell", () => {
    expect(report.checks.find((check) => check.id === "behavior-matrix-all-cells-exhibited")?.passed).toBe(true);
    expect(report.summary.byMatrixCell).toEqual({
      "conflicting-evidence": 4,
      "grounded-pass": 10,
      "missing-evidence": 6,
      "unsupported-question": 4,
    });
  });

  test("grounded-pass: the correct envelope bound to the right revisions (both variants)", () => {
    for (const scenarioId of [
      "spatial-ref-lintel@qwen3-vl-8b",
      "spatial-ref-lintel@qwen3-vl-30b-a3b",
      "nameplate-fields-grounded@qwen3-vl-8b",
      "video-crack-progression-grounded@qwen3-vl-30b-a3b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.classification).toBe("none");
      expect(outcome.violationKinds).toEqual([]);
      expect(outcome.groundedPass).toBe(true);
      expect(outcome.expectedMatch).toBe(true);
      expect(outcome.revisionBindingOk).toBe(true);
    }
    const lintel = outcomeOf("spatial-ref-lintel@qwen3-vl-8b");
    expect(lintel.evidenceRevisions).toEqual([{ evidenceId: "IMG-NORTH-2", revision: "r2" }]);
  });

  test("missing-evidence: bounded refusals name the gap; the invented measurements are CAUGHT", () => {
    // the honest bounded refusals (both variants)
    for (const scenarioId of [
      "south-elevation-cladding-missing@qwen3-vl-8b",
      "south-elevation-cladding-missing@qwen3-vl-30b-a3b",
      "lintel-flange-width-missing@qwen3-vl-30b-a3b",
      "nameplate-inspection-date-illegible@qwen3-vl-30b-a3b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.resultStatus).toBe("unsupported");
      expect(outcome.groundedPass).toBe(true);
      expect(outcome.expectedMatch).toBe(true);
    }
    // the 8B hallucinations over missing data are caught with the exact kinds
    expect(outcomeOf("lintel-flange-width-missing@qwen3-vl-8b").classification).toBe("perception-failure");
    expect(outcomeOf("lintel-flange-width-missing@qwen3-vl-8b").groundedObservationKinds).toEqual([
      "unsupported-data",
    ]);
    expect(outcomeOf("nameplate-inspection-date-illegible@qwen3-vl-8b").groundedObservationKinds).toEqual([
      "reasoning-failure",
      "unsupported-data",
    ]);
  });

  test("conflicting-evidence: surfaced as 'conflicted' with both sides; silent resolution is a retrieval failure", () => {
    for (const scenarioId of [
      "beam-section-conflict-surfaced@qwen3-vl-8b",
      "beam-section-conflict-surfaced@qwen3-vl-30b-a3b",
      "beam-section-conflict-silent-resolution@qwen3-vl-30b-a3b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.resultStatus).toBe("conflicted");
      expect(outcome.evidenceIds).toEqual(["DRAW-BEAM-1", "STENCIL-OCR-1"]);
      expect(outcome.classification).toBe("none");
    }
    const silent = outcomeOf("beam-section-conflict-silent-resolution@qwen3-vl-8b");
    expect(silent.classification).toBe("retrieval-failure");
    expect(silent.groundedObservationKinds).toEqual(["retrieval-failure"]);
    expect(silent.evidenceIds).toEqual(["DRAW-BEAM-1"]);
  });

  test("unsupported-question: the explicit unsupported-data refusal — never a guess", () => {
    for (const scenarioId of [
      "unsupported-audio-transcription@qwen3-vl-8b",
      "unsupported-audio-transcription@qwen3-vl-30b-a3b",
      "unsupported-code-verification@qwen3-vl-8b",
      "unsupported-code-verification@qwen3-vl-30b-a3b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.classification).toBe("unsupported-data");
      expect(outcome.violationKinds).toEqual([]);
      expect(outcome.groundedPass).toBe(true);
      expect(outcome.resultStatus).toBe("unsupported");
      expect(outcome.resultClaim).toBeNull();
    }
  });

  test("the hallucination catch: every hallucinating run is caught on BOTH layers", () => {
    expect(report.checks.find((check) => check.id === "behavior-hallucination-caught")?.passed).toBe(true);
    expect(report.checks.find((check) => check.id === "behavior-invented-facts-are-unsupported-data")?.passed).toBe(true);
    const hallucinating = outcomes.filter((outcome) => outcome.behaviorClass === "hallucinating");
    expect(hallucinating.length).toBe(5);
    for (const outcome of hallucinating) {
      expect(outcome.classification).not.toBe("none");
      expect(outcome.groundedFailureObservations).toBeGreaterThan(0);
      expect(outcome.expectedMatch).toBe(true);
    }
  });
});

describe("HFX-201 vlm-eval: the closed vocabulary, emission shape and binding", () => {
  const { outcomes, scenarios } = loadVlmEvalArtifacts();

  test("every classification/violation/grounded kind comes from the closed vocabulary", () => {
    expect(report.checks.find((check) => check.id === "vocabulary-closed")?.passed).toBe(true);
    const kinds = new Set(outcomes.flatMap((outcome) => outcome.groundedObservationKinds));
    // the deterministic doubles never exhaust, time out or license-block at run level
    for (const unused of ["resource-exhaustion", "timeout", "license-blocked"]) {
      expect(kinds.has(unused)).toBe(false);
    }
  });

  test("every run is content-addressed; the consolidated records are comparable", () => {
    expect(report.checks.find((check) => check.id === "emission-content-addressed")?.passed).toBe(true);
    expect(report.checks.find((check) => check.id === "emission-records-comparable")?.passed).toBe(true);
    expect(report.checks.find((check) => check.id === "emission-provenance-manifests-sealed")?.passed).toBe(true);
    for (const outcome of outcomes) {
      expect(outcome.recordId).toMatch(/^[0-9a-f]{64}$/);
      expect(outcome.manifestId).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("every cited evidence id is bound to the exact bundle revision", () => {
    expect(report.checks.find((check) => check.id === "revision-binding-exact")?.passed).toBe(true);
    for (const scenario of scenarios) {
      const outcome = outcomes.find((entry) => entry.scenarioId === scenario.scenarioId);
      expect(outcome?.revisionBindingOk).toBe(true);
    }
  });

  test("the measured video runs carry propagated measurement uncertainty", () => {
    expect(report.checks.find((check) => check.id === "uncertainty-propagated")?.passed).toBe(true);
    const measured = outcomes.filter((outcome) => outcome.measurementUncertainty.length > 0);
    expect(measured.length).toBe(4);
    for (const outcome of measured) {
      expect(outcome.measurementUncertainty[0]).toEqual({
        evidenceId: "VID-COL-1",
        sigma: 0.05,
        unit: "mm",
      });
    }
  });

  test("the committed summary recomputes from the outcomes alone", () => {
    expect(report.checks.find((check) => check.id === "summary-recomputes")?.passed).toBe(true);
    expect(report.summary.groundedFailureObservations).toBe(8);
  });
});
