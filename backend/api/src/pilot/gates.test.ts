/**
 * AISE-039 — pilot GATE tests: performance budgets and regression
 * thresholds, security coverage (permissions/audit/scopes) and usability
 * distributions — every gate computed over real session evidence with
 * typed PASS/FAIL/UNKNOWN results, per-project visibility (R17) and the
 * campaign aggregate-hiding proof.
 */

import { describe, expect, test } from "bun:test";
import { runPilotCampaign } from "./campaign";
import {
  campaignAggregateHidingProof,
  evaluateAuditCoverageGate,
  evaluateBrokerOutcomeGate,
  evaluateContextSwitchGate,
  evaluateHopLatencyGate,
  evaluateLatencyRegressionGate,
  evaluatePermissionCoverageGate,
  evaluatePilotGates,
  evaluateReturnPathIntegrityGate,
  evaluateScopeMinimalityGate,
  PILOT_GATE_TABLES_V1,
  type PilotGateTables,
} from "./gates";
import { runShippedPilotCampaign, syntheticOnlyPilotCampaignSpec } from "./testkit";

/** Shared campaigns (each test file runs the pipeline once per variant). */
let shipped: Awaited<ReturnType<typeof runShippedPilotCampaign>> | null = null;
async function shippedCampaign() {
  if (shipped === null) {
    shipped = await runShippedPilotCampaign();
  }
  return shipped;
}

let synthetic: Awaited<ReturnType<typeof runPilotCampaign>> | null = null;
async function syntheticCampaign() {
  if (synthetic === null) {
    synthetic = await runPilotCampaign(syntheticOnlyPilotCampaignSpec());
  }
  return synthetic;
}

function resultByGateId(
  results: readonly { readonly gateId: string }[],
  gateId: string,
) {
  const found = results.find((result) => result.gateId === gateId);
  if (found === undefined) {
    throw new Error(`gate result ${gateId} missing`);
  }
  return found;
}

