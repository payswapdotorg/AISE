/**
 * PROD-024 — the QUANTITIES PANE: the engineering consequences of the
 * current step, rendered VERBATIM from the engine.
 *
 * The rows are the ENGINE-RECORDED quantity-impact effects of the
 * operations applied up to the timeline cursor (model.ts
 * `quantityRowsOf` — no client-side arithmetic); the net totals come from
 * the ENGINE's aggregated inventory (`deriveStateQuantities` through the
 * service port) when present. Every row carries its calculation
 * reference — calculation provenance is inspectable, per ACR-005.
 */

import type { QuantityRow } from "../model";
import type { StateQuantityInventory } from "../../../../../packages/solution-engine/src/index";
import { directionTextOf, operationNameOf } from "./labels";

export function QuantitiesPane({ rows, inventory }: {
  readonly rows: readonly QuantityRow[];
  readonly inventory: StateQuantityInventory | undefined;
}): React.ReactNode {
  return (
    <section aria-label="Quantities at this step" className="solution-pane" id="solution-quantities">
      <h3>What this proposal uses — quantities so far</h3>
      {rows.length === 0 ? (
        <p className="empty" data-empty="quantities">
          No proposed work yet — quantities appear as steps are added.
        </p>
      ) : (
        <table className="quantities-table">
          <caption>Engine-computed quantities of the work up to the current step</caption>
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">Work</th>
              <th scope="col">Effect</th>
              <th scope="col">Calculated as</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                data-quantity-unit={row.unit}
                data-step={row.step}
                key={`${row.operationId}-${index}`}
              >
                <td>{row.step}</td>
                <td>{operationNameOf(row.operationType)}</td>
                <td>
                  {directionTextOf(row.direction)} {row.value} {row.unit}
                </td>
                <td>
                  <code>{row.calculationRef}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {inventory === undefined ? null : (
        <div className="quantity-totals" data-totals-state-index={inventory.stateIndex}>
          <h4>Net totals (engine aggregate)</h4>
          <ul>
            {inventory.totals.map((total, index) => (
              <li data-total-unit={total.unit} key={`${total.dimension}-${total.unit}-${index}`}>
                {total.dimension}: {total.netValue} {total.unit} net ({total.addedValue} added ·{" "}
                {total.removedValue} removed)
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
