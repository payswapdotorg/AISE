/**
 * PROD-024 — the TIMELINE PANE: step navigation through the solution's
 * ENGINE states (§4.4 of the work order).
 *
 * Every tick of the timeline is an ENGINE-RECORDED state layer of the
 * current solution version (layer 0 = the observed baseline overlay).
 * Stepping forward/back/jumping moves the VIEW cursor only — the layer
 * at the cursor is always the engine's own materialization (an exact
 * restore of the prior engine state; deterministic replay, never a
 * client-side snapshot). Each tick shows the operation identity and its
 * consequence (engine-recorded quantities per step).
 *
 * Accessibility: the timeline is a list of buttons (`aria-current` marks
 * the cursor; every button carries an `aria-label` with the full step
 * description) plus prev/next controls — fully keyboard navigable.
 */

import type { EngineeringOperation } from "../../../../../packages/solution-contract/src/index";
import { timelineOf } from "../model";
import { directionTextOf, operationNameOf } from "./labels";

/** The engine-recorded quantity impacts of one step, real-world worded. */
function consequenceOf(operation: EngineeringOperation | undefined): string {
  if (operation === undefined) {
    return "the observed building as it stands today — no proposed work yet";
  }
  const impacts = operation.effects
    .filter((effect) => effect.effectKind === "quantity-impact" && effect.quantity !== undefined)
    .map(
      (effect) =>
        `${directionTextOf(effect.direction ?? "changed")} ${effect.quantity?.value} ${effect.quantity?.unit}`,
    );
  return impacts.length === 0
    ? "no quantity impact recorded by the engine"
    : impacts.join(", ");
}

export function TimelinePane({ state, onStep }: {
  /** The workspace state (the timeline derives from its engine states). */
  readonly state: { readonly versions: readonly unknown[] } & import("../model").SolutionWorkspaceState;
  readonly onStep: (stateIndex: number) => void;
}): React.ReactNode {
  const ticks = timelineOf(state);
  const version = state.versions[state.currentVersionNumber - 1] as
    | { readonly operations: readonly EngineeringOperation[] }
    | undefined;
  return (
    <section aria-label="Solution timeline" className="solution-pane" id="solution-timeline">
      <h3>Timeline — proposed work, step by step</h3>
      <div className="timeline-controls">
        <button
          aria-label="Step back one layer"
          disabled={state.cursorStateIndex === 0}
          onClick={() => onStep(state.cursorStateIndex - 1)}
          type="button"
        >
          ◀ Step back
        </button>
        <button
          aria-label="Step forward one layer"
          disabled={state.cursorStateIndex >= ticks.length - 1}
          onClick={() => onStep(state.cursorStateIndex + 1)}
          type="button"
        >
          Step forward ▶
        </button>
      </div>
      <ol className="timeline-ticks">
        {ticks.map((tick) => {
          const operation =
            tick.operationId === undefined
              ? undefined
              : version?.operations[tick.stateIndex - 1];
          return (
            <li key={tick.stateId}>
              <button
                aria-current={tick.isCursor ? "step" : undefined}
                aria-label={`Layer ${tick.stateIndex}: ${tick.label}; ${consequenceOf(operation)}`}
                className={tick.isCursor ? "tick tick-current" : "tick"}
                data-state-index={tick.stateIndex}
                data-state-id={tick.stateId}
                data-operation-id={tick.operationId}
                data-is-cursor={tick.isCursor ? "true" : undefined}
                onClick={() => onStep(tick.stateIndex)}
                type="button"
              >
                <span className="tick-title">{tick.label}</span>
                <span className="tick-detail">
                  {tick.operationId === undefined
                    ? "observed reality (layer 0)"
                    : `${operationNameOf(tick.operationType ?? "")}: ${consequenceOf(operation)}`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
