import { describe, expect, it } from "vitest";
import { ASSURANCE_PROFILES } from "@aise/backend-assurance";
import {
  CODE_FAMILY,
  QA_CHECK_FAMILIES,
  QA_CHECK_SUITE_VERSION,
  QA_FINDING_CODES,
  QA_PROFILES,
  isBlocking,
  minBlockingProfile,
  qaProfileRank,
  severityForOutcome,
  worstOutcome,
} from "./vocabulary.js";
import type { AssuranceProfile } from "@aise/shared-contracts";

describe("the finding vocabulary", () => {
  it("registers every code with a family", () => {
    for (const code of QA_FINDING_CODES) {
      expect(CODE_FAMILY[code]).toBeDefined();
    }
    expect(QA_FINDING_CODES.length).toBe(24);
  });

  it("CODE_FAMILY values all belong to the five check families", () => {
    for (const family of Object.values(CODE_FAMILY)) {
      expect(QA_CHECK_FAMILIES).toContain(family);
    }
  });

  it("every family carries at least one code", () => {
    const used = new Set(Object.values(CODE_FAMILY));
    for (const family of QA_CHECK_FAMILIES) {
      expect(used.has(family)).toBe(true);
    }
  });

  it("codes are unique", () => {
    expect(new Set(QA_FINDING_CODES).size).toBe(QA_FINDING_CODES.length);
  });

  it("the check-suite version is pinned", () => {
    expect(QA_CHECK_SUITE_VERSION).toBe("qa/model-qa-v1");
  });
});

describe("the profile ladder", () => {
  it("mirrors the frozen shared-contracts vocabulary", () => {
    expect([...QA_PROFILES]).toEqual([...ASSURANCE_PROFILES]);
  });

  it("ranks profiles monotonically LIGHT → CRITICAL", () => {
    expect(qaProfileRank("LIGHT")).toBeLessThan(qaProfileRank("STANDARD"));
    expect(qaProfileRank("STANDARD")).toBeLessThan(qaProfileRank("HIGH_ASSURANCE"));
    expect(qaProfileRank("HIGH_ASSURANCE")).toBeLessThan(qaProfileRank("CRITICAL"));
  });

  it("fails closed on unknown profiles", () => {
    expect(() => qaProfileRank("ULTRA" as AssuranceProfile)).toThrow();
  });
});

describe("the blocking policy table (fixed, fail-closed, monotone)", () => {
  const profiles = ["LIGHT", "STANDARD", "HIGH_ASSURANCE", "CRITICAL"] as const;

  it("every CONTRADICTION blocks at every profile — a contradiction is never advisory", () => {
    for (const profile of profiles) {
      expect(isBlocking("CONTRADICTION", profile)).toBe(true);
    }
    expect(minBlockingProfile("CONTRADICTION")).toBeNull();
  });

  it("INSUFFICIENT_EVIDENCE blocks from HIGH_ASSURANCE up", () => {
    expect(isBlocking("INSUFFICIENT_EVIDENCE", "LIGHT")).toBe(false);
    expect(isBlocking("INSUFFICIENT_EVIDENCE", "STANDARD")).toBe(false);
    expect(isBlocking("INSUFFICIENT_EVIDENCE", "HIGH_ASSURANCE")).toBe(true);
    expect(isBlocking("INSUFFICIENT_EVIDENCE", "CRITICAL")).toBe(true);
    expect(minBlockingProfile("INSUFFICIENT_EVIDENCE")).toBe("HIGH_ASSURANCE");
  });

  it("UNEVALUABLE blocks at CRITICAL only (fail closed exactly there)", () => {
    for (const profile of ["LIGHT", "STANDARD", "HIGH_ASSURANCE"] as const) {
      expect(isBlocking("UNEVALUABLE", profile)).toBe(false);
    }
    expect(isBlocking("UNEVALUABLE", "CRITICAL")).toBe(true);
    expect(minBlockingProfile("UNEVALUABLE")).toBe("CRITICAL");
  });

  it("blocking strength is monotone in the profile rank for every outcome", () => {
    for (const outcome of ["CONTRADICTION", "INSUFFICIENT_EVIDENCE", "UNEVALUABLE"] as const) {
      let previous = false;
      for (const profile of profiles) {
        const current = isBlocking(outcome, profile);
        expect(current ? 1 : 0).toBeGreaterThanOrEqual(previous ? 1 : 0);
        previous = current;
      }
    }
  });
});

describe("outcome semantics", () => {
  it("PASS when there are no findings", () => {
    expect(worstOutcome([])).toBe("PASS");
  });

  it("CONTRADICTION dominates every other outcome", () => {
    expect(worstOutcome(["UNEVALUABLE", "CONTRADICTION", "INSUFFICIENT_EVIDENCE"])).toBe("CONTRADICTION");
  });

  it("INSUFFICIENT_EVIDENCE dominates UNEVALUABLE", () => {
    expect(worstOutcome(["UNEVALUABLE", "INSUFFICIENT_EVIDENCE"])).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("the worst outcome of identical findings is that outcome", () => {
    expect(worstOutcome(["UNEVALUABLE", "UNEVALUABLE"])).toBe("UNEVALUABLE");
  });

  it("severity classifies: contradictions are CRITICAL, the rest MAJOR", () => {
    expect(severityForOutcome("CONTRADICTION")).toBe("CRITICAL");
    expect(severityForOutcome("INSUFFICIENT_EVIDENCE")).toBe("MAJOR");
    expect(severityForOutcome("UNEVALUABLE")).toBe("MAJOR");
  });
});
