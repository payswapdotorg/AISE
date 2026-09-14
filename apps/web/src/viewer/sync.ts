/**
 * AISE-027 — the synchronized layer-navigation core (THE §027 acceptance
 * engine).
 *
 * Work order §027: "allow Next/Previous layer navigation with synchronized
 * stable IDs"; lock "Intervention": "BOQ/2D/3D views of one intervention
 * state must refer to the same proposed state identifier"; R11: "layer N
 * is a deterministic proposed state".
 *
 * DESIGN — SYNCHRONIZATION BY CONSTRUCTION: a `ViewerFrame` is resolved
 * from ONE scenario record and carries the layer's FULL identity
 * {scenarioId, projectId, baselineVersionId, stateIndex, stateId,
 * appliedStepIds}. The three panes are always projected from the frame's
 * ONE state object, so the same stateId/scenarioId/step identity drives
 * 3D, 2D and BOQ by construction — navigation can never desynchronize
 * them because there is no second id to drift.
 *
 * BOUNDARY BEHAVIOR: `navigate` CLAMPS at the layer list's edges — Next at
 * the last layer stays at the last layer (atLast), Previous at the first
 * layer stays at the first layer (atFirst). Deterministic, never throws:
 * asking to navigate past an edge is a browsing action, not an error.
 * Addressing a NON-EXISTENT layer index directly (stateAt) IS a typed
 * error (`state_index_out_of_range`) — the distinction is deliberate.
 *
 * ALIGNMENT GUARD (defense in depth): `verifyStateAlignment` re-checks the
 * 026 record invariants the viewer's synchronization depends on — a state
 * whose scenarioId/baseline pin disagrees with the record, or whose
 * position/applied-step sequence disagrees with the record's step list,
 * is a typed rejection (`state_scenario_mismatch` /
 * `state_sequence_mismatch`) and is NEVER silently re-synchronized
 * (the AISE-021 version-mismatch philosophy, hardened to an error because
 * §027 requires exact state alignment).
 *
 * Pure functions only: no clock, no randomness, no IO; inputs are never
 * mutated.
 */

import { ViewerError } from "./errors";
import type {
  NavigationDirection,
  ViewerFrame,
  ViewerInterventionState,
  ViewerScenario,
} from "./model";

/** Total layer count of a scenario record (always ≥ 1 for a valid 026 record). */
export function stateCountOf(scenario: ViewerScenario): number {
  return scenario.states.length;
}

/** The stable state ids of a scenario record, in layer order (0..N). */
export function stateIdsOf(scenario: ViewerScenario): readonly string[] {
  return scenario.states.map((state) => state.stateId);
}

/** The LAST layer index (states.length − 1). */
export function latestStateIndex(scenario: ViewerScenario): number {
  return scenario.states.length - 1;
}

/**
 * Resolve layer N of a scenario record. Typed `state_index_out_of_range`
 * for a non-integer or out-of-[0, states.length) index — addressing a
 * layer that does not exist is an error, never a clamp.
 */
export function stateAt(scenario: ViewerScenario, stateIndex: number): ViewerInterventionState {
  if (!Number.isInteger(stateIndex) || stateIndex < 0 || stateIndex >= scenario.states.length) {
    throw new ViewerError(
      "state_index_out_of_range",
      `state index ${String(stateIndex)} is outside 0..${String(scenario.states.length - 1)} of scenario ${scenario.scenarioId}`,
    );
  }
  return scenario.states[stateIndex] as ViewerInterventionState;
}

/* ------------------------------------------------------------------ */
/* Alignment guard (defense in depth over the 026 record invariants)   */
/* ------------------------------------------------------------------ */

/**
 * Re-check the alignment invariants the synchronized viewer depends on.
 * Throws typed errors (never repairs, never silently re-synchronizes):
 *
 *  - state.scenarioId must equal the record's scenarioId;
 *  - states.length must equal steps.length + 1;
 *  - states[state.stateIndex].stateId must equal state.stateId;
 *  - states[state.stateIndex] must BE the given state (verbatim bytes);
 *  - state.baselineVersionId must equal the record's pinned baseline;
 *  - state.appliedStepIds must equal steps[0..stateIndex) ids, in order.
 */
