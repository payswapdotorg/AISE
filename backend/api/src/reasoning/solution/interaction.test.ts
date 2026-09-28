/**
 * PROD-023 — interaction-loop tests: clarify → answer → propose →
 * confirm → dispatch, honest ambiguity/unsupported/refusal states,
 * read-only tool dispatch, cancellation and new-command replacement.
 *
 * THE MANDATED COVERAGE (work order scope):
 *  - ask targeted clarification questions for missing slots, then merge
 *    the user's answer and recompile (never an invented value);
 *  - show the PROPOSED operation before execution — the typed intent
 *    rendered for review with its material consequences: affected target,
 *    quantities computable from parameters alone, irreversible steps
 *    flagged, review requirements surfaced;
 *  - hand the intent to the tool port on confirmation (the loop NEVER
 *    executes anything itself — `executeDecision` calls ONLY the port);
 *  - navigation/explanation/inspection/BOQ-step lookup dispatch directly;
 *  - ambiguity lists readings; unsupported and unsafe refusals pass
 *    through unchanged.
 */

import { describe, expect, test } from "bun:test";
import { createSolutionCommandCompiler } from "./compiler";
import { decideNextTurn, executeDecision } from "./interaction";
import { createInMemorySolutionToolDouble } from "./tools";
import { constClock, demoSessionContext, bareSessionContext } from "./testkit";
import type { AgentSessionContext, SessionFocus } from "./model";
import type { PendingClarification } from "./interaction";

const compiler = createSolutionCommandCompiler({ clock: constClock() });
const session = demoSessionContext();

function toolDouble() {
  return createInMemorySolutionToolDouble({
    clock: constClock(),
    solutionId: "solution-demo-001",
    versionNumber: 1,
    baselineRealityVersionId: "reality-demo-001",
  });
}

