/**
 * Adaptive mission planner tests (AISE-007) — device adaptation, escalation,
 * unknown-capability discipline, contract validation and determinism.
 *
 * Core acceptance under test (work order §007 + R1): the SAME task (intent +
 * fixed assurance) yields DIFFERENT plans for different devices — step count
 * grows as the device weakens — while the assurance target stays byte-for-byte
 * identical; limitations, substitutions and escalation paths are explicit.
 */

import { describe, expect, test } from "bun:test";
import type { CaptureMission, EvidenceMethod } from "@aise/shared-contracts";
import { createMissionPlanner } from "./planner";
import type { PlanningResult } from "./planner";
import {
  assertMissionContractValid,
  CAMERA_AND_TRACKING_DEAD_PROFILE,
  canonicalMissionText,
  CONDITION_INTENT,
  counterIdFactory,
  deterministicPlanner,
  DIMENSIONAL_INTENT,
  FIXED_ASSURANCE,
  FIXED_NOW,
  FLAGSHIP_PROFILE,
  GENERAL_INTENT,
  LOWEND_PROFILE,
  makeProfile,
  MIDRANGE_NO_DEPTH_PROFILE,
  RECONSTRUCTION_INTENT,
  schemaProjection,
} from "./testkit";

/** Plan a dimensional mission for a device (deterministic injections). */
function planDimensional(profile: typeof FLAGSHIP_PROFILE): PlanningResult {
  return deterministicPlanner().plan({
    intent: DIMENSIONAL_INTENT,
    assurance: { ...FIXED_ASSURANCE },
    deviceProfile: profile,
  });
}

function missionOf(result: PlanningResult): CaptureMission {
  return result.mission;
}

function stepsWithMethod(mission: CaptureMission, method: EvidenceMethod) {
  return mission.steps.filter((step) => step.method === method);
}

/**
 * Steps that EXECUTE a requirement's method as a fallback: either the
 * method differs from the requirement's preferred method, or the preferred
 * method itself runs degraded (a substitution of its own stronger claim).
 * Device-adaptation question steps are not method substitutions.
 */
function fallbackSteps(mission: CaptureMission) {
  return mission.steps.filter((step) => {
    const requirement = mission.requiredEvidence.find((candidate) =>
      step.requirementRefs.includes(candidate.requirementId),
    );
    if (requirement === undefined) {
      return false;
    }
    const inChain = [requirement.preferredMethod, ...requirement.fallbackMethods].includes(
      step.method,
    );
    return (
      inChain &&
      (step.method !== requirement.preferredMethod ||
        step.instructions.includes("Device limitation"))
    );
  });
}

/** Planner mission `planning` passthrough record (typed accessor). */
function planningRecord(mission: CaptureMission) {
  return (mission as { planning?: Record<string, unknown> }).planning ?? {};
}

/** Planner mission `evidenceGaps` passthrough array (typed accessor). */
function evidenceGapsOf(mission: CaptureMission) {
  return (mission as { evidenceGaps?: Array<{ kind: string; description: string }> }).evidenceGaps ?? [];
}

describe("intent classification", () => {
  test("keyword classes map to the documented templates", () => {
    const planner = deterministicPlanner();
    const classify = (intent: string): string =>
      planningRecord(
        missionOf(
          planner.plan({
            intent,
            assurance: { ...FIXED_ASSURANCE },
            deviceProfile: FLAGSHIP_PROFILE,
          }),
        ),
      )["intentClass"] as string;
    expect(classify(DIMENSIONAL_INTENT)).toBe("dimensional");
    expect(classify("measurement of the stairwell")).toBe("dimensional");
    expect(classify(CONDITION_INTENT)).toBe("condition");
    expect(classify("survey the condition of the facade")).toBe("condition");
    expect(classify(RECONSTRUCTION_INTENT)).toBe("reconstruction");
    expect(classify("build a 3d model of level 2")).toBe("reconstruction");
    expect(classify(GENERAL_INTENT)).toBe("general");
  });
});

