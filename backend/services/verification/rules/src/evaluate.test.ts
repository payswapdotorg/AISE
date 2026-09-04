/**
 * The AISE-021 evaluator suite: the deterministic gating ladder
 * and the uncertainty-aware interval comparison.
 *
 * Proves the Work Order's acceptance criteria at the evaluator:
 *
 * - **deterministic rule evaluation** — identical inputs,
 *   bit-identical results; canonical rule order;
 * - **uncertainty-aware tolerances** — the straddle cases: an
 *   interval overlapping the bound is UNKNOWN, never a lucky
 *   PASS; intervals entirely inside/outside decide PASS/FAIL;
 *   tolerance-kind uncertainty is used as its own interval
 *   (never converted to a distribution);
 * - **evidence/readiness gating** — support, status floors and
 *   the readiness gate codes, per the fixed monotone tables;
 * - **fail-closed critical behavior** — every gate refuses to
 *   pass silently at the depth that requires it.
 */
import { describe, expect, it } from "vitest";
import { propertyAssertion } from "@aise/engineering-model";
import type { EpistemicState, PropertyAssertion } from "@aise/engineering-model";
import { isRulesError, type RulesError } from "./errors.js";
import { ruleSet } from "./rule.js";
import { runRuleEvaluation } from "./runtime.js";
import {
  MODEL,
  PROJECT,
  SPACE,
  WALL_ID,
  mappingWith,
  measurementEvidence,
  roomHeight,
  smallGraph,
  subjects,
} from "./testing.js";

/** Builds a CONFIRMED measurement assertion citing its evidence (the review discipline). */
function confirmedHeight(
  value: number,
  evidenceId: string,
  overrides: { u?: number } = {},
): PropertyAssertion {
  return roomHeight({
    quantity: { value, unit: "meter", uncertainty: { kind: "standard", u: overrides.u ?? 0.005 } },
    status: "CONFIRMED",
    kind: "measurement",
    method: "review/confirm-v1",
    evidenceRefs: [evidenceId],
    verifiedBy: "user:test-reviewer",
    verifiedAt: "2026-09-03T12:00:00Z",
  });
}

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

/** A minimal dimension rule set (LIGHT — no gates beyond the ladder). */
function dimensionSet(options: {
  rulesetId?: string;
  profile?: "LIGHT" | "STANDARD" | "HIGH_ASSURANCE" | "CRITICAL";
  operator?: "MINIMUM" | "MAXIMUM" | "EXACT";
  boundValue?: number;
  boundUnit?: string;
  margin?: number;
} = {}) {
  return ruleSet({
    rulesetId: options.rulesetId ?? "set-dim",
    profile: options.profile ?? "LIGHT",
    ...(options.profile === "CRITICAL" ? { readinessGate: { profile: "CRITICAL" } } : {}),
    rules: [
      {
        ruleId: "rule-room-height",
        kind: "DIMENSION" as const,
        subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "roomHeight" },
        operator: options.operator ?? "MINIMUM",
        bound: { value: options.boundValue ?? 2.5, unit: (options.boundUnit ?? "meter") as never },
        ...(options.margin !== undefined ? { margin: options.margin } : {}),
      },
    ],
  });
}

/** A minimal specification rule set. */
function specSet(options: {
  profile?: "LIGHT" | "STANDARD" | "HIGH_ASSURANCE" | "CRITICAL";
  requiredStatus?: EpistemicState;
  requireMeasurement?: boolean;
} = {}) {
  return ruleSet({
    rulesetId: "set-spec",
    profile: options.profile ?? "LIGHT",
    ...(options.profile === "CRITICAL" ? { readinessGate: { profile: "CRITICAL" } } : {}),
    rules: [
      {
        ruleId: "rule-room-height-recorded",
        kind: "SPECIFICATION" as const,
        subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "roomHeight" },
        requiredStatus: options.requiredStatus ?? "INFERRED",
        ...(options.requireMeasurement !== undefined ? { requireMeasurement: options.requireMeasurement } : {}),
      },
    ],
  });
}

