import { describe, expect, it } from "vitest";
import type { AssuranceProfile, CaptureIntent } from "@aise/shared-contracts";
import {
  ASSURANCE_PROFILES,
  CAPTURE_INTENTS,
  READINESS_DIMENSIONS,
  REQUIREMENTS_BY_PROFILE,
  budgetForFamily,
  requirementsFor,
  standardEquivalent,
  taskProfile,
} from "./profile.js";

const PROFILES: readonly AssuranceProfile[] = ["LIGHT", "STANDARD", "HIGH_ASSURANCE", "CRITICAL"];

describe("taskProfile construction", () => {
  it("builds a content-pinned record with a deterministic digest", () => {
    const input = {
      taskId: "task-plan-review",
      intent: "AS_BUILT" as CaptureIntent,
      profile: "HIGH_ASSURANCE" as AssuranceProfile,
      uncertaintyBudget: { lengthM: 0.05 },
    };
    const a = taskProfile(input);
    const b = taskProfile({ ...input });
    expect(a.digest).toBe(b.digest);
    expect(a).toEqual(b);
    expect(a.profile).toBe("HIGH_ASSURANCE");
    expect(a.intent).toBe("AS_BUILT");
  });

  it("freezes the record and the budget", () => {
    const record = taskProfile({ taskId: "t", intent: "INSPECTION", profile: "CRITICAL", uncertaintyBudget: { angleRad: 0.01 } });
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.uncertaintyBudget)).toBe(true);
  });

  it("rejects invalid taskId values", () => {
    for (const bad of ["", " leading", "sp ace", "sla/sh"]) {
      expect(() => taskProfile({ taskId: bad, intent: "AS_BUILT", profile: "LIGHT" })).toThrowError(/taskId/);
    }
    expect(() => taskProfile({ taskId: 42 as unknown as string, intent: "AS_BUILT", profile: "LIGHT" })).toThrowError(/taskId/);
  });

  it("rejects unknown intents and profiles", () => {
    expect(() => taskProfile({ taskId: "t", intent: "NOT_A_THING" as CaptureIntent, profile: "LIGHT" })).toThrowError(/intent/);
    expect(() => taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "ULTRA" as AssuranceProfile })).toThrowError(/profile/);
  });

  it("rejects empty descriptions", () => {
    expect(() => taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "LIGHT", description: "" })).toThrowError(/description/);
  });

  it("rejects empty, unknown-field, and non-positive budgets", () => {
    expect(() => taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "CRITICAL", uncertaintyBudget: {} })).toThrowError(/at least one family/);
    expect(() =>
      taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "CRITICAL", uncertaintyBudget: { lengthM: 1, bogus: 2 } as never }),
    ).toThrowError(/unknown fields/);
    expect(() => taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "CRITICAL", uncertaintyBudget: { lengthM: 0 } })).toThrowError(/positive/);
    expect(() => taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "CRITICAL", uncertaintyBudget: { lengthM: Number.NaN } })).toThrowError(
      /positive/,
    );
    expect(() => taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "CRITICAL", uncertaintyBudget: { areaM2: -1 } })).toThrowError(
      /positive/,
    );
  });

  it("the digest changes with content (description, budget, profile, intent)", () => {
    const base = taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "STANDARD" });
    expect(taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "STANDARD", description: "d" }).digest).not.toBe(base.digest);
    expect(taskProfile({ taskId: "t", intent: "MAINTENANCE", profile: "STANDARD" }).digest).not.toBe(base.digest);
    expect(taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "LIGHT" }).digest).not.toBe(base.digest);
    expect(taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "STANDARD", uncertaintyBudget: { lengthM: 1 } }).digest).not.toBe(base.digest);
    // Budget VALUES matter too.
    expect(taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "STANDARD", uncertaintyBudget: { lengthM: 1 } }).digest).not.toBe(
      taskProfile({ taskId: "t", intent: "AS_BUILT", profile: "STANDARD", uncertaintyBudget: { lengthM: 2 } }).digest,
    );
  });

  it("accepts every shared-vocabulary intent and profile", () => {
    for (const intent of CAPTURE_INTENTS) {
      for (const profile of ASSURANCE_PROFILES) {
        expect(taskProfile({ taskId: "t", intent, profile }).profile).toBe(profile);
      }
    }
    expect(CAPTURE_INTENTS).toEqual(["AS_BUILT", "MAINTENANCE", "INSPECTION"]);
    expect(ASSURANCE_PROFILES).toEqual(["LIGHT", "STANDARD", "HIGH_ASSURANCE", "CRITICAL"]);
  });
});

