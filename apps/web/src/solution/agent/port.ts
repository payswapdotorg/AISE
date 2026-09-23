/**
 * PROD-024 — the AGENT SEAM of the interactive solution workspace.
 *
 * The port through which the workspace routes natural-language intents to
 * the PROD-023 agent operation compiler (`backend/api/src/reasoning/solution/`
 * — the deterministic NL → `EngineeringOperationIntent` compiler plus its
 * clarification/proposal interaction loop). The compiler lives in the
 * backend zone and CANNOT be imported from apps (the AISE-001 boundary
 * matrix: apps → apps|packages only), so this module defines the port as
 * STRUCTURAL MIRRORS of the compiler's public shapes — the same field
 * names and JSON shapes as `reasoning/solution/model.ts` + `interaction.ts`
 * (the `workspace/model.ts` mirror discipline). The REAL compiler's values
 * satisfy these types as-is; the Tech Lead's binding at the integration
 * station wires the real `createSolutionCommandCompiler()` +
 * `decideNextTurn` (directly, or through the mounted
 * `POST /v1/solution-agent/compile|turn` routes this module's HTTP adapter
 * speaks) with zero workspace edits.
 *
 * The workspace NEVER re-implements the compiler: it never parses language,
 * never invents dimensions/materials and never fabricates operations. It
 * submits utterances (+ pending state) to the port and renders the typed
 * outcomes VERBATIM — clarification questions, proposals (previewed before
 * execution), unsupported/ambiguous/unsafe-refusal states and read-only
 * tool commands. Confirmed proposals are applied through the SAME
 * submission path as direct manipulation (§4.2 of the work order — one
 * operation semantics).
 *
 * Two port implementations ship:
 *
 *  1. `createHttpSolutionAgentPort` — the same-origin HTTP binding over the
 *     PROD-023 route factory's paths (fetch INJECTED; PROD-001 contract).
 *  PROD-031 (the browser-safe cut): the constructor import comes from the
 *  `@aise/solution-contract/browser` subpath (the crypto-free cut of the
 *  contract — the barrel re-exports the node:crypto-dependent identity
 *  derivations, which a plain-browser bundle externalizes), so this seam
 *  is part of the browser mount's chunk graph (the HTTP agent port is the
 *  browser mount's LIVE assistant binding).
 *  2. `createScriptedSolutionAgentPort` — a CLEARLY-LABELED DETERMINISTIC
 *     TEST DOUBLE for the co-located tests (the PROD-023 discipline of
 *     `createInMemorySolutionToolDouble`): it replays fixed scripted
 *     responses — REAL contract intents built through
 *     `createOperationIntent` with agent provenance — and never parses
 *     anything. It is a double OF the seam, never a second compiler.
 */

import {
  createOperationIntent,
  REFERENCE_BUILDING_DOMAIN,
  type EngineeringOperationIntent,
  type OperationTarget,
  type TypedOperationParameter,
} from "../../../../../packages/solution-contract/src/browser";

/* ------------------------------------------------------------------ */
/* Structural mirrors of the PROD-023 compiler shapes                  */
/* (backend/api/src/reasoning/solution/model.ts + interaction.ts)      */
/* ------------------------------------------------------------------ */

/** Mirror of `SessionFocus` — a caller-asserted spatial anchoring focus. */
export interface AgentSessionFocus {
  readonly focusId: string;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly selectorKind: OperationTarget["selectorKind"];
  readonly nodeRefs: readonly string[];
  readonly geometryRefs: OperationTarget["geometryRefs"];
  readonly knownParameters?: readonly TypedOperationParameter[];
}

/** Mirror of `RecentOperationSummary` — a session operation, caller-projected. */
export interface AgentRecentOperation {
  readonly operationId: string;
  readonly operationType: string;
  readonly parameters: readonly TypedOperationParameter[];
}

/** Mirror of `AgentSessionContext` — everything the compiler may look at. */
export interface AgentSessionContext {
  readonly sessionId: string;
  readonly agentId: string;
  readonly userId?: string;
  readonly proposedTo?: { readonly solutionId: string; readonly versionNumber: number };
  readonly foci?: readonly AgentSessionFocus[];
  readonly defaultFocusId?: string;
  readonly recentOperations?: readonly AgentRecentOperation[];
}

