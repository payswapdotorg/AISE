/**
 * Deterministic replay (PROD-022).
 *
 * `replaySolution(input)` reproduces the EXACT SAME solution/version/
 * state chain, effects, quantities and transition identities for the same
 * input sequence — the work order's determinism acceptance made
 * structural:
 *
 *  - the baseline overlay (states[0]) is materialized first, then every
 *    intent is applied through the SAME `applyOperation` core (one code
 *    path — replay is never a parallel implementation);
 *  - every per-step result is returned (steps[]), so quantities, effects
 *    and lineages are inspectable per operation;
 *  - a mid-sequence refusal FAILS THE REPLAY CLOSED at that step with the
 *    refusal's machine-readable reasons and the index — never silently
 *    truncated, never partially applied;
 *  - the injected `materializeClock: (stateIndex) => instant` is the ONLY
 *    time source (a deterministic function of the layer index — the
 *    caller pins fixed or stepped instants); identity derivations exclude
 *    it, so identical semantics always reproduce identical ENGINE
 *    IDENTITIES while provenance instants remain inspectable.
 *
 * REPLAY DISCRIMINATION (proven by tests): two runs whose intents differ
 * ONLY in provenance metadata that does not participate in identity
 * (author name, authoredAt, commandText, derivationNote, evidenceIds)
 * reproduce IDENTICAL operation ids, state ids, digests, effects and
 * quantities, while the recorded provenance remains distinct — attribution
 * is not semantics.
 */

import {
  SOLUTION_CONTRACT_VERSION,
  type EngineeringOperation,
  type EngineeringOperationIntent,
  type OperationCapabilityProfile,
  type ProposedState,
  type Solution,
  type SolutionBranch,
  type SolutionDomainDescriptor,
  type SolutionVersion,
} from "@aise/solution-contract";
import { applyOperation, type AppliedOperation, type EngineOptions, type RefusedOperation } from "./apply";
import { materializeBaselineState } from "./states";

/* ------------------------------------------------------------------ */
/* Input / result shapes                                                */
/* ------------------------------------------------------------------ */

export interface ReplayInput extends EngineOptions {
  readonly solutionId: string;
  readonly projectId: string;
  readonly title: string;
  readonly problemStatement: string;
  readonly domain: SolutionDomainDescriptor;
  /** The PINNED authoritative Reality-Graph version (read-only ref). */
  readonly baselineRealityVersionId: string;
  /** The ordered intent sequence to replay. */
  readonly intents: readonly EngineeringOperationIntent[];
  readonly capabilityProfile: OperationCapabilityProfile;
  /**
   * Deterministic materialization clock: layer index → instant. The ONLY
   * time source of the replay (no wall clock, no Date.now). Layer 0 is the
   * baseline overlay; layer N follows operation N.
   */
  readonly materializeClock: (stateIndex: number) => string;
  /** Deterministic version/solution creation instant. */
  readonly createdAt: string;
  /** Explicit version number (default: 1, or parentVersionNumber + 1). */
  readonly versionNumber?: number;
  /** Version lineage: absent for version 1 (invariant version_one_with_parent). */
  readonly parentVersionNumber?: number;
  /** Proposal-branch lineage (absent for unbranched solutions). */
  readonly branch?: SolutionBranch;
}

/** One replayed step (successful application). */
export interface ReplayStep {
  readonly stepIndex: number;
  readonly intentId: string;
  readonly applied: AppliedOperation;
}

/** A complete replay: the full version + per-step results. */
export interface ReplayComplete {
  readonly outcome: "complete";
  readonly solution: Solution;
  readonly version: SolutionVersion;
  readonly steps: readonly ReplayStep[];
}

/** A failed replay: fail-closed at the named step with typed reasons. */
export interface ReplayFailed {
  readonly outcome: "failed";
  readonly failedAtStep: number;
  readonly failure: RefusedOperation;
  /** The steps applied BEFORE the failure (empty for step 0 failures). */
  readonly appliedSteps: readonly ReplayStep[];
}