describe("deterministic evaluation", () => {
  it("identical inputs produce bit-identical reports (replay)", () => {
    const graph = smallGraph();
    const ruleset = dimensionSet();
    const a = runRuleEvaluation({ graph, version: 1, profile: "LIGHT", ruleset });
    const b = runRuleEvaluation({ graph, version: 1, profile: "LIGHT", ruleset });
    expect(a).toEqual(b);
    expect(a.digest).toBe(b.digest);
    expect(a.reportId).toBe(b.reportId);
  });

  it("reports carry no timestamps (the digest path is clock-free)", () => {
    const report = runRuleEvaluation({
      graph: smallGraph(),
      version: 1,
      profile: "LIGHT",
      ruleset: dimensionSet(),
    });
    expect(JSON.stringify(report)).not.toMatch(/assessedAt|timestamp|Date/);
  });

  it("the run profile is recorded on the report (AC-110)", () => {
    for (const profile of ["LIGHT", "STANDARD", "HIGH_ASSURANCE", "CRITICAL"] as const) {
      const ruleset = dimensionSet({ profile });
      const report = runRuleEvaluation({
        graph: smallGraph(),
        version: 1,
        profile,
        ruleset,
      });
      expect(report.profile).toBe(profile);
    }
  });
});

describe("uncertainty-aware tolerances (the interval comparison)", () => {
  // roomHeight = 3.0 m, INFERRED estimate, no uncertainty stated.
  // A CONFIRMED measurement variant carries standard u = 0.005.

  it("a point value (no uncertainty stated) compares deterministically at LIGHT", () => {
    const report = runRuleEvaluation({
      graph: smallGraph(),
      version: 1,
      profile: "LIGHT",
      ruleset: dimensionSet({ boundValue: 2.5 }),
    });
    expect(report.outcome).toBe("PASS");
    expect(report.results[0]!.outcome).toBe("PASS");
  });

  it("a value clearly below a MINIMUM bound FAILs affirmatively", () => {
    const report = runRuleEvaluation({
      graph: smallGraph(),
      version: 1,
      profile: "LIGHT",
      ruleset: dimensionSet({ boundValue: 3.5 }),
    });
    expect(report.outcome).toBe("FAIL");
    expect(report.results[0]!.outcome).toBe("FAIL");
    expect(report.results[0]!.code).toBe("RULE_NOT_SATISFIED");
  });

  it("an uncertainty interval entirely inside the region PASSes (with support at depth)", () => {
    // CONFIRMED measurement 3.0 ± 0.005 m; bound 2.5 m.
    const evidence = measurementEvidence(3.0);
    const graph = smallGraph({
      roomHeight: confirmedHeight(3.0, evidence.evidenceId),
    });
    const mapping = mappingWith([evidence], [
      { subject: subjects(1).roomHeight, evidenceId: evidence.evidenceId },
    ]);
    const report = runRuleEvaluation({
      graph,
      version: 1,
      profile: "CRITICAL",
      ruleset: dimensionSet({ profile: "CRITICAL" }),
      mapping,
      readiness: readinessFor(graph, mapping, "CRITICAL"),
    });
    expect(report.outcome).toBe("PASS");
    expect(report.results[0]!.outcome).toBe("PASS");
    expect(report.results[0]!.evidenceRefs).toContain(evidence.evidenceId);
  });

  it("an uncertainty interval entirely outside the region FAILs affirmatively", () => {
    // Interval [2.695, 2.705] entirely below a 2.71 m minimum.
    const evidence = measurementEvidence(2.7);
    const graph = smallGraph({
      roomHeight: confirmedHeight(2.7, evidence.evidenceId),
    });
    const mapping = mappingWith([evidence], [
      { subject: subjects(1).roomHeight, evidenceId: evidence.evidenceId },
    ]);
    const report = runRuleEvaluation({
      graph,
      version: 1,
      profile: "CRITICAL",
      ruleset: dimensionSet({ profile: "CRITICAL", boundValue: 2.71 }),
      mapping,
      readiness: readinessFor(graph, mapping, "CRITICAL"),
    });
    expect(report.outcome).toBe("FAIL");
    expect(report.results[0]!.code).toBe("RULE_NOT_SATISFIED");
  });

  it("THE STRADDLE CASE: an uncertainty band overlapping the bound is UNKNOWN, never a lucky PASS", () => {
    // Interval [2.695, 2.705] vs a 2.70 m minimum: overlap.
    const evidence = measurementEvidence(2.7);
    const graph = smallGraph({
      roomHeight: confirmedHeight(2.7, evidence.evidenceId),
    });
    const mapping = mappingWith([evidence], [
      { subject: subjects(1).roomHeight, evidenceId: evidence.evidenceId },
    ]);
    const report = runRuleEvaluation({
      graph,
      version: 1,
      profile: "CRITICAL",
      ruleset: dimensionSet({ profile: "CRITICAL", boundValue: 2.7 }),
      mapping,
      readiness: readinessFor(graph, mapping, "CRITICAL"),
    });
    expect(report.outcome).toBe("UNKNOWN");
    expect(report.results[0]!.outcome).toBe("UNKNOWN");
    expect(report.results[0]!.code).toBe("RULE_INDETERMINATE");
    expect(report.results[0]!.detail).toContain("straddles");
  });

  it("a margin (spec-side tolerance) widens the compliant region", () => {
    // Value 2.48, bound 2.5: FAIL without margin; PASS with 0.05
    // (threshold 2.45).
    const graph = smallGraph({
      roomHeight: roomHeight({ quantity: { value: 2.48, unit: "meter" } }),
    });
    const report = runRuleEvaluation({
      graph,
      version: 1,
      profile: "LIGHT",
      ruleset: dimensionSet({ boundValue: 2.5, margin: 0.05 }),
    });
    expect(report.outcome).toBe("PASS");
    // Without the margin: FAIL.
    const strict = runRuleEvaluation({
      graph,
      version: 1,
      profile: "LIGHT",
      ruleset: dimensionSet({ boundValue: 2.5 }),
    });
    expect(strict.outcome).toBe("FAIL");
  });

  it("expanded uncertainty uses its own interval (U, not U/k — never a distribution invention)", () => {
    // 3.0 with expanded U=0.02, k=2 → interval [2.98, 3.02] vs 2.95 → PASS.
    const evidence = measurementEvidence(3.0);
    const graph = smallGraph({
      roomHeight: roomHeight({
        quantity: { value: 3.0, unit: "meter", uncertainty: { kind: "expanded", U: 0.02, coverageFactor: 2 } },
        status: "CONFIRMED",
        kind: "measurement",
        method: "review/confirm-v1",
        evidenceRefs: [evidence.evidenceId],
        verifiedBy: "user:test-reviewer",
        verifiedAt: "2026-09-03T12:00:00Z",
      }),
    });
    const mapping = mappingWith([evidence], [
      { subject: subjects(1).roomHeight, evidenceId: evidence.evidenceId },
    ]);
    const report = runRuleEvaluation({
      graph,
      version: 1,
      profile: "CRITICAL",
      ruleset: dimensionSet({ profile: "CRITICAL", boundValue: 2.95 }),
      mapping,
      readiness: readinessFor(graph, mapping, "CRITICAL"),
    });
    expect(report.outcome).toBe("PASS");
  });

  it("tolerance-kind uncertainty is its own interval (the spec range; never converted)", () => {
    // 3.0 with tolerance [−0.05, +0.05] → interval [2.95, 3.05].
    // Bound 2.96 → overlap → UNKNOWN (the honest straddle).
    const evidence = measurementEvidence(3.0);
    const graph = smallGraph({
      roomHeight: roomHeight({
        quantity: { value: 3.0, unit: "meter", uncertainty: { kind: "tolerance", lowerOffset: -0.05, upperOffset: 0.05 } },
        status: "CONFIRMED",
        kind: "measurement",
        method: "review/confirm-v1",
        evidenceRefs: [evidence.evidenceId],
        verifiedBy: "user:test-reviewer",
        verifiedAt: "2026-09-03T12:00:00Z",
      }),
    });
    const mapping = mappingWith([evidence], [
      { subject: subjects(1).roomHeight, evidenceId: evidence.evidenceId },
    ]);
    const overlap = runRuleEvaluation({
      graph,
      version: 1,
      profile: "CRITICAL",
      ruleset: dimensionSet({ profile: "CRITICAL", boundValue: 2.96 }),
      mapping,
      readiness: readinessFor(graph, mapping, "CRITICAL"),
    });
    expect(overlap.results[0]!.outcome).toBe("UNKNOWN");
    expect(overlap.results[0]!.code).toBe("RULE_INDETERMINATE");
    // Clearly inside: PASS.
    const inside = runRuleEvaluation({
      graph,
      version: 1,
      profile: "CRITICAL",
      ruleset: dimensionSet({ profile: "CRITICAL", boundValue: 2.9 }),
      mapping,
      readiness: readinessFor(graph, mapping, "CRITICAL"),
    });
    expect(inside.results[0]!.outcome).toBe("PASS");
  });

  it("unit families are bridged exactly through SI (bound in mm, value in m)", () => {
    // Bound 2500 mm = 2.5 m; value 3.0 m → PASS at LIGHT.
    const report = runRuleEvaluation({
      graph: smallGraph(),
      version: 1,
      profile: "LIGHT",
      ruleset: dimensionSet({ boundValue: 2500, boundUnit: "millimeter" }),
    });
    expect(report.outcome).toBe("PASS");
  });

  it("cross-family units (length vs angle) are an honest UNKNOWN, never a silent comparison", () => {
    const report = runRuleEvaluation({
      graph: smallGraph(),
      version: 1,
      profile: "LIGHT",
      ruleset: dimensionSet({ boundValue: 1.5, boundUnit: "radian" }),
    });
    expect(report.results[0]!.outcome).toBe("UNKNOWN");
    expect(report.results[0]!.code).toBe("RULE_QUANTITY_FAMILY_MISMATCH");
  });

  it("MAXIMUM and EXACT operators decide on the same interval discipline", () => {
    const graph = smallGraph();
    // MAXIMUM: 3.0 ≤ 3.5 → PASS; 3.0 ≤ 2.5 → FAIL.
    expect(
      runRuleEvaluation({ graph, version: 1, profile: "LIGHT", ruleset: dimensionSet({ operator: "MAXIMUM", boundValue: 3.5 }) }).outcome,
    ).toBe("PASS");
    expect(
      runRuleEvaluation({ graph, version: 1, profile: "LIGHT", ruleset: dimensionSet({ operator: "MAXIMUM", boundValue: 2.5 }) }).outcome,
    ).toBe("FAIL");
    // EXACT with margin: |3.0 − 3.0| ≤ 0.1 → PASS; |3.0 − 2.7| ≤ 0.1 → FAIL.
    expect(
      runRuleEvaluation({ graph, version: 1, profile: "LIGHT", ruleset: dimensionSet({ operator: "EXACT", boundValue: 3.0, margin: 0.1 }) }).outcome,
    ).toBe("PASS");
    expect(
      runRuleEvaluation({ graph, version: 1, profile: "LIGHT", ruleset: dimensionSet({ operator: "EXACT", boundValue: 2.7, margin: 0.1 }) }).outcome,
    ).toBe("FAIL");
  });
});

