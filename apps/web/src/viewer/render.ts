/**
 * AISE-027 — `renderInterventionViewer`: the synchronized intervention
 * viewer document.
 *
 * ⚠⚠⚠ NO BROWSER-SIDE AUTHORITY (frozen invariant, architecture-lock
 * "Authority" #8) ⚠⚠⚠
 *
 * `renderInterventionViewer(input)` is a PURE FUNCTION from a
 * server-assembled `ViewerInput` to ONE complete HTML document string:
 *
 *  - the 3D pane — the deterministic axonometric wireframe of the layer's
 *    proposed boundary polygons (projection.ts — the AISE-021 documented
 *    formulas; an engineering wireframe, NOT a 3D engine);
 *  - the 2D pane — the plan (XY) projection of the same polygons;
 *  - the BOQ pane — the layer's proposed property assertions, verbatim
 *    (paneboq.ts; quantity/cost impact computation is AISE-028's scope);
 *  - the layer-navigation strip — Previous / Next plus one entry per layer,
 *    every control carrying the TARGET layer's stable `stateId` and index
 *    (synchronized stable ids; boundary controls render disabled);
 *  - the step strip — the steps applied to the current layer, verbatim;
 *  - the header/footer — scenario identity, pinned baseline, the recorded
 *    approval reference (VERBATIM, never interpreted) and the read-only
 *    authority statement.
 *
 * SYNCHRONIZATION (§027 acceptance): ALL THREE panes are projected from
 * the ONE state resolved by `frameOf` — each pane element carries the SAME
 * `data-state-id`, `data-scenario-id`, `data-state-index`,
 * `data-baseline-version-id` and `data-applied-step-ids` (the layer's full
 * identity: state, scenario and step identity). Desynchronization is
 * unrepresentable: there is exactly one state object per render.
 *
 * NAVIGATION CHANGES PRESENTATION ONLY: the Previous/Next controls are
 * plain links the SHELL re-renders with (`?state=N` — server-side
 * re-render through the read-only seam); this module never mutates
 * anything. Two renders of the same input are BYTE-IDENTICAL (no clock,
 * no randomness, canonical number text, fixed attribute order). The
 * current layer defaults to 0 (the pure baseline overlay) when
 * `stateIndex` is absent.
 */

import { ViewerError } from "./errors";
import { escapeHtml, fmt } from "./format";
import type {
  BoqProjection,
  GeometryRecord,
  PaneProjection,
  ViewerFrame,
  ViewerInput,
  ViewerInterventionState,
  ViewerScenario,
} from "./model";
import { projectStateBoq, renderBoqTable } from "./paneboq";
import { DEFAULT_VIEW, projectPane } from "./projection";
import { emptyPaneLines, omissionLines, renderPaneSvg } from "./svg";
import { frameOf, stateAt, stateIdsOf, verifyStateAlignment } from "./sync";

/** Version stamped on every viewer document (determinism pin). */
export const VIEWER_GENERATOR_VERSION = "aise-intervention-viewer/1.0";

/** Fixed stylesheet — a constant string, never derived from input data. */
const VIEWER_CSS = `main.panes,header,footer,.layer-nav,.step-strip{max-width:64rem;margin:0 auto;padding:0 1rem}
.panes{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.pane,.layer-nav,.step-strip,header,footer{font:14px/1.45 system-ui,sans-serif;color:#1c1917}
.pane{border:1px solid #d6d3d1;border-radius:6px;padding:.75rem;background:#fff}
.pane svg{width:100%;height:auto;display:block}
.pane-note,.scenario-pin,.viewer-footer{color:#57534e;font-size:12px}
.pane-empty{color:#57534e;font-style:italic}
.omissions,.layer-strip,.step-list,.boq-removals{list-style:none;padding-left:0;margin:.25rem 0}
.omissions li,.boq-removals li{padding:.15rem 0;border-bottom:1px dotted #e7e5e4;color:#57534e}
.boq-removals li{color:#9a3412}
.layer-nav{display:flex;gap:1rem;align-items:center;flex-wrap:wrap;margin:.5rem auto}
.nav-link{border:1px solid #d6d3d1;border-radius:6px;padding:.25rem .6rem;text-decoration:none;color:#1c1917}
.nav-link[data-disabled=true]{color:#a8a29e;border-style:dashed;cursor:default}
.layer-strip{display:flex;gap:.5rem;flex-wrap:wrap}
.layer-strip li{border:1px solid #e7e5e4;border-radius:4px;padding:.1rem .4rem;font-size:12px;color:#57534e}
.layer-strip li[data-current=true]{border-color:#c2410c;color:#c2410c;font-weight:600}
.step-list li{padding:.15rem 0;border-bottom:1px dotted #e7e5e4}
table.boq{border-collapse:collapse;width:100%;font-size:13px}
table.boq th,table.boq td{border:1px solid #e7e5e4;padding:.2rem .4rem;text-align:left;vertical-align:top}
table.boq th{background:#f5f5f4}
table.boq tr[data-selected=true] td{background:#fff7ed}
.approval-banner{border:1px solid #d97706;background:#fffbeb;border-radius:6px;padding:.5rem .75rem;margin:.5rem 1rem}
code{background:#f5f5f4;padding:0 .25rem;border-radius:3px}
`;

