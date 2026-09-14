/**
 * AISE-021 — `renderWorkspace`: the browser engineering workspace document.
 *
 * ⚠⚠⚠ NO BROWSER-SIDE AUTHORITY (frozen invariant, architecture-lock
 * "Authority" #8: UI state is never canonical) ⚠⚠⚠
 *
 * `renderWorkspace(input)` is a PURE FUNCTION from a server-assembled
 * `WorkspaceInput` to ONE complete HTML document string:
 *
 *  - the 2D pane (floor-plan SVG, every element carrying `data-node-id`);
 *  - the 3D pane (deterministic axonometric wireframe, same `data-node-id`s
 *    — see wireframe.ts: an engineering wireframe, NOT a 3D engine);
 *  - the evidence pane (server-provided records, linked BY NODE ID — one
 *    row per entry×node link so every row carries exactly one
 *    `data-node-id`; invalidated records carry an explicit INVALID marker);
 *  - the measurement strip (every dimension: value + unit + σ, where an
 *    unknown σ reads "σ unknown" — never a fabricated ±0);
 *  - the review banner — the SERVER's review state rendered VERBATIM. The
 *    workspace NEVER computes, infers, defaults or alters a review status;
 *    there is no code path that could, by design;
 *  - the selection panel for `selectedNodeId` — `resolveSelection` output,
 *    i.e. the R5 cross-view resolution of ONE stable id.
 *
 * SELECTION CHANGES PRESENTATION ONLY: `data-selected="true"` attributes and
 * the highlight stroke on exactly that node's elements in both panes plus
 * the selection panel. Geometry, ids, ordering and every input value are
 * untouched; two renders of the same input are BYTE-IDENTICAL (no clock, no
 * randomness, canonical number text, fixed attribute order).
 *
 * The workspace NEVER fetches: all data arrives via `WorkspaceInput`. It
 * also renders honestly what the server DID NOT provide: omitted nodes with
 * their stable reason codes (both panes) and a version-mismatch warning
 * when the drawing's `sourceVersionId` disagrees with the graph snapshot's
 * `versionId` (surfaced, not silently synchronized).
 */

import { WorkspaceError } from "./errors";
import { escapeHtml, fmt } from "./format";
import type {
  Dimension2D,
  OmittedNode,
  ReviewState,
  SelectionBundle,
  SelectionSigma,
  WorkspaceInput,
  WorkspaceProperty,
} from "./model";
import { renderDrawing2dSvg } from "./svg2d";
import { resolveSelection, viewOf } from "./selection";
import { DEFAULT_VIEW, project3dWireframe, renderWireframeSvg, type WireframeOmission } from "./wireframe";

/** Version stamped on every workspace document (determinism pin). */
export const WORKSPACE_GENERATOR_VERSION = "aise-workspace/1.0";

/** Fixed stylesheet — a constant string, never derived from input data. */
const WORKSPACE_CSS = `main.panes,header,footer,.selection-panel{max-width:64rem;margin:0 auto;padding:0 1rem}
.panes{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.pane,.selection-panel,header,footer{font:14px/1.45 system-ui,sans-serif;color:#1c1917}
.pane{border:1px solid #d6d3d1;border-radius:6px;padding:.75rem;background:#fff}
.pane svg,.selection-panel svg{width:100%;height:auto;display:block}
.pane-note,.version-pin,.workspace-footer{color:#57534e;font-size:12px}
.version-warning{color:#9a3412;font-weight:600}
.review-banner{border:1px solid #d97706;background:#fffbeb;border-radius:6px;padding:.5rem .75rem;margin:.5rem 1rem}
.review-banner[data-review-status=rejected]{border-color:#b91c1c;background:#fef2f2}
.review-banner[data-review-status=approved]{border-color:#15803d;background:#f0fdf4}
.evidence-list,.measurement-strip,.omissions,.selection-properties,.selection-sigmas,.selection-2d,.selection-3d,.selection-evidence{list-style:none;padding-left:0;margin:.25rem 0}
.evidence-list li,.measurement-strip li,.omissions li{padding:.15rem 0;border-bottom:1px dotted #e7e5e4}
.evidence-list li[data-invalid=true]{color:#b91c1c;text-decoration:line-through}
.sigma-unknown{color:#9a3412}
code{background:#f5f5f4;padding:0 .25rem;border-radius:3px}`;

/* ------------------------------------------------------------------ */
/* Input validation                                                    */
/* ------------------------------------------------------------------ */

