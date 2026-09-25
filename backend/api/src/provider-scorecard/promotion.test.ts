/**
 * HFX-401 — the promotion decision engine tests: the APPROVAL path (all
 * gates pass → approved + the control-plane event payload), the REFUSAL
 * path (a strong benchmark + mandatory-gate failures → refused, naming
 * EVERY failed gate), the no-override guarantee and the forged-record
 * detection (a promotion that skips the engine).
 */

import { describe, expect, test } from "bun:test";
import {
  buildProviderScorecard,
  buildScorecardCorpus,
  evaluatePromotion,
  runPromotionDrill,
  verifyProviderPromotionRecord,
} from "./index";
import type { ProviderScorecard } from "./index";
import { PROMOTION_SCORECARD_GATE_IDS } from "./gates";
import type { GateOutcome } from "./gates";

const corpus = await buildScorecardCorpus();

function drill(providerId: string, technologyVersion?: string): {
  scorecard: ProviderScorecard;
  record: ReturnType<typeof runPromotionDrill>;
} {
  const provider = corpus.providers.find(
    (candidate) =>
      candidate.providerId === providerId &&
      (technologyVersion === undefined ||
        candidate.technologyVersion === technologyVersion),
  );
  if (provider === undefined) {
    throw new Error(`test: provider '${providerId}' missing`);
  }
  const scorecard = buildProviderScorecard(provider, corpus);
  return { scorecard, record: runPromotionDrill(provider, corpus, scorecard) };
}

describe("HFX-401 promotion: the engine (pure decision derivation)", () => {
  const passOutcome = (gate: string): GateOutcome => ({
    gate: gate as GateOutcome["gate"],
    outcome: "pass",
    statement: "statement",
    evidence: [{ kind: "test-name", pointer: "x" }],
  });
  const allPassScorecard = (providerId: string): ProviderScorecard => {
    const base = drill("geometry-substitute-fine").scorecard;
    return {
      ...base,
      provider: { ...base.provider, providerId },
      gates: PROMOTION_SCORECARD_GATE_IDS.map((gate) => passOutcome(gate)),
    };
  };

  test("an all-pass scorecard → APPROVED with the control-plane event payload", () => {
    const decision = evaluatePromotion(allPassScorecard("provider-x"));
    expect(decision.outcome).toBe("approved");
    if (decision.outcome === "approved") {
      expect(decision.controlPlaneEvent.kind).toBe("promotion-decided");
      expect(decision.controlPlaneEvent.decision).toBe("promoted");
      expect(decision.controlPlaneEvent.providerId).toBe("provider-x");
      expect(decision.controlPlaneEvent.refusals).toEqual([]);
    }
  });

  test("a strong-benchmark scorecard with ONE mandatory-gate failure → REFUSED (no override)", () => {
    const base = drill("geometry-substitute-fine-research").scorecard;
    const decision = evaluatePromotion(base);
    expect(decision.outcome).toBe("refused");
    if (decision.outcome === "refused") {
      expect(decision.refusals).toHaveLength(1);
      expect(decision.refusals[0]?.gate).toBe("license-use-clearance");
      expect(decision.refusals[0]?.kind).toBe("mandatory-gate-failed");
    }
  });

  test("the refusal names EVERY failed gate — never just the first", () => {
    const base = drill("geometry-substitute-coarse").scorecard;
    const decision = evaluatePromotion(base);
    expect(decision.outcome).toBe("refused");
    if (decision.outcome === "refused") {
      const namedGates = decision.refusals.map((refusal) => refusal.gate);
      expect(namedGates).toContain("semantic-equivalence");
      expect(namedGates).toContain("dependent-layer-regression");
      expect(namedGates).toHaveLength(base.verdict.nonPassingGates.length);
    }
  });

  test("an NA on a mandatory gate is named as not-evaluable (unevaluated is not passed)", () => {
    const base = drill("geometry-substitute-restricted").scorecard;
    const decision = evaluatePromotion(base);
    expect(decision.outcome).toBe("refused");
    if (decision.outcome === "refused") {
      const naRefusal = decision.refusals.find(
        (refusal) => refusal.gate === "dependent-layer-regression",
      );
      expect(naRefusal?.kind).toBe("mandatory-gate-not-evaluable");
    }
  });
});

