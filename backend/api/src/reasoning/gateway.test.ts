/**
 * AISE-029 — gateway tests: the orchestrating seam end to end.
 *
 * THE MANDATED COVERAGE (work order §029 acceptance):
 *  - CLAIM CITATION VERIFICATION: claims whose citations do not resolve
 *    VERBATIM inside the supplied context, or that cite INVALIDATED evidence,
 *    are REJECTED with typed CONTRACT_VIOLATION refusals (providers are
 *    untrusted input sources — exactly like wire input).
 *  - UNCERTAINTY AWARENESS: σ is propagated VERBATIM from cited sources (the
 *    maximum of them) into reasoning outputs; a (σ, unit) pair that exists at
 *    NO CITED source is a FABRICATION and is rejected; PROPOSED sources make
 *    PROPOSED claims (epistemic status propagates, never becomes OBSERVED).
 *  - REFUSAL ON INSUFFICIENT EVIDENCE: the canonical fixture's invalidated
 *    evidence yields a typed INSUFFICIENT_EVIDENCE refusal and ZERO claims —
 *    never a fabricated answer; the policy gate short-circuits dispatch.
 *  - PROVIDER INTERCHANGEABILITY: the same query through the deterministic
 *    reference provider and the conservative second provider yields
 *    EQUIVALENT STRUCTURED outputs (same citations, same σ, same status,
 *    same refusal vocabulary) with honestly different content quality.
 *  - DETERMINISM: same query + same injected clock ⇒ BYTE-IDENTICAL results;
 *    the clock is injected (sequence tests); deep-frozen inputs survive.
 *
 * Plus the full typed-error matrix (construction wiring + query shape), the
 * deterministic failover chain (transient → next provider, permanent →
 * immediate refusal, exhaustion → refusal naming every attempted id) and the
 * post-validation policy thresholds (requiredCitationsPerClaim, maxClaims).
 */

import { describe, expect, test } from "bun:test";
import type { Logger } from "../lib/log";
import { createReasoningGateway } from "./gateway";
import type { ReasoningGateway } from "./gateway";
import type {
  GroundedContext,
  GroundedNode,
  ProviderCompletion,
  ReasoningClaim,
  ReasoningErrorCode,
  ReasoningProvider,
  ReasoningQuery,
  ReasoningResult,
  Refusal,
} from "./model";
import type { RetrievalAdapter } from "./retrieval";
import { ReasoningGatewayError, claimIdFor } from "./model";
import { createDeterministicReferenceProvider } from "./providers/deterministic-reference";
import { DETERMINISTIC_REFERENCE_PROVIDER_ID } from "./providers/deterministic-reference";
import { createStubSecondProvider } from "./providers/stub-second";
import { STUB_SECOND_PROVIDER_ID } from "./providers/stub-second";
import type { ReasoningPolicy } from "./policy";
import {
  AREA_ON_WALL_QUESTION,
  CASE_QUESTION,
  EV_EAST_MANUAL,
  EV_NORTH_DEPTH,
  FINDINGS_QUESTION,
  FIXTURE_INSTANT,
  HEIGHT_QUESTION,
  MATERIAL_QUESTION,
  UNGROUNDED_QUESTION,
  WIDTH_QUESTION,
  constClock,
  defaultPolicy,
  deepFreeze,
  gnode,
  gprop,
  groundedStoreyContext,
  makeQuery,
  scriptedProvider,
  sequenceClock,
} from "./testkit";

/* ------------------------------------------------------------------ */
/* Local fixture contexts (the σ-propagation scenarios)                  */
/* ------------------------------------------------------------------ */

/**
 * A node whose property declares σ 0.01 while its (valid) supporting
 * evidence measurement declares σ 0.03 — the claim must propagate the
 * MAXIMUM (0.03), never a synthesis.
 */
function maxSigmaContext(): GroundedContext {
  const nodes: readonly GroundedNode[] = [
    gnode("node-wall-max", "element", "OBSERVED", [
      gprop("label", "Wall Max"),
      gprop("width", 5.5, { unit: "m", sigma: 0.01, evidenceId: "ev-max-a" }),
    ]),
  ];
  return {
    graphSnapshot: { nodes, relationships: [] },
    evidenceRecords: [
      {
        contentId: "ev-max-a",
        method: "DEPTH_SENSING",
        capturedAt: FIXTURE_INSTANT,
        invalidated: false,
        linkedNodeIds: ["node-wall-max"],
        measurement: { value: 5.5, unit: "m", sigma: 0.03 },
      },
    ],
    verificationFindings: [],
    cases: [],
  };
}

/** One property supported by TWO valid evidence records (σ 0.02 and σ 0.05). */
function multiEvidenceContext(): GroundedContext {
  const nodes: readonly GroundedNode[] = [
    gnode("node-wall-multi", "element", "OBSERVED", [
      gprop("label", "Wall Multi"),
      {
        key: "depth",
        value: 3.3,
        unit: "m",
        epistemicStatus: "OBSERVED",
        provenance: [
          { role: "SUPPORTS", evidenceId: "ev-multi-a", recordedAt: FIXTURE_INSTANT },
          { role: "SUPPORTS", evidenceId: "ev-multi-b", recordedAt: FIXTURE_INSTANT },
        ],
      },
    ]),
  ];
  const evidence = (id: string, sigma: number) => ({
    contentId: id,
    method: "MANUAL_MEASUREMENT" as const,
    capturedAt: FIXTURE_INSTANT,
    invalidated: false,
    linkedNodeIds: ["node-wall-multi"],
    measurement: { value: 3.3, unit: "m", sigma },
  });
  return {
    graphSnapshot: { nodes, relationships: [] },
    evidenceRecords: [evidence("ev-multi-a", 0.02), evidence("ev-multi-b", 0.05)],
    verificationFindings: [],
    cases: [],
  };
}