describe("evidence gating (AC-111: gaps cause explicit UNKNOWN)", () => {
  it("at LIGHT an unsupported value still evaluates (advisory depth)", () => {
    const report = runRuleEvaluation({
      graph: smallGraph(),
      version: 1,
      profile: "LIGHT",
      ruleset: dimensionSet(),
    });
    expect(report.results[0]!.outcome).toBe("PASS");
  });

  it("at HIGH_ASSURANCE an unsupported value is UNKNOWN (RULE_NO_EVIDENCE_SUPPORT)", () => {
    // OBSERVED + uncertainty so the ladder reaches the evidence
    // gate (not the status/uncertainty gates).
    const graph = smallGraph({
      roomHeight: roomHeight({
        quantity: { value: 3.0, unit: "meter", uncertainty: { kind: "standard", u: 0.005 } },
        status: "OBSERVED",
        kind: "measurement",
      }),
    });
    const report = runRuleEvaluation({
      graph,
      version: 1,
      profile: "HIGH_ASSURANCE",
      ruleset: dimensionSet({ profile: "HIGH_ASSURANCE" }),
    });
    expect(report.outcome).toBe("UNKNOWN");
    expect(report.results[0]!.code).toBe("RULE_NO_EVIDENCE_SUPPORT");
  });

  it("no mapping at all at HIGH_ASSURANCE is the same honest UNKNOWN", () => {
    const graph = smallGraph({
      roomHeight: roomHeight({
        quantity: { value: 3.0, unit: "meter", uncertainty: { kind: "standard", u: 0.005 } },
        status: "OBSERVED",
        kind: "measurement",
      }),
    });
    const report = runRuleEvaluation({
      graph,
      version: 1,
      profile: "HIGH_ASSURANCE",
      ruleset: dimensionSet({ profile: "HIGH_ASSURANCE" }),
    });
    expect(report.results[0]!.code).toBe("RULE_NO_EVIDENCE_SUPPORT");
    expect(report.results[0]!.detail).toContain("no evidence mapping");
  });

  it("supported value with uncertainty and OBSERVED status PASSES at HIGH_ASSURANCE", () => {
    const graph = smallGraph({
      roomHeight: roomHeight({
        quantity: { value: 3.0, unit: "meter", uncertainty: { kind: "standard", u: 0.005 } },
        status: "OBSERVED",
        kind: "measurement",
      }),
    });
    const evidence = measurementEvidence(3.0);
    const mapping = mappingWith([evidence], [
      { subject: subjects(1).roomHeight, evidenceId: evidence.evidenceId },
    ]);
    const report = runRuleEvaluation({
      graph,
      version: 1,
      profile: "HIGH_ASSURANCE",
      ruleset: dimensionSet({ profile: "HIGH_ASSURANCE" }),
      mapping,
    });
    expect(report.outcome).toBe("PASS");
  });
});