export type ReplayResult = ReplayComplete | ReplayFailed;

/* ------------------------------------------------------------------ */
/* Replay                                                               */
/* ------------------------------------------------------------------ */

/**
 * Deterministically replays a solution from its baseline: applies the
 * intent sequence in order and materializes the full version-pinned state
 * chain. Identical inputs → identical results (bit-identical canonical
 * serializations). Fails closed at the first refused intent.
 */
export function replaySolution(input: ReplayInput): ReplayResult {
  const { solutionId, versionNumber } = replayVersionContext(input);

  const baselineState = materializeBaselineState({
    solutionId,
    versionNumber,
    baselineRealityVersionId: input.baselineRealityVersionId,
    materializedAt: input.materializeClock(0),
  });

  const operations: EngineeringOperation[] = [];
  const states: ProposedState[] = [baselineState];
  const steps: ReplayStep[] = [];

  for (const [index, intent] of input.intents.entries()) {
    const baseline = latestState(states);
    const result = applyOperation({
      baseline,
      intent,
      capabilityProfile: input.capabilityProfile,
      materializedAt: input.materializeClock(index + 1),
      ...(input.baselineGeometry === undefined ? {} : { baselineGeometry: input.baselineGeometry }),
      ...(input.quantityModels === undefined ? {} : { quantityModels: input.quantityModels }),
      ...(input.limits === undefined ? {} : { limits: input.limits }),
    });
    if (result.outcome !== "applied") {
      return {
        outcome: "failed",
        failedAtStep: index + 1,
        failure: result,
        appliedSteps: steps,
      };
    }
    operations.push(result.operation);
    states.push(result.resultingState);
    steps.push({ stepIndex: index + 1, intentId: intent.intentId, applied: result });
  }

  const solution: Solution = {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    solutionId,
    projectId: input.projectId,
    title: input.title,
    problemStatement: input.problemStatement,
    domain: { ...input.domain },
    baselineRealityVersionId: input.baselineRealityVersionId,
    epistemicClass: "PROPOSED",
    status: "draft",
    currentVersionNumber: versionNumber,
    ...(input.branch === undefined ? {} : { branch: { ...input.branch } }),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };

  const version: SolutionVersion = {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    solutionId,
    versionNumber,
    ...(input.parentVersionNumber === undefined ? {} : { parentVersionNumber: input.parentVersionNumber }),
    status: "draft",
    operations,
    states,
    createdAt: input.createdAt,
  };

  return { outcome: "complete", solution, version, steps };
}

function replayVersionContext(input: ReplayInput): {
  readonly solutionId: string;
  readonly versionNumber: number;
} {
  if (input.versionNumber !== undefined) {
    return { solutionId: input.solutionId, versionNumber: input.versionNumber };
  }
  const parent = input.parentVersionNumber;
  return {
    solutionId: input.solutionId,
    versionNumber: parent === undefined ? 1 : parent + 1,
  };
}

/** The last state of a non-empty chain (the replay always seeds layer 0). */
function latestState(states: readonly ProposedState[]): ProposedState {
  const state = states[states.length - 1];
  if (state === undefined) {
    throw new Error("replay state chain is empty — layer 0 was not materialized");
  }
  return state;
}

/**
 * A fixed materialization clock: every layer gets the SAME pinned instant
 * (deterministic — the caller chooses it; identity excludes it).
 */
export function fixedMaterializeClock(instant: string): (stateIndex: number) => string {
  return () => instant;
}

/**
 * A stepped materialization clock: layer N gets `start + N × stepMs`
 * (deterministic; the caller pins start and step). ISO-8601 UTC output.
 */
export function steppedMaterializeClock(startMs: number, stepMs: number): (
  stateIndex: number,
) => string {
  return (stateIndex) => new Date(startMs + stateIndex * stepMs).toISOString();
}
