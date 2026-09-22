/**
 * HFX-201 — the DETERMINISTIC CHECK tests: the grounded-reasoning
 * recomputation authority. Provider-claimed facts not derivable from the
 * bundle are failures (`unsupported-data`); contradicting claims are
 * `reasoning-failure`s; deterministically locatable but unsurfaced
 * evidence and silently-resolved conflicts are `retrieval-failure`s; the
 * spatial resolver resolves THROUGH the bundle's positional grid; the
 * revision binding is verified against the structured corpus side.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonText } from "../reasoning-eval/model";
import {
  resolveFieldAssertions,
  resolveSpatialReference,
  runGroundedReasoningChecks,
  verifyRevisionBinding,
} from "./checks";
import type { VlmGroundedCheckResult } from "./checks";
import { VLM_EVAL_RUNS } from "./corpus";
import type { VlmEvalScenario } from "./corpus";
import { evaluateVlmScenario } from "./harness";
import type { VlmEvalOutcome } from "./harness";

const runOf = (scenarioId: string): VlmEvalScenario => {
  const found = VLM_EVAL_RUNS.find((run) => run.scenarioId === scenarioId);
  if (found === undefined) {
    throw new Error(`no corpus run '${scenarioId}'`);
  }
  return found;
};

const outcomeOf = (scenarioId: string): VlmEvalOutcome => evaluateVlmScenario(runOf(scenarioId));

const kindsOf = (result: VlmGroundedCheckResult): readonly string[] => result.observationKinds;

describe("HFX-201 checks: the fact-derivability check (the hallucination catch)", () => {
  test("a claimed fact absent from the bundle is an unsupported-data failure — never silently accepted", () => {
    const outcome = outcomeOf("lintel-flange-width-missing@qwen3-vl-8b");
    expect(outcome.grounded.verdicts[0]?.verdict).toBe("not-derivable");
    expect(kindsOf(outcome.grounded)).toEqual(["unsupported-data"]);
    const observation = outcome.grounded.observations[0];
    expect(observation?.check).toBe("vlm-fact-derivability-check");
    expect(observation?.detail).toContain("150 mm");
    expect(observation?.detail).toContain("cannot");
  });

  test("a well-grounded answer's facts are all derivable from the cited evidence", () => {
    for (const scenarioId of [
      "spatial-ref-lintel@qwen3-vl-8b",
      "spatial-ref-lintel@qwen3-vl-30b-a3b",
      "nameplate-fields-grounded@qwen3-vl-30b-a3b",
      "video-crack-progression-grounded@qwen3-vl-8b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.grounded.verdicts[0]?.verdict).toBe("all-derivable");
      expect(outcome.grounded.groundedPass).toBe(true);
    }
  });

  test("derivability is computed over the CITED evidence only (a fact grounded elsewhere still fails)", () => {
    // the silent-resolution run cites only the drawing; its cited facts are
    // derivable — the conflict check catches the drop, not derivability.
    const outcome = outcomeOf("beam-section-conflict-silent-resolution@qwen3-vl-8b");
    expect(outcome.grounded.verdicts[0]?.verdict).toBe("all-derivable");
    expect(kindsOf(outcome.grounded)).toEqual(["retrieval-failure"]);
  });
});

describe("HFX-201 checks: the spatial-reference resolver (positional, never world knowledge)", () => {
  test("'directly-above' resolves through the positional grid to the lintel", () => {
    const run = runOf("spatial-ref-lintel@qwen3-vl-8b");
    const resolution = resolveSpatialReference(run.fixtures, {
      relation: "directly-above",
      anchorElementIds: ["EL-DOOR-01"],
    });
    expect(resolution.evidenceId).toBe("IMG-NORTH-2");
    expect(resolution.elementId).toBe("EL-LINTEL-01");
    expect(resolution.findingFact).toContain("steel lintel beam EL-LINTEL-01");
  });

  test("'between' resolves transitively to the pier (and the distractor interior image never leaks in)", () => {
    const run = runOf("spatial-ref-between-openings@qwen3-vl-8b");
    const resolution = resolveSpatialReference(run.fixtures, {
      relation: "between",
      anchorElementIds: ["EL-WINDOW-01", "EL-DOOR-01"],
    });
    expect(resolution.evidenceId).toBe("IMG-NORTH-2");
    expect(resolution.elementId).toBe("EL-PIER-02");
  });

  test("an ambiguous or unresolvable reference fails closed (a corpus authoring bug)", () => {
    const run = runOf("spatial-ref-lintel@qwen3-vl-8b");
    expect(() =>
      resolveSpatialReference(run.fixtures, {
        relation: "directly-above",
        anchorElementIds: ["EL-NONEXISTENT"],
      }),
    ).toThrow(/exactly one element/);
    expect(() =>
      resolveSpatialReference(run.fixtures, {
        relation: "between",
        anchorElementIds: ["EL-DOOR-01", "EL-DOWNSPOUT-01"],
      }),
    ).toThrow(/exactly one element/);
  });

  test("a provider answering in-domain with the wrong element is contradicted (reasoning-failure)", () => {
    const outcome = outcomeOf("spatial-ref-between-openings@qwen3-vl-30b-a3b");
    const spatial = outcome.grounded.verdicts.find(
      (verdict) => verdict.check === "vlm-spatial-reference-resolution-check",
    );
    expect(spatial?.verdict).toBe("contradicted");
    expect(spatial?.recomputedFact).toContain("PIER-N-02");
    expect(kindsOf(outcome.grounded)).toEqual(["reasoning-failure", "unsupported-data"]);
  });

  test("the resolved spatial answer confirmed in a well-grounded run", () => {
    const outcome = outcomeOf("spatial-ref-lintel@qwen3-vl-8b");
    const spatial = outcome.grounded.verdicts.find(
      (verdict) => verdict.check === "vlm-spatial-reference-resolution-check",
    );
    expect(spatial?.verdict).toBe("confirmed");
  });
});

describe("HFX-201 checks: the field-value recomputation (deterministic checks stay authoritative)", () => {
  test("the field assertions resolve from image attributes, OCR regions and video frames", () => {
    const conflictRun = runOf("beam-section-conflict-surfaced@qwen3-vl-8b");
    const sectionAssertions = resolveFieldAssertions(conflictRun.fixtures, "section-size:beam-S-12");
    expect(sectionAssertions.length).toBe(2);
    expect(sectionAssertions.map((a) => a.value).sort()).toEqual(["W12x26", "W14x22"]);

    const videoRun = runOf("video-crack-progression-grounded@qwen3-vl-8b");
    const widthAssertions = resolveFieldAssertions(videoRun.fixtures, "crack-width:column-C2");
    expect(widthAssertions.map((a) => a.value)).toEqual(["0.4", "0.7", "0.9", "1.1"]);
    expect(widthAssertions.every((a) => a.source === "video-frame")).toBe(true);
  });

  test("the max aggregation recomputes 1.1 mm from the frame series and confirms the grounded claim", () => {
    const outcome = outcomeOf("video-crack-progression-grounded@qwen3-vl-30b-a3b");
    const field = outcome.grounded.verdicts.find(
      (verdict) => verdict.check === "vlm-field-value-recomputation-check",
    );
    expect(field?.verdict).toBe("confirmed");
    expect(field?.recomputedFact).toBe("the maximum observed crack width across the video frames is 1.1 mm");
  });

  test("a claimed measurement contradicting the recomputation is a reasoning-failure", () => {
    const outcome = outcomeOf("video-crack-width-hallucination@qwen3-vl-8b");
    const field = outcome.grounded.verdicts.find(
      (verdict) => verdict.check === "vlm-field-value-recomputation-check",
    );
    expect(field?.verdict).toBe("contradicted");
    expect(field?.recomputedFact).toContain("1.1 mm");
    expect(kindsOf(outcome.grounded)).toEqual(["reasoning-failure", "unsupported-data"]);
  });

  test("the illegible OCR region recomputes to the honest-absence fact (never a guessed value)", () => {
    const honest = outcomeOf("nameplate-inspection-date-illegible@qwen3-vl-30b-a3b");
    const fieldHonest = honest.grounded.verdicts.find(
      (verdict) => verdict.check === "vlm-field-value-recomputation-check",
    );
    expect(fieldHonest?.verdict).toBe("confirmed");
    expect(fieldHonest?.recomputedFact).toContain("OCR-R3 of the nameplate is illegible");

    const guessing = outcomeOf("nameplate-inspection-date-illegible@qwen3-vl-8b");
    const fieldGuessing = guessing.grounded.verdicts.find(
      (verdict) => verdict.check === "vlm-field-value-recomputation-check",
    );
    expect(fieldGuessing?.verdict).toBe("contradicted");
    expect(kindsOf(guessing.grounded)).toEqual(["reasoning-failure", "unsupported-data"]);
  });

  test("the OCR region lookup confirms the legible nameplate values with their coordinates", () => {
    const outcome = outcomeOf("nameplate-fields-grounded@qwen3-vl-8b");
    const fields = outcome.grounded.verdicts.filter(
      (verdict) => verdict.check === "vlm-field-value-recomputation-check",
    );
    expect(fields.length).toBe(2);
    expect(fields.every((verdict) => verdict.verdict === "confirmed")).toBe(true);
    expect(fields.some((verdict) => verdict.recomputedFact?.includes("2500 kg"))).toBe(true);
    expect(fields.some((verdict) => verdict.recomputedFact?.includes("HT-2019-0442"))).toBe(true);
  });
});

describe("HFX-201 checks: the conflict detection (no silent resolution)", () => {
  test("two bundle items disagreeing is recomputed as a two-sided conflict", () => {
    const outcome = outcomeOf("beam-section-conflict-surfaced@qwen3-vl-8b");
    const conflict = outcome.grounded.verdicts.find(
      (verdict) => verdict.check === "vlm-conflict-detection-check",
    );
    expect(conflict?.verdict).toBe("conflict-surfaced");
    expect(conflict?.detail).toContain("W12x26");
    expect(conflict?.detail).toContain("W14x22");
    expect(conflict?.determiningEvidenceIds).toEqual(["DRAW-BEAM-1", "STENCIL-OCR-1"]);
  });

  test("surfacing the conflict with status 'conflicted' and all sides cited passes clean", () => {
    for (const scenarioId of [
      "beam-section-conflict-surfaced@qwen3-vl-8b",
      "beam-section-conflict-surfaced@qwen3-vl-30b-a3b",
      "beam-section-conflict-silent-resolution@qwen3-vl-30b-a3b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.layer2.envelope.resultStatus).toBe("conflicted");
      expect(outcome.grounded.groundedPass).toBe(true);
    }
  });

  test("silently resolving by dropping one side is a retrieval-failure (the dropped side is evidence that exists)", () => {
    const outcome = outcomeOf("beam-section-conflict-silent-resolution@qwen3-vl-8b");
    const conflict = outcome.grounded.verdicts.find(
      (verdict) => verdict.check === "vlm-conflict-detection-check",
    );
    expect(conflict?.verdict).toBe("conflict-silently-resolved");
    expect(kindsOf(outcome.grounded)).toEqual(["retrieval-failure"]);
    const observation = outcome.grounded.observations[0];
    expect(observation?.detail).toContain("STENCIL-OCR-1");
    expect(observation?.detail).toContain("no silent resolution");
  });

  test("a single-valued field is no-conflict; a bounded refusal over conflicting data is unaddressed-neutral", () => {
    const outcome = outcomeOf("video-crack-progression-grounded@qwen3-vl-8b");
    expect(
      outcome.grounded.verdicts.every(
        (verdict) => verdict.verdict !== "conflict-silently-resolved" && verdict.verdict !== "not-derivable",
      ),
    ).toBe(true);
  });
});

describe("HFX-201 checks: the revision binding", () => {
  test("every cited evidence id is bound to the exact fixture revision", () => {
    for (const run of VLM_EVAL_RUNS) {
      const outcome = evaluateVlmScenario(run);
      expect(outcome.revisionBinding.ok).toBe(true);
      for (const entry of outcome.layer2.envelope.evidenceRevisions) {
        const fixture = run.fixtures.find((candidate) => candidate.evidenceId === entry.evidenceId);
        expect(fixture?.revision).toBe(entry.revision);
      }
    }
  });

  test("a recorded revision that disagrees with the fixture is a mismatch", () => {
    const outcome = outcomeOf("spatial-ref-lintel@qwen3-vl-8b");
    const tampered = verifyRevisionBinding(
      {
        ...outcome.layer2.envelope,
        evidenceRevisions: [{ evidenceId: "IMG-NORTH-2", revision: "r99" }],
      },
      runOf("spatial-ref-lintel@qwen3-vl-8b").fixtures,
    );
    expect(tampered.ok).toBe(false);
    expect(tampered.mismatches[0]).toEqual({
      evidenceId: "IMG-NORTH-2",
      expectedRevision: "r2",
      recordedRevision: "r99",
    });
  });
});

describe("HFX-201 checks: determinism", () => {
  test("identical envelope + fixtures + plan produce byte-identical check results", () => {
    for (const run of VLM_EVAL_RUNS) {
      const first = evaluateVlmScenario(run).grounded;
      const second = runGroundedReasoningChecks(
        evaluateVlmScenario(run).layer2.envelope,
        run.fixtures,
        run.checkPlan,
      );
      expect(canonicalJsonText(first)).toBe(canonicalJsonText(second));
    }
  });
});