/** Mirror of `ClarificationQuestion` — one targeted missing-slot question. */
export interface AgentClarificationQuestion {
  readonly slotKind: "dimension" | "material" | "location" | "sequencing" | "constraint";
  readonly slot: string;
  readonly question: string;
  readonly offeredChoices?: readonly string[];
}

/** Mirror of `AmbiguityReading` — one reading of an ambiguous utterance. */
export interface AgentAmbiguityReading {
  readonly description: string;
  readonly operationType?: string;
  readonly differingSlot?: string;
}

/** Mirror of `CommandAttribution` — the executed command's attribution. */
export interface AgentCommandAttribution {
  readonly rawUtterance: string;
  readonly normalizedCommand: string;
  readonly normalizedCommandText: string;
  readonly compilerPath: "deterministic" | "provider-enriched";
  readonly agentId: string;
  readonly userId?: string;
  readonly sessionId: string;
  readonly compiledAt: string;
}

/** Mirror of the `CompiledCommand` union (the operation-authoring members
 *  the workspace renders; the tool-command member below). */
export type AgentCompiledCommand =
  | { readonly kind: "operation-intent"; readonly intent: EngineeringOperationIntent; readonly attribution: AgentCommandAttribution }
  | {
      readonly kind: "clarification-needed";
      readonly questions: readonly [AgentClarificationQuestion, ...AgentClarificationQuestion[]];
      readonly partialOperationType?: string;
      readonly attribution: AgentCommandAttribution;
    }
  | { readonly kind: "unsupported"; readonly vertical?: string; readonly reason: string; readonly attribution: AgentCommandAttribution }
  | {
      readonly kind: "ambiguous";
      readonly readings: readonly [AgentAmbiguityReading, ...AgentAmbiguityReading[]];
      readonly attribution: AgentCommandAttribution;
    }
  | { readonly kind: "unsafe-refusal"; readonly reasonCode: string; readonly reason: string; readonly attribution: AgentCommandAttribution }
  | {
      readonly kind: "tool-command";
      readonly toolCommandKind: "validate" | "inspect" | "navigate" | "explain" | "boq-step-lookup";
      readonly command: AgentToolCommand;
      readonly attribution: AgentCommandAttribution;
    };

/** Mirror of the `SolutionToolCommand` union (the read-only/agentic commands). */
export type AgentToolCommand =
  | { readonly kind: "validate"; readonly attribution: AgentCommandAttribution; readonly solutionId: string; readonly versionNumber: number }
  | {
      readonly kind: "apply";
      readonly attribution: AgentCommandAttribution;
      readonly intent: EngineeringOperationIntent;
      readonly solutionId: string;
      readonly versionNumber: number;
    }
  | { readonly kind: "inspect"; readonly attribution: AgentCommandAttribution; readonly solutionId: string; readonly versionNumber: number }
  | {
      readonly kind: "navigate";
      readonly attribution: AgentCommandAttribution;
      readonly solutionId: string;
      readonly versionNumber: number;
      readonly target: {
        readonly kind: "goto-step" | "list-steps" | "current-state";
        readonly stateIndex?: number;
      };
    }
  | {
      readonly kind: "explain";
      readonly attribution: AgentCommandAttribution;
      readonly solutionId: string;
      readonly versionNumber: number;
      readonly operationIndex: number;
    }
  | {
      readonly kind: "boq-step-lookup";
      readonly attribution: AgentCommandAttribution;
      readonly solutionId: string;
      readonly versionNumber: number;
      readonly operationIndex: number;
    };

/** Mirror of `OperationProposal` — the pre-execution review surface. */
export interface AgentOperationProposal {
  readonly intent: EngineeringOperationIntent;
  readonly attribution: AgentCommandAttribution;
  readonly renderedCommand: string;
  readonly target: {
    readonly description: string;
    readonly selectorKind: OperationTarget["selectorKind"];
    readonly nodeRefs: readonly string[];
    readonly geometryRefs: OperationTarget["geometryRefs"];
  };
  readonly estimatedQuantities: readonly {
    readonly label: string;
    readonly dimension: "length" | "area" | "volume" | "count";
    readonly value: number;
    readonly unit: string;
    readonly basis: string;
  }[];
  readonly irreversible: boolean;
  readonly reviewRequirements: readonly string[];
}