/* ------------------------------------------------------------------ */
/* Input validation                                                    */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireInput(input: ViewerInput): void {
  const scenario = input.scenario;
  if (!isRecord(scenario) || typeof scenario.scenarioId !== "string" || scenario.scenarioId.length === 0) {
    throw new ViewerError("invalid_input", "scenario requires a non-empty scenarioId");
  }
  if (typeof scenario.baselineVersionId !== "string" || scenario.baselineVersionId.length === 0) {
    throw new ViewerError("invalid_input", "scenario requires a non-empty baselineVersionId");
  }
  if (!Array.isArray(scenario.steps) || !Array.isArray(scenario.states)) {
    throw new ViewerError("invalid_input", "scenario steps/states must be arrays");
  }
  if (scenario.states.length === 0) {
    throw new ViewerError("invalid_input", "scenario carries no states");
  }
  if (!Array.isArray(input.geometries)) {
    throw new ViewerError("invalid_input", "geometries must be an array");
  }
  if (input.stateIndex !== undefined && (!Number.isInteger(input.stateIndex) || input.stateIndex < 0)) {
    throw new ViewerError("invalid_input", "stateIndex must be a non-negative integer");
  }
  if (input.selectedNodeId !== undefined && (typeof input.selectedNodeId !== "string" || input.selectedNodeId.length === 0)) {
    throw new ViewerError("invalid_input", "selectedNodeId must be a non-empty string");
  }
  if (input.view !== undefined) {
    if (
      !isRecord(input.view) ||
      !Number.isFinite(input.view.azimuthRad) ||
      !Number.isFinite(input.view.elevationRad)
    ) {
      throw new ViewerError("invalid_input", "view requires finite azimuthRad/elevationRad");
    }
  }
}

/* ------------------------------------------------------------------ */
/* Document assembly                                                   */
/* ------------------------------------------------------------------ */

/** The layer identity attributes every pane carries (the §027 anchor). */
function paneIdentityAttributes(frame: ViewerFrame): string {
  return [
    `data-scenario-id="${escapeHtml(frame.scenarioId)}"`,
    `data-baseline-version-id="${escapeHtml(frame.baselineVersionId)}"`,
    `data-state-id="${escapeHtml(frame.stateId)}"`,
    `data-state-index="${String(frame.stateIndex)}"`,
    `data-applied-step-ids="${escapeHtml(frame.appliedStepIds.join(","))}"`,
  ].join(" ");
}

