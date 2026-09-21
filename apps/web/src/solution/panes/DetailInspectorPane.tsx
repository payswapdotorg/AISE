/**
 * PROD-024 — the DETAIL INSPECTOR PANE (isolate/inspect, §4.4).
 *
 * Selecting an operation (from the list, the timeline or the geometry)
 * opens this pane with the operation's FULL engine record:
 *
 *  - the operation record (type, step, deterministic identity);
 *  - the intent provenance — direct manipulation or agent turn, with the
 *    EXACT agent command text / interaction detail verbatim;
 *  - the state delta (parent engine state → resulting engine state, by
 *    identity) and the engine-recorded quantity impacts with their
 *    calculation references;
 *  - the BOQ lines the operation contributes to (through the guarded
 *    BOQ seam — honest "none available" when no data exists);
 *  - the isolate toggle and the UNDO control — which creates a NEW
 *    solution version through the engine's revision service (never an
 *    edit of history in place).
 *
 * Read-only inspection everywhere; the record is rendered verbatim.
 */

import type { SolutionBoqLineTrace } from "../../../../../packages/solution-contract/src/index";
import { currentVersionOf } from "../model";
import { directionTextOf, operationNameOf, originTextOf, parameterTextOf } from "./labels";

export function DetailInspectorPane({ state, boqLines, onRevise, onToggleIsolate, onClose }: {
  readonly state: import("../model").SolutionWorkspaceState;
  /** The guarded seam's lines for this operation (undefined = no BOQ data). */
  readonly boqLines: readonly SolutionBoqLineTrace[] | undefined;
  readonly onRevise: (operationId: string) => void;
  readonly onToggleIsolate: () => void;
  readonly onClose: () => void;
}): React.ReactNode {
  const selection = state.selection;
  if (selection?.kind !== "operation") {
    return (
      <section aria-label="Operation details" className="solution-pane" id="solution-detail">
        <h3>Details</h3>
        <p className="empty" data-empty="detail">
          Select a step in the timeline, the operation list or the drawing to inspect it.
        </p>
      </section>
    );
  }
  const version = currentVersionOf(state);
  const operation = version.operations.find(
    (candidate) => candidate.operationId === selection.operationId,
  );
  if (operation === undefined) {
    return (
      <section aria-label="Operation details" className="solution-pane" id="solution-detail">
        <h3>Details</h3>
        <p className="empty">The selected operation is not part of the current version.</p>
      </section>
    );
  }
  const parentState = version.states[operation.operationIndex - 1];
  const resultingState = version.states[operation.operationIndex];
  const quantityEffects = operation.effects.filter(
    (effect) => effect.effectKind === "quantity-impact" && effect.quantity !== undefined,
  );
  return (
    <section
      aria-label={`Details of step ${operation.operationIndex}`}
      className="solution-pane"
      id="solution-detail"
      data-operation-id={operation.operationId}
    >
      <h3>
        Step {operation.operationIndex} — {operationNameOf(operation.operationType)}
      </h3>
      <dl className="detail-rows">
        <div>
          <dt>What</dt>
          <dd>{parameterTextOfList(operation.parameters)}</dd>
        </div>
        <div>
          <dt>Where</dt>
          <dd>{operation.target.description}</dd>
        </div>
        <div>
          <dt>How it was requested</dt>
          <dd>
            {originTextOf(operation.provenance.origin)} by {operation.provenance.authoredBy}
            {operation.provenance.commandText === undefined ? null : (
              <blockquote data-provenance-command="true">
                “{operation.provenance.commandText}”
              </blockquote>
            )}
            {operation.provenance.interactionDetail === undefined ? null : (
              <p data-provenance-interaction="true">{operation.provenance.interactionDetail}</p>
            )}
          </dd>
        </div>
        <div>
          <dt>State change</dt>
          <dd data-state-delta="true">
            layer {parentState?.stateIndex} ({parentState?.stateId.slice(0, 12)}…) → layer{" "}
            {resultingState?.stateIndex} ({resultingState?.stateId.slice(0, 12)}…)
          </dd>
        </div>
        <div>
          <dt>Quantities (engine-computed)</dt>
          <dd>
            {quantityEffects.length === 0 ? (
              <span>no quantity impact recorded</span>
            ) : (
              <ul className="detail-quantities">
                {quantityEffects.map((effect, index) => (
                  <li
                    data-quantity-unit={effect.quantity?.unit}
                    data-quantity-direction={effect.direction}
                    key={index}
                  >
                    {directionTextOf(effect.direction ?? "changed")} {effect.quantity?.value}{" "}
                    {effect.quantity?.unit} ({effect.quantity?.calculationRef})
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt>BOQ lines</dt>
          <dd data-boq-lines={boqLines === undefined ? "no-data" : String(boqLines.length)}>
            {boqLines === undefined
              ? "no BOQ data available for this solution yet"
              : boqLines.length === 0
                ? "contributes to no BOQ line"
                : boqLines.map((line) => (
                    <span className="boq-line-ref" data-boq-line-id={line.boqLineId} key={line.boqLineId}>
                      {line.itemDescription} — {line.quantity.value} {line.quantity.unit}
                    </span>
                  ))}
          </dd>
        </div>
        <div>
          <dt>Operation identity</dt>
          <dd>
            <code>{operation.operationId}</code>
          </dd>
        </div>
      </dl>
      <div className="detail-actions">
        <button
          aria-pressed={state.isolate ? "true" : "false"}
          onClick={onToggleIsolate}
          type="button"
        >
          {state.isolate ? "Show everything" : "Isolate this step in the drawing"}
        </button>
        <button
          aria-label={`Undo step ${operation.operationIndex} — creates a new version, keeps history`}
          className="danger"
          onClick={() => onRevise(operation.operationId)}
          type="button"
        >
          Undo this step (new version)
        </button>
        <button onClick={onClose} type="button">
          Close
        </button>
      </div>
    </section>
  );
}

function parameterTextOfList(
  parameters: readonly { readonly name: string; readonly value: number | string | boolean; readonly unit?: string }[],
): React.ReactNode {
  return parameters.map((parameter) => parameterTextOf(parameter)).join("; ");
}
