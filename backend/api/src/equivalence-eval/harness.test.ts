/**
 * HFX-301 — the equivalence HARNESS tests: the four behavior-matrix cells,
 * the canonical comparison points and the NEGATIVE CONTROLS (a benchmark
 * that cannot fail is not a benchmark).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { deriveEngineeringOperationId, operationSemanticIdentityOfIntent } from "@aise/solution-contract";
import { DIVERGENCE_KIND_BY_POINT } from "../solution-eval/model";
import { EQUIVALENCE_CORPUS } from "./corpus";
import { evaluateEquivalencePair, evaluateProvenanceOnlyControl, boqDeltaLinesOf } from "./harness";
import type { EquivalenceHarnessDoubles } from "./harness";
import {
  equivalenceHarnessDoubles,
  equivalenceOutcomeViewOf,
  expectationFlipTwin,
  runEquivalenceSuite,
  semanticMutationTwin,
} from "./testkit";

const pairOf = (pairId: string) => {
  const pair = EQUIVALENCE_CORPUS.find((entry) => entry.pairId === pairId);
  if (pair === undefined) {
    throw new Error(`the corpus pair '${pairId}' is missing`);
  }
  return pair;
};

async function evaluate(
  pairInput: unknown,
  doubles: EquivalenceHarnessDoubles = equivalenceHarnessDoubles(),
) {
  return evaluateEquivalencePair(pairInput, doubles);
}

describe("HFX-301 harness: CELL 1 — equivalent pairs prove canonical identity", () => {
  test("every equivalent pair compares EQUIVALENT on ALL FOUR canonical points", async () => {
    const doubles = equivalenceHarnessDoubles();
    for (const pair of EQUIVALENCE_CORPUS.filter((p) => p.expectation === "equivalent")) {
      const outcome = await evaluate(pair, doubles);
      expect(outcome.observed).toBe("equivalent");
      expect(outcome.expectationMet).toBe(true);
      const comparison = outcome.comparison;
      expect(comparison).not.toBeNull();
      // The four PROD-029 comparison points, in the pinned order.
      expect(comparison?.points.map((point) => point.pointKind)).toEqual([
        "operation-identity",
        "state-digest",
        "validation-verdict",
        "boq-line",
      ]);
      // Operation identity semantics: identical across both authoring paths.
      for (const point of comparison?.points ?? []) {
        expect(point.equal).toBe(true);
        expect(point.differenceKind).toBeUndefined();
      }
      expect(comparison?.differenceKinds).toEqual([]);
    }
  }, 20000);

  test("the canonical excavation command: identity semantics + digest + verdict + BOQ identical", async () => {
    const outcome = await evaluate(pairOf("eq-excavation-core"));
    const agent = outcome.paths.agentJourney;
    const direct = outcome.paths.directJourney;
    expect(agent.application.outcome).toBe("applied");
    expect(direct.application.outcome).toBe("applied");
    // The operation ids ARE the contract derivation over the same semantics.
    expect(agent.application.outcome).toBe("applied");
    expect(direct.application.outcome).toBe("applied");
    if (agent.application.outcome === "applied" && direct.application.outcome === "applied") {
      expect(agent.application.operationId).toBe(direct.application.operationId);
    }
    expect(agent.stateDigest).toBe(direct.stateDigest);
    expect(agent.validationOutcome).toBe("pass");
    expect(direct.validationOutcome).toBe("pass");
    expect(agent.boqDigest).toBe(direct.boqDigest);
    expect(agent.boqLines?.length).toBeGreaterThan(0);
  });

  test("unit canonicalization: '1500 mm/200 cm' compiles to the metre-canonical twin", async () => {
    const outcome = await evaluate(pairOf("eq-excavation-units-mixed"));
    expect(outcome.observed).toBe("equivalent");
  });

  test("the sequenced backfill journey: identical dependency edges across paths", async () => {
    const outcome = await evaluate(pairOf("eq-backfill-sequenced"));
    expect(outcome.observed).toBe("equivalent");
    expect(outcome.paths.directJourney.application.outcome).toBe("applied");
    // Both journeys carry the two-state chain (prerequisite + the pair op).
    expect(outcome.paths.directJourney.boqLines?.length).toBeGreaterThan(0);
  });

  test("the coated-operation journey resolves the baseline surface through the seam", async () => {
    const outcome = await evaluate(pairOf("eq-plaster-canonical"));
    const lines = (outcome.paths.agentJourney.boqLines ?? []) as ReturnType<
      typeof boqDeltaLinesOf
    >;
    expect(lines.length).toBe(2);
    expect(lines.find((line) => line.dimension === "area")?.value).toBe(12.5);
    expect(lines.find((line) => line.dimension === "volume")?.value).toBe(0.375);
    expect(outcome.observed).toBe("equivalent");
  });

  test("determinism: the same pair + doubles reproduce the identical outcome", async () => {
    const first = await evaluate(pairOf("eq-opening"));
    const second = await evaluate(pairOf("eq-opening"));
    expect(canonicalJsonStringify(equivalenceOutcomeViewOf(first))).toBe(
      canonicalJsonStringify(equivalenceOutcomeViewOf(second)),
    );
    expect(first.benchmarkRecordId).toBe(second.benchmarkRecordId);
    expect(first.provenanceManifestId).toBe(second.provenanceManifestId);
  });
});

describe("HFX-301 harness: CELL 2 — declared-different pairs record honest differences", () => {
  test("every declared-different pair diverges with the DECLARED closed kind", async () => {
    const doubles = equivalenceHarnessDoubles();
    for (const pair of EQUIVALENCE_CORPUS.filter((p) => p.expectation === "declared-different")) {
      const outcome = await evaluate(pair, doubles);
      expect(outcome.observed).toBe("declared-different");
      expect(outcome.expectationMet).toBe(true);
      expect(outcome.comparison?.verdict).toBe("declared-different");
      expect(outcome.comparison?.differenceKind).toBe(pair.declaredDifferenceKind);
      // The divergence is RECORDED with PROD-029's kind vocabulary — never hidden.
      for (const point of outcome.comparison?.points ?? []) {
        if (!point.equal) {
          expect(point.differenceKind).toBe(DIVERGENCE_KIND_BY_POINT[point.pointKind]);
        }
      }
      // The direct journey still applied — the engine governs both equally.
      expect(outcome.paths.directJourney.application.outcome).toBe("applied");
    }
  }, 20000);

  test("the replacement-clause difference: thickness 40 mm vs the omitted 30 mm twin", async () => {
    const outcome = await evaluate(pairOf("dd-plaster-replacement-omitted"));
    const divergent = (outcome.comparison?.points ?? []).filter((point) => !point.equal);
    expect(divergent.map((point) => point.pointKind)).toEqual([
      "operation-identity",
      "state-digest",
      "boq-line",
    ]);
    // The validation verdict stays EQUAL — the honest difference is parameter-level.
    expect(
      outcome.comparison?.points.find((point) => point.pointKind === "validation-verdict")?.equal,
    ).toBe(true);
  });

  test("the sequencing-omitted difference: the dependency edge alone diverges", async () => {
    const outcome = await evaluate(pairOf("dd-backfill-sequencing-omitted"));
    const divergent = (outcome.comparison?.points ?? []).filter((point) => !point.equal);
    expect(divergent.map((point) => point.pointKind)).toEqual([
      "operation-identity",
      "state-digest",
    ]);
    // Quantities and verdicts are IDENTICAL — the difference is the edge.
    expect(
      outcome.comparison?.points.find((point) => point.pointKind === "boq-line")?.equal,
    ).toBe(true);
  });
});

describe("HFX-301 harness: CELL 3 — agent-refused pairs evidence the taxonomy", () => {
  test("every refusal reason code of the unsafe taxonomy is exhibited", async () => {
    const doubles = equivalenceHarnessDoubles();
    const observed = new Set<string>();
    for (const pair of EQUIVALENCE_CORPUS.filter((p) => p.expectation === "agent-refused")) {
      const outcome = await evaluate(pair, doubles);
      expect(outcome.observed).toBe("agent-refused");
      expect(outcome.expectationMet).toBe(true);
      expect(outcome.paths.agentCompile.kind).toBe("unsafe-refusal");
      if (outcome.paths.agentCompile.kind === "unsafe-refusal") {
        observed.add(outcome.paths.agentCompile.reasonCode);
      }
      // NO intent on the agent path — the journey never ran.
      expect(outcome.paths.agentJourney.application.outcome).toBe("not-run");
      // The direct path still authors — the engine governs both equally.
      expect(outcome.paths.directJourney.application.outcome).toBe("applied");
      expect(outcome.paths.directJourney.validationOutcome).toBe("pass");
    }
    expect([...observed].sort()).toEqual([
      "approval-authority-claim",
      "cost-authority-claim",
      "engine-bypass",
      "raw-geometry-write",
      "readiness-authority-claim",
      "reality-authority-claim",
      "validation-authority-claim",
    ]);
  }, 20000);

  test("a refusal carries its deterministic taxonomy reason prose", async () => {
    const outcome = await evaluate(pairOf("ref-validation-authority"));
    expect(outcome.paths.agentCompile.kind).toBe("unsafe-refusal");
    if (outcome.paths.agentCompile.kind === "unsafe-refusal") {
      expect(outcome.paths.agentCompile.reason).toContain("NO operation intent produced");
    }
  });
});

describe("HFX-301 harness: CELL 4 — agent-clarification pairs evidence the questions", () => {
  test("every clarification slot kind is asked with a targeted question", async () => {
    const doubles = equivalenceHarnessDoubles();
    const slots = new Set<string>();
    for (const pair of EQUIVALENCE_CORPUS.filter((p) => p.expectation === "agent-clarification")) {
      const outcome = await evaluate(pair, doubles);
      expect(outcome.observed).toBe("agent-clarification");
      expect(outcome.expectationMet).toBe(true);
      expect(outcome.paths.agentCompile.kind).toBe("clarification-needed");
      if (outcome.paths.agentCompile.kind === "clarification-needed") {
        expect(outcome.paths.agentCompile.questions.length).toBeGreaterThan(0);
        for (const question of outcome.paths.agentCompile.questions) {
          slots.add(question.slotKind);
          expect(question.question.length).toBeGreaterThan(0);
        }
      }
      // The direct path still authors — the interactive form demanded the slot.
      expect(outcome.paths.directJourney.application.outcome).toBe("applied");
    }
    expect([...slots].sort()).toEqual([
      "constraint",
      "dimension",
      "location",
      "material",
      "sequencing",
    ]);
  }, 20000);

  test("a missing dimension is a question, never an invented value", async () => {
    const outcome = await evaluate(pairOf("clar-missing-dimension"));
    if (outcome.paths.agentCompile.kind !== "clarification-needed") {
      throw new Error("expected a clarification");
    }
    const question = outcome.paths.agentCompile.questions[0];
    expect(question?.slot).toBe("depth");
    expect(question?.question).toContain("explicit unit");
    // No intent was produced on the agent path — nothing was invented.
    expect(outcome.paths.agentJourney.application.outcome).toBe("not-run");
  });
});

describe("HFX-301 harness: the NEGATIVE CONTROLS (the benchmark can fail)", () => {
  test("MUTATION: a flipped expectation class is CAUGHT (expectationMet=false)", async () => {
    const twin = expectationFlipTwin();
    expect(twin.pairId).toBe("mutation-expectation-flip");
    const outcome = await evaluate(twin);
    // The observed verdict is 'equivalent' but the flipped declaration says
    // declared-different → the harness reports the MISMATCH.
    expect(outcome.observed).toBe("equivalent");
    expect(outcome.expectationMet).toBe(false);
  });

  test("MUTATION: a flipped refusal expectation is CAUGHT too", async () => {
    const base = pairOf("ref-approval-authority");
    const flipped = {
      ...base,
      pairId: "mutation-refusal-flip",
      expectation: "equivalent" as const,
      notes: "INTENTIONALLY-WRONG twin: a refusal pair flipped to equivalent",
    };
    const outcome = await evaluate(flipped);
    expect(outcome.observed).toBe("agent-refused");
    expect(outcome.expectationMet).toBe(false);
  });

  test("MUTATION: a semantic parameter mutation is CAUGHT with the parameter-semantics kind", async () => {
    const twin = semanticMutationTwin();
    expect(twin.pairId).toBe("mutation-semantic-parameter");
    const outcome = await evaluate(twin);
    expect(outcome.observed).toBe("declared-different");
    expect(outcome.expectationMet).toBe(false); // the pair still declares 'equivalent'
    expect(outcome.comparison?.verdict).toBe("declared-different");
    expect(outcome.comparison?.differenceKind).toBe("operation-semantic-failure");
    expect(outcome.comparison?.differenceKinds).toEqual(["operation-semantic-failure"]);
    const divergent = (outcome.comparison?.points ?? []).filter((point) => !point.equal);
    expect(divergent.map((point) => point.pointKind)).toContain("operation-identity");
  });

  test("PROVENANCE-ONLY: a difference that is ONLY provenance compares EQUIVALENT (the structural doctrine)", async () => {
    const doubles = equivalenceHarnessDoubles();
    const comparison = await evaluateProvenanceOnlyControl({
      pairInput: pairOf("eq-excavation-core"),
      doubles,
    });
    expect(comparison.verdict).toBe("equivalent");
    expect(comparison.points.every((point) => point.equal)).toBe(true);
    expect(comparison.differenceKinds).toEqual([]);
  });

  test("PROVENANCE-ONLY: the doctrine holds over a coated operation too", async () => {
    const comparison = await evaluateProvenanceOnlyControl({
      pairInput: pairOf("eq-plaster-units-coats"),
      doubles: equivalenceHarnessDoubles(),
    });
    expect(comparison.verdict).toBe("equivalent");
    expect(comparison.points.map((point) => point.pointKind)).toEqual([
      "operation-identity",
      "state-digest",
      "validation-verdict",
      "boq-line",
    ]);
  });

  test("the identity derivation agrees: both paths' applied ids equal the contract derivation", async () => {
    const outcome = await evaluate(pairOf("eq-excavation-core"));
    const expected = deriveEngineeringOperationId(
      operationSemanticIdentityOfIntent(
        (await import("./harness")).directIntentOf(
          pairOf("eq-excavation-core").direct,
          (await import("./corpus")).equivalenceSceneOf("equivalence-demo-scene/1"),
          "intent-direct-eq-excavation-core",
        ),
        { solutionId: "solution-demo-001", versionNumber: 1, operationIndex: 1 },
      ),
    );
    expect(outcome.paths.directJourney.application.outcome).toBe("applied");
    if (outcome.paths.directJourney.application.outcome === "applied") {
      expect(outcome.paths.directJourney.application.operationId).toBe(expected);
    }
  });
});

describe("HFX-301 harness: the suite + the control-plane emission", () => {
  test(
    "the full corpus suite: every expectation met, every cell covered, digests pinned",
    async () => {
      const run = await runEquivalenceSuite();
      expect(run.summary.total).toBe(EQUIVALENCE_CORPUS.length);
      expect(run.summary.expectationMatches).toBe(EQUIVALENCE_CORPUS.length);
      expect(run.summary.byExpectation).toEqual(run.summary.byObserved);
      expect(run.summary.expectationCoverage).toEqual([
        "agent-clarification",
        "agent-refused",
        "declared-different",
        "equivalent",
      ]);
      expect(run.summary.refusalTaxonomyCoverage.length).toBe(7);
      expect(run.summary.clarificationSlotCoverage).toEqual([
        "constraint",
        "dimension",
        "location",
        "material",
        "sequencing",
      ]);
      expect(run.summary.provenanceOnlyControlVerdict).toBe("equivalent");
      expect(run.summary.provenanceManifestDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(run.summary.benchmarkRecordDigest).toMatch(/^[0-9a-f]{64}$/);
      // Every outcome carries content-addressed control-plane artifacts.
      for (const outcome of run.outcomes) {
        expect(outcome.benchmarkRecordId).toMatch(/^[0-9a-f]{64}$/);
        expect(outcome.provenanceManifestId).toMatch(/^[0-9a-f]{64}$/);
      }
    },
    60000,
  );

  test("the suite is deterministic (two runs produce identical summaries)", async () => {
    const first = await runEquivalenceSuite();
    const second = await runEquivalenceSuite();
    expect(canonicalJsonStringify(first.summary)).toBe(canonicalJsonStringify(second.summary));
  }, 60000);
});
