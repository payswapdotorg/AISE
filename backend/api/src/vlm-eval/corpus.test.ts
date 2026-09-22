/**
 * HFX-201 — the CORPUS tests: the committed multimodal benchmark corpus
 * is coherent, covers every behavior-matrix cell and every double-behavior
 * class, and every materialized run parses + validates through the Layer-2
 * scenario parser and the control plane's input validator.
 */

import { describe, expect, test } from "bun:test";
import { validateProviderInput } from "@aise/provider-registry";
import {
  ENVELOPE_INTEGRITY_RULES,
  parseEvidenceQuestionBundle,
  parseReasoningEvalScenario,
} from "../reasoning-eval/model";
import {
  VLM_EVAL_CORPUS,
  VLM_EVAL_RUNS,
  buildVlmEvalScenario,
  vlmEvalCorpus,
  vlmEvalRuns,
} from "./corpus";
import {
  QWEN3_VL_VARIANTS,
  VLM_BEHAVIOR_MATRIX_CELLS,
  VLM_DOUBLE_BEHAVIOR_CLASSES,
  qwen3VlProfileForVariant,
} from "./model";

describe("HFX-201 corpus: the committed scenario catalog", () => {
  test("the corpus holds 12 base scenarios; the run corpus holds 24 (every base × both variants)", () => {
    expect(VLM_EVAL_CORPUS.length).toBe(12);
    expect(VLM_EVAL_RUNS.length).toBe(24);
    for (const spec of VLM_EVAL_CORPUS) {
      const variants = VLM_EVAL_RUNS.filter((run) => run.baseScenarioId === spec.scenarioId);
      expect(variants.map((run) => run.variant).sort()).toEqual([...QWEN3_VL_VARIANTS].sort());
    }
  });

  test("the corpus construction is deterministic (fresh builds are byte-identical)", () => {
    expect(vlmEvalCorpus()).toEqual(VLM_EVAL_CORPUS);
    expect(vlmEvalRuns().map((run) => run.scenarioId)).toEqual(
      VLM_EVAL_RUNS.map((run) => run.scenarioId),
    );
  });

  test("every run id is unique and composed as <base>@<variant>", () => {
    const ids = VLM_EVAL_RUNS.map((run) => run.scenarioId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const run of VLM_EVAL_RUNS) {
      expect(run.scenarioId).toBe(`${run.baseScenarioId}@${run.variant}`);
    }
  });

  test("every evidence fixture carries a revision id; the corpus spans image, video and OCR fixtures", () => {
    const kinds = new Set<string>();
    for (const spec of VLM_EVAL_CORPUS) {
      for (const fixture of spec.evidence) {
        expect(fixture.revision).toMatch(/^r\d+$/);
        kinds.add(fixture.kind);
      }
    }
    expect([...kinds].sort()).toEqual(["image", "ocr", "video"]);
  });

  test("the corpus covers every behavior-matrix cell with at least two base scenarios", () => {
    for (const cell of VLM_BEHAVIOR_MATRIX_CELLS) {
      const scenarios = VLM_EVAL_CORPUS.filter((spec) => spec.matrixCell === cell);
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("the corpus covers every double-behavior class (well-grounded, hallucinating, refusing)", () => {
    const classes = new Set(
      VLM_EVAL_RUNS.flatMap((run) => [run.behaviorClass]),
    );
    for (const behaviorClass of VLM_DOUBLE_BEHAVIOR_CLASSES) {
      expect(classes.has(behaviorClass)).toBe(true);
    }
  });

  test("both variants exhibit defective and honest behaviors (the comparison is two-sided, not rigged)", () => {
    const defective8b = VLM_EVAL_RUNS.filter(
      (run) => run.variant === "qwen3-vl-8b" && run.behaviorClass !== "well-grounded" && run.behaviorClass !== "refusing",
    );
    const defective30b = VLM_EVAL_RUNS.filter(
      (run) => run.variant === "qwen3-vl-30b-a3b" && run.behaviorClass === "hallucinating",
    );
    expect(defective8b.length).toBe(4); // flange hallucination, date hallucination, width hallucination, silent resolution
    expect(defective30b.length).toBe(1); // the transitive spatial mis-resolution
  });

  test("the offered checks of every bundle equal the check plan's check ids", () => {
    for (const spec of VLM_EVAL_CORPUS) {
      const expected = [...new Set(spec.checkPlan.map((plan) => plan.check))];
      for (const variant of QWEN3_VL_VARIANTS) {
        const run = buildVlmEvalScenario(spec, variant);
        expect([...run.bundle.offeredChecks].sort()).toEqual([...expected].sort());
      }
    }
  });

  test("every expected violation rule comes from the Layer-2 integrity-rule vocabulary", () => {
    const rules: readonly string[] = ENVELOPE_INTEGRITY_RULES;
    for (const spec of VLM_EVAL_CORPUS) {
      for (const variant of QWEN3_VL_VARIANTS) {
        for (const rule of spec.expectedViolationRules[variant]) {
          expect(rules.includes(rule)).toBe(true);
        }
      }
    }
  });
});

describe("HFX-201 corpus: the Layer-2 materialization validates end to end", () => {
  test("every materialized run parses as a Layer-2 ReasoningEvalScenario (round-trip)", () => {
    for (const run of VLM_EVAL_RUNS) {
      const roundTripped = JSON.parse(JSON.stringify(run.scenario));
      const parsed = parseReasoningEvalScenario(roundTripped);
      expect(parsed.scenarioId).toBe(run.scenarioId);
      expect(parsed.lane).toBe("multimodal-reasoning");
      expect(parsed.providerRef.providerId).toBe(run.variant);
      expect(parsed.input.payload["behaviorTag"]).toBe(
        run.behaviorClass === "refusing" && run.scenario.input.payload["variantScript"] === undefined
          ? "refuse"
          : "replay",
      );
    }
  });

  test("every embedded bundle parses as a canonical EvidenceQuestionBundle with the composed scenario id", () => {
    for (const run of VLM_EVAL_RUNS) {
      const bundleJson = run.scenario.input.payload["bundleJson"];
      expect(typeof bundleJson).toBe("string");
      const bundle = parseEvidenceQuestionBundle(JSON.parse(bundleJson as string));
      expect(bundle.scenarioId).toBe(run.scenarioId);
      expect(bundle.evidence.length).toBe(run.fixtures.length);
      expect(bundle.requiredEvidenceIds).toEqual(run.bundle.requiredEvidenceIds);
    }
  });

  test("every run's input validates against the variant's declared input contract (the control plane)", () => {
    for (const run of VLM_EVAL_RUNS) {
      const profile = qwen3VlProfileForVariant(run.variant);
      const validation = validateProviderInput(run.scenario.input, profile);
      if (!validation.ok) {
        throw new Error(`the input of '${run.scenarioId}' failed the declared contract`);
      }
      expect(validation.inputDigest).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
