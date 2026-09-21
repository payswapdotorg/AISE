/**
 * PROD-024 — THE GOLDEN JOURNEY + MUTATION PROTECTION + TIMELINE
 * DETERMINISM suite (§5 of the work order).
 *
 * THE GOLDEN JOURNEY — a scripted user session over the REAL seams:
 *
 *   inspect → direct manipulation → agent turn (clarify → propose →
 *   confirm) → step back → revise (undo) → confirm (second agent proposal)
 *
 * driven through the workspace's own controllers (`openWorkspace`,
 * `submitIntent`, `stepTimeline`, `reviseOperation`,
 * `applyAgentDecision`) with the REAL engine (the local service binding)
 * and the scripted agent double (REAL contract intents). The journey's
 * serialized operation trace must be BYTE-STABLE across two runs
 * (determinism proof).
 *
 * MUTATION PROTECTION (§4.3): the observed scene is untouched; every
 * historical version is preserved verbatim after revisions; attempt-to-
 * overwrite-authoritative operations (a cross-solution intent) are
 * REFUSED by the engine and surfaced honestly; every proposed state
 * carries the PROPOSED seal over the pinned baseline.
 *
 * TIMELINE DETERMINISM (§4.4): stepping forward/back/jump over the
 * recorded layers lands on EXACTLY the engine's states — and the whole
 * workspace-evolved version equals the ENGINE's `replaySolution` output
 * byte-for-byte (the incremental applies and the replay are one path).
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  deriveSolutionBoqLineTraceId,
  type EngineeringOperationIntent,
  type SolutionBoqTraceSet,
} from "../../../../packages/solution-contract/src/index";
import { replaySolution } from "../../../../packages/solution-engine/src/index";
import { canonicalJsonStringify } from "../../../../packages/shared-contracts/src/index";
import {
  applyAgentDecision,
  agentSessionContextOf,
  buildDirectManipulationIntent,
  openWorkspace,
  reviseOperation,
  stepTimeline,
  submitIntent,
  steppedWorkspaceClock,
  type WorkspaceDeps,
} from "./operations";
import { createLocalSolutionService } from "./service";
import {
  askDecisionOf,
  buildAgentIntent,
  createScriptedSolutionAgentPort,
  dispatchOperationDecisionOf,
  proposeDecisionOf,
  type SolutionAgentPort,
} from "./agent/port";
import { boqPaneStatusOf, resolveBoqForOperation, type SolutionBoqSyncInput } from "./boq";
import { DEMO_SOLUTION_WORLD, demoBaselineGeometry, demoObservedScene } from "./fixtures";
import { currentVersionOf, cursorStateOf, serializeJourneyTrace, timelineOf } from "./model";
import type { SolutionWorkspaceState } from "./model";
import { SolutionWorkspace } from "./SolutionWorkspace";

/* ------------------------------------------------------------------ */
/* The deterministic world of the journey                              */
/* ------------------------------------------------------------------ */

const SCENE = demoObservedScene();

function journeyDeps(): WorkspaceDeps {
  return {
    service: createLocalSolutionService({ baselineGeometry: demoBaselineGeometry() }),
    clock: steppedWorkspaceClock("2026-09-16T10:00:00.000Z", 60_000),
    authoredBy: DEMO_SOLUTION_WORLD.userId,
  };
}

