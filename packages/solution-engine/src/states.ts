/**
 * Deterministic state materialization (PROD-022).
 *
 * The engine's OWN materialization discipline over the contract's
 * `ProposedState` (the contract pins the digest FORM — sha-256 content
 * address — and PROD-022 owns the materialization itself):
 *
 *  - the state CONTENT is a deterministic hash CHAIN: every state's digest
 *    covers its parent digest, its layer index, the applied operation's
 *    identity and that operation's canonical effect set — so any change
 *    anywhere in the applied sequence re-digests every later state;
 *  - `stateId` is ALWAYS derived through the contract's
 *    `deriveProposedStateId` (the same identifier feeds the synchronized
 *    3D/2D/BOQ views) — the engine never invents an id format;
 *  - `materializedAt` is a caller-injected deterministic instant, NEVER a
 *    clock read, and is EXCLUDED from identity (identity is content).
 *
 * PURE: no I/O, no clock, no randomness.
 */

import { createHash } from "node:crypto";
import {
  SOLUTION_CONTRACT_VERSION,
  deriveProposedStateId,
  type EngineeringOperation,
  type OperationEffect,
  type ProposedState,
} from "@aise/solution-contract";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import type { TransitionIdentityInput } from "./engine-version";

function sha256Hex(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

/** Canonical (identity-relevant) projection of one effect. */
function effectProjection(effect: OperationEffect): unknown {
  // `resultingStateRef` is deliberately EXCLUDED: it POINTS at the state
  // whose id derives from this digest (a pointer, not determining content)
  // — including it would be circular and would make re-derivation from the
  // recorded operation impossible. Every quantity member IS content.
  return {
    effectKind: effect.effectKind,
    direction: effect.direction,
    quantity:
      effect.quantity === undefined
        ? undefined
        : {
            dimension: effect.quantity.dimension,
            value: effect.quantity.value,
            unit: effect.quantity.unit,
            calculationRef: effect.quantity.calculationRef,
          },
    affectedNodeRefs: [...effect.affectedNodeRefs],
    geometryRefs: effect.geometryRefs.map((ref) => ({ kind: ref.kind, ref: ref.ref })),
  };
}

/** The chain content of one materialized state layer. */
export interface StateChainLink {
  readonly parentContentDigest: string | null;
  readonly stateIndex: number;
  readonly operationId: string;
  readonly operationEffects: readonly OperationEffect[];
}

/**
 * The deterministic content digest of one proposed-state layer: sha-256
 * over the canonical JSON of the chain link (parent digest → this layer's
 * operation id + canonical effects). The BASELINE overlay (stateIndex 0)
 * chains from `null`.
 */
export function stateContentDigest(link: StateChainLink): string {
  return sha256Hex({
    parentContentDigest: link.parentContentDigest,
    stateIndex: link.stateIndex,
    operationId: link.operationId,
    operationEffects: link.operationEffects.map(effectProjection),
  });
}

/** Input of the baseline overlay (states[0]). */
export interface BaselineOverlayInput {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly baselineRealityVersionId: string;
  readonly materializedAt: string;
}

/**
 * Materializes the BASELINE OVERLAY (layer 0): no operations applied, the
 * pinned baseline reality version, digest over the empty layer chain.
 */
export function materializeBaselineState(input: BaselineOverlayInput): ProposedState {
  const contentDigest = stateContentDigest({
    parentContentDigest: null,
    stateIndex: 0,
    operationId: "",
    operationEffects: [],
  });
  return {
    contractVersion: SOLUTION_CONTRACT_VERSION,
    stateId: deriveProposedStateId({
      solutionId: input.solutionId,
      versionNumber: input.versionNumber,
      stateIndex: 0,
      baselineRealityVersionId: input.baselineRealityVersionId,
      appliedOperationIds: [],
      contentDigest,
    }),
    solutionId: input.solutionId,
    versionNumber: input.versionNumber,
    stateIndex: 0,
    baselineRealityVersionId: input.baselineRealityVersionId,
    epistemicStatus: "PROPOSED",
    appliedOperationIds: [],
    contentDigest,
    materializedAt: input.materializedAt,
  };
}

/**
 * Derives the deterministic TRANSITION identity of an apply/undo
 * transition: sha-256 over the canonical JSON of the transition identity —
 * the SAME content-addressing discipline as the contract's identity.ts
 * derivations (version context + the transition's semantic content), never
 * a second id format.
 */
export function deriveTransitionId(identity: TransitionIdentityInput): string {
  return sha256Hex({
    kind: identity.kind,
    solutionId: identity.solutionId,
    versionNumber: identity.versionNumber,
    operationIndex: identity.operationIndex,
    operationId: identity.operationId,
    parentStateId: identity.parentStateId,
    resultingStateId: identity.resultingStateId,
    revertedOperationId: identity.revertedOperationId,
  });
}

/** The applied operation of a materialized state layer (for chaining). */
export function chainLinkOf(
  parentDigest: string | null,
  stateIndex: number,
  operation: EngineeringOperation,
): StateChainLink {
  return {
    parentContentDigest: parentDigest,
    stateIndex,
    operationId: operation.operationId,
    operationEffects: operation.effects,
  };
}
