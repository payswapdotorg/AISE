/**
 * Undo/revision via NEW solution versions (PROD-022).
 *
 * REVISION IS VERSIONING, NEVER REWRITING (the contract's frozen lifecycle
 * semantics, executed by the engine):
 *
 *  - the engine NEVER mutates a state or a version in place — there is no
 *    API surface for it (asserted by the sabotage tests: the input version
 *    is structurally unchanged after a revision);
 *  - `reviseVersion({ ..., revertOperationId })` — "undo" — produces a NEW
 *    `SolutionVersion` (append-only lineage: `parentVersionNumber` = the
 *    revised version, number = parent + 1) whose operation sequence is the
 *    prior sequence WITHOUT the named operation, so the new version's
 *    effect reverts that prior transition;
 *  - the undo act itself is recorded as its OWN provenance-carrying
 *    transition (`RevisionTransition`: who, why, when, which operation was
 *    reverted, deterministic transition identity — the same
 *    content-addressing discipline as the contract's identity derivations);
 *  - the kept operations are REBUILT through the SAME `applyOperation`
 *    path (a revision is a deterministic re-application, not a copy): new
 *    version context → new operation/state identities, provenance
 *    preserved verbatim per operation, quantities recomputed
 *    deterministically, capability negotiation re-gated;
 *  - dependency edges that pointed at the reverted operation are DROPPED
 *    (the referenced operation no longer exists in the new sequence) —
 *    documented revision semantics, never a dangling reference;
 *  - a revision of a TERMINAL version (superseded/abandoned) is a typed
 *    refusal (`version_terminal`); an unknown revert target is
 *    `unknown_operation_to_revert`; a non-appendable version number is
 *    `revision_not_appendable`.
 */

import {
  SOLUTION_CONTRACT_VERSION,
  type EngineeringOperation,
  type EngineeringOperationIntent,
  type OperationCapabilityProfile,
  type ProposedState,
  type SolutionVersion,
} from "@aise/solution-contract";
import { applyOperation, type EngineOptions } from "./apply";
import { deriveTransitionId, materializeBaselineState } from "./states";
import type { EngineReason } from "./errors";

/* ------------------------------------------------------------------ */
/* Input / result shapes                                                */
/* ------------------------------------------------------------------ */

/** The provenance of the undo act (attribution is never optional). */
export interface RevisionProvenance {
  readonly authoredBy: string;
  readonly reason: string;
  readonly authoredAt: string;
}

export interface ReviseVersionInput extends EngineOptions {
  /** The version to revise (consumed READ-ONLY — never mutated). */
  readonly version: SolutionVersion;
  /** The named prior transition (operation id) whose effect to revert. */
  readonly revertOperationId: string;
  readonly capabilityProfile: OperationCapabilityProfile;
  /** Deterministic creation instant of the new version. */
  readonly createdAt: string;
  /** Deterministic materialization clock for the new version's states. */
  readonly materializeClock: (stateIndex: number) => string;
  readonly revisionProvenance: RevisionProvenance;
}

/** The undo act's own provenance-carrying transition record. */
export interface RevisionTransition {
  readonly kind: "undo";
  readonly transitionId: string;
  readonly solutionId: string;
  readonly parentVersionNumber: number;
  readonly newVersionNumber: number;
  readonly revertedOperationId: string;
  readonly revertedOperationIndex: number;
  readonly revertedOperationType: string;
  readonly authoredBy: string;
  readonly reason: string;
  readonly appliedAt: string;
}

export interface RevisionComplete {
  readonly outcome: "revised";
  readonly newVersion: SolutionVersion;
  readonly revision: RevisionTransition;
}

export interface RevisionRefused {
  readonly outcome: "invalid";
  readonly reasons: readonly EngineReason[];
}

export type ReviseVersionResult = RevisionComplete | RevisionRefused;

/* ------------------------------------------------------------------ */
/* Revision (undo)                                                      */
/* ------------------------------------------------------------------ */

/**
 * Reverts one named prior transition by producing a NEW solution version
 * (never a mutation of the old one). DETERMINISTIC: the same version +
 * revert target + instants always rebuild the same new version (identical
 * operations, states, quantities, identities). The input version is
 * consumed READ-ONLY.
 */
