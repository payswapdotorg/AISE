/**
 * WORLD-P4 — the HUD property/fuzz tests: deterministic (a seeded LCG
 * — no Math.random, no clock, no network) generated inputs exercising
 * the panel projections' invariants at volume.
 */

import { describe, expect, test } from "bun:test";
import {
  projectObjectivePanel,
  projectEvidencePanel,
  projectConstraintsPanel,
  projectAgentPanel,
  projectValidationPanel,
  projectCostBoqPanel,
  projectTimelinePanel,
} from "./contract";
import type {
  EngineeringProblem,
  MissingEvidenceReport,
  ProblemAction,
  DeterministicCheckGateVerdict,
} from "@aise/world-layer2-experience";
import type {
  CoordinationConflictRecord,
  QuantityConsequenceProjection,
  SequencedExecution,
} from "@aise/world-layer3-experience";

/** A seeded LCG — deterministic fuzzing (the determinism law). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const AT = "2026-09-16T12:00:00.000Z";

function pick<T>(random: () => number, options: readonly T[]): T {
  return options[Math.floor(random() * options.length)]!;
}

describe("property: OBJECTIVE over generated problem/conflict sets", () => {
  test("clash links are always sorted by conflictId and every binding is carried", () => {
    const random = seededRandom(20260916);
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const conflictCount = Math.floor(random() * 5);
      const clashProblems = Array.from({ length: conflictCount }, (_, index) => ({
        conflictId: `conflict-${String(Math.floor(random() * 1000)).padStart(4, "0")}-${index}`,
        reportId: "report-001",
        pairId: `pair-${index}`,
        verdict: pick(random, ["clash", "within-tolerance"] as const),
        separationMetres: random() - 0.5,
        problemBinding: {
          problemId: "problem-001",
          problemStatus: "open",
          problemTitle: "t",
        },
        recordedAt: AT,
      })) as unknown as readonly CoordinationConflictRecord[];
      const panel = projectObjectivePanel({
        primaryProblem: null,
        clashConflicts: clashProblems,
      });
      expect(panel.ok).toBe(true);
      if (!panel.ok) continue;
      const ids = panel.value.data?.clashProblems.map((c) => c.conflictId) ?? [];
      expect(ids).toEqual([...ids].sort());
      expect(ids).toHaveLength(conflictCount);
    }
  });

  test("the empty/no-empty boundary is exact (problem XOR conflicts present → POPULATED)", () => {
    const random = seededRandom(42);
    const problem = {
      problemId: "problem-001",
      title: "t",
      statement: "s",
      questionKind: "what",
      status: "open",
      spatialBinding: { sceneRevision: 1, elementIds: ["e1"], captureEvidenceContentIds: [] },
      openedBy: { actorId: "a1", role: "engineer" },
      openedAt: AT,
    } as unknown as EngineeringProblem;
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const withProblem = random() < 0.5;
      const withConflicts = random() < 0.5;
      const conflicts = withConflicts
        ? [
            {
              conflictId: "c1",
              reportId: "r",
              pairId: "p",
              verdict: "clash",
              separationMetres: -0.01,
              problemBinding: { problemId: "problem-001", problemStatus: "open", problemTitle: "t" },
              recordedAt: AT,
            } as unknown as CoordinationConflictRecord,
          ]
        : null;
      const panel = projectObjectivePanel({
        primaryProblem: withProblem ? problem : null,
        clashConflicts: conflicts,
      });
      expect(panel.ok).toBe(true);
      if (!panel.ok) continue;
      if (withProblem || withConflicts) {
        expect(panel.value.contentState).toBe("POPULATED");
      } else {
        expect(panel.value.contentState).toBe("EMPTY");
      }
    }
  });
});

describe("property: EVIDENCE over generated gap sets", () => {
  test("gapCount always equals the carried gaps and open tasks are counted exactly", () => {
    const random = seededRandom(777);
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const gapCount = Math.floor(random() * 6);
      const gaps = Array.from({ length: gapCount }, (_, index) => ({
        gapId: `gap-${index}`,
        requirementId: `req-${index}`,
        kind: pick(random, ["MISSING", "WEAK", "AMBIGUOUS"] as const),
        detail: `what is missing ${index}`,
        remediationTask: {
          taskId: `task-${index}`,
          status: pick(random, ["open", "collected", "waived"] as const),
        },
      }));
      const report = {
        reportId: `report-${iteration}`,
        problemId: "problem-001",
        verdict: pick(random, ["READY", "READY_WITH_NOTES", "NOT_READY"] as const),
        gaps,
        perRequirement: gaps.map((gap) => ({ requirementId: gap.requirementId })),
        detectedAt: AT,
      } as unknown as MissingEvidenceReport;
      const panel = projectEvidencePanel({ report });
      expect(panel.ok).toBe(true);
      if (!panel.ok) continue;
      expect(panel.value.data!.gapCount).toBe(gapCount);
      const expectedOpen = gaps.filter((g) => g.remediationTask.status === "open").length;
      expect(panel.value.data!.openRemediationTaskCount).toBe(expectedOpen);
    }
  });
});

describe("property: CONSTRAINTS over generated observation sets", () => {
  test("output order is always the sorted constraintId order (deterministic presentation)", () => {
    const random = seededRandom(31337);
    const kinds = [
      "evidence-requirement",
      "dimension",
      "material",
      "cost",
      "client",
      "regulatory",
    ] as const;
    const lanes = ["layer1-declared", "layer2-context", "layer3-what-if"] as const;
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const count = Math.floor(random() * 8);
      const observations = Array.from({ length: count }, (_, index) => ({
        constraintId: `c-${String(Math.floor(random() * 10000)).padStart(5, "0")}-${index}`,
        kind: pick(random, kinds),
        statement: `statement ${index}`,
        sourceLane: pick(random, lanes),
        sourceRef: `ref-${index}`,
      }));
      const panel = projectConstraintsPanel({ observations });
      expect(panel.ok).toBe(true);
      if (!panel.ok) continue;
      if (observations.length === 0) {
        expect(panel.value.contentState).toBe("EMPTY");
        continue;
      }
      const ids = panel.value.data!.constraints.map((c) => c.constraintId);
      expect(ids).toEqual([...ids].sort());
    }
  });
});

describe("property: AGENT over generated action sets", () => {
  test("only open/in_progress actions appear, each with its owner", () => {
    const random = seededRandom(90210);
    const statuses = ["open", "in_progress", "completed", "blocked"] as const;
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const count = Math.floor(random() * 8);
      const actions = Array.from({ length: count }, (_, index) => ({
        actionId: `action-${index}`,
        problemId: "problem-001",
        actionKind: "request_evidence",
        payload: { actionKind: "request_evidence" },
        ownership: {
          owner: { actorId: `actor-${index}`, role: "engineer" },
          assignedBy: { actorId: "a", role: "engineer" },
          assignedAt: AT,
        },
        status: pick(random, statuses),
        evidenceContentIds: [],
        createdAt: AT,
      })) as unknown as readonly ProblemAction[];
      const panel = projectAgentPanel({
        activeOperator: { operatorId: "op", role: "engineer" },
        actions,
      });
      expect(panel.ok).toBe(true);
      if (!panel.ok) continue;
      const open = panel.value.data!.openActions;
      expect(open.every((a) => a.status === "open" || a.status === "in_progress")).toBe(true);
      expect(
        open.length ===
          actions.filter(
            (a) => (a as ProblemAction).status === "open" || (a as ProblemAction).status === "in_progress",
          ).length,
      ).toBe(true);
    }
  });
});

describe("property: VALIDATION + COST/BOQ + TIMELINE shape invariants", () => {
  test("gate-derived counts always mirror the cited gate (law #8: verbatim citation)", () => {
    const random = seededRandom(5150);
    for (let iteration = 0; iteration < 25; iteration += 1) {
      const engineOwned = Math.floor(random() * 4);
      const advisory = Math.floor(random() * 4);
      const failures = Math.floor(random() * 3);
      const gate = {
        gateId: `gate-${iteration}`,
        problemId: "problem-001",
        verdict: pick(random, ["pass", "fail", "unknown", "review-needed", "refused"] as const),
        engineOwnedOutcome: null,
        engineOwnedCheckIds: Array.from({ length: engineOwned }, (_, i) => `ec-${i}`),
        advisoryCheckIds: Array.from({ length: advisory }, (_, i) => `ac-${i}`),
        failures: Array.from({ length: failures }, (_, i) => ({ failureKind: "x", detail: `d${i}` })),
        gatedAt: AT,
      } as unknown as DeterministicCheckGateVerdict;
      const panel = projectValidationPanel({ checkGate: gate, replayVerified: false });
      expect(panel.ok).toBe(true);
      if (!panel.ok) continue;
      expect(panel.value.data!.engineOwnedCheckCount).toBe(engineOwned);
      expect(panel.value.data!.advisoryCheckCount).toBe(advisory);
      expect(panel.value.data!.failureCount).toBe(failures);
      expect(panel.value.data!.replayVerified).toBe(false);
    }
  });

  test("every projected BOQ line keeps a verbatim unit + calculation reference", () => {
    const random = seededRandom(8675309);
    for (let iteration = 0; iteration < 25; iteration += 1) {
      const lineCount = Math.floor(random() * 5);
      const projection = {
        projectionId: `projection-${iteration}`,
        solutionId: "solution-demo-001",
        versionNumber: 1,
        epistemicClass: "PROPOSED" as const,
        baselineBoqId: null,
        lines: Array.from({ length: lineCount }, (_, index) => ({
          sectionId: `section-${index}`,
          sectionTitle: "s",
          buildingElement: "b",
          activity: "a",
          itemDescription: "i",
          direction: pick(random, ["added", "removed", "changed"] as const),
          dimension: "area",
          value: random() * 100,
          unit: "m2",
          calculationRef: "engine-calc-ref-001",
          contributingOperationIds: [`op-${index}`],
        })),
        operationsWithoutQuantityEffects: [],
      } as unknown as QuantityConsequenceProjection;
      const panel = projectCostBoqPanel({ projection });
      expect(panel.ok).toBe(true);
      if (!panel.ok) continue;
      expect(panel.value.data!.lineCount).toBe(lineCount);
      for (const line of panel.value.data!.lines) {
        expect(line.unit).toBe("m2");
        expect(line.calculationRef).toBe("engine-calc-ref-001");
      }
    }
  });

  test("the playback phase count always mirrors the sequence (verbatim)", () => {
    const random = seededRandom(1234);
    for (let iteration = 0; iteration < 25; iteration += 1) {
      const phaseCount = Math.floor(random() * 6);
      const activityCount = Math.floor(random() * 6) + 1;
      const sequence = {
        solutionId: "solution-demo-001",
        versionNumber: 1,
        trajectory: {
          trajectoryId: `trajectory-${iteration}`,
          makespanHours: random() * 100,
          activities: Array.from({ length: activityCount }, (_, i) => ({ id: `a${i}` })),
        },
        playbackPhases: Array.from({ length: phaseCount }, (_, index) => ({
          phase: null,
          activeOperationIds: [],
          stateIndices: [index],
        })),
      } as unknown as SequencedExecution;
      const panel = projectTimelinePanel({ sequence });
      expect(panel.ok).toBe(true);
      if (!panel.ok) continue;
      expect(panel.value.data!.phaseCount).toBe(phaseCount);
      expect(panel.value.data!.activityCount).toBe(activityCount);
    }
  });
});
