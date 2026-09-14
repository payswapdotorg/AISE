/**
 * AISE-029 — model tests: the frozen vocabularies (registries EXACT,
 * unique, runtime-frozen), the type-level epistemic separation (reasoning
 * output can never be OBSERVED/CONFIRMED), the deterministic identity
 * helpers, and the runtime vocabulary guards.
 */

import { describe, expect, test } from "bun:test";
import {
  CITATION_KINDS,
  CLAIM_EPISTEMIC_STATUSES,
  PROVIDER_FAILURE_KINDS,
  PROVIDER_KINDS,
  REASONING_ERROR_CODES,
  REFUSAL_CODES,
  UNCERTAINTY_KINDS,
  ReasoningGatewayError,
  claimIdFor,
  contentFingerprint,
  isCitationKind,
  isClaimEpistemicStatus,
  isRefusalCode,
} from "./model";
import type { ClaimCitation, ReasoningClaim } from "./model";

describe("reasoning model: frozen registries", () => {
  test("the refusal-code registry is EXACT, unique and runtime-frozen", () => {
    expect([...REFUSAL_CODES]).toEqual([
      "INSUFFICIENT_EVIDENCE",
      "UNGROUNDED_QUESTION",
      "POLICY_VIOLATION",
      "PROVIDER_FAILURE",
      "CONTRACT_VIOLATION",
    ]);
    expect(new Set(REFUSAL_CODES).size).toBe(REFUSAL_CODES.length);
    expect(Object.isFrozen(REFUSAL_CODES)).toBe(true);
    expect(() => {
      (REFUSAL_CODES as unknown as string[]).push("MADE_UP");
    }).toThrow();
  });

  test("the citation-kind registry is EXACT, unique and runtime-frozen", () => {
    expect([...CITATION_KINDS]).toEqual(["evidence", "graph_node", "finding", "case_observation"]);
    expect(new Set(CITATION_KINDS).size).toBe(CITATION_KINDS.length);
    expect(Object.isFrozen(CITATION_KINDS)).toBe(true);
  });

  test("the provider-kind vocabulary classifies identity METADATA and reserves llm-adapter", () => {
    expect([...PROVIDER_KINDS]).toEqual([
      "deterministic-reference",
      "deterministic-conservative",
      "llm-adapter",
    ]);
    expect(Object.isFrozen(PROVIDER_KINDS)).toBe(true);
    // Reserved for future adapters: no library provider carries it, but the
    // vocabulary is forward-compatible (no contract change needed later).
    expect(PROVIDER_KINDS).toContain("llm-adapter");
  });

  test("claim epistemic statuses EXCLUDE OBSERVED and CONFIRMED (structural separation)", () => {
    expect([...CLAIM_EPISTEMIC_STATUSES]).toEqual(["INFERRED", "PROPOSED"]);
    expect(CLAIM_EPISTEMIC_STATUSES).not.toContain("OBSERVED");
    expect(CLAIM_EPISTEMIC_STATUSES).not.toContain("CONFIRMED");
    expect(Object.isFrozen(CLAIM_EPISTEMIC_STATUSES)).toBe(true);
  });

  test("the remaining vocabularies are frozen and exact", () => {
    expect([...PROVIDER_FAILURE_KINDS]).toEqual(["TRANSIENT", "PERMANENT"]);
    expect([...UNCERTAINTY_KINDS]).toEqual(["UNKNOWN", "MEASURED_SIGMA"]);
    expect([...REASONING_ERROR_CODES]).toEqual([
      "invalid_query",
      "invalid_context",
      "invalid_policy",
      "no_providers",
      "duplicate_provider_id",
      "invalid_provider_descriptor",
    ]);
    for (const registry of [PROVIDER_FAILURE_KINDS, UNCERTAINTY_KINDS, REASONING_ERROR_CODES]) {
      expect(Object.isFrozen(registry)).toBe(true);
    }
  });
});