describe("PROD-023 interaction loop: clarify → user answers → proposed operation → confirm", () => {
  test("the full four-turn golden path", async () => {
    const double = toolDouble();

    // Turn 1 — the request lacks the depth: ASK (targeted question).
    const ask = await decideNextTurn(
      { utterance: "Excavate a pit 2 m wide and 3 m long.", session },
      compiler,
    );
    expect(ask.decision).toBe("ask");
    if (ask.decision !== "ask") {
      throw new Error("expected ask");
    }
    expect(ask.questions[0]?.slot).toBe("depth");
    expect(ask.pendingClarification.utterance).toBe(
      "Excavate a pit 2 m wide and 3 m long.",
    );

    // Turn 2 — the user answers; the merged recompilation PROPOSES.
    const propose = await decideNextTurn(
      {
        utterance: "The depth is 2 m.",
        session,
        pendingClarification: ask.pendingClarification,
      },
      compiler,
    );
    expect(propose.decision).toBe("propose");
    if (propose.decision !== "propose") {
      throw new Error("expected propose");
    }
    expect(propose.proposal.renderedCommand).toBe(
      "Excavate a pit 2 m deep, 2 m wide and 3 m long.",
    );
    expect(propose.proposal.intent.parameters).toEqual([
      { name: "depth", value: 2, unit: "m" },
      { name: "width", value: 2, unit: "m" },
      { name: "length", value: 3, unit: "m" },
    ]);
    // Material consequences are shown BEFORE execution.
    expect(propose.proposal.estimatedQuantities[0]).toMatchObject({
      label: "excavated volume (soil removed)",
      dimension: "volume",
      value: 12,
      unit: "m3",
    });
    expect(propose.proposal.estimatedQuantities[0]?.basis).toContain(
      "the solution engine owns authoritative quantity derivation",
    );
    expect(propose.proposal.irreversible).toBe(false);
    expect(propose.proposal.target.description).toBe(
      "The pit excavation area south of the building footprint",
    );
    expect(double.calls).toHaveLength(0);

    // Turn 3 — the user confirms: DISPATCH through the port only.
    const dispatch = await decideNextTurn(
      {
        utterance: "Yes, apply it.",
        session,
        pendingProposal: propose.pendingProposal,
      },
      compiler,
    );
    expect(dispatch.decision).toBe("dispatch-operation");
    if (dispatch.decision !== "dispatch-operation") {
      throw new Error("expected dispatch");
    }
    expect(dispatch.command.solutionId).toBe("solution-demo-001");
    expect(dispatch.command.versionNumber).toBe(1);

    const response = await executeDecision(double, dispatch);
    expect(response.kind).toBe("apply-accepted");
    expect(double.calls).toHaveLength(1);
  });

  test("a material answer resolves the material clarification with the offered vocabulary", async () => {
    const ask = await decideNextTurn(
      { utterance: "Build the wall 5 m long, 1 m high and 0.1 m thick.", session },
      compiler,
    );
    expect(ask.decision).toBe("ask");
    if (ask.decision !== "ask") {
      throw new Error("expected ask");
    }
    expect(ask.questions[0]?.slotKind).toBe("material");
    const propose = await decideNextTurn(
      {
        utterance: "Use clay bricks.",
        session,
        pendingClarification: ask.pendingClarification,
      },
      compiler,
    );
    expect(propose.decision).toBe("propose");
    if (propose.decision !== "propose") {
      throw new Error("expected propose");
    }
    expect(propose.proposal.intent.parameters).toContainEqual({
      name: "material",
      value: "clay-brick",
    });
  });

  test("an answer that does not resolve anything falls back to a NEW command", async () => {
    const pending: PendingClarification = {
      utterance: "Excavate a pit 2 m wide and 3 m long.",
      questions: [
        {
          slotKind: "dimension",
          slot: "depth",
          question: "What is the depth of the excavation?",
        },
      ],
    };
    // The user changes the subject entirely: a fresh plaster command.
    const decision = await decideNextTurn(
      { utterance: "Apply 30 mm plaster to the affected wall faces.", session, pendingClarification: pending },
      compiler,
    );
    expect(decision.decision).toBe("propose");
    if (decision.decision !== "propose") {
      throw new Error("expected propose");
    }
    expect(decision.proposal.intent.operationType).toBe("plaster-application");
  });

  test("a partial answer re-asks only the remaining slots", async () => {
    const ask = await decideNextTurn(
      { utterance: "Excavate a pit.", session },
      compiler,
    );
    expect(ask.decision).toBe("ask");
    if (ask.decision !== "ask") {
      throw new Error("expected ask");
    }
    expect(ask.questions.map((question) => question.slot)).toEqual([
      "depth",
      "width",
      "length",
    ]);
    const again = await decideNextTurn(
      {
        utterance: "The depth is 1.5 m and the width is 2 m.",
        session,
        pendingClarification: ask.pendingClarification,
      },
      compiler,
    );
    expect(again.decision).toBe("ask");
    if (again.decision !== "ask") {
      throw new Error("expected ask");
    }
    expect(again.questions.map((question) => question.slot)).toEqual(["length"]);
    const propose = await decideNextTurn(
      {
        utterance: "3 m long.",
        session,
        pendingClarification: again.pendingClarification,
      },
      compiler,
    );
    expect(propose.decision).toBe("propose");
    if (propose.decision !== "propose") {
      throw new Error("expected propose");
    }
    expect(propose.proposal.intent.parameters).toEqual([
      { name: "depth", value: 1.5, unit: "m" },
      { name: "width", value: 2, unit: "m" },
      { name: "length", value: 3, unit: "m" },
    ]);
  });
});

describe("PROD-023 interaction loop: proposals show material consequences before execution", () => {
  test("a demolition proposal flags irreversibility and surfaces the review requirement", async () => {
    const decision = await decideNextTurn(
      {
        utterance: "Demolish the wall section 5 m long, 2.4 m high and 0.1 m thick.",
        session,
      },
      compiler,
    );
    expect(decision.decision).toBe("propose");
    if (decision.decision !== "propose") {
      throw new Error("expected propose");
    }
    expect(decision.proposal.irreversible).toBe(true);
    expect(decision.proposal.reviewRequirements).toContain(
      "load-bearing elements require engineer review before removal",
    );
    expect(decision.proposal.estimatedQuantities[0]?.value).toBe(1.2);
    expect(decision.proposal.estimatedQuantities[0]?.unit).toBe("m3");
  });

  test("a plaster proposal estimates the layer volume from the caller-known face area", async () => {
    const decision = await decideNextTurn(
      { utterance: "Apply 30 mm plaster to the affected wall faces.", session },
      compiler,
    );
    expect(decision.decision).toBe("propose");
    if (decision.decision !== "propose") {
      throw new Error("expected propose");
    }
    expect(decision.proposal.estimatedQuantities[0]).toMatchObject({
      label: "layer volume (thickness × caller-known face area)",
      dimension: "volume",
      value: 0.36,
      unit: "m3",
    });
    expect(decision.proposal.estimatedQuantities[0]?.basis).toContain(
      "deterministic arithmetic",
    );
  });

  test("an opening proposal surfaces the engineer-review requirement", async () => {
    const decision = await decideNextTurn(
      {
        utterance: "Cut a timber door opening 1 m wide and 2.1 m high in this wall.",
        session,
      },
      compiler,
    );
    expect(decision.decision).toBe("propose");
    if (decision.decision !== "propose") {
      throw new Error("expected propose");
    }
    expect(decision.proposal.reviewRequirements).toContain(
      "openings in load-bearing walls require engineer review",
    );
  });
});

