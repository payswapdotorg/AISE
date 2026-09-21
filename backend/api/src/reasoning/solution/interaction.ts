/**
 * PROD-023 — the clarification + proposal INTERACTION LOOP (interaction.ts).
 *
 * `decideNextTurn` maps one user turn to the next agent turn of the
 * interactive engineering solution workflow:
 *
 *   - CLARIFY: a clarification-needed compilation becomes targeted
 *     questions; the pending clarification remembers the original request
 *     so the next user turn ("the depth is 2 m") MERGES into it and
 *     recompiles — ask → answer → complete, never an invented value;
 *   - PROPOSE: a compiled operation intent is shown to the user BEFORE
 *     execution — the typed intent rendered as its canonical command, its
 *     affected target, the quantities computable from parameters alone,
 *     the irreversible flag and the declared review requirements (every
 *     typed operation has material consequences, so every operation is
 *     proposed first);
 *   - DISPATCH: a user confirmation hands the intent to the tool port as
 *     a typed `apply` command (the loop NEVER executes anything itself —
 *     `executeDecision` calls ONLY the port and echoes the response with
 *     its authority label, never re-authored); read-only tool commands
 *     (navigation/explanation/inspection/BOQ-step lookup/validate)
 *     dispatch directly;
 *   - HONEST STATES: ambiguity (readings listed), unsupported and
 *     unsafe-refusal outcomes pass through unchanged — the agent never
 *     guesses and never claims authority.
 *
 * DETERMINISM: pure decision function over the compiler's typed output
 * (no clock of its own, no I/O, no randomness). A new command issued
 * while a clarification or proposal is pending replaces it (the pending
 * state is dropped — the user's latest request governs).
 */

import type { EngineeringOperationIntent } from "@aise/solution-contract";
import type {
  AgentSessionContext,
  AmbiguousCompiledCommand,
  ClarificationQuestion,
  CommandAttribution,
  CompiledCommand,
  EstimatedQuantity,
  OperationProposal,
  SolutionCommandCompiler,
  UnsafeRefusalCompiledCommand,
  UnsupportedCompiledCommand,
} from "./model";
import type { ApplyToolCommand, SolutionToolCommand, SolutionToolPort, SolutionToolResponse } from "./tools";
import { CANCELLATION_PATTERN, CONFIRMATION_PATTERN } from "./vocabulary";
import {
  estimateOperationQuantities,
  isIrreversibleOperation,
  reviewRequirementsOf,
} from "./quantities";

/* ------------------------------------------------------------------ */
/* Pending turn state                                                   */
/* ------------------------------------------------------------------ */

/** A clarification awaiting the user's answer. */
export interface PendingClarification {
  /** The original request the questions belong to. */
  readonly utterance: string;
  readonly questions: readonly ClarificationQuestion[];
}

/** An operation proposal awaiting the user's confirmation. */
export interface PendingProposal {
  readonly proposal: OperationProposal;
  /** The utterance that compiled to the proposal. */
  readonly utterance: string;
}

/** One interaction turn: the utterance plus the pending state, if any. */
export interface TurnInput {
  readonly utterance: string;
  readonly session: AgentSessionContext;
  readonly pendingClarification?: PendingClarification;
  readonly pendingProposal?: PendingProposal;
}

/* ------------------------------------------------------------------ */
/* The next-turn decision union                                         */
/* ------------------------------------------------------------------ */

/** Ask the targeted clarification questions. */
export interface AskTurnDecision {
  readonly decision: "ask";
  readonly questions: readonly ClarificationQuestion[];
  readonly pendingClarification: PendingClarification;
}

/** Show the proposed operation before execution. */
export interface ProposeTurnDecision {
  readonly decision: "propose";
  readonly proposal: OperationProposal;
  readonly pendingProposal: PendingProposal;
}

/** Hand the confirmed intent to the tool port as an apply command. */
export interface DispatchOperationTurnDecision {
  readonly decision: "dispatch-operation";
  readonly command: ApplyToolCommand;
  readonly proposal: OperationProposal;
}

