/**
 * HFX-000 — the closed failure vocabulary tests.
 */

import { describe, expect, test } from "bun:test";
import {
  FAILURE_KINDS,
  FAILURE_VOCABULARY,
  failureDefinitionOf,
  isFailureKind,
} from "./failures";

describe("the closed failure vocabulary", () => {
  test("contains exactly the nine mandated kinds (frozen reference data)", () => {
    expect([...FAILURE_KINDS]).toEqual([
      "perception-failure",
      "retrieval-failure",
      "reasoning-failure",
      "unsupported-data",
      "operation-semantic-failure",
      "resource-exhaustion",
      "timeout",
      "license-blocked",
      "contract-mismatch",
    ]);
  });

  test("every kind carries a one-line definition (the README mirror)", () => {
    expect(FAILURE_VOCABULARY).toHaveLength(FAILURE_KINDS.length);
    for (const entry of FAILURE_VOCABULARY) {
      expect(entry.definition.trim().length).toBeGreaterThan(20);
      expect(entry.definition.endsWith(".")).toBe(true);
    }
  });

  test("the vocabulary and the kind list agree one-to-one, in order", () => {
    expect(FAILURE_VOCABULARY.map((entry) => entry.kind)).toEqual([...FAILURE_KINDS]);
  });

  test("isFailureKind accepts members and rejects everything else", () => {
    for (const kind of FAILURE_KINDS) {
      expect(isFailureKind(kind)).toBe(true);
    }
    expect(isFailureKind("perception_failure")).toBe(false); // spelling matters
    expect(isFailureKind("vibes-failure")).toBe(false); // invented kinds are refused
    expect(isFailureKind("")).toBe(false);
    expect(isFailureKind(42)).toBe(false);
    expect(isFailureKind(null)).toBe(false);
    expect(isFailureKind({ kind: "timeout" })).toBe(false);
  });

  test("failureDefinitionOf answers the definition of every kind", () => {
    for (const entry of FAILURE_VOCABULARY) {
      expect(failureDefinitionOf(entry.kind)).toBe(entry.definition);
    }
  });

  test("the layer-hardening hook: the five discriminable failures HFX-202/203/204 need are distinct kinds", () => {
    const discriminable = [
      "perception-failure",
      "retrieval-failure",
      "reasoning-failure",
      "unsupported-data",
      "operation-semantic-failure",
    ];
    expect(discriminable.filter((kind) => isFailureKind(kind))).toHaveLength(discriminable.length);
  });
});