function requireInput(input: WorkspaceInput): void {
  const drawing = input.drawing;
  if (drawing === null || typeof drawing !== "object" || typeof drawing.sourceVersionId !== "string" || drawing.sourceVersionId.length === 0) {
    throw new WorkspaceError("invalid_input", "drawing requires a non-empty sourceVersionId");
  }
  if (!Array.isArray(drawing.elements) || !Array.isArray(drawing.dimensions) || !Array.isArray(drawing.omittedNodes)) {
    throw new WorkspaceError("invalid_input", "drawing elements/dimensions/omittedNodes must be arrays");
  }
  const snapshot = input.graphSnapshot;
  if (snapshot === null || typeof snapshot !== "object" || typeof snapshot.versionId !== "string" || snapshot.versionId.length === 0) {
    throw new WorkspaceError("invalid_input", "graphSnapshot requires a non-empty versionId");
  }
  if (!Array.isArray(snapshot.nodes)) {
    throw new WorkspaceError("invalid_input", "graphSnapshot.nodes must be an array");
  }
  if (!Array.isArray(input.evidence)) {
    throw new WorkspaceError("invalid_input", "evidence must be an array");
  }
}

/* ------------------------------------------------------------------ */
/* Document assembly                                                   */
/* ------------------------------------------------------------------ */

