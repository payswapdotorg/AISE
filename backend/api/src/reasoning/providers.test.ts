/**
 * AISE-029 — provider-surface tests: the deterministic question resolution,
 * the provider-neutral selection helpers, and the TWO interchangeable
 * deterministic providers (reference + conservative second).
 *
 * INTERCHANGEABILITY IS THE HEADLINE (work order §029: "provider
 * interchangeability"; R16 acceptance: "no provider-specific semantics become
 * canonical"): the same query through both providers yields claims under the
 * SAME frozen contract — same citation vocabulary, same epistemic statuses,
 * same uncertainty discipline, same refusal codes — while the CONTENT
 * honestly differs (the conservative provider refuses what it considers
 * too thin to forward). The structural-equivalence sweep at the bottom
 * re-verifies the contract over every question family for BOTH providers.
 */

import { describe, expect, test } from "bun:test";
import { resolveQuestion } from "./providers/question";
import type { QuestionFamily } from "./providers/question";
import { chooseProvider, eligibleProviders, isDescriptorWellFormed } from "./providers/select";
import { createDeterministicReferenceProvider } from "./providers/deterministic-reference";
import { DETERMINISTIC_REFERENCE_PROVIDER_ID } from "./providers/deterministic-reference";
import { createStubSecondProvider } from "./providers/stub-second";
import {
  STUB_SECOND_MIN_SUPPORTING_OBSERVATIONS,
  STUB_SECOND_PROVIDER_ID,
} from "./providers/stub-second";
import { maxSigma } from "./providers/internal";
import {
  CLAIM_EPISTEMIC_STATUSES,
  CITATION_KINDS,
  REFUSAL_CODES,
  UNCERTAINTY_KINDS,
  claimIdFor,
} from "./model";
import type { ProviderCompletion, ReasoningProvider } from "./model";
import type { ReasoningPolicy } from "./policy";
import {
  CASE_QUESTION,
  EV_EAST_MANUAL,
  EV_NORTH_DEPTH,
  FINDINGS_QUESTION,
  HEIGHT_QUESTION,
  WIDTH_QUESTION,
  deepFreeze,
  defaultPolicy,
  groundedStoreyContext,
  makeQuery,
  scriptedProvider,
} from "./testkit";

/* ------------------------------------------------------------------ */
/* Deterministic question resolution                                     */
/* ------------------------------------------------------------------ */