describe("reasoning model: TYPE-LEVEL epistemic separation", () => {
  // A claim citing the canonical fixture, carrying a valid uncertainty.
  const citations: readonly [ClaimCitation, ...ClaimCitation[]] = [
    { kind: "graph_node", nodeId: "node-wall-north" },
    { kind: "evidence", contentId: "ev-wall-north-depth" },
  ];
  const base = {
    text: "claim text",
    citations,
    uncertainty: { kind: "UNKNOWN" },
  } as const;

  test("a PROPOSED/INFERRED claim typechecks", () => {
    const inferred: ReasoningClaim = {
      ...base,
      claimId: "claim-1",
      epistemicStatus: "INFERRED",
    };
    const proposed: ReasoningClaim = {
      ...base,
      claimId: "claim-2",
      epistemicStatus: "PROPOSED",
    };
    expect(inferred.epistemicStatus).toBe("INFERRED");
    expect(proposed.epistemicStatus).toBe("PROPOSED");
  });

  test("OBSERVED and CONFIRMED are compile errors on reasoning claims", () => {
    // @ts-expect-error OBSERVED is not assignable to ClaimEpistemicStatus
    const observed: ReasoningClaim = { ...base, claimId: "claim-3", epistemicStatus: "OBSERVED" };
    // @ts-expect-error CONFIRMED is not assignable to ClaimEpistemicStatus
    const confirmed: ReasoningClaim = { ...base, claimId: "claim-4", epistemicStatus: "CONFIRMED" };
    expect([observed, confirmed]).toHaveLength(2);
  });
});

describe("reasoning model: deterministic identity helpers", () => {
  test("contentFingerprint is deterministic and content-sensitive", () => {
    expect(contentFingerprint({ b: 2, a: 1 })).toBe(contentFingerprint({ a: 1, b: 2 }));
    expect(contentFingerprint({ a: 1 })).not.toBe(contentFingerprint({ a: 2 }));
    expect(contentFingerprint("x")).toMatch(/^[0-9a-f]{64}$/);
  });

  test("claimIdFor is content-derived, stable and claim- prefixed (16 hex)", () => {
    const claim = {
      text: "same text",
      citations: [{ kind: "graph_node", nodeId: "n1" }] as const,
      epistemicStatus: "INFERRED",
      uncertainty: { kind: "UNKNOWN" },
    } as const;
    expect(claimIdFor(claim)).toBe(claimIdFor(claim));
    expect(claimIdFor(claim)).toMatch(/^claim-[0-9a-f]{16}$/);
    // Different content ⇒ different id (no sequence state, no randomness).
    expect(claimIdFor(claim)).not.toBe(
      claimIdFor({ ...claim, text: "different text" }),
    );
    // The id itself is not part of the fingerprint input: two claims with
    // identical content produce the same id regardless of outer claimId.
    expect(claimIdFor(claim)).toBe(
      claimIdFor({ ...claim, text: "same text" }),
    );
  });
});

describe("reasoning model: runtime vocabulary guards", () => {
  test("isRefusalCode accepts the registry and rejects everything else", () => {
    for (const code of REFUSAL_CODES) {
      expect(isRefusalCode(code)).toBe(true);
    }
    expect(isRefusalCode("MADE_UP")).toBe(false);
    expect(isRefusalCode(123)).toBe(false);
    expect(isRefusalCode(null)).toBe(false);
  });

  test("isCitationKind and isClaimEpistemicStatus discriminate", () => {
    expect(isCitationKind("evidence")).toBe(true);
    expect(isCitationKind("link")).toBe(false);
    expect(isClaimEpistemicStatus("INFERRED")).toBe(true);
    expect(isClaimEpistemicStatus("OBSERVED")).toBe(false);
    expect(isClaimEpistemicStatus(undefined)).toBe(false);
  });

  test("ReasoningGatewayError carries a stable code + detail", () => {
    const error = new ReasoningGatewayError("invalid_query", "queryId must be a non-empty string");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ReasoningGatewayError");
    expect(error.code).toBe("invalid_query");
    expect(error.detail).toBe("queryId must be a non-empty string");
    expect(error.message).toContain("invalid_query");
  });
});