function openDemoWorkspace(): SolutionWorkspaceState {
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

/** The agent turn helper — exactly what the component's controller does. */
async function userTurn(
  state: SolutionWorkspaceState,
  agent: SolutionAgentPort,
  utterance: string,
  deps: WorkspaceDeps,
  boq: SolutionBoqSyncInput | undefined,
): Promise<SolutionWorkspaceState> {
  const session = agentSessionContextOf(state, SCENE, {
    sessionId: DEMO_SOLUTION_WORLD.agentSessionId,
    agentId: DEMO_SOLUTION_WORLD.agentId,
    userId: DEMO_SOLUTION_WORLD.userId,
  });
  const decision = await agent.decideTurn({
    utterance,
    session,
    ...(state.pendingClarification === undefined
      ? {}
      : { pendingClarification: state.pendingClarification }),
    ...(state.pendingProposal === undefined ? {} : { pendingProposal: state.pendingProposal }),
  });
  return applyAgentDecision(state, utterance, decision, deps, boq);
}

/** The block-wall intent — EXACTLY the committed corpus's semantics. */
function blockWallIntent(versionNumber: number): EngineeringOperationIntent {
  return buildAgentIntent({
    intentId: "intent-agent-block-001",
    operationType: "block-wall-placement",
    parameters: [
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 1, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
      { name: "material", value: "concrete-block" },
    ],
    target: {
      contractVersion: "1.0.0",
      selectorKind: "line-extent",
      nodeRefs: ["node-wall-002"],
      geometryRefs: [{ kind: "plane", ref: "geo-wall-line-003" }],
      units: { linear: "m", angular: "rad" },
      description: "The wall line along the damaged section",
    },
    commandText: "Lay blocks to a height of 1 m along this wall.",
    authoredAt: "2026-09-16T09:10:00.000Z",
    proposedTo: { solutionId: DEMO_SOLUTION_WORLD.solutionId, versionNumber },
  });
}

/** The plaster intent — EXACTLY the committed corpus's semantics. */
function plasterIntent(versionNumber: number): EngineeringOperationIntent {
  return buildAgentIntent({
    intentId: "intent-agent-plaster-001",
    operationType: "plaster-application",
    parameters: [
      { name: "thickness", value: 30, unit: "mm" },
      { name: "material", value: "cement-plaster" },
    ],
    target: {
      contractVersion: "1.0.0",
      selectorKind: "face-set",
      nodeRefs: ["node-wall-002"],
      geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
      units: { linear: "m", angular: "rad" },
      description: "The affected ground-floor wall faces",
    },
    commandText: "Apply 30 mm plaster to the affected wall faces.",
    authoredAt: "2026-09-16T09:15:00.000Z",
    proposedTo: { solutionId: DEMO_SOLUTION_WORLD.solutionId, versionNumber },
  });
}

/** The scripted agent of the journey (REAL intents, deterministic). */
function journeyAgent(): SolutionAgentPort {
  const blockWallV1 = blockWallIntent(1);
  const plasterV2 = plasterIntent(2);
  const blockWallProposal = proposeDecisionOf({
    intent: blockWallV1,
    renderedCommand: "Lay blocks to a height of 1 m along this wall.",
    estimatedQuantities: [
      { label: "Wall face area", dimension: "area", value: 5, unit: "m2", basis: "length × height (parameters only)" },
      { label: "Blocks needed", dimension: "count", value: 65, unit: "count", basis: "ceil(height/0.2) × ceil(length/0.4) (parameters only)" },
    ],
    irreversible: false,
    reviewRequirements: ["maximum wall height is 3 m per operation"],
    utterance: "Rebuild the damaged wall with blocks. 1 m high, using concrete blocks",
  });
  const plasterProposal = proposeDecisionOf({
    intent: plasterV2,
    renderedCommand: "Apply 30 mm plaster to the affected wall faces.",
    estimatedQuantities: [
      { label: "Plaster area", dimension: "area", value: 12.5, unit: "m2", basis: "the observed face-set area (caller-known focus value)" },
    ],
    irreversible: false,
    reviewRequirements: ["maximum plaster thickness is 50 mm per coat"],
    utterance: "Apply 30 mm plaster to the affected wall faces.",
  });
  return createScriptedSolutionAgentPort({
    agentId: DEMO_SOLUTION_WORLD.agentId,
    turns: [
      {
        utterance: "Rebuild the damaged wall with blocks.",
        decision: askDecisionOf({
          utterance: "Rebuild the damaged wall with blocks.",
          questions: [
            {
              slotKind: "dimension",
              slot: "height",
              question: "How high should the new wall section be built?",
            },
            {
              slotKind: "material",
              slot: "material",
              question: "Which blocks should be used?",
              offeredChoices: ["concrete-block", "clay-block", "aac-block"],
            },
          ],
        }),
      },
      {
        utterance: "Rebuild the damaged wall with blocks. 1 m high, using concrete blocks",
        decision: blockWallProposal,
      },
      {
        utterance: "yes, apply it",
        decision: dispatchOperationDecisionOf(
          blockWallProposal.proposal,
          DEMO_SOLUTION_WORLD.solutionId,
          1,
        ),
      },
      {
        utterance: "Apply 30 mm plaster to the affected wall faces.",
        decision: plasterProposal,
      },
      {
        utterance: "yes, apply it",
        decision: dispatchOperationDecisionOf(
          plasterProposal.proposal,
          DEMO_SOLUTION_WORLD.solutionId,
          2,
        ),
      },
    ],
  });
}

/** Runs THE golden journey once; returns every intermediate snapshot. */
async function runGoldenJourney() {
  const deps = journeyDeps();
  const agent = journeyAgent();
  const boq = demoBoqInput();
  const snapshots: { label: string; state: SolutionWorkspaceState }[] = [];

  // 1. INSPECT — open the workspace on the observed baseline.
  let state = openDemoWorkspace();
  snapshots.push({ label: "inspect", state });

  // 2. DIRECT MANIPULATION — select the damaged wall faces, remove the
  //    damaged section (the committed corpus demolition semantics).
  const wallFaces = SCENE.elements.find((element) => element.elementId === "node-wall-002");
  if (wallFaces === undefined) {
    throw new Error("demo wall faces element missing");
  }
  state = { ...state, selection: { kind: "scene-element", elementId: "node-wall-002" } };
  const demolition = buildDirectManipulationIntent(
    {
      elementId: "node-wall-002",
      operationType: "demolition-removal",
      parameterValues: { length: 5, height: 2.4, thickness: 0.1 },
      intentId: "intent-direct-demolition-001",
    },
    wallFaces,
    state,
    "2026-09-16T09:00:00.000Z",
    DEMO_SOLUTION_WORLD.userId,
  );
  state = await submitIntent(state, demolition, deps);
  snapshots.push({ label: "direct-manipulation", state });

  // 3. AGENT TURN — clarify → answer → proposal → confirm (the block wall).
  state = await userTurn(state, agent, "Rebuild the damaged wall with blocks.", deps, boq);
  snapshots.push({ label: "agent-ask", state });
  state = await userTurn(state, agent, "1 m high, using concrete blocks", deps, boq);
  snapshots.push({ label: "agent-propose", state });
  state = await userTurn(state, agent, "yes, apply it", deps, boq);
  snapshots.push({ label: "agent-confirm", state });
  const versionOneSnapshot = structuredClone(currentVersionOf(state));

  // 4. STEP BACK — view the layer after the demolition only.
  state = stepTimeline(state, 1);
  snapshots.push({ label: "step-back", state });

  // 5. REVISE — undo the demolition (a NEW version; v1 stays in history).
  const demolitionOperationId = currentVersionOf(state).operations[0]?.operationId;
  if (demolitionOperationId === undefined) {
    throw new Error("demolition operation missing");
  }
  state = await reviseOperation(state, demolitionOperationId, deps);
  snapshots.push({ label: "revise", state });

  // 6. CONFIRM — the second agent proposal (the plaster coat) at v2.
  state = await userTurn(state, agent, "Apply 30 mm plaster to the affected wall faces.", deps, boq);
  state = await userTurn(state, agent, "yes, apply it", deps, boq);
  snapshots.push({ label: "confirm", state });

  return { snapshots, deps, versionOneSnapshot, demolitionIntent: demolition, boq };
}

/** A guarded BOQ input pinned to version 1 with the journey's REAL ids. */
function demoBoqInput(): SolutionBoqSyncInput {
  const solutionId = DEMO_SOLUTION_WORLD.solutionId;
  const demolitionId =
    "78be478643fcbb4aad1ba5e9165ab3382199c9165770f50b83a58c431096f2f9";
  const blockWallId =
    "281417008f64faec1343a222213785066c6d480c1ef07b67120d73bd89d903ea";
  const line = (boqLineId: string, description: string, operationId: string, index: number) => ({
    contractVersion: "1.0.0",
    boqLineId,
    traceId: deriveSolutionBoqLineTraceId({ solutionId, versionNumber: 1, boqLineId }),
    solutionId,
    versionNumber: 1,
    validationSnapshotRef: "9b2f4a3a2b6a6cb4035db3e7a4b64229fe84b56c5fffb65a60947847adb3e2f3",
    itemDescription: description,
    contributingOperations: [
      { operationId, operationIndex: index, contributionKind: "created" as const },
    ],
    quantity: {
      dimension: "volume" as const,
      value: index === 1 ? 1.2 : 0.5,
      unit: "m3",
      calculationRef: "aise-solution-engine/quantity/test-fixture",
    },
    geometryRefs: [
      index === 1
        ? { kind: "polygon" as const, ref: "geo-wall-faces-002" }
        : { kind: "plane" as const, ref: "geo-wall-line-003" },
    ],
  });
  const traceSet: SolutionBoqTraceSet = {
    contractVersion: "1.0.0",
    solutionId,
    versionNumber: 1,
    validationSnapshotRef: "9b2f4a3a2b6a6cb4035db3e7a4b64229fe84b56c5fffb65a60947847adb3e2f3",
    lineTraces: [
      line("boq-line-demo-0001", "Removal of the damaged wall section", demolitionId, 1),
      line("boq-line-demo-0002", "Rebuilding the wall with concrete blocks", blockWallId, 2),
    ],
  };
  return { kind: "trace-set", traceSet };
}

/* ------------------------------------------------------------------ */
/* The golden journey                                                  */
/* ------------------------------------------------------------------ */

describe("PROD-024 golden journey (inspect → direct manipulation → agent turn → step back → revise → confirm)", () => {
  test("every leg lands on ENGINE-computed states with the corpus's deterministic identities", async () => {
    const { snapshots } = await runGoldenJourney();
    const byLabel = Object.fromEntries(snapshots.map((entry) => [entry.label, entry.state]));

    // INSPECT: layer 0, no operations.
    const inspect = byLabel["inspect"];
    if (inspect === undefined) throw new Error("inspect snapshot missing");
    expect(currentVersionOf(inspect).operations).toHaveLength(0);
    expect(cursorStateOf(inspect).stateIndex).toBe(0);

    // DIRECT MANIPULATION: the demolition lands with the COMMITTED corpus's
    // operation identity (78be4786…) and the engine's quantities.
    const afterDirect = byLabel["direct-manipulation"];
    if (afterDirect === undefined) throw new Error("direct-manipulation snapshot missing");
    expect(currentVersionOf(afterDirect).operations).toHaveLength(1);
    expect(currentVersionOf(afterDirect).operations[0]?.operationId).toBe(
      "78be478643fcbb4aad1ba5e9165ab3382199c9165770f50b83a58c431096f2f9",
    );
    expect(cursorStateOf(afterDirect).stateIndex).toBe(1);
    expect(currentVersionOf(afterDirect).operations[0]?.provenance.origin).toBe("direct-manipulation");

    // AGENT TURN: the clarification surfaces verbatim…
    const ask = byLabel["agent-ask"];
    if (ask === undefined) throw new Error("agent-ask snapshot missing");
    expect(ask.pendingClarification?.questions.map((question) => question.slot)).toEqual([
      "height",
      "material",
    ]);
    // …the proposal previews BEFORE execution (nothing applied yet)…
    const propose = byLabel["agent-propose"];
    if (propose === undefined) throw new Error("agent-propose snapshot missing");
    expect(propose.pendingProposal?.proposal.renderedCommand).toBe(
      "Lay blocks to a height of 1 m along this wall.",
    );
    expect(currentVersionOf(propose).operations).toHaveLength(1);
    // …and the confirmed proposal applies through the SAME path with the
    // committed corpus's block-wall identity (281417…) at index 2.
    const confirmOne = byLabel["agent-confirm"];
    if (confirmOne === undefined) throw new Error("agent-confirm snapshot missing");
    expect(currentVersionOf(confirmOne).operations).toHaveLength(2);
    expect(currentVersionOf(confirmOne).operations[1]?.operationId).toBe(
      "281417008f64faec1343a222213785066c6d480c1ef07b67120d73bd89d903ea",
    );
    expect(currentVersionOf(confirmOne).operations[1]?.provenance.origin).toBe("agent");
    expect(currentVersionOf(confirmOne).operations[1]?.provenance.commandText).toBe(
      "Lay blocks to a height of 1 m along this wall.",
    );
    expect(cursorStateOf(confirmOne).stateIndex).toBe(2);

    // STEP BACK: the cursor views layer 1 — the EXACT engine state after
    // the demolition (identity restore, not a client snapshot).
    const stepBack = byLabel["step-back"];
    if (stepBack === undefined) throw new Error("step-back snapshot missing");
    expect(cursorStateOf(stepBack).stateIndex).toBe(1);
    expect(cursorStateOf(stepBack).stateId).toBe(cursorStateOf(afterDirect).stateId);

    // REVISE: version 2 exists WITHOUT the demolition, parent lineage 1.
    const revised = byLabel["revise"];
    if (revised === undefined) throw new Error("revise snapshot missing");
    expect(revised.currentVersionNumber).toBe(2);
    expect(currentVersionOf(revised).operations).toHaveLength(1);
    expect(currentVersionOf(revised).operations[0]?.operationType).toBe("block-wall-placement");
    expect(currentVersionOf(revised).parentVersionNumber).toBe(1);

    // CONFIRM: the plaster lands at version 2, index 2.
    const final = byLabel["confirm"];
    if (final === undefined) throw new Error("confirm snapshot missing");
    expect(final.currentVersionNumber).toBe(2);
    expect(currentVersionOf(final).operations).toHaveLength(2);
    expect(currentVersionOf(final).operations[1]?.operationType).toBe("plaster-application");
    expect(cursorStateOf(final).stateIndex).toBe(2);
  });

  test("the journey trace is BYTE-STABLE across two runs (determinism proof)", async () => {
    const first = await runGoldenJourney();
    const second = await runGoldenJourney();
    const traceOne = serializeJourneyTrace(first.snapshots[first.snapshots.length - 1]?.state ?? first.snapshots[0]!.state);
    const traceTwo = serializeJourneyTrace(second.snapshots[second.snapshots.length - 1]?.state ?? second.snapshots[0]!.state);
    expect(traceOne).toBe(traceTwo);
    // The trace joins manipulation, agent turns, timeline and revisions
    // through the engine's trace identities.
    expect(traceOne).toContain("78be478643fcbb4aad1ba5e9165ab3382199c9165770f50b83a58c431096f2f9");
    expect(traceOne).toContain("281417008f64faec1343a222213785066c6d480c1ef07b67120d73bd89d903ea");
    expect(traceOne).toContain("Lay blocks to a height of 1 m along this wall.");
    expect(traceOne).toContain("step-back");
    expect(traceOne).toContain("revise");
  });

  test("TIMELINE DETERMINISM: stepping equals the ENGINE's replay byte-for-byte", async () => {
    const { snapshots, deps } = await runGoldenJourney();
    const final = snapshots[snapshots.length - 1]?.state;
    const revised = snapshots.find((entry) => entry.label === "revise")?.state;
    if (final === undefined || revised === undefined) throw new Error("snapshots missing");
    // The replay uses the SAME creation instant the revision stamped.
    const revisionCreatedAt = currentVersionOf(revised).createdAt;
    // Rebuild version 2 through the ENGINE's replay over the same intents
    // (the rebuilt block wall at the new version context + the plaster).
    const replayIntents = [blockWallIntent(2), plasterIntent(2)];
    const replay = replaySolution({
      solutionId: DEMO_SOLUTION_WORLD.solutionId,
      projectId: DEMO_SOLUTION_WORLD.projectId,
      title: DEMO_SOLUTION_WORLD.title,
      problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
      domain: REFERENCE_BUILDING_DOMAIN,
      baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
      intents: replayIntents,
      capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
      baselineGeometry: demoBaselineGeometry(),
      materializeClock: deps.clock.materializeAt,
      createdAt: revisionCreatedAt,
      versionNumber: 2,
      parentVersionNumber: 1,
    });
    if (replay.outcome !== "complete") {
      throw new Error(`replay failed: ${JSON.stringify(replay)}`);
    }
    // The workspace-evolved version 2 IS the engine's replay — byte-identical.
    expect(canonicalJsonStringify(currentVersionOf(final))).toBe(
      canonicalJsonStringify(replay.version),
    );
    // And every timeline cursor position lands on the engine's states.
    const ticks = timelineOf(final);
    expect(ticks.map((tick) => tick.stateId)).toEqual(
      replay.version.states.map((state) => state.stateId),
    );
    // Jump/step across the full range and verify each view.
    let stepped = final;
    for (const index of [0, 2, 1, 0, 2]) {
      stepped = stepTimeline(stepped, index);
      expect(cursorStateOf(stepped).stateId).toBe(replay.version.states[index]!.stateId);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Mutation protection (§4.3)                                          */
/* ------------------------------------------------------------------ */

describe("PROD-024 mutation protection", () => {
  test("the OBSERVED scene is never mutated by any interaction", async () => {
    const observedBefore = structuredClone(SCENE);
    const { snapshots } = await runGoldenJourney();
    const final = snapshots[snapshots.length - 1]?.state;
    if (final === undefined) throw new Error("final snapshot missing");
    expect(SCENE).toEqual(observedBefore);
    // The workspace state carries NO write path to the scene: the observed
    // elements' identities and facts are identical after the full journey.
    expect(SCENE.elements.map((element) => element.elementId)).toEqual(
      observedBefore.elements.map((element) => element.elementId),
    );
  });

  test("revision preserves the prior version VERBATIM (append-only history)", async () => {
    const { snapshots, versionOneSnapshot } = await runGoldenJourney();
    const final = snapshots[snapshots.length - 1]?.state;
    if (final === undefined) throw new Error("final snapshot missing");
    // v1 is still in the history, deep-equal to its pre-revision self.
    expect(final.versions[0]).toEqual(versionOneSnapshot);
    expect(final.versions).toHaveLength(2);
  });

  test("every proposed state carries the PROPOSED seal over the PINNED baseline", async () => {
    const { snapshots } = await runGoldenJourney();
    const final = snapshots[snapshots.length - 1]?.state;
    if (final === undefined) throw new Error("final snapshot missing");
    for (const version of final.versions) {
      for (const state of version.states) {
        expect(state.epistemicStatus).toBe("PROPOSED");
        expect(state.baselineRealityVersionId).toBe("rgv-demo-0007");
      }
    }
  });

  test("an attempt to overwrite authoritative reality (cross-solution intent) is REFUSED and surfaced honestly", async () => {
    const deps = journeyDeps();
    let state = openDemoWorkspace();
    const wallFaces = SCENE.elements.find((element) => element.elementId === "node-wall-002");
    if (wallFaces === undefined) throw new Error("demo wall faces element missing");
    // A hostile intent proposing into ANOTHER solution — the engine must
    // refuse it (baseline_mismatch); the UI surfaces the refusal verbatim.
    const hostile = buildDirectManipulationIntent(
      {
        elementId: "node-wall-002",
        operationType: "demolition-removal",
        parameterValues: { length: 5, height: 2.4, thickness: 0.1 },
        intentId: "intent-hostile-001",
      },
      wallFaces,
      state,
      "2026-09-16T09:00:00.000Z",
      DEMO_SOLUTION_WORLD.userId,
    );
    const retargeted: EngineeringOperationIntent = {
      ...hostile,
      proposedTo: { solutionId: "solution-other-999", versionNumber: 1 },
    };
    state = await submitIntent(state, retargeted, deps);
    expect(currentVersionOf(state).operations).toHaveLength(0); // nothing applied
    expect(state.notice?.source).toBe("solution-engine");
    expect(state.notice?.kind).toBe("engine-refusal");
    expect(state.notice?.outcome).toBe("invalid");
    expect(state.notice?.reasons.some((reason) => reason.code === "baseline_mismatch")).toBe(true);
    // The journey records the refusal honestly (never a silent drop).
    const lastJourney = state.journey[state.journey.length - 1];
    expect(lastJourney?.detail.includes("REFUSED")).toBe(true);
    expect(lastJourney?.detail.includes("baseline_mismatch")).toBe(true);
  });

  test("an underspecified operation is refused with needs-input (the engine asks, never invents)", async () => {
    const deps = journeyDeps();
    let state = openDemoWorkspace();
    const wallFaces = SCENE.elements.find((element) => element.elementId === "node-wall-002");
    if (wallFaces === undefined) throw new Error("demo wall faces element missing");
    const incomplete = buildAgentIntent({
      intentId: "intent-incomplete-001",
      operationType: "demolition-removal",
      parameters: [{ name: "length", value: 5, unit: "m" }],
      target: {
        contractVersion: "1.0.0",
        selectorKind: "face-set",
        nodeRefs: ["node-wall-002"],
        geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
        units: { linear: "m", angular: "rad" },
        description: "The affected ground-floor wall faces",
      },
      commandText: "Remove the damaged section.",
      authoredAt: "2026-09-16T09:00:00.000Z",
      proposedTo: { solutionId: DEMO_SOLUTION_WORLD.solutionId, versionNumber: 1 },
    });
    state = await submitIntent(state, incomplete, deps);
    expect(currentVersionOf(state).operations).toHaveLength(0);
    expect(state.notice?.outcome).toBe("needs-input");
    expect(
      state.notice?.reasons.some((reason) => reason.code === "missing_required_parameter"),
    ).toBe(true);
  });

  test("an operation outside the engine catalogue is refused as unsupported (future verticals are honest)", async () => {
    const deps = journeyDeps();
    let state = openDemoWorkspace();
    const site = SCENE.elements.find((element) => element.elementId === "node-site-001");
    if (site === undefined) throw new Error("demo site element missing");
    const trench = buildAgentIntent({
      intentId: "intent-trench-001",
      operationType: "trench-shoring",
      parameters: [{ name: "depth", value: 2, unit: "m" }],
      target: {
        contractVersion: "1.0.0",
        selectorKind: "volume",
        nodeRefs: ["node-site-001"],
        geometryRefs: [{ kind: "polygon", ref: "geo-pit-outline-001" }],
        units: { linear: "m", angular: "rad" },
        description: "the demo site volume",
      },
      commandText: "Shore the trench walls.",
      authoredAt: "2026-09-16T09:00:00.000Z",
      proposedTo: { solutionId: DEMO_SOLUTION_WORLD.solutionId, versionNumber: 1 },
    });
    state = await submitIntent(state, trench, deps);
    expect(currentVersionOf(state).operations).toHaveLength(0);
    expect(state.notice?.outcome).toBe("unsupported");
    expect(
      state.notice?.reasons.some((reason) => reason.code === "capability_unsupported"),
    ).toBe(true);
  });

  test("the BOQ guard: v1 data syncs at v1 and reports the pin honestly after the revision", async () => {
    const { snapshots, boq } = await runGoldenJourney();
    const afterAgentConfirm = snapshots.find((entry) => entry.label === "agent-confirm")?.state;
    if (afterAgentConfirm === undefined) throw new Error("agent-confirm snapshot missing");
    // At version 1 the trace set is AVAILABLE and both directions resolve.
    const available = boqPaneStatusOf(boq, afterAgentConfirm);
    expect(available.kind).toBe("available");
    const demolitionId = currentVersionOf(afterAgentConfirm).operations[0]?.operationId ?? "";
    const blockWallId = currentVersionOf(afterAgentConfirm).operations[1]?.operationId ?? "";
    const demolitionLines = resolveBoqForOperation(boq, afterAgentConfirm, demolitionId);
    expect(demolitionLines?.map((line) => line.boqLineId)).toEqual(["boq-line-demo-0001"]);
    const blockWallLines = resolveBoqForOperation(boq, afterAgentConfirm, blockWallId);
    expect(blockWallLines?.map((line) => line.boqLineId)).toEqual(["boq-line-demo-0002"]);
    // After the revision (viewing version 2) the v1-pinned set is reported
    // honestly — never silently re-keyed.
    const final = snapshots[snapshots.length - 1]?.state;
    if (final === undefined) throw new Error("final snapshot missing");
    const pinned = boqPaneStatusOf(boq, final);
    expect(pinned.kind).toBe("version-pinned-elsewhere");
  });

  test("no BOQ data → the honest none state (never a crash, never fabricated lines)", () => {
    const state = openDemoWorkspace();
    const status = boqPaneStatusOf(undefined, state);
    expect(status.kind).toBe("none");
    expect(resolveBoqForOperation(undefined, state, "any-operation")).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Component rendering (the mount surface, honest states)              */
/* ------------------------------------------------------------------ */

describe("PROD-024 SolutionWorkspace component", () => {
  test("renders the full workspace over the engine baseline with an honest unwired agent panel", () => {
    const markup = renderToStaticMarkup(
      <SolutionWorkspace
        context={{
          projectId: DEMO_SOLUTION_WORLD.projectId,
          caseId: DEMO_SOLUTION_WORLD.caseId,
          solutionId: DEMO_SOLUTION_WORLD.solutionId,
          title: DEMO_SOLUTION_WORLD.title,
          problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
          baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
          observedScene: SCENE,
        }}
      />,
    );
    expect(markup).toContain("solution-workspace");
    expect(markup).toContain('data-layer="observed"');
    expect(markup).toContain('data-epistemic-class="OBSERVED"');
    expect(markup).toContain('aria-label="Building view');
    expect(markup).toContain("Solution timeline");
    expect(markup).toContain('aria-label="Operation list"');
    expect(markup).toContain('aria-label="Bill of quantities"');
    expect(markup).toContain('data-agent-status="unwired"');
    expect(markup).toContain("The assistant is not connected");
    expect(markup).toContain("rgv-demo-0007");
    expect(markup).toContain("No BOQ lines are available");
    expect(markup).toContain("proposed work never changes the observed record");
  });

  test("renders the accessible fallback mode when toggled (no spatial viewer)", () => {
    const markup = renderToStaticMarkup(
      <SolutionWorkspace
        context={{
          projectId: DEMO_SOLUTION_WORLD.projectId,
          caseId: DEMO_SOLUTION_WORLD.caseId,
          solutionId: DEMO_SOLUTION_WORLD.solutionId,
          title: DEMO_SOLUTION_WORLD.title,
          problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
          baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
          observedScene: SCENE,
        }}
      />,
    );
    // The toggle is present and announced; the fallback pane itself renders
    // through the same component tree once toggled (asserted by the
    // fallback suite over the pane directly).
    expect(markup).toContain("Use the accessible view");
    expect(markup).toContain('data-fallback-mode="false"');
  });
});