describe("providers: deterministic question resolution", () => {
  const context = groundedStoreyContext();

  test("a property question resolves family, named nodes and named property keys", () => {
    const resolution = resolveQuestion(context, WIDTH_QUESTION);
    expect(resolution.family).toBe<QuestionFamily>("property");
    expect(resolution.nodes.map((n) => n.nodeId)).toEqual(["node-wall-north"]);
    expect(resolution.cases).toEqual([]);
    expect(resolution.propertyKeys).toEqual(["width"]);
  });

  test("a findings question routes to the findings family", () => {
    const resolution = resolveQuestion(context, FINDINGS_QUESTION);
    expect(resolution.family).toBe<QuestionFamily>("findings");
    expect(resolution.nodes.map((n) => n.nodeId)).toEqual(["node-wall-east"]);
  });

  test("case/observation/observed keywords route to the case family", () => {
    for (const question of [
      "What was observed in case case-crack-1?",
      "Summarize the observations.",
      "Tell me about this case.",
    ]) {
      expect(resolveQuestion(context, question).family).toBe<QuestionFamily>("case");
    }
    expect(resolveQuestion(context, CASE_QUESTION).cases.map((c) => c.caseId)).toEqual([
      "case-crack-1",
    ]);
  });

  test("nodes resolve by nodeId as well as by label (word-boundary)", () => {
    const resolution = resolveQuestion(context, "Tell me about node-wall-east.");
    expect(resolution.nodes.map((n) => n.nodeId)).toEqual(["node-wall-east"]);
    expect(resolution.propertyKeys).toEqual([]);
  });

  test("multiple named nodes come back id-sorted; property keys unique+sorted", () => {
    const resolution = resolveQuestion(
      context,
      "Compare the width of Wall East and Wall North.",
    );
    expect(resolution.nodes.map((n) => n.nodeId)).toEqual(["node-wall-east", "node-wall-north"]);
    expect(resolution.propertyKeys).toEqual(["width"]);
    const both = resolveQuestion(context, "What is the width and the area?");
    expect(both.propertyKeys).toEqual(["area", "width"]);
  });

  test("case-family with NO case named and exactly ONE case resolves that case", () => {
    const resolution = resolveQuestion(context, "What observations exist?");
    expect(resolution.cases.map((c) => c.caseId)).toEqual(["case-crack-1"]);
  });

  test("case-family with SEVERAL unnamed cases resolves NONE (honest ambiguity)", () => {
    const observation = {
      observationId: "obs-x",
      statement: "s",
      epistemicStatus: "OBSERVED" as const,
      recordedAt: "2026-01-01T00:00:00Z",
      evidenceIds: [EV_NORTH_DEPTH],
    };
    const twoCases = {
      ...context,
      cases: [
        { caseId: "case-alpha", observations: [observation], hypotheses: [] },
        { caseId: "case-beta", observations: [observation], hypotheses: [] },
      ],
    };
    const unnamed = resolveQuestion(twoCases, "What observations exist?");
    expect(unnamed.cases).toEqual([]);
    // …but naming one of them resolves exactly that one.
    expect(resolveQuestion(twoCases, "What was observed in case case-beta?").cases.map((c) => c.caseId)).toEqual([
      "case-beta",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Provider-neutral selection                                            */
/* ------------------------------------------------------------------ */

describe("providers: provider-neutral selection", () => {
  const reference = scriptedProvider("ref", "deterministic-reference", []);
  const conservative = scriptedProvider("con", "deterministic-conservative", []);

  test("eligibleProviders keeps DECLARED order and filters by allowedProviderKinds", () => {
    expect(
      eligibleProviders([reference, conservative]).map((p) => p.descriptor.providerId),
    ).toEqual(["ref", "con"]);
    expect(
      eligibleProviders([reference, conservative], {
        ...defaultPolicy(),
        allowedProviderKinds: ["deterministic-conservative"],
      }).map((p) => p.descriptor.providerId),
    ).toEqual(["con"]);
    expect(
      eligibleProviders([reference, conservative], {
        ...defaultPolicy(),
        allowedProviderKinds: ["llm-adapter"],
      }),
    ).toEqual([]);
  });

  test("chooseProvider is the first eligible or null — no ranking semantics", () => {
    expect(chooseProvider([reference, conservative])?.descriptor.providerId).toBe("ref");
    expect(
      chooseProvider([reference, conservative], {
        ...defaultPolicy(),
        allowedProviderKinds: ["deterministic-conservative"],
      })?.descriptor.providerId,
    ).toBe("con");
    expect(
      chooseProvider([reference], {
        ...defaultPolicy(),
        allowedProviderKinds: ["llm-adapter"],
      }),
    ).toBeNull();
  });

  test("isDescriptorWellFormed discriminates descriptor shapes", () => {
    expect(isDescriptorWellFormed(reference)).toBe(true);
    expect(
      isDescriptorWellFormed({
        descriptor: { providerId: "", providerKind: "deterministic-reference" },
        complete: async () => ({ kind: "completed", claims: [], refusals: [] }),
      } as unknown as ReasoningProvider),
    ).toBe(false);
    expect(
      isDescriptorWellFormed({
        descriptor: { providerId: "x", providerKind: "psychic" },
        complete: async () => ({ kind: "completed", claims: [], refusals: [] }),
      } as unknown as ReasoningProvider),
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The deterministic REFERENCE provider                                  */
/* ------------------------------------------------------------------ */

describe("providers: the deterministic reference provider", () => {
  const provider = createDeterministicReferenceProvider();

  test("honest identity: rule-based descriptor, NOT an LLM", () => {
    expect(provider.descriptor).toEqual({
      providerId: DETERMINISTIC_REFERENCE_PROVIDER_ID,
      providerKind: "deterministic-reference",
    });
  });

  test("a measured property becomes ONE fully-cited claim with propagated σ", async () => {
    const completion = await provider.complete(makeQuery({ question: WIDTH_QUESTION }));
    expect(completion.kind).toBe("completed");
    if (completion.kind !== "completed") {
      expect.unreachable();
      return;
    }
    expect(completion.refusals).toEqual([]);
    expect(completion.claims.length).toBe(1);
    const claim = completion.claims[0]!;
    expect(claim).toEqual({
      claimId: claimIdFor({
        text: "Node 'Wall North' asserts property 'width' = 4.2 m.",
        citations: [
          { kind: "graph_node", nodeId: "node-wall-north" },
          { kind: "evidence", contentId: EV_NORTH_DEPTH },
        ],
        epistemicStatus: "INFERRED",
        uncertainty: { kind: "MEASURED_SIGMA", sigma: 0.01, unit: "m" },
      }),
      text: "Node 'Wall North' asserts property 'width' = 4.2 m.",
      citations: [
        { kind: "graph_node", nodeId: "node-wall-north" },
        { kind: "evidence", contentId: EV_NORTH_DEPTH },
      ],
      epistemicStatus: "INFERRED",
      uncertainty: { kind: "MEASURED_SIGMA", sigma: 0.01, unit: "m" },
    });
  });

  test("invalidated-only evidence refuses INSUFFICIENT_EVIDENCE (no fabricated answer)", async () => {
    const completion = await provider.complete(makeQuery({ question: HEIGHT_QUESTION }));
    expect(completion.kind).toBe("completed");
    if (completion.kind !== "completed") {
      expect.unreachable();
      return;
    }
    expect(completion.claims).toEqual([]);
    expect(completion.refusals).toEqual([
      {
        code: "INSUFFICIENT_EVIDENCE",
        detail:
          "no valid evidence record supports property 'height' of node 'Wall East' in the supplied context",
      },
    ]);
  });

  test("refuseOnUnverifiable=false permits a model-grounded claim with UNKNOWN σ", async () => {
    const policy: ReasoningPolicy = { ...defaultPolicy(), refuseOnUnverifiable: false };
    const completion = await provider.complete(
      makeQuery({ question: HEIGHT_QUESTION, policy }),
    );
    expect(completion.kind).toBe("completed");
    if (completion.kind !== "completed") {
      expect.unreachable();
      return;
    }
    expect(completion.refusals).toEqual([]);
    expect(completion.claims).toEqual([
      {
        claimId: claimIdFor({
          text: "Node 'Wall East' asserts property 'height' = 2.7 m.",
          citations: [{ kind: "graph_node", nodeId: "node-wall-east" }],
          epistemicStatus: "INFERRED",
          uncertainty: { kind: "UNKNOWN" },
        }),
        text: "Node 'Wall East' asserts property 'height' = 2.7 m.",
        citations: [{ kind: "graph_node", nodeId: "node-wall-east" }],
        epistemicStatus: "INFERRED",
        uncertainty: { kind: "UNKNOWN" },
      },
    ]);
  });

  test("a STRING property claim never carries a σ (unknown, not fabricated precision)", async () => {
    // The node's linked evidence measures 4.2 m ± 0.01 m, but the claim is
    // about the string property 'label' — nothing to measure ⇒ UNKNOWN.
    const policy: ReasoningPolicy = { ...defaultPolicy(), refuseOnUnverifiable: false };
    const completion = await provider.complete(
      makeQuery({ question: "What is the label of Wall North?", policy }),
    );
    expect(completion.kind).toBe("completed");
    if (completion.kind !== "completed") {
      expect.unreachable();
      return;
    }
    expect(completion.claims.length).toBe(1);
    expect(completion.claims[0]?.text).toBe(
      "Node 'Wall North' asserts property 'label' = \"Wall North\".",
    );
    expect(completion.claims[0]?.uncertainty).toEqual({ kind: "UNKNOWN" });
  });

  test("maxClaims is NOT enforced here (the gateway is the single authority)", async () => {
    const policy: ReasoningPolicy = { ...defaultPolicy(), maxClaims: 1 };
    const completion = await provider.complete(makeQuery({ question: FINDINGS_QUESTION, policy }));
    expect(completion.kind).toBe("completed");
    if (completion.kind !== "completed") {
      expect.unreachable();
      return;
    }
    expect(completion.claims.length).toBe(2);
  });

  test("byte-identical completions on re-invocation; deep-frozen inputs survive", async () => {
    const frozen = deepFreeze(makeQuery({ question: WIDTH_QUESTION }));
    const first = await provider.complete(frozen);
    const second = await provider.complete(makeQuery({ question: WIDTH_QUESTION }));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(Object.isFrozen(frozen.context)).toBe(true);
    expect(frozen.context.graphSnapshot.nodes.length).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/* The SECOND (conservative) provider — interchangeability in action     */
/* ------------------------------------------------------------------ */

describe("providers: the conservative second provider", () => {
  const provider = createStubSecondProvider();

  test("honest identity: conservative rule-based descriptor, NOT an LLM", () => {
    expect(provider.descriptor).toEqual({
      providerId: STUB_SECOND_PROVIDER_ID,
      providerKind: "deterministic-conservative",
    });
    expect(STUB_SECOND_MIN_SUPPORTING_OBSERVATIONS).toBe(2);
  });

  test("the SAME query yields the SAME grounding tuple and σ as the reference provider", async () => {
    const query = makeQuery({ question: WIDTH_QUESTION });
    const reference = await createDeterministicReferenceProvider().complete(query);
    const conservative = await provider.complete(query);
    expect(reference.kind).toBe("completed");
    expect(conservative.kind).toBe("completed");
    if (reference.kind !== "completed" || conservative.kind !== "completed") {
      expect.unreachable();
      return;
    }
    expect(conservative.claims.length).toBe(1);
    // Identical structured grounding: same citations, status and σ…
    expect(conservative.claims[0]?.citations).toEqual(reference.claims[0]?.citations);
    expect(conservative.claims[0]?.epistemicStatus).toBe(reference.claims[0]?.epistemicStatus);
    expect(conservative.claims[0]?.uncertainty).toEqual(reference.claims[0]?.uncertainty);
    expect(conservative.refusals).toEqual(reference.refusals);
    // …with honestly different content (and therefore a different claim id).
    expect(conservative.claims[0]?.text).toBe(
      "Conservative restatement — node 'Wall North' asserts property 'width' = 4.2 m.",
    );
    expect(conservative.claims[0]?.claimId).not.toBe(reference.claims[0]?.claimId);
  });

  test("unmeasured properties are refused even when the policy would allow them", async () => {
    const policy: ReasoningPolicy = { ...defaultPolicy(), refuseOnUnverifiable: false };
    const completion = await provider.complete(
      makeQuery({ question: "What is the label of Wall North?", policy }),
    );
    expect(completion.kind).toBe("completed");
    if (completion.kind !== "completed") {
      expect.unreachable();
      return;
    }
    expect(completion.claims).toEqual([]);
    expect(completion.refusals).toEqual([
      {
        code: "INSUFFICIENT_EVIDENCE",
        detail:
          "conservative threshold: property 'label' of node 'Wall North' carries no measured 1σ in the supplied context",
      },
    ]);
  });

  test("only ERROR-severity findings are claimed; warnings are refused", async () => {
    const completion = await provider.complete(makeQuery({ question: FINDINGS_QUESTION }));
    expect(completion.kind).toBe("completed");
    if (completion.kind !== "completed") {
      expect.unreachable();
      return;
    }
    expect(completion.claims.length).toBe(1);
    expect(completion.claims[0]?.text).toBe(
      "Conservative restatement — node 'Wall East' carries error finding " +
        "INVALIDATED_EVIDENCE_LINKED: property 'height' of node 'node-wall-east' cites " +
        "invalidated evidence 'ev-wall-east-manual'",
    );
    expect(completion.claims[0]?.uncertainty).toEqual({ kind: "UNKNOWN" });
    expect(completion.refusals).toEqual([
      {
        code: "INSUFFICIENT_EVIDENCE",
        detail:
          "conservative threshold: warning-severity finding UNCERTAIN_NUMERIC_WITHOUT_SIGMA on node 'Wall East' is not claimed",
      },
    ]);
  });

  test("single-observation hypotheses are too thin: refused (reference would claim them)", async () => {
    const conservative = await provider.complete(makeQuery({ question: CASE_QUESTION }));
    const reference = await createDeterministicReferenceProvider().complete(
      makeQuery({ question: CASE_QUESTION }),
    );
    expect(conservative.kind).toBe("completed");
    expect(reference.kind).toBe("completed");
    if (conservative.kind !== "completed" || reference.kind !== "completed") {
      expect.unreachable();
      return;
    }
    // The observation claim survives in both (same contract)…
    expect(conservative.claims.map((c) => c.text)).toEqual([
      "Conservative restatement — case 'case-crack-1' records the observation: " +
        "\"Hairline cracking observed on the Wall North plaster face.\"",
    ]);
    expect(conservative.claims[0]?.citations).toEqual([
      { kind: "case_observation", caseId: "case-crack-1", observationId: "obs-crack-1" },
      { kind: "evidence", contentId: EV_NORTH_DEPTH },
    ]);
    expect(conservative.claims[0]?.uncertainty).toEqual({
      kind: "MEASURED_SIGMA",
      sigma: 0.01,
      unit: "m",
    });
    // …the hypothesis is refused by the conservative threshold only.
    expect(conservative.refusals).toEqual([
      {
        code: "INSUFFICIENT_EVIDENCE",
        detail:
          "conservative threshold: hypothesis 'hyp-settle-1' of case 'case-crack-1' has 1 supporting observation; at least 2 required",
      },
    ]);
    expect(reference.claims.length).toBe(2);
    expect(reference.refusals).toEqual([]);
  });

  test("observations citing invalid evidence are refused REGARDLESS of policy", async () => {
    const badCase = {
      caseId: "case-bad-evidence",
      observations: [
        {
          observationId: "obs-bad",
          statement: "Something was measured once.",
          epistemicStatus: "OBSERVED" as const,
          recordedAt: "2026-01-01T00:00:00Z",
          evidenceIds: [EV_EAST_MANUAL],
        },
      ],
      hypotheses: [],
    };
    const context = { ...groundedStoreyContext(), cases: [badCase] };
    const question = "What was observed in case case-bad-evidence?";
    for (const refuseOnUnverifiable of [true, false]) {
      const policy: ReasoningPolicy = { ...defaultPolicy(), refuseOnUnverifiable };
      const completion = await provider.complete(makeQuery({ question, context, policy }));
      expect(completion.kind).toBe("completed");
      if (completion.kind !== "completed") {
        expect.unreachable();
        return;
      }
      expect(completion.claims).toEqual([]);
      expect(completion.refusals).toEqual([
        {
          code: "INSUFFICIENT_EVIDENCE",
          detail:
            "conservative threshold: observation 'obs-bad' of case 'case-bad-evidence' cites " +
            "evidence with no valid record in the supplied context: ev-wall-east-manual",
        },
      ]);
    }
    // The reference provider honors the policy flag instead (caller's call).
    const permissive = await createDeterministicReferenceProvider().complete(
      makeQuery({
        question,
        context,
        policy: { ...defaultPolicy(), refuseOnUnverifiable: false },
      }),
    );
    expect(permissive.kind).toBe("completed");
    if (permissive.kind !== "completed") {
      expect.unreachable();
      return;
    }
    expect(permissive.claims.length).toBe(1);
    expect(permissive.claims[0]?.citations).toEqual([
      { kind: "case_observation", caseId: "case-bad-evidence", observationId: "obs-bad" },
    ]);
    expect(permissive.claims[0]?.uncertainty).toEqual({ kind: "UNKNOWN" });
  });
});

/* ------------------------------------------------------------------ */
/* σ propagation primitive                                               */
/* ------------------------------------------------------------------ */

describe("providers: the maxSigma propagation primitive", () => {
  test("no sources ⇒ honestly UNKNOWN", () => {
    expect(maxSigma([])).toEqual({ kind: "UNKNOWN" });
  });

  test("one source propagates VERBATIM; many propagate the MAXIMUM", () => {
    expect(maxSigma([{ sigma: 0.01, unit: "m" }])).toEqual({
      kind: "MEASURED_SIGMA",
      sigma: 0.01,
      unit: "m",
    });
    expect(
      maxSigma([
        { sigma: 0.01, unit: "m" },
        { sigma: 0.05, unit: "m" },
        { sigma: 0.02, unit: "m" },
      ]),
    ).toEqual({ kind: "MEASURED_SIGMA", sigma: 0.05, unit: "m" });
    expect(
      maxSigma([
        { sigma: 0.3, unit: "m" },
        { sigma: 0.3, unit: "m" },
      ]),
    ).toEqual({ kind: "MEASURED_SIGMA", sigma: 0.3, unit: "m" });
  });
});

/* ------------------------------------------------------------------ */
/* Structural interchangeability sweep (the contract over everything)    */
/* ------------------------------------------------------------------ */

describe("providers: structural interchangeability sweep", () => {
  const providers: readonly ReasoningProvider[] = [
    createDeterministicReferenceProvider(),
    createStubSecondProvider(),
  ];
  const questions = [WIDTH_QUESTION, HEIGHT_QUESTION, FINDINGS_QUESTION, CASE_QUESTION];

  test("EVERY claim of EITHER provider satisfies the provider-neutral contract", async () => {
    for (const provider of providers) {
      for (const question of questions) {
        const completion: ProviderCompletion = await provider.complete(
          makeQuery({ question }),
        );
        expect(completion.kind).toBe("completed");
        if (completion.kind !== "completed") {
          continue;
        }
        for (const claim of completion.claims) {
          expect(claim.claimId).toMatch(/^claim-[0-9a-f]{16}$/);
          expect(claim.text.length).toBeGreaterThan(0);
          expect(claim.citations.length).toBeGreaterThanOrEqual(1);
          for (const citation of claim.citations) {
            expect((CITATION_KINDS as readonly string[])).toContain(citation.kind);
          }
          expect((CLAIM_EPISTEMIC_STATUSES as readonly string[])).toContain(
            claim.epistemicStatus,
          );
          expect((UNCERTAINTY_KINDS as readonly string[])).toContain(claim.uncertainty.kind);
          if (claim.uncertainty.kind === "MEASURED_SIGMA") {
            expect(claim.uncertainty.sigma).toBeGreaterThan(0);
            expect(Number.isFinite(claim.uncertainty.sigma)).toBe(true);
            expect(claim.uncertainty.unit.length).toBeGreaterThan(0);
          }
        }
        for (const refusal of completion.refusals) {
          expect((REFUSAL_CODES as readonly string[])).toContain(refusal.code);
          expect(refusal.detail.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("no library provider masquerades as an LLM (honest kinds only)", () => {
    for (const provider of providers) {
      expect(provider.descriptor.providerKind).not.toBe("llm-adapter");
      expect(
        ["deterministic-reference", "deterministic-conservative"],
      ).toContain(provider.descriptor.providerKind);
      expect(provider.descriptor.providerId.length).toBeGreaterThan(0);
    }
  });
});
