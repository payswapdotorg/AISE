/**
 * PROD-024 — the guarded BOQ PANE (§4.6 of the work order).
 *
 * Renders whatever the guarded BOQ seam honestly provides:
 *
 *  - NO data → the explicit "none available" state (never a crash, never
 *    a fabricated line);
 *  - a trace set pinned to ANOTHER version → the pin notice (the lines
 *    stay inspectable as pinned history — version pinning is a contract
 *    invariant the workspace never silently re-keys);
 *  - a matching trace set → every generated line with its typed quantity,
 *    its contributing steps (clickable — selection syncs to the
 *    operations and the viewer) and, in the other direction, the lines of
 *    the currently selected operation highlight.
 *
 * Synchronization is keyed by the CONTRACT's trace identities
 * (boqLineId ↔ operationId) through the seam's pure resolvers.
 */

import type { SolutionBoqLineTrace } from "../../../../../packages/solution-contract/src/index";
import { boqLineHighlightOf, boqPaneStatusOf, operationsForBoqLine } from "../boq";
import type { SolutionBoqSyncInput } from "../boq";
import type { SolutionWorkspaceState } from "../model";

export function BoqPane({ state, boq, onSelectLine }: {
  readonly state: SolutionWorkspaceState;
  readonly boq: SolutionBoqSyncInput | undefined;
  readonly onSelectLine: (boqLineId: string) => void;
}): React.ReactNode {
  const status = boqPaneStatusOf(boq, state);
  const selectedLineId = state.selection?.kind === "boq-line" ? state.selection.boqLineId : undefined;
  const selectedOperationId =
    state.selection?.kind === "operation" ? state.selection.operationId : undefined;

  if (status.kind === "none") {
    return (
      <section aria-label="Bill of quantities" className="solution-pane" id="solution-boq">
        <h3>Bill of quantities</h3>
        <p className="empty" data-boq-status="none">
          {status.detail}
        </p>
      </section>
    );
  }

  const traceSet = status.traceSet;
  const highlight = selectedLineId === undefined ? undefined : boqLineHighlightOf(boq, selectedLineId);
  const selectedLineTraces: readonly SolutionBoqLineTrace[] =
    selectedOperationId === undefined
      ? []
      : traceSet.lineTraces.filter((trace) =>
          trace.contributingOperations.some(
            (contribution) => contribution.operationId === selectedOperationId,
          ),
        );

  return (
    <section aria-label="Bill of quantities" className="solution-pane" id="solution-boq" data-boq-status={status.kind}>
      <h3>Bill of quantities</h3>
      {status.kind === "version-pinned-elsewhere" ? (
        <p className="boq-pin-notice" data-boq-pin="true">{status.detail}</p>
      ) : null}
      <table className="boq-table">
        <caption>Generated solution BOQ — version {traceSet.versionNumber}, trace set pinned to validation snapshot {traceSet.validationSnapshotRef.slice(0, 12)}…</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Quantity</th>
            <th scope="col">Steps</th>
          </tr>
        </thead>
        <tbody>
          {traceSet.lineTraces.map((line) => {
            const isSelected = selectedLineId === line.boqLineId;
            const contributesToSelection =
              selectedOperationId !== undefined &&
              line.contributingOperations.some(
                (contribution) => contribution.operationId === selectedOperationId,
              );
            const contributions = operationsForBoqLine(boq, line.boqLineId) ?? [];
            return (
              <tr
                className={isSelected ? "boq-row-selected" : undefined}
                data-boq-line-id={line.boqLineId}
                data-contributes-to-selection={contributesToSelection ? "true" : undefined}
                data-selected={isSelected ? "true" : undefined}
                key={line.boqLineId}
              >
                <td>
                  <button
                    aria-label={`Select BOQ line: ${line.itemDescription}, ${line.quantity.value} ${line.quantity.unit}, contributing step ${contributions.map((contribution) => contribution.operationIndex).join(", ")}`}
                    onClick={() => onSelectLine(line.boqLineId)}
                    type="button"
                  >
                    {line.itemDescription}
                  </button>
                </td>
                <td>
                  {line.quantity.value} {line.quantity.unit}
                </td>
                <td>
                  {contributions
                    .map((contribution) => `step ${contribution.operationIndex} (${contribution.contributionKind})`)
                    .join(", ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {highlight === undefined ? null : (
        <p aria-live="polite" className="boq-sync-note" data-boq-sync="line-to-operations">
          Line “{selectedLineId}” comes from {highlight.operationIds.length} step(s); their
          geometry ({highlight.geometryRefs.join(", ")}) is highlighted in the drawing.
        </p>
      )}
      {selectedOperationId === undefined || selectedLineTraces.length === 0 ? null : (
        <p aria-live="polite" className="boq-sync-note" data-boq-sync="operation-to-lines">
          The selected step contributes to {selectedLineTraces.length} BOQ line(s)
          {selectedLineTraces.length === 0 ? "" : `: ${selectedLineTraces.map((line) => line.boqLineId).join(", ")}`}.
        </p>
      )}
    </section>
  );
}
