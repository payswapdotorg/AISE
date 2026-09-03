/**
 * Epistemic semantics for architectural object extraction (AISE-010).
 *
 * The architecture separates OBSERVED / INFERRED / CONFIRMED /
 * PROPOSED (architecture §2.3/§6) and forbids silent upgrades
 * (architecture-lock §2/§3). This module makes the rules executable
 * for the semantics package, mirroring the AISE-009 discipline:
 *
 * 1. **Recognition is inference.** A wall, floor, ceiling, door, or
 *    window recognized from reconstructed point clouds is derived
 *    interpretation, never a direct observation. Even a perfectly
 *    horizontal plane is not thereby an OBSERVED floor —
 *    "floor-ness" is an architectural interpretation of geometry.
 *    An extracted object may never carry a state ABOVE `INFERRED`
 *    on the strength lattice: OBSERVED (capture/measurement) and
 *    CONFIRMED (authorized human/instrument validation) can never
 *    be produced by recognition — the guard
 *    `assertExtractionMaxRank` fails closed on them. PROPOSED
 *    content (design points) propagates as PROPOSED: weaker is
 *    honest, upgrading is forbidden. Declaring a recognized object
 *    OBSERVED or CONFIRMED is an input declaration made by an
 *    authorized review process (a later work item), never produced
 *    here.
 *
 * 2. **Scene assembly propagates, never upgrades.** The scene is
 *    only as strong as its weakest object: the derived state is the
 *    MINIMUM of the input states on the strength lattice
 *    OBSERVED > CONFIRMED > INFERRED > PROPOSED.
 *
 * 3. **The guards run on the producing path.** Every object
 *    constructor and the scene assembler call these guards, not
 *    just consumers — no code path in this package can emit an
 *    upgraded state even by accident.
 *
 * 4. **Unclassified is not absent.** A cluster that cannot be
 *    classified is reported as unclassified with a reason; lack of
 *    recognition is never silently converted into confirmed
 *    absence of architecture (architecture §6: "lack of
 *    observation must never be silently converted into confirmed
 *    absence").
 */
import { SemanticsError } from "./errors.js";
import type { EpistemicState } from "@aise/shared-contracts";

/** The only epistemic state an extracted object may carry. */
export const EXTRACTION_EPISTEMIC_STATE: EpistemicState = "INFERRED";

/** All valid epistemic states (runtime vocabulary check). */
export const EPISTEMIC_STATES: readonly EpistemicState[] = [
  "OBSERVED",
  "INFERRED",
  "CONFIRMED",
  "PROPOSED",
];

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

/** Runtime guard for a caller-declared epistemic state. */
export function assertValidEpistemicState(state: unknown): EpistemicState {
  if (state !== "OBSERVED" && state !== "INFERRED" && state !== "CONFIRMED" && state !== "PROPOSED") {
    throw new SemanticsError(
      "VALIDATION_FAILED",
      `epistemic state must be one of OBSERVED | INFERRED | CONFIRMED | PROPOSED: ${String(state)}`,
      { details: { value: String(state), allowed: [...EPISTEMIC_STATES] } },
    );
  }
  return state;
}

/**
 * Guard for extraction results: an extracted object may never
 * carry a state ABOVE INFERRED — OBSERVED (that is
 * capture/measurement) and CONFIRMED (that is an authorized
 * human/instrument validation) can never be produced by
 * recognition. PROPOSED content propagates as PROPOSED (a
 * recognized wall over design points is design content, not
 * evidence) — propagating a weaker state is honest, upgrading is
 * forbidden.
 */
export function assertExtractionMaxRank(state: EpistemicState, label: string): void {
  assertValidEpistemicState(state);
  if (epistemicRank(state) > epistemicRank(EXTRACTION_EPISTEMIC_STATE)) {
    throw new SemanticsError(
      "EPISTEMIC_STATE_INVALID",
      `${label} may not carry epistemic state "${state}" — recognition is inference over reconstructed geometry, its output may never outrank ${EXTRACTION_EPISTEMIC_STATE}`,
      { details: { claimed: state, maxRank: EXTRACTION_EPISTEMIC_STATE, label } },
    );
  }
}

/**
 * Derived state for an extracted object over a source point set:
 * the weakest of the source state and INFERRED — recognition of
 * OBSERVED survey points is still INFERRED ("floor-ness" is an
 * interpretation), and recognition of PROPOSED design points is
 * PROPOSED (never upgraded).
 */
export function deriveExtractionState(sourceStates: readonly EpistemicState[]): EpistemicState {
  return deriveCompositeState([...sourceStates, EXTRACTION_EPISTEMIC_STATE]);
}

/**
 * Derived state for a composite result (the scene): the MINIMUM
 * input state on the strength lattice (no upgrade).
 */
export function deriveCompositeState(inputStates: readonly EpistemicState[]): EpistemicState {
  if (inputStates.length === 0) {
    throw new SemanticsError("VALIDATION_FAILED", "cannot derive an epistemic state from zero inputs", {
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
 * No-upgrade assertion for a derived composite: the claimed result
 * state must not outrank ANY input state. Called by the scene
 * assembler as defense in depth.
 */
export function assertNoEpistemicUpgrade(
  claimed: EpistemicState,
  inputStates: readonly EpistemicState[],
): void {
  assertValidEpistemicState(claimed);
  for (const input of inputStates) {
    assertValidEpistemicState(input);
    if (epistemicRank(claimed) > epistemicRank(input)) {
      throw new SemanticsError(
        "EPISTEMIC_STATE_INVALID",
        `derived scene claims "${claimed}" but input state "${input}" does not license it — derived state may never outrank an input`,
        { details: { claimed, input } },
      );
    }
  }
}

/**
 * Guard for the point-cloud source state supplied by callers: a
 * caller may declare OBSERVED (e.g. survey control points) — that
 * is an input declaration, not a derived claim — but a recognized
 * object over OBSERVED points is still INFERRED (rule 1). This
 * function only validates the declaration is well-formed.
 */
export function assertSourceEpistemicState(state: unknown): EpistemicState {
  return assertValidEpistemicState(state);
}