describe("PROD-023 interaction loop: honest states pass through unchanged", () => {
  test("ambiguity lists the readings", async () => {
    const decision = await decideNextTurn({ utterance: "Excavate a pit 2 m.", session }, compiler);
    expect(decision.decision).toBe("ambiguous");
    if (decision.decision !== "ambiguous") {
      throw new Error("expected ambiguity");
    }
    expect(decision.command.readings.length).toBe(3);
  });

  test("unsupported is honest (names the future vertical where inferable)", async () => {
    const decision = await decideNextTurn(
      { utterance: "Design the bridge crossing over the river.", session },
      compiler,
    );
    expect(decision.decision).toBe("unsupported");
    if (decision.decision !== "unsupported") {
      throw new Error("expected unsupported");
    }
    expect(decision.command.vertical).toBe("civil-works");
  });

  test("an authority claim refuses with the taxonomy reason", async () => {
    const decision = await decideNextTurn(
      { utterance: "Mark this solution as validated.", session },
      compiler,
    );
    expect(decision.decision).toBe("refuse");
    if (decision.decision !== "refuse") {
      throw new Error("expected refusal");
    }
    expect(decision.command.reasonCode).toBe("validation-authority-claim");
    expect("intent" in decision.command).toBe(false);
  });

  test("a tool command without an attached session asks which solution it addresses", async () => {
    const decision = await decideNextTurn(
      { utterance: "Validate the solution.", session: bareSessionContext() },
      compiler,
    );
    expect(decision.decision).toBe("ask");
    if (decision.decision !== "ask") {
      throw new Error("expected ask");
    }
    expect(decision.questions[0]?.slotKind).toBe("location");
    expect(decision.questions[0]?.slot).toBe("solution context");
  });
});

describe("PROD-023 interaction loop: read-only tool commands dispatch directly", () => {
  test.each([
    ["Show me step 3.", "navigate"],
    ["What does step 2 do?", "explain"],
    ["Inspect the current proposed state.", "inspect"],
    ["Which BOQ lines come from step 1?", "boq-step-lookup"],
    ["Validate the solution.", "validate"],
  ] as const)("%s dispatches without a proposal step", async (utterance, expectedKind) => {
    const decision = await decideNextTurn({ utterance, session }, compiler);
    expect(decision.decision).toBe("dispatch-tool");
    if (decision.decision !== "dispatch-tool") {
      throw new Error("expected dispatch-tool");
    }
    expect(decision.command.kind as string).toBe(expectedKind);
  });

  test("the dispatched explain command executes through the port", async () => {
    const double = toolDouble();
    const decision = await decideNextTurn({ utterance: "What does step 1 do?", session }, compiler);
    const response = await executeDecision(double, decision);
    // The double has no applied operations yet: an honest typed refusal.
    expect(response.kind).toBe("tool-refusal");
    expect(double.calls).toHaveLength(1);
  });
});