/** A PROPOSED property (with valid evidence) — epistemic propagation case. */
function proposedPropertyContext(): GroundedContext {
  const nodes: readonly GroundedNode[] = [
    gnode("node-wall-future", "element", "PROPOSED", [
      gprop("label", "Wall Future"),
      gprop("width", 4.0, {
        unit: "m",
        sigma: 0.02,
        epistemicStatus: "PROPOSED",
        evidenceId: "ev-future",
      }),
    ]),
  ];
  return {
    graphSnapshot: { nodes, relationships: [] },
    evidenceRecords: [
      {
        contentId: "ev-future",
        method: "STILL_IMAGERY",
        capturedAt: FIXTURE_INSTANT,
        invalidated: false,
        linkedNodeIds: ["node-wall-future"],
        measurement: { value: 4.0, unit: "m", sigma: 0.02 },
      },
    ],
    verificationFindings: [],
    cases: [],
  };
}

/* A well-formed claim over the canonical fixture (node + valid evidence). */
function validWidthClaim(claimId: string, text = "Wall North width is 4.2 m."): ReasoningClaim {
  return {
    claimId,
    text,
    citations: [
      { kind: "graph_node", nodeId: "node-wall-north" },
      { kind: "evidence", contentId: EV_NORTH_DEPTH },
    ],
    epistemicStatus: "INFERRED",
    uncertainty: { kind: "MEASURED_SIGMA", sigma: 0.01, unit: "m" },
  };
}

/** Script a completed provider result with UNTRUSTED (loosely typed) entries. */
function completed(
  claims: readonly unknown[],
  refusals: readonly unknown[] = [],
): ProviderCompletion {
  return {
    kind: "completed",
    claims: claims as unknown as ReasoningClaim[],
    refusals: refusals as unknown as Refusal[],
  };
}

async function expectTypedError(
  run: () => Promise<unknown>,
  code: ReasoningErrorCode,
): Promise<void> {
  try {
    await run();
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(ReasoningGatewayError);
    expect((error as ReasoningGatewayError).code).toBe(code);
  }
}

/** A gateway over scripted providers with a frozen clock, by convention. */
function gatewayOver(providers: readonly ReasoningProvider[]): ReasoningGateway {
  return createReasoningGateway({ providers, clock: constClock() });
}

/* ------------------------------------------------------------------ */
/* Construction wiring errors (typed — wiring is not a reasoning outcome) */
/* ------------------------------------------------------------------ */

