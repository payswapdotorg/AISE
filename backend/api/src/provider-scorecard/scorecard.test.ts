/**
 * HFX-401 — the scorecard record tests: content addressing (the digest
 * re-derives; a tampered scorecard is rejected), the committed corpus
 * scorecards validate, the verdict derivation enforces the work order's
 * rule, and the negative paths (verdict forgery, tampering) are refused.
 */

import { describe, expect, test } from "bun:test";
import { buildProviderScorecard, buildScorecardCorpus } from "./index";
import { deriveVerdict, scorecardDigestOf, validateProviderScorecard } from "./scorecard";
import type { ProviderScorecard } from "./scorecard";
import { PROMOTION_SCORECARD_GATE_IDS } from "./gates";
import type { GateOutcome } from "./gates";
import { layerChecklistProjectionJson } from "./layers";

const corpus = await buildScorecardCorpus();

function scorecardOf(providerId: string, technologyVersion?: string): ProviderScorecard {
  const provider = corpus.providers.find(
    (candidate) =>
      candidate.providerId === providerId &&
      (technologyVersion === undefined ||
        candidate.technologyVersion === technologyVersion),
  );
  if (provider === undefined) {
    throw new Error(`test: provider '${providerId}' missing from the corpus`);
  }
  return buildProviderScorecard(provider, corpus);
}

const passOutcome = (gate: string): GateOutcome => ({
  gate: gate as GateOutcome["gate"],
  outcome: "pass",
  statement: "statement",
  evidence: [{ kind: "test-name", pointer: "x" }],
});

describe("HFX-401 scorecard: the committed corpus (the seven scored providers)", () => {
  test("the corpus scores the HFX-302 reference lane + the three substitute profiles + the engineered + the two fixtures", () => {
    expect(corpus.providers).toHaveLength(7);
    const ids = corpus.providers.map((provider) => provider.providerId);
    expect(ids).toContain("aise-engine-reference");
    expect(ids).toContain("geometry-substitute-fine");
    expect(ids).toContain("geometry-substitute-coarse");
    expect(ids).toContain("geometry-substitute-restricted");
    expect(ids).toContain("geometry-substitute-fine-research");
    expect(ids.filter((id) => id === "fixture-depth-provider")).toHaveLength(2);
  });

  test("every committed-corpus scorecard validates (closure, evidence, verdict, digest)", () => {
    for (const provider of corpus.providers) {
      const scorecard = buildProviderScorecard(provider, corpus);
      const validation = validateProviderScorecard(scorecard);
      expect(validation.ok).toBe(true);
    }
  });

  test("every scorecard records EXACTLY the ten gates, each with evidence pointers", () => {
    for (const provider of corpus.providers) {
      const scorecard = buildProviderScorecard(provider, corpus);
      expect(scorecard.gates).toHaveLength(10);
      expect(scorecard.gates.map((gate) => gate.gate)).toEqual([...PROMOTION_SCORECARD_GATE_IDS]);
      for (const gate of scorecard.gates) {
        expect(gate.evidence.length).toBeGreaterThan(0);
        expect(gate.statement.length).toBeGreaterThan(0);
        if (gate.outcome === "na") {
          expect(gate.naReason).toBeDefined();
        }
      }
    }
  });
});

