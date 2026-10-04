/**
 * WORLD-P4 — the HUD family tests: the seven panel projections over
 * the REAL committed lane fixtures (the wiring doubles' LIVE
 * composition), asserting the honest states and the verbatim
 * citations (laws #1, #3, #8) plus the LIVE clash→problem wiring
 * (wiring note #4).
 */

import { describe, expect, test } from "bun:test";
import {
  referenceWorldStationSources,
} from "../wiring/doubles";
import {
  projectObjectivePanel,
  projectEvidencePanel,
  projectConstraintsPanel,
  projectAgentPanel,
  projectValidationPanel,
  projectCostBoqPanel,
  projectTimelinePanel,
  assembleHud,
  hudPanelSummaries,
  HUD_CONSTRAINT_KINDS,
  isHudConstraintKind,
  isHudConstraintSourceLane,
} from "./contract";

/** The committed fixture inputs (the reference station sources). */
const SOURCES = referenceWorldStationSources();

describe("OBJECTIVE — the current engineering problem + LIVE clash problems", () => {
  test("POPULATED: the P2 problem cites verbatim + the clash problems bind LIVE (wiring note #4)", () => {
    const problem = SOURCES.primaryProblem();
    const conflicts = SOURCES.clashConflicts();
    if (!problem.ok || !conflicts.ok) throw new Error("fixture sources refused");
    if (problem.value === null) throw new Error("fixture problem missing");
    const panel = projectObjectivePanel({
      primaryProblem: problem.value,
      clashConflicts: conflicts.value,
    });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("POPULATED");
    const data = panel.value.data!;
    expect(data.primaryProblem!.problemId).toBe(problem.value.problemId);
    expect(data.primaryProblem!.status).toBe(problem.value.status);
    /* The LIVE clash→problem binding: every conflict record's problem
     * binding points at the P2 problem (the panel shows the link). */
    expect(data.clashProblems.length).toBeGreaterThan(0);
    for (const link of data.clashProblems) {
      expect(link.problemId).toBe(problem.value.problemId);
      expect(link.verdict === "clash" || link.verdict === "within-tolerance").toBe(true);
      expect(Number.isFinite(link.separationMetres)).toBe(true);
    }
  });

  test("EMPTY is honest when no problem is open and no conflict is recorded", () => {
    const panel = projectObjectivePanel({
      primaryProblem: null,
      clashConflicts: null,
    });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("EMPTY");
    expect(panel.value.data).toBe(null);
    expect(panel.value.note).toContain("no engineering problem");
  });

  test("clash-only scope still POPULATES (conflicts without a primary problem)", () => {
    const conflicts = SOURCES.clashConflicts();
    if (!conflicts.ok) throw new Error("fixture source refused");
    const panel = projectObjectivePanel({
      primaryProblem: null,
      clashConflicts: conflicts.value,
    });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("POPULATED");
    expect(panel.value.data!.primaryProblem).toBe(null);
    expect(panel.value.data!.clashProblems.length).toBeGreaterThan(0);
  });
});

describe("EVIDENCE — the readiness state", () => {
  test("POPULATED: the P2 report's verdict + gaps are cited verbatim", () => {
    const report = SOURCES.evidenceReport();
    if (!report.ok || report.value === null) throw new Error("fixture source refused");
    const panel = projectEvidencePanel({ report: report.value });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("POPULATED");
    const data = panel.value.data!;
    expect(data.reportId).toBe(report.value.reportId);
    expect(data.readinessVerdict).toBe(report.value.verdict);
    expect(data.gapCount).toBe(report.value.gaps.length);
    expect(data.gaps.length).toBe(data.gaps.filter((gap) => gap.detail.length > 0).length);
  });

  test("EMPTY is honest when no report is bound (never a fabricated verdict)", () => {
    const panel = projectEvidencePanel({ report: null });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("EMPTY");
    expect(panel.value.note).toContain("no evidence readiness report");
  });
});

describe("CONSTRAINTS — the governed constraints", () => {
  test("POPULATED: observations derived from real lane records, validated + sorted", () => {
    const observations = SOURCES.constraintObservations();
    if (!observations.ok) throw new Error("fixture source refused");
    const panel = projectConstraintsPanel({ observations: observations.value });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("POPULATED");
    const data = panel.value.data!;
    expect(data.constraintCount).toBe(data.constraints.length);
    /* Every observation cites its lane record (the no-fabrication law). */
    for (const constraint of data.constraints) {
      expect(isHudConstraintKind(constraint.kind)).toBe(true);
      expect(isHudConstraintSourceLane(constraint.sourceLane)).toBe(true);
      expect(constraint.sourceRef === null || constraint.sourceRef.length > 0).toBe(true);
    }
    /* Sorted by constraintId (deterministic presentation). */
    const ids = data.constraints.map((c) => c.constraintId);
    expect(ids).toEqual([...ids].sort());
  });

  test("EMPTY is honest when no governed constraint is observed", () => {
    const panel = projectConstraintsPanel({ observations: null });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("EMPTY");
    expect(panel.value.note).toContain("no governed constraint");
  });

  test("the constraint kinds are the closed six", () => {
    expect(HUD_CONSTRAINT_KINDS).toEqual([
      "evidence-requirement",
      "dimension",
      "material",
      "cost",
      "client",
      "regulatory",
    ]);
    expect(isHudConstraintKind("cost")).toBe(true);
    expect(isHudConstraintKind("budget")).toBe(false);
  });
});

