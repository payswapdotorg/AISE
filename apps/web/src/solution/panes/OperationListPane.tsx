/**
 * PROD-024 — the OPERATION LIST PANE.
 *
 * Every recorded operation of the current solution version, in engine
 * order, each row carrying: its real-world summary, its provenance origin
 * (direct manipulation or agent command — intent provenance, §4.4), the
 * author, and its engine identity (the trace join key). Selecting a row
 * isolates the affected geometry in the viewer and opens the detail
 * inspector. Read-only everywhere; revision happens through the detail
 * pane's explicit "undo this step" control (which creates a NEW version).
 */

import { currentVersionOf } from "../model";
import { operationSummaryOf, originTextOf } from "./labels";

export function OperationListPane({ state, onSelectOperation }: {
  readonly state: import("../model").SolutionWorkspaceState;
  readonly onSelectOperation: (operationId: string) => void;
}): React.ReactNode {
  const version = currentVersionOf(state);
  const selectedOperationId =
    state.selection?.kind === "operation" ? state.selection.operationId : undefined;
  return (
    <section aria-label="Operation list" className="solution-pane" id="solution-operations">
      <h3>Operations in this proposal</h3>
      {version.operations.length === 0 ? (
        <p className="empty" data-empty="operations">
          No proposed work yet. Select something in the viewer or ask the agent.
        </p>
      ) : (
        <ol className="operation-list">
          {version.operations.map((operation) => (
            <li key={operation.operationId}>
              <button
                aria-current={selectedOperationId === operation.operationId ? "true" : undefined}
                aria-label={`Step ${operation.operationIndex}: ${operationSummaryOf(operation)} (authored by ${originTextOf(operation.provenance.origin)})`}
                className={
                  selectedOperationId === operation.operationId
                    ? "operation-row operation-row-selected"
                    : "operation-row"
                }
                data-operation-id={operation.operationId}
                data-operation-type={operation.operationType}
                data-origin={operation.provenance.origin}
                data-selected={selectedOperationId === operation.operationId ? "true" : undefined}
                onClick={() => onSelectOperation(operation.operationId)}
                type="button"
              >
                <span className="operation-index">Step {operation.operationIndex}</span>
                <span className="operation-summary">{operationSummaryOf(operation)}</span>
                <span className="operation-origin">
                  by {originTextOf(operation.provenance.origin)} · {operation.provenance.authoredBy}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