describe("epistemic status floors (the fixed monotone table)", () => {
  it("PROPOSED never establishes a rule subject (any profile)", () => {
    const graph = smallGraph({
      roomHeight: roomHeight({ status: "PROPOSED" }),
    });
    for (const profile of ["LIGHT", "STANDARD"] as const) {
      const report = runRuleEvaluation({
        graph,
        version: 1,
        profile,
        ruleset: dimensionSet({ profile }),
      });
      expect(report.results[0]!.code, `profile ${profile}`).toBe("RULE_SUBJECT_NOT_ESTABLISHED");
    }
  });

  it("INFERRED establishes at LIGHT/STANDARD but not at HIGH_ASSURANCE/CRITICAL", () => {
    const graph = smallGraph(); // roomHeight INFERRED
    expect(
      runRuleEvaluation({ graph, version: 1, profile: "STANDARD", ruleset: dimensionSet({ profile: "STANDARD" }) }).results[0]!.outcome,
    ).toBe("PASS");
    const high = runRuleEvaluation({
      graph,
      version: 1,
      profile: "HIGH_ASSURANCE",
      ruleset: dimensionSet({ profile: "HIGH_ASSURANCE" }),
    });
    expect(high.results[0]!.code).toBe("RULE_SUBJECT_NOT_ESTABLISHED");
    // With a mapping so the evidence gate would otherwise pass:
    const evidence = measurementEvidence(3.0);
    const mapping = mappingWith([evidence], [
      { subject: subjects(1).roomHeight, evidenceId: evidence.evidenceId },
    ]);
    const critical = runRuleEvaluation({
      graph,
      version: 1,
      profile: "CRITICAL",
      ruleset: dimensionSet({ profile: "CRITICAL" }),
      mapping,
      readiness: readinessFor(graph, mapping, "CRITICAL"),
    });
    expect(critical.results[0]!.code).toBe("RULE_SUBJECT_NOT_ESTABLISHED");
    expect(critical.results[0]!.epistemic?.assertionStatus).toBe("INFERRED");
  });

  it("OBSERVED establishes at HIGH_ASSURANCE but not at CRITICAL", () => {
    const graph = smallGraph({
      roomHeight: roomHeight({
        quantity: { value: 3.0, unit: "meter", uncertainty: { kind: "standard", u: 0.005 } },
        status: "OBSERVED",
        kind: "measurement",
      }),
    });
    const evidence = measurementEvidence(3.0);
    const mapping = mappingWith([evidence], [
      { subject: subjects(1).roomHeight, evidenceId: evidence.evidenceId },
    ]);
    expect(
      runRuleEvaluation({ graph, version: 1, profile: "HIGH_ASSURANCE", ruleset: dimensionSet({ profile: "HIGH_ASSURANCE" }), mapping })
        .results[0]!.outcome,
    ).toBe("PASS");
    const critical = runRuleEvaluation({
      graph,
      version: 1,
      profile: "CRITICAL",
      ruleset: dimensionSet({ profile: "CRITICAL" }),
      mapping,
      readiness: readinessFor(graph, mapping, "CRITICAL"),
    });
    expect(critical.results[0]!.code).toBe("RULE_SUBJECT_NOT_ESTABLISHED");
  });
});