/** Render the complete synchronized viewer HTML document (pure). */
export function renderInterventionViewer(input: ViewerInput): string {
  requireInput(input);
  const scenario: ViewerScenario = input.scenario;
  const stateIndex = input.stateIndex ?? 0;
  const state: ViewerInterventionState = stateAt(scenario, stateIndex);
  verifyStateAlignment(scenario, state); // defense in depth — never repairs
  const frame = frameOf(scenario, stateIndex);
  const view = input.view ?? DEFAULT_VIEW;

  const geometries: readonly GeometryRecord[] = input.geometries;
  const projection3d: PaneProjection = projectPane(state, geometries, {
    mode: "axonometric",
    view,
  });
  const projection2d: PaneProjection = projectPane(state, geometries, { mode: "plan" });
  const boq: BoqProjection = projectStateBoq(state);

  const lines: string[] = [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8"/>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1"/>`,
    `<title>AISE intervention viewer — ${escapeHtml(scenario.scenarioId)}</title>`,
    `<style>${VIEWER_CSS}</style>`,
    `</head>`,
    `<body class="aise-intervention-viewer" data-generator="${VIEWER_GENERATOR_VERSION}" data-scenario-id="${escapeHtml(frame.scenarioId)}" data-project-id="${escapeHtml(frame.projectId)}" data-baseline-version-id="${escapeHtml(frame.baselineVersionId)}" data-state-id="${escapeHtml(frame.stateId)}" data-state-index="${String(frame.stateIndex)}" data-state-count="${String(frame.stateCount)}" data-applied-step-ids="${escapeHtml(frame.appliedStepIds.join(","))}" data-scenario-status="${escapeHtml(scenario.status)}">`,
    ...headerLines(scenario, frame),
    ...approvalReferenceLines(scenario),
    ...navigationLines(scenario, frame),
    `<main class="panes">`,
    ...pane3dLines(projection3d, view, input.selectedNodeId, frame),
    ...pane2dLines(projection2d, input.selectedNodeId, frame),
    ...paneBoqLines(boq, input.selectedNodeId, frame),
    `</main>`,
    ...stepStripLines(scenario, frame),
    ...footerLines(),
    `</body>`,
    `</html>`,
  ];
  return `${lines.join("\n")}\n`;
}

function headerLines(scenario: ViewerScenario, frame: ViewerFrame): string[] {
  return [
    `<header class="viewer-header">`,
    `<h1>AISE intervention viewer</h1>`,
    `<p class="scenario-pin">Scenario <code>${escapeHtml(scenario.scenarioId)}</code> — ${escapeHtml(scenario.title)} — status <code>${escapeHtml(scenario.status)}</code> — pinned to baseline <code>${escapeHtml(scenario.baselineVersionId)}</code> — layer ${String(frame.stateIndex)} of ${String(frame.stateCount - 1)} (state <code>${escapeHtml(frame.stateId)}</code>). All panes are PROPOSED content.</p>`,
    `</header>`,
  ];
}

/* ------------------------------------------------------------------ */
/* Approval reference (VERBATIM record — never interpreted here)       */
/* ------------------------------------------------------------------ */

function approvalReferenceLines(scenario: ViewerScenario): string[] {
  const reference = scenario.approvalReference;
  if (reference === undefined) {
    return [];
  }
  return [
    `<section class="approval-banner" data-approval-case-id="${escapeHtml(reference.caseId)}" aria-label="Recorded approval reference">`,
    `<p><strong>Approval reference recorded</strong> — case <code>${escapeHtml(reference.caseId)}</code>, decision <code>${escapeHtml(reference.reviewDecision)}</code>, reviewed at <code>${escapeHtml(reference.reviewedAt)}</code> (recorded verbatim; interpreted by the Engineering Case domain, not here).</p>`,
    `</section>`,
  ];
}

/* ------------------------------------------------------------------ */
/* Layer navigation (synchronized stable ids; clamped boundaries)      */
/* ------------------------------------------------------------------ */

function navigationLines(scenario: ViewerScenario, frame: ViewerFrame): string[] {
  const lines = [
    `<nav class="layer-nav" aria-label="Layer navigation" data-state-count="${String(frame.stateCount)}" data-current-state-index="${String(frame.stateIndex)}" data-current-state-id="${escapeHtml(frame.stateId)}">`,
    ...previousControlLines(scenario, frame),
    `<ol class="layer-strip">`,
  ];
  for (const [index, stateId] of stateIdsOf(scenario).entries()) {
    const current = index === frame.stateIndex;
    lines.push(
      `<li data-state-index="${String(index)}" data-state-id="${escapeHtml(stateId)}"${current ? ` data-current="true"` : ""}>Layer ${String(index)} — <code>${escapeHtml(stateId)}</code></li>`,
    );
  }
  lines.push(`</ol>`, ...nextControlLines(scenario, frame), `</nav>`);
  return lines;
}

function previousControlLines(scenario: ViewerScenario, frame: ViewerFrame): string[] {
  if (frame.atFirst) {
    return [
      `<span class="nav-link" data-nav-direction="previous" data-disabled="true" aria-disabled="true">← Previous — at first layer</span>`,
    ];
  }
  const target = scenario.states[frame.stateIndex - 1];
  if (target === undefined) {
    throw new ViewerError("state_sequence_mismatch", "layer strip is inconsistent");
  }
  return [
    `<a class="nav-link" data-nav-direction="previous" data-target-state-index="${String(target.stateIndex)}" data-target-state-id="${escapeHtml(target.stateId)}" href="?state=${String(target.stateIndex)}">← Previous — layer ${String(target.stateIndex)}</a>`,
  ];
}

function nextControlLines(scenario: ViewerScenario, frame: ViewerFrame): string[] {
  if (frame.atLast) {
    return [
      `<span class="nav-link" data-nav-direction="next" data-disabled="true" aria-disabled="true">Next — at last layer →</span>`,
    ];
  }
  const target = scenario.states[frame.stateIndex + 1];
  if (target === undefined) {
    throw new ViewerError("state_sequence_mismatch", "layer strip is inconsistent");
  }
  return [
    `<a class="nav-link" data-nav-direction="next" data-target-state-index="${String(target.stateIndex)}" data-target-state-id="${escapeHtml(target.stateId)}" href="?state=${String(target.stateIndex)}">Next — layer ${String(target.stateIndex)} →</a>`,
  ];
}

/* ------------------------------------------------------------------ */
/* Panes                                                               */
/* ------------------------------------------------------------------ */

function pane3dLines(
  projection: PaneProjection,
  view: { azimuthRad: number; elevationRad: number },
  selectedNodeId: string | undefined,
  frame: ViewerFrame,
): string[] {
  const azimuthDeg = fmt((view.azimuthRad * 180) / Math.PI);
  const elevationDeg = fmt((view.elevationRad * 180) / Math.PI);
  const lines = [
    `<section class="pane" id="pane-3d" aria-label="3D wireframe of the proposed state" ${paneIdentityAttributes(frame)}>`,
    `<h2>3D — proposed state wireframe</h2>`,
    `<p class="pane-note">Orthographic axonometric wireframe of the layer's plane boundary polygons (azimuth ${azimuthDeg}°, elevation ${elevationDeg}°). PROPOSED geometry only — full 3D rendering is out of scope; this is an engineering wireframe.</p>`,
  ];
  if (projection.shapes.length === 0) {
    lines.push(...emptyPaneLines("projectable geometry"));
  } else {
    lines.push(renderPaneSvg(projection, selectedNodeId).trimEnd());
  }
  lines.push(...omissionLines(projection), `</section>`);
  return lines;
}