/** Render the complete workspace HTML document (deterministic, pure). */
export function renderWorkspace(input: WorkspaceInput): string {
  requireInput(input);

  const view = viewOf(input);
  const wireframe = project3dWireframe(input.graphSnapshot, view);
  const svg2d = renderDrawing2dSvg(input.drawing, input.selectedNodeId);
  const svg3d = renderWireframeSvg(wireframe, input.selectedNodeId);
  const selection =
    input.selectedNodeId === undefined ? undefined : resolveSelection(input.selectedNodeId, input);

  const lines: string[] = [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8"/>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1"/>`,
    `<title>AISE engineering workspace — ${escapeHtml(input.graphSnapshot.versionId)}</title>`,
    `<style>${WORKSPACE_CSS}</style>`,
    `</head>`,
    `<body class="aise-workspace" data-graph-version="${escapeHtml(input.graphSnapshot.versionId)}" data-drawing-id="${escapeHtml(input.drawing.drawingId)}" data-drawing-generator="${escapeHtml(input.drawing.generatedBy)}" data-workspace-version="${WORKSPACE_GENERATOR_VERSION}">`,
    ...headerLines(input),
    ...reviewBannerLines(input.review),
    `<main class="panes">`,
    ...pane2dLines(input, svg2d),
    ...pane3dLines(view, svg3d, wireframe.omissions),
    ...paneEvidenceLines(input),
    ...paneMeasurementLines(input.drawing.dimensions),
    `</main>`,
    ...(selection === undefined ? [] : selectionPanelLines(selection)),
    ...footerLines(),
    `</body>`,
    `</html>`,
  ];
  return `${lines.join("\n")}\n`;
}

function headerLines(input: WorkspaceInput): string[] {
  const lines = [
    `<header class="workspace-header">`,
    `<h1>AISE engineering workspace</h1>`,
    `<p class="version-pin">2D floor plan · 3D engineering wireframe · evidence — pinned to graph version <code>${escapeHtml(input.graphSnapshot.versionId)}</code> (drawing <code>${escapeHtml(input.drawing.drawingId)}</code> generated by <code>${escapeHtml(input.drawing.generatedBy)}</code>).</p>`,
  ];
  if (input.drawing.sourceVersionId !== input.graphSnapshot.versionId) {
    lines.push(
      `<p class="version-warning" data-version-mismatch="true">Version mismatch: the drawing was generated from <code>${escapeHtml(input.drawing.sourceVersionId)}</code> but the graph snapshot is <code>${escapeHtml(input.graphSnapshot.versionId)}</code> — the panes may show different model versions.</p>`,
    );
  }
  lines.push(`</header>`);
  return lines;
}

/* ------------------------------------------------------------------ */
/* Review banner (VERBATIM server state — never computed here)         */
/* ------------------------------------------------------------------ */

function reviewBannerLines(review: ReviewState | undefined): string[] {
  if (review === undefined) {
    return [];
  }
  return [
    `<section class="review-banner" data-review-status="${escapeHtml(review.status)}" aria-label="Review state">`,
    `<p><strong>Review — ${escapeHtml(review.status)}</strong> by ${escapeHtml(review.reviewer)} at ${escapeHtml(review.at)}</p>`,
    `<p>${escapeHtml(review.note)}</p>`,
    `</section>`,
  ];
}

/* ------------------------------------------------------------------ */
/* Panes                                                               */
/* ------------------------------------------------------------------ */

function pane2dLines(input: WorkspaceInput, svg: string): string[] {
  return [
    `<section class="pane" id="pane-2d" aria-label="2D floor plan">`,
    `<h2>2D — floor plan</h2>`,
    svg.trimEnd(),
    ...omissionLines(input.drawing.omittedNodes),
    `</section>`,
  ];
}

function pane3dLines(
  view: { readonly azimuthRad: number; readonly elevationRad: number },
  svg: string,
  omissions: readonly WireframeOmission[],
): string[] {
  const azimuthDeg = fmt((view.azimuthRad * 180) / Math.PI);
  const elevationDeg = fmt((view.elevationRad * 180) / Math.PI);
  return [
    `<section class="pane" id="pane-3d" aria-label="3D engineering wireframe">`,
    `<h2>3D — engineering wireframe</h2>`,
    `<p class="pane-note">Orthographic axonometric wireframe of plane boundary polygons (azimuth ${azimuthDeg}°, elevation ${elevationDeg}°). Full 3D rendering is out of scope — this is an engineering wireframe.</p>`,
    svg.trimEnd(),
    ...omissionLines(omissions),
    `</section>`,
  ];
}

/** Honest omissions: stable node id + reason code, verbatim input order. */
function omissionLines(omissions: readonly (OmittedNode | WireframeOmission)[]): string[] {
  if (omissions.length === 0) {
    return [];
  }
  const lines = [`<ul class="omissions">`];
  for (const omission of omissions) {
    lines.push(
      `<li data-omitted-node-id="${escapeHtml(omission.nodeId)}" data-reason="${escapeHtml(omission.reason)}">${escapeHtml(omission.nodeId)} — ${escapeHtml(omission.reason)}</li>`,
    );
  }
  lines.push(`</ul>`);
  return lines;
}

function paneEvidenceLines(input: WorkspaceInput): string[] {
  const lines = [
    `<section class="pane" id="pane-evidence" aria-label="Evidence">`,
    `<h2>Evidence</h2>`,
    `<ul class="evidence-list">`,
  ];
  if (input.evidence.length === 0) {
    lines.push(`<li class="empty">No evidence records linked in this workspace input.</li>`);
  }
  for (const entry of input.evidence) {
    for (const nodeId of entry.linkedNodeIds) {
      const selected = input.selectedNodeId === nodeId;
      const invalid = entry.invalidated === true;
      const text = [
        `${entry.evidenceId} — ${entry.method} — node ${nodeId}`,
        invalid ? "INVALIDATED" : "",
        entry.note === undefined ? "" : `${entry.note}`,
      ]
        .filter((part) => part !== "")
        .join(" — ");
      lines.push(
        `<li${invalid ? ` data-invalid="true"` : ""}${selected ? ` data-selected="true"` : ""} data-evidence-id="${escapeHtml(entry.evidenceId)}" data-node-id="${escapeHtml(nodeId)}">${escapeHtml(text)}</li>`,
      );
    }
  }
  lines.push(`</ul>`, `</section>`);
  return lines;
}

function paneMeasurementLines(dimensions: readonly Dimension2D[]): string[] {
  const lines = [
    `<section class="pane" id="pane-measurements" aria-label="Measurements">`,
    `<h2>Measurements</h2>`,
    `<ul class="measurement-strip">`,
  ];
  if (dimensions.length === 0) {
    lines.push(`<li class="empty">No dimensions on this drawing.</li>`);
  }
  for (const dimension of dimensions) {
    lines.push(
      `<li data-dimension-id="${escapeHtml(dimension.dimensionId)}">${escapeHtml(measurementText(dimension))}</li>`,
    );
  }
  lines.push(`</ul>`, `</section>`);
  return lines;
}

/**
 * Measurement text: value + unit + σ. An UNKNOWN σ renders as "σ unknown" —
 * never as ±0 and never as a fabricated number (null is not 0).
 */
export function measurementText(dimension: Dimension2D): string {
  if (dimension.uncertainty === null) {
    return `${fmt(dimension.value)} ${dimension.unit} — σ unknown`;
  }
  return `${fmt(dimension.value)} ${dimension.unit} ±${fmt(dimension.uncertainty)} ${dimension.unit}`;
}

/* ------------------------------------------------------------------ */
/* Selection panel                                                     */
/* ------------------------------------------------------------------ */

function selectionPanelLines(bundle: SelectionBundle): string[] {
  const lines = [
    `<section class="selection-panel" id="selection-panel" aria-label="Selection" data-selected-node-id="${escapeHtml(bundle.nodeId)}">`,
    `<h2>Selection — <code>${escapeHtml(bundle.nodeId)}</code></h2>`,
    `<p class="selection-resolution" data-resolved-views="${escapeHtml(bundle.resolvedIn.join(","))}">Resolved in views: ${bundle.resolvedIn.length === 0 ? "none" : escapeHtml(bundle.resolvedIn.join(", "))}</p>`,
  ];
  if (bundle.node === undefined) {
    lines.push(`<p class="selection-missing">Node is not present in the graph snapshot of this version.</p>`);
  } else {
    lines.push(
      `<p class="selection-node" data-node-kind="${escapeHtml(bundle.node.kind)}">Node kind: ${escapeHtml(bundle.node.kind)} — epistemic status: ${escapeHtml(bundle.node.epistemicStatus)}</p>`,
    );
  }
  lines.push(`<h3>Properties</h3>`, `<ul class="selection-properties">`);
  if (bundle.properties.length === 0) {
    lines.push(`<li class="empty">no properties on this node</li>`);
  }
  for (const property of bundle.properties) {
    lines.push(`<li data-property-key="${escapeHtml(property.key)}">${escapeHtml(propertyText(property))}</li>`);
  }
  lines.push(`</ul>`, `<h3>Uncertainty (σ)</h3>`, `<ul class="selection-sigmas">`);
  if (bundle.sigmas.length === 0) {
    lines.push(`<li class="empty">no σ records concern this node</li>`);
  }
  for (const sigma of bundle.sigmas) {
    lines.push(
      `<li data-sigma-id="${escapeHtml(sigma.id)}" data-sigma-source="${escapeHtml(sigma.source)}">${escapeHtml(sigmaText(sigma))}</li>`,
    );
  }
  lines.push(`</ul>`, `<h3>2D entries</h3>`, `<ul class="selection-2d">`);
  if (bundle.drawingEntries.length === 0) {
    lines.push(`<li class="empty">no entries in the 2D view</li>`);
  }
  for (const entry of bundle.drawingEntries) {
    lines.push(
      `<li data-element-id="${escapeHtml(entry.elementId)}">${escapeHtml(entry.drawingKind)} · ${escapeHtml(entry.entryKind)} · ${escapeHtml(entry.elementId)}</li>`,
    );
  }
  lines.push(`</ul>`, `<h3>3D entries</h3>`, `<ul class="selection-3d">`);
  if (bundle.wireframeEntries.length === 0) {
    lines.push(`<li class="empty">no entries in the 3D view</li>`);
  }
  for (const entry of bundle.wireframeEntries) {
    lines.push(
      `<li data-element-id="${escapeHtml(entry.nodeId)}">wireframe · ${escapeHtml(entry.geometryId)} · ${entry.screenPoints.length} points · closed</li>`,
    );
  }
  lines.push(`</ul>`, `<h3>Evidence entries</h3>`, `<ul class="selection-evidence">`);
  if (bundle.evidenceEntries.length === 0) {
    lines.push(`<li class="empty">no evidence linked to this node</li>`);
  }
  for (const entry of bundle.evidenceEntries) {
    lines.push(
      `<li data-evidence-id="${escapeHtml(entry.evidenceId)}">${escapeHtml(entry.evidenceId)} · ${escapeHtml(entry.method)}${entry.invalidated === true ? " · INVALIDATED" : ""}</li>`,
    );
  }
  lines.push(`</ul>`, `</section>`);
  return lines;
}

function propertyText(property: WorkspaceProperty): string {
  const value =
    typeof property.value === "number" && property.unit !== undefined
      ? `${fmt(property.value)} ${property.unit}`
      : String(property.value);
  return `${property.key} = ${value} (${property.epistemicStatus})`;
}

function sigmaText(sigma: SelectionSigma): string {
  return sigma.sigma === null
    ? `${sigma.source} ${sigma.id} — σ unknown`
    : `${sigma.source} ${sigma.id} — σ ${fmt(sigma.sigma)} m`;
}

function footerLines(): string[] {
  return [
    `<footer class="workspace-footer">Server-assembled, read-only projection of the Reality Graph. The browser workspace holds no authority: it never fetches, never computes engineering truth and never alters review state. Generator ${WORKSPACE_GENERATOR_VERSION} (3D view default azimuth ${fmt((DEFAULT_VIEW.azimuthRad * 180) / Math.PI)}°, elevation ${fmt((DEFAULT_VIEW.elevationRad * 180) / Math.PI)}°).</footer>`,
  ];
}
