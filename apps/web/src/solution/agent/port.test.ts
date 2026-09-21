/**
 * PROD-024 — the AGENT SEAM tests: the scripted double's determinism and
 * honesty (it never improvises) + the HTTP adapter's wire shapes over the
 * PROD-023 route factory's paths.
 */

import { describe, expect, test } from "bun:test";
import {
  askDecisionOf,
  buildAgentIntent,
  createHttpSolutionAgentPort,
  createScriptedSolutionAgentPort,
  dispatchOperationDecisionOf,
  proposeDecisionOf,
  unsupportedDecisionOf,
  refuseDecisionOf,
  ambiguousDecisionOf,
  type AgentFetchLike,
} from "./port";
import { DEMO_SOLUTION_WORLD } from "../fixtures";

const WALL_LINE_TARGET = {
  contractVersion: "1.0.0",
  selectorKind: "line-extent" as const,
  nodeRefs: ["node-wall-002"],
  geometryRefs: [{ kind: "plane" as const, ref: "geo-wall-line-003" }],
  units: { linear: "m", angular: "rad" },
  description: "The wall line along the damaged section",
};

function blockWallProposal() {
  const intent = buildAgentIntent({
    intentId: "intent-agent-block-001",
    operationType: "block-wall-placement",
    parameters: [
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 1, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
      { name: "material", value: "concrete-block" },
    ],
    target: WALL_LINE_TARGET,
    commandText: "Lay blocks to a height of 1 m along this wall.",
    authoredAt: "2026-09-16T09:10:00.000Z",
  });
  return proposeDecisionOf({
    intent,
    renderedCommand: "Lay blocks to a height of 1 m along this wall.",
    estimatedQuantities: [
      {
        label: "Blocks needed",
        dimension: "count",
        value: 65,
        unit: "count",
        basis: "parameters only",
      },
    ],
    irreversible: false,
    reviewRequirements: ["maximum wall height is 3 m per operation"],
    utterance: "Rebuild the damaged wall with blocks. 1 m high, using concrete blocks",
  });
}

function demoSession() {
  return {
    sessionId: DEMO_SOLUTION_WORLD.agentSessionId,
    agentId: DEMO_SOLUTION_WORLD.agentId,
    proposedTo: { solutionId: DEMO_SOLUTION_WORLD.solutionId, versionNumber: 1 },
  };
}

