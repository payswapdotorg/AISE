import { createSolutionCommandCompiler } from "@aise/solution-compiler";
import type { CompiledCommand } from "@aise/solution-compiler/model";
import { SPIKE_SOLUTION_ID, fixtureGeometryRef, fixtureNodeRef, currentWorkspace } from "@spike/server/workspace";

/**
 * GBIM-003 — the agent lane: compiles utterances through the REAL
 * deterministic PROD-023 compiler (backend/api/src/reasoning/solution/
 * compiler.ts — the same code the production solution-agent routes use),
 * with a session mirroring the sandbox's selected reality focus.
 */

const compiler = createSolutionCommandCompiler({
  clock: () => "2026-09-25T00:00:00.000Z",
});

interface FocusSeed {
  readonly focusId: string;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly selectorKind: "element";
  readonly elementId: string;
}

const FOCI: readonly FocusSeed[] = [
  { focusId: "wall", label: "the wall", aliases: ["wall", "the wall", "wall-001", "perimeter wall"], selectorKind: "element", elementId: "wall-001" },
  { focusId: "partition", label: "the partition", aliases: ["partition", "the partition", "partition-001"], selectorKind: "element", elementId: "partition-001" },
  { focusId: "slab", label: "the floor slab", aliases: ["slab", "floor", "floor slab", "slab-001"], selectorKind: "element", elementId: "slab-001" },
  { focusId: "footing", label: "the footing", aliases: ["footing", "footings", "footing-001"], selectorKind: "element", elementId: "footing-001" },
  { focusId: "room", label: "the room", aliases: ["room", "the room", "area", "room-001"], selectorKind: "element", elementId: "room-001" },
];

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { utterance?: string };
  const utterance = typeof body.utterance === "string" ? body.utterance : "";
  const workspace = currentWorkspace();
  const versionNumber = workspace.version.versionNumber;
  const command = await compiler.compile({
    utterance,
    session: {
      sessionId: "session-gbim003-sandbox",
      agentId: "agent-gbim003-sandbox",
      userId: "operator-gbim003",
      proposedTo: { solutionId: SPIKE_SOLUTION_ID, versionNumber },
      foci: FOCI.map((focus) => ({
        focusId: focus.focusId,
        label: focus.label,
        aliases: focus.aliases,
        selectorKind: focus.selectorKind,
        nodeRefs: [fixtureNodeRef(focus.elementId)],
        geometryRefs: [fixtureGeometryRef(focus.elementId)],
        knownParameters: [],
      })),
      defaultFocusId: "room",
      recentOperations: workspace.version.operations.map((operation) => ({
        operationId: operation.operationId,
        operationType: operation.operationType,
        parameters: operation.parameters,
      })),
    },
  });
  return Response.json(projectCommand(command, utterance));
}

function projectCommand(command: CompiledCommand, utterance: string): Record<string, unknown> {
  const base = { utterance };
  if (command.kind === "operation-intent") {
    return {
      ...base,
      kind: "operation-intent",
      normalizedCommandText: command.attribution.normalizedCommandText ?? null,
      intent: command.intent,
      detail: `compiled to a typed EngineeringOperationIntent (${command.intent.operationType}) through the deterministic compiler — confirm to apply through the same engine path as direct manipulation`,
      questions: [],
      reasonCode: null,
    };
  }
  if (command.kind === "clarification-needed") {
    return {
      ...base,
      kind: "clarification-needed",
      normalizedCommandText: command.attribution.normalizedCommandText ?? null,
      intent: null,
      detail: "the compiler asks for the exact missing values — it never invents dimensions or materials",
      questions: command.questions.map((question) => question.question),
      reasonCode: null,
    };
  }
  if (command.kind === "unsafe-refusal") {
    return {
      ...base,
      kind: "unsafe-refusal",
      normalizedCommandText: null,
      intent: null,
      detail: `refused before any intent was produced: ${command.reason}`,
      questions: [],
      reasonCode: command.reasonCode,
    };
  }
  if (command.kind === "tool-command") {
    return {
      ...base,
      kind: "tool-command",
      normalizedCommandText: null,
      intent: null,
      detail: "compiled to a read-only tool command (navigation/explanation/inspection) — no operation proposed",
      questions: [],
      reasonCode: null,
    };
  }
  return {
    ...base,
    kind: command.kind,
    normalizedCommandText: null,
    intent: null,
    detail: "message" in command ? String((command as { message?: string }).message ?? command.kind) : `compiler outcome: ${command.kind}`,
    questions: [],
    reasonCode: "reasonCode" in command ? String((command as { reasonCode?: unknown }).reasonCode ?? "") : null,
  };
}