describe("core device adaptation: one task, three devices", () => {
  const flagship = missionOf(planDimensional(FLAGSHIP_PROFILE));
  const midrange = missionOf(planDimensional(MIDRANGE_NO_DEPTH_PROFILE));
  const lowend = missionOf(planDimensional(LOWEND_PROFILE));
  const missions = [flagship, midrange, lowend];

  test("step count strictly increases as the device weakens (a < b < c)", () => {
    expect(flagship.steps.length).toBe(2); // depth scan + documentary stills
    expect(midrange.steps.length).toBe(4); // + reference-control capture pair, + questions
    expect(lowend.steps.length).toBe(5); // + degraded-reference manual corroboration
    expect(flagship.steps.length).toBeLessThan(midrange.steps.length);
    expect(midrange.steps.length).toBeLessThan(lowend.steps.length);
  });

  test("assurance target is byte-identical across all three devices", () => {
    const texts = missions.map((mission) => JSON.stringify(mission.assurance));
    expect(new Set(texts).size).toBe(1);
    expect(missions[0]!.assurance.summary).toBe(FIXED_ASSURANCE.summary);
    expect(missions[0]!.assurance.assuranceProfileRef).toBe(FIXED_ASSURANCE.assuranceProfileRef);
  });

  test("the same intent text is preserved verbatim", () => {
    for (const mission of missions) {
      expect(mission.intent).toBe(DIMENSIONAL_INTENT);
    }
  });

  test("reference-control steps are present for the mid-range and low-end devices", () => {
    for (const mission of [midrange, lowend]) {
      expect(stepsWithMethod(mission, "CALIBRATED_REFERENCE").length).toBe(2);
      expect(mission.referenceControls.length).toBe(1);
      const control = mission.referenceControls[0]!;
      expect(control.kind).toBe("scale_bar");
      expect(control.knownDimensions[0]!.label).toBe("length");
      expect(control.knownDimensions[0]!.value).toBe(1);
      expect(control.knownDimensions[0]!.unit).toBe("m");
      expect(control.knownDimensions[0]!.uncertainty).toEqual({
        kind: "DIMENSIONAL",
        plusMinus: 0.0005,
      });
      expect(control.description).toContain("MUST confirm");
    }
    // The flagship needs no reference control (depth sensing carries scale).
    expect(flagship.referenceControls).toHaveLength(0);
    expect(stepsWithMethod(flagship, "CALIBRATED_REFERENCE")).toHaveLength(0);
  });

  test("manual measurement steps appear on the low-end device only", () => {
    expect(stepsWithMethod(lowend, "MANUAL_MEASUREMENT").length).toBe(1);
    expect(stepsWithMethod(flagship, "MANUAL_MEASUREMENT")).toHaveLength(0);
    expect(stepsWithMethod(midrange, "MANUAL_MEASUREMENT")).toHaveLength(0);
    const manual = stepsWithMethod(lowend, "MANUAL_MEASUREMENT")[0]!;
    expect(manual.mandatory).toBe(true);
    expect(manual.instructions).toContain("corroborat");
  });

  test("every fallback step's instructions mention substitution semantics", () => {
    for (const mission of [midrange, lowend]) {
      const substituted = fallbackSteps(mission);
      expect(substituted.length).toBeGreaterThan(0);
      for (const step of substituted) {
        expect(step.instructions).toContain("Method substitution");
        expect(step.instructions).toContain("NOT preserved");
        expect(step.instructions).toContain("assurance target itself is unchanged");
      }
    }
    // A clean preferred-method execution never carries a substitution note.
    expect(flagship.steps.every((step) => !step.instructions.includes("Method substitution"))).toBe(true);
  });

  test("weaker devices get higher still-count guidance and question steps", () => {
    const stillInstructions = (mission: CaptureMission): string =>
      stepsWithMethod(mission, "STILL_IMAGERY")[0]!.instructions;
    expect(stillInstructions(flagship)).toContain("at least 12 stills");
    expect(stillInstructions(midrange)).toContain("at least 18 stills");
    expect(stillInstructions(lowend)).toContain("at least 24 stills");
    expect(stepsWithMethod(flagship, "HUMAN_ANSWER")).toHaveLength(0);
    expect(stepsWithMethod(midrange, "HUMAN_ANSWER").length).toBe(1);
    expect(stepsWithMethod(lowend, "HUMAN_ANSWER").length).toBe(1);
    // IMU support improves still-step guidance text only.
    expect(stillInstructions(flagship)).toContain("IMU sensor fusion");
  });

  test("steps carry ascending sequences, mandatory flags and requirement refs", () => {
    for (const mission of missions) {
      mission.steps.forEach((step, index) => {
        expect(step.sequence).toBe(index);
        expect(step.requirementRefs.length).toBeGreaterThan(0);
        expect(typeof step.mandatory).toBe("boolean");
        expect(step.contractVersion).toBe("1.0.0");
      });
    }
  });

  test("limitations are explicit and reference the blocking domains", () => {
    expect(planningRecord(flagship).materialLimitations).toEqual([]);
    const midLimitations = planningRecord(midrange).materialLimitations as string[];
    expect(midLimitations.some((entry) => /depth unavailable/.test(entry))).toBe(true);
    const lowLimitations = planningRecord(lowend).materialLimitations as string[];
    expect(lowLimitations.some((entry) => /camera degraded/.test(entry))).toBe(true);
    expect(lowLimitations.some((entry) => /tracking unavailable/.test(entry))).toBe(true);
    expect(lowLimitations.some((entry) => /calibration degraded/.test(entry))).toBe(true);
  });

  test("the capability snapshot is persisted on the mission verbatim", () => {
    const snapshot = (midrange as { capabilitySnapshot?: typeof FLAGSHIP_PROFILE })
      .capabilitySnapshot;
    expect(snapshot).toEqual(MIDRANGE_NO_DEPTH_PROFILE);
    expect(snapshot!.profileId).toBe("cap-profile-test-007");
  });

  test("planned missions validate against the mission contracts", () => {
    for (const mission of missions) {
      assertMissionContractValid(mission);
    }
  });
});