describe("PROD-023 interaction loop: pending-state lifecycle", () => {
  test("cancelling a pending proposal clears it", async () => {
    const propose = await decideNextTurn(
      { utterance: "Apply 30 mm plaster to the affected wall faces.", session },
      compiler,
    );
    if (propose.decision !== "propose") {
      throw new Error("expected propose");
    }
    const cancelled = await decideNextTurn(
      { utterance: "Cancel that.", session, pendingProposal: propose.pendingProposal },
      compiler,
    );
    expect(cancelled.decision).toBe("cancelled");
  });

  test("cancelling a pending clarification clears it", async () => {
    const ask = await decideNextTurn(
      { utterance: "Excavate a pit 2 m wide and 3 m long.", session },
      compiler,
    );
    if (ask.decision !== "ask") {
      throw new Error("expected ask");
    }
    const cancelled = await decideNextTurn(
      { utterance: "Never mind.", session, pendingClarification: ask.pendingClarification },
      compiler,
    );
    expect(cancelled.decision).toBe("cancelled");
  });

  test("a new command while a proposal is pending replaces it", async () => {
    const propose = await decideNextTurn(
      { utterance: "Apply 30 mm plaster to the affected wall faces.", session },
      compiler,
    );
    if (propose.decision !== "propose") {
      throw new Error("expected propose");
    }
    // Not a confirmation word: a fresh command.
    const fresh = await decideNextTurn(
      {
        utterance: "Actually, excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
        session,
        pendingProposal: propose.pendingProposal,
      },
      compiler,
    );
    expect(fresh.decision).toBe("propose");
    if (fresh.decision !== "propose") {
      throw new Error("expected propose");
    }
    expect(fresh.proposal.intent.operationType).toBe("excavation");
  });

  test("'approve' is NOT a confirmation word — approval is a refusal, never a loop shortcut", async () => {
    const propose = await decideNextTurn(
      { utterance: "Apply 30 mm plaster to the affected wall faces.", session },
      compiler,
    );
    if (propose.decision !== "propose") {
      throw new Error("expected propose");
    }
    const decision = await decideNextTurn(
      { utterance: "I approve this plaster work.", session, pendingProposal: propose.pendingProposal },
      compiler,
    );
    expect(decision.decision).toBe("refuse");
    if (decision.decision !== "refuse") {
      throw new Error("expected refusal");
    }
    expect(decision.command.reasonCode).toBe("approval-authority-claim");
  });
});

/* ------------------------------------------------------------------ */
/* QA-004: the Lead's live sequence — area language (D5a) + the         */
/* constraint gate at the confirm boundary (D5b)                        */
/* ------------------------------------------------------------------ */

/**
 * The LIVE wall-world session shape (Lead-verified defect, 2026-09-26):
 * wall-faces focus present, NO default focus — turn 1 of the Lead's
 * sequence asked "Which target location should the plaster-application
 * apply to?" and the answer "Damaged ground-floor wall faces" anchored it.
 */
const QA004_WALL_FACES_FOCUS: SessionFocus = {
  focusId: "wall-faces",
  label: "Damaged ground-floor wall faces",
  aliases: [
    "ground-floor wall faces",
    "the ground-floor wall faces",
    "affected wall faces",
    "the wall faces",
  ],
  selectorKind: "face-set",
  nodeRefs: ["node-wall-002"],
  geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002" }],
  knownParameters: [
    { name: "length", value: 5, unit: "m" },
    { name: "height", value: 2.4, unit: "m" },
    { name: "area", value: 12, unit: "m2" },
  ],
};

function qa004LiveSession(): AgentSessionContext {
  return {
    sessionId: "session-qa004-live",
    agentId: "agent-demo-assistant",
    userId: "user-demo-engineer",
    proposedTo: { solutionId: "solution-demo-001", versionNumber: 1 },
    foci: [QA004_WALL_FACES_FOCUS],
  };
}

