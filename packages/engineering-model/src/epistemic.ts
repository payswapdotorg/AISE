/**
 * Epistemic-state machinery for the Reality Graph core (AISE-011).
 *
 * The architecture is explicit (architecture §2.3/§6, architecture-
 * lock §2, requirements AC-053/AC-054):
 *
 * - `OBSERVED`, `INFERRED`, `CONFIRMED`, and `PROPOSED` are
 *   DISTINCT epistemic states, preserved on every assertion;
 * - `UNKNOWN`, `NOT_OBSERVED`, and `OCCLUDED` must never be encoded
 *   as `CONFIRMED_ABSENT` without affirmative evidence;
 * - AI-generated inference must never silently overwrite measured
 *   or confirmed data.
 *
 * The core enforces this structurally:
 *
 * - **No silent upgrades** — `assertNoEpistemicUpgrade` is the
 *   guard every derived path passes through: a result state may
 *   never outrank its source state. Legitimate upgrades
 *   (INFERRED → CONFIRMED by human review) are explicit, evidenced
 *   operations: the property-assertion constructor requires
 *   evidence references and a verifier identity for `CONFIRMED`,
 *   and version diffs surface state changes — so an upgrade can
 *   happen, but never silently.
 * - **Weakest-link composites** — a composite entity (a model
 *   graph, a derived read view) is never stronger than its
 *   weakest input.
 * - **Presence is not absence** — the presence vocabulary is a
 *   separate axis from the assertion-status axis: a valueless
 *   assertion records what is known about observation itself.
 */
import { EngineeringModelError } from "./errors.js";
import type { EpistemicState, ObservationPresence } from "@aise/shared-contracts";

/**
 * The four epistemic states of an engineering assertion
 * (from `@aise/shared-contracts` — the cross-platform vocabulary;
 * the model never invents its own).
 */
export type { EpistemicState, ObservationPresence };

/** All valid epistemic states (validation and test vocabulary). */
export const EPISTEMIC_STATES: readonly EpistemicState[] = [
  "OBSERVED",
  "INFERRED",
  "CONFIRMED",
  "PROPOSED",
];

/**
 * Presence states for valueless assertions. Extends the shared
 * contract's `ObservationPresence` with the affirmative-evidence
 * state `CONFIRMED_ABSENT` (architecture §6: the system must
 * represent it *where semantically appropriate* — constructing one
 * requires affirmative evidence, see `assertions.ts`).
 */
export type ModelPresence = ObservationPresence | "CONFIRMED_ABSENT";

/** All valid presence states. */
export const MODEL_PRESENCE_STATES: readonly ModelPresence[] = [
  "UNKNOWN",
  "NOT_OBSERVED",
  "OCCLUDED",
  "CONFIRMED_ABSENT",
];

/**
 * Epistemic rank. Lower = weaker. Used ONLY by the no-upgrade
 * guard and weakest-link derivation; it is an ordering over the
 * state lattice, never a quality score, and it is never serialized
 * into model content.
 *
 * PROPOSED ranks weakest by design: hypothetical/design content
 * must never masquerade as reality, and propagating through it
 * keeps the composite PROPOSED (the AISE-010 rule).
 */
export function epistemicRank(state: EpistemicState): number {
  switch (state) {
    case "PROPOSED":
      return 0;
    case "INFERRED":
      return 1;
    case "OBSERVED":
      return 2;
    case "CONFIRMED":
      return 3;
  }
}

/** Throws unless `state` is one of the four epistemic states. */
export function assertValidEpistemicState(state: EpistemicState, field: string): void {
  if (!EPISTEMIC_STATES.includes(state)) {
    throw new EngineeringModelError(
      "EPISTEMIC_INVALID",
      `${field} must be one of ${EPISTEMIC_STATES.join("|")}: ${String(state)}`,
      { details: { field, value: String(state) } },
    );
  }
}

/** Throws unless `presence` is one of the presence states. */
export function assertValidPresence(presence: ModelPresence, field: string): void {
  if (!MODEL_PRESENCE_STATES.includes(presence)) {
    throw new EngineeringModelError(
      "PRESENCE_INVALID",
      `${field} must be one of ${MODEL_PRESENCE_STATES.join("|")}: ${String(presence)}`,
      { details: { field, value: String(presence) } },
    );
  }
}

/**
 * The no-upgrade guard (architecture-lock §2: "AI-generated
 * inference must never silently overwrite measured or confirmed
 * data"). Every derived path calls this with (source, result):
 * the result may not outrank the source. A violation throws
 * `EPISTEMIC_UPGRADE` — the protection the mutation suite proves.
 */
export function assertNoEpistemicUpgrade(
  source: EpistemicState,
  result: EpistemicState,
  context: string,
): void {
  assertValidEpistemicState(source, `${context}.source`);
  assertValidEpistemicState(result, `${context}.result`);
  if (epistemicRank(result) > epistemicRank(source)) {
    throw new EngineeringModelError(
      "EPISTEMIC_UPGRADE",
      `${context}: derived state ${result} outranks source state ${source} — epistemic upgrades are never silent`,
      { details: { context, source, result } },
    );
  }
}

/**
 * Weakest-link composite derivation: the state of a composite is
 * the weakest of its parts (and of the declared source state when
 * the composite is derived). An empty set yields `PROPOSED` — a
 * composite with no content makes no reality claim at all.
 */
export function deriveWeakestState(states: readonly EpistemicState[]): EpistemicState {
  let weakest: EpistemicState | undefined = undefined;
  let weakestRank = Number.POSITIVE_INFINITY;
  for (const state of states) {
    assertValidEpistemicState(state, "compositeState");
    const rank = epistemicRank(state);
    if (weakest === undefined || rank < weakestRank) {
      weakest = state;
      weakestRank = rank;
    }
  }
  return weakest ?? "PROPOSED";
}