describe("escalation: inadequate device for the intent", () => {
  test("camera+tracking-dead device escalates a reconstruction intent", () => {
    const result = deterministicPlanner().plan({
      intent: RECONSTRUCTION_INTENT,
      assurance: { ...FIXED_ASSURANCE },
      deviceProfile: CAMERA_AND_TRACKING_DEAD_PROFILE,
    });
    expect(result.kind).toBe("escalated");
    const mission = result.mission;
    expect(mission.state).toBe("escalated");
    // The reason names the domains and their statuses.
    if (result.kind !== "escalated") {
      throw new Error("unreachable");
    }
    expect(result.escalationReason).toContain("tracking: unavailable");
    expect(result.escalationReason).toContain("camera: unavailable");
    expect(result.escalationReason).toContain("VISUAL_RECONSTRUCTION");
    // The mission carries the explicit escalation marker in its passthrough
    // fields, mirroring the planning result.
    const escalation = (mission as { escalation?: { reason: string; recommendation: string } })
      .escalation;
    expect(escalation?.reason).toBe(result.escalationReason);
    expect(escalation?.recommendation).toContain("specialist instrument");
    expect(escalation?.recommendation).toContain("not lowered");
    // No reconstruction/imagery step can be planned; the assurance survives.
    expect(stepsWithMethod(mission, "VISUAL_RECONSTRUCTION")).toHaveLength(0);
    expect(stepsWithMethod(mission, "STILL_IMAGERY")).toHaveLength(0);
    expect(stepsWithMethod(mission, "VIDEO_FOOTAGE")).toHaveLength(0);
    expect(JSON.stringify(mission.assurance)).toBe(JSON.stringify(FIXED_ASSURANCE));
    assertMissionContractValid(mission);
  });

  test("a capable device plans the same reconstruction intent without escalating", () => {
    const result = deterministicPlanner().plan({
      intent: RECONSTRUCTION_INTENT,
      assurance: { ...FIXED_ASSURANCE },
      deviceProfile: FLAGSHIP_PROFILE,
    });
    expect(result.kind).toBe("mission");
    expect(result.mission.state).toBe("draft");
    expect(stepsWithMethod(result.mission, "VISUAL_RECONSTRUCTION").length).toBe(1);
    expect((result.mission as { escalation?: unknown }).escalation).toBeUndefined();
  });

  test("device-independent fallbacks keep a dimensional mission plannable", () => {
    // Even with every method-gating domain unusable, the dimensional chain
    // resolves to MANUAL_MEASUREMENT — escalation is intent-dependent.
    const result = deterministicPlanner().plan({
      intent: DIMENSIONAL_INTENT,
      assurance: { ...FIXED_ASSURANCE },
      deviceProfile: makeProfile({
        camera: "unavailable",
        depth: "unavailable",
        tracking: "unavailable",
        calibration: "unavailable",
      }),
    });
    expect(result.kind).toBe("mission");
    expect(stepsWithMethod(result.mission, "MANUAL_MEASUREMENT").length).toBe(1);
    const manual = stepsWithMethod(result.mission, "MANUAL_MEASUREMENT")[0]!;
    expect(manual.instructions).toContain("Method substitution");
  });
});

