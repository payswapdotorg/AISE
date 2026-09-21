/**
 * PROD-024 — the workspace MODEL tests: pure derivations (timeline,
 * quantity rows, clamping), the journey-trace serialization and the BOQ
 * seam over the CONTRACT's COMMITTED trace fixture (the bidirectional
 * round trip the contract guarantees, exercised through this module's
 * seam).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeSolutionBoqTraceSet,
  resolveLinesForOperation,
  type SolutionBoqTraceSet,
} from "../../../../packages/solution-contract/src/index";
import { openWorkspace, stepTimeline, submitIntent, steppedWorkspaceClock, buildDirectManipulationIntent } from "./operations";
import { createLocalSolutionService } from "./service";
import { DEMO_SOLUTION_WORLD, demoBaselineGeometry, demoObservedScene } from "./fixtures";
import {
  clampStateIndex,
  cursorStateOf,
  quantityRowsOf,
  serializeJourneyTrace,
  timelineOf,
  withJourneyStep,
} from "./model";
import { boqLineHighlightOf, operationsForBoqLine } from "./boq";

const SCENE = demoObservedScene();

function demoState() {
  return openWorkspace({
    projectId: DEMO_SOLUTION_WORLD.projectId,
    caseId: DEMO_SOLUTION_WORLD.caseId,
    solutionId: DEMO_SOLUTION_WORLD.solutionId,
    title: DEMO_SOLUTION_WORLD.title,
    problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
    baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
    createdAt: "2026-09-16T08:00:00.000Z",
    materializedAt: "2026-09-16T10:00:00.000Z",
  });
}

describe("PROD-024 workspace model derivations", () => {
  test("the timeline lists every ENGINE state layer with the cursor marked", () => {
    const state = demoState();
    const ticks = timelineOf(state);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.label).toBe("Observed baseline (layer 0)");
    expect(ticks[0]?.isCursor).toBe(true);
    expect(ticks[0]?.stateId).toBe(cursorStateOf(state).stateId);
  });

  test("the cursor clamps into the version's layer range", () => {
    const state = demoState();
    expect(clampStateIndex(state, -5)).toBe(0);
    expect(clampStateIndex(state, 99)).toBe(0);
  });

  test("stepping beyond the range is a no-op (never a corrupt cursor)", () => {
    const state = demoState();
    expect(stepTimeline(state, -3)).toBe(state);
    expect(stepTimeline(state, 4)).toBe(state);
  });

  test("journey steps number contiguously from 1", () => {
    let state = demoState();
    state = withJourneyStep(state, { kind: "step-forward", detail: "a" });
    state = withJourneyStep(state, { kind: "step-back", detail: "b" });
    expect(state.journey.map((step) => step.step)).toEqual([1, 2, 3]);
  });

  test("the serialized trace is canonical (sorted keys, deterministic bytes)", () => {
    const state = demoState();
    const one = serializeJourneyTrace(state);
    const two = serializeJourneyTrace(structuredClone(state));
    expect(one).toBe(two);
    expect(one.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(one) as { solutionId: string; journey: unknown[] };
    expect(parsed.solutionId).toBe("solution-demo-001");
    expect(parsed.journey).toHaveLength(1);
  });

  test("quantity rows derive VERBATIM from the engine-recorded effects", async () => {
    const deps = {
      service: createLocalSolutionService({ baselineGeometry: demoBaselineGeometry() }),
      clock: steppedWorkspaceClock("2026-09-16T10:00:00.000Z", 60_000),
      authoredBy: DEMO_SOLUTION_WORLD.userId,
    };
    let state = demoState();
    const wallFaces = SCENE.elements.find((element) => element.elementId === "node-wall-002");
    if (wallFaces === undefined) throw new Error("wall faces element missing");
    const demolition = buildDirectManipulationIntent(
      {
        elementId: "node-wall-002",
        operationType: "demolition-removal",
        parameterValues: { length: 5, height: 2.4, thickness: 0.1 },
        intentId: "intent-model-001",
      },
      wallFaces,
      state,
      "2026-09-16T09:00:00.000Z",
      DEMO_SOLUTION_WORLD.userId,
    );
    state = await submitIntent(state, demolition, deps);
    const rows = quantityRowsOf(state);
    // The engine's demolition effects: removed-volume 1.2 m³ + removed-face-area 12 m².
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.direction, row.value, row.unit])).toEqual([
      ["removed", 1.2, "m3"],
      ["removed", 12, "m2"],
    ]);
    expect(rows.every((row) => row.calculationRef.startsWith("aise-solution-engine/quantity/"))).toBe(
      true,
    );
    // Stepping back to layer 0 empties the rows (the view follows the cursor).
    const stepped = stepTimeline(state, 0);
    expect(quantityRowsOf(stepped)).toHaveLength(0);
  });
});

describe("PROD-024 BOQ seam over the CONTRACT's committed trace fixture", () => {
  /** Loads the committed contract trace-set fixture (by reference). */
  function committedTraceSet(): SolutionBoqTraceSet {
    return decodeSolutionBoqTraceSet(
      JSON.parse(
        readFileSync(
          join(
            import.meta.dir,
            "../../../../packages/solution-contract/fixtures/trace/SolutionBoqTraceSet.valid.json",
          ),
          "utf8",
        ),
      ),
    );
  }

  test("the contract's bidirectional round trip closes through this seam", () => {
    const traceSet = committedTraceSet();
    const boq = { kind: "trace-set" as const, traceSet };
    const line = traceSet.lineTraces[0];
    if (line === undefined) throw new Error("fixture line missing");
    // line → contributions (through the seam)…
    const contributions = operationsForBoqLine(boq, line.boqLineId);
    expect(contributions).toBeDefined();
    const operationId = contributions?.[0]?.operationId;
    expect(operationId).toBeDefined();
    // …and contribution → lines (through the CONTRACT) includes the original.
    const lines = resolveLinesForOperation(traceSet, operationId!);
    expect(lines.some((entry) => entry.boqLineId === line.boqLineId)).toBe(true);
  });

  test("the highlight join returns the line's operations and geometry references", () => {
    const traceSet = committedTraceSet();
    const boq = { kind: "trace-set" as const, traceSet };
    const line = traceSet.lineTraces[1] ?? traceSet.lineTraces[0];
    if (line === undefined) throw new Error("fixture line missing");
    const highlight = boqLineHighlightOf(boq, line.boqLineId);
    expect(highlight).toBeDefined();
    expect(highlight?.operationIds.length).toBeGreaterThan(0);
    expect(highlight?.geometryRefs.length).toBeGreaterThan(0);
    // An unknown line answers undefined — explicit, never fabricated.
    expect(boqLineHighlightOf(boq, "boq-line-unknown")).toBeUndefined();
    expect(boqLineHighlightOf(undefined, line.boqLineId)).toBeUndefined();
  });
});