describe("the uncertainty-required gate", () => {
  it("at HIGH_ASSURANCE an unstated uncertainty is UNKNOWN (absent means not stated, never zero)", () => {
    const graph = smallGraph({
      roomHeight: roomHeight({ status: "OBSERVED", kind: "measurement" }),
    });
    const evidence = measurementEvidence(3.0);
    const mapping = mappingWith([evidence], [
      { subject: subjects(1).roomHeight, evidenceId: evidence.evidenceId },
    ]);
    const report = runRuleEvaluation({
      graph,
      version: 1,
      profile: "HIGH_ASSURANCE",
      ruleset: dimensionSet({ profile: "HIGH_ASSURANCE" }),
      mapping,
    });
    expect(report.results[0]!.code).toBe("RULE_UNCERTAINTY_NOT_STATED");
  });
});

describe("subject resolution (absence is not compliance — architecture §2.9)", () => {
  it("an unasserted property is UNKNOWN (RULE_SUBJECT_NOT_ASSERTED), never PASS", () => {
    const ruleset = ruleSet({
      rulesetId: "set-absent",
      profile: "LIGHT",
      rules: [
        {
          ruleId: "rule-missing",
          kind: "DIMENSION" as const,
          subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "fireRating" },
          operator: "MINIMUM" as const,
          bound: { value: 60, unit: "meter" as never },
        },
      ],
    });
    const report = runRuleEvaluation({
      graph: smallGraph(),
      version: 1,
      profile: "LIGHT",
      ruleset,
    });
    expect(report.outcome).toBe("UNKNOWN");
    expect(report.results[0]!.code).toBe("RULE_SUBJECT_NOT_ASSERTED");
  });

  it("a presence-only assertion cannot satisfy a dimension rule", () => {
    const graph = smallGraph({
      roomHeight: propertyAssertion({
        key: "roomHeight",
        presence: "NOT_OBSERVED",
        status: "OBSERVED",
      }),
    });
    const report = runRuleEvaluation({
      graph,
      version: 1,
      profile: "LIGHT",
      ruleset: dimensionSet(),
    });
    expect(report.results[0]!.code).toBe("RULE_SUBJECT_NOT_QUANTITATIVE");
  });
});

