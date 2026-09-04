/**
 * AISE-021 rule-set construction suite: fail-closed validation,
 * content pinning, and the CRITICAL-gate requirement.
 */
import { describe, expect, it } from "vitest";
import { isRulesError, type RulesError } from "./errors.js";
import { ruleSet, runProfileSatisfies, type Rule } from "./rule.js";
import { SPACE } from "./testing.js";

/** Captures the RulesError a thunk throws (or undefined). */
function capture(thunk: () => unknown): RulesError | undefined {
  try {
    thunk();
    return undefined;
  } catch (error) {
    expect(isRulesError(error)).toBe(true);
    return error as RulesError;
  }
}

const DIMENSION_RULE: Rule = {
  ruleId: "rule-min-height",
  kind: "DIMENSION",
  subject: { type: "space-property", spaceId: SPACE, propertyKey: "roomHeight" },
  operator: "MINIMUM",
  bound: { value: 2.5, unit: "meter" },
};

describe("rule-set construction (fail-closed validation)", () => {
  it("builds a valid set with a canonical digest and freezes it", () => {
    const set = ruleSet({ rulesetId: "set-a", profile: "LIGHT", rules: [DIMENSION_RULE] });
    expect(set.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(() => {
      (set as unknown as { digest: string }).digest = "0".repeat(64);
    }).toThrow();
    expect(() => {
      (set.rules as unknown as unknown[]).push({});
    }).toThrow();
  });

  it("rejects invalid ids, profiles, empty rule lists", () => {
    expect(capture(() => ruleSet({ rulesetId: "bad id!", profile: "LIGHT", rules: [DIMENSION_RULE] }))?.code).toBe("RULESET_INVALID");
    expect(capture(() => ruleSet({ rulesetId: "s", profile: "ULTRA" as never, rules: [DIMENSION_RULE] }))?.code).toBe("RULESET_INVALID");
    expect(capture(() => ruleSet({ rulesetId: "s", profile: "LIGHT", rules: [] }))?.code).toBe("RULESET_INVALID");
    expect(capture(() => ruleSet({ rulesetId: "s", profile: "LIGHT", rules: "x" as never }))?.code).toBe("RULESET_INVALID");
  });

  it("rejects duplicate rule ids", () => {
    const error = capture(() =>
      ruleSet({ rulesetId: "s", profile: "LIGHT", rules: [DIMENSION_RULE, { ...DIMENSION_RULE }] }),
    );
    expect(error?.code).toBe("RULESET_INVALID");
    expect(error?.message).toContain("duplicate");
  });

  it("rejects invalid operators, bounds, margins, units", () => {
    expect(
      capture(() =>
        ruleSet({ rulesetId: "s", profile: "LIGHT", rules: [{ ...DIMENSION_RULE, operator: "ABOUT" as never }] }),
      )?.message,
    ).toContain("operator");
    expect(
      capture(() =>
        ruleSet({ rulesetId: "s", profile: "LIGHT", rules: [{ ...DIMENSION_RULE, bound: { value: Number.NaN, unit: "meter" } }] }),
      )?.message,
    ).toContain("bound.value");
    expect(
      capture(() =>
        ruleSet({ rulesetId: "s", profile: "LIGHT", rules: [{ ...DIMENSION_RULE, margin: -1 }] }),
      )?.message,
    ).toContain("margin");
    expect(
      capture(() =>
        ruleSet({ rulesetId: "s", profile: "LIGHT", rules: [{ ...DIMENSION_RULE, bound: { value: 1, unit: "furlong" as never } }] }),
      )?.message,
    ).toContain("bound.unit");
  });

  it("rejects invalid subjects (type, id, propertyKey)", () => {
    expect(
      capture(() =>
        ruleSet({
          rulesetId: "s",
          profile: "LIGHT",
          rules: [{ ...DIMENSION_RULE, subject: { type: "weird" as never, spaceId: SPACE, propertyKey: "x" } }],
        }),
      )?.message,
    ).toContain("subject.type");
    expect(
      capture(() =>
        ruleSet({
          rulesetId: "s",
          profile: "LIGHT",
          rules: [{ ...DIMENSION_RULE, subject: { type: "space-property", spaceId: "bad id!", propertyKey: "x" } }],
        }),
      )?.message,
    ).toContain("subject id");
    expect(
      capture(() =>
        ruleSet({
          rulesetId: "s",
          profile: "LIGHT",
          rules: [{ ...DIMENSION_RULE, subject: { type: "space-property", spaceId: SPACE, propertyKey: "" } }],
        }),
      )?.message,
    ).toContain("propertyKey");
  });

  it("rejects invalid specification-rule fields", () => {
    expect(
      capture(() =>
        ruleSet({
          rulesetId: "s",
          profile: "LIGHT",
          rules: [
            {
              ruleId: "r",
              kind: "SPECIFICATION",
              subject: { type: "space-property", spaceId: SPACE, propertyKey: "x" },
              requiredStatus: "MAYBE" as never,
            },
          ],
        }),
      )?.message,
    ).toContain("requiredStatus");
    expect(
      capture(() =>
        ruleSet({
          rulesetId: "s",
          profile: "LIGHT",
          rules: [
            {
              ruleId: "r",
              kind: "SPECIFICATION",
              subject: { type: "space-property", spaceId: SPACE, propertyKey: "x" },
              requiredStatus: "OBSERVED",
              requireMeasurement: "yes" as never,
            },
          ],
        }),
      )?.message,
    ).toContain("requireMeasurement");
  });

  it("CRITICAL sets without a readiness gate are refused (fail-closed composition rule)", () => {
    const error = capture(() => ruleSet({ rulesetId: "s", profile: "CRITICAL", rules: [DIMENSION_RULE] }));
    expect(error?.code).toBe("RULESET_INVALID");
    expect(error?.message).toContain("readinessGate");
  });

  it("CRITICAL sets WITH a gate build; non-CRITICAL sets with gates build", () => {
    expect(() =>
      ruleSet({ rulesetId: "s", profile: "CRITICAL", readinessGate: { profile: "CRITICAL" }, rules: [DIMENSION_RULE] }),
    ).not.toThrow();
    expect(() =>
      ruleSet({ rulesetId: "s", profile: "STANDARD", readinessGate: { profile: "STANDARD" }, rules: [DIMENSION_RULE] }),
    ).not.toThrow();
  });

  it("rejects invalid gate profiles", () => {
    expect(
      capture(() =>
        ruleSet({ rulesetId: "s", profile: "STANDARD", readinessGate: { profile: "ULTRA" as never }, rules: [DIMENSION_RULE] }),
      )?.message,
    ).toContain("readinessGate.profile");
  });

  it("the digest pins the content (any change breaks it)", () => {
    const base = ruleSet({ rulesetId: "s", profile: "LIGHT", rules: [DIMENSION_RULE] });
    const same = ruleSet({ rulesetId: "s", profile: "LIGHT", rules: [{ ...DIMENSION_RULE }] });
    expect(same.digest).toBe(base.digest);
    expect(
      ruleSet({ rulesetId: "s2", profile: "LIGHT", rules: [{ ...DIMENSION_RULE }] }).digest,
    ).not.toBe(base.digest);
    expect(
      ruleSet({ rulesetId: "s", profile: "STANDARD", rules: [{ ...DIMENSION_RULE }] }).digest,
    ).not.toBe(base.digest);
    expect(
      ruleSet({
        rulesetId: "s",
        profile: "LIGHT",
        rules: [{ ...DIMENSION_RULE, bound: { value: 2.6, unit: "meter" } }],
      }).digest,
    ).not.toBe(base.digest);
    expect(
      ruleSet({ rulesetId: "s", profile: "LIGHT", readinessGate: { profile: "LIGHT" }, rules: [{ ...DIMENSION_RULE }] }).digest,
    ).not.toBe(base.digest);
  });

  it("runProfileSatisfies encodes the no-downgrade rule", () => {
    expect(runProfileSatisfies("CRITICAL", "LIGHT")).toBe(true);
    expect(runProfileSatisfies("CRITICAL", "CRITICAL")).toBe(true);
    expect(runProfileSatisfies("LIGHT", "CRITICAL")).toBe(false);
    expect(runProfileSatisfies("HIGH_ASSURANCE", "HIGH_ASSURANCE")).toBe(true);
    expect(runProfileSatisfies("STANDARD", "HIGH_ASSURANCE")).toBe(false);
  });
});