describe("HFX-401 scorecard: the aggregate verdict (the work order's rule, in code)", () => {
  test("fine + reference: all ten gates pass → production-eligible, stage production_candidate", () => {
    for (const providerId of ["aise-engine-reference", "geometry-substitute-fine"]) {
      const scorecard = scorecardOf(providerId);
      expect(scorecard.verdict.productionEligible).toBe(true);
      expect(scorecard.verdict.failedGates).toEqual([]);
      expect(scorecard.verdict.naGates).toEqual([]);
      expect(scorecard.verdict.nonPassingGates).toEqual([]);
      expect(scorecard.controlPlaneMapping.workOrderStage).toBe("production_candidate");
    }
  });

  test("coarse: a STRONG benchmark with two mandatory-gate failures is NOT production-eligible", () => {
    const scorecard = scorecardOf("geometry-substitute-coarse");
    // the benchmark itself passed its declared expectations (every cell matched)
    expect(scorecard.benchmarkCorpus.sequenceCount).toBe(5);
    expect(scorecard.verdict.productionEligible).toBe(false);
    expect(scorecard.verdict.failedGates).toEqual([
      "semantic-equivalence",
      "dependent-layer-regression",
    ]);
    expect(scorecard.verdict.nonPassingGates).toEqual([
      "semantic-equivalence",
      "dependent-layer-regression",
    ]);
    expect(scorecard.controlPlaneMapping.workOrderStage).toBe("rejected");
  });

  test("restricted: contract-conformance FAIL + dependent-layer NA (unevaluable blocks)", () => {
    const scorecard = scorecardOf("geometry-substitute-restricted");
    expect(scorecard.verdict.productionEligible).toBe(false);
    expect(scorecard.verdict.failedGates).toEqual(["contract-conformance"]);
    expect(scorecard.verdict.naGates).toEqual(["dependent-layer-regression"]);
    expect(scorecard.verdict.nonPassingGates).toEqual([
      "contract-conformance",
      "dependent-layer-regression",
    ]);
    expect(scorecard.verdict.checklistConformant).toBe(false);
  });

  test("fine-research: exactly ONE mandatory-gate failure (the license) — the refusal-path provider", () => {
    const scorecard = scorecardOf("geometry-substitute-fine-research");
    expect(scorecard.verdict.productionEligible).toBe(false);
    expect(scorecard.verdict.failedGates).toEqual(["license-use-clearance"]);
    expect(scorecard.verdict.naGates).toEqual([]);
    const licenseGate = scorecard.gates.find((gate) => gate.gate === "license-use-clearance");
    expect(licenseGate?.outcome).toBe("fail");
    for (const gate of scorecard.gates) {
      if (gate.gate !== "license-use-clearance") {
        expect(gate.outcome).toBe("pass");
      }
    }
  });

  test("fixture v1: the committed PROMOTED history is not re-promotable under the HFX-401 gate (Layer-2 regression NA)", () => {
    const scorecard = scorecardOf("fixture-depth-provider", "1.0.0-fixture-v1");
    expect(scorecard.provider.technologyVersion).toBe("1.0.0-fixture-v1");
    expect(scorecard.verdict.naGates).toEqual(["dependent-layer-regression"]);
    expect(scorecard.verdict.productionEligible).toBe(false);
    expect(scorecard.controlPlaneMapping.controlPlaneState).toBe("promoted");
    expect(scorecard.controlPlaneMapping.workOrderStage).toBe("rejected");
    expect(scorecard.controlPlaneMapping.statement).toContain("lawful history");
  });

  test("fixture v2: license FAIL + semantic-equivalence FAIL (the documented truth breached)", () => {
    const scorecard = scorecardOf("fixture-depth-provider", "1.1.0-fixture-v2");
    expect(scorecard.provider.technologyVersion).toBe("1.1.0-fixture-v2");
    expect(scorecard.verdict.failedGates).toEqual([
      "semantic-equivalence",
      "license-use-clearance",
    ]);
    expect(scorecard.verdict.naGates).toEqual(["dependent-layer-regression"]);
    expect(scorecard.controlPlaneMapping.controlPlaneState).toBe("rejected");
  });
});