/** Dispatch a read-only tool command (navigate/explain/inspect/…). */
export interface DispatchToolTurnDecision {
  readonly decision: "dispatch-tool";
  readonly command: SolutionToolCommand;
}

/** An honest unsupported state. */
export interface UnsupportedTurnDecision {
  readonly decision: "unsupported";
  readonly command: UnsupportedCompiledCommand;
}

/** An honest ambiguity state (readings listed). */
export interface AmbiguousTurnDecision {
  readonly decision: "ambiguous";
  readonly command: AmbiguousCompiledCommand;
}

/** An honest unsafe-refusal state (reason named, no intent). */
export interface RefuseTurnDecision {
  readonly decision: "refuse";
  readonly command: UnsafeRefusalCompiledCommand;
}

/** The user cancelled the pending proposal/clarification. */
export interface CancelledTurnDecision {
  readonly decision: "cancelled";
  readonly note: string;
}

export type TurnDecision =
  | AskTurnDecision
  | ProposeTurnDecision
  | DispatchOperationTurnDecision
  | DispatchToolTurnDecision
  | UnsupportedTurnDecision
  | AmbiguousTurnDecision
  | RefuseTurnDecision
  | CancelledTurnDecision;

/* ------------------------------------------------------------------ */
/* The loop                                                             */
/* ------------------------------------------------------------------ */

/**
 * Decides the next agent turn for one user utterance. PURE with respect
 * to effects: it compiles (through the injected compiler) and decides —
 * it NEVER executes anything itself. A pending clarification merges the
 * user's answer into the original request and recompiles; a pending
 * proposal plus a confirmation becomes a dispatch decision.
 */
export async function decideNextTurn(
  input: TurnInput,
  compiler: SolutionCommandCompiler,
): Promise<TurnDecision> {
  const utterance = input.utterance;
  const session = input.session;

  /* 1. Confirmation of a pending proposal → dispatch to the tool port. */
  const pendingProposal = input.pendingProposal;
  if (pendingProposal !== undefined) {
    if (CONFIRMATION_PATTERN.test(utterance.trim())) {
      return dispatchOf(pendingProposal.proposal);
    }
    if (CANCELLATION_PATTERN.test(utterance.trim())) {
      return { decision: "cancelled", note: "the pending proposal was cancelled by the user" };
    }
    // Not a confirmation/cancellation: treat as a NEW command (the pending
    // proposal is dropped — the user's latest request governs).
  }

  /* 2. Pending clarification → try the merged recompilation first. */
  const pendingClarification = input.pendingClarification;
  if (pendingClarification !== undefined) {
    if (CANCELLATION_PATTERN.test(utterance.trim())) {
      return {
        decision: "cancelled",
        note: "the pending clarification was cancelled by the user",
      };
    }
    const merged = `${pendingClarification.utterance} ${utterance}`;
    const mergedOutcome = await compiler.compile({ utterance: merged, session });
    if (mergedOutcome.kind === "operation-intent") {
      return proposeOf(mergedOutcome.intent, mergedOutcome.attribution, merged, session);
    }
    if (
      mergedOutcome.kind === "clarification-needed" &&
      !sameQuestions(mergedOutcome.questions, pendingClarification.questions)
    ) {
      // The answer made progress: ask only what remains.
      return askOf(merged, mergedOutcome.questions);
    }
    // The answer did not resolve the request (same questions again, or a
    // merged ambiguity/unsupported/unsafe state): fall through and treat
    // the utterance as a NEW command — the user's latest request governs.
  }

  /* 3. Fresh compilation of the utterance. */
  const outcome = await compiler.compile({ utterance, session });
  return decisionOfOutcome(outcome, utterance, session);
}

function decisionOfOutcome(
  outcome: CompiledCommand,
  utterance: string,
  session: AgentSessionContext,
): TurnDecision {
  switch (outcome.kind) {
    case "operation-intent":
      return proposeOf(outcome.intent, outcome.attribution, utterance, session);
    case "clarification-needed":
      return askOf(utterance, outcome.questions);
    case "tool-command":
      return { decision: "dispatch-tool", command: outcome.command };
    case "unsupported":
      return { decision: "unsupported", command: outcome };
    case "ambiguous":
      return { decision: "ambiguous", command: outcome };
    case "unsafe-refusal":
      return { decision: "refuse", command: outcome };
  }
}