export function verifyStateAlignment(
  scenario: ViewerScenario,
  state: ViewerInterventionState,
): void {
  if (state.scenarioId !== scenario.scenarioId) {
    throw new ViewerError(
      "state_scenario_mismatch",
      `state ${state.stateId} belongs to scenario ${state.scenarioId}, not ${scenario.scenarioId}`,
    );
  }
  if (scenario.states.length !== scenario.steps.length + 1) {
    throw new ViewerError(
      "state_sequence_mismatch",
      `scenario ${scenario.scenarioId} carries ${String(scenario.states.length)} states for ${String(scenario.steps.length)} steps — expected steps + 1`,
    );
  }
  const recorded = scenario.states[state.stateIndex];
  if (recorded === undefined || recorded.stateId !== state.stateId) {
    throw new ViewerError(
      "state_sequence_mismatch",
      `state ${state.stateId} claims layer ${String(state.stateIndex)} but the record's layer ${String(state.stateIndex)} is ${recorded === undefined ? "absent" : recorded.stateId}`,
    );
  }
  if (state.baselineVersionId !== scenario.baselineVersionId) {
    throw new ViewerError(
      "state_sequence_mismatch",
      `state ${state.stateId} pins baseline ${state.baselineVersionId}, not the scenario's ${scenario.baselineVersionId}`,
    );
  }
  const expectedStepIds = scenario.steps
    .slice(0, state.stateIndex)
    .map((step) => step.stepId);
  if (
    state.appliedStepIds.length !== expectedStepIds.length ||
    state.appliedStepIds.some((stepId, position) => stepId !== expectedStepIds[position])
  ) {
    throw new ViewerError(
      "state_sequence_mismatch",
      `state ${state.stateId} applied steps [${state.appliedStepIds.join(",")}] disagree with the record's steps [${expectedStepIds.join(",")}]`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* The synchronized frame                                              */
/* ------------------------------------------------------------------ */

/**
 * Resolve the synchronized `ViewerFrame` for layer N of a scenario record:
 * the ONE identity object all three panes of a rendered layer share. The
 * frame's state is alignment-checked before the frame is returned.
 */
export function frameOf(scenario: ViewerScenario, stateIndex: number): ViewerFrame {
  const state = stateAt(scenario, stateIndex);
  verifyStateAlignment(scenario, state);
  return {
    scenarioId: scenario.scenarioId,
    projectId: scenario.projectId,
    baselineVersionId: scenario.baselineVersionId,
    stateIndex: state.stateIndex,
    stateId: state.stateId,
    appliedStepIds: state.appliedStepIds,
    stateCount: scenario.states.length,
    atFirst: state.stateIndex === 0,
    atLast: state.stateIndex === scenario.states.length - 1,
  };
}

/**
 * Next/Previous layer navigation with SYNCHRONIZED STABLE IDS: resolves the
 * neighbor layer's frame (same scenario record, neighbor stateIndex,
 * neighbor stateId). CLAMPED at the edges — Next at the last layer returns
 * the last layer's frame (atLast), Previous at the first layer returns the
 * first layer's frame (atFirst) — deterministic, never throws. An
 * out-of-range CURRENT index is still a typed error (addressing a layer
 * that does not exist).
 */
export function navigate(
  scenario: ViewerScenario,
  stateIndex: number,
  direction: NavigationDirection,
): ViewerFrame {
  // The CURRENT layer must exist — addressing a layer that does not exist
  // is a typed error (only the TARGET clamps at the edges).
  stateAt(scenario, stateIndex);
  const target =
    direction === "next"
      ? Math.min(stateIndex + 1, scenario.states.length - 1)
      : Math.max(stateIndex - 1, 0);
  return frameOf(scenario, target);
}

/**
 * The navigation target frame for a rendered layer (what the Previous /
 * Next controls point at): the neighbor frame when it exists, or the
 * current frame at the boundary — with `atFirst`/`atLast` describing the
 * CURRENT layer so the caller can render disabled controls honestly.
 */
export function navigationTargets(scenario: ViewerScenario, stateIndex: number): {
  readonly previous: ViewerFrame;
  readonly next: ViewerFrame;
  readonly current: ViewerFrame;
} {
  const current = frameOf(scenario, stateIndex);
  return {
    current,
    previous: navigate(scenario, stateIndex, "previous"),
    next: navigate(scenario, stateIndex, "next"),
  };
}