describe("reasoning gateway: construction wiring", () => {
  test("zero providers is a typed no_providers error", () => {
    expect(() => createReasoningGateway({ providers: [], clock: constClock() })).toThrow(
      ReasoningGatewayError,
    );
    try {
      createReasoningGateway({ providers: [], clock: constClock() });
    } catch (error) {
      expect((error as ReasoningGatewayError).code).toBe("no_providers");
    }
  });

  test("duplicate provider ids are a typed duplicate_provider_id error", () => {
    const a = scriptedProvider("dup", "deterministic-reference", [completed([])]);
    const b = scriptedProvider("dup", "deterministic-conservative", [completed([])]);
    expect(() => createReasoningGateway({ providers: [a, b], clock: constClock() })).toThrow(
      ReasoningGatewayError,
    );
    try {
      createReasoningGateway({ providers: [a, b], clock: constClock() });
    } catch (error) {
      expect((error as ReasoningGatewayError).code).toBe("duplicate_provider_id");
      expect((error as ReasoningGatewayError).detail).toContain("dup");
    }
  });

  test("malformed descriptors are typed invalid_provider_descriptor errors", () => {
    const emptyId = {
      descriptor: { providerId: "", providerKind: "deterministic-reference" },
      complete: async () => completed([]),
    };
    expect(() =>
      createReasoningGateway({ providers: [emptyId as unknown as ReasoningProvider], clock: constClock() }),
    ).toThrow(ReasoningGatewayError);

    const badKind = {
      descriptor: { providerId: "p1", providerKind: "psychic" },
      complete: async () => completed([]),
    };
    try {
      createReasoningGateway({
        providers: [badKind as unknown as ReasoningProvider],
        clock: constClock(),
      });
      expect.unreachable();
    } catch (error) {
      expect((error as ReasoningGatewayError).code).toBe("invalid_provider_descriptor");
      expect((error as ReasoningGatewayError).detail).toContain("psychic");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Query shape validation (typed caller-bug errors, first field throws)  */
/* ------------------------------------------------------------------ */

describe("reasoning gateway: query shape validation", () => {
  const provider = scriptedProvider("p1", "deterministic-reference", [completed([])]);
  const gateway = gatewayOver([provider]);

  test("empty queryId and whitespace-only question are typed invalid_query", async () => {
    await expectTypedError(
      () => gateway.reason(makeQuery({ question: "x", queryId: "" })),
      "invalid_query",
    );
    await expectTypedError(
      () => gateway.reason(makeQuery({ question: "   " })),
      "invalid_query",
    );
  });

  test("malformed contexts are typed invalid_context (three shapes)", async () => {
    const base = groundedStoreyContext();
    await expectTypedError(
      () =>
        gateway.reason(
          makeQuery({ question: "q", context: { ...base, graphSnapshot: null as never } }),
        ),
      "invalid_context",
    );
    await expectTypedError(
      () =>
        gateway.reason(
          makeQuery({
            question: "q",
            context: {
              ...base,
              cases: [{ caseId: "c", observations: [] }] as never,
            },
          }),
        ),
      "invalid_context",
    );
    await expectTypedError(
      () =>
        gateway.reason(makeQuery({ question: "q", context: { ...base, rules: "nope" as never } })),
      "invalid_context",
    );
  });

  test("a malformed policy is a typed invalid_policy naming every issue", async () => {
    try {
      await gateway.reason(
        makeQuery({
          question: "q",
          policy: {
            requiredCitationsPerClaim: 0,
            refuseOnUnverifiable: "yes",
            maxClaims: 1.5,
          } as unknown as ReasoningPolicy,
        }),
      );
      expect.unreachable();
    } catch (error) {
      expect((error as ReasoningGatewayError).code).toBe("invalid_policy");
      expect((error as ReasoningGatewayError).detail).toContain("requiredCitationsPerClaim");
      expect((error as ReasoningGatewayError).detail).toContain("refuseOnUnverifiable");
      expect((error as ReasoningGatewayError).detail).toContain("maxClaims");
    }
  });

  test("nothing is dispatched when the query shape is invalid", async () => {
    expect(provider.calls.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* The policy gate and provider-kind selection short-circuit dispatch    */
/* ------------------------------------------------------------------ */

describe("reasoning gateway: policy gate short-circuit", () => {
  test("a forbidden topic refuses BEFORE any provider is dispatched", async () => {
    const provider = scriptedProvider("p1", "deterministic-reference", [completed([])]);
    const gateway = gatewayOver([provider]);
    const result = await gateway.reason(
      makeQuery({
        question: "What is the melting point of the Eiffel Tower?",
        policy: { ...defaultPolicy(), forbiddenTopics: ["melting point"] },
      }),
    );
    expect(result.claims).toEqual([]);
    expect(result.refusals).toEqual([
      { code: "POLICY_VIOLATION", detail: "question addresses forbidden topic 'melting point'" },
    ]);
    expect(result.providerDescriptor).toBeNull();
    expect(result.completedAt).toBe(FIXTURE_INSTANT);
    expect(provider.calls.length).toBe(0);
  });

  test("allowedProviderKinds excluding every provider refuses without dispatch", async () => {
    const provider = scriptedProvider("p1", "deterministic-reference", [completed([])]);
    const gateway = gatewayOver([provider]);
    const result = await gateway.reason(
      makeQuery({
        question: WIDTH_QUESTION,
        policy: { ...defaultPolicy(), allowedProviderKinds: ["llm-adapter"] },
      }),
    );
    expect(result.claims).toEqual([]);
    expect(result.refusals.length).toBe(1);
    expect(result.refusals[0]?.code).toBe("POLICY_VIOLATION");
    expect(result.refusals[0]?.detail).toContain("llm-adapter");
    expect(result.refusals[0]?.detail).toContain("p1");
    expect(result.providerDescriptor).toBeNull();
    expect(provider.calls.length).toBe(0);
  });

  test("allowedProviderKinds selects the first ELIGIBLE provider in declared order", async () => {
    const claims = [validWidthClaim("claim-a")];
    const reference = scriptedProvider("ref", "deterministic-reference", [completed(claims)]);
    const conservative = scriptedProvider("con", "deterministic-conservative", [completed(claims)]);
    const gateway = gatewayOver([reference, conservative]);
    const result = await gateway.reason(
      makeQuery({
        question: WIDTH_QUESTION,
        policy: { ...defaultPolicy(), allowedProviderKinds: ["deterministic-conservative"] },
      }),
    );
    expect(result.providerDescriptor?.providerId).toBe("con");
    expect(reference.calls.length).toBe(0);
    expect(conservative.calls.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* The happy paths (deterministic reference provider through the gate)  */
/* ------------------------------------------------------------------ */

describe("reasoning gateway: grounded answers through the reference provider", () => {
  function referenceGateway(): ReasoningGateway {
    return createReasoningGateway({
      providers: [createDeterministicReferenceProvider()],
      clock: constClock(),
    });
  }

  test("a measured property yields ONE claim citing node + evidence with propagated σ", async () => {
    const result = await referenceGateway().reason(makeQuery({ question: WIDTH_QUESTION }));
    expect(result.claims.length).toBe(1);
    const claim = result.claims[0]!;
    expect(claim.text).toBe("Node 'Wall North' asserts property 'width' = 4.2 m.");
    expect(claim.citations).toEqual([
      { kind: "graph_node", nodeId: "node-wall-north" },
      { kind: "evidence", contentId: EV_NORTH_DEPTH },
    ]);
    expect(claim.epistemicStatus).toBe("INFERRED");
    expect(claim.uncertainty).toEqual({ kind: "MEASURED_SIGMA", sigma: 0.01, unit: "m" });
    expect(claim.claimId).toMatch(/^claim-[0-9a-f]{16}$/);
    expect(claim.claimId).toBe(
      claimIdFor({
        text: claim.text,
        citations: claim.citations,
        epistemicStatus: "INFERRED",
        uncertainty: { kind: "MEASURED_SIGMA", sigma: 0.01, unit: "m" },
      }),
    );
    expect(result.refusals).toEqual([]);
    expect(result.providerDescriptor).toEqual({
      providerId: DETERMINISTIC_REFERENCE_PROVIDER_ID,
      providerKind: "deterministic-reference",
    });
    expect(result.completedAt).toBe(FIXTURE_INSTANT);
  });

  test("findings claims cite finding + node with UNKNOWN uncertainty (no σ to propagate)", async () => {
    const result = await referenceGateway().reason(makeQuery({ question: FINDINGS_QUESTION }));
    expect(result.claims.length).toBe(2);
    expect(result.claims.map((c) => c.text)).toEqual([
      "Node 'Wall East' carries error finding INVALIDATED_EVIDENCE_LINKED: " +
        "property 'height' of node 'node-wall-east' cites invalidated evidence 'ev-wall-east-manual'",
      "Node 'Wall East' carries warning finding UNCERTAIN_NUMERIC_WITHOUT_SIGMA: " +
        "numeric property 'height' of node 'node-wall-east' (OBSERVED) declares no 1σ",
    ]);
    for (const claim of result.claims) {
      expect(claim.epistemicStatus).toBe("INFERRED");
      expect(claim.uncertainty).toEqual({ kind: "UNKNOWN" });
    }
    expect(result.claims[0]?.citations).toEqual([
      { kind: "finding", findingCode: "INVALIDATED_EVIDENCE_LINKED", subjectNodeId: "node-wall-east" },
      { kind: "graph_node", nodeId: "node-wall-east" },
    ]);
    expect(result.refusals).toEqual([]);
  });

  test("case claims separate OBSERVED facts (cited to evidence) from PROPOSED hypotheses", async () => {
    const result = await referenceGateway().reason(makeQuery({ question: CASE_QUESTION }));
    expect(result.claims.length).toBe(2);
    const observationClaim = result.claims.find((c) =>
      c.text.startsWith("Case 'case-crack-1' records the observation"),
    );
    const hypothesisClaim = result.claims.find((c) =>
      c.text.startsWith("Case 'case-crack-1' records the PROPOSED hypothesis"),
    );
    expect(observationClaim).toBeDefined();
    expect(hypothesisClaim).toBeDefined();
    expect(observationClaim?.citations).toEqual([
      { kind: "case_observation", caseId: "case-crack-1", observationId: "obs-crack-1" },
      { kind: "evidence", contentId: EV_NORTH_DEPTH },
    ]);
    expect(observationClaim?.epistemicStatus).toBe("INFERRED");
    expect(observationClaim?.uncertainty).toEqual({ kind: "MEASURED_SIGMA", sigma: 0.01, unit: "m" });
    // A hypothesis restatement stays PROPOSED with UNKNOWN uncertainty — the
    // advisory confidence NEVER becomes measurement uncertainty.
    expect(hypothesisClaim?.epistemicStatus).toBe("PROPOSED");
    expect(hypothesisClaim?.uncertainty).toEqual({ kind: "UNKNOWN" });
    expect(hypothesisClaim?.citations).toEqual([
      { kind: "case_observation", caseId: "case-crack-1", observationId: "obs-crack-1" },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* REFUSAL ON INSUFFICIENT EVIDENCE (never a fabricated answer)          */
/* ------------------------------------------------------------------ */

describe("reasoning gateway: refusal on insufficient evidence", () => {
  function referenceGateway(): ReasoningGateway {
    return createReasoningGateway({
      providers: [createDeterministicReferenceProvider()],
      clock: constClock(),
    });
  }

  test("a property backed ONLY by invalidated evidence refuses and claims NOTHING", async () => {
    const result = await referenceGateway().reason(makeQuery({ question: HEIGHT_QUESTION }));
    expect(result.claims).toEqual([]);
    expect(result.refusals.length).toBe(1);
    expect(result.refusals[0]?.code).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.refusals[0]?.detail).toBe(
      "no valid evidence record supports property 'height' of node 'Wall East' in the supplied context",
    );
  });

  test("a question naming no modeled property refuses with the modeled keys", async () => {
    const result = await referenceGateway().reason(makeQuery({ question: MATERIAL_QUESTION }));
    expect(result.claims).toEqual([]);
    expect(result.refusals[0]?.code).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.refusals[0]?.detail).toContain("modeled keys: label, width");
  });

  test("a property that exists on OTHER nodes but not the named node refuses", async () => {
    const result = await referenceGateway().reason(makeQuery({ question: AREA_ON_WALL_QUESTION }));
    expect(result.claims).toEqual([]);
    expect(result.refusals[0]?.code).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.refusals[0]?.detail).toContain(
      "node 'Wall North' does not carry property 'area'",
    );
  });

  test("a question naming nothing in the context is UNGROUNDED (distinct code)", async () => {
    const result = await referenceGateway().reason(makeQuery({ question: UNGROUNDED_QUESTION }));
    expect(result.claims).toEqual([]);
    expect(result.refusals).toEqual([
      {
        code: "UNGROUNDED_QUESTION",
        detail:
          "no node of the supplied context is named in the question (matched by node id or label)",
      },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* UNCERTAINTY AWARENESS (verbatim propagation, max-of-sources)          */
/* ------------------------------------------------------------------ */

describe("reasoning gateway: uncertainty propagation", () => {
  function referenceGateway(): ReasoningGateway {
    return createReasoningGateway({
      providers: [createDeterministicReferenceProvider()],
      clock: constClock(),
    });
  }

  test("σ is the MAXIMUM of the cited sources (property 0.01 vs evidence 0.03 ⇒ 0.03)", async () => {
    const result = await referenceGateway().reason(
      makeQuery({ question: "What is the width of Wall Max?", context: maxSigmaContext() }),
    );
    expect(result.claims.length).toBe(1);
    expect(result.claims[0]?.uncertainty).toEqual({ kind: "MEASURED_SIGMA", sigma: 0.03, unit: "m" });
    expect(result.claims[0]?.text).toBe("Node 'Wall Max' asserts property 'width' = 5.5 m.");
  });

  test("multi-evidence σ: the maximum across BOTH cited evidence records (0.05)", async () => {
    const result = await referenceGateway().reason(
      makeQuery({ question: "What is the depth of Wall Multi?", context: multiEvidenceContext() }),
    );
    expect(result.claims.length).toBe(1);
    expect(result.claims[0]?.uncertainty).toEqual({ kind: "MEASURED_SIGMA", sigma: 0.05, unit: "m" });
    expect(result.claims[0]?.citations).toEqual([
      { kind: "graph_node", nodeId: "node-wall-multi" },
      { kind: "evidence", contentId: "ev-multi-a" },
      { kind: "evidence", contentId: "ev-multi-b" },
    ]);
  });

  test("a PROPOSED source propagates PROPOSED onto the claim (never OBSERVED)", async () => {
    const result = await referenceGateway().reason(
      makeQuery({
        question: "What is the width of Wall Future?",
        context: proposedPropertyContext(),
      }),
    );
    expect(result.claims.length).toBe(1);
    expect(result.claims[0]?.epistemicStatus).toBe("PROPOSED");
    expect(result.claims[0]?.uncertainty).toEqual({ kind: "MEASURED_SIGMA", sigma: 0.02, unit: "m" });
  });
});

/* ------------------------------------------------------------------ */
/* PROVIDER INTERCHANGEABILITY (same contract, different quality)        */
/* ------------------------------------------------------------------ */

describe("reasoning gateway: provider interchangeability", () => {
  const clock = constClock();

  test("the SAME query through both providers yields EQUIVALENT STRUCTURED outputs", async () => {
    const query = makeQuery({ question: WIDTH_QUESTION });
    const viaReference = await createReasoningGateway({
      providers: [createDeterministicReferenceProvider()],
      clock,
    }).reason(query);
    const viaConservative = await createReasoningGateway({
      providers: [createStubSecondProvider()],
      clock,
    }).reason(query);

    expect(viaReference.claims.length).toBe(1);
    expect(viaConservative.claims.length).toBe(1);
    // Same grounding tuple, same epistemic discipline, same propagated σ…
    expect(viaReference.claims[0]?.citations).toEqual(viaConservative.claims[0]?.citations);
    expect(viaReference.claims[0]?.epistemicStatus).toBe(viaConservative.claims[0]?.epistemicStatus);
    expect(viaReference.claims[0]?.uncertainty).toEqual(viaConservative.claims[0]?.uncertainty);
    expect(viaReference.refusals).toEqual(viaConservative.refusals);
    // …while the CONTENT honestly differs (different provider, different text).
    expect(viaReference.claims[0]?.text).not.toBe(viaConservative.claims[0]?.text);
    expect(viaConservative.claims[0]?.text).toContain("Conservative restatement");
    expect(viaReference.providerDescriptor?.providerId).toBe(DETERMINISTIC_REFERENCE_PROVIDER_ID);
    expect(viaConservative.providerDescriptor?.providerId).toBe(STUB_SECOND_PROVIDER_ID);
    expect(viaReference.completedAt).toBe(viaConservative.completedAt);
  });

  test("both providers refuse the SAME CODE on unanswerable grounding (vocabulary parity)", async () => {
    const query = makeQuery({ question: HEIGHT_QUESTION });
    const viaReference = await createReasoningGateway({
      providers: [createDeterministicReferenceProvider()],
      clock,
    }).reason(query);
    const viaConservative = await createReasoningGateway({
      providers: [createStubSecondProvider()],
      clock,
    }).reason(query);
    expect(viaReference.claims).toEqual([]);
    expect(viaConservative.claims).toEqual([]);
    expect(viaReference.refusals[0]?.code).toBe("INSUFFICIENT_EVIDENCE");
    expect(viaConservative.refusals[0]?.code).toBe("INSUFFICIENT_EVIDENCE");
    // Same frozen vocabulary; the detail honestly names the provider policy.
    expect(viaConservative.refusals[0]?.detail).toContain("conservative threshold");
    expect(viaReference.refusals[0]?.detail).not.toContain("conservative threshold");
  });

  test("either provider slots into the same gateway (failover + primary both work)", async () => {
    const claims = [validWidthClaim("claim-a")];
    const gateway = createReasoningGateway({
      providers: [
        scriptedProvider("failing", "deterministic-reference", [
          { kind: "failure", failure: { failureKind: "TRANSIENT", detail: "busy" } },
        ]),
        scriptedProvider("second", "deterministic-conservative", [completed(claims)]),
      ],
      clock,
    });
    const result = await gateway.reason(makeQuery({ question: WIDTH_QUESTION }));
    expect(result.claims.length).toBe(1);
    expect(result.providerDescriptor?.providerId).toBe("second");
  });
});

/* ------------------------------------------------------------------ */
/* Post-validation of UNTRUSTED provider output (the contract gate)      */
/* ------------------------------------------------------------------ */

describe("reasoning gateway: contract post-validation (untrusted claims)", () => {
  async function reasonWith(
    claims: readonly unknown[],
    refusals: readonly unknown[] = [],
    policy: ReasoningPolicy = defaultPolicy(),
  ): Promise<ReasoningResult> {
    const provider = scriptedProvider("p1", "deterministic-reference", [
      completed(claims, refusals),
    ]);
    const gateway = createReasoningGateway({ providers: [provider], clock: constClock() });
    return gateway.reason(makeQuery({ question: WIDTH_QUESTION, policy }));
  }

  test("an UNCITED claim is rejected with CONTRACT_VIOLATION (never passes through)", async () => {
    const result = await reasonWith([{ claimId: "claim-bad-1", text: "t", epistemicStatus: "INFERRED", uncertainty: { kind: "UNKNOWN" } }]);
    expect(result.claims).toEqual([]);
    expect(result.refusals).toEqual([
      {
        code: "CONTRACT_VIOLATION",
        detail: "claim 'claim-bad-1' carries no citations (every claim must cite the supplied context)",
      },
    ]);
  });

  test("a claim citing something ABSENT from the context is rejected", async () => {
    const result = await reasonWith([
      {
        claimId: "claim-bad-2",
        text: "t",
        citations: [{ kind: "graph_node", nodeId: "node-ghost" }],
        epistemicStatus: "INFERRED",
        uncertainty: { kind: "UNKNOWN" },
      },
    ]);
    expect(result.claims).toEqual([]);
    expect(result.refusals[0]?.code).toBe("CONTRACT_VIOLATION");
    expect(result.refusals[0]?.detail).toContain("graph node 'node-ghost'");
    expect(result.refusals[0]?.detail).toContain("absent from the supplied context");
  });

  test("a claim citing INVALIDATED evidence is rejected (invalidated ≠ usable)", async () => {
    const result = await reasonWith([
      {
        claimId: "claim-bad-3",
        text: "t",
        citations: [{ kind: "evidence", contentId: EV_EAST_MANUAL }],
        epistemicStatus: "INFERRED",
        uncertainty: { kind: "UNKNOWN" },
      },
    ]);
    expect(result.claims).toEqual([]);
    expect(result.refusals[0]?.code).toBe("CONTRACT_VIOLATION");
    expect(result.refusals[0]?.detail).toContain("ev-wall-east-manual");
    expect(result.refusals[0]?.detail).toContain("invalidated");
  });

  test("a claim claiming OBSERVED truth is rejected (reasoning is INFERRED/PROPOSED only)", async () => {
    const result = await reasonWith([
      {
        claimId: "claim-bad-4",
        text: "t",
        citations: [{ kind: "graph_node", nodeId: "node-wall-north" }],
        epistemicStatus: "OBSERVED",
        uncertainty: { kind: "UNKNOWN" },
      },
    ]);
    expect(result.claims).toEqual([]);
    expect(result.refusals[0]?.code).toBe("CONTRACT_VIOLATION");
    expect(result.refusals[0]?.detail).toContain("forbidden epistemic status 'OBSERVED'");
  });

  test("a FABRICATED σ is rejected (exists at no cited source)", async () => {
    const result = await reasonWith([
      {
        claimId: "claim-bad-5",
        text: "t",
        citations: [{ kind: "graph_node", nodeId: "node-wall-north" }],
        epistemicStatus: "INFERRED",
        uncertainty: { kind: "MEASURED_SIGMA", sigma: 0.99, unit: "m" },
      },
    ]);
    expect(result.claims).toEqual([]);
    expect(result.refusals[0]?.code).toBe("CONTRACT_VIOLATION");
    expect(result.refusals[0]?.detail).toContain("fabricated uncertainty");
    expect(result.refusals[0]?.detail).toContain("0.99 m");
  });

  test("σ that exists in the context but at a NON-CITED source is still fabricated", async () => {
    // 0.01 m exists at node-wall-north — but this claim cites node-storey-1
    // (label-only), so the pair exists at NO CITED source: rejected.
    const result = await reasonWith([
      {
        claimId: "claim-bad-6",
        text: "t",
        citations: [{ kind: "graph_node", nodeId: "node-storey-1" }],
        epistemicStatus: "INFERRED",
        uncertainty: { kind: "MEASURED_SIGMA", sigma: 0.01, unit: "m" },
      },
    ]);
    expect(result.claims).toEqual([]);
    expect(result.refusals[0]?.code).toBe("CONTRACT_VIOLATION");
    expect(result.refusals[0]?.detail).toContain("fabricated uncertainty");
  });

  test("malformed claim shapes are rejected (no id, no text, no uncertainty, bad σ)", async () => {
    const cases: readonly unknown[] = [
      { text: "t", citations: [{ kind: "graph_node", nodeId: "node-wall-north" }], epistemicStatus: "INFERRED", uncertainty: { kind: "UNKNOWN" } },
      { claimId: "c", citations: [{ kind: "graph_node", nodeId: "node-wall-north" }], epistemicStatus: "INFERRED", uncertainty: { kind: "UNKNOWN" } },
      { claimId: "c", text: "t", citations: [{ kind: "graph_node", nodeId: "node-wall-north" }], epistemicStatus: "INFERRED" },
      {
        claimId: "c", text: "t", citations: [{ kind: "graph_node", nodeId: "node-wall-north" }],
        epistemicStatus: "INFERRED", uncertainty: { kind: "MEASURED_SIGMA", sigma: 0, unit: "m" },
      },
      {
        claimId: "c", text: "t", citations: [{ kind: "graph_node", nodeId: "node-wall-north" }],
        epistemicStatus: "INFERRED", uncertainty: { kind: "MEASURED_SIGMA", sigma: 0.01, unit: "" },
      },
      "not-an-object",
    ];
    for (const bad of cases) {
      const result = await reasonWith([bad]);
      expect(result.claims).toEqual([]);
      expect(result.refusals.length).toBe(1);
      expect(result.refusals[0]?.code).toBe("CONTRACT_VIOLATION");
    }
  });

  test("duplicate claim ids: the FIRST survives, the reuse is rejected", async () => {
    const result = await reasonWith([
      validWidthClaim("claim-dup"),
      validWidthClaim("claim-dup", "Wall North width is 4.2 m (again)."),
    ]);
    expect(result.claims.length).toBe(1);
    expect(result.claims[0]?.claimId).toBe("claim-dup");
    expect(result.refusals).toEqual([
      { code: "CONTRACT_VIOLATION", detail: "claim 'claim-dup' reuses an id already emitted" },
    ]);
  });

  test("a MIXED completion keeps the valid claim and reports the invalid one", async () => {
    const result = await reasonWith([
      validWidthClaim("claim-good-1"),
      {
        claimId: "claim-bad-7",
        text: "t",
        citations: [{ kind: "evidence", contentId: "ev-none" }],
        epistemicStatus: "INFERRED",
        uncertainty: { kind: "UNKNOWN" },
      },
    ]);
    expect(result.claims.map((c) => c.claimId)).toEqual(["claim-good-1"]);
    expect(result.refusals.length).toBe(1);
    expect(result.refusals[0]?.code).toBe("CONTRACT_VIOLATION");
    expect(result.refusals[0]?.detail).toContain("claim-bad-7");
  });

  test("malformed provider REFUSALS are dropped and reported as CONTRACT_VIOLATION", async () => {
    const result = await reasonWith([], [
      { code: "MADE_UP_CODE", detail: "x" },
      { code: "INSUFFICIENT_EVIDENCE", detail: "" },
      { code: "INSUFFICIENT_EVIDENCE", detail: "legit" },
    ]);
    expect(result.claims).toEqual([]);
    expect(result.refusals).toEqual([
      { code: "CONTRACT_VIOLATION", detail: "provider emitted a malformed refusal entry (dropped)" },
      { code: "INSUFFICIENT_EVIDENCE", detail: "legit" },
    ]);
  });

  test("valid refusals pass through VERBATIM, sorted by code then detail, deduplicated", async () => {
    const result = await reasonWith([], [
      { code: "INSUFFICIENT_EVIDENCE", detail: "zz" },
      { code: "INSUFFICIENT_EVIDENCE", detail: "aa" },
      { code: "INSUFFICIENT_EVIDENCE", detail: "aa" },
      { code: "CONTRACT_VIOLATION", detail: "anything" },
    ]);
    expect(result.refusals).toEqual([
      { code: "CONTRACT_VIOLATION", detail: "anything" },
      { code: "INSUFFICIENT_EVIDENCE", detail: "aa" },
      { code: "INSUFFICIENT_EVIDENCE", detail: "zz" },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Claim-level policy thresholds (requiredCitationsPerClaim, maxClaims)  */
/* ------------------------------------------------------------------ */

describe("reasoning gateway: claim-level policy thresholds", () => {
  test("requiredCitationsPerClaim=2 rejects single-citation claims with POLICY_VIOLATION", async () => {
    const provider = scriptedProvider("p1", "deterministic-reference", [
      completed([
        {
          claimId: "claim-one-cite",
          text: "A single-cite claim.",
          citations: [{ kind: "graph_node", nodeId: "node-wall-north" }],
          epistemicStatus: "INFERRED",
          uncertainty: { kind: "MEASURED_SIGMA", sigma: 0.01, unit: "m" },
        } as unknown as ReasoningClaim,
      ]),
    ]);
    const gateway = createReasoningGateway({ providers: [provider], clock: constClock() });
    const result = await gateway.reason(
      makeQuery({
        question: WIDTH_QUESTION,
        policy: { ...defaultPolicy(), requiredCitationsPerClaim: 2 },
      }),
    );
    expect(result.claims).toEqual([]);
    expect(result.refusals).toEqual([
      {
        code: "POLICY_VIOLATION",
        detail: "claim 'claim-one-cite' carries 1 distinct citation; policy requires at least 2",
      },
    ]);
  });

  test("requiredCitationsPerClaim=2 accepts two DISTINCT citations but not duplicates", async () => {
    const provider = scriptedProvider("p1", "deterministic-reference", [
      completed([
        validWidthClaim("claim-two-cites"),
        {
          claimId: "claim-dup-cites",
          text: "Duplicated citation claim.",
          citations: [
            { kind: "graph_node", nodeId: "node-wall-north" },
            { kind: "graph_node", nodeId: "node-wall-north" },
          ],
          epistemicStatus: "INFERRED",
          uncertainty: { kind: "UNKNOWN" },
        } as unknown as ReasoningClaim,
      ]),
    ]);
    const gateway = createReasoningGateway({ providers: [provider], clock: constClock() });
    const result = await gateway.reason(
      makeQuery({
        question: WIDTH_QUESTION,
        policy: { ...defaultPolicy(), requiredCitationsPerClaim: 2 },
      }),
    );
    expect(result.claims.map((c) => c.claimId)).toEqual(["claim-two-cites"]);
    expect(result.refusals[0]?.code).toBe("POLICY_VIOLATION");
    expect(result.refusals[0]?.detail).toContain("1 distinct citation");
  });

  test("maxClaims truncates deterministically and documents the truncation", async () => {
    const first = validWidthClaim("claim-keep-b");
    const second = validWidthClaim("claim-drop-a", "Another well-grounded claim.");
    // Canonical order is claimId-ascending: "claim-drop-a" < "claim-keep-b".
    const provider = scriptedProvider("p1", "deterministic-reference", [
      completed([first, second]),
    ]);
    const gateway = createReasoningGateway({ providers: [provider], clock: constClock() });
    const result = await gateway.reason(
      makeQuery({ question: WIDTH_QUESTION, policy: { ...defaultPolicy(), maxClaims: 1 } }),
    );
    expect(result.claims.map((c) => c.claimId)).toEqual(["claim-drop-a"]);
    expect(result.refusals).toEqual([
      {
        code: "POLICY_VIOLATION",
        detail:
          "provider emitted 2 valid claims; policy maxClaims is 1; the first 1 in claimId order are retained and 1 are rejected",
      },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Provider failures and deterministic failover                         */
/* ------------------------------------------------------------------ */

describe("reasoning gateway: provider failure handling and failover", () => {
  test("a TRANSIENT typed failure fails over to the next provider in order", async () => {
    const claims = [validWidthClaim("claim-a")];
    const first = scriptedProvider("p1", "deterministic-reference", [
      { kind: "failure", failure: { failureKind: "TRANSIENT", detail: "overloaded" } },
    ]);
    const second = scriptedProvider("p2", "deterministic-conservative", [completed(claims)]);
    const gateway = gatewayOver([first, second]);
    const result = await gateway.reason(makeQuery({ question: WIDTH_QUESTION }));
    expect(result.claims.map((c) => c.claimId)).toEqual(["claim-a"]);
    expect(result.providerDescriptor?.providerId).toBe("p2");
    expect(first.calls.length).toBe(1);
    expect(second.calls.length).toBe(1);
  });

  test("a THROWN provider exception is wrapped TRANSIENT with sanitized detail", async () => {
    const first = scriptedProvider("p1", "deterministic-reference", [
      { kind: "throw", message: "secret internal detail with tokens" },
    ]);
    const claims = [validWidthClaim("claim-a")];
    const second = scriptedProvider("p2", "deterministic-conservative", [completed(claims)]);
    const gateway = gatewayOver([first, second]);
    const result = await gateway.reason(makeQuery({ question: WIDTH_QUESTION }));
    // The exception MESSAGE never surfaces — only the provider id + name.
    expect(JSON.stringify(result)).not.toContain("secret internal detail");
    expect(result.claims.length).toBe(1);
    expect(result.providerDescriptor?.providerId).toBe("p2");
  });

  test("a PERMANENT failure refuses immediately — later providers are NOT tried", async () => {
    const first = scriptedProvider("p1", "deterministic-reference", [
      { kind: "failure", failure: { failureKind: "PERMANENT", detail: "quota exhausted" } },
    ]);
    const second = scriptedProvider("p2", "deterministic-conservative", [completed([])]);
    const gateway = gatewayOver([first, second]);
    const result = await gateway.reason(makeQuery({ question: WIDTH_QUESTION }));
    expect(result.claims).toEqual([]);
    expect(result.refusals).toEqual([
      {
        code: "PROVIDER_FAILURE",
        detail: "provider 'p1' reported a permanent failure: quota exhausted",
      },
    ]);
    expect(result.providerDescriptor?.providerId).toBe("p1");
    expect(second.calls.length).toBe(0);
  });

  test("every provider failing transiently refuses naming ALL attempted ids", async () => {
    const first = scriptedProvider("p1", "deterministic-reference", [
      { kind: "failure", failure: { failureKind: "TRANSIENT", detail: "timeout" } },
    ]);
    const second = scriptedProvider("p2", "deterministic-conservative", [
      { kind: "failure", failure: { failureKind: "TRANSIENT", detail: "busy" } },
    ]);
    const gateway = gatewayOver([first, second]);
    const result = await gateway.reason(makeQuery({ question: WIDTH_QUESTION }));
    expect(result.claims).toEqual([]);
    expect(result.refusals.length).toBe(1);
    expect(result.refusals[0]?.code).toBe("PROVIDER_FAILURE");
    expect(result.refusals[0]?.detail).toBe(
      "every eligible provider failed transiently (p1, p2); last failure: busy",
    );
    expect(result.providerDescriptor?.providerId).toBe("p2");
  });

  test("a malformed completion shape is a PERMANENT typed failure (never a crash)", async () => {
    const first = scriptedProvider("p1", "deterministic-reference", [
      { kind: "completed" } as unknown as ProviderCompletion,
    ]);
    const gateway = gatewayOver([first]);
    const result = await gateway.reason(makeQuery({ question: WIDTH_QUESTION }));
    expect(result.claims).toEqual([]);
    expect(result.refusals[0]?.code).toBe("PROVIDER_FAILURE");
    expect(result.refusals[0]?.detail).toBe(
      "provider 'p1' reported a permanent failure: provider 'p1' returned an invalid completion shape",
    );
  });

  test("the optional logger observes failures (event, queryId, providerId, kind)", async () => {
    const warnings: { message: string; fields: Record<string, unknown> }[] = [];
    const logger: Logger = {
      debug: () => undefined,
      info: () => undefined,
      error: () => undefined,
      warn: (message, fields) => {
        warnings.push({ message, fields: { ...(fields ?? {}) } });
      },
    };
    const claims = [validWidthClaim("claim-a")];
    const first = scriptedProvider("p1", "deterministic-reference", [
      { kind: "failure", failure: { failureKind: "TRANSIENT", detail: "x" } },
    ]);
    const second = scriptedProvider("p2", "deterministic-conservative", [completed(claims)]);
    const gateway = createReasoningGateway({ providers: [first, second], clock: constClock(), logger });
    await gateway.reason(makeQuery({ question: WIDTH_QUESTION, queryId: "query-log-1" }));
    expect(warnings).toEqual([
      {
        message: "reasoning_provider_failure",
        fields: { queryId: "query-log-1", providerId: "p1", failureKind: "TRANSIENT" },
      },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* The injected retrieval adapter (part of the trusted computing base)   */
/* ------------------------------------------------------------------ */

describe("reasoning gateway: retrieval injection", () => {
  const rejectingAdapter: RetrievalAdapter = {
    resolveCitation: () => "absent",
    uncertaintySourcesAt: () => [],
  } as unknown as RetrievalAdapter;

  test("the injected adapter IS the citation-resolution authority", async () => {
    const provider = scriptedProvider("p1", "deterministic-reference", [
      completed([validWidthClaim("claim-a")]),
    ]);
    const gateway = createReasoningGateway({
      providers: [provider],
      clock: constClock(),
      retrieval: rejectingAdapter,
    });
    const result = await gateway.reason(makeQuery({ question: WIDTH_QUESTION }));
    expect(result.claims).toEqual([]);
    expect(result.refusals[0]?.code).toBe("CONTRACT_VIOLATION");
    expect(result.refusals[0]?.detail).toContain("absent from the supplied context");
  });
});

/* ------------------------------------------------------------------ */
/* DETERMINISM (byte-identical) + injected clock + purity               */
/* ------------------------------------------------------------------ */

describe("reasoning gateway: determinism", () => {
  test("same query + same clock ⇒ BYTE-IDENTICAL results (both gateways)", async () => {
    const query = makeQuery({ question: WIDTH_QUESTION });
    const first = await createReasoningGateway({
      providers: [createDeterministicReferenceProvider()],
      clock: constClock(),
    }).reason(query);
    const second = await createReasoningGateway({
      providers: [createDeterministicReferenceProvider()],
      clock: constClock(),
    }).reason(makeQuery({ question: WIDTH_QUESTION }));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test("the same gateway instance is repeatable; shuffled context order does not leak", async () => {
    const gateway = createReasoningGateway({
      providers: [createDeterministicReferenceProvider()],
      clock: constClock(),
    });
    const first = await gateway.reason(makeQuery({ question: FINDINGS_QUESTION }));
    const again = await gateway.reason(makeQuery({ question: FINDINGS_QUESTION }));
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));

    const base = groundedStoreyContext();
    const reversed: GroundedContext = {
      ...base,
      graphSnapshot: {
        nodes: [...base.graphSnapshot.nodes].reverse(),
        relationships: [...base.graphSnapshot.relationships].reverse(),
      },
      evidenceRecords: [...base.evidenceRecords].reverse(),
      verificationFindings: [...base.verificationFindings].reverse(),
      cases: [...base.cases].reverse(),
    };
    const fromReversed = await gateway.reason(
      makeQuery({ question: FINDINGS_QUESTION, context: reversed }),
    );
    expect(JSON.stringify(fromReversed)).toBe(JSON.stringify(first));
  });

  test("completedAt comes ONLY from the injected clock (sequence, then repeat)", async () => {
    const gateway = createReasoningGateway({
      providers: [createDeterministicReferenceProvider()],
      clock: sequenceClock("2026-01-01T00:00:01Z", "2026-01-01T00:00:02Z"),
    });
    const one = await gateway.reason(makeQuery({ question: WIDTH_QUESTION, queryId: "q1" }));
    const two = await gateway.reason(makeQuery({ question: WIDTH_QUESTION, queryId: "q2" }));
    const three = await gateway.reason(makeQuery({ question: WIDTH_QUESTION, queryId: "q3" }));
    expect(one.completedAt).toBe("2026-01-01T00:00:01Z");
    expect(two.completedAt).toBe("2026-01-01T00:00:02Z");
    expect(three.completedAt).toBe("2026-01-01T00:00:02Z");
  });

  test("purity: a deep-frozen context and query survive reasoning unchanged", async () => {
    const frozenQuery = deepFreeze(
      makeQuery({ question: CASE_QUESTION }),
    ) as ReasoningQuery;
    const gateway = createReasoningGateway({
      providers: [createDeterministicReferenceProvider()],
      clock: constClock(),
    });
    const result = await gateway.reason(frozenQuery);
    expect(result.claims.length).toBe(2);
    expect(Object.isFrozen(frozenQuery.context)).toBe(true);
    expect(Object.isFrozen(frozenQuery.context.graphSnapshot.nodes)).toBe(true);
    expect(frozenQuery.context.graphSnapshot.nodes.length).toBe(5);
  });
});