function askOf(
  utterance: string,
  questions: readonly ClarificationQuestion[],
): AskTurnDecision {
  return {
    decision: "ask",
    questions,
    pendingClarification: { utterance, questions },
  };
}

function proposeOf(
  intent: EngineeringOperationIntent,
  attribution: CommandAttribution,
  utterance: string,
  session: AgentSessionContext,
): ProposeTurnDecision {
  const proposal = buildOperationProposal(intent, attribution, session);
  return {
    decision: "propose",
    proposal,
    pendingProposal: { proposal, utterance },
  };
}

/**
 * Builds the operation proposal shown to the user BEFORE execution: the
 * typed intent rendered as its canonical command, the affected target,
 * the quantities computable from parameters alone (plus the focus's
 * caller-known area for surface layers), the irreversible flag and the
 * declared review requirements.
 */
export function buildOperationProposal(
  intent: EngineeringOperationIntent,
  attribution: CommandAttribution,
  session: AgentSessionContext,
): OperationProposal {
  const focus = (session.foci ?? []).find(
    (candidate) =>
      candidate.nodeRefs.some((nodeRef) => intent.target.nodeRefs.includes(nodeRef)) ||
      candidate.geometryRefs.some((geometryRef) =>
        intent.target.geometryRefs.some((ref) => ref.ref === geometryRef.ref),
      ),
  );
  const knownArea = focus?.knownParameters?.find(
    (parameter) => parameter.name === "area" && parameter.unit === "m2",
  );
  const estimatedQuantities: readonly EstimatedQuantity[] = estimateOperationQuantities(
    intent.operationType,
    intent.parameters,
    typeof knownArea?.value === "number" ? knownArea.value : undefined,
  );
  return {
    intent,
    attribution,
    renderedCommand: attribution.normalizedCommandText,
    target: {
      description: intent.target.description,
      selectorKind: intent.target.selectorKind,
      nodeRefs: [...intent.target.nodeRefs],
      geometryRefs: intent.target.geometryRefs.map((ref) => ({ ...ref })),
    },
    estimatedQuantities,
    irreversible: isIrreversibleOperation(intent.operationType),
    reviewRequirements: reviewRequirementsOf(intent.operationType),
  };
}

function dispatchOf(proposal: OperationProposal): DispatchOperationTurnDecision {
  const proposedTo = proposal.intent.proposedTo;
  const solutionId = proposedTo?.solutionId ?? "";
  const versionNumber = proposedTo?.versionNumber ?? 1;
  const command: ApplyToolCommand = {
    kind: "apply",
    attribution: proposal.attribution,
    intent: proposal.intent,
    solutionId,
    versionNumber,
  };
  return { decision: "dispatch-operation", command, proposal };
}

function sameQuestions(
  left: readonly ClarificationQuestion[],
  right: readonly ClarificationQuestion[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (question, index) =>
      right[index] !== undefined &&
      question.slotKind === right[index]?.slotKind &&
      question.slot === right[index]?.slot &&
      question.question === right[index]?.question,
  );
}

/* ------------------------------------------------------------------ */
/* Execution (the ONLY effect surface: the tool port)                   */
/* ------------------------------------------------------------------ */

/** Typed error for executing a non-dispatchable decision. */
export class TurnExecutionError extends Error {
  constructor(decision: string) {
    super(`turn decision '${decision}' is not dispatchable through the tool port`);
    this.name = "TurnExecutionError";
  }
}

/**
 * Executes a dispatch decision through the tool port — the loop's ONLY
 * effect surface. The port's response is returned VERBATIM (its authority
 * label included, never re-authored); nothing else is touched.
 */
export async function executeDecision(
  port: SolutionToolPort,
  decision: TurnDecision,
): Promise<SolutionToolResponse> {
  if (decision.decision === "dispatch-operation" || decision.decision === "dispatch-tool") {
    return port.call(decision.command);
  }
  throw new TurnExecutionError(decision.decision);
}
