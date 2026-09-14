/**
 * AISE-022 evaluator tests — dimension evaluators (each requirement kind:
 * satisfied / not_satisfied / insufficient_data with named bases), the
 * fail-closed aggregate, gap actionability, determinism and order
 * insensitivity (recomputability).
 */

import { describe, expect, test } from "bun:test";
import {
  AssuranceError,
  DIMENSIONAL_SURVEY_PROFILE,
  aggregateReadiness,
  evaluateReadiness,
  serializeReadinessReport,
  type AssuranceProfile,
  type DimensionOutcome,
  type Requirement,
} from "./index";
import { device, evidence, evaluate, gapOf, node, outcomeOf, prop, shuffled } from "./testkit";

/** One-dimension synthetic profile: the requirement under test, critical. */
function profileOf(requirement: Requirement, critical = true): AssuranceProfile {
  return {
    profileId: "test/profile",
    version: "assurance-1",
    taskKind: "dimensional_survey",
    dimensions: [
      { dimensionId: "d-under-test", description: "dimension under test", requirement, critical },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Dimension evaluators                                                */
/* ------------------------------------------------------------------ */

describe("evidence_sufficiency evaluation", () => {
  const profile = profileOf({ kind: "evidence_sufficiency", method: "DEPTH_SENSING", minCount: 2 });

  test("satisfied: 2 valid items with named count basis", () => {
    const report = evaluate(profile, [node("n1", [])], [
      evidence("e1", "DEPTH_SENSING"),
      evidence("e2", "DEPTH_SENSING"),
    ]);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("satisfied");
    expect(outcome.basis).toEqual({
      kind: "evidence_sufficiency",
      method: "DEPTH_SENSING",
      requiredCount: 2,
      validCount: 2,
      invalidCount: 0,
    });
  });

  test("not_satisfied: 1 valid of 2 — failure named with shortfall 1", () => {
    const report = evaluate(profile, [node("n1", [])], [evidence("e1", "DEPTH_SENSING")]);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("not_satisfied");
    expect(outcome.deficiency?.code).toBe("evidence_count_shortfall");
    expect(outcome.deficiency?.kind).toBe("measured_failure");
    expect(outcome.deficiency?.shortfall).toBe(1);
    expect(outcome.deficiency?.message).toContain("short by 1");
  });

  test("insufficient_data: no evidence recorded at all (nothing to count)", () => {
    const report = evaluate(profile, [node("n1", [])], []);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("insufficient_data");
    expect(outcome.deficiency?.code).toBe("no_evidence_recorded");
    expect(outcome.deficiency?.kind).toBe("unknown_data");
  });

  test("invalidated evidence is not counted (R7) and is named in the basis", () => {
    const report = evaluate(profile, [node("n1", [])], [
      evidence("e1", "DEPTH_SENSING", { invalidated: true }),
      evidence("e2", "DEPTH_SENSING", { invalidated: true }),
    ]);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("not_satisfied");
    expect(outcome.basis).toMatchObject({ validCount: 0, invalidCount: 2 });
    expect(outcome.deficiency?.message).toContain("2 invalidated items not counted");
  });

  test("evidence of other methods does not count toward the requirement", () => {
    const report = evaluate(profile, [node("n1", [])], [
      evidence("e1", "VISUAL_RECONSTRUCTION"),
      evidence("e2", "VIDEO_FOOTAGE"),
      evidence("e3", "STILL_IMAGERY"),
    ]);
    expect(outcomeOf(report, "d-under-test").basis).toMatchObject({ validCount: 0, invalidCount: 0 });
    expect(outcomeOf(report, "d-under-test").outcome).toBe("not_satisfied");
  });
});

describe("uncertainty_bound evaluation", () => {
  const profile = profileOf({ kind: "uncertainty_bound", propertyKey: "room.height", maxSigma: 0.02, unit: "m" });

  test("satisfied: sigma 0.01 <= 0.02 with named measured basis", () => {
    const report = evaluate(profile, [node("n1", [prop("room.height", 2.7, { unit: "m", sigma: 0.01 })])], []);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("satisfied");
    expect(outcome.basis).toEqual({
      kind: "uncertainty_bound",
      propertyKey: "room.height",
      requiredUnit: "m",
      assertionCount: 1,
      numericAssertionCount: 1,
      sigmaReportedCount: 1,
      unitConsistentCount: 1,
      maxMeasuredSigma: 0.01,
    });
  });

  test("not_satisfied: sigma 0.03 > 0.02 — failure names measured max, bound and overage", () => {
    const report = evaluate(profile, [node("n1", [prop("room.height", 2.7, { unit: "m", sigma: 0.03 })])], []);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("not_satisfied");
    expect(outcome.deficiency?.code).toBe("sigma_above_bound");
    expect(outcome.deficiency?.shortfall).toBeCloseTo(0.01, 12);
    expect(outcome.deficiency?.message).toContain("0.03");
    expect(outcome.deficiency?.message).toContain("0.02");
    expect(outcome.deficiency?.message).toContain("over by 0.01");
  });

  test("insufficient_data: property absent — sigma unknown, never assumed 0", () => {
    const report = evaluate(profile, [node("n1", [prop("element.material", "concrete")])], []);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("insufficient_data");
    expect(outcome.deficiency?.code).toBe("property_absent");
    expect(outcome.basis).toMatchObject({ assertionCount: 0, maxMeasuredSigma: null });
  });

  test("insufficient_data: property present but sigma not reported", () => {
    const report = evaluate(profile, [node("n1", [prop("room.height", 2.7, { unit: "m" })])], []);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("insufficient_data");
    expect(outcome.deficiency?.code).toBe("sigma_not_reported");
    expect(outcome.deficiency?.kind).toBe("unknown_data");
  });

  test("insufficient_data with a named issue: sigma-bearing property without a unit (units discipline)", () => {
    const report = evaluate(profile, [node("n1", [prop("room.height", 2.7, { sigma: 0.01 })])], []);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("insufficient_data");
    expect(outcome.deficiency?.code).toBe("sigma_unit_missing");
    expect(outcome.deficiency?.message).toContain("without a unit");
  });

  test("insufficient_data with a named issue: sigma reported in the wrong unit (no conversion authority)", () => {
    const report = evaluate(profile, [node("n1", [prop("room.height", 2.7, { unit: "cm", sigma: 2 })])], []);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("insufficient_data");
    expect(outcome.deficiency?.code).toBe("sigma_unit_mismatch");
    expect(outcome.deficiency?.message).toContain('"cm"');
  });

  test("worst assertion governs: max sigma across two nodes is measured", () => {
    const report = evaluate(
      profile,
      [
        node("n1", [prop("room.height", 2.7, { unit: "m", sigma: 0.01 })]),
        node("n2", [prop("room.height", 3.1, { unit: "m", sigma: 0.03 })]),
      ],
      [],
    );
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("not_satisfied");
    expect(outcome.basis).toMatchObject({ assertionCount: 2, maxMeasuredSigma: 0.03 });
  });

  test("non-numeric property value under an uncertainty bound is a measured failure", () => {
    const report = evaluate(profile, [node("n1", [prop("room.height", "tall")])], []);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("not_satisfied");
    expect(outcome.deficiency?.code).toBe("non_numeric_property");
  });
});

describe("coverage evaluation", () => {
  const profile = profileOf({ kind: "coverage", minCoverageFraction: 0.9 });

  function nodes(count: number): ReturnType<typeof node>[] {
    return Array.from({ length: count }, (_, i) => node(`n${i + 1}`, []));
  }

  test("satisfied at the exact boundary: 9 of 10 nodes covered = 0.9", () => {
    const report = evaluate(
      profile,
      nodes(10),
      [evidence("e1", "DEPTH_SENSING", { linkedNodeIds: ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9"] })],
    );
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("satisfied");
    expect(outcome.basis).toEqual({
      kind: "coverage",
      minCoverageFraction: 0.9,
      nodesTotal: 10,
      nodesCovered: 9,
      measuredCoverageFraction: 0.9,
    });
  });

  test("not_satisfied: 8 of 10 = 0.8 with named shortfall", () => {
    const report = evaluate(
      profile,
      nodes(10),
      [evidence("e1", "DEPTH_SENSING", { linkedNodeIds: ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"] })],
    );
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("not_satisfied");
    expect(outcome.deficiency?.code).toBe("coverage_shortfall");
    expect(outcome.deficiency?.shortfall).toBeCloseTo(0.1, 12);
    expect(outcome.deficiency?.message).toContain("0.8");
  });

  test("insufficient_data: no modeled nodes — coverage not measurable", () => {
    const report = evaluate(profile, [], [evidence("e1", "DEPTH_SENSING")]);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("insufficient_data");
    expect(outcome.deficiency?.code).toBe("no_modeled_nodes");
    expect(outcome.basis).toMatchObject({ nodesTotal: 0, measuredCoverageFraction: null });
  });

  test("a node linked ONLY by invalidated evidence is not covered", () => {
    const report = evaluate(
      profile,
      nodes(2),
      [
        evidence("e1", "DEPTH_SENSING", { linkedNodeIds: ["n1"] }),
        evidence("e2", "DEPTH_SENSING", { invalidated: true, linkedNodeIds: ["n2"] }),
      ],
    );
    expect(outcomeOf(report, "d-under-test").basis).toMatchObject({ nodesTotal: 2, nodesCovered: 1 });
    expect(outcomeOf(report, "d-under-test").outcome).toBe("not_satisfied");
  });
});

describe("epistemic_floor evaluation", () => {
  const profile = profileOf({
    kind: "epistemic_floor",
    minEpistemicStatus: "OBSERVED",
    propertyKeys: ["element.material", "element.condition"],
  });

  test("satisfied: both keys at >= OBSERVED with per-key measured bases", () => {
    const report = evaluate(
      profile,
      [
        node("n1", [
          prop("element.material", "concrete", { epistemicStatus: "OBSERVED" }),
          prop("element.condition", "good", { epistemicStatus: "CONFIRMED" }),
        ]),
      ],
      [],
    );
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("satisfied");
    expect(outcome.basis).toEqual({
      kind: "epistemic_floor",
      minEpistemicStatus: "OBSERVED",
      propertyKeys: ["element.material", "element.condition"],
      perKey: [
        { propertyKey: "element.material", assertionCount: 1, minMeasuredStatus: "OBSERVED" },
        { propertyKey: "element.condition", assertionCount: 1, minMeasuredStatus: "CONFIRMED" },
      ],
    });
  });

  test("not_satisfied: INFERRED below the OBSERVED floor — named with rank shortfall", () => {
    const report = evaluate(
      profile,
      [node("n1", [prop("element.material", "concrete", { epistemicStatus: "INFERRED" }), prop("element.condition", "good")])],
      [],
    );
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("not_satisfied");
    expect(outcome.deficiency?.code).toBe("epistemic_status_below_floor");
    expect(outcome.deficiency?.shortfall).toBe(1);
    expect(outcome.deficiency?.message).toContain("INFERRED");
  });

  test("not_satisfied: a listed property key is missing entirely (existence failure)", () => {
    const report = evaluate(profile, [node("n1", [prop("element.material", "concrete")])], []);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("not_satisfied");
    expect(outcome.deficiency?.code).toBe("missing_property");
    expect(outcome.deficiency?.message).toContain("element.condition");
  });

  test("CONFIRMED floor: OBSERVED does not pass (strict floor), shortfall 1", () => {
    const strictProfile = profileOf({
      kind: "epistemic_floor",
      minEpistemicStatus: "CONFIRMED",
      propertyKeys: ["room.height"],
    });
    const report = evaluate(strictProfile, [node("n1", [prop("room.height", 2.7, { epistemicStatus: "OBSERVED" })])], []);
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("not_satisfied");
    expect(outcome.deficiency?.code).toBe("epistemic_status_below_floor");
    expect(outcome.deficiency?.shortfall).toBe(1);
  });

  test("worst assertion governs: one PROPOSED assertion drags the key below the floor", () => {
    const report = evaluate(
      profile,
      [
        node("n1", [prop("element.material", "concrete", { epistemicStatus: "OBSERVED" }), prop("element.condition", "good")]),
        node("n2", [prop("element.material", "brick", { epistemicStatus: "PROPOSED" })]),
      ],
      [],
    );
    const outcome = outcomeOf(report, "d-under-test");
    expect(outcome.outcome).toBe("not_satisfied");
    expect(outcome.basis).toMatchObject({
      perKey: [
        { propertyKey: "element.material", assertionCount: 2, minMeasuredStatus: "PROPOSED" },
        { propertyKey: "element.condition", assertionCount: 1, minMeasuredStatus: "OBSERVED" },
      ],
    });
  });
});

/* ------------------------------------------------------------------ */
/* Aggregate (fail-closed) + shipped profile verdicts                  */
/* ------------------------------------------------------------------ */

/** Fully satisfying dimensional_survey fixture (3 nodes, 2 valid depth passes). */
function surveyReadyNodes(): ReturnType<typeof node>[] {
  return [
    node("space-1", [
      prop("room.height", 2.7, { unit: "m", sigma: 0.01 }),
      prop("room.width", 4.2, { unit: "m", sigma: 0.01 }),
      prop("element.material", "concrete"),
    ]),
    node("space-2", [
      prop("room.height", 3.1, { unit: "m", sigma: 0.015 }),
      prop("room.width", 3.0, { unit: "m", sigma: 0.015 }),
      prop("element.material", "brick"),
    ]),
  ];
}

function surveyEvidence(): ReturnType<typeof evidence>[] {
  return [
    evidence("ev-depth-1", "DEPTH_SENSING", { linkedNodeIds: ["space-1", "space-2"] }),
    evidence("ev-depth-2", "DEPTH_SENSING", { linkedNodeIds: ["space-1", "space-2"] }),
  ];
}

describe("multidimensional aggregate (fail-closed)", () => {
  test("all dimensions satisfied -> READY with zero gaps", () => {
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyReadyNodes(), surveyEvidence());
    expect(report.readiness).toBe("READY");
    expect(report.gaps).toHaveLength(0);
    expect(report.dimensions.every((dimension) => dimension.outcome === "satisfied")).toBe(true);
  });

  test("any critical not_satisfied -> NOT_READY even with everything else satisfied", () => {
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyReadyNodes(), [surveyEvidence()[0] as ReturnType<typeof evidence>]);
    expect(report.readiness).toBe("NOT_READY");
    expect(outcomeOf(report, "spatial-depth-evidence").outcome).toBe("not_satisfied");
  });

  test("any critical insufficient_data -> INSUFFICIENT_DATA (unknown is NEVER ready)", () => {
    const nodes = [
      node("space-1", [
        prop("room.width", 4.2, { unit: "m", sigma: 0.01 }),
        prop("element.material", "concrete"),
      ]),
      node("space-2", [
        prop("room.width", 3.0, { unit: "m", sigma: 0.015 }),
        prop("element.material", "brick"),
      ]),
    ];
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, nodes, surveyEvidence());
    expect(report.readiness).toBe("INSUFFICIENT_DATA");
    expect(outcomeOf(report, "room-height-uncertainty").outcome).toBe("insufficient_data");
    expect(outcomeOf(report, "room-height-uncertainty").deficiency?.code).toBe("property_absent");
  });

  test("all critical satisfied + a non-critical miss -> READY_WITH_NOTES (notes, never a lowered bar)", () => {
    const nodes = surveyReadyNodes().map((n) =>
      n.nodeId === "space-1"
        ? node(n.nodeId, n.properties.map((p) => (p.key === "element.material" ? prop("element.material", "concrete", { epistemicStatus: "INFERRED" }) : p)))
        : n,
    );
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, nodes, surveyEvidence());
    expect(report.readiness).toBe("READY_WITH_NOTES");
    expect(outcomeOf(report, "material-epistemic-floor").outcome).toBe("not_satisfied");
    expect(gapOf(report, "material-epistemic-floor")).toBeDefined();
  });

  test("measured failure dominates reporting: not_satisfied + insufficient criticals -> NOT_READY", () => {
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, [node("space-1", [])], [evidence("e1", "DEPTH_SENSING")]);
    expect(report.readiness).toBe("NOT_READY");
  });

  test("aggregateReadiness encodes the rule table directly", () => {
    const basis = { kind: "evidence_sufficiency" as const, method: "DEPTH_SENSING" as const, requiredCount: 1, validCount: 1, invalidCount: 0 };
    const mk = (id: string, critical: boolean, outcome: DimensionOutcome["outcome"]): DimensionOutcome => ({
      dimensionId: id,
      critical,
      outcome,
      basis,
    });
    expect(aggregateReadiness([mk("a", true, "satisfied"), mk("b", false, "satisfied")])).toBe("READY");
    expect(aggregateReadiness([mk("a", true, "satisfied"), mk("b", false, "not_satisfied")])).toBe("READY_WITH_NOTES");
    expect(aggregateReadiness([mk("a", true, "not_satisfied"), mk("b", true, "insufficient_data")])).toBe("NOT_READY");
    expect(aggregateReadiness([mk("a", true, "insufficient_data"), mk("b", false, "not_satisfied")])).toBe("INSUFFICIENT_DATA");
  });
});

/* ------------------------------------------------------------------ */
/* Fail-closed input handling                                          */
/* ------------------------------------------------------------------ */

describe("fail-closed input handling (never silently satisfied)", () => {
  test("an unknown requirement kind throws a typed invalid_profile error from evaluateReadiness", () => {
    const profile = {
      profileId: "test/bad",
      version: "assurance-1",
      taskKind: "dimensional_survey",
      dimensions: [{ dimensionId: "d", description: "x", critical: true, requirement: { kind: "mystery" } }],
    } as unknown as AssuranceProfile;
    expect(() => evaluateReadiness({ profile, graphSnapshot: { nodes: [] }, evidence: [] })).toThrow(AssuranceError);
    try {
      evaluateReadiness({ profile, graphSnapshot: { nodes: [] }, evidence: [] });
    } catch (error) {
      expect((error as AssuranceError).code).toBe("invalid_profile");
      expect((error as AssuranceError).details.join(" ")).toContain("mystery");
    }
  });

  test("negative sigma is a typed invalid_input error", () => {
    const profile = profileOf({ kind: "uncertainty_bound", propertyKey: "room.height", maxSigma: 0.02, unit: "m" });
    expect(() =>
      evaluateReadiness({
        profile,
        graphSnapshot: { nodes: [node("n1", [prop("room.height", 2.7, { unit: "m", sigma: -0.01 })])] },
        evidence: [],
      }),
    ).toThrow(/sigma/);
  });

  test("duplicate property key within a node is a typed invalid_input error (ambiguous basis)", () => {
    const profile = profileOf({ kind: "uncertainty_bound", propertyKey: "room.height", maxSigma: 0.02, unit: "m" });
    expect(() =>
      evaluateReadiness({
        profile,
        graphSnapshot: {
          nodes: [node("n1", [prop("room.height", 2.7, { unit: "m", sigma: 0.01 }), prop("room.height", 2.8, { unit: "m", sigma: 0.02 })])],
        },
        evidence: [],
      }),
    ).toThrow(/duplicate property key/);
  });

  test("duplicate evidenceId is a typed invalid_input error", () => {
    const profile = profileOf({ kind: "evidence_sufficiency", method: "DEPTH_SENSING", minCount: 1 });
    expect(() =>
      evaluateReadiness({
        profile,
        graphSnapshot: { nodes: [] },
        evidence: [evidence("e1", "DEPTH_SENSING"), evidence("e1", "DEPTH_SENSING")],
      }),
    ).toThrow(/duplicate evidenceId/);
  });
});

/* ------------------------------------------------------------------ */
/* Gaps (actionability), determinism, recomputability                  */
/* ------------------------------------------------------------------ */

describe("gap actionability", () => {
  test("one gap per unsatisfied/insufficient dimension, deterministic gapIds", () => {
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, [node("space-1", [])], [evidence("e1", "DEPTH_SENSING")]);
    const unsatisfiedIds = report.dimensions
      .filter((dimension) => dimension.outcome !== "satisfied")
      .map((dimension) => dimension.dimensionId)
      .sort();
    expect(report.gaps.map((gap) => gap.dimensionId).sort()).toEqual(unsatisfiedIds);
    for (const gap of report.gaps) {
      expect(gap.gapId).toBe(`${report.profileId}::${gap.dimensionId}`);
      expect(gap.requirement).toBeDefined();
    }
  });

  test("evidence gap remediation names method, counts and additional count needed", () => {
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyReadyNodes(), [evidence("e1", "DEPTH_SENSING")]);
    const gap = gapOf(report, "spatial-depth-evidence");
    expect(gap?.remediation).toEqual({
      kind: "evidence_sufficiency",
      method: "DEPTH_SENSING",
      requiredCount: 2,
      validCount: 1,
      additionalCountNeeded: 1,
    });
  });

  test("uncertainty gap remediation names required sigma and current max sigma", () => {
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, [node("n1", [prop("room.height", 2.7, { unit: "m", sigma: 0.03 })])], []);
    const gap = gapOf(report, "room-height-uncertainty");
    expect(gap?.remediation).toEqual({
      kind: "uncertainty_bound",
      propertyKey: "room.height",
      requiredMaxSigma: 0.02,
      unit: "m",
      currentMaxSigma: 0.03,
    });
  });

  test("coverage and epistemic gap remediations name fraction needed and unsatisfied keys", () => {
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, [node("n1", [])], [evidence("e1", "DEPTH_SENSING")]);
    expect(gapOf(report, "surface-coverage")?.remediation).toMatchObject({
      kind: "coverage",
      minCoverageFraction: 0.9,
      measuredCoverageFraction: 0,
    });
    expect(gapOf(report, "material-epistemic-floor")?.remediation).toEqual({
      kind: "epistemic_floor",
      minEpistemicStatus: "OBSERVED",
      unsatisfiedPropertyKeys: ["element.material"],
    });
  });

  test("closing a gap exactly (2 more depth items) flips the dimension to satisfied and removes the gap", () => {
    const before = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyReadyNodes(), [evidence("e1", "DEPTH_SENSING")]);
    expect(gapOf(before, "spatial-depth-evidence")).toBeDefined();
    const after = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyReadyNodes(), [
      evidence("e1", "DEPTH_SENSING"),
      evidence("e2", "DEPTH_SENSING"),
      evidence("e3", "DEPTH_SENSING"),
    ]);
    expect(outcomeOf(after, "spatial-depth-evidence").outcome).toBe("satisfied");
    expect(gapOf(after, "spatial-depth-evidence")).toBeUndefined();
  });
});