describe("specification rules", () => {
  it("an asserted property at the required status PASSes; below FAILs (RULE_SPEC_NOT_MET)", () => {
    const graph = smallGraph(); // INFERRED
    const pass = runRuleEvaluation({
      graph,
      version: 1,
      profile: "LIGHT",
      ruleset: specSet({ requiredStatus: "INFERRED" }),
    });
    expect(pass.outcome).toBe("PASS");
    const fail = runRuleEvaluation({
      graph,
      version: 1,
      profile: "LIGHT",
      ruleset: specSet({ requiredStatus: "CONFIRMED" }),
    });
    expect(fail.outcome).toBe("FAIL");
    expect(fail.results[0]!.code).toBe("RULE_SPEC_NOT_MET");
    expect(fail.results[0]!.expected).toContain("CONFIRMED");
  });

  it("an absent property is UNKNOWN (the spec demands it be recorded)", () => {
    const ruleset = ruleSet({
      rulesetId: "set-spec-absent",
      profile: "LIGHT",
      rules: [
        {
          ruleId: "rule-fire-rating",
          kind: "SPECIFICATION" as const,
          subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "fireRating" },
          requiredStatus: "OBSERVED" as EpistemicState,
        },
      ],
    });
    const report = runRuleEvaluation({
      graph: smallGraph(),
      version: 1,
      profile: "LIGHT",
      ruleset,
    });
    expect(report.results[0]!.code).toBe("RULE_SUBJECT_NOT_ASSERTED");
  });

  it("requireMeasurement FAILs an estimate (the spec demands a direct measurement)", () => {
    const graph = smallGraph(); // estimate
    const report = runRuleEvaluation({
      graph,
      version: 1,
      profile: "LIGHT",
      ruleset: specSet({ requiredStatus: "INFERRED", requireMeasurement: true }),
    });
    expect(report.outcome).toBe("FAIL");
    expect(report.results[0]!.code).toBe("RULE_SPEC_NOT_MET");
    expect(report.results[0]!.detail).toContain("measurement");
  });

  it("the profile floor strengthens a weaker rule floor (the effective floor is the max)", () => {
    // Rule demands INFERRED, but CRITICAL's floor is CONFIRMED:
    // the INFERRED assertion must not satisfy the spec at CRITICAL.
    const graph = smallGraph();
    const evidence = measurementEvidence(3.0);
    const mapping = mappingWith([evidence], [
      { subject: subjects(1).roomHeight, evidenceId: evidence.evidenceId },
    ]);
    const report = runRuleEvaluation({
      graph,
      version: 1,
      profile: "CRITICAL",
      ruleset: specSet({ profile: "CRITICAL", requiredStatus: "INFERRED" }),
      mapping,
      readiness: readinessFor(graph, mapping, "CRITICAL"),
    });
    expect(report.outcome).toBe("FAIL");
    expect(report.results[0]!.code).toBe("RULE_SPEC_NOT_MET");
  });
});