describe("performance gates", () => {
  test("the shipped campaign passes every gate under the v1 tables", async () => {
    const campaign = await shippedCampaign();
    const evaluation = evaluatePilotGates(campaign, PILOT_GATE_TABLES_V1);
    expect(evaluation.results.length).toBe(8);
    for (const result of evaluation.results) {
      expect(result.status).toBe("PASS");
      expect(result.violations.length).toBe(0);
    }
    expect(evaluation.aggregateHiding.hiddenByCampaignAggregate).toBe(false);
  });

  test("a latency regression trips the budget gate with named per-instance evidence", async () => {
    const campaign = await runShippedPilotCampaign({
      recorder: { latencyMultiplierByHopId: { reality_inspect: 2.0 } },
    });
    const result = evaluateHopLatencyGate(campaign, PILOT_GATE_TABLES_V1);
    expect(result.status).toBe("FAIL");
    expect(result.violations.length).toBeGreaterThan(0);
    const violation = result.violations[0]!;
    expect(violation.code).toBe("hop_latency_over_budget");
    expect(violation.critical).toBe(true);
    expect(violation.projectId).not.toBeNull();
    expect(violation.sessionId).not.toBeNull();
    expect(violation.detail).toContain("reality_inspect");
    // Per-project rollups expose the failing projects (R17).
    const failingProjects = result.perProject.filter((row) => row.status === "FAIL");
    expect(failingProjects.length).toBe(3);
  });

  test("the hop-latency gate is UNKNOWN over a synthetic-only campaign", async () => {
    const result = evaluateHopLatencyGate(await syntheticCampaign(), PILOT_GATE_TABLES_V1);
    expect(result.status).toBe("UNKNOWN");
    expect(result.notObserved?.dimension).toBe("walk-latency");
  });

  test("a mean regression beyond the versioned tolerance trips while budgets pass", async () => {
    // +18% on context_discover: every sample stays under the 1200 ms budget
    // but the campaign mean (≈817 ms) regresses past 700 ms + 15% (= 805 ms).
    const campaign = await runShippedPilotCampaign({
      recorder: { latencyMultiplierByHopId: { context_discover: 1.18 } },
    });
    const budgetResult = evaluateHopLatencyGate(campaign, PILOT_GATE_TABLES_V1);
    expect(budgetResult.status).toBe("PASS");
    const regressionResult = evaluateLatencyRegressionGate(campaign, PILOT_GATE_TABLES_V1);
    expect(regressionResult.status).toBe("FAIL");
    expect(regressionResult.violations[0]!.code).toBe("latency_regression_exceeded");
    expect(regressionResult.violations[0]!.detail).toContain("context_discover");
    expect(regressionResult.violations[0]!.detail).toContain("baseline 700 ms");
  });

  test("a tighter VERSIONED budget table re-evaluates the same campaign to FAIL", async () => {
    const campaign = await shippedCampaign();
    const v2Tables: PilotGateTables = {
      ...PILOT_GATE_TABLES_V1,
      performanceVersion: "pilot-perf-budgets-2",
      hopBudgets: PILOT_GATE_TABLES_V1.hopBudgets.map((budget) =>
        budget.hopId === "context_discover" ? { ...budget, budgetMs: 600 } : budget,
      ),
    };
    const v1Result = evaluateHopLatencyGate(campaign, PILOT_GATE_TABLES_V1);
    const v2Result = evaluateHopLatencyGate(campaign, v2Tables);
    expect(v1Result.status).toBe("PASS");
    expect(v1Result.tableVersion).toBe("pilot-perf-budgets-1");
    expect(v2Result.status).toBe("FAIL");
    expect(v2Result.tableVersion).toBe("pilot-perf-budgets-2");
    expect(v2Result.violations[0]!.detail).toContain("600");
  });

  test("an incomplete gate-table bundle is a typed refusal", async () => {
    const campaign = await shippedCampaign();
    const broken = { ...PILOT_GATE_TABLES_V1, hopBudgets: [] };
    try {
      evaluateHopLatencyGate(campaign, broken);
      throw new Error("accepted empty budget table");
    } catch (error) {
      expect((error as { code: string }).code).toBe("invalid_gate_tables");
    }
    // A baseline referencing a hop with no budget entry is also refused
    // (the table must be internally consistent before any evaluation).
    const baselineWithoutBudget: PilotGateTables = {
      ...PILOT_GATE_TABLES_V1,
      hopBudgets: PILOT_GATE_TABLES_V1.hopBudgets.filter((b) => b.hopId !== "evidence_inspect"),
    };
    try {
      evaluateHopLatencyGate(campaign, baselineWithoutBudget);
      throw new Error("accepted a baseline without its budget entry");
    } catch (error) {
      expect((error as { code: string }).code).toBe("invalid_gate_tables");
    }
  });

  test("a per-project critical latency failure is NOT hidden by the campaign aggregate", async () => {
    // The SMALL project's samples blow past every budget while the
    // campaign-wide per-hop means stay under budget (the large projects
    // dominate the means) — the R17 hiding case.
    const campaign = await runShippedPilotCampaign({
      recorder: { latencyMultiplierByProjectId: { "pilot-small-northwing": 1.9 } },
    });
    const evaluation = evaluatePilotGates(campaign, PILOT_GATE_TABLES_V1);
    const hopLatency = resultByGateId(evaluation.results, "performance.hop_latency") as ReturnType<typeof evaluateHopLatencyGate>;
    expect(hopLatency.status).toBe("FAIL");
    const smallViolations = hopLatency.violations.filter(
      (violation) => violation.projectId === "pilot-small-northwing",
    );
    expect(smallViolations.length).toBeGreaterThan(0);
    // The R17 hiding proof: campaign means within budgets while a critical
    // per-instance violation exists — the aggregate would have hidden it.
    expect(evaluation.aggregateHiding.campaignMeanWithinBudgets).toBe(true);
    expect(evaluation.aggregateHiding.criticalViolationCount).toBeGreaterThan(0);
    expect(evaluation.aggregateHiding.projectIdsWithCriticalViolations).toEqual([
      "pilot-small-northwing",
    ]);
    expect(evaluation.aggregateHiding.hiddenByCampaignAggregate).toBe(true);
    // And the standalone proof function agrees with the bundle.
    const standalone = campaignAggregateHidingProof(campaign, evaluation.results, PILOT_GATE_TABLES_V1);
    expect(standalone.hiddenByCampaignAggregate).toBe(true);
  });
});

describe("security gates", () => {
  test("permission coverage fails naming the never-exercised permission", async () => {
    const campaign = await runShippedPilotCampaign({
      recorder: { skipActionsWithPermission: "case:read" },
    });
    const result = evaluatePermissionCoverageGate(campaign, PILOT_GATE_TABLES_V1);
    expect(result.status).toBe("FAIL");
    expect(result.violations.length).toBe(1);
    expect(result.violations[0]!.code).toBe("permission_not_exercised");
    expect(result.violations[0]!.detail).toContain("case:read");
  });

  test("permission coverage is UNKNOWN over a synthetic-only campaign", async () => {
    const result = evaluatePermissionCoverageGate(await syntheticCampaign(), PILOT_GATE_TABLES_V1);
    expect(result.status).toBe("UNKNOWN");
    expect(result.notObserved?.dimension).toBe("authorized-actions");
  });

  test("audit coverage fails when the refusal path was never recorded", async () => {
    const campaign = await runShippedPilotCampaign({
      recorder: { dropAuditRefusals: true },
    });
    const result = evaluateAuditCoverageGate(campaign, PILOT_GATE_TABLES_V1);
    expect(result.status).toBe("FAIL");
    expect(result.violations[0]!.code).toBe("audit_action_not_recorded");
    expect(result.violations[0]!.detail).toContain("authorization.refused");
  });

  test("scope minimality fails naming the over-scoped grant (identity ladder)", async () => {
    const campaign = await runShippedPilotCampaign({
      recorder: { overscopeOneAction: true },
    });
    const result = evaluateScopeMinimalityGate(campaign, PILOT_GATE_TABLES_V1);
    expect(result.status).toBe("FAIL");
    expect(result.violations.length).toBe(3); // one per project's first session
    const violation = result.violations[0]!;
    expect(violation.code).toBe("scope_not_minimal");
    expect(violation.detail).toContain("reality:admin");
    expect(violation.detail).toContain("reality:read");
    expect(violation.sessionId).not.toBeNull();
  });

  test("a NOT_OBSERVED audit-events dimension makes the audit gate UNKNOWN, not PASS", async () => {
    const campaign = await runShippedPilotCampaign({
      allEnvNotObserved: ["audit-events"],
    });
    const result = evaluateAuditCoverageGate(campaign, PILOT_GATE_TABLES_V1);
    expect(result.status).toBe("UNKNOWN");
    expect(result.notObserved?.dimension).toBe("audit-events");
  });
});