describe("unknown-capability discipline (never collapse unknown to unavailable)", () => {
  const supported = missionOf(planDimensional(makeProfile({ depth: "supported" })));
  const unknown = missionOf(planDimensional(makeProfile({ depth: "unknown" })));
  const unavailable = missionOf(planDimensional(makeProfile({ depth: "unavailable" })));

  test("depth unknown: no depth step, a gap describes it, limitations stay silent", () => {
    expect(stepsWithMethod(unknown, "DEPTH_SENSING")).toHaveLength(0);
    const gaps = evidenceGapsOf(unknown);
    expect(gaps.length).toBe(1);
    expect(gaps[0]!.kind).toBe("MISSING");
    expect(gaps[0]!.description).toContain("depth");
    expect(gaps[0]!.description).toContain("undetermined");
    expect(gaps[0]!.description).toContain("not absence of capability");
    // NOT unavailable behavior: no "not usable" limitation entry is emitted.
    const limitations = planningRecord(unknown).materialLimitations as string[];
    expect(limitations.some((entry) => /depth unavailable/.test(entry))).toBe(false);
    expect(planningRecord(unknown).deviceSummary).toMatchObject({ depth: "unknown" });
  });

  test("mutation: supported -> unknown changes the plan and adds the gap", () => {
    expect(stepsWithMethod(supported, "DEPTH_SENSING").length).toBe(1);
    expect(evidenceGapsOf(supported)).toHaveLength(0);
    expect(canonicalMissionText(supported)).not.toBe(canonicalMissionText(unknown));
    expect(evidenceGapsOf(unknown).length).toBe(1);
    expect(stepsWithMethod(unknown, "DEPTH_SENSING")).toHaveLength(0);
    // The unknown plan degrades conservatively to reference-control capture.
    expect(stepsWithMethod(unknown, "CALIBRATED_REFERENCE").length).toBe(2);
  });

  test("mutation: unknown -> unavailable removes the gap and adds a limitation", () => {
    expect(evidenceGapsOf(unavailable)).toHaveLength(0);
    const limitations = planningRecord(unavailable).materialLimitations as string[];
    expect(limitations.some((entry) => /depth unavailable/.test(entry))).toBe(true);
    // Unknown and unavailable remain DISTINCT plans (byte-different).
    expect(canonicalMissionText(unknown)).not.toBe(canonicalMissionText(unavailable));
    expect(planningRecord(unavailable).deviceSummary).toMatchObject({ depth: "unavailable" });
    assertMissionContractValid(unknown);
  });
});

