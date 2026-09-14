/**
 * AISE-029 — policy tests: the documented default (verbatim), the policy
 * shape validation matrix (caller-bug detection, deterministic issue
 * order), and the QUERY-level rules gate — forbidden topics with
 * WORD-BOUNDARY matching (the AISE-017 lesson: "roof" never fires inside
 * "waterproofing"), declared-order first-match refusal, and the allow
 * verdict. Pure: the same query always yields the same verdict.
 */

import { describe, expect, test } from "bun:test";
import { DEFAULT_REASONING_POLICY, evaluatePolicy, validateReasoningPolicy } from "./policy";
import type { ReasoningQuery } from "./model";
import { makeQuery } from "./testkit";

describe("reasoning policy: the documented default", () => {
  test("DEFAULT_REASONING_POLICY is verbatim (tested, not re-derived)", () => {
    expect(DEFAULT_REASONING_POLICY).toEqual({
      requiredCitationsPerClaim: 1,
      refuseOnUnverifiable: true,
      maxClaims: 8,
    });
  });
});

describe("reasoning policy: shape validation (caller-bug detection)", () => {
  test("the default policy is valid; a fresh default is an independent object", () => {
    expect(validateReasoningPolicy(DEFAULT_REASONING_POLICY)).toEqual([]);
    expect(validateReasoningPolicy({ ...DEFAULT_REASONING_POLICY })).toEqual([]);
  });

  test("non-object policies are rejected in one issue", () => {
    expect(validateReasoningPolicy(null)).toEqual(["policy must be an object"]);
    expect(validateReasoningPolicy("strict")).toEqual(["policy must be an object"]);
    expect(validateReasoningPolicy([DEFAULT_REASONING_POLICY])).toEqual([
      "policy must be an object",
    ]);
  });

  test("field-order deterministic issues for every invalid field", () => {
    const issues = validateReasoningPolicy({
      requiredCitationsPerClaim: 0,
      refuseOnUnverifiable: "yes",
      maxClaims: 1.5,
    });
    expect(issues).toEqual([
      "requiredCitationsPerClaim must be an integer >= 1",
      "refuseOnUnverifiable must be a boolean",
      "maxClaims must be an integer >= 1",
    ]);
  });

  test("forbiddenTopics and allowedProviderKinds shape issues", () => {
    expect(
      validateReasoningPolicy({ ...DEFAULT_REASONING_POLICY, forbiddenTopics: "roof" }),
    ).toEqual(["forbiddenTopics must be an array when present"]);
    expect(
      validateReasoningPolicy({ ...DEFAULT_REASONING_POLICY, forbiddenTopics: ["", "x"] }),
    ).toEqual(["forbiddenTopics entries must be non-empty strings"]);
    expect(
      validateReasoningPolicy({ ...DEFAULT_REASONING_POLICY, allowedProviderKinds: ["llm"] }),
    ).toEqual(["allowedProviderKinds contains unknown provider kind 'llm'"]);
    expect(
      validateReasoningPolicy({
        ...DEFAULT_REASONING_POLICY,
        allowedProviderKinds: ["deterministic-reference"],
      }),
    ).toEqual([]);
  });
});

describe("reasoning policy: the query-level rules gate", () => {
  function queryWith(question: string, topics?: readonly string[]): ReasoningQuery {
    return makeQuery({
      question,
      policy: topics === undefined ? undefined : {
        ...DEFAULT_REASONING_POLICY,
        forbiddenTopics: [...topics],
      },
    });
  }

  test("no forbidden topics declared ⇒ allow", () => {
    expect(evaluatePolicy(queryWith("What is the width of Wall North?"))).toEqual({
      verdict: "allow",
    });
  });

  test("a forbidden topic refuses with POLICY_VIOLATION naming the topic", () => {
    const verdict = evaluatePolicy(
      queryWith("What is the melting point of the Eiffel Tower?", ["melting point"]),
    );
    expect(verdict.verdict).toBe("refuse");
    // The question must actually CONTAIN the topic for a refusal (the
    // interrupted-WIP draft asked an unrelated question and wrongly expected
    // a refusal — the gate is honest, so it allowed it).
    expect(evaluatePolicy(queryWith("What is the width of Wall North?", ["melting point"])).verdict).toBe(
      "allow",
    );
    if (verdict.verdict === "refuse") {
      expect(verdict.refusal.code).toBe("POLICY_VIOLATION");
      expect(verdict.refusal.detail).toBe(
        "question addresses forbidden topic 'melting point'",
      );
    }
  });

  test("WORD-BOUNDARY matching: 'roof' never fires inside 'waterproofing'", () => {
    expect(evaluatePolicy(queryWith("Describe the roof construction.", ["roof"])).verdict).toBe(
      "refuse",
    );
    expect(evaluatePolicy(queryWith("Assess the waterproofing.", ["roof"])).verdict).toBe("allow");
  });

  test("matching is case-insensitive and order-deterministic (first match wins)", () => {
    const verdict = evaluatePolicy(
      queryWith("Assess the waterproofing membrane.", ["roof", "membrane"]),
    );
    expect(verdict.verdict).toBe("refuse");
    if (verdict.verdict === "refuse") {
      // "membrane" is the FIRST matching topic in DECLARED order ("roof"
      // does not match at all under word boundaries).
      expect(verdict.refusal.detail).toContain("membrane");
      expect(verdict.refusal.detail).not.toContain("roof");
    }
    expect(
      evaluatePolicy(queryWith("What about the ROOF?", ["roof"])).verdict,
    ).toBe("refuse");
  });

  test("the gate is pure: the same query always yields the same verdict", () => {
    const query = queryWith("Describe the roof.", ["roof"]);
    expect(evaluatePolicy(query)).toEqual(evaluatePolicy(query));
  });
});
