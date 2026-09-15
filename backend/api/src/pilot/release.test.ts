/**
 * AISE-039 — RELEASE tests: versioned criteria, honest BLOCKED/READY
 * verdicts with exact typed blockers, the synthetic-only typed refusal,
 * regression-suite binding by id+version, and the append-only release log
 * with provenance and the self-approval refusal.
 */

import { describe, expect, test } from "bun:test";
import { runPilotCampaign } from "./campaign";
import { evaluatePilotGates, PILOT_GATE_TABLES_V1, type PilotGateTables } from "./gates";
import { computeAdoptionMetrics, type PilotAdoptionMetrics } from "./metrics";
import {
  appendEvaluation,
  evaluateRelease,
  PILOT_BOUND_REGRESSION_SUITES,
  PILOT_RELEASE_CRITERIA_V1,
  PILOT_RELEASE_LOG_GENESIS,
  requestApproval,
  validateReleaseCriteria,
  verifyReleaseLog,
  type ReleaseCriteria,
  type ReleaseEvaluation,
  type ReleaseLogEntry,
} from "./release";
import {
  mixedPilotCampaignSpec,
  pilotEnvironmentLarge,
  runShippedPilotCampaign,
  shippedPilotCampaignSpec,
  syntheticOnlyPilotCampaignSpec,
} from "./testkit";
import type { PilotCampaignResult } from "./campaign";
import type { PilotGateResult } from "./model";

const EVALUATOR = "pilot-release-evaluator";
const APPROVER = "pilot-release-approver";
const NOW = (): string => "2026-05-10T09:00:00.000Z";

interface FullResult {
  readonly campaign: PilotCampaignResult;
  readonly gates: readonly PilotGateResult[];
  readonly metrics: PilotAdoptionMetrics;
}
const cache = new Map<string, FullResult>();

/** Run + evaluate a campaign variant once per test file (cached by key). */
async function full(
  key: string,
  run: () => Promise<PilotCampaignResult>,
  tables: PilotGateTables = PILOT_GATE_TABLES_V1,
): Promise<FullResult> {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const campaign = await run();
  const gates = evaluatePilotGates(campaign, tables).results;
  const metrics = computeAdoptionMetrics(campaign, {
    minRealSessions: PILOT_RELEASE_CRITERIA_V1.requiredRealSampleSize,
  });
  const result: FullResult = { campaign, gates, metrics };
  cache.set(key, result);
  return result;
}

function evaluate(full: FullResult, criteria: ReleaseCriteria = PILOT_RELEASE_CRITERIA_V1): ReleaseEvaluation {
  return evaluateRelease({
    campaign: full.campaign,
    gateResults: full.gates,
    adoptionMetrics: full.metrics,
    criteria,
    evaluatedBy: EVALUATOR,
    now: NOW,
  });
}

