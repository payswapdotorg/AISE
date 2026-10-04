/**
 * WORLD-P4 — the HUD fail-closed drills: poisoned sources produce
 * TYPED refusals — never a guess, never partial output (law #3; the
 * HFX-000 discipline). Every drill poisons one field of a REAL fixture
 * record and asserts the refusal's kind + family.
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
} from "./contract";

const SOURCES = referenceWorldStationSources();

function mustOk<T>(outcome: { ok: true; value: T } | { ok: false; failure: { detail: string } }): T {
  if (!outcome.ok) throw new Error(outcome.failure.detail);
  return outcome.value;
}

describe("OBJECTIVE poison drills", () => {
  test("a problem without a problemId is a contract-mismatch refusal", () => {
    const problem: Record<string, unknown> = { ...(mustOk(SOURCES.primaryProblem() as never) as object), problemId: "" };
    const panel = projectObjectivePanel({ primaryProblem: problem as never, clashConflicts: null });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.kind).toBe("contract-mismatch");
    expect(panel.failure.family).toBe("hud");
  });

  test("a non-declared openedAt instant is refused (never a clock read)", () => {
    const problem: Record<string, unknown> = { ...(mustOk(SOURCES.primaryProblem() as never) as object), openedAt: "yesterday" };
    const panel = projectObjectivePanel({ primaryProblem: problem as never, clashConflicts: null });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.kind).toBe("contract-mismatch");
    expect(panel.failure.detail).toContain("openedAt");
  });

  test("a conflict record with a non-finite separation is refused", () => {
    const conflicts = mustOk(SOURCES.clashConflicts() as never) as readonly Record<string, unknown>[];
    const poisoned = conflicts.map((c) => ({ ...c, separationMetres: Number.NaN }));
    const panel = projectObjectivePanel({ primaryProblem: null, clashConflicts: poisoned as never });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.kind).toBe("contract-mismatch");
  });

  test("a conflict record without a problem binding is refused", () => {
    const conflicts = mustOk(SOURCES.clashConflicts() as never) as readonly Record<string, unknown>[];
    const poisoned = conflicts.map((c) => ({
      ...c,
      problemBinding: { problemId: "", problemStatus: "open", problemTitle: "t" },
    }));
    const panel = projectObjectivePanel({ primaryProblem: null, clashConflicts: poisoned as never });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.detail).toContain("problemBinding");
  });
});

describe("EVIDENCE poison drills", () => {
  test("a report with a non-vocabulary verdict is refused", () => {
    const report: Record<string, unknown> = { ...(mustOk(SOURCES.evidenceReport() as never) as object), verdict: "PROBABLY_FINE" };
    const panel = projectEvidencePanel({ report: report as never });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.kind).toBe("contract-mismatch");
    expect(panel.failure.detail).toContain("verdict");
  });

  test("a report with a gap without a gapId is refused", () => {
    const report = mustOk(SOURCES.evidenceReport() as never) as Record<string, unknown>;
    const poisoned = {
      ...report,
      gaps: [
        {
          gapId: "",
          requirementId: "req-001",
          kind: "MISSING",
          detail: "the steel section evidence",
          remediationTask: { taskId: "task-001", status: "open" },
        },
      ],
    };
    const panel = projectEvidencePanel({ report: poisoned as never });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.detail).toContain("gapId");
  });
});

describe("CONSTRAINTS poison drills", () => {
  test("an invented constraint kind is refused (the closed vocabulary)", () => {
    const panel = projectConstraintsPanel({
      observations: [
        {
          constraintId: "c-001",
          kind: "vibes" as never,
          statement: "must feel right",
          sourceLane: "layer2-context",
          sourceRef: "r",
        },
      ],
    });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.kind).toBe("contract-mismatch");
    expect(panel.failure.detail).toContain("closed vocabulary");
  });

  test("a duplicate constraintId is refused", () => {
    const observation = {
      constraintId: "c-dup",
      kind: "cost" as const,
      statement: "stay below budget",
      sourceLane: "layer2-context" as const,
      sourceRef: "r",
    };
    const panel = projectConstraintsPanel({ observations: [observation, observation] });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.detail).toContain("duplicate");
  });

  test("an empty statement is refused (never a vague constraint)", () => {
    const panel = projectConstraintsPanel({
      observations: [
        {
          constraintId: "c-002",
          kind: "dimension" as const,
          statement: "",
          sourceLane: "layer1-declared" as const,
          sourceRef: null,
        },
      ],
    });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.detail).toContain("statement");
  });
});

describe("AGENT poison drills", () => {
  test("an operator without a role is refused", () => {
    const panel = projectAgentPanel({
      activeOperator: { operatorId: "op-1", role: "" },
      actions: [],
    });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.detail).toContain("operatorId and role");
  });

  test("an action without ownership is refused (the ownership law)", () => {
    const actions = mustOk(SOURCES.actions() as never) as readonly Record<string, unknown>[];
    const poisoned = actions.map((a) => ({
      ...a,
      ownership: { ...(a.ownership as object), owner: { actorId: "", role: "engineer" } },
    }));
    const panel = projectAgentPanel({ activeOperator: null, actions: poisoned as never });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.detail).toContain("owned actor id");
  });
});

describe("VALIDATION poison drills", () => {
  test("a check gate without a gateId is refused", () => {
    const gate: Record<string, unknown> = { ...(mustOk(SOURCES.checkGate() as never) as object), gateId: "" };
    const panel = projectValidationPanel({ checkGate: gate as never, replayVerified: null });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.detail).toContain("gateId");
  });

  test("a non-declared gatedAt instant is refused", () => {
    const gate: Record<string, unknown> = { ...(mustOk(SOURCES.checkGate() as never) as object), gatedAt: "sometimes" };
    const panel = projectValidationPanel({ checkGate: gate as never, replayVerified: null });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.detail).toContain("gatedAt");
  });
});

describe("COST/BOQ poison drills", () => {
  test("an epistemically-upgraded projection is an operation-semantic refusal (law #8)", () => {
    const projection: Record<string, unknown> = { ...(mustOk(SOURCES.quantityConsequence() as never) as object), epistemicClass: "OBSERVED" };
    const panel = projectCostBoqPanel({ projection: projection as never });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.kind).toBe("operation-semantic-failure");
    expect(panel.failure.detail).toContain("PROPOSED");
  });

  test("a non-finite line value is refused", () => {
    const projection = mustOk(SOURCES.quantityConsequence() as never) as unknown as {
      lines: Record<string, unknown>[];
    } & Record<string, unknown>;
    const poisoned = {
      ...projection,
      lines: projection.lines.map((line) => ({ ...line, value: Number.POSITIVE_INFINITY })),
    };
    const panel = projectCostBoqPanel({ projection: poisoned as never });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.kind).toBe("contract-mismatch");
  });
});

describe("TIMELINE poison drills", () => {
  test("a non-finite makespan is refused", () => {
    const sequence = mustOk(SOURCES.executionSequence() as never) as unknown as {
      trajectory: Record<string, unknown>;
    } & Record<string, unknown>;
    const poisoned = {
      ...sequence,
      trajectory: { ...sequence.trajectory, makespanHours: Number.NaN },
    };
    const panel = projectTimelinePanel({ sequence: poisoned as never });
    expect(panel.ok).toBe(false);
    if (panel.ok) return;
    expect(panel.failure.kind).toBe("contract-mismatch");
  });
});

describe("the assembly is fail-closed (never a partial HUD)", () => {
  test("one poisoned panel refuses the whole assembly", () => {
    const poisonedProblem: Record<string, unknown> = { ...(mustOk(SOURCES.primaryProblem() as never) as object), problemId: "" };
    const hud = assembleHud({
      objective: { primaryProblem: poisonedProblem as never, clashConflicts: null },
      evidence: { report: mustOk(SOURCES.evidenceReport() as never) },
      constraints: { observations: [] },
      agent: { activeOperator: null, actions: [] },
      validation: { checkGate: null, replayVerified: null },
      costBoq: { projection: null },
      timeline: { sequence: null },
    });
    expect(hud.ok).toBe(false);
    if (hud.ok) return;
    expect(hud.failure.family).toBe("hud");
  });
});