describe("the readiness gate (fail-closed critical composition)", () => {
  function criticalMapping() {
    const evidence = measurementEvidence(3.0);
    return mappingWith([evidence], [
      { subject: subjects(1).roomHeight, evidenceId: evidence.evidenceId },
    ]);
  }

  // The CONFIRMED measurement cites the same deterministic
  // evidence identity the mapping links (measurementEvidence is
  // deterministic — same inputs, same evidenceId).
  const measuredGraph = smallGraph({
    roomHeight: confirmedHeight(3.0, measurementEvidence(3.0).evidenceId),
  });

  it("a satisfied gate lets the evaluation proceed to PASS", () => {
    const mapping = criticalMapping();
    const report = runRuleEvaluation({
      graph: measuredGraph,
      version: 1,
      profile: "CRITICAL",
      ruleset: dimensionSet({ profile: "CRITICAL" }),
      mapping,
      readiness: readinessFor(measuredGraph, mapping, "CRITICAL"),
    });
    expect(report.outcome).toBe("PASS");
    expect(report.readiness?.verdict).toBe("READY");
  });

  it("a declared gate with NO readiness context is UNKNOWN for every rule (RULE_READINESS_MISSING)", () => {
    const report = runRuleEvaluation({
      graph: measuredGraph,
      version: 1,
      profile: "CRITICAL",
      ruleset: dimensionSet({ profile: "CRITICAL" }),
      mapping: criticalMapping(),
    });
    expect(report.outcome).toBe("UNKNOWN");
    expect(report.results[0]!.code).toBe("RULE_READINESS_MISSING");
  });

  it("a NOT_READY verdict is RULE_READINESS_NOT_READY (compliance is not evaluated past the gate)", () => {
    const mapping = criticalMapping();
    const report = runRuleEvaluation({
      graph: measuredGraph,
      version: 1,
      profile: "CRITICAL",
      ruleset: dimensionSet({ profile: "CRITICAL" }),
      mapping,
      readiness: { ...readinessFor(measuredGraph, mapping, "CRITICAL"), verdict: "NOT_READY" as const },
    });
    expect(report.outcome).toBe("UNKNOWN");
    expect(report.results[0]!.code).toBe("RULE_READINESS_NOT_READY");
  });

  it("a readiness context pinning OTHER content is RULE_READINESS_STALE", () => {
    const mapping = criticalMapping();
    const stale = readinessFor(measuredGraph, mapping, "CRITICAL");
    const otherMapping = mappingWith([measurementEvidence(2.7)], [
      { subject: subjects(1).roomHeight, evidenceId: measurementEvidence(2.7).evidenceId },
    ]);
    const report = runRuleEvaluation({
      graph: measuredGraph,
      version: 1,
      profile: "CRITICAL",
      ruleset: dimensionSet({ profile: "CRITICAL" }),
      mapping,
      readiness: { ...stale, mappingDigest: otherMapping.digest },
    });
    expect(report.results[0]!.code).toBe("RULE_READINESS_STALE");
  });

  it("a READY verdict at a depth below the gate's profile is still NOT_READY-class", () => {
    const mapping = criticalMapping();
    const report = runRuleEvaluation({
      graph: measuredGraph,
      version: 1,
      profile: "CRITICAL",
      ruleset: ruleSet({
        rulesetId: "set-gate-depth",
        profile: "CRITICAL",
        readinessGate: { profile: "CRITICAL" },
        rules: [
          {
            ruleId: "rule-room-height",
            kind: "DIMENSION" as const,
            subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "roomHeight" },
            operator: "MINIMUM" as const,
            bound: { value: 2.5, unit: "meter" as never },
          },
        ],
      }),
      mapping,
      readiness: readinessFor(measuredGraph, mapping, "STANDARD"), // READY but shallow
    });
    expect(report.results[0]!.code).toBe("RULE_READINESS_NOT_READY");
  });
});