function pane2dLines(
  projection: PaneProjection,
  selectedNodeId: string | undefined,
  frame: ViewerFrame,
): string[] {
  const lines = [
    `<section class="pane" id="pane-2d" aria-label="2D plan of the proposed state" ${paneIdentityAttributes(frame)}>`,
    `<h2>2D — proposed state plan</h2>`,
    `<p class="pane-note">Plan (XY) projection of the layer's boundary polygons — the height axis is dropped by the plan projection. PROPOSED geometry only; removed nodes are absent from this layer (see the BOQ pane's proposed removals).</p>`,
  ];
  if (projection.shapes.length === 0) {
    lines.push(...emptyPaneLines("projectable geometry"));
  } else {
    lines.push(renderPaneSvg(projection, selectedNodeId).trimEnd());
  }
  lines.push(...omissionLines(projection), `</section>`);
  return lines;
}

function paneBoqLines(
  boq: BoqProjection,
  selectedNodeId: string | undefined,
  frame: ViewerFrame,
): string[] {
  const lines = [
    `<section class="pane" id="pane-boq" aria-label="BOQ of the proposed state" ${paneIdentityAttributes(frame)}>`,
    `<h2>BOQ — proposed quantities</h2>`,
    `<p class="pane-note">The layer's PROPOSED property assertions, verbatim (every value PROPOSED — the scenario's epistemic seal). Quantity and cost impact computation is out of scope here (AISE-028); no number is derived, converted or summed by this viewer.</p>`,
    ...renderBoqTable(boq, selectedNodeId),
    `</section>`,
  ];
  return lines;
}

/* ------------------------------------------------------------------ */
/* Step strip (the layer's step identity, verbatim)                    */
/* ------------------------------------------------------------------ */

function stepStripLines(scenario: ViewerScenario, frame: ViewerFrame): string[] {
  const lines = [
    `<section class="step-strip" id="step-strip" aria-label="Applied steps" data-state-id="${escapeHtml(frame.stateId)}" data-scenario-id="${escapeHtml(frame.scenarioId)}" data-applied-step-ids="${escapeHtml(frame.appliedStepIds.join(","))}">`,
    `<h2>Applied steps (1..${String(frame.stateIndex)})</h2>`,
    `<ol class="step-list">`,
  ];
  if (frame.stateIndex === 0) {
    lines.push(
      `<li class="empty">No steps applied — layer 0 is the pure baseline overlay (all content PROPOSED, origin baseline).</li>`,
    );
  } else {
    for (const step of scenario.steps.slice(0, frame.stateIndex)) {
      const rationale = step.rationale === undefined ? "" : ` — ${step.rationale}`;
      lines.push(
        `<li data-step-id="${escapeHtml(step.stepId)}" data-step-kind="${escapeHtml(step.kind)}" data-step-target="${escapeHtml(step.targetNodeId)}">${escapeHtml(step.stepId)} · ${escapeHtml(step.kind)} · ${escapeHtml(step.targetNodeId)}${escapeHtml(rationale)}</li>`,
      );
    }
  }
  lines.push(`</ol>`, `</section>`);
  return lines;
}

function footerLines(): string[] {
  return [
    `<footer class="viewer-footer">Read-only, synchronized projection of ONE proposed intervention state — the 3D, 2D and BOQ panes are driven by the same state id. The viewer holds no authority: it never fetches, never materializes states, never records steps and never mutates the Reality Graph or the scenario record. States are PROPOSED until execution evidence is recorded. Generator ${VIEWER_GENERATOR_VERSION}.</footer>`,
  ];
}