/** Mirror of `PendingClarification` — a clarification awaiting the answer. */
export interface AgentPendingClarification {
  readonly utterance: string;
  readonly questions: readonly AgentClarificationQuestion[];
}

/** Mirror of `PendingProposal` — a proposal awaiting confirmation. */
export interface AgentPendingProposal {
  readonly proposal: AgentOperationProposal;
  readonly utterance: string;
}

/** Mirror of the `TurnDecision` union (the workspace's consumption side). */
export type AgentTurnDecision =
  | { readonly decision: "ask"; readonly questions: readonly AgentClarificationQuestion[]; readonly pendingClarification: AgentPendingClarification }
  | { readonly decision: "propose"; readonly proposal: AgentOperationProposal; readonly pendingProposal: AgentPendingProposal }
  | { readonly decision: "dispatch-operation"; readonly command: AgentToolCommand & { readonly kind: "apply" }; readonly proposal: AgentOperationProposal }
  | { readonly decision: "dispatch-tool"; readonly command: AgentToolCommand }
  | { readonly decision: "unsupported"; readonly command: AgentCompiledCommand & { readonly kind: "unsupported" } }
  | { readonly decision: "ambiguous"; readonly command: AgentCompiledCommand & { readonly kind: "ambiguous" } }
  | { readonly decision: "refuse"; readonly command: AgentCompiledCommand & { readonly kind: "unsafe-refusal" } }
  | { readonly decision: "cancelled"; readonly note: string };

/** Mirror of `TurnInput` — one interaction turn. */
export interface AgentTurnInput {
  readonly utterance: string;
  readonly session: AgentSessionContext;
  readonly pendingClarification?: AgentPendingClarification;
  readonly pendingProposal?: AgentPendingProposal;
}

/* ------------------------------------------------------------------ */
/* The port                                                            */
/* ------------------------------------------------------------------ */

/** Honest identity of the agent binding (metadata, never authority). */
export interface SolutionAgentDescriptor {
  readonly agentId: string;
  /** Which path produced this binding ("http-route" | "scripted-double"). */
  readonly binding: string;
}

/**
 * THE agent seam: compiles utterances and decides interaction turns
 * through the PROD-023 compiler (real binding wired by the Tech Lead; the
 * scripted double exists for tests only). The workspace renders the typed
 * outcomes verbatim and NEVER authors operations itself.
 */
export interface SolutionAgentPort {
  readonly descriptor: SolutionAgentDescriptor;
  compile(input: {
    readonly utterance: string;
    readonly session: AgentSessionContext;
  }): Promise<AgentCompiledCommand>;
  decideTurn(input: AgentTurnInput): Promise<AgentTurnDecision>;
}

/* ------------------------------------------------------------------ */
/* The HTTP binding (the Lead's production wiring)                      */
/* ------------------------------------------------------------------ */

/** A fetch-like transport (the browser global, or a test stub). */
export type AgentFetchLike = (
  input: string,
  init?: { readonly method?: string; readonly body?: string },
) => Promise<{ readonly ok: boolean; readonly status: number; readonly text: () => Promise<string> }>;

async function postAgentJson(
  fetchImpl: AgentFetchLike,
  path: string,
  body: unknown,
): Promise<unknown> {
  const response = await fetchImpl(path, { method: "POST", body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`solution agent ${path} answered HTTP ${response.status}: ${text}`);
  }
  return JSON.parse(text) as unknown;
}

/**
 * The same-origin HTTP binding over the PROD-023 route factory's paths
 * (`POST /v1/solution-agent/compile` and `/v1/solution-agent/turn` —
 * see `backend/api/src/reasoning/solution/router.ts`). Fetch is INJECTED
 * (the PROD-001 same-origin contract).
 */
