/**
 * PROD-024 — the ACCESSIBLE NON-VIEWER FALLBACK tests (§4.7: first-class,
 * not a stub).
 *
 * Completeness proof, two ways:
 *
 *  1. HEADLESS — a user session (inspect → select → manipulate → step →
 *     revise) driven ENTIRELY through the non-viewer paths: the same
 *     controller functions the fallback panes call, with ZERO involvement
 *     of the spatial viewer (no scene SVG, no projection). The session
 *     exercises the SAME semantics: the typed intents, the ONE engine
 *     submission path, the engine's states and the append-only revision.
 *
 *  2. MARKUP — the accessible scene pane renders every observed element
 *     as a labeled button (aria-pressed selection) with its recorded
 *     facts, and the proposed work as a labeled list with step numbers
 *     and directions; the panes carry their aria labels/roles/captions;
 *     keyboard-operable controls (buttons/inputs) throughout.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AccessibleScenePane } from "./AccessibleScenePane";
import {
  applyAgentDecision,
  buildDirectManipulationIntent,
  openWorkspace,
  reviseOperation,
  stepTimeline,
  submitIntent,
  steppedWorkspaceClock,
  type WorkspaceDeps,
} from "../operations";
import { createLocalSolutionService } from "../service";
import { DEMO_SOLUTION_WORLD, demoBaselineGeometry, demoObservedScene } from "../fixtures";
import { currentVersionOf, cursorStateOf } from "../model";
import type { SolutionWorkspaceState } from "../model";
import { AgentPanel } from "../agent/AgentPanel";
import { TimelinePane } from "../panes/TimelinePane";
import { OperationListPane } from "../panes/OperationListPane";
import { DetailInspectorPane } from "../panes/DetailInspectorPane";
import { BoqPane } from "../panes/BoqPane";
import { QuantitiesPane } from "../panes/QuantitiesPane";
import { proposedOverlaysOf } from "../viewer/model";

const SCENE = demoObservedScene();

function deps(): WorkspaceDeps {
  return {
    service: createLocalSolutionService({ baselineGeometry: demoBaselineGeometry() }),
    clock: steppedWorkspaceClock("2026-09-16T10:00:00.000Z", 60_000),
    authoredBy: DEMO_SOLUTION_WORLD.userId,
  };
}

/* ------------------------------------------------------------------ */
/* Headless completeness (the fallback's semantics, zero viewer)        */
/* ------------------------------------------------------------------ */