describe("QA-004 interaction loop: the Lead's 3-turn sequence — the 2500 mm proposal is gone", () => {
  test("D5a: utterance → location answer → dimension clarification (never the mis-bound proposal)", async () => {
    const live = qa004LiveSession();

    // Turn 1 — the Lead's exact utterance: the area language leaves the
    // thickness unstated and no focus matches, so the agent asks BOTH the
    // thickness and the target location (never proposes a thickness).
    const ask = await decideNextTurn(
      {
        utterance:
          "Apply a cement plaster coat to the damaged wall faces over a 2.5 by 2.5 metre area",
        session: live,
      },
      compiler,
    );
    expect(ask.decision).toBe("ask");
    if (ask.decision !== "ask") {
      throw new Error("expected ask (D5a)");
    }
    expect(ask.questions.map((question) => `${question.slotKind}/${question.slot}`)).toEqual([
      "dimension/thickness",
      "location/target location",
    ]);

    // Turn 2 — the Lead's location answer: the merged recompilation
    // resolves the target but the thickness is STILL unstated — the
    // previously-misbound 2500 mm proposal becomes a dimension
    // clarification (the D5a path).
    const clarify = await decideNextTurn(
      {
        utterance: "Damaged ground-floor wall faces",
        session: live,
        pendingClarification: ask.pendingClarification,
      },
      compiler,
    );
    expect(clarify.decision).toBe("ask");
    if (clarify.decision !== "ask") {
      throw new Error("expected the thickness clarification (D5a) — not a proposal");
    }
    expect(clarify.questions).toHaveLength(1);
    expect(clarify.questions[0]?.slotKind).toBe("dimension");
    expect(clarify.questions[0]?.slot).toBe("thickness");

    // Turn 3 — the user supplies a valid explicit thickness: NOW it
    // proposes, within the declared limit.
    const propose = await decideNextTurn(
      {
        utterance: "30 mm thick",
        session: live,
        pendingClarification: clarify.pendingClarification,
      },
      compiler,
    );
    expect(propose.decision).toBe("propose");
    if (propose.decision !== "propose") {
      throw new Error("expected the corrected proposal");
    }
    expect(propose.proposal.renderedCommand).toBe(
      "Apply 30 mm cement-plaster to the affected wall faces.",
    );
    expect(propose.proposal.intent.parameters).toEqual([
      { name: "thickness", value: 30, unit: "mm" },
      { name: "material", value: "cement-plaster" },
    ]);
  });

  test("D5b: explicit over-limit thickness → the constraint re-ask, never a confirmable proposal", async () => {
    const live = qa004LiveSession();

    // Turn 1 — the thickness IS stated (60 mm, over the 50 mm per-coat
    // limit) but no focus matches: the location is asked first.
    const ask = await decideNextTurn(
      { utterance: "Apply 60 mm cement plaster to the damaged wall faces", session: live },
      compiler,
    );
    expect(ask.decision).toBe("ask");
    if (ask.decision !== "ask") {
      throw new Error("expected ask (location)");
    }
    expect(ask.questions.map((question) => question.slot)).toEqual(["target location"]);

    // Turn 2 — the location answer completes the parameter set… which
    // violates the declared limit: the gate fires BEFORE any proposal.
    // The agent re-asks with the exact violation prose — the D5b path.
    const gated = await decideNextTurn(
      {
        utterance: "Damaged ground-floor wall faces",
        session: live,
        pendingClarification: ask.pendingClarification,
      },
      compiler,
    );
    expect(gated.decision).toBe("ask");
    if (gated.decision !== "ask") {
      throw new Error("expected the constraint re-ask (D5b) — never a proposal");
    }
    expect(gated.questions).toHaveLength(1);
    expect(gated.questions[0]?.slotKind).toBe("constraint");
    expect(gated.questions[0]?.slot).toBe("thickness");
    expect(gated.questions[0]?.question).toContain("maximum plaster thickness is 50 mm per coat");
    expect(gated.questions[0]?.question).toContain("60 mm");
  });

  test("a confirmation with NO pending proposal never dispatches (the gate leaves nothing confirmable)", async () => {
    const live = qa004LiveSession();
    const decision = await decideNextTurn(
      { utterance: "Confirm the proposed operation and apply it", session: live },
      compiler,
    );
    expect(decision.decision).not.toBe("dispatch-operation");
    expect(decision.decision).not.toBe("propose");
  });

  test("the canonical 30 mm golden path still proposes AND confirms end-to-end", async () => {
    const double = toolDouble();
    const live = qa004LiveSession();
    const propose = await decideNextTurn(
      { utterance: "Apply 30 mm plaster to the affected wall faces.", session: live },
      compiler,
    );
    expect(propose.decision).toBe("propose");
    if (propose.decision !== "propose") {
      throw new Error("expected the canonical proposal");
    }
    expect(propose.proposal.reviewRequirements).toContain(
      "maximum plaster thickness is 50 mm per coat",
    );
    const dispatch = await decideNextTurn(
      {
        utterance: "Yes, apply it.",
        session: live,
        pendingProposal: propose.pendingProposal,
      },
      compiler,
    );
    expect(dispatch.decision).toBe("dispatch-operation");
    if (dispatch.decision !== "dispatch-operation") {
      throw new Error("expected dispatch");
    }
    const response = await executeDecision(double, dispatch);
    expect(response.kind).toBe("apply-accepted");
  });
});
