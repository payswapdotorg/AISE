/**
 * AISE-022 monotonicity tests — the CRITICAL property matrix:
 *
 *  - Evidence-addition chains over all three shipped profiles: every
 *    dimension outcome is non-decreasing under the documented satisfaction
 *    order (insufficient_data < not_satisfied < satisfied) and the
 *    readiness rank never decreases (evaluate(E) ⊑ evaluate(E ∪ extra)).
 *  - Invalidation and removal are explicitly NON-monotone by design (R7:
 *    "missing/invalid evidence invalidates readiness") — READY drops to
 *    NOT_READY / INSUFFICIENT_DATA and the tests pin that drop.
 *  - Fact-improvement chains on replacement snapshots (σ tightening,
 *    epistemic upgrades) are monotone; contradicting property additions
 *    (a worse σ on an already-bounded key) correctly LOWER the dimension —
 *    the conservative worst-governs rule, asserted explicitly.
 */

import { describe, expect, test } from "bun:test";
import {
  AS_BUILT_MODEL_PROFILE,
  CONDITION_INSPECTION_PROFILE,
  DIMENSION_OUTCOME_RANK,
  DIMENSIONAL_SURVEY_PROFILE,
  READINESS_RANK,
  type DimensionOutcomeLevel,
  type EvidenceFact,
  type NodeFact,
  type ReadinessReport,
  type Requirement,
} from "./index";
import { evidence, evaluate, node, outcomeOf, prop } from "./testkit";

/** Assert evaluate(before) ⊑ evaluate(after) under the documented orders. */
function assertMonotone(before: ReadinessReport, after: ReadinessReport): void {
  expect(READINESS_RANK[after.readiness]).toBeGreaterThanOrEqual(READINESS_RANK[before.readiness]);
  const afterById = new Map(after.dimensions.map((dimension) => [dimension.dimensionId, dimension.outcome]));
  expect(afterById.size).toBe(before.dimensions.length);
  for (const dimension of before.dimensions) {
    const afterOutcome = afterById.get(dimension.dimensionId);
    expect(afterOutcome).toBeDefined();
    expect(DIMENSION_OUTCOME_RANK[afterOutcome as DimensionOutcomeLevel]).toBeGreaterThanOrEqual(
      DIMENSION_OUTCOME_RANK[dimension.outcome as DimensionOutcomeLevel],
    );
  }
}

/** Evaluate a chain and assert monotonicity between consecutive steps. */
function assertChainMonotone(steps: readonly ReadinessReport[]): void {
  for (let i = 1; i < steps.length; i += 1) {
    assertMonotone(steps[i - 1] as ReadinessReport, steps[i] as ReadinessReport);
  }
}

/* ------------------------------------------------------------------ */
/* Evidence-addition chains over the shipped profiles                  */
/* ------------------------------------------------------------------ */