describe("PROD-024 accessible fallback (headless completeness)", () => {
  test("a full inspect → manipulate → step → revise session runs with ZERO viewer involvement", async () => {
    const workspace = deps();

    // INSPECT — the accessible scene list is the selection surface.
    let state: SolutionWorkspaceState = openWorkspace({
      projectId: DEMO_SOLUTION_WORLD.projectId,
      caseId: DEMO_SOLUTION_WORLD.caseId,
      solutionId: DEMO_SOLUTION_WORLD.solutionId,
      title: DEMO_SOLUTION_WORLD.title,
      problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
      baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
      createdAt: "2026-09-16T08:00:00.000Z",
      materializedAt: "2026-09-16T10:00:00.000Z",
    });
    // The user "selects" the wall faces through the accessible list.
    const wallFaces = SCENE.elements.find((element) => element.elementId === "node-wall-002");
    if (wallFaces === undefined) throw new Error("wall faces element missing");
    state = { ...state, selection: { kind: "scene-element", elementId: "node-wall-002" }, fallbackMode: true };

    // MANIPULATE — the same direct-manipulation intent path (no viewer).
    const demolition = buildDirectManipulationIntent(
      {
        elementId: "node-wall-002",
        operationType: "demolition-removal",
        parameterValues: { length: 5, height: 2.4, thickness: 0.1 },
        intentId: "intent-fallback-001",
      },
      wallFaces,
      state,
      "2026-09-16T09:00:00.000Z",
      DEMO_SOLUTION_WORLD.userId,
    );
    state = await submitIntent(state, demolition, workspace);
    expect(currentVersionOf(state).operations).toHaveLength(1);
    expect(cursorStateOf(state).stateIndex).toBe(1);

    // STEP — the timeline buttons (no viewer).
    state = stepTimeline(state, 0);
    expect(cursorStateOf(state).stateIndex).toBe(0);
    state = stepTimeline(state, 1);
    expect(cursorStateOf(state).stateIndex).toBe(1);

    // INSPECT the operation + REVISE it (undo creates a new version).
    const operationId = currentVersionOf(state).operations[0]?.operationId;
    if (operationId === undefined) throw new Error("operation missing");
    state = { ...state, selection: { kind: "operation", operationId } };
    state = await reviseOperation(state, operationId, workspace);
    expect(state.currentVersionNumber).toBe(2);
    expect(currentVersionOf(state).operations).toHaveLength(0);
    expect(state.versions[0]?.operations).toHaveLength(1); // history preserved

    // The journey records every step — the fallback session is fully
    // traceable without any spatial rendering.
    expect(state.journey.map((step) => step.kind)).toEqual([
      "inspect",
      "direct-manipulation",
      "step-back",
      "step-forward",
      "revise",
    ]);
  });

  test("an agent decision also folds without the viewer (the fallback covers every path)", async () => {
    const workspace = deps();
    let state = openWorkspace({
      projectId: DEMO_SOLUTION_WORLD.projectId,
      caseId: DEMO_SOLUTION_WORLD.caseId,
      solutionId: DEMO_SOLUTION_WORLD.solutionId,
      title: DEMO_SOLUTION_WORLD.title,
      problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
      baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
      createdAt: "2026-09-16T08:00:00.000Z",
      materializedAt: "2026-09-16T10:00:00.000Z",
    });
    state = await applyAgentDecision(
      state,
      "Pave a highway across the site.",
      {
        decision: "unsupported",
        command: {
          kind: "unsupported",
          vertical: "civil-works",
          reason: "road works are outside the buildings-only scope of this engine",
          attribution: {
            rawUtterance: "Pave a highway across the site.",
            normalizedCommand: "",
            normalizedCommandText: "",
            compilerPath: "deterministic",
            agentId: "agent-demo-assistant",
            sessionId: "s",
            compiledAt: "2026-09-16T10:00:00.000Z",
          },
        },
      },
      workspace,
      undefined,
    );
    expect(state.notice?.kind).toBe("agent-unsupported");
    expect(currentVersionOf(state).operations).toHaveLength(0);
    expect(state.transcript[state.transcript.length - 1]?.text).toContain(
      "outside the buildings-only scope",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Markup accessibility (labels, roles, keyboard-operable controls)     */
/* ------------------------------------------------------------------ */

describe("PROD-024 accessible fallback (markup)", () => {
  test("the accessible scene pane lists observed elements as aria-pressed buttons with their facts", () => {
    const markup = renderToStaticMarkup(
      <AccessibleScenePane
        overlays={[]}
        scene={SCENE}
        selectedElementId="node-wall-002"
        selectedOperationId={undefined}
        onSelectElement={() => {}}
        onSelectOperation={() => {}}
      />,
    );
    expect(markup).toContain('aria-label="Building contents (accessible view)"');
    expect(markup).toContain('data-element-id="node-wall-002"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain("Observed area (south face set): 12.5 m2");
    expect(markup).toContain("Observed parts (authoritative)");
    expect(markup).toContain("No proposed work is visible at this step.");
  });

  test("the accessible scene pane lists the proposed work with step numbers and directions", () => {
    const version = {
      contractVersion: "1.0.0",
      solutionId: "solution-demo-001",
      versionNumber: 1,
      status: "draft" as const,
      operations: [
        {
          contractVersion: "1.0.0",
          operationId: "op-demolition",
          solutionId: "solution-demo-001",
          versionNumber: 1,
          operationIndex: 1,
          operationType: "demolition-removal",
          domain: { contractVersion: "1.0.0", vertical: "building", operationVocabulary: "v", extensions: [] },
          parameters: [
            { name: "length", value: 5, unit: "m" },
            { name: "height", value: 2.4, unit: "m" },
            { name: "thickness", value: 0.1, unit: "m" },
          ],
          target: {
            contractVersion: "1.0.0",
            selectorKind: "face-set",
            nodeRefs: ["node-wall-002"],
            geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
            units: { linear: "m", angular: "rad" },
            description: "the wall",
          },
          dependsOn: [],
          effects: [
            {
              contractVersion: "1.0.0",
              effectKind: "quantity-impact",
              affectedNodeRefs: [],
              geometryRefs: [],
              quantity: { dimension: "volume", value: 1.2, unit: "m3", calculationRef: "r" },
              direction: "removed",
            },
          ],
          provenance: {
            origin: "direct-manipulation",
            authoredBy: "user-demo-engineer",
            authoredAt: "2026-09-16T09:00:00.000Z",
            evidenceIds: [],
            derivationNote: "test",
          },
        } as never,
      ],
      states: [
        {
          contractVersion: "1.0.0",
          stateId: "a".repeat(64),
          solutionId: "solution-demo-001",
          versionNumber: 1,
          stateIndex: 0,
          baselineRealityVersionId: "rgv-demo-0007",
          epistemicStatus: "PROPOSED" as const,
          appliedOperationIds: [],
          materializedAt: "2026-09-16T10:00:00.000Z",
        },
        {
          contractVersion: "1.0.0",
          stateId: "b".repeat(64),
          solutionId: "solution-demo-001",
          versionNumber: 1,
          stateIndex: 1,
          baselineRealityVersionId: "rgv-demo-0007",
          epistemicStatus: "PROPOSED" as const,
          appliedOperationIds: ["op-demolition"],
          materializedAt: "2026-09-16T10:01:00.000Z",
        },
      ],
      createdAt: "2026-09-16T08:00:00.000Z",
    } as never as Parameters<typeof proposedOverlaysOf>[0];
    const overlays = proposedOverlaysOf(version, SCENE, 1);
    const markup = renderToStaticMarkup(
      <AccessibleScenePane
        overlays={overlays}
        scene={SCENE}
        selectedElementId={undefined}
        selectedOperationId="op-demolition"
        onSelectElement={() => {}}
        onSelectOperation={() => {}}
      />,
    );
    expect(markup).toContain("Removed section");
    expect(markup).toContain("removes material");
    expect(markup).toContain("step 1");
    expect(markup).toContain('aria-pressed="true"');
  });

  test("the panes carry aria labels, live regions, captions and keyboard-operable controls", async () => {
    // Build a populated state through the real path (one demolition).
    const workspace = deps();
    let state = openWorkspace({
      projectId: DEMO_SOLUTION_WORLD.projectId,
      caseId: DEMO_SOLUTION_WORLD.caseId,
      solutionId: DEMO_SOLUTION_WORLD.solutionId,
      title: DEMO_SOLUTION_WORLD.title,
      problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
      baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
      createdAt: "2026-09-16T08:00:00.000Z",
      materializedAt: "2026-09-16T10:00:00.000Z",
    });
    const wallFaces = SCENE.elements.find((element) => element.elementId === "node-wall-002");
    if (wallFaces === undefined) throw new Error("wall faces element missing");
    const demolition = buildDirectManipulationIntent(
      {
        elementId: "node-wall-002",
        operationType: "demolition-removal",
        parameterValues: { length: 5, height: 2.4, thickness: 0.1 },
        intentId: "intent-a11y-001",
      },
      wallFaces,
      state,
      "2026-09-16T09:00:00.000Z",
      DEMO_SOLUTION_WORLD.userId,
    );
    state = await submitIntent(state, demolition, workspace);
    const operationId = currentVersionOf(state).operations[0]?.operationId ?? "";
    state = { ...state, selection: { kind: "operation", operationId } };

    // Timeline: aria-current marks the cursor; buttons carry full labels.
    const timeline = renderToStaticMarkup(
      <TimelinePane onStep={() => {}} state={state} />,
    );
    expect(timeline).toContain('aria-current="step"');
    expect(timeline).toContain('aria-label="Step back one layer"');
    expect(timeline).toContain('aria-label="Layer 1:');

    // Operation list: the row button carries the full real-world summary.
    const operations = renderToStaticMarkup(
      <OperationListPane onSelectOperation={() => {}} state={state} />,
    );
    expect(operations).toContain("Step 1");
    expect(operations).toContain("Removing a section");
    expect(operations).toContain("by direct manipulation");

    // Detail inspector: a labeled region with the state delta + quantities
    // + the undo control's explicit aria-label.
    const detail = renderToStaticMarkup(
      <DetailInspectorPane
        boqLines={undefined}
        onClose={() => {}}
        onRevise={() => {}}
        onToggleIsolate={() => {}}
        state={state}
      />,
    );
    expect(detail).toContain('aria-label="Details of step 1"');
    expect(detail).toContain("data-state-delta");
    expect(detail).toContain("Undo this step (new version)");
    expect(detail).toContain("no BOQ data available");

    // Quantities pane: a real table with caption + header scope.
    const quantities = renderToStaticMarkup(
      <QuantitiesPane inventory={state.inventory} rows={state.journey.length === 0 ? [] : populatedRowsOf(state)} />,
    );
    expect(quantities).toContain("<caption>");
    expect(quantities).toContain('scope="col"');

    // BOQ pane without data: the honest empty state.
    const boq = renderToStaticMarkup(
      <BoqPane boq={undefined} onSelectLine={() => {}} state={state} />,
    );
    expect(boq).toContain('data-boq-status="none"');

    // Agent panel: the input carries a programmatic label; the transcript
    // is a live log.
    const agent = renderToStaticMarkup(
      <AgentPanel
        busy={false}
        onCancelPending={() => {}}
        pendingClarification={undefined}
        pendingProposal={undefined}
        port={{ descriptor: { agentId: "a", binding: "x" }, compile: async () => ({}) as never, decideTurn: async () => ({}) as never }}
        onUserTurn={() => {}}
        transcript={[]}
      />,
    );
    expect(agent).toContain('aria-label="Message the assistant"');
    expect(agent).toContain('class="sr-only"');
    expect(agent).toContain('aria-live="polite"');
  });
});

/** Populated quantity rows of the demo state (from the engine effects). */
function populatedRowsOf(state: SolutionWorkspaceState) {
  const version = currentVersionOf(state);
  const rows: import("../model").QuantityRow[] = [];
  for (const operation of version.operations) {
    for (const effect of operation.effects) {
      if (effect.effectKind === "quantity-impact" && effect.quantity !== undefined) {
        rows.push({
          step: operation.operationIndex,
          operationId: operation.operationId,
          operationType: operation.operationType,
          direction: effect.direction ?? "changed",
          value: effect.quantity.value,
          unit: effect.quantity.unit,
          calculationRef: effect.quantity.calculationRef,
        });
      }
    }
  }
  return rows;
}