describe("the fixed requirements table", () => {
  it("is frozen (the mapping is architecture, not configuration)", () => {
    expect(Object.isFrozen(REQUIREMENTS_BY_PROFILE)).toBe(true);
  });

  it("is monotone: required dimensions only grow with depth", () => {
    for (let index = 1; index < PROFILES.length; index += 1) {
      const lower = new Set(
        REQUIREMENTS_BY_PROFILE[PROFILES[index - 1]!].filter((requirement) => requirement.required).map((requirement) => requirement.dimension),
      );
      const higher = new Set(
        REQUIREMENTS_BY_PROFILE[PROFILES[index]!].filter((requirement) => requirement.required).map((requirement) => requirement.dimension),
      );
      for (const dimension of lower) {
        expect(higher.has(dimension)).toBe(true);
      }
    }
  });

  it("tightens coverage monotonically (0.25 → 0.6 → 1.0)", () => {
    expect(requirementsFor("STANDARD", "evidence-coverage").minCoverageRatio).toBe(0.25);
    expect(requirementsFor("HIGH_ASSURANCE", "evidence-coverage").minCoverageRatio).toBe(0.6);
    expect(requirementsFor("CRITICAL", "evidence-coverage").minCoverageRatio).toBe(1);
  });

  it("model-integrity is required at every profile", () => {
    for (const profile of PROFILES) {
      expect(requirementsFor(profile, "model-integrity").required).toBe(true);
    }
  });

  it("measurement-uncertainty requirements grow with depth", () => {
    expect(requirementsFor("LIGHT", "measurement-uncertainty").required).toBe(false);
    expect(requirementsFor("STANDARD", "measurement-uncertainty").required).toBe(false);
    expect(requirementsFor("HIGH_ASSURANCE", "measurement-uncertainty").uncertaintyOnAllMeasurements).toBe(true);
    expect(requirementsFor("HIGH_ASSURANCE", "measurement-uncertainty").requireAtLeastOneMeasurement).toBeUndefined();
    expect(requirementsFor("CRITICAL", "measurement-uncertainty").requireAtLeastOneMeasurement).toBe(true);
  });

  it("PROPOSED content is rejected only at CRITICAL", () => {
    expect(requirementsFor("STANDARD", "epistemic-composition").required).toBe(false);
    expect(requirementsFor("HIGH_ASSURANCE", "epistemic-composition").required).toBe(false);
    expect(requirementsFor("CRITICAL", "epistemic-composition").zeroProposedContent).toBe(true);
  });

  it("confirmed-validity is required from STANDARD up", () => {
    expect(requirementsFor("LIGHT", "confirmed-validity").required).toBe(false);
    expect(requirementsFor("STANDARD", "confirmed-validity").zeroInvalidatedConfirmed).toBe(true);
    expect(requirementsFor("CRITICAL", "confirmed-validity").zeroInvalidatedConfirmed).toBe(true);
  });

  it("returns an advisory fallback for absent dimensions (never undefined)", () => {
    const requirement = requirementsFor("LIGHT", "epistemic-composition");
    expect(requirement).toBeDefined();
    expect(requirement.required).toBe(false);
    expect(requirement.dimension).toBe("epistemic-composition");
  });

  it("the dimension list is frozen, ordered, and complete", () => {
    expect(READINESS_DIMENSIONS).toEqual([
      "model-integrity",
      "evidence-coverage",
      "measurement-uncertainty",
      "confirmed-validity",
      "epistemic-composition",
      "uncertainty-budget",
    ]);
    expect(Object.isFrozen(READINESS_DIMENSIONS)).toBe(true);
  });
});

describe("budget helpers", () => {
  it("budgetForFamily resolves per family in SI units", () => {
    const budget = { lengthM: 0.05, angleRad: 0.01 };
    expect(budgetForFamily(budget, "length")).toEqual({ bound: 0.05, unit: "meter" });
    expect(budgetForFamily(budget, "angle")).toEqual({ bound: 0.01, unit: "radian" });
    expect(budgetForFamily(budget, "area")).toBeUndefined();
    expect(budgetForFamily(undefined, "length")).toBeUndefined();
  });

  it("standardEquivalent converts honestly per uncertainty kind", () => {
    expect(standardEquivalent({ kind: "standard", u: 0.005 })).toBe(0.005);
    expect(standardEquivalent({ kind: "expanded", U: 0.01, coverageFactor: 2 })).toBe(0.005);
    // Tolerance is a specification bound — NEVER converted.
    expect(standardEquivalent({ kind: "tolerance", lowerOffset: -0.01, upperOffset: 0.01 })).toBeUndefined();
  });
});