export function createHttpSolutionAgentPort(options: {
  readonly fetchImpl: AgentFetchLike;
  readonly basePath?: string;
  readonly agentId?: string;
}): SolutionAgentPort {
  const base = options.basePath ?? "/v1/solution-agent";
  const fetchImpl = options.fetchImpl;
  return {
    descriptor: { agentId: options.agentId ?? "aise-solution-agent", binding: "http-route" },
    compile: async (input) => {
      const payload = (await postAgentJson(fetchImpl, `${base}/compile`, input)) as {
        command: AgentCompiledCommand;
      };
      return payload.command;
    },
    decideTurn: async (input) => {
      const payload = await postAgentJson(fetchImpl, `${base}/turn`, input) as {
        decision: AgentTurnDecision;
      };
      return payload.decision;
    },
  };
}

/* ------------------------------------------------------------------ */
/* The scripted TEST DOUBLE (clearly labeled — NOT the compiler)        */
/* ------------------------------------------------------------------ */

/** One scripted turn, replayed IN ORDER: the expected user input + the
 *  typed decision the double answers with. */
export interface ScriptedAgentTurn {
  /**
   * The user input this script position expects: the RAW utterance, or —
   * while a clarification is pending — the MERGED utterance (original
   * request + answer), mirroring what the REAL interaction loop
   * recompiles.
   */
  readonly utterance: string;
  /** The typed decision the double answers with (a full TurnDecision). */
  readonly decision: AgentTurnDecision;
}

/**
 * A CLEARLY-LABELED DETERMINISTIC TEST DOUBLE of the agent seam — the
 * PROD-023 `createInMemorySolutionToolDouble` discipline carried into the
 * workspace's tests. It performs NO language understanding: it replays
 * the scripted turns IN ORDER, checking each turn's user input against
 * the script's expectation (raw, or merged while a clarification is
 * pending — what the real loop recompiles); a mismatch answers an honest
 * error decision (the double never improvises). Scripted intents are
 * REAL contract objects (built through `createOperationIntent` with
 * agent provenance) so the tests exercise the REAL submission path and
 * the REAL identity derivations.
 */
export function createScriptedSolutionAgentPort(script: {
  readonly agentId: string;
  readonly turns: readonly ScriptedAgentTurn[];
}): SolutionAgentPort {
  const turns = [...script.turns];
  let cursor = 0;
  const compileByUtterance = new Map<string, AgentCompiledCommand>();
  for (const turn of turns) {
    const outcome = decisionCompileOutcome(turn.decision);
    if (outcome !== undefined) {
      compileByUtterance.set(turn.utterance, outcome);
    }
  }
  return {
    descriptor: { agentId: script.agentId, binding: "scripted-double" },
    compile: async (input) => {
      const outcome = compileByUtterance.get(input.utterance.trim());
      if (outcome !== undefined) {
        return outcome;
      }
      return unsupportedOutcome(script.agentId, input.utterance);
    },
    decideTurn: async (input) => {
      const expected = turns[cursor];
      if (expected === undefined) {
        return {
          decision: "cancelled",
          note:
            `the scripted test double has no script left for '${input.utterance}' — ` +
            `it never improvises (the REAL compiler is wired at the integration station)`,
        };
      }
      const merged =
        input.pendingClarification === undefined
          ? undefined
          : `${input.pendingClarification.utterance} ${input.utterance.trim()}`;
      if (input.utterance.trim() !== expected.utterance && merged !== expected.utterance) {
        return {
          decision: "cancelled",
          note:
            `the scripted test double expected '${expected.utterance}' but heard ` +
            `'${input.utterance}' — a test-script mismatch, never an improvisation`,
        };
      }
      cursor += 1;
      return expected.decision;
    },
  };
}

/** The compile-outcome view of a scripted decision (for compile()). */
function decisionCompileOutcome(decision: AgentTurnDecision): AgentCompiledCommand | undefined {
  switch (decision.decision) {
    case "propose":
      return {
        kind: "operation-intent",
        intent: decision.proposal.intent,
        attribution: decision.proposal.attribution,
      };
    case "ask":
      return {
        kind: "clarification-needed",
        questions: [decision.questions[0] ?? fallbackQuestion()],
        attribution: clarificationAttribution(decision.pendingClarification.utterance),
      };
    case "unsupported":
      return decision.command;
    case "ambiguous":
      return decision.command;
    case "refuse":
      return decision.command;
    default:
      return undefined;
  }
}

function fallbackQuestion(): AgentClarificationQuestion {
  return {
    slotKind: "dimension",
    slot: "height",
    question: "How high should the new wall section be built?",
  };
}