describe("HFX-401 scorecard: content addressing + tamper detection", () => {
  test("the scorecardId re-derives from the record's own content", () => {
    const scorecard = scorecardOf("geometry-substitute-fine");
    const { scorecardId, ...rest } = scorecard;
    expect(scorecardDigestOf(rest)).toBe(scorecardId);
  });

  test("a TAMPERED scorecard (a gate outcome flipped) is REJECTED — the digest does not re-derive", () => {
    const scorecard = scorecardOf("geometry-substitute-fine");
    const tampered: ProviderScorecard = {
      ...scorecard,
      gates: scorecard.gates.map((gate) =>
        gate.gate === "license-use-clearance"
          ? { ...gate, outcome: "fail" as const, statement: "tampered" }
          : gate,
      ),
    };
    const validation = validateProviderScorecard(tampered);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.some((failure) => failure.kind === "scorecard-id-mismatch"))
        .toBe(true);
    }
  });

  test("a FORGED verdict (eligible declared over failing gates) is REJECTED", () => {
    const scorecard = scorecardOf("geometry-substitute-coarse");
    const forged: ProviderScorecard = {
      ...scorecard,
      verdict: { ...scorecard.verdict, productionEligible: true },
    };
    const validation = validateProviderScorecard(forged);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.some((failure) => failure.kind === "verdict-inconsistent"))
        .toBe(true);
    }
  });

  test("a scorecard citing an unknown work-order stage is refused", () => {
    const scorecard = scorecardOf("geometry-substitute-fine");
    const bad: ProviderScorecard = {
      ...scorecard,
      controlPlaneMapping: {
        ...scorecard.controlPlaneMapping,
        workOrderStage: "best-effort" as never,
      },
    };
    const validation = validateProviderScorecard(bad);
    expect(validation.ok).toBe(false);
  });

  test("an evidence-pointer-free gate embedded in a scorecard fails the whole record", () => {
    const scorecard = scorecardOf("geometry-substitute-fine");
    const stripped: ProviderScorecard = {
      ...scorecard,
      gates: scorecard.gates.map((gate) =>
        gate.gate === "cost-quota-safety" ? { ...gate, evidence: [] } : gate,
      ),
    };
    const validation = validateProviderScorecard(stripped);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((failure) => failure.kind === "gate-outcome-invalid"),
      ).toBe(true);
    }
  });
});

describe("HFX-401 scorecard: the verdict derivation (pure, over arbitrary outcomes)", () => {
  const allPass = PROMOTION_SCORECARD_GATE_IDS.map((gate) => passOutcome(gate));

  test("all-pass → eligible (each layer with a class the checklist governs)", () => {
    expect(deriveVerdict(1, "perception", allPass).productionEligible).toBe(true);
    expect(deriveVerdict(2, "document", allPass).productionEligible).toBe(true);
    expect(deriveVerdict(3, "geometry", allPass).productionEligible).toBe(true);
    expect(deriveVerdict(3, "visual", allPass).productionEligible).toBe(true);
  });

  test("ONE failed gate → NOT eligible, named in nonPassingGates", () => {
    const outcomes = allPass.map((outcome) =>
      outcome.gate === "license-use-clearance"
        ? { ...outcome, outcome: "fail" as const }
        : outcome,
    );
    const verdict = deriveVerdict(3, "geometry", outcomes);
    expect(verdict.productionEligible).toBe(false);
    expect(verdict.failedGates).toEqual(["license-use-clearance"]);
    expect(verdict.nonPassingGates).toEqual(["license-use-clearance"]);
  });

  test("an NA on a mandatory gate → NOT eligible (checklist violation recorded)", () => {
    const outcomes = allPass.map((outcome) =>
      outcome.gate === "historical-interpretability"
        ? { ...outcome, outcome: "na" as const, naReason: "not evaluated" }
        : outcome,
    );
    const verdict = deriveVerdict(3, "geometry", outcomes);
    expect(verdict.productionEligible).toBe(false);
    expect(verdict.checklistConformant).toBe(false);
    expect(verdict.naGates).toEqual(["historical-interpretability"]);
  });

  test("the committed layer-checklist projection is deterministic", () => {
    expect(JSON.stringify(layerChecklistProjectionJson())).toBe(
      JSON.stringify(layerChecklistProjectionJson()),
    );
  });
});
