/**
 * AISE-039 — pilot ADOPTION METRIC tests: the no-synthetic-claims matrix
 * (the CRITICAL acceptance). Metrics compute ONLY from executed-record
 * evidence; synthetic-only evidence is typed UNKNOWN with the missing
 * real-evidence requirement named; NOT_OBSERVED dimensions propagate;
 * insufficient real samples are refused as anecdotes.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { runPilotCampaign } from "./campaign";
import {
  computeAdoptionMetrics,
  sessionCompletedTargetedWorkflow,
  type PilotMetricResult,
} from "./metrics";
import {
  PILOT_TARGETED_WORKFLOW_STEPS,
  pilotAdoptionStates,
  runShippedPilotCampaign,
  syntheticOnlyPilotCampaignSpec,
  mixedPilotCampaignSpec,
} from "./testkit";

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

describe("the no-synthetic-claims matrix (CRITICAL acceptance)", () => {
  test("real executed evidence → every metric COMPUTED with evidence trails", async () => {
    const metrics = computeAdoptionMetrics(await shippedCampaign(), { minRealSessions: 3 });
    expect(metrics.summary.realSessionCount).toBe(10);
    expect(metrics.summary.syntheticSessionCount).toBe(0);
    expect(metrics.summary.projectedUsers).toBeNull();
    for (const id of [
      "primary_interface_adoption_rate",
      "authorized_action_success_rate",
      "return_path_completion_rate",
      "context_switches_per_session",
      "workflow_migration_coverage",
      "distinct_pilot_principals",
    ] as const) {
      const result = metrics.metrics[id];
      expect(result.kind).toBe("computed");
      if (result.kind === "computed") {
        expect(result.evidence.realSessionIds.length).toBe(10);
        expect(result.evidence.excludedSyntheticSessionCount).toBe(0);
        expect(Number.isFinite(result.value)).toBe(true);
      }
    }
  });

  test("synthetic-only evidence → EVERY metric UNKNOWN naming the missing real evidence", async () => {
    const metrics = computeAdoptionMetrics(await syntheticCampaign(), { minRealSessions: 3 });
    expect(metrics.summary.realSessionCount).toBe(0);
    expect(metrics.summary.syntheticSessionCount).toBe(3);
    expect(metrics.summary.projectedUsers).toBe(250);
    expect(metrics.summary.syntheticGenerators).toEqual(["projected-activity-v1"]);
    for (const id of Object.keys(metrics.metrics) as (keyof typeof metrics.metrics)[]) {
      const result = metrics.metrics[id];
      expect(result.kind).toBe("unknown");
      if (result.kind === "unknown") {
        expect(result.reason).toBe("synthetic_only_evidence");
        expect(result.missingRealEvidence.length).toBeGreaterThan(0);
        expect(result.detail.length).toBeGreaterThan(0);
      }
    }
  });

  test("mixed evidence → computed over the REAL sessions only, synthetic excluded and counted", async () => {
    const campaign = await runPilotCampaign(mixedPilotCampaignSpec());
    const metrics = computeAdoptionMetrics(campaign, { minRealSessions: 3 });
    expect(metrics.summary.realSessionCount).toBe(8);
    expect(metrics.summary.syntheticSessionCount).toBe(1);
    const adoption = metrics.metrics["primary_interface_adoption_rate"];
    expect(adoption.kind).toBe("computed");
    if (adoption.kind === "computed") {
      expect(adoption.evidence.realSessionIds.length).toBe(8);
      expect(adoption.evidence.excludedSyntheticSessionCount).toBe(1);
      expect(adoption.derivation).toContain("synthetic sessions excluded (1)");
    }
    // The synthetic session's projected user count is carried, never summed.
    expect(metrics.summary.projectedUsers).toBe(250);
  });

  test("insufficient real evidence → UNKNOWN (an anecdote is not a pilot result)", async () => {
    const metrics = computeAdoptionMetrics(await shippedCampaign(), { minRealSessions: 50 });
    for (const id of Object.keys(metrics.metrics) as (keyof typeof metrics.metrics)[]) {
      const result = metrics.metrics[id];
      expect(result.kind).toBe("unknown");
      if (result.kind === "unknown") {
        expect(result.reason).toBe("insufficient_real_evidence");
      }
    }
  });

  test("a projection without adoption-state records → UNKNOWN naming the generator", async () => {
    const campaign = await shippedCampaign();
    const projected = {
      ...campaign,
      adoptionStates: [],
      projectedAdoption: {
        generator: "projected-activity-v1",
        projectedUsers: 250,
        projectedCoverage: 0.9,
        note: "projection only",
      },
    };
    const metrics = computeAdoptionMetrics(projected, { minRealSessions: 3 });
    const coverage = metrics.metrics["workflow_migration_coverage"];
    expect(coverage.kind).toBe("unknown");
    if (coverage.kind === "unknown") {
      expect(coverage.reason).toBe("no_adoption_state_records");
      expect(coverage.detail).toContain("projected-activity-v1");
      expect(coverage.missingRealEvidence).toContain("AISE-041");
    }
  });
});

describe("metric semantics over executed records", () => {
  test("the adoption rate derives R19 walk completion (never trusts a claim)", async () => {
    const campaign = await shippedCampaign();
    const metrics = computeAdoptionMetrics(campaign, { minRealSessions: 3 });
    const adoption = metrics.metrics["primary_interface_adoption_rate"];
    expect(adoption.kind).toBe("computed");
    expect((adoption as Extract<PilotMetricResult, { kind: "computed" }>).value).toBe(1); // every shipped session completed the walk
    // The derivation helper refuses a stranded session.
    const project = campaign.projects[0]!;
    const session = project.sessions[0]!;
    expect(sessionCompletedTargetedWorkflow(session, 2)).toBe(true);
    const stranded = {
      ...session,
      traversals: session.traversals.map((traversal) =>
        traversal.toModule === "incumbent" && traversal.fromModule === "aise"
          ? { ...traversal, returnedViaReturnPath: false }
          : traversal,
      ),
    };
    expect(sessionCompletedTargetedWorkflow(stranded, 2)).toBe(false);
  });

  test("the success rate excludes unavailable decisions and reports them", async () => {
    const campaign = await runShippedPilotCampaign({
      recorder: { allActionsUnavailable: true },
    });
    const metrics = computeAdoptionMetrics(campaign, { minRealSessions: 3 });
    const success = metrics.metrics["authorized_action_success_rate"];
    expect(success.kind).toBe("unknown");
    if (success.kind === "unknown") {
      expect(success.reason).toBe("dimension_not_observed");
      expect(success.detail).toContain("unavailable");
    }
  });

  test("workflow migration coverage counts only real-session-referenced piloted/replaced steps", async () => {
    const campaign = await shippedCampaign();
    const metrics = computeAdoptionMetrics(campaign, { minRealSessions: 3 });
    const coverage = metrics.metrics["workflow_migration_coverage"];
    expect(coverage.kind).toBe("computed");
    expect((coverage as Extract<PilotMetricResult, { kind: "computed" }>).value).toBe(0.75); // 3 of 4 targeted steps piloted
    // An unreferenced candidate does not count (states no session drove).
    const dereferenced = {
      ...campaign,
      adoptionStates: campaign.adoptionStates.map((candidate) => ({
        ...candidate,
        candidateId: `unreferenced-${candidate.candidateId}`,
      })),
    };
    const dereferencedMetrics = computeAdoptionMetrics(dereferenced, { minRealSessions: 3 });
    const dereferencedCoverage = dereferencedMetrics.metrics["workflow_migration_coverage"];
    expect(dereferencedCoverage.kind).toBe("computed");
    expect((dereferencedCoverage as Extract<PilotMetricResult, { kind: "computed" }>).value).toBe(0);
    // The adoption vocabulary is the AISE-041 registry, not ours.
    expect(pilotAdoptionStates().every((candidate) => candidate.state === "piloted" || candidate.state === "evaluating")).toBe(true);
    expect(PILOT_TARGETED_WORKFLOW_STEPS.length).toBe(4);
  });

  test("distinct pilot principals counts real principals only", async () => {
    const metrics = computeAdoptionMetrics(await shippedCampaign(), { minRealSessions: 3 });
    const principals = metrics.metrics["distinct_pilot_principals"];
    expect(principals.kind).toBe("computed");
    expect((principals as Extract<PilotMetricResult, { kind: "computed" }>).value).toBe(4);
    expect(metrics.summary.distinctRealPrincipals).toBe(4);
  });

  test("metrics recompute byte-identically (determinism)", async () => {
    const campaign = await shippedCampaign();
    const first = computeAdoptionMetrics(campaign, { minRealSessions: 3 });
    const second = computeAdoptionMetrics(campaign, { minRealSessions: 3 });
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
  });
});

describe("NOT_OBSERVED propagation into metrics", () => {
  test("an unobserved return-path dimension makes both traversal metrics UNKNOWN", async () => {
    const campaign = await runShippedPilotCampaign({
      allEnvNotObserved: ["return-path"],
    });
    const metrics = computeAdoptionMetrics(campaign, { minRealSessions: 3 });
    const completion = metrics.metrics["return_path_completion_rate"];
    expect(completion.kind).toBe("unknown");
    if (completion.kind === "unknown") {
      expect(completion.reason).toBe("dimension_not_observed");
      expect(completion.missingRealEvidence).toContain("external round trip");
    }
    const switches = metrics.metrics["context_switches_per_session"];
    expect(switches.kind).toBe("unknown");
    // Walk-derived metrics stay computed (their dimension was observed).
    expect(metrics.metrics["primary_interface_adoption_rate"].kind).toBe("computed");
  });
});