describe("usability gates", () => {
  test("the broker-outcome gate fails when the allowed rate drops below threshold", async () => {
    const campaign = await runShippedPilotCampaign({
      recorder: { refuseAllActions: true },
    });
    const result = evaluateBrokerOutcomeGate(campaign, PILOT_GATE_TABLES_V1);
    expect(result.status).toBe("FAIL");
    expect(result.violations[0]!.code).toBe("allowed_rate_below_threshold");
    expect(result.violations[0]!.detail).toContain("0.000");
    const evidenceAllowed = result.evidence.find((field) => field.label === "allowed");
    expect(evidenceAllowed?.value).toBe(0);
  });

  test("all-unavailable decisions make the broker gate UNKNOWN (never zero-defaulted)", async () => {
    const campaign = await runShippedPilotCampaign({
      recorder: { allActionsUnavailable: true },
    });
    const result = evaluateBrokerOutcomeGate(campaign, PILOT_GATE_TABLES_V1);
    expect(result.status).toBe("UNKNOWN");
    expect(result.notObserved?.dimension).toBe("authorized-actions");
    const unavailable = result.evidence.find((field) => field.label === "unavailable");
    expect((unavailable?.value as number)).toBeGreaterThan(0);
  });

  test("the context-switch gate fails when routine switching exceeds the budget", async () => {
    const campaign = await runShippedPilotCampaign({
      recorder: { extraExternalTripsPerSession: 1 },
    });
    const result = evaluateContextSwitchGate(campaign, PILOT_GATE_TABLES_V1);
    expect(result.status).toBe("FAIL");
    expect(result.violations[0]!.code).toBe("context_switches_over_budget");
    const mean = result.evidence.find((field) => field.label === "meanExternalTripsPerSession");
    expect((mean?.value as number)).toBeGreaterThan(1.0);
  });

  test("a stranded external trip critically fails return-path integrity", async () => {
    const campaign = await runShippedPilotCampaign({
      recorder: { strandExternalTripInProjectId: "pilot-large-centralblock" },
    });
    const result = evaluateReturnPathIntegrityGate(campaign, PILOT_GATE_TABLES_V1);
    expect(result.status).toBe("FAIL");
    const violation = result.violations[0]!;
    expect(violation.code).toBe("stranded_external_trip");
    expect(violation.critical).toBe(true);
    expect(violation.projectId).toBe("pilot-large-centralblock");
    expect(violation.detail).toContain("ext-erp");
    // The project rollup exposes exactly the stranding project.
    const failing = result.perProject.filter((row) => row.status === "FAIL");
    expect(failing.map((row) => row.projectId)).toEqual(["pilot-large-centralblock"]);
  });

  test("a NOT_OBSERVED return-path dimension makes both return-path gates UNKNOWN", async () => {
    const campaign = await runShippedPilotCampaign({
      allEnvNotObserved: ["return-path"],
    });
    const integrity = evaluateReturnPathIntegrityGate(campaign, PILOT_GATE_TABLES_V1);
    expect(integrity.status).toBe("UNKNOWN");
    expect(integrity.notObserved?.dimension).toBe("return-path");
    const switches = evaluateContextSwitchGate(campaign, PILOT_GATE_TABLES_V1);
    expect(switches.status).toBe("UNKNOWN");
  });
});

describe("the full gate evaluation bundle", () => {
  test("per-project rollups list every project with its failed/unknown gates", async () => {
    const campaign = await runShippedPilotCampaign({
      recorder: { strandExternalTripInProjectId: "pilot-small-northwing" },
    });
    const evaluation = evaluatePilotGates(campaign, PILOT_GATE_TABLES_V1);
    expect(evaluation.perProject.length).toBe(3);
    const small = evaluation.perProject.find((row) => row.projectId === "pilot-small-northwing")!;
    expect(small.icpClass).toBe("small");
    expect(small.failedGateIds).toContain("usability.return_path_integrity");
    expect(small.criticalViolationCount).toBeGreaterThan(0);
    const healthy = evaluation.perProject.find(
      (row) => row.projectId === "pilot-large-centralblock",
    )!;
    expect(healthy.failedGateIds).toEqual([]);
  });
});