function clarificationAttribution(utterance: string): AgentCommandAttribution {
  return {
    rawUtterance: utterance,
    normalizedCommand: "",
    normalizedCommandText: "",
    compilerPath: "deterministic",
    agentId: "scripted-double",
    sessionId: "scripted",
    compiledAt: "2026-09-16T10:00:00.000Z",
  };
}

function unsupportedOutcome(agentId: string, utterance: string): AgentCompiledCommand {
  return {
    kind: "unsupported",
    reason:
      `the scripted test double has no script for this utterance — it never ` +
      `improvises (the REAL compiler is wired at the integration station)`,
    attribution: { ...clarificationAttribution(utterance), agentId },
  };
}

/* ------------------------------------------------------------------ */
/* Test-double script builders (REAL contract intents, agent origin)    */
/* ------------------------------------------------------------------ */

/**
 * Builds a REAL contract operation intent with AGENT provenance (the
 * single constructor surface, origin `"agent"`, the exact command text) —
 * the shape the REAL compiler produces. Used by the scripted double's
 * scripts and by the equivalence tests.
 */
export function buildAgentIntent(input: {
  readonly intentId: string;
  readonly operationType: string;
  readonly parameters: readonly { readonly name: string; readonly value: number | string | boolean; readonly unit?: string }[];
  readonly target: OperationTarget;
  readonly commandText: string;
  readonly authoredAt: string;
  readonly authoredBy?: string;
  readonly proposedTo?: { readonly solutionId: string; readonly versionNumber: number };
  readonly dependsOn?: readonly { readonly operationRef: string; readonly dependencyKind: "completion-before" | "state-precondition" }[];
}): EngineeringOperationIntent {
  return createOperationIntent({
    intentId: input.intentId,
    operationType: input.operationType,
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: [...input.parameters],
    target: input.target,
    provenance: {
      origin: "agent",
      authoredBy: input.authoredBy ?? "agent-demo-assistant",
      authoredAt: input.authoredAt,
      evidenceIds: [],
      commandText: input.commandText,
    },
    ...(input.dependsOn === undefined
      ? {}
      : {
          dependsOn: input.dependsOn.map((dependency) => ({
            ...dependency,
            contractVersion: "1.0.0",
          })),
        }),
    ...(input.proposedTo === undefined ? {} : { proposedTo: input.proposedTo }),
  });
}

/** Builds an `ask` decision (targeted clarification questions). */
export function askDecisionOf(input: {
  readonly utterance: string;
  readonly questions: readonly {
    readonly slotKind: "dimension" | "material" | "location" | "sequencing" | "constraint";
    readonly slot: string;
    readonly question: string;
    readonly offeredChoices?: readonly string[];
  }[];
}): AgentTurnDecision & { readonly decision: "ask" } {
  const questions = input.questions.map((question) => ({ ...question }));
  return {
    decision: "ask",
    questions,
    pendingClarification: { utterance: input.utterance, questions },
  };
}

/** Builds an `unsupported` decision (honest reason, no intent). */
export function unsupportedDecisionOf(input: {
  readonly utterance: string;
  readonly reason: string;
  readonly vertical?: string;
}): AgentTurnDecision {
  return {
    decision: "unsupported",
    command: {
      kind: "unsupported",
      ...(input.vertical === undefined ? {} : { vertical: input.vertical }),
      reason: input.reason,
      attribution: {
        rawUtterance: input.utterance,
        normalizedCommand: "",
        normalizedCommandText: "",
        compilerPath: "deterministic",
        agentId: "scripted-double",
        sessionId: "scripted",
        compiledAt: "2026-09-16T10:00:00.000Z",
      },
    },
  };
}

/** Builds an `unsafe-refusal` decision (typed reason code, no intent). */
export function refuseDecisionOf(input: {
  readonly utterance: string;
  readonly reasonCode: string;
  readonly reason: string;
}): AgentTurnDecision {
  return {
    decision: "refuse",
    command: {
      kind: "unsafe-refusal",
      reasonCode: input.reasonCode,
      reason: input.reason,
      attribution: {
        rawUtterance: input.utterance,
        normalizedCommand: "",
        normalizedCommandText: "",
        compilerPath: "deterministic",
        agentId: "scripted-double",
        sessionId: "scripted",
        compiledAt: "2026-09-16T10:00:00.000Z",
      },
    },
  };
}