describe("report aggregation (FAIL > UNKNOWN > PASS, never a lucky aggregate)", () => {
  it("one FAIL makes the report FAIL even with PASSes", () => {
    const ruleset = ruleSet({
      rulesetId: "set-mixed-fail",
      profile: "LIGHT",
      rules: [
        {
          ruleId: "rule-pass",
          kind: "DIMENSION" as const,
          subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "roomHeight" },
          operator: "MINIMUM" as const,
          bound: { value: 2.5, unit: "meter" as never },
        },
        {
          ruleId: "rule-fail",
          kind: "DIMENSION" as const,
          subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "roomHeight" },
          operator: "MAXIMUM" as const,
          bound: { value: 2.5, unit: "meter" as never },
        },
      ],
    });
    const report = runRuleEvaluation({
      graph: smallGraph(),
      version: 1,
      profile: "LIGHT",
      ruleset,
    });
    expect(report.outcome).toBe("FAIL");
    expect(report.counts).toMatchObject({ total: 2, pass: 1, fail: 1, unknown: 0 });
  });

  it("one UNKNOWN makes the report UNKNOWN (no PASS with indeterminacy)", () => {
    const ruleset = ruleSet({
      rulesetId: "set-mixed-unknown",
      profile: "LIGHT",
      rules: [
        {
          ruleId: "rule-pass",
          kind: "DIMENSION" as const,
          subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "roomHeight" },
          operator: "MINIMUM" as const,
          bound: { value: 2.5, unit: "meter" as never },
        },
        {
          ruleId: "rule-unknown",
          kind: "DIMENSION" as const,
          subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "fireRating" },
          operator: "MINIMUM" as const,
          bound: { value: 60, unit: "meter" as never },
        },
      ],
    });
    const report = runRuleEvaluation({
      graph: smallGraph(),
      version: 1,
      profile: "LIGHT",
      ruleset,
    });
    expect(report.outcome).toBe("UNKNOWN");
    expect(report.counts).toMatchObject({ total: 2, pass: 1, fail: 0, unknown: 1 });
  });
});

describe("no silent downgrade (run profile vs ruleset profile)", () => {
  it("a run below the rule set's profile is refused at the boundary", () => {
    const ruleset = dimensionSet({ profile: "CRITICAL" });
    const error = capture(() =>
      runRuleEvaluation({ graph: smallGraph(), version: 1, profile: "LIGHT", ruleset }),
    );
    expect(error?.code).toBe("RULES_INPUT_INVALID");
    expect(error?.message).toContain("below the rule set's declared profile");
  });

  it("a run at or above the rule set's profile is accepted", () => {
    const ruleset = dimensionSet({ profile: "STANDARD" });
    expect(() =>
      runRuleEvaluation({ graph: smallGraph(), version: 1, profile: "STANDARD", ruleset }),
    ).not.toThrow();
    expect(() =>
      runRuleEvaluation({ graph: smallGraph(), version: 1, profile: "CRITICAL", ruleset }),
    ).not.toThrow();
  });
});

/** Builds a satisfied readiness context for a graph+mapping pair. */
function readinessFor(
  graph: Parameters<typeof runRuleEvaluation>[0]["graph"],
  mapping: Parameters<typeof runRuleEvaluation>[0]["mapping"],
  profile: "STANDARD" | "HIGH_ASSURANCE" | "CRITICAL",
): {
  taskId: string;
  verdict: "READY" | "NOT_READY";
  assuranceProfile: "STANDARD" | "HIGH_ASSURANCE" | "CRITICAL";
  modelId: string;
  version: number;
  graphDigest: string;
  mappingDigest: string;
} {
  return {
    taskId: "task-test-rules",
    verdict: "READY",
    assuranceProfile: profile,
    modelId: graph.modelId,
    version: 1,
    graphDigest: graph.digest,
    mappingDigest: mapping!.digest,
  };
}

void MODEL;
void PROJECT;
void WALL_ID;
