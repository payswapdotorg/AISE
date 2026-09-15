/**
 * AISE-039 — pilot CAMPAIGN tests: the deterministic multi-project driver
 * over the REAL lab-runner executions — large + small ICP composition,
 * real-record binding (verified, not trusted), per-project inspectability,
 * byte-identical recomputation, and the honest synthetic-only campaign.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { scenarioById } from "../lab/scenarios";
import { campaignDigestOf, runPilotCampaign, sessionClassOf } from "./campaign";
import {
  PILOT_CLOCK,
  runShippedPilotCampaign,
  shippedPilotCampaignSpec,
  syntheticOnlyPilotCampaignSpec,
} from "./testkit";
import {
  PilotError,
  isPilotError,
  type PilotCampaignSpec,
  type PilotSessionRecord,
} from "./model";

let shipped: Awaited<ReturnType<typeof runShippedPilotCampaign>> | null = null;
async function shippedCampaign() {
  if (shipped === null) {
    shipped = await runShippedPilotCampaign();
  }
  return shipped;
}

describe("the multi-project campaign (large + small ICP, §039)", () => {
  test("composes two typed ICP environments and three executed projects", async () => {
    const campaign = await shippedCampaign();
    expect(campaign.campaignId).toBe("pilot-campaign-production-hardening");
    expect(campaign.environments.length).toBe(2);
    const classes = campaign.environments.map((environment) => environment.icp.icpClass);
    expect(classes).toEqual(["large", "small"]);
    expect(campaign.projects.length).toBe(3);
    for (const project of campaign.projects) {
      expect(project.executed).not.toBeNull();
      expect(project.executed!.criticalExecutionFailure).toBe(false);
      expect(project.sessions.length).toBeGreaterThan(0);
    }
    // The ICP profiles are typed scale axes, declared per environment.
    const large = campaign.environments.find((e) => e.icp.icpClass === "large")!;
    expect(large.icp.spaces).toBeGreaterThan(large.icp.storeys);
    const small = campaign.environments.find((e) => e.icp.icpClass === "small")!;
    expect(small.icp.spaces).toBeLessThan(large.icp.spaces);
    expect(small.icp.incumbentIntegrations).toBeLessThan(large.icp.incumbentIntegrations);
  });

  test("every project executed the REAL pipeline (real record ids, per scenario)", async () => {
    const campaign = await shippedCampaign();
    for (const project of campaign.projects) {
      const executed = project.executed!;
      const scenario = scenarioById(project.scenarioId);
      expect(scenario.scenarioId).toBe(project.scenarioId);
      // The run digest is a canonical sha-256 over the run projection.
      expect(executed.runDigest).toMatch(/^[0-9a-f]{64}$/);
      // The mission hop carries the REAL planner's mission id.
      const missionHop = executed.hops.find((hop) => hop.hopId === "mission")!;
      expect(missionHop.outcome).toBe("ok");
      expect(missionHop.recordIds.length).toBeGreaterThan(0);
      // The reality hop carries the REAL Reality Graph version id.
      const realityHop = executed.hops.find((hop) => hop.hopId === "reality")!;
      expect(realityHop.outcome).toBe("ok");
      expect(realityHop.recordIds[0]!).toMatch(/^v/);
      // Scenario-specific honesty: room-104 has no BOQ hop, floor-gf has one.
      const boqHop = executed.hops.find((hop) => hop.hopId === "boq")!;
      if (project.projectId === "pilot-small-northwing") {
        expect(boqHop.outcome).toBe("notApplicable");
      } else {
        expect(boqHop.outcome).toBe("ok");
        expect(boqHop.recordIds.length).toBe(2); // importId + mappingId
      }
    }
    // Run digests differ per project (distinct real executions).
    const digests = new Set(campaign.projects.map((p) => p.executed!.runDigest));
    expect(digests.size).toBe(3);
  });

  test("sessions bind to the executed runs by digest AND verbatim record ids", async () => {
    const campaign = await shippedCampaign();
    for (const project of campaign.projects) {
      for (const session of project.sessions) {
        expect(sessionClassOf(session)).toBe("real");
        const executedEvidence = session.evidence.find((e) => e.kind === "executed_run");
        expect(executedEvidence).toBeDefined();
        if (executedEvidence?.kind !== "executed_run") {
          throw new Error("unreachable");
        }
        expect(executedEvidence.runDigest).toBe(project.executed!.runDigest);
        for (const hop of session.walk) {
          if (hop.sourceHopId === null) {
            continue;
          }
          const realHop = project.executed!.hops.find(
            (candidate) => candidate.hopId === hop.sourceHopId,
          );
          expect(realHop).toBeDefined();
          for (const recordId of hop.recordIds) {
            expect(realHop!.recordIds).toContain(recordId);
          }
        }
      }
    }
  });

  test("byte-identical recomputation: two runs produce identical digests", async () => {
    const first = await runShippedPilotCampaign();
    const second = await runShippedPilotCampaign();
    expect(first.reproducibilityDigest).toBe(second.reproducibilityDigest);
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
    expect(campaignDigestOf(first)).toBe(campaignDigestOf(second));
  });

  test("the injected clock stamps generatedAt; the digest is clock-independent", async () => {
    const instant = "2026-06-01T12:00:00.000Z";
    const campaign = await runShippedPilotCampaign({
      campaign: { clock: (): string => instant },
    });
    expect(campaign.generatedAt).toBe(instant);
    const baseline = await shippedCampaign();
    expect(campaign.reproducibilityDigest).toBe(baseline.reproducibilityDigest);
    expect(PILOT_CLOCK.campaign).toBe("2026-05-04T08:00:00.000Z");
  });

  test("a degraded execution is reported per project and never hidden", async () => {
    const campaign = await runShippedPilotCampaign({
      campaign: {
        degradationsByProjectId: {
          "pilot-small-northwing": {
            corruptedCaptureAssetId: "depth:surface:room-104:ceiling",
          },
        },
      },
    });
    const small = campaign.projects.find((p) => p.projectId === "pilot-small-northwing")!;
    expect(small.executed!.criticalExecutionFailure).toBe(true);
    expect(small.executed!.stoppedAt).not.toBeNull();
    expect(small.executed!.stopReason!.code).toBeTruthy();
    // The healthy projects stay healthy and visible.
    const healthy = campaign.projects.filter((p) => !p.executed!.criticalExecutionFailure);
    expect(healthy.length).toBe(2);
    // The failing project's sessions still parse (the recorder binds only
    // to hops that ran; the honest walk records the failure).
    expect(small.sessions.length).toBeGreaterThan(0);
  });

  test("a session claiming a foreign run digest is a typed binding refusal", async () => {
    const spec: PilotCampaignSpec = {
      ...shippedPilotCampaignSpec(),
      sessionRecorder: (context) => {
        const base = shippedPilotCampaignSpec().sessionRecorder(context);
        if (context.project.projectId !== "pilot-small-northwing" || context.executed === null) {
          return base;
        }
        return base.map((session) => ({
          ...session,
          evidence: session.evidence.map((entry) =>
            entry.kind === "executed_run"
              ? { ...entry, runDigest: "f".repeat(64) }
              : entry,
          ),
        }));
      },
    };
    try {
      await runPilotCampaign(spec);
      throw new Error("accepted a forged run digest");
    } catch (error) {
      expect(isPilotError(error)).toBe(true);
      expect((error as PilotError).code).toBe("evidence_binding_mismatch");
    }
  });

  test("a session claiming records the run did not produce is a typed refusal", async () => {
    const spec: PilotCampaignSpec = {
      ...shippedPilotCampaignSpec(),
      sessionRecorder: (context) => {
        const base = shippedPilotCampaignSpec().sessionRecorder(context);
        if (context.project.projectId !== "pilot-small-northwing" || context.executed === null) {
          return base;
        }
        return base.map((session) => ({
          ...session,
          walk: session.walk.map((hop) =>
            hop.sourceHopId === "mission" ? { ...hop, recordIds: ["forged-mission-id"] } : hop,
          ),
          evidence: session.evidence.map((entry) =>
            entry.kind === "executed_run"
              ? {
                  ...entry,
                  hopRecordIds: { ...entry.hopRecordIds, mission: ["forged-mission-id"] },
                }
              : entry,
          ),
        }));
      },
    };
    try {
      await runPilotCampaign(spec);
      throw new Error("accepted forged record ids");
    } catch (error) {
      expect((error as PilotError).code).toBe("evidence_binding_mismatch");
    }
  });

  test("a session recorded under the wrong context is a typed refusal", async () => {
    const spec: PilotCampaignSpec = {
      ...shippedPilotCampaignSpec(),
      sessionRecorder: (context) => {
        const base = shippedPilotCampaignSpec().sessionRecorder(context);
        if (context.project.projectId !== "pilot-small-northwing") {
          return base;
        }
        return base.map((session) => ({
          ...session,
          projectId: "some-other-project",
        })) as readonly PilotSessionRecord[];
      },
    };
    try {
      await runPilotCampaign(spec);
      throw new Error("accepted a context-mismatched session");
    } catch (error) {
      expect((error as PilotError).code).toBe("session_context_mismatch");
    }
  });

  test("an unknown scenario id is refused (the lab's own typed refusal)", () => {
    const spec: PilotCampaignSpec = {
      ...shippedPilotCampaignSpec(),
      environments: [
        {
          ...shippedPilotCampaignSpec().environments[0]!,
          projects: [
            { projectId: "p-bad", scenarioId: "lab-does-not-exist" },
          ],
        },
        shippedPilotCampaignSpec().environments[1]!,
      ],
    };
    expect(spec.environments[0]!.projects[0]!.scenarioId).toBe("lab-does-not-exist");
    expect(() => scenarioById("lab-does-not-exist")).toThrow(
      /lab scenario not found: lab-does-not-exist/,
    );
  });

  test("duplicate project ids across environments are a typed spec refusal", async () => {
    const spec: PilotCampaignSpec = {
      ...shippedPilotCampaignSpec(),
      environments: [
        shippedPilotCampaignSpec().environments[0]!,
        {
          ...shippedPilotCampaignSpec().environments[1]!,
          projects: [{ projectId: "pilot-large-centralblock", scenarioId: "lab-room-104-defect" }],
        },
      ],
    };
    try {
      await runPilotCampaign(spec);
      throw new Error("accepted duplicate project ids");
    } catch (error) {
      expect((error as PilotError).code).toBe("invalid_campaign_spec");
    }
  });
});

describe("the synthetic-only campaign (honest non-evidence)", () => {
  test("projects carry no executed run; sessions classify synthetic; the projection is recorded", async () => {
    const campaign = await runPilotCampaign(syntheticOnlyPilotCampaignSpec());
    expect(campaign.campaignId).toBe("pilot-campaign-synthetic-projection");
    for (const project of campaign.projects) {
      expect(project.executed).toBeNull();
      for (const session of project.sessions) {
        expect(sessionClassOf(session)).toBe("synthetic");
        expect(session.evidence[0]!.kind).toBe("synthetic_projection");
      }
    }
    expect(campaign.projectedAdoption).toBeDefined();
    expect(campaign.projectedAdoption!.projectedUsers).toBe(250);
    expect(campaign.projectedAdoption!.generator).toBe("projected-activity-v1");
    // Environment-level NOT_OBSERVED declarations propagate to project rows.
    const declared = await runShippedPilotCampaign({
      smallEnvNotObserved: ["return-path"],
    });
    const small = declared.projects.find((p) => p.icpClass === "small")!;
    expect(small.notObserved).toEqual(["return-path"]);
    const large = declared.projects.find((p) => p.icpClass === "large")!;
    expect(large.notObserved).toEqual([]);
  });

  test("an executed-evidence session under a synthetic project is a typed refusal", async () => {
    const spec: PilotCampaignSpec = {
      ...syntheticOnlyPilotCampaignSpec(),
      sessionRecorder: (context) => {
        const base = syntheticOnlyPilotCampaignSpec().sessionRecorder(context);
        if (context.project.projectId !== "pilot-small-northwing") {
          return base;
        }
        return base.map((session) => ({
          ...session,
          evidence: [
            {
              kind: "executed_run" as const,
              runDigest: "a".repeat(64),
              hopRecordIds: {},
            },
          ],
        })) as readonly PilotSessionRecord[];
      },
    };
    try {
      await runPilotCampaign(spec);
      throw new Error("accepted executed evidence under a synthetic project");
    } catch (error) {
      expect((error as PilotError).code).toBe("evidence_binding_mismatch");
    }
  });
});

describe("run digests (canonical, content-derived)", () => {
  test("a project's executed-run digest is stable across campaigns", async () => {
    const first = await shippedCampaign();
    const second = await runShippedPilotCampaign();
    for (const project of first.projects) {
      const again = second.projects.find((p) => p.projectId === project.projectId)!;
      expect(again.executed!.runDigest).toBe(project.executed!.runDigest);
    }
  });
});