describe("determinism and recomputability", () => {
  test("same input evaluates to byte-identical canonical reports", () => {
    const first = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyReadyNodes(), surveyEvidence());
    const second = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyReadyNodes(), surveyEvidence());
    expect(serializeReadinessReport(first)).toBe(serializeReadinessReport(second));
  });

  test("report carries no timestamps or clock-derived keys (callers stamp externally)", () => {
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, surveyReadyNodes(), surveyEvidence(), device({}));
    const json = serializeReadinessReport(report);
    expect(json).not.toMatch(/timestamp|recordedAt|observedAt|createdAt|generatedAt|"date"|printedAt/i);
  });

  test("order-insensitivity: shuffled nodes/evidence/link lists produce a byte-identical report", () => {
    const nodes = [
      node("space-1", [
        prop("room.height", 2.7, { unit: "m", sigma: 0.01 }),
        prop("room.width", 4.2, { unit: "m", sigma: 0.01 }),
        prop("element.material", "concrete"),
      ]),
      node("space-2", [
        prop("room.height", 3.1, { unit: "m", sigma: 0.015 }),
        prop("room.width", 3.0, { unit: "m", sigma: 0.015 }),
        prop("element.material", "brick"),
      ]),
      node("space-3", [prop("element.material", "wood")]),
    ];
    const evidenceFacts = [
      evidence("ev-a", "DEPTH_SENSING", { linkedNodeIds: ["space-2", "space-1"] }),
      evidence("ev-b", "DEPTH_SENSING", { linkedNodeIds: ["space-3", "space-1"] }),
      evidence("ev-c", "VISUAL_RECONSTRUCTION", { linkedNodeIds: ["space-1"] }),
    ];
    const baseline = evaluate(DIMENSIONAL_SURVEY_PROFILE, nodes, evidenceFacts);
    for (const seed of [1, 7, 42, 1337]) {
      const report = evaluate(
        DIMENSIONAL_SURVEY_PROFILE,
        shuffled(nodes, seed).map((n) => node(n.nodeId, shuffled(n.properties, seed + 1))),
        shuffled(evidenceFacts, seed + 2).map((e) =>
          evidence(e.evidenceId, e.method, { invalidated: e.invalidated, linkedNodeIds: shuffled(e.linkedNodeIds, seed + 3) }),
        ),
      );
      expect(serializeReadinessReport(report)).toBe(serializeReadinessReport(baseline));
    }
  });

  test("advisory weights never change verdicts (weight is metadata only)", () => {
    const reweighted: AssuranceProfile = {
      ...DIMENSIONAL_SURVEY_PROFILE,
      dimensions: DIMENSIONAL_SURVEY_PROFILE.dimensions.map((dimension) => ({ ...dimension, weight: 0.123 })),
    };
    const nodes = surveyReadyNodes();
    const evidenceFacts = [evidence("e1", "DEPTH_SENSING")];
    const baseline = evaluate(DIMENSIONAL_SURVEY_PROFILE, nodes, evidenceFacts);
    const reweightedReport = evaluate(reweighted, nodes, evidenceFacts);
    expect(reweightedReport.readiness).toBe(baseline.readiness);
    expect(
      reweightedReport.dimensions.map((dimension) => [dimension.dimensionId, dimension.outcome, dimension.critical, dimension.basis, dimension.deficiency]),
    ).toEqual(
      baseline.dimensions.map((dimension) => [dimension.dimensionId, dimension.outcome, dimension.critical, dimension.basis, dimension.deficiency]),
    );
  });
});
