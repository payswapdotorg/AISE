/**
 * HFX-201 — the HARNESS tests: the behavior matrix (every cell asserted
 * per applicable variant), the hallucination catch, the provider
 * replacement invariance (the Evidence Envelope schema never changes) and
 * the end-to-end determinism. THESE TESTS FAIL IF THE MANDATED BEHAVIOR
 * REGRESSES.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonText, parseDeclaredEvidenceEnvelope } from "../reasoning-eval/model";
import { validateBenchmarkRecord, verifyProvenanceManifest } from "@aise/provider-registry";
import { evaluateVlmScenario, vlmRegistryLogFor } from "./harness";
import type { VlmEvalOutcome } from "./harness";
import { VLM_EVAL_RUNS } from "./corpus";
import type { VlmEvalScenario } from "./corpus";

const runOf = (scenarioId: string): VlmEvalScenario => {
  const found = VLM_EVAL_RUNS.find((run) => run.scenarioId === scenarioId);
  if (found === undefined) {
    throw new Error(`no corpus run '${scenarioId}'`);
  }
  return found;
};

const outcomeOf = (scenarioId: string): VlmEvalOutcome => evaluateVlmScenario(runOf(scenarioId));

describe("HFX-201 harness: the grounded-pass cell (the correct envelope, bound to the right revisions)", () => {
  test("a well-grounded answer validates through the Layer-2 envelope parser with zero violations", () => {
    for (const scenarioId of [
      "spatial-ref-lintel@qwen3-vl-8b",
      "spatial-ref-lintel@qwen3-vl-30b-a3b",
      "spatial-ref-between-openings@qwen3-vl-8b",
      "nameplate-fields-grounded@qwen3-vl-8b",
      "nameplate-fields-grounded@qwen3-vl-30b-a3b",
      "video-crack-progression-grounded@qwen3-vl-8b",
      "video-crack-progression-grounded@qwen3-vl-30b-a3b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.layer2.classification).toBe("none");
      expect(outcome.layer2.violations).toEqual([]);
      expect(outcome.grounded.groundedPass).toBe(true);
      expect(outcome.expectedMatch).toBe(true);
      expect(outcome.revisionBinding.ok).toBe(true);
    }
  });

  test("the grounded envelope is bound to the exact evidence revisions and the task/context", () => {
    const outcome = outcomeOf("spatial-ref-lintel@qwen3-vl-8b");
    const envelope = outcome.layer2.envelope;
    expect(envelope.intent).toContain("directly above the door opening DOOR-N");
    expect(envelope.authorizedContext).toEqual({
      projectId: "proj-meridian-tower-007",
      contextId: "ctx-north-elevation",
      revision: "r1",
    });
    expect(envelope.evidenceIds).toEqual(["IMG-NORTH-2"]);
    expect(envelope.evidenceRevisions).toEqual([{ evidenceId: "IMG-NORTH-2", revision: "r2" }]);
  });

  test("the measured video answer carries the propagated measurement uncertainty (never provider-fabricated)", () => {
    for (const scenarioId of [
      "video-crack-progression-grounded@qwen3-vl-8b",
      "video-crack-progression-grounded@qwen3-vl-30b-a3b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.layer2.envelope.measurementUncertainty).toEqual([
        { evidenceId: "VID-COL-1", sigma: 0.05, unit: "mm" },
      ]);
    }
  });

  test("the emitted per-run artifacts are content-addressed and verifiable", () => {
    const outcome = outcomeOf("nameplate-fields-grounded@qwen3-vl-30b-a3b");
    expect(outcome.layer2.benchmarkRecord.recordId).toMatch(/^[0-9a-f]{64}$/);
    expect(outcome.layer2.provenanceManifest.manifestId).toMatch(/^[0-9a-f]{64}$/);
    expect(validateBenchmarkRecord(outcome.layer2.benchmarkRecord).ok).toBe(true);
    expect(verifyProvenanceManifest(outcome.layer2.provenanceManifest).ok).toBe(true);
    expect(outcome.layer2.benchmarkRecord.providerId).toBe("qwen3-vl-30b-a3b");
    expect(outcome.layer2.benchmarkRecord.technologyVersion).toBe("30b-a3b-eval-doubles-1");
  });
});

describe("HFX-201 harness: the unsupported-question cell (out of the declared capability set)", () => {
  test("an audio-transcription question is refused explicitly — never a guess", () => {
    for (const scenarioId of [
      "unsupported-audio-transcription@qwen3-vl-8b",
      "unsupported-audio-transcription@qwen3-vl-30b-a3b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.layer2.classification).toBe("unsupported-data");
      expect(outcome.layer2.violations).toEqual([]);
      expect(outcome.grounded.groundedPass).toBe(true);
      expect(outcome.layer2.envelope.resultClaim).toBeNull();
      expect(outcome.layer2.envelope.resultStatus).toBe("unsupported");
      // the degenerate honest-refusal envelope names the capability gap
      expect(outcome.layer2.envelope.unknowns[0]).toContain("outside the declared capability");
      expect(outcome.expectedMatch).toBe(true);
    }
  });

  test("an engineering code-verification question is refused: the provider never becomes a verification authority", () => {
    for (const scenarioId of [
      "unsupported-code-verification@qwen3-vl-8b",
      "unsupported-code-verification@qwen3-vl-30b-a3b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.layer2.classification).toBe("unsupported-data");
      expect(outcome.layer2.envelope.unknowns.join(" ")).toContain("EC3 bending utilization");
      expect(outcome.expectedMatch).toBe(true);
    }
  });

  test("the refusing runs never invent a measurement, material or observation", () => {
    for (const scenarioId of [
      "unsupported-audio-transcription@qwen3-vl-8b",
      "unsupported-code-verification@qwen3-vl-30b-a3b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.layer2.envelope.facts).toEqual([]);
      expect(outcome.layer2.envelope.evidenceIds).toEqual([]);
    }
  });
});

describe("HFX-201 harness: the missing-evidence cell (clarification or bounded refusal, never an invented measurement)", () => {
  test("absent imagery → a bounded refusal envelope naming the gap and the next action", () => {
    for (const scenarioId of [
      "south-elevation-cladding-missing@qwen3-vl-8b",
      "south-elevation-cladding-missing@qwen3-vl-30b-a3b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.layer2.envelope.resultStatus).toBe("unsupported");
      expect(outcome.layer2.envelope.resultClaim).toBeNull();
      expect(outcome.layer2.envelope.unknowns.length).toBe(1);
      expect(outcome.layer2.envelope.unknowns[0]).toContain("no image of the south elevation");
      expect(outcome.layer2.envelope.nextRecommendedAction).toContain("authorize a south-elevation capture");
      expect(outcome.layer2.violations).toEqual([]);
      expect(outcome.grounded.groundedPass).toBe(true);
      expect(outcome.expectedMatch).toBe(true);
    }
  });

  test("a missing dimension → the honest variant bounds the refusal citing what it DID find", () => {
    const outcome = outcomeOf("lintel-flange-width-missing@qwen3-vl-30b-a3b");
    expect(outcome.layer2.classification).toBe("none");
    expect(outcome.layer2.envelope.resultStatus).toBe("unsupported");
    expect(outcome.layer2.envelope.unknowns[0]).toContain("no dimensioned drawing");
    expect(outcome.layer2.envelope.evidenceIds).toEqual(["IMG-NORTH-2"]);
    expect(outcome.layer2.envelope.facts).toContain(
      "the steel lintel beam EL-LINTEL-01 spans directly above door DOOR-N on the north elevation",
    );
    expect(outcome.expectedMatch).toBe(true);
  });

  test("an illegible OCR region → the honest variant bounds the refusal over the honest absence", () => {
    const outcome = outcomeOf("nameplate-inspection-date-illegible@qwen3-vl-30b-a3b");
    expect(outcome.layer2.classification).toBe("none");
    expect(outcome.layer2.envelope.unknowns[0]).toContain("illegible");
    expect(outcome.layer2.envelope.facts[0]).toContain("OCR-R3 of the nameplate is illegible");
    expect(outcome.expectedMatch).toBe(true);
  });

  test("the 8B hallucinations over missing data are CAUGHT (invented measurement, invented date)", () => {
    const flange = outcomeOf("lintel-flange-width-missing@qwen3-vl-8b");
    expect(flange.layer2.classification).toBe("perception-failure");
    expect(flange.layer2.violations.map((violation) => violation.rule)).toEqual([
      "facts-grounded-in-cited-evidence",
    ]);
    expect(flange.grounded.observationKinds).toEqual(["unsupported-data"]);

    const date = outcomeOf("nameplate-inspection-date-illegible@qwen3-vl-8b");
    expect(date.layer2.classification).toBe("perception-failure");
    expect(date.grounded.observationKinds).toEqual(["reasoning-failure", "unsupported-data"]);
  });
});

describe("HFX-201 harness: the conflicting-evidence cell (surfaced conflict, no silent resolution)", () => {
  test("both variants surface the drawing/stencil conflict with status 'conflicted'", () => {
    for (const scenarioId of [
      "beam-section-conflict-surfaced@qwen3-vl-8b",
      "beam-section-conflict-surfaced@qwen3-vl-30b-a3b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.layer2.envelope.resultStatus).toBe("conflicted");
      expect(outcome.layer2.envelope.evidenceIds).toEqual(["DRAW-BEAM-1", "STENCIL-OCR-1"]);
      expect(outcome.layer2.envelope.evidenceRevisions).toEqual([
        { evidenceId: "DRAW-BEAM-1", revision: "r2" },
        { evidenceId: "STENCIL-OCR-1", revision: "r1" },
      ]);
      expect(outcome.layer2.envelope.resultClaim).toContain("conflicts");
      expect(outcome.layer2.envelope.resultClaim).toContain("W12x26");
      expect(outcome.layer2.envelope.resultClaim).toContain("W14x22");
      expect(outcome.layer2.classification).toBe("none");
      expect(outcome.layer2.violations).toEqual([]);
      expect(outcome.expectedMatch).toBe(true);
    }
  });

  test("the 8B silent resolution is caught: retrieval-failure at BOTH the Layer-2 tree and the deterministic check", () => {
    const outcome = outcomeOf("beam-section-conflict-silent-resolution@qwen3-vl-8b");
    expect(outcome.layer2.classification).toBe("retrieval-failure");
    expect(outcome.grounded.observationKinds).toEqual(["retrieval-failure"]);
    // the dropped side is exactly the stencil evidence
    expect(outcome.layer2.envelope.evidenceIds).toEqual(["DRAW-BEAM-1"]);
    expect(outcome.expectedMatch).toBe(true);
  });
});

describe("HFX-201 harness: the hallucination catch (measurement/material/observation absent from the bundle)", () => {
  test("every hallucinating run is caught by the Layer-2 classification AND the deterministic checks", () => {
    const hallucinating = VLM_EVAL_RUNS.filter((run) => run.behaviorClass === "hallucinating");
    expect(hallucinating.length).toBe(5); // 4 × 8B + 1 × 30B
    for (const run of hallucinating) {
      const outcome = evaluateVlmScenario(run);
      expect(outcome.layer2.classification).not.toBe("none");
      expect(outcome.grounded.groundedPass).toBe(false);
      expect(outcome.expectedMatch).toBe(true); // the catch itself is the golden expectation
    }
  });

  test("an asserted measurement/material/observation ABSENT from the bundle is an unsupported-data catch", () => {
    // the four fact-hallucinations: invented flange width, invented OCR
    // date, contradicted video measurement, invented wall-panel element
    for (const scenarioId of [
      "lintel-flange-width-missing@qwen3-vl-8b",
      "nameplate-inspection-date-illegible@qwen3-vl-8b",
      "video-crack-width-hallucination@qwen3-vl-8b",
      "spatial-ref-between-openings@qwen3-vl-30b-a3b",
    ]) {
      const outcome = outcomeOf(scenarioId);
      expect(outcome.grounded.observationKinds).toContain("unsupported-data");
      expect(outcome.layer2.classification).toBe("perception-failure");
    }
  });

  test("an invented conflict RESOLUTION (a validation result absent from the bundle) is caught as a retrieval drop", () => {
    const outcome = outcomeOf("beam-section-conflict-silent-resolution@qwen3-vl-8b");
    expect(outcome.layer2.classification).toBe("retrieval-failure");
    expect(outcome.grounded.observationKinds).toEqual(["retrieval-failure"]);
  });

  test("the invented 1.4 mm measurement is caught as an ungrounded fact AND a recomputation contradiction", () => {
    const outcome = outcomeOf("video-crack-width-hallucination@qwen3-vl-8b");
    expect(outcome.layer2.classification).toBe("perception-failure");
    expect(outcome.layer2.violations.map((violation) => violation.rule)).toEqual([
      "facts-grounded-in-cited-evidence",
    ]);
    expect(outcome.grounded.observationKinds).toEqual(["reasoning-failure", "unsupported-data"]);
    const details = outcome.grounded.observations.map((observation) => observation.detail).join(" ");
    expect(details).toContain("1.4 mm");
    expect(details).toContain("1.1 mm");
  });

  test("the 30B transitive spatial mis-resolution is caught", () => {
    const outcome = outcomeOf("spatial-ref-between-openings@qwen3-vl-30b-a3b");
    expect(outcome.layer2.classification).toBe("perception-failure");
    expect(outcome.grounded.observationKinds).toEqual(["reasoning-failure", "unsupported-data"]);
  });
});

describe("HFX-201 harness: provider replacement does not change the Evidence Envelope schema or authority", () => {
  test("the same scenario's envelopes from both variants are IDENTICAL modulo the recorded provider identity", () => {
    const outcome8 = outcomeOf("spatial-ref-lintel@qwen3-vl-8b");
    const outcome30 = outcomeOf("spatial-ref-lintel@qwen3-vl-30b-a3b");
    const stripIdentity = (envelope: typeof outcome8.layer2.envelope) => ({
      ...envelope,
      agentIdentity: null,
    });
    expect(canonicalJsonText(stripIdentity(outcome8.layer2.envelope))).toBe(
      canonicalJsonText(stripIdentity(outcome30.layer2.envelope)),
    );
    // the identities differ exactly on the provider identity
    expect(outcome8.layer2.envelope.agentIdentity?.providerId).toBe("qwen3-vl-8b");
    expect(outcome30.layer2.envelope.agentIdentity?.providerId).toBe("qwen3-vl-30b-a3b");
  });

  test("the canonical envelope key set is variant-independent (the schema is the Layer-2's, imported-only)", () => {
    const outcome8 = outcomeOf("video-crack-progression-grounded@qwen3-vl-8b");
    const outcome30 = outcomeOf("video-crack-progression-grounded@qwen3-vl-30b-a3b");
    expect(Object.keys(outcome8.layer2.envelope).sort()).toEqual(
      Object.keys(outcome30.layer2.envelope).sort(),
    );
    // the envelope is a pure canonical Layer-2 projection: the provider-native
    // payload never enters it (it rides the result as opaque provenance only)
    const envelopeJson = canonicalJsonText(outcome8.layer2.envelope);
    expect(envelopeJson).not.toContain("qwen3-vl-eval-double");
    expect(envelopeJson).not.toContain("providerNative");
  });

  test("the Layer-2 declared-envelope parser accepts every emitted envelope (the schema never moved)", () => {
    for (const run of VLM_EVAL_RUNS) {
      const registryLog = vlmRegistryLogFor(run);
      const execution = registryLog.execution as { outputs?: { envelopeJson?: string } };
      const envelopeJson = execution.outputs?.envelopeJson;
      if (typeof envelopeJson === "string") {
        expect(() => parseDeclaredEvidenceEnvelope(JSON.parse(envelopeJson))).not.toThrow();
      }
    }
  });
});

describe("HFX-201 harness: determinism + the full-corpus golden state", () => {
  test("every one of the 24 runs matches its full expectation (Layer-2 + grounded checks + revision binding)", () => {
    const outcomes = VLM_EVAL_RUNS.map((run) => evaluateVlmScenario(run));
    expect(outcomes.length).toBe(24);
    expect(outcomes.every((outcome) => outcome.expectedMatch)).toBe(true);
    expect(outcomes.every((outcome) => outcome.layer2.expectedMatch)).toBe(true);
    expect(outcomes.every((outcome) => outcome.revisionBinding.ok)).toBe(true);
  });

  test("identical runs evaluate byte-identically (the whole outcome, digests included)", () => {
    for (const scenarioId of [
      "spatial-ref-lintel@qwen3-vl-8b",
      "beam-section-conflict-silent-resolution@qwen3-vl-8b",
      "video-crack-width-hallucination@qwen3-vl-30b-a3b",
    ]) {
      const first = evaluateVlmScenario(runOf(scenarioId));
      const second = evaluateVlmScenario(runOf(scenarioId));
      expect(first.layer2.envelopeDigest).toBe(second.layer2.envelopeDigest);
      expect(first.layer2.benchmarkRecord.recordId).toBe(second.layer2.benchmarkRecord.recordId);
      expect(first.layer2.provenanceManifest.manifestId).toBe(second.layer2.provenanceManifest.manifestId);
      expect(canonicalJsonText(first.grounded.verdicts)).toBe(canonicalJsonText(second.grounded.verdicts));
    }
  });

  test("the per-variant classification counts are the committed demonstration profile", () => {
    const outcomes = VLM_EVAL_RUNS.map((run) => evaluateVlmScenario(run));
    const counts = (variant: string): Record<string, number> => {
      const mine = outcomes.filter((outcome) => outcome.variant === variant);
      const byKind: Record<string, number> = {};
      for (const outcome of mine) {
        byKind[outcome.layer2.classification] = (byKind[outcome.layer2.classification] ?? 0) + 1;
      }
      return byKind;
    };
    expect(counts("qwen3-vl-8b")).toEqual({
      none: 5,
      "perception-failure": 3,
      "retrieval-failure": 1,
      "unsupported-data": 3,
    });
    expect(counts("qwen3-vl-30b-a3b")).toEqual({
      none: 8,
      "perception-failure": 1,
      "unsupported-data": 3,
    });
  });
});
