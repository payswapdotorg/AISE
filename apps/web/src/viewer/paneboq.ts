/**
 * AISE-027 — the BOQ pane: the proposed bill of ONE intervention state.
 *
 * ⚠ HONESTY RULES (the deliberate scope line):
 *
 *  - The BOQ pane lists the layer's PROPOSED property assertions VERBATIM
 *    (key = value unit, all PROPOSED — the 026 epistemic seal), one row per
 *    live state node, plus one PROPOSED-REMOVAL row per 026 tombstone. It
 *    does NOT compute quantities, areas, volumes, costs or deltas: quantity
 *    and cost impacts of proposed steps are AISE-028's scope (deterministic
 *    geometry/state deltas) and are deliberately NOT attempted here — a
 *    viewer that invented a quantity would be fabricating engineering
 *    truth. Values, units, origins and applied step ids are carried
 *    VERBATIM; no number is ever derived, converted or summed.
 *  - Every row carries the stable `nodeId` — the SAME id the 3D and 2D
 *    panes draw — so selecting a BOQ row can resolve the same element in
 *    the other views (the "BOQ item synchronizes the other views" rule of
 *    spec/architecture.md §11).
 *  - A node with no properties renders an honest empty cell ("no proposed
 *    quantities") — absence of a proposed quantity is not a zero.
 *  - `selectedNodeId` only toggles `data-selected="true"` on that node's
 *    row — presentation only.
 *
 * Determinism: rows are node-id sorted (shuffle-invariant), fixed
 * attribute order, canonical number text via `fmt`, no clock, no
 * randomness. Pure: the state is never mutated.
 */

import { escapeHtml, fmt } from "./format";
import type {
  BoqProjection,
  BoqRemovalRow,
  BoqRow,
  ViewerInterventionState,
  ViewerProposedProperty,
} from "./model";

/** Code-unit ordering (locale-independent). */
function byNodeId<T extends { readonly nodeId: string }>(a: T, b: T): number {
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
}

/**
 * Project ONE materialized intervention state into the BOQ pane model:
 * one row per LIVE node (node-id sorted, properties verbatim) + one
 * proposed-removal row per tombstone (node-id sorted). Pure.
 */
export function projectStateBoq(state: ViewerInterventionState): BoqProjection {
  const rows: BoqRow[] = state.nodes.map((stateNode) => ({
    nodeId: stateNode.nodeId,
    kind: stateNode.node.kind,
    origin: stateNode.origin,
    appliedStepIds: stateNode.appliedStepIds,
    properties: stateNode.node.properties,
  }));
  const removals: BoqRemovalRow[] = state.proposedTombstones.map((tombstone) => ({
    nodeId: tombstone.nodeId,
    reason: tombstone.reason,
    proposedByStepId: tombstone.proposedByStepId,
  }));
  return { rows: rows.sort(byNodeId), removals: removals.sort(byNodeId) };
}

/** One proposed property as deterministic text: "key = value unit (PROPOSED)". */
export function propertyText(property: ViewerProposedProperty): string {
  const value =
    typeof property.value === "number" && property.unit !== undefined
      ? `${fmt(property.value)} ${property.unit}`
      : String(property.value);
  return `${property.key} = ${value} (${property.epistemicStatus})`;
}

/** One BOQ row's proposed-quantities cell text ("; "-joined, honest empty). */
export function rowQuantitiesText(row: BoqRow): string {
  if (row.properties.length === 0) {
    return "no proposed quantities";
  }
  return row.properties.map(propertyText).join("; ");
}

/** One proposed-removal row as deterministic text. */
export function removalText(removal: BoqRemovalRow): string {
  return `${removal.nodeId} — PROPOSED REMOVAL — ${removal.reason} (step ${removal.proposedByStepId})`;
}

/* ------------------------------------------------------------------ */
/* HTML rendering                                                      */
/* ------------------------------------------------------------------ */

/**
 * Deterministic HTML of the BOQ pane's table + removals list. Rows carry
 * `data-node-id`, the 026 `data-origin` and the node's applied step ids;
 * `selectedNodeId` highlights that node's row — presentation only.
 */
export function renderBoqTable(projection: BoqProjection, selectedNodeId?: string): string[] {
  const lines: string[] = [];
  if (projection.rows.length === 0) {
    lines.push(`<p class="pane-empty">No live nodes in this state layer.</p>`);
  } else {
    lines.push(`<table class="boq">`);
    lines.push(
      `<thead><tr><th>Node</th><th>Kind</th><th>Origin</th><th>Proposed quantities (verbatim)</th><th>Steps</th></tr></thead>`,
    );
    lines.push(`<tbody>`);
    for (const row of projection.rows) {
      const selected = selectedNodeId !== undefined && selectedNodeId === row.nodeId;
      const steps =
        row.appliedStepIds.length === 0 ? "—" : row.appliedStepIds.join(", ");
      lines.push(
        `<tr data-node-id="${escapeHtml(row.nodeId)}" data-origin="${escapeHtml(row.origin)}"${selected ? ` data-selected="true"` : ""}><td>${escapeHtml(row.nodeId)}</td><td>${escapeHtml(row.kind)}</td><td>${escapeHtml(row.origin)}</td><td>${escapeHtml(rowQuantitiesText(row))}</td><td>${escapeHtml(steps)}</td></tr>`,
      );
    }
    lines.push(`</tbody>`, `</table>`);
  }
  if (projection.removals.length > 0) {
    lines.push(`<ul class="boq-removals">`);
    for (const removal of projection.removals) {
      lines.push(
        `<li data-node-id="${escapeHtml(removal.nodeId)}" data-removal-step-id="${escapeHtml(removal.proposedByStepId)}">${escapeHtml(removalText(removal))}</li>`,
      );
    }
    lines.push(`</ul>`);
  }
  return lines;
}