describe("existing evidence hints", () => {
  test("matching hints turn capture steps into coverage verification", () => {
    const result = deterministicPlanner().plan({
      intent: DIMENSIONAL_INTENT,
      assurance: { ...FIXED_ASSURANCE },
      deviceProfile: FLAGSHIP_PROFILE,
      existingEvidence: [
        { method: "STILL_IMAGERY", coverageNote: "12 stills of the west wall captured" },
      ],
    });
    const mission = result.mission;
    const stillStep = stepsWithMethod(mission, "STILL_IMAGERY")[0]!;
    expect(stillStep.instructions).toContain("Existing STILL_IMAGERY evidence");
    expect(stillStep.instructions).toContain("12 stills of the west wall captured");
    expect(stillStep.mandatory).toBe(false);
    // Non-matching steps are untouched.
    const depthStep = stepsWithMethod(mission, "DEPTH_SENSING")[0]!;
    expect(depthStep.mandatory).toBe(true);
    expect(depthStep.instructions).not.toContain("Existing");
    const planning = planningRecord(mission);
    expect(planning.existingEvidence).toEqual([
      { method: "STILL_IMAGERY", coverageNote: "12 stills of the west wall captured" },
    ]);
    assertMissionContractValid(mission);
  });
});

describe("determinism", () => {
  test("identical inputs + identical injections produce byte-identical missions", () => {
    const planOnce = (): string => {
      const planner = createMissionPlanner({
        clock: () => FIXED_NOW,
        idFactory: counterIdFactory("id"),
      });
      const result = planner.plan({
        intent: DIMENSIONAL_INTENT,
        assurance: { ...FIXED_ASSURANCE },
        deviceProfile: LOWEND_PROFILE,
        existingEvidence: [{ method: "STILL_IMAGERY" }],
      });
      return canonicalMissionText(result.mission);
    };
    expect(planOnce()).toBe(planOnce());
  });

  test("the escalated path is deterministic too", () => {
    const planOnce = (): string =>
      canonicalMissionText(
        createMissionPlanner({ clock: () => FIXED_NOW, idFactory: counterIdFactory("id") }).plan({
          intent: RECONSTRUCTION_INTENT,
          assurance: { ...FIXED_ASSURANCE },
          deviceProfile: CAMERA_AND_TRACKING_DEAD_PROFILE,
        }).mission,
      );
    expect(planOnce()).toBe(planOnce());
  });

  test("created/updated stamps come from the injected clock", () => {
    const mission = missionOf(planDimensional(FLAGSHIP_PROFILE));
    expect(mission.createdAt).toBe(FIXED_NOW);
    expect(mission.updatedAt).toBe(FIXED_NOW);
    expect(mission.revision).toBe(0);
  });
});

describe("mission shape invariants", () => {
  test("required evidence declares preferred methods and ordered fallbacks", () => {
    const mission = missionOf(planDimensional(FLAGSHIP_PROFILE));
    expect(mission.requiredEvidence.length).toBe(2);
    const primary = mission.requiredEvidence[0]!;
    expect(primary.preferredMethod).toBe("DEPTH_SENSING");
    expect(primary.fallbackMethods).toEqual([
      "CALIBRATED_REFERENCE",
      "MANUAL_MEASUREMENT",
      "SPECIALIST_INSTRUMENT",
    ]);
    const documentary = mission.requiredEvidence[1]!;
    expect(documentary.preferredMethod).toBe("STILL_IMAGERY");
  });

  test("the schema-field projection strict-decodes for every intent class", () => {
    for (const intent of [DIMENSIONAL_INTENT, RECONSTRUCTION_INTENT, CONDITION_INTENT, GENERAL_INTENT]) {
      const mission = missionOf(
        deterministicPlanner().plan({
          intent,
          assurance: { summary: "Documented to the task's fixed standard" },
          deviceProfile: LOWEND_PROFILE,
        }),
      );
      assertMissionContractValid(mission);
      expect(Object.keys(schemaProjection(mission)).sort()[0]).toBe("assurance");
    }
  });
});