describe("monotone evidence-addition chains", () => {
  test("dimensional_survey: empty -> 1 depth pass -> 2 linked passes; outcomes only improve", () => {
    const nodes: NodeFact[] = [
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
    const chain: readonly EvidenceFact[][] = [
      [],
      [evidence("ev-depth-1", "DEPTH_SENSING")],
      [
        evidence("ev-depth-1", "DEPTH_SENSING", { linkedNodeIds: ["space-1", "space-2"] }),
        evidence("ev-depth-2", "DEPTH_SENSING", { linkedNodeIds: ["space-1", "space-2"] }),
      ],
    ];
    const reports = chain.map((step) => evaluate(DIMENSIONAL_SURVEY_PROFILE, nodes, step));
    // With NO evidence the depth dimension is insufficient_data (nothing
    // recorded to count), but surface coverage is DEFINITIVELY 0 < 0.9 — a
    // critical not_satisfied. Aggregation precedence (fail-closed): a
    // definitive critical failure (NOT_READY) outranks an unknown
    // (INSUFFICIENT_DATA) — see aggregateReadiness.
    expect(reports.map((report) => report.readiness)).toEqual(["NOT_READY", "NOT_READY", "READY"]);
    expect(
      reports.map((report) => outcomeOf(report, "spatial-depth-evidence").outcome),
    ).toEqual(["insufficient_data", "not_satisfied", "satisfied"]);
    expect(reports.map((report) => outcomeOf(report, "surface-coverage").outcome)).toEqual([
      "not_satisfied",
      "not_satisfied",
      "satisfied",
    ]);
    assertChainMonotone(reports);
    assertMonotone(reports[0] as ReadinessReport, reports[1] as ReadinessReport);
  });

  test("condition_inspection: 0 -> 1 -> 2 -> 3 linked visual passes reaches READY_WITH_NOTES", () => {
    const nodes: NodeFact[] = [
      node("space-1", [
        prop("element.material", "concrete"),
        prop("element.condition", "good"),
        prop("defect.width", 0.02, { unit: "m", sigma: 0.003 }),
      ]),
      node("space-2", [
        prop("element.material", "brick"),
        prop("element.condition", "fair"),
      ]),
    ];
    const chain: readonly EvidenceFact[][] = [
      [],
      [evidence("ev-vis-1", "VISUAL_RECONSTRUCTION")],
      [evidence("ev-vis-1", "VISUAL_RECONSTRUCTION"), evidence("ev-vis-2", "VISUAL_RECONSTRUCTION")],
      [
        evidence("ev-vis-1", "VISUAL_RECONSTRUCTION", { linkedNodeIds: ["space-1", "space-2"] }),
        evidence("ev-vis-2", "VISUAL_RECONSTRUCTION", { linkedNodeIds: ["space-1", "space-2"] }),
        evidence("ev-vis-3", "VISUAL_RECONSTRUCTION", { linkedNodeIds: ["space-1", "space-2"] }),
      ],
    ];
    const reports = chain.map((step) => evaluate(CONDITION_INSPECTION_PROFILE, nodes, step));
    expect(reports.map((report) => report.readiness)).toEqual([
      "INSUFFICIENT_DATA",
      "NOT_READY",
      "NOT_READY",
      "READY_WITH_NOTES",
    ]);
    expect(reports.map((report) => outcomeOf(report, "visual-condition-evidence").outcome)).toEqual([
      "insufficient_data",
      "not_satisfied",
      "not_satisfied",
      "satisfied",
    ]);
    assertChainMonotone(reports);
  });

  test("as_built_model: 0 -> 4 linked visual passes over 20 nodes reaches READY_WITH_NOTES at coverage 0.95", () => {
    const nodes: NodeFact[] = Array.from({ length: 20 }, (_, i) =>
      node(`room-${i + 1}`, [
        prop("room.height", 2.7, { unit: "m", sigma: 0.01, epistemicStatus: "CONFIRMED" }),
        prop("room.width", 4.1, { unit: "m", sigma: 0.01, epistemicStatus: "CONFIRMED" }),
      ]),
    );
    const linked1to10 = Array.from({ length: 10 }, (_, i) => `room-${i + 1}`);
    const linked11to19 = Array.from({ length: 9 }, (_, i) => `room-${i + 11}`);
    const chain: readonly EvidenceFact[][] = [
      [],
      [evidence("ev-vis-1", "VISUAL_RECONSTRUCTION", { linkedNodeIds: linked1to10 })],
      [
        evidence("ev-vis-1", "VISUAL_RECONSTRUCTION", { linkedNodeIds: linked1to10 }),
        evidence("ev-vis-2", "VISUAL_RECONSTRUCTION", { linkedNodeIds: linked1to10 }),
      ],
      [
        evidence("ev-vis-1", "VISUAL_RECONSTRUCTION", { linkedNodeIds: linked1to10 }),
        evidence("ev-vis-2", "VISUAL_RECONSTRUCTION", { linkedNodeIds: linked1to10 }),
        evidence("ev-vis-3", "VISUAL_RECONSTRUCTION", { linkedNodeIds: linked1to10 }),
      ],
      [
        evidence("ev-vis-1", "VISUAL_RECONSTRUCTION", { linkedNodeIds: linked1to10 }),
        evidence("ev-vis-2", "VISUAL_RECONSTRUCTION", { linkedNodeIds: linked1to10 }),
        evidence("ev-vis-3", "VISUAL_RECONSTRUCTION", { linkedNodeIds: linked1to10 }),
        evidence("ev-vis-4", "VISUAL_RECONSTRUCTION", { linkedNodeIds: linked11to19 }),
      ],
    ];
    const reports = chain.map((step) => evaluate(AS_BUILT_MODEL_PROFILE, nodes, step));
    // Step 0 (no evidence): coverage is definitively 0 → critical
    // not_satisfied → NOT_READY outranks the unknown-evidence dimension
    // (aggregation precedence, see aggregateReadiness).
    expect(reports.map((report) => report.readiness)).toEqual([
      "NOT_READY",
      "NOT_READY",
      "NOT_READY",
      "NOT_READY",
      "READY_WITH_NOTES",
    ]);
    expect(reports.map((report) => outcomeOf(report, "model-coverage").outcome)).toEqual([
      "not_satisfied",
      "not_satisfied",
      "not_satisfied",
      "not_satisfied",
      "satisfied",
    ]);
    expect(outcomeOf(reports[4] as ReadinessReport, "model-coverage").basis).toMatchObject({
      nodesTotal: 20,
      nodesCovered: 19,
      measuredCoverageFraction: 0.95,
    });
    assertChainMonotone(reports);
  });
});

/* ------------------------------------------------------------------ */
/* Invalidation / removal — explicitly NON-monotone (R7)               */
/* ------------------------------------------------------------------ */

describe("invalidation and removal drop readiness (non-monotone by design)", () => {
  function readyStateNodes(): NodeFact[] {
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

  test("invalidating ONE critical depth evidence item drops READY -> NOT_READY", () => {
    const ready = evaluate(DIMENSIONAL_SURVEY_PROFILE, readyStateNodes(), [
      evidence("ev-depth-1", "DEPTH_SENSING", { linkedNodeIds: ["space-1", "space-2"] }),
      evidence("ev-depth-2", "DEPTH_SENSING", { linkedNodeIds: ["space-1", "space-2"] }),
    ]);
    expect(ready.readiness).toBe("READY");
    const afterInvalidation = evaluate(DIMENSIONAL_SURVEY_PROFILE, readyStateNodes(), [
      evidence("ev-depth-1", "DEPTH_SENSING", { linkedNodeIds: ["space-1", "space-2"] }),
      evidence("ev-depth-2", "DEPTH_SENSING", { invalidated: true, linkedNodeIds: ["space-1", "space-2"] }),
    ]);
    expect(afterInvalidation.readiness).toBe("NOT_READY");
    expect(outcomeOf(afterInvalidation, "spatial-depth-evidence").basis).toMatchObject({
      validCount: 1,
      invalidCount: 1,
    });
  });

  test("invalidating ALL depth evidence keeps a measured failure with invalid counts named", () => {
    const report = evaluate(DIMENSIONAL_SURVEY_PROFILE, readyStateNodes(), [
      evidence("ev-depth-1", "DEPTH_SENSING", { invalidated: true, linkedNodeIds: ["space-1", "space-2"] }),
      evidence("ev-depth-2", "DEPTH_SENSING", { invalidated: true, linkedNodeIds: ["space-1", "space-2"] }),
    ]);
    expect(report.readiness).toBe("NOT_READY");
    expect(outcomeOf(report, "spatial-depth-evidence").basis).toMatchObject({ validCount: 0, invalidCount: 2 });
    expect(outcomeOf(report, "spatial-depth-evidence").deficiency?.message).toContain("2 invalidated items not counted");
  });

  test("REMOVING all evidence drops READY -> NOT_READY (definitive coverage failure; R7)", () => {
    const ready = evaluate(DIMENSIONAL_SURVEY_PROFILE, readyStateNodes(), [
      evidence("ev-depth-1", "DEPTH_SENSING", { linkedNodeIds: ["space-1", "space-2"] }),
      evidence("ev-depth-2", "DEPTH_SENSING", { linkedNodeIds: ["space-1", "space-2"] }),
    ]);
    expect(ready.readiness).toBe("READY");
    const removed = evaluate(DIMENSIONAL_SURVEY_PROFILE, readyStateNodes(), []);
    // Overall: NOT_READY — surface coverage is DEFINITIVELY 0 (< required)
    // and a definitive critical failure outranks the unknown depth-evidence
    // dimension (aggregation precedence). The depth dimension itself stays
    // insufficient_data with the no_evidence_recorded code (R7 honesty).
    expect(removed.readiness).toBe("NOT_READY");
    expect(outcomeOf(removed, "spatial-depth-evidence").outcome).toBe("insufficient_data");
    expect(outcomeOf(removed, "spatial-depth-evidence").deficiency?.code).toBe("no_evidence_recorded");
  });
});

/* ------------------------------------------------------------------ */
/* Fact-improvement chains + the conservative contradiction rule       */
/* ------------------------------------------------------------------ */

describe("fact improvement and conservative contradictions", () => {
  const sigmaProfile = {
    profileId: "test/sigma",
    version: "assurance-1" as const,
    taskKind: "dimensional_survey" as const,
    dimensions: [
      {
        dimensionId: "height-1sigma",
        description: "height sigma bound",
        critical: true,
        requirement: { kind: "uncertainty_bound", propertyKey: "room.height", maxSigma: 0.02, unit: "m" } as Requirement,
      },
    ],
  };

  test("tightening sigma across replacement snapshots improves the outcome monotonically", () => {
    const snapshots: readonly NodeFact[][] = [
      [node("space-1", [prop("room.height", 2.7, { unit: "m", sigma: 0.03 })])],
      [node("space-1", [prop("room.height", 2.7, { unit: "m", sigma: 0.025 })])],
      [node("space-1", [prop("room.height", 2.7, { unit: "m", sigma: 0.02 })])],
      [node("space-1", [prop("room.height", 2.7, { unit: "m", sigma: 0.01 })])],
    ];
    const reports = snapshots.map((nodes) => evaluate(sigmaProfile, nodes, []));
    expect(reports.map((report) => report.readiness)).toEqual([
      "NOT_READY",
      "NOT_READY",
      "READY",
      "READY",
    ]);
    expect(reports.map((report) => outcomeOf(report, "height-1sigma").outcome)).toEqual([
      "not_satisfied",
      "not_satisfied",
      "satisfied",
      "satisfied",
    ]);
    assertChainMonotone(reports);
  });

  test("epistemic upgrades across replacement snapshots improve monotonically to CONFIRMED", () => {
    const floorProfile = {
      profileId: "test/floor",
      version: "assurance-1" as const,
      taskKind: "as_built_model" as const,
      dimensions: [
        {
          dimensionId: "confirm-height",
          description: "confirmed height",
          critical: true,
          requirement: {
            kind: "epistemic_floor",
            minEpistemicStatus: "CONFIRMED",
            propertyKeys: ["room.height"],
          } as Requirement,
        },
      ],
    };
    const snapshots: readonly NodeFact[][] = [
      [node("space-1", [prop("room.height", 2.7, { epistemicStatus: "PROPOSED" })])],
      [node("space-1", [prop("room.height", 2.7, { epistemicStatus: "INFERRED" })])],
      [node("space-1", [prop("room.height", 2.7, { epistemicStatus: "OBSERVED" })])],
      [node("space-1", [prop("room.height", 2.7, { epistemicStatus: "CONFIRMED" })])],
    ];
    const reports = snapshots.map((nodes) => evaluate(floorProfile, nodes, []));
    expect(reports.map((report) => outcomeOf(report, "confirm-height").outcome)).toEqual([
      "not_satisfied",
      "not_satisfied",
      "not_satisfied",
      "satisfied",
    ]);
    expect(reports.map((report) => report.readiness)).toEqual([
      "NOT_READY",
      "NOT_READY",
      "NOT_READY",
      "READY",
    ]);
    assertChainMonotone(reports);
  });

  test("adding a CONTRADICTING worse assertion correctly lowers the dimension (conservative worst governs — documented scope)", () => {
    const before = evaluate(sigmaProfile, [node("space-1", [prop("room.height", 2.7, { unit: "m", sigma: 0.01 })])], []);
    expect(before.readiness).toBe("READY");
    const after = evaluate(
      sigmaProfile,
      [
        node("space-1", [prop("room.height", 2.7, { unit: "m", sigma: 0.01 })]),
        node("space-2", [prop("room.height", 3.1, { unit: "m", sigma: 0.05 })]),
      ],
      [],
    );
    expect(after.readiness).toBe("NOT_READY");
    expect(outcomeOf(after, "height-1sigma").outcome).toBe("not_satisfied");
    expect(outcomeOf(after, "height-1sigma").basis).toMatchObject({ assertionCount: 2, maxMeasuredSigma: 0.05 });
  });
});