/** Builds an `ambiguous` decision (readings listed, never guessed). */
export function ambiguousDecisionOf(input: {
  readonly utterance: string;
  readonly readings: readonly [
    { readonly description: string; readonly operationType?: string; readonly differingSlot?: string },
    ...{ readonly description: string; readonly operationType?: string; readonly differingSlot?: string }[],
  ];
}): AgentTurnDecision {
  return {
    decision: "ambiguous",
    command: {
      kind: "ambiguous",
      readings: input.readings.map((reading) => ({ ...reading })) as [
        AgentAmbiguityReading,
        ...AgentAmbiguityReading[],
      ],
      attribution: {
        rawUtterance: input.utterance,
        normalizedCommand: "",
        normalizedCommandText: "",
        compilerPath: "deterministic",
        agentId: "scripted-double",
        sessionId: "scripted",
        compiledAt: "2026-09-16T10:00:00.000Z",
      },
    },
  };
}

/** Builds a read-only `dispatch-tool` decision. */
export function dispatchToolDecisionOf(
  command: AgentToolCommand & {
    readonly kind: "validate" | "inspect" | "navigate" | "explain" | "boq-step-lookup";
  },
): AgentTurnDecision {
  return { decision: "dispatch-tool", command };
}

/** Builds a `propose` decision over an intent (the preview surface). */
export function proposeDecisionOf(input: {
  readonly intent: EngineeringOperationIntent;
  readonly renderedCommand: string;
  readonly estimatedQuantities: readonly {
    readonly label: string;
    readonly dimension: "length" | "area" | "volume" | "count";
    readonly value: number;
    readonly unit: string;
    readonly basis: string;
  }[];
  readonly irreversible: boolean;
  readonly reviewRequirements: readonly string[];
  readonly utterance: string;
}): AgentTurnDecision & { readonly decision: "propose" } {
  return {
    decision: "propose",
    proposal: {
      intent: input.intent,
      attribution: {
        rawUtterance: input.utterance,
        normalizedCommand: "",
        normalizedCommandText: input.renderedCommand,
        compilerPath: "deterministic",
        agentId: input.intent.provenance.authoredBy,
        sessionId: "scripted",
        compiledAt: input.intent.provenance.authoredAt,
      },
      renderedCommand: input.renderedCommand,
      target: {
        description: input.intent.target.description,
        selectorKind: input.intent.target.selectorKind,
        nodeRefs: [...input.intent.target.nodeRefs],
        geometryRefs: input.intent.target.geometryRefs.map((ref) => ({ ...ref })),
      },
      estimatedQuantities: [...input.estimatedQuantities],
      irreversible: input.irreversible,
      reviewRequirements: [...input.reviewRequirements],
    },
    pendingProposal: {
      proposal: {
        intent: input.intent,
        attribution: {
          rawUtterance: input.utterance,
          normalizedCommand: "",
          normalizedCommandText: input.renderedCommand,
          compilerPath: "deterministic",
          agentId: input.intent.provenance.authoredBy,
          sessionId: "scripted",
          compiledAt: input.intent.provenance.authoredAt,
        },
        renderedCommand: input.renderedCommand,
        target: {
          description: input.intent.target.description,
          selectorKind: input.intent.target.selectorKind,
          nodeRefs: [...input.intent.target.nodeRefs],
          geometryRefs: input.intent.target.geometryRefs.map((ref) => ({ ...ref })),
        },
        estimatedQuantities: [...input.estimatedQuantities],
        irreversible: input.irreversible,
        reviewRequirements: [...input.reviewRequirements],
      },
      utterance: input.utterance,
    },
  };
}

/** Builds a `dispatch-operation` decision (a confirmed apply). */
export function dispatchOperationDecisionOf(
  proposal: AgentOperationProposal,
  solutionId: string,
  versionNumber: number,
): AgentTurnDecision {
  return {
    decision: "dispatch-operation",
    command: {
      kind: "apply",
      attribution: proposal.attribution,
      intent: proposal.intent,
      solutionId,
      versionNumber,
    },
    proposal,
  };
}