describe("HFX-401 promotion: the APPROVAL drill (path a)", () => {
  test("fine: the full lawful lifecycle → the control plane PROMOTES; the event payload is recorded", () => {
    const { scorecard, record } = drill("geometry-substitute-fine");
    expect(record.path).toBe("approval");
    expect(record.decision).toBe("approved");
    expect(record.engineDecision.outcome).toBe("approved");
    expect(record.controlPlaneTrace.source).toBe("drill-registry");
    expect(record.controlPlaneTrace.entryStateBefore).toBe("benchmarked");
    expect(record.controlPlaneTrace.entryStateAfter).toBe("promoted");
    expect(record.controlPlaneTrace.appliedDecisionEvent?.kind).toBe("promotion-decided");
    expect(record.controlPlaneTrace.counterfactual).toBeNull();
    // the layer-regression citations ride the record (the Layer-3 requirement)
    expect(record.layerRegression.citations.map((c) => c.citationKind)).toEqual([
      "geometry-eval",
      "equivalence-eval",
    ]);
    for (const citation of record.layerRegression.citations) {
      expect(citation.corpusDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(citation.benchmarkRecordDigest).toMatch(/^[0-9a-f]{64}$/);
    }
    // the record verifies against its scorecard
    expect(verifyProviderPromotionRecord(record, scorecard).ok).toBe(true);
  });

  test("reference: the incumbent re-affirmed through the identical machinery", () => {
    const { record } = drill("aise-engine-reference");
    expect(record.decision).toBe("approved");
    expect(record.controlPlaneTrace.entryStateAfter).toBe("promoted");
  });
});

describe("HFX-401 promotion: the REFUSAL drill (path b)", () => {
  test("fine-research: the control plane REFUSES TOO (the real license-blocked rejection event)", () => {
    const { scorecard, record } = drill("geometry-substitute-fine-research");
    expect(record.path).toBe("refusal");
    expect(record.decision).toBe("refused");
    expect(record.controlPlaneTrace.entryStateAfter).toBe("rejected");
    const event = record.controlPlaneTrace.appliedDecisionEvent;
    expect(event?.kind).toBe("promotion-decided");
    if (event?.kind === "promotion-decided") {
      expect(event.decision).toBe("rejected");
      expect(event.refusals.some((refusal) => refusal.kind === "license-blocked")).toBe(true);
    }
    expect(verifyProviderPromotionRecord(record, scorecard).ok).toBe(true);
  });

  test("coarse: the engine refuses and documents the COUNTERFACTUAL (the control plane alone would ADMIT)", () => {
    const { scorecard, record } = drill("geometry-substitute-coarse");
    expect(record.decision).toBe("refused");
    // no promotion event exists — the provider never reaches a promotion request
    expect(record.controlPlaneTrace.appliedDecisionEvent).toBeNull();
    expect(record.controlPlaneTrace.entryStateAfter).toBe("benchmarked");
    // the counterfactual: the control plane's own three gates ADMIT — the HFX-401 gate is the enforcement
    expect(record.controlPlaneTrace.counterfactual?.admitted).toBe(true);
    expect(record.controlPlaneTrace.counterfactual?.checks).toHaveLength(3);
    for (const check of record.controlPlaneTrace.counterfactual?.checks ?? []) {
      expect(check.passed).toBe(true);
    }
    // the engine refusal names EVERY failed gate
    if (record.engineDecision.outcome === "refused") {
      expect(record.engineDecision.refusals.map((refusal) => refusal.gate)).toEqual([
        "semantic-equivalence",
        "dependent-layer-regression",
      ]);
    }
    expect(verifyProviderPromotionRecord(record, scorecard).ok).toBe(true);
  });

  test("restricted: the same enforcement (counterfactual admitted, engine refused)", () => {
    const { record } = drill("geometry-substitute-restricted");
    expect(record.decision).toBe("refused");
    expect(record.controlPlaneTrace.appliedDecisionEvent).toBeNull();
    expect(record.controlPlaneTrace.counterfactual?.admitted).toBe(true);
  });

  test("fixture v1/v2: the committed HFX-000 history is cited verbatim (the exit-gate decisions)", () => {
    const v1 = drill("fixture-depth-provider", "1.0.0-fixture-v1");
    expect(v1.record.controlPlaneTrace.source).toBe("committed-history");
    expect(v1.record.controlPlaneTrace.entryStateAfter).toBe("promoted");
    expect(v1.record.controlPlaneTrace.appliedDecisionEvent?.kind).toBe("promotion-decided");
    // the HFX-401 engine still refuses re-promotion (the Layer-2 regression NA)
    expect(v1.record.decision).toBe("refused");

    const v2 = drill("fixture-depth-provider", "1.1.0-fixture-v2");
    expect(v2.record.controlPlaneTrace.entryStateAfter).toBe("rejected");
    expect(v2.record.decision).toBe("refused");
  });
});

describe("HFX-401 promotion: the forged-record detection (no override path)", () => {
  test("a FORGED approved record over a non-eligible scorecard is DETECTED", () => {
    const { scorecard, record } = drill("geometry-substitute-coarse");
    // the forgery: flip the refused record into an approved one, bypassing the engine
    const forged = {
      ...record,
      path: "approval" as const,
      decision: "approved" as const,
    };
    const verification = verifyProviderPromotionRecord(forged, scorecard);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.failures.some((failure) => failure.kind === "forged-decision"))
        .toBe(true);
    }
  });

  test("a forged record over a MISMATCHED scorecard (swapped citation) is detected", () => {
    const coarse = drill("geometry-substitute-coarse");
    const fine = drill("geometry-substitute-fine");
    const verification = verifyProviderPromotionRecord(coarse.record, fine.scorecard);
    expect(verification.ok).toBe(false);
  });

  test("a tampered record body fails the content-address check", () => {
    const { scorecard, record } = drill("geometry-substitute-fine");
    const tampered = {
      ...record,
      gateAssessment: {
        ...record.gateAssessment,
        failedGates: ["license-use-clearance"],
      },
    };
    const verification = verifyProviderPromotionRecord(tampered, scorecard);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(
        verification.failures.some(
          (failure) =>
            failure.kind === "record-id-mismatch" || failure.kind === "gate-assessment-mismatch",
        ),
      ).toBe(true);
    }
  });

  test("the honest records all verify", () => {
    for (const provider of corpus.providers) {
      const scorecard = buildProviderScorecard(provider, corpus);
      const record = runPromotionDrill(provider, corpus, scorecard);
      expect(verifyProviderPromotionRecord(record, scorecard).ok).toBe(true);
    }
  });
});

describe("HFX-401 promotion: the drills are deterministic", () => {
  test("re-running the drill reproduces byte-identical records", () => {
    for (const provider of corpus.providers) {
      const scorecard = buildProviderScorecard(provider, corpus);
      const first = runPromotionDrill(provider, corpus, scorecard);
      const second = runPromotionDrill(provider, corpus, scorecard);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    }
  });
});
