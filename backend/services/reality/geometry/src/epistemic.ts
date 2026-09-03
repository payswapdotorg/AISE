/**
 * Epistemic semantics for derived geometry measurements (AISE-009).
 *
 * The architecture separates OBSERVED / INFERRED / CONFIRMED /
 * PROPOSED (architecture §2.3) and forbids silent upgrades
 * (architecture-lock §2/§3, requirements AC-072). This module makes
 * the rules executable for the geometry package:
 *
 * 1. **Fitting is inference.** A fit — plane, cylinder — is
 *    derived from evidence (points), not directly established by
 *    capture. Its result is `INFERRED`, regardless of how strong
 *    the inputs are, and regardless of what the caller would
 *    prefer. `FIT_EPISTEMIC_STATE` is the only state a fit can
 *    carry; the guard `assertFitEpistemicState` fails closed on
 *    anything else. This is the architect's explicit rule: fitting
 *    does not silently upgrade an inferred/reconstructed geometry
 *    into OBSERVED or CONFIRMED.
 *
 * 2. **Deterministic queries propagate, never upgrade.** A distance
 *    or angle computed between entities is only as strong as its
 *    weakest input: the derived state is the MINIMUM of the input
 *    states on the strength lattice OBSERVED > CONFIRMED >
 *    INFERRED > PROPOSED. A distance between an OBSERVED survey
 *    point and an INFERRED reconstructed point is INFERRED; a
 *    distance between a PROPOSED design line and anything is at
 *    best PROPOSED (it involves hypothetical content).
 *
 * 3. **The guards run on the producing path.** `deriveQueryState`
 *    and `assertFitEpistemicState` are called by every measurement
 *    constructor, not just offered to consumers — so no code path
 *    in this package can emit an upgraded state even by accident.
 */
import { GeometryError } from "./errors.js";
import type { EpistemicState } from "@aise/shared-contracts";

/** The only epistemic state a fit result may carry. */
export const FIT_EPISTEMIC_STATE: EpistemicState = "INFERRED";

/** All valid epistemic states (runtime vocabulary check). */
export const EPISTEMIC_STATES: readonly EpistemicState[] = [
  "OBSERVED",
  "INFERRED",
  "CONFIRMED",
  "PROPOSED",
];

/** Runtime guard for a caller-declared epistemic state. */
export function assertValidEpistemicState(state: unknown): EpistemicState {
  if (state !== "OBSERVED" && state !== "INFERRED" && state !== "CONFIRMED" && state !== "PROPOSED") {
    throw new GeometryError(
      "VALIDATION_FAILED",
      `epistemic state must be one of OBSERVED | INFERRED | CONFIRMED | PROPOSED: ${String(state)}`,
      { details: { value: String(state), allowed: [...EPISTEMIC_STATES] } },
    );
  }
  return state;
}

/** Strength lattice: OBSERVED(3) > CONFIRMED(2) > INFERRED(1) > PROPOSED(0). */
export function epistemicRank(state: EpistemicState): number {
  switch (state) {
    case "OBSERVED":
      return 3;
    case "CONFIRMED":
      return 2;
    case "INFERRED":
      return 1;
    case "PROPOSED":
      return 0;
  }
}

/**
 * Guard for fit results: only INFERRED is legal. Fitting is
 * inference over evidence; it can never emit OBSERVED (that is
 * capture/measurement), CONFIRMED (that is an authorized human/
 * instrument validation), or PROPOSED (that is design content).
 */
export function assertFitEpistemicState(state: EpistemicState): void {
  if (state !== FIT_EPISTEMIC_STATE) {
    throw new GeometryError(
      "EPISTEMIC_STATE_INVALID",
      `a fit result may not carry epistemic state "${state}" — fitting is inference over evidence, its output is ${FIT_EPISTEMIC_STATE}`,
      { details: { claimed: state, allowed: FIT_EPISTEMIC_STATE } },
    );
  }
}

/**
 * Derived state for a deterministic query over entities: the
 * minimum input state on the strength lattice (no upgrade). Also
 * exported as the guard the measurement constructors call.
 */
export function deriveQueryState(inputStates: readonly EpistemicState[]): EpistemicState {
  if (inputStates.length === 0) {
    throw new GeometryError("VALIDATION_FAILED", "cannot derive an epistemic state from zero inputs", {
      details: {},
    });
  }
  let weakest: EpistemicState = inputStates[0] as EpistemicState;
  for (const state of inputStates) {
    assertValidEpistemicState(state);
    if (epistemicRank(state) < epistemicRank(weakest)) {
      weakest = state;
    }
  }
  return weakest;
}

/**
 * No-upgrade assertion for any derived measurement: the claimed
 * result state must not outrank ANY input state. Called by every
 * measurement constructor as defense in depth (the derivation
 * functions already compute legal states; this guards against a
 * future regression inverting that).
 */
export function assertNoEpistemicUpgrade(
  claimed: EpistemicState,
  inputStates: readonly EpistemicState[],
): void {
  assertValidEpistemicState(claimed);
  for (const input of inputStates) {
    assertValidEpistemicState(input);
    if (epistemicRank(claimed) > epistemicRank(input)) {
      throw new GeometryError(
        "EPISTEMIC_STATE_INVALID",
        `derived measurement claims "${claimed}" but input state "${input}" does not license it — derived state may never outrank an input`,
        { details: { claimed, input } },
      );
    }
  }
}

/**
 * Guard for the point/entity source state supplied by callers: a
 * caller may declare OBSERVED (e.g. survey control points) — that
 * is an input declaration, not a derived claim — but a fit over
 * OBSERVED points still yields an INFERRED fit (rule 1). This
 * function only validates the declaration is well-formed.
 */
export function assertSourceEpistemicState(state: unknown): EpistemicState {
  return assertValidEpistemicState(state);
}