describe("the READY verdict (honest, never self-blessed)", () => {
  test("the shipped campaign is READY under criteria v1 with bound suites", async () => {
    const result = await full("shipped", () => runShippedPilotCampaign());
    const evaluation = evaluate(result);
    expect(evaluation.verdict).toBe("READY");
    expect(evaluation.blockers).toEqual([]);
    expect(evaluation.criteriaId).toBe("release-criteria/production-pilot");
    expect(evaluation.criteriaVersion).toBe(1);
    expect(evaluation.campaignDigest).toBe(result.campaign.reproducibilityDigest);
    expect(evaluation.evaluatedBy).toBe(EVALUATOR);
    // The release depends on the repo's REAL R17 suites, recorded verbatim.
    expect(evaluation.regressionSuites).toEqual([
      {
        suiteId: "aise-benchmarks-regression",
        suiteVersion: "gates-1",
        surface: "backend/api/src/benchmarks (AISE-019 golden metrics, gates + discrimination matrix)",
      },
      {
        suiteId: "aise-lab-golden-metrics",
        suiteVersion: "lab-gates-1",
        surface: "backend/api/src/lab (AISE-035 end-to-end dogfood gates + discrimination cases)",
      },
    ]);
    expect(evaluation.gateStatuses.length).toBe(8);
    expect(evaluation.adoptionMetricResults.length).toBe(6);
    expect(evaluation.evaluationId).toMatch(/^releval-[0-9a-f]{16}$/);
    expect(evaluation.contentDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the evaluation is deterministic and content-addressed", async () => {
    const result = await full("shipped", () => runShippedPilotCampaign());
    const first = evaluate(result);
    const second = evaluate(result);
    expect(first.evaluationId).toBe(second.evaluationId);
    expect(first.contentDigest).toBe(second.contentDigest);
    const otherClock = evaluateRelease({
      campaign: result.campaign,
      gateResults: result.gates,
      adoptionMetrics: result.metrics,
      criteria: PILOT_RELEASE_CRITERIA_V1,
      evaluatedBy: EVALUATOR,
      now: (): string => "2026-05-11T09:00:00.000Z",
    });
    expect(otherClock.evaluationId).not.toBe(first.evaluationId);
  });
});

describe("BLOCKED verdicts name their exact causes (typed blockers)", () => {
  test("a failing gate blocks with the gate id and violation count", async () => {
    const result = await full(
      "latency",
      () =>
        runShippedPilotCampaign({
          recorder: { latencyMultiplierByHopId: { reality_inspect: 2.0 } },
        }),
    );
    const evaluation = evaluate(result);
    expect(evaluation.verdict).toBe("BLOCKED");
    const gateBlocker = evaluation.blockers.find((b) => b.kind === "critical_gate_failed");
    expect(gateBlocker).toBeDefined();
    if (gateBlocker?.kind === "critical_gate_failed") {
      expect(gateBlocker.gateId).toBe("performance.hop_latency");
      expect(gateBlocker.violationCount).toBeGreaterThan(0);
    }
  });

  test("a required gate that was never evaluated blocks as gate_not_evaluated", async () => {
    const result = await full("shipped", () => runShippedPilotCampaign());
    const evaluation = evaluateRelease({
      campaign: result.campaign,
      gateResults: result.gates.slice(0, 4),
      adoptionMetrics: result.metrics,
      criteria: PILOT_RELEASE_CRITERIA_V1,
      evaluatedBy: EVALUATOR,
      now: NOW,
    });
    expect(evaluation.verdict).toBe("BLOCKED");
    const missing = evaluation.blockers.filter((b) => b.kind === "gate_not_evaluated");
    expect(missing.length).toBe(4);
  });

  test("an UNKNOWN required gate blocks (never satisfied by an unknown)", async () => {
    const result = await full(
      "unavailable",
      () => runShippedPilotCampaign({ recorder: { allActionsUnavailable: true } }),
    );
    const evaluation = evaluate(result);
    expect(evaluation.verdict).toBe("BLOCKED");
    const unknownBlockers = evaluation.blockers.filter((b) => b.kind === "gate_unknown");
    expect(unknownBlockers.length).toBeGreaterThan(0);
    // All three action/audit-dependent gates went UNKNOWN (the decision
    // was never formed — honest, never zero-defaulted).
    const dimensions = unknownBlockers.map(
      (blocker) => (blocker as { readonly dimension: string }).dimension,
    );
    expect(dimensions).toContain("authorized-actions");
    expect(dimensions).toContain("audit-events");
  });

  test("a missed adoption threshold blocks with value and requirement", async () => {
    const result = await full(
      "refused",
      () => runShippedPilotCampaign({ recorder: { refuseAllActions: true } }),
    );
    const evaluation = evaluate(result);
    expect(evaluation.verdict).toBe("BLOCKED");
    const missed = evaluation.blockers.find(
      (b) =>
        b.kind === "adoption_threshold_missed" &&
        b.metric === "authorized_action_success_rate",
    );
    expect(missed).toBeDefined();
    if (missed?.kind === "adoption_threshold_missed") {
      expect(missed.value).toBe(0);
      expect(missed.requirement).toContain("min 0.75");
    }
  });

  test("synthetic-only adoption evidence is a TYPED REFUSAL (§039's loud rule)", async () => {
    const result = await full(
      "synthetic",
      () => runPilotCampaign(syntheticOnlyPilotCampaignSpec()),
    );
    const evaluation = evaluate(result);
    expect(evaluation.verdict).toBe("BLOCKED");
    const refusal = evaluation.blockers.find(
      (b) => b.kind === "adoption_evidence_synthetic_only",
    );
    expect(refusal).toBeDefined();
    if (refusal?.kind === "adoption_evidence_synthetic_only") {
      expect(refusal.projectedUsers).toBe(250);
      expect(refusal.generators).toEqual(["projected-activity-v1"]);
      expect(refusal.detail).toContain("simulated users alone");
    }
    // Every adoption metric is ALSO unknown with its named missing evidence.
    const unknownMetrics = evaluation.blockers.filter(
      (b) => b.kind === "adoption_metric_unknown",
    );
    expect(unknownMetrics.length).toBe(6);
    // And the unexecuted projects are named.
    const notExecuted = evaluation.blockers.filter((b) => b.kind === "project_not_executed");
    expect(notExecuted.length).toBe(3);
  });

  test("a NOT_OBSERVED dimension blocks end-to-end (metric + gate)", async () => {
    const result = await full("notobserved", () =>
      runShippedPilotCampaign({ allEnvNotObserved: ["return-path"] }),
    );
    const evaluation = evaluate(result);
    expect(evaluation.verdict).toBe("BLOCKED");
    const metricUnknown = evaluation.blockers.find(
      (b) => b.kind === "adoption_metric_unknown" && b.metric === "return_path_completion_rate",
    );
    expect(metricUnknown).toBeDefined();
    if (metricUnknown?.kind === "adoption_metric_unknown") {
      expect(metricUnknown.reason).toBe("dimension_not_observed");
    }
    const gateUnknowns = evaluation.blockers.filter(
      (b) =>
        b.kind === "gate_unknown" &&
        (b.gateId === "usability.return_path_integrity" ||
          b.gateId === "usability.context_switch_distribution"),
    );
    expect(gateUnknowns.length).toBe(2);
  });
});

describe("release-criteria versioning (a change re-evaluates)", () => {
  test("criteria v2 with a tighter threshold re-evaluates the same campaign to BLOCKED", async () => {
    const result = await full("shipped", () => runShippedPilotCampaign());
    const v1 = evaluate(result);
    expect(v1.verdict).toBe("READY");
    const v2: ReleaseCriteria = {
      ...PILOT_RELEASE_CRITERIA_V1,
      version: 2,
      adoptionThresholds: [
        ...PILOT_RELEASE_CRITERIA_V1.adoptionThresholds,
        { metric: "primary_interface_adoption_rate", min: 1.1 },
      ],
    };
    const v2Evaluation = evaluate(result, v2);
    expect(v2Evaluation.verdict).toBe("BLOCKED");
    expect(v2Evaluation.criteriaVersion).toBe(2);
    const missed = v2Evaluation.blockers.find(
      (b) =>
        b.kind === "adoption_threshold_missed" &&
        b.metric === "primary_interface_adoption_rate",
    );
    expect(missed).toBeDefined();
  });

  test("a gate-table version mismatch between criteria and results blocks", async () => {
    const result = await full("shipped", () => runShippedPilotCampaign());
    const v2Tables: PilotGateTables = {
      ...PILOT_GATE_TABLES_V1,
      performanceVersion: "pilot-perf-budgets-2",
    };
    const reGated = evaluatePilotGates(result.campaign, v2Tables).results;
    const evaluation = evaluateRelease({
      campaign: result.campaign,
      gateResults: reGated,
      adoptionMetrics: result.metrics,
      criteria: PILOT_RELEASE_CRITERIA_V1,
      evaluatedBy: EVALUATOR,
      now: NOW,
    });
    expect(evaluation.verdict).toBe("BLOCKED");
    const mismatches = evaluation.blockers.filter((b) => b.kind === "gate_version_mismatch");
    expect(mismatches.length).toBe(2); // both performance gates
    if (mismatches[0]?.kind === "gate_version_mismatch") {
      expect(mismatches[0].family).toBe("performance");
      expect(mismatches[0].expectedVersion).toBe("pilot-perf-budgets-1");
      expect(mismatches[0].foundVersion).toBe("pilot-perf-budgets-2");
    }
  });

  test("invalid criteria are typed refusals (no gates, no suites, bad version)", () => {
    expect(() =>
      validateReleaseCriteria({ ...PILOT_RELEASE_CRITERIA_V1, requiredGateIds: [] }),
    ).toThrow();
    expect(() =>
      validateReleaseCriteria({ ...PILOT_RELEASE_CRITERIA_V1, version: 0 }),
    ).toThrow();
    expect(() =>
      validateReleaseCriteria({ ...PILOT_RELEASE_CRITERIA_V1, regressionSuites: [] }),
    ).toThrow();
    expect(() => validateReleaseCriteria(PILOT_RELEASE_CRITERIA_V1)).not.toThrow();
  });
});

describe("regression-suite binding (R17, by id + version)", () => {
  test("a suite at a different version than the criteria binds to blocks", async () => {
    const result = await full("shipped", () => runShippedPilotCampaign());
    const drifted = PILOT_BOUND_REGRESSION_SUITES.map((binding) =>
      binding.suiteId === "aise-lab-golden-metrics"
        ? { ...binding, suiteVersion: "lab-gates-2" }
        : binding,
    );
    const evaluation = evaluateRelease({
      campaign: result.campaign,
      gateResults: result.gates,
      adoptionMetrics: result.metrics,
      criteria: PILOT_RELEASE_CRITERIA_V1,
      suiteRegistry: drifted,
      evaluatedBy: EVALUATOR,
      now: NOW,
    });
    expect(evaluation.verdict).toBe("BLOCKED");
    const broken = evaluation.blockers.find(
      (b) => b.kind === "regression_suite_binding_broken" && b.suiteId === "aise-lab-golden-metrics",
    );
    expect(broken).toBeDefined();
    if (broken?.kind === "regression_suite_binding_broken") {
      expect(broken.expectedVersion).toBe("lab-gates-1");
      expect(broken.foundVersion).toBe("lab-gates-2");
    }
    // The intact suite still resolves and is recorded.
    expect(evaluation.regressionSuites.map((s) => s.suiteId)).toEqual([
      "aise-benchmarks-regression",
    ]);
  });

  test("a missing suite id blocks with foundVersion null", async () => {
    const result = await full("shipped", () => runShippedPilotCampaign());
    const evaluation = evaluateRelease({
      campaign: result.campaign,
      gateResults: result.gates,
      adoptionMetrics: result.metrics,
      criteria: PILOT_RELEASE_CRITERIA_V1,
      suiteRegistry: [],
      evaluatedBy: EVALUATOR,
      now: NOW,
    });
    expect(evaluation.verdict).toBe("BLOCKED");
    const broken = evaluation.blockers.filter((b) => b.kind === "regression_suite_binding_broken");
    expect(broken.length).toBe(2);
    for (const entry of broken) {
      if (entry.kind === "regression_suite_binding_broken") {
        expect(entry.foundVersion).toBeNull();
      }
    }
  });
});

describe("campaign composition blockers", () => {
  test("missing ICP class coverage blocks naming the class", async () => {
    const spec = shippedPilotCampaignSpec();
    const largeOnly = { ...spec, environments: [pilotEnvironmentLarge()] };
    const campaign = await runPilotCampaign(largeOnly);
    const gates = evaluatePilotGates(campaign, PILOT_GATE_TABLES_V1).results;
    const metrics = computeAdoptionMetrics(campaign, {
      minRealSessions: PILOT_RELEASE_CRITERIA_V1.requiredRealSampleSize,
    });
    const evaluation = evaluateRelease({
      campaign,
      gateResults: gates,
      adoptionMetrics: metrics,
      criteria: PILOT_RELEASE_CRITERIA_V1,
      evaluatedBy: EVALUATOR,
      now: NOW,
    });
    expect(evaluation.verdict).toBe("BLOCKED");
    const missing = evaluation.blockers.find(
      (b) => b.kind === "campaign_icp_coverage_missing" && b.icpClass === "small",
    );
    expect(missing).toBeDefined();
  });

  test("a synthetic-only project blocks while its siblings stay computed", async () => {
    const result = await full(
      "mixed",
      () => runPilotCampaign(mixedPilotCampaignSpec()),
    );
    const evaluation = evaluate(result);
    expect(evaluation.verdict).toBe("BLOCKED");
    const notExecuted = evaluation.blockers.filter((b) => b.kind === "project_not_executed");
    expect(notExecuted.length).toBe(1);
    if (notExecuted[0]?.kind === "project_not_executed") {
      expect(notExecuted[0].projectId).toBe("pilot-small-northwing");
    }
    // The REAL sessions still compute their metrics (mixed honesty).
    expect(result.metrics.metrics["primary_interface_adoption_rate"].kind).toBe("computed");
  });

  test("a critically-failed executed project blocks with its stop reason", async () => {
    const campaign = await runShippedPilotCampaign({
      campaign: {
        degradationsByProjectId: {
          "pilot-small-northwing": {
            corruptedCaptureAssetId: "depth:surface:room-104:ceiling",
          },
        },
      },
    });
    const gates = evaluatePilotGates(campaign, PILOT_GATE_TABLES_V1).results;
    const metrics = computeAdoptionMetrics(campaign, {
      minRealSessions: PILOT_RELEASE_CRITERIA_V1.requiredRealSampleSize,
    });
    const evaluation = evaluateRelease({
      campaign,
      gateResults: gates,
      adoptionMetrics: metrics,
      criteria: PILOT_RELEASE_CRITERIA_V1,
      evaluatedBy: EVALUATOR,
      now: NOW,
    });
    expect(evaluation.verdict).toBe("BLOCKED");
    const failed = evaluation.blockers.find((b) => b.kind === "project_execution_failed");
    expect(failed).toBeDefined();
    if (failed?.kind === "project_execution_failed") {
      expect(failed.projectId).toBe("pilot-small-northwing");
      expect(failed.stopCode).not.toBeNull();
    }
  });
});

describe("the append-only release log (provenance, no self-approval)", () => {
  test("entries chain by digest and verify; duplicates are refused", async () => {
    const result = await full("shipped", () => runShippedPilotCampaign());
    const evaluation = evaluate(result);
    let log: readonly ReleaseLogEntry[] = [];
    log = appendEvaluation(log, evaluation, EVALUATOR, NOW);
    expect(log.length).toBe(1);
    expect(log[0]!.previousEntryDigest).toBe(PILOT_RELEASE_LOG_GENESIS);
    expect(verifyReleaseLog(log)).toEqual({ verified: true, reason: null });
    try {
      appendEvaluation(log, evaluation, EVALUATOR, NOW);
      throw new Error("accepted duplicate evaluation");
    } catch (error) {
      expect((error as { code: string }).code).toBe("duplicate_log_entry");
    }
  });

  test("self-approval and BLOCKED approval are typed refusals; cross-actor approval chains", async () => {
    const ready = evaluate(await full("shipped", () => runShippedPilotCampaign()));
    const blocked = evaluate(
      await full(
        "latency",
        () =>
          runShippedPilotCampaign({
            recorder: { latencyMultiplierByHopId: { reality_inspect: 2.0 } },
          }),
      ),
    );
    let log: readonly ReleaseLogEntry[] = [];
    log = appendEvaluation(log, ready, EVALUATOR, NOW);
    log = appendEvaluation(log, blocked, EVALUATOR, NOW);
    try {
      log = requestApproval(
        log,
        ready.evaluationId,
        EVALUATOR,
        "approving my own evaluation",
        NOW,
      );
      throw new Error("accepted self-approval");
    } catch (error) {
      expect((error as { code: string }).code).toBe("self_approval_refused");
    }
    try {
      log = requestApproval(log, blocked.evaluationId, APPROVER, "approving BLOCKED", NOW);
      throw new Error("accepted approval of BLOCKED");
    } catch (error) {
      expect((error as { code: string }).code).toBe("approval_of_blocked_evaluation");
    }
    try {
      log = requestApproval(log, "releval-doesnotexist", APPROVER, "unknown", NOW);
      throw new Error("approved unknown evaluation");
    } catch (error) {
      expect((error as { code: string }).code).toBe("unknown_evaluation");
    }
    log = requestApproval(
      log,
      ready.evaluationId,
      APPROVER,
      "release board approval (a different actor)",
      NOW,
    );
    expect(log.length).toBe(3);
    expect(log[2]!.kind).toBe("approval");
    expect(verifyReleaseLog(log)).toEqual({ verified: true, reason: null });
    // Tampering with the chain is detected.
    const tampered = log.map((entry, index) =>
      index === 2 ? { ...entry, note: "forged" } : entry,
    );
    const verification = verifyReleaseLog(tampered);
    expect(verification.verified).toBe(false);
    expect(verification.reason).toContain("digest mismatch");
  });
});