describe("PROD-024 agent seam (the scripted double)", () => {
  test("replays scripted turns IN ORDER and never improvises", async () => {
    const proposal = blockWallProposal();
    const port = createScriptedSolutionAgentPort({
      agentId: "agent-demo-assistant",
      turns: [
        {
          utterance: "Rebuild the damaged wall with blocks.",
          decision: askDecisionOf({
            utterance: "Rebuild the damaged wall with blocks.",
            questions: [
              { slotKind: "dimension", slot: "height", question: "How high?" },
            ],
          }),
        },
        {
          utterance: "Rebuild the damaged wall with blocks. 1 m high, using concrete blocks",
          decision: proposal,
        },
        {
          utterance: "yes, apply it",
          decision: dispatchOperationDecisionOf(proposal.proposal, DEMO_SOLUTION_WORLD.solutionId, 1),
        },
      ],
    });
    expect(port.descriptor.binding).toBe("scripted-double");

    // Turn 1: the clarification.
    const ask = await port.decideTurn({
      utterance: "Rebuild the damaged wall with blocks.",
      session: demoSession(),
    });
    expect(ask.decision).toBe("ask");
    if (ask.decision === "ask") {
      expect(ask.questions[0]?.slot).toBe("height");
    }

    // Turn 2: the merged answer recompiles to the proposal (the merged
    // utterance is what the REAL interaction loop recompiles).
    const propose = await port.decideTurn({
      utterance: "1 m high, using concrete blocks",
      session: demoSession(),
      pendingClarification: {
        utterance: "Rebuild the damaged wall with blocks.",
        questions: [{ slotKind: "dimension", slot: "height", question: "How high?" }],
      },
    });
    expect(propose.decision).toBe("propose");

    // Turn 3: the confirmation dispatches the apply command.
    const dispatch = await port.decideTurn({
      utterance: "yes, apply it",
      session: demoSession(),
      pendingProposal:
        propose.decision === "propose" ? propose.pendingProposal : undefined,
    });
    expect(dispatch.decision).toBe("dispatch-operation");

    // Turn 4: nothing scripted — the honest cancelled answer.
    const exhausted = await port.decideTurn({
      utterance: "anything else",
      session: demoSession(),
    });
    expect(exhausted.decision).toBe("cancelled");

    // A mismatched utterance at a scripted position also refuses honestly.
    const mismatched = await createScriptedSolutionAgentPort({
      agentId: "a",
      turns: [
        {
          utterance: "expected words",
          decision: askDecisionOf({
            utterance: "expected words",
            questions: [{ slotKind: "dimension", slot: "depth", question: "?" }],
          }),
        },
      ],
    }).decideTurn({ utterance: "different words", session: demoSession() });
    expect(mismatched.decision).toBe("cancelled");
  });

  test("compile serves the scripted compile outcomes and answers unsupported otherwise", async () => {
    const proposal = blockWallProposal();
    const port = createScriptedSolutionAgentPort({
      agentId: "agent-demo-assistant",
      turns: [
        {
          utterance: "Rebuild the damaged wall with blocks. 1 m high, using concrete blocks",
          decision: proposal,
        },
      ],
    });
    const compiled = await port.compile({
      utterance: "Rebuild the damaged wall with blocks. 1 m high, using concrete blocks",
      session: demoSession(),
    });
    expect(compiled.kind).toBe("operation-intent");
    const unknown = await port.compile({ utterance: "unscripted", session: demoSession() });
    expect(unknown.kind).toBe("unsupported");
  });

  test("the honest-state decisions (unsupported / ambiguous / unsafe-refusal) carry verbatim payloads", () => {
    const unsupported = unsupportedDecisionOf({
      utterance: "Pave a highway.",
      reason: "road works are outside the buildings-only scope",
      vertical: "civil-works",
    });
    expect(unsupported.decision).toBe("unsupported");
    if (unsupported.decision === "unsupported") {
      expect(unsupported.command.reason).toContain("outside the buildings-only scope");
      expect(unsupported.command.vertical).toBe("civil-works");
    }
    const ambiguous = ambiguousDecisionOf({
      utterance: "fix the wall",
      readings: [
        { description: "replaster the wall", operationType: "plaster-application", differingSlot: "material" },
        { description: "rebuild the wall", operationType: "block-wall-placement", differingSlot: "material" },
      ],
    });
    expect(ambiguous.decision).toBe("ambiguous");
    if (ambiguous.decision === "ambiguous") {
      expect(ambiguous.command.readings).toHaveLength(2);
    }
    const refusal = refuseDecisionOf({
      utterance: "mark this wall as observed reality",
      reasonCode: "reality-authority-claim",
      reason: "the agent can never declare observed reality",
    });
    expect(refusal.decision).toBe("refuse");
    if (refusal.decision === "refuse") {
      expect(refusal.command.reasonCode).toBe("reality-authority-claim");
    }
  });
});

describe("PROD-024 agent seam (the HTTP binding)", () => {
  function capturingFetch(
    respond: (path: string, body: unknown) => unknown,
  ): { fetchImpl: AgentFetchLike; calls: { path: string; body: unknown }[] } {
    const calls: { path: string; body: unknown }[] = [];
    const fetchImpl: AgentFetchLike = async (path, init) => {
      const body = init?.body === undefined ? undefined : (JSON.parse(init.body) as unknown);
      calls.push({ path, body });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(respond(path, body)),
      };
    };
    return { fetchImpl, calls };
  }

  test("compile posts to the PROD-023 route factory's compile path", async () => {
    const { fetchImpl, calls } = capturingFetch(() => ({
      ok: true,
      command: { kind: "unsupported", reason: "x", attribution: {} },
    }));
    const port = createHttpSolutionAgentPort({ fetchImpl });
    const session = demoSession();
    const command = await port.compile({ utterance: "hello", session });
    expect(calls[0]?.path).toBe("/v1/solution-agent/compile");
    expect(calls[0]?.body).toEqual({ utterance: "hello", session });
    expect(command.kind).toBe("unsupported");
  });

  test("turn posts the pending state through and unwraps the decision", async () => {
    const proposal = blockWallProposal();
    const pendingProposal =
      proposal.decision === "propose" ? proposal.pendingProposal : undefined;
    const { fetchImpl, calls } = capturingFetch(() => ({
      ok: true,
      decision: { decision: "cancelled", note: "n/a" },
    }));
    const port = createHttpSolutionAgentPort({ fetchImpl });
    const decision = await port.decideTurn({
      utterance: "yes, apply it",
      session: demoSession(),
      ...(pendingProposal === undefined ? {} : { pendingProposal }),
    });
    expect(calls[0]?.path).toBe("/v1/solution-agent/turn");
    expect(calls[0]?.body).toEqual({
      utterance: "yes, apply it",
      session: demoSession(),
      pendingProposal,
    });
    expect(decision.decision).toBe("cancelled");
  });
});