describe("AGENT — the active specialist / bounded action", () => {
  test("POPULATED: the operator + open actions with the propose-never-decide law", () => {
    const operator = SOURCES.activeOperator();
    const actions = SOURCES.actions();
    if (!operator.ok || !actions.ok) throw new Error("fixture sources refused");
    const panel = projectAgentPanel({
      activeOperator: operator.value,
      actions: actions.value,
    });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("POPULATED");
    const data = panel.value.data!;
    expect(data.activeOperator!.operatorId).toBe(operator.value!.operatorId);
    /* The structural law: the panel CITES the agent's non-authority. */
    expect(data.agentProposesNeverDecides).toBe(true);
    for (const action of data.openActions) {
      expect(action.status === "open" || action.status === "in_progress").toBe(true);
      expect(action.ownerActorId.length).toBeGreaterThan(0);
    }
  });

  test("EMPTY is honest when no operator is active and no action is open", () => {
    const panel = projectAgentPanel({ activeOperator: null, actions: [] });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("EMPTY");
    expect(panel.value.note).toContain("no specialist operator");
  });
});

describe("VALIDATION — the current solution status", () => {
  test("POPULATED: the P2 check gate + the P3 replay verification, cited verbatim", () => {
    const gate = SOURCES.checkGate();
    const replay = SOURCES.replayVerified();
    if (!gate.ok || !replay.ok) throw new Error("fixture sources refused");
    const panel = projectValidationPanel({
      checkGate: gate.value,
      replayVerified: replay.value,
    });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("POPULATED");
    const data = panel.value.data!;
    expect(data.checkGateId).toBe(gate.value!.gateId);
    expect(data.gateVerdict).toBe(gate.value!.verdict);
    expect(data.replayVerified).toBe(true);
  });

  test("replay-only scope still POPULATES (the P3 verification alone)", () => {
    const panel = projectValidationPanel({
      checkGate: null,
      replayVerified: true,
    });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("POPULATED");
    expect(panel.value.data!.checkGateId).toBe(null);
    expect(panel.value.data!.replayVerified).toBe(true);
  });

  test("EMPTY is honest when neither source is bound", () => {
    const panel = projectValidationPanel({ checkGate: null, replayVerified: null });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("EMPTY");
  });
});

describe("COST/BOQ — the live quantity consequence (a VIEW, never authority)", () => {
  test("POPULATED: the projection's lines are cited verbatim with PROPOSED epistemics", () => {
    const projection = SOURCES.quantityConsequence();
    if (!projection.ok || projection.value === null) throw new Error("fixture source refused");
    const panel = projectCostBoqPanel({ projection: projection.value });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("POPULATED");
    const data = panel.value.data!;
    expect(data.projectionId).toBe(projection.value.projectionId);
    expect(data.epistemicClass).toBe("PROPOSED");
    expect(data.lineCount).toBe(projection.value.lines.length);
    for (const line of data.lines) {
      expect(line.unit.length).toBeGreaterThan(0);
      expect(line.calculationRef.length).toBeGreaterThan(0);
      expect(line.contributingOperationIds.length).toBeGreaterThan(0);
    }
  });

  test("EMPTY is honest when no proposed operation is selected", () => {
    const panel = projectCostBoqPanel({ projection: null });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("EMPTY");
    expect(panel.value.note).toContain("no proposed operation is selected");
  });
});

describe("TIMELINE — the optional execution sequence / 4D view", () => {
  test("POPULATED: the trajectory + playback phases cited verbatim", () => {
    const sequence = SOURCES.executionSequence();
    if (!sequence.ok || sequence.value === null) throw new Error("fixture source refused");
    const panel = projectTimelinePanel({ sequence: sequence.value });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("POPULATED");
    const data = panel.value.data!;
    expect(data.trajectoryId).toBe(sequence.value.trajectory.trajectoryId);
    expect(data.makespanHours).toBe(sequence.value.trajectory.makespanHours);
    expect(data.phaseCount).toBe(sequence.value.playbackPhases.length);
    expect(data.activityCount).toBe(sequence.value.trajectory.activities.length);
  });

  test("EMPTY is honest when no sequence is bound (the panel is optional)", () => {
    const panel = projectTimelinePanel({ sequence: null });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value.contentState).toBe("EMPTY");
    expect(panel.value.note).toContain("no execution sequence");
  });
});

describe("the assembled HUD", () => {
  test("assembleHud over the committed fixtures produces all seven POPULATED panels", () => {
    const read = <T>(outcome: { ok: true; value: T } | { ok: false }): T => {
      if (!outcome.ok) throw new Error("fixture source refused");
      return outcome.value;
    };
    const hud = assembleHud({
      objective: {
        primaryProblem: read(SOURCES.primaryProblem()),
        clashConflicts: read(SOURCES.clashConflicts()),
      },
      evidence: { report: read(SOURCES.evidenceReport()) },
      constraints: { observations: read(SOURCES.constraintObservations()) },
      agent: { activeOperator: read(SOURCES.activeOperator()), actions: read(SOURCES.actions()) },
      validation: { checkGate: read(SOURCES.checkGate()), replayVerified: read(SOURCES.replayVerified()) },
      costBoq: { projection: read(SOURCES.quantityConsequence()) },
      timeline: { sequence: read(SOURCES.executionSequence()) },
    });
    expect(hud.ok).toBe(true);
    if (!hud.ok) return;
    const summaries = hudPanelSummaries(hud.value);
    expect(summaries.map((s) => s.panelId)).toEqual([
      "objective",
      "evidence",
      "constraints",
      "agent",
      "validation",
      "cost-boq",
      "timeline",
    ]);
    for (const summary of summaries) {
      expect(summary.contentState).toBe("POPULATED");
    }
  });
});