export function reviseVersion(input: ReviseVersionInput): ReviseVersionResult {
  const { version, revertOperationId } = input;

  /* 1. Terminal versions admit no revision (the governed lifecycle). */
  if (version.status === "superseded" || version.status === "abandoned") {
    return refuse([
      {
        code: "version_terminal",
        detail:
          `version ${version.versionNumber} of solution '${version.solutionId}' is ` +
          `terminal ('${version.status}') — no revision path exists; revision is ` +
          `only a new version over a live lineage`,
      },
    ]);
  }

  /* 2. The revert target must exist in the version. */
  const reverted = version.operations.find(
    (operation) => operation.operationId === revertOperationId,
  );
  if (reverted === undefined) {
    return refuse([
      {
        code: "unknown_operation_to_revert",
        detail:
          `operation '${revertOperationId}' is not recorded in version ` +
          `${version.versionNumber} of solution '${version.solutionId}'; recorded ` +
          `operations: ${version.operations.map((operation) => operation.operationId).join(", ")}`,
      },
    ]);
  }

  /* 3. Append-only lineage: the new version number is parent + 1. */
  const newVersionNumber = version.versionNumber + 1;
  const baselineState = version.states[0];
  if (baselineState === undefined) {
    return refuse([
      {
        code: "revision_not_appendable",
        detail:
          `version ${version.versionNumber} of solution '${version.solutionId}' ` +
          `carries no baseline overlay (states[0]) — the lineage cannot be revised`,
      },
    ]);
  }

  /* 4. Rebuild: the kept operations re-applied through the ONE apply path
        (new version context → new identities; provenance preserved). */
  const kept = version.operations.filter(
    (operation) => operation.operationId !== revertOperationId,
  );
  const operations: EngineeringOperation[] = [];
  const states = [
    materializeBaselineState({
      solutionId: version.solutionId,
      versionNumber: newVersionNumber,
      baselineRealityVersionId: baselineState.baselineRealityVersionId,
      materializedAt: input.materializeClock(0),
    }),
  ];

  for (const original of kept) {
    const intent = intentOfOperation(original, newVersionNumber, revertOperationId);
    const result = applyOperation({
      baseline: latestState(states),
      intent,
      capabilityProfile: input.capabilityProfile,
      materializedAt: input.materializeClock(states.length),
      ...(input.baselineGeometry === undefined
        ? {}
        : { baselineGeometry: input.baselineGeometry }),
      ...(input.quantityModels === undefined ? {} : { quantityModels: input.quantityModels }),
      ...(input.limits === undefined ? {} : { limits: input.limits }),
    });
    if (result.outcome !== "applied") {
      // The prior version contained an operation the engine now refuses —
      // the revision fails closed with the refusal's machine-readable
      // reasons (never a partial rewrite). The original reason codes are
      // preserved verbatim; the summary reason names the step.
      return refuse([
        ...result.reasons,
        {
          code: "revision_not_appendable" as const,
          detail:
            `re-applying operation ${original.operationIndex} ` +
            `('${original.operationType}') into version ${newVersionNumber} was ` +
            `refused — the revision aborts with the original refusal reasons above`,
        },
      ]);
    }
    operations.push(result.operation);
    states.push(result.resultingState);
  }

  const newVersion: SolutionVersion = {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    solutionId: version.solutionId,
    versionNumber: newVersionNumber,
    parentVersionNumber: version.versionNumber,
    status: "draft", // a revision resets to draft; the BOQ gate re-validates
    operations,
    states,
    createdAt: input.createdAt,
  };

  const revision: RevisionTransition = {
    kind: "undo",
    transitionId: deriveTransitionId({
      kind: "undo",
      solutionId: version.solutionId,
      versionNumber: newVersionNumber,
      operationIndex: reverted.operationIndex,
      operationId: reverted.operationId,
    }),
    solutionId: version.solutionId,
    parentVersionNumber: version.versionNumber,
    newVersionNumber,
    revertedOperationId: reverted.operationId,
    revertedOperationIndex: reverted.operationIndex,
    revertedOperationType: reverted.operationType,
    authoredBy: input.revisionProvenance.authoredBy,
    reason: input.revisionProvenance.reason,
    appliedAt: input.revisionProvenance.authoredAt,
  };

  return { outcome: "revised", newVersion, revision };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/**
 * Reconstructs the authoring intent view of a recorded operation for the
 * revision's re-application: identical SEMANTICS (type, domain,
 * parameters, target, filtered dependencies) + the ORIGINAL provenance
 * (preserved verbatim — attribution is not rewritten by a revision), with
 * the intent id echoed from the recorded compile link. Identity-wise this
 * is equivalent to the original intent: the same semantics in the new
 * version context.
 */
function intentOfOperation(
  operation: EngineeringOperation,
  newVersionNumber: number,
  revertedOperationId: string,
): EngineeringOperationIntent {
  return {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    intentId:
      operation.provenance.intentRef ??
      `intent-r${newVersionNumber}-${operation.operationIndex}`,
    operationType: operation.operationType,
    domain: { ...operation.domain },
    parameters: operation.parameters.map((parameter) => ({ ...parameter })),
    target: {
      ...operation.target,
      nodeRefs: [...operation.target.nodeRefs],
      geometryRefs: operation.target.geometryRefs.map((ref) => ({ ...ref })),
      units: { ...operation.target.units },
    },
    dependsOn: operation.dependsOn
      .filter((dependency) => dependency.operationRef !== revertedOperationId)
      .map((dependency) => ({ ...dependency })),
    provenance: { ...operation.provenance },
    proposedTo: {
      solutionId: operation.solutionId,
      versionNumber: newVersionNumber,
    },
  };
}

function refuse(reasons: readonly EngineReason[]): RevisionRefused {
  return { outcome: "invalid", reasons: [...reasons] };
}

/** The last state of a non-empty chain (the revision always seeds layer 0). */
function latestState(states: readonly ProposedState[]): ProposedState {
  const state = states[states.length - 1];
  if (state === undefined) {
    throw new Error("revision state chain is empty — layer 0 was not materialized");
  }
  return state;
}
