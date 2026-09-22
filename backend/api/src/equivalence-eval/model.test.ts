/**
 * HFX-301 — the equivalence MODEL tests: the closed vocabularies, the
 * pair validator's fail-closed behavior and the declared-difference
 * consistency rule.
 */

import { describe, expect, test } from "bun:test";
import {
  EQUIVALENCE_COMPARISON_POINTS,
  EQUIVALENCE_EVAL_ERROR_CODES,
  EQUIVALENCE_EXPECTATIONS,
  EQUIVALENCE_REFUSAL_TAXONOMY,
  EquivalenceEvalError,
  isEquivalenceExpectation,
  validateEquivalencePair,
} from "./model";
import { EQUIVALENCE_CORPUS } from "./corpus";

describe("HFX-301 model: the closed vocabularies", () => {
  test("the four behavior-matrix cells are the frozen expectation vocabulary", () => {
    expect([...EQUIVALENCE_EXPECTATIONS]).toEqual([
      "equivalent",
      "declared-different",
      "agent-refused",
      "agent-clarification",
    ]);
  });

  test("the comparison points reuse PROD-029's kinds (identity, state, verdict, BOQ)", () => {
    expect([...EQUIVALENCE_COMPARISON_POINTS]).toEqual([
      "operation-identity",
      "state-digest",
      "validation-verdict",
      "boq-line",
    ]);
  });

  test("the refusal taxonomy mirrors PROD-023's seven reason codes", () => {
    expect([...EQUIVALENCE_REFUSAL_TAXONOMY]).toEqual([
      "validation-authority-claim",
      "approval-authority-claim",
      "reality-authority-claim",
      "readiness-authority-claim",
      "cost-authority-claim",
      "raw-geometry-write",
      "engine-bypass",
    ]);
  });

  test("the membership check admits the cells and refuses inventions", () => {
    for (const cell of EQUIVALENCE_EXPECTATIONS) {
      expect(isEquivalenceExpectation(cell)).toBe(true);
    }
    expect(isEquivalenceExpectation("mostly-equivalent")).toBe(false);
    expect(isEquivalenceExpectation(42)).toBe(false);
  });

  test("the typed error registry is frozen and carries its code", () => {
    expect([...EQUIVALENCE_EVAL_ERROR_CODES]).toEqual([
      "invalid_request",
      "invalid_pair",
      "invalid_scene",
    ]);
    const error = new EquivalenceEvalError("invalid_pair", "the detail");
    expect(error.code).toBe("invalid_pair");
    expect(error.message).toBe("invalid_pair: the detail");
  });
});

describe("HFX-301 model: the pair validator (fail-closed)", () => {
  test("every committed pair validates", () => {
    for (const pair of EQUIVALENCE_CORPUS) {
      const validation = validateEquivalencePair(pair);
      expect(validation.ok).toBe(true);
    }
  });

  test("a non-object payload is refused with a typed finding", () => {
    const validation = validateEquivalencePair("not a pair");
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures[0]?.path).toBe("$");
    }
  });

  test("an empty utterance and an unanchored target fail validation", () => {
    const base = EQUIVALENCE_CORPUS.find((pair) => pair.pairId === "eq-excavation-core");
    if (base === undefined) {
      throw new Error("the corpus pair is missing");
    }
    const noUtterance = validateEquivalencePair({ ...base, nlUtterance: "  " });
    expect(noUtterance.ok).toBe(false);
    if (!noUtterance.ok) {
      expect(noUtterance.failures.some((f) => f.path === "nlUtterance")).toBe(true);
    }
    const unanchored = validateEquivalencePair({
      ...base,
      direct: {
        ...base.direct,
        target: { ...base.direct.target, nodeRefs: [], geometryRefs: [] },
      },
    });
    expect(unanchored.ok).toBe(false);
    if (!unanchored.ok) {
      expect(
        unanchored.failures.some((f) => f.path === "direct.target"),
      ).toBe(true);
    }
  });

  test("an invented expectation cell is refused (the closed vocabulary)", () => {
    const base = EQUIVALENCE_CORPUS.find((pair) => pair.pairId === "eq-excavation-core");
    if (base === undefined) {
      throw new Error("the corpus pair is missing");
    }
    const validation = validateEquivalencePair({ ...base, expectation: "mostly-the-same" });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.failures.some((f) => f.path === "expectation")).toBe(true);
    }
  });

  test("a declared-different pair REQUIRES a closed-vocabulary difference kind", () => {
    const declared = EQUIVALENCE_CORPUS.find(
      (pair) => pair.pairId === "dd-plaster-replacement-omitted",
    );
    if (declared === undefined) {
      throw new Error("the declared-different pair is missing");
    }
    const withoutKind = validateEquivalencePair({ ...declared, declaredDifferenceKind: undefined });
    expect(withoutKind.ok).toBe(false);
    if (!withoutKind.ok) {
      expect(
        withoutKind.failures.some((f) => f.path === "declaredDifferenceKind"),
      ).toBe(true);
    }
    const inventedKind = validateEquivalencePair({
      ...declared,
      declaredDifferenceKind: "vibes-mismatch",
    });
    expect(inventedKind.ok).toBe(false);
  });

  test("only a declared-different pair may declare a difference kind", () => {
    const equivalent = EQUIVALENCE_CORPUS.find((pair) => pair.pairId === "eq-excavation-core");
    if (equivalent === undefined) {
      throw new Error("the corpus pair is missing");
    }
    const validation = validateEquivalencePair({
      ...equivalent,
      declaredDifferenceKind: "operation-semantic-failure",
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.failures.some((f) => f.path === "declaredDifferenceKind"),
      ).toBe(true);
    }
  });
});
