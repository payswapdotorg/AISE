/**
 * AISE-040 — `renderAdoptionShell`: the primary-interface adoption shell
 * document.
 *
 * ⚠⚠⚠ THE SHELL IS PRESENTATION, NEVER AUTHORITY (§040) ⚠⚠⚠
 *
 * `renderAdoptionShell(input)` is a PURE FUNCTION from the
 * port-assembled `ShellInput` (ports.ts `loadShellInput`) to ONE complete
 * HTML document string:
 *
 *  - the CONTEXT HEADER — the discovered project context (org/project/
 *    name/phase/site, every value carrying its source reference as
 *    data-source-module + data-source-record attributes) or its typed
 *    omission notice;
 *  - the BREADCRUMB BAR — the session's whole walk, every crumb a stable
 *    deep link (aise-shell:// addresses, entity ids verbatim); the
 *    current crumb is marked. This is what keeps an end-to-end task
 *    AISE-centered: the context is carried through every step;
 *  - the ADDRESSED PANE — context / reality / BOQ / evidence / case,
 *    every displayed value sourced, every cross-record reference a deep
 *    link into another pane. An unresolved or port-absent pane renders
 *    its TYPED OMISSION notice — never blank space, never fake data;
 *  - the CONNECTOR PANEL — every binding's EXPLICIT external-system
 *    status (connected / unavailable / unknown-last-sync — "unknown" is
 *    first-class and NEVER rendered as connected), the SYSTEM OF RECORD
 *    label on every surface (the incumbent stays authoritative for its
 *    own data), the verbatim external record references with their
 *    return paths, and the brokered ACTION OFFERS in their tri-states:
 *    allowed → ENABLED control; refused → DISABLED + the refusal reason
 *    named (code + detail, verbatim); unavailable → DISABLED + the honest
 *    unknown reason. Every offer names the return path (which AISE
 *    context the user returns to);
 *  - the OMISSIONS LIST — every typed omission, machine-checkable
 *    (data-omission-pane + data-omission-reason);
 *  - the FOOTER — the read-only authority statement.
 *
 * The input is validated at the boundary (`validateShellInput`) — an
 * unsourced or misaligned value is a typed rejection, never rendered.
 * Two renders of the same input are BYTE-IDENTICAL: no clock, no
 * randomness, no locale-dependent formatting, fixed attribute order and a
 * fixed stylesheet constant. Navigation links carry deep-link addresses;
 * following one is the HOST's job (parse + extend session + re-render
 * through the seam) — this module never fetches and never mutates.
 */

import type { ConnectorActionOffer } from "./actions";
import { describeGrant } from "./actions";
import type {
  BoqPaneView,
  CasePaneView,
  ConnectorBindingView,
  ContextPaneView,
  EvidencePaneView,
  ExternalRecordRefView,
  RealityPaneView,
  ShellAddress,
  SourcedValue,
} from "./model";
import {
  BINDING_STATUSES,
  ShellError,
  validateShellOmission,
} from "./model";
import { formatShellAddress } from "./nav";
import type { ConnectorSurfaceView, ShellInput, ShellPaneData } from "./ports";
import { validateShellInput } from "./ports";

/** Version stamped on every shell document (determinism pin). */
export const SHELL_GENERATOR_VERSION = "aise-adoption-shell/1.0";

/** Fixed stylesheet — a constant string, never derived from input data. */
const SHELL_CSS = `main,header,footer,.breadcrumbs,.connector-panel,.omissions{max-width:64rem;margin:0 auto;padding:0 1rem}
body.aise-adoption-shell{font:14px/1.5 system-ui,sans-serif;color:#1c1917;background:#fff;margin:0}
h1{font-size:1.25rem;margin:.5rem 0}
h2{font-size:1.05rem;margin:1rem 0 .5rem}
h3{font-size:.95rem;margin:.5rem 0 .25rem}
.shell-header{border-bottom:1px solid #d6d3d1;padding-bottom:.5rem}
.context-line{color:#44403c;margin:.25rem 0}
.context-missing{color:#9a3412}
.breadcrumbs{margin:.5rem auto}
.crumb-list{list-style:none;display:flex;flex-wrap:wrap;gap:.35rem;padding-left:0;margin:.25rem 0}
.crumb-list li{border:1px solid #e7e5e4;border-radius:4px;padding:.05rem .4rem;font-size:12px}
.crumb-list li[data-current=true]{border-color:#c2410c;color:#c2410c;font-weight:600}
.crumb,.deep-link{color:#c2410c;text-decoration:underline}
.pane-stage{margin:.5rem auto}
.pane{border:1px solid #d6d3d1;border-radius:6px;padding:.75rem;background:#fff}
.pane-note,.offer-note,.sor-note,.omission-notice{color:#57534e;font-size:12px}
dl.facts{display:grid;grid-template-columns:auto 1fr;gap:.15rem .75rem;margin:.5rem 0}
dl.facts dt{color:#57534e;font-size:12px}
dl.facts dd{margin:0}
table.grid{border-collapse:collapse;width:100%;font-size:13px;margin:.5rem 0}
table.grid th,table.grid td{border:1px solid #e7e5e4;padding:.2rem .4rem;text-align:left;vertical-align:top}
table.grid th{background:#f5f5f4}
tr[data-current-node=true] td{background:#fff7ed}
.connector-panel{margin:1rem auto}
.connector-surface{border:1px solid #d6d3d1;border-radius:6px;padding:.6rem .75rem;margin:.5rem 0;background:#fafaf9}
.connector-surface[data-binding-status=unavailable]{border-style:dashed}
.binding-status{font-size:13px;margin:.15rem 0}
.binding-status[data-binding-status=unknown-last-sync]{color:#9a3412}
.binding-status[data-binding-status=unavailable]{color:#9a3412}
.external-refs,.entry-list,.omission-list{list-style:none;padding-left:0;margin:.25rem 0}
.external-refs li,.entry-list li,.omission-list li{padding:.15rem 0;border-bottom:1px dotted #e7e5e4}
.omission-list li{color:#57534e}
.action-offer{border:1px solid #e7e5e4;border-radius:4px;padding:.35rem .5rem;margin:.3rem 0;background:#fff}
.action-offer[data-disabled=true]{border-style:dashed;background:#f5f5f4}
.action-initiate{font-weight:600;color:#c2410c}
.action-offer[data-disabled=true] .action-initiate{color:#a8a29e}
a.action-initiate{text-decoration:underline}
code{background:#f5f5f4;padding:0 .25rem;border-radius:3px}
.shell-footer{margin-top:1rem;border-top:1px solid #d6d3d1;padding:.5rem 1rem;color:#57534e;font-size:12px}
`;

/* ------------------------------------------------------------------ */
/* Deterministic text helpers (local, self-contained)                   */
/* ------------------------------------------------------------------ */

/** XML text/attribute escaping (the five significant characters). */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Render one sourced value — the source-reference discipline made
 * visible: the value carries data-source-module + data-source-record
 * (which module/record it came from). An unsourced value never reaches
 * this function (the boundary validators reject it first).
 */
function renderSourced(value: SourcedValue<string> | SourcedValue<number>): string {
  return `<span class="sourced" data-source-module="${escapeHtml(value.source.module)}" data-source-record="${escapeHtml(value.source.recordId)}">${escapeHtml(String(value.value))}</span>`;
}

/** One stable deep link (typed address → canonical text). */
function deepLink(address: ShellAddress, label: string): string {
  const href = formatShellAddress(address);
  return `<a class="deep-link" data-address="${escapeHtml(href)}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

/** Deterministic breadcrumb label from the address's verbatim ids. */
export function crumbLabel(address: ShellAddress): string {
  switch (address.module) {
    case "context":
      return `context ${address.projectId}`;
    case "reality": {
      const parts = [`reality ${address.projectId}`];
      if (address.versionId !== undefined) {
        parts.push(address.versionId);
      }
      if (address.nodeId !== undefined) {
        parts.push(address.nodeId);
      }
      return parts.join(" ");
    }
    case "boq":
      return `boq ${address.importId}`;
    case "evidence":
      return `evidence ${address.evidenceId}`;
    case "case":
      return `case ${address.caseId}`;
  }
}

const PANE_TITLES: Readonly<Record<string, string>> = Object.freeze({
  context: "Project context",
  reality: "Reality snapshot",
  boq: "BOQ import",
  evidence: "Evidence record",
  case: "Engineering case",
});

/* ------------------------------------------------------------------ */
/* Input validation                                                    */
/* ------------------------------------------------------------------ */

function requireInput(input: ShellInput): ShellInput {
  if (typeof input !== "object" || input === null) {
    throw new ShellError("invalid_input", "shell input must be an object");
  }
  return validateShellInput(input);
}

/* ------------------------------------------------------------------ */
/* Document assembly                                                   */
/* ------------------------------------------------------------------ */

/** Render the complete adoption-shell HTML document (pure). */
export function renderAdoptionShell(input: ShellInput): string {
  const validated = requireInput(input);
  const current = currentAddressOf(validated);
  const currentAddressText = formatShellAddress(current);
  const lines: string[] = [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8"/>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1"/>`,
    `<title>AISE project shell — ${escapeHtml(current.projectId)}</title>`,
    `<style>${SHELL_CSS}</style>`,
    `</head>`,
    `<body class="aise-adoption-shell" data-generator="${SHELL_GENERATOR_VERSION}" data-project-id="${escapeHtml(current.projectId)}" data-current-module="${escapeHtml(current.module)}" data-current-address="${escapeHtml(currentAddressText)}">`,
    ...headerLines(validated),
    ...breadcrumbLines(validated),
    `<main class="pane-stage">`,
    ...paneLines(validated, current),
    `</main>`,
    ...connectorPanelLines(validated, current),
    ...omissionListLines(validated),
    ...footerLines(),
    `</body>`,
    `</html>`,
  ];
  return `${lines.join("\n")}\n`;
}

function currentAddressOf(input: ShellInput): ShellAddress {
  const crumbs = input.session.breadcrumbs;
  const last = crumbs[crumbs.length - 1];
  if (last === undefined) {
    throw new ShellError("session_invalid", "session requires at least one breadcrumb");
  }
  return last.address;
}

/* ------------------------------------------------------------------ */
/* Header (the discovered project context)                              */
/* ------------------------------------------------------------------ */

function headerLines(input: ShellInput): string[] {
  if (input.context === null) {
    const omission = input.omissions.find((entry) => entry.pane === "context");
    const detail = omission === undefined ? "not available" : omission.detail;
    const code = omission === undefined ? "unknown" : omission.reason;
    return [
      `<header class="shell-header">`,
      `<h1>AISE project shell</h1>`,
      `<p class="context-line context-missing" data-omission-code="${escapeHtml(code)}">Project context not available — ${escapeHtml(detail)}. No context is shown rather than guessed.</p>`,
      `</header>`,
    ];
  }
  const context = input.context;
  return [
    `<header class="shell-header" data-organization-id="${escapeHtml(context.organizationId)}" data-project-id="${escapeHtml(context.projectId)}">`,
    `<h1>AISE project shell</h1>`,
    `<p class="context-line">Organization <code>${escapeHtml(context.organizationId)}</code> — project <code>${escapeHtml(context.projectId)}</code> — ${renderSourced(context.projectName)} — phase ${renderSourced(context.phase)} — site ${renderSourced(context.site)}. Incumbent systems remain systems of record where required.</p>`,
    `</header>`,
  ];
}

/* ------------------------------------------------------------------ */
/* Breadcrumbs (the session walk, as deep links)                        */
/* ------------------------------------------------------------------ */

function breadcrumbLines(input: ShellInput): string[] {
  const lines = [
    `<nav class="breadcrumbs" aria-label="Session breadcrumbs" data-crumb-count="${String(input.session.breadcrumbs.length)}">`,
    `<ol class="crumb-list">`,
  ];
  for (const [index, crumb] of input.session.breadcrumbs.entries()) {
    const isCurrent = index === input.session.breadcrumbs.length - 1;
    lines.push(
      `<li data-crumb-index="${String(index)}"${isCurrent ? ` data-current="true"` : ""}>${deepLink(crumb.address, crumbLabel(crumb.address))}</li>`,
    );
  }
  lines.push(`</ol>`, `</nav>`);
  return lines;
}

/* ------------------------------------------------------------------ */
/* The addressed pane                                                   */
/* ------------------------------------------------------------------ */

function paneLines(input: ShellInput, current: ShellAddress): string[] {
  if (input.pane !== null) {
    const pane = input.pane;
    const addressText = formatShellAddress(current);
    return [
      `<section class="pane" id="pane-${escapeHtml(pane.module)}" data-module="${escapeHtml(pane.module)}" data-address="${escapeHtml(addressText)}" aria-label="${escapeHtml(PANE_TITLES[pane.module] ?? pane.module)}">`,
      ...paneBodyLines(pane, current),
      `</section>`,
    ];
  }
  // The addressed pane is honestly omitted: its typed omission notice.
  const omission = input.omissions.find((entry) => entry.pane === current.module);
  const reason = omission === undefined ? "unknown" : omission.reason;
  const detail = omission === undefined ? "no data resolved" : omission.detail;
  return [
    `<section class="pane pane-omitted" id="pane-${escapeHtml(current.module)}" data-module="${escapeHtml(current.module)}" data-address="${escapeHtml(formatShellAddress(current))}" aria-label="${escapeHtml(PANE_TITLES[current.module] ?? current.module)} (omitted)">`,
    `<h2>${escapeHtml(PANE_TITLES[current.module] ?? current.module)}</h2>`,
    `<p class="omission-notice" data-omission-code="${escapeHtml(reason)}">This pane is honestly omitted: ${escapeHtml(detail)} (${escapeHtml(reason)}) — no data is shown rather than guessed.</p>`,
    `</section>`,
  ];
}

function paneBodyLines(pane: ShellPaneData, current: ShellAddress): string[] {
  switch (pane.module) {
    case "context":
      return contextPaneLines(pane.view);
    case "reality":
      return realityPaneLines(pane.view, current);
    case "boq":
      return boqPaneLines(pane.view);
    case "evidence":
      return evidencePaneLines(pane.view);
    case "case":
      return casePaneLines(pane.view);
  }
}

function contextPaneLines(view: ContextPaneView): string[] {
  const lines = [
    `<h2>Project context</h2>`,
    `<p class="pane-note">The discovered project context. Every entry below is a stable deep link (entity ids verbatim — no second id scheme).</p>`,
    `<dl class="facts">`,
    `<dt>Organization</dt><dd><code>${escapeHtml(view.organizationId)}</code></dd>`,
    `<dt>Project</dt><dd><code>${escapeHtml(view.projectId)}</code></dd>`,
    `<dt>Project name</dt><dd>${renderSourced(view.projectName)}</dd>`,
    `<dt>Phase</dt><dd>${renderSourced(view.phase)}</dd>`,
    `<dt>Site</dt><dd>${renderSourced(view.site)}</dd>`,
    `</dl>`,
    `<h3>Deep-link entries</h3>`,
    `<ul class="entry-list">`,
  ];
  if (view.latestRealityVersionId === null) {
    lines.push(`<li>Reality — no version id recorded (honest unknown).</li>`);
  } else {
    lines.push(
      `<li>Reality — latest version ${deepLink(
        { module: "reality", projectId: view.projectId, versionId: view.latestRealityVersionId.value },
        view.latestRealityVersionId.value,
      )}</li>`,
    );
  }
  if (view.boqImportIds.length === 0) {
    lines.push(`<li>BOQ — no imports recorded.</li>`);
  } else {
    for (const importId of view.boqImportIds) {
      lines.push(
        `<li>BOQ import ${deepLink(
          { module: "boq", projectId: view.projectId, importId: importId.value },
          importId.value,
        )}</li>`,
      );
    }
  }
  if (view.openCaseIds.length === 0) {
    lines.push(`<li>Cases — no open cases recorded.</li>`);
  } else {
    for (const caseId of view.openCaseIds) {
      lines.push(
        `<li>Open case ${deepLink(
          { module: "case", projectId: view.projectId, caseId: caseId.value },
          caseId.value,
        )}</li>`,
      );
    }
  }
  lines.push(`</ul>`);
  return lines;
}

function realityPaneLines(view: RealityPaneView, current: ShellAddress): string[] {
  const lines = [
    `<h2>Reality — version <code>${escapeHtml(view.versionId)}</code></h2>`,
    `<p class="pane-note">One pinned Reality Graph version (the canonical engineering-model authority), created ${renderSourced(view.versionCreatedAt)}. Kinds and epistemic statuses are the canonical vocabularies, verbatim. ${String(view.nodes.length)} node${view.nodes.length === 1 ? "" : "s"}.</p>`,
    `<table class="grid reality-nodes">`,
    `<thead><tr><th>Node</th><th>Kind</th><th>Epistemic</th><th>Summary</th><th>Evidence</th></tr></thead>`,
    `<tbody>`,
  ];
  for (const node of view.nodes) {
    const evidence =
      node.evidenceIds.length === 0
        ? `<span class="pane-note">none linked</span>`
        : node.evidenceIds
            .map((entry) =>
              deepLink(
                { module: "evidence", projectId: view.projectId, evidenceId: entry.value },
                entry.value,
              ),
            )
            .join(", ");
    lines.push(
      `<tr data-node-id="${escapeHtml(node.nodeId)}"${addressedNode(current, node.nodeId) ? ` data-current-node="true"` : ""}><td><code>${escapeHtml(node.nodeId)}</code></td><td><code>${escapeHtml(node.kind)}</code></td><td><code>${escapeHtml(node.epistemicStatus)}</code></td><td>${renderSourced(node.summary)}</td><td>${evidence}</td></tr>`,
    );
  }
  lines.push(`</tbody>`, `</table>`);
  return lines;
}

/** Is this node the addressed one (presentation-only highlight)? */
function addressedNode(current: ShellAddress, nodeId: string): boolean {
  return current.module === "reality" && current.nodeId === nodeId;
}

function boqPaneLines(view: BoqPaneView): string[] {
  const lines = [
    `<h2>BOQ import — <code>${escapeHtml(view.importId)}</code></h2>`,
    `<p class="pane-note">One imported BOQ document. The incumbent BOQ system remains the system of record for its content; AISE preserves the verbatim source identity. Original wording is preserved — normalization and mapping are explicit derived interpretations elsewhere.</p>`,
    `<dl class="facts">`,
    `<dt>Format</dt><dd>${renderSourced(view.format)}</dd>`,
    `<dt>Media type</dt><dd>${renderSourced(view.mediaType)}</dd>`,
    `<dt>Byte size</dt><dd>${renderSourced(view.byteSize)}</dd>`,
    `</dl>`,
    `<table class="grid boq-sheets">`,
    `<thead><tr><th>Sheet</th><th>Rows</th><th>Sections</th></tr></thead>`,
    `<tbody>`,
  ];
  for (const sheet of view.sheets) {
    lines.push(
      `<tr><td>${renderSourced(sheet.sheetName)}</td><td>${String(sheet.rowCount)}</td><td>${String(sheet.sectionCount)}</td></tr>`,
    );
  }
  lines.push(`</tbody>`, `</table>`);
  if (view.sourceEvidenceId === null) {
    lines.push(`<p class="pane-note">Import source evidence — none registered (honest unknown).</p>`);
  } else {
    lines.push(
      `<p class="pane-note">Import source evidence — ${deepLink(
        { module: "evidence", projectId: view.projectId, evidenceId: view.sourceEvidenceId.value },
        view.sourceEvidenceId.value,
      )}</p>`,
    );
  }
  return lines;
}

function evidencePaneLines(view: EvidencePaneView): string[] {
  const lines = [
    `<h2>Evidence — <code>${escapeHtml(view.evidenceId)}</code></h2>`,
    `<p class="pane-note">One content-addressed evidence record (identity IS its content address). Raw field evidence is immutable.</p>`,
    `<dl class="facts">`,
    `<dt>Acquisition method</dt><dd>${renderSourced(view.acquisitionMethod)}</dd>`,
    `<dt>Media type</dt><dd>${renderSourced(view.mediaType)}</dd>`,
    `<dt>Byte size</dt><dd>${renderSourced(view.byteSize)}</dd>`,
    `<dt>Captured at</dt><dd>${renderSourced(view.capturedAt)}</dd>`,
    `</dl>`,
  ];
  if (view.invalidationReason === null) {
    lines.push(`<p class="pane-note" data-invalidated="false">Invalidation — none; the record is valid.</p>`);
  } else {
    lines.push(
      `<p class="pane-note" data-invalidated="true">Invalidated — ${renderSourced(view.invalidationReason)} (upstream invalidations are named per record; the record itself is never rewritten).</p>`,
    );
  }
  if (view.relatedCaseIds.length === 0) {
    lines.push(`<p class="pane-note">Related cases — none reference this evidence.</p>`);
  } else {
    lines.push(`<p class="pane-note">Related cases — ${view.relatedCaseIds
      .map((entry) =>
        deepLink({ module: "case", projectId: view.projectId, caseId: entry.value }, entry.value),
      )
      .join(", ")}</p>`);
  }
  return lines;
}

function casePaneLines(view: CasePaneView): string[] {
  const lines = [
    `<h2>Engineering case — <code>${escapeHtml(view.caseId)}</code></h2>`,
    `<p class="pane-note">One structured engineering case. Observations (facts) and hypotheses (inferences) are separate by construction — never merged.</p>`,
    `<dl class="facts">`,
    `<dt>Title</dt><dd>${renderSourced(view.title)}</dd>`,
    `<dt>Status</dt><dd>${renderSourced(view.status)}</dd>`,
    `<dt>Observations</dt><dd>${String(view.observationCount)}</dd>`,
    `<dt>Hypotheses</dt><dd>${String(view.hypothesisCount)}</dd>`,
    `<dt>Missing evidence</dt><dd>${String(view.missingEvidenceCount)}</dd>`,
    `</dl>`,
  ];
  if (view.evidenceIds.length === 0) {
    lines.push(`<p class="pane-note">Linked evidence — none recorded.</p>`);
  } else {
    lines.push(`<p class="pane-note">Linked evidence — ${view.evidenceIds
      .map((entry) =>
        deepLink(
          { module: "evidence", projectId: view.projectId, evidenceId: entry.value },
          entry.value,
        ),
      )
      .join(", ")}</p>`);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* The connector panel (external-system status + action offers)         */
/* ------------------------------------------------------------------ */

function connectorPanelLines(input: ShellInput, current: ShellAddress): string[] {
  const lines = [
    `<section class="connector-panel" id="connector-panel" aria-label="Connector surfaces" data-surface-count="${String(input.connectors.length)}">`,
    `<h2>Connector surfaces — incumbent systems</h2>`,
    `<p class="pane-note">Every surface states its binding honestly (${BINDING_STATUSES.join(" / ")} — "unknown" is first-class, never rendered as connected). The incumbent system is always the SYSTEM OF RECORD for its own data; AISE holds explicit references and synchronization provenance. Actions are offered only on an explicit ALLOWED authorization decision.</p>`,
  ];
  if (input.omissions.some((entry) => entry.pane === "connectors")) {
    lines.push(
      `<p class="omission-notice" data-omission-code="port_absent">Connector surfaces honestly omitted — the connector-status port is not available in this deployment. No status is shown rather than guessed.</p>`,
    );
  }
  for (const surface of input.connectors) {
    lines.push(...connectorSurfaceLines(surface, current));
  }
  lines.push(`</section>`);
  return lines;
}

function connectorSurfaceLines(
  surface: ConnectorSurfaceView,
  current: ShellAddress,
): string[] {
  const binding = surface.binding;
  const returnTo = formatShellAddress(current);
  const lines = [
    `<article class="connector-surface" data-binding-id="${escapeHtml(binding.bindingId)}" data-binding-status="${escapeHtml(binding.status)}">`,
    `<h3>${renderSourced(binding.displayName)}</h3>`,
    `<p class="binding-identity"><code>${escapeHtml(binding.systemInstanceId)}</code> · <code>${escapeHtml(binding.systemClass)}</code> · capabilities: ${binding.capabilities.length === 0 ? "none declared" : escapeHtml(binding.capabilities.join(", "))}</p>`,
    ...bindingStatusLines(binding),
    `<p class="sor-note"><strong>System of record</strong> — ${escapeHtml(binding.systemInstanceId)} remains authoritative for its own data; AISE stores explicit references, mappings and synchronization provenance.</p>`,
  ];
  if (binding.externalRecordRefs.length === 0) {
    lines.push(`<p class="pane-note">External record references — none for this binding.</p>`);
  } else {
    lines.push(`<ul class="external-refs">`);
    for (const ref of binding.externalRecordRefs) {
      lines.push(...externalRefLines(ref, returnTo));
    }
    lines.push(`</ul>`);
  }
  if (surface.offers.length === 0) {
    lines.push(`<p class="pane-note">Connector actions — none offered by this binding.</p>`);
  } else {
    lines.push(`<div class="action-offers">`);
    for (const offer of surface.offers) {
      lines.push(...offerLines(offer, returnTo));
    }
    lines.push(`</div>`);
  }
  lines.push(`</article>`);
  return lines;
}

function bindingStatusLines(binding: ConnectorBindingView): string[] {
  switch (binding.status) {
    case "connected":
      return [
        `<p class="binding-status" data-binding-status="connected">Status: connected — last sync ${
          binding.lastSyncAt === null
            ? `<span class="pane-note">no sync recorded (unknown)</span>`
            : renderSourced(binding.lastSyncAt)
        }. ${renderSourced(binding.statusDetail)}</p>`,
      ];
    case "unavailable":
      return [
        `<p class="binding-status" data-binding-status="unavailable">Status: unavailable — ${renderSourced(binding.statusDetail)}.</p>`,
      ];
    case "unknown-last-sync":
      return [
        `<p class="binding-status" data-binding-status="unknown-last-sync">Status: unknown — last sync unknown (no sync result recorded). ${renderSourced(binding.statusDetail)}</p>`,
      ];
  }
}

function externalRefLines(ref: ExternalRecordRefView, returnTo: string): string[] {
  const link =
    ref.externalUrl === null
      ? `<span class="external-link" data-unavailable="true">incumbent link not provided</span>`
      : `<a class="external-link" href="${escapeHtml(ref.externalUrl)}">open in incumbent system</a>`;
  const revision = ref.revision === null ? "" : ` rev <code>${escapeHtml(ref.revision)}</code>`;
  return [
    `<li class="external-ref" data-external-record-id="${escapeHtml(ref.sourceRecordId)}" data-return-to="${escapeHtml(returnTo)}">`,
    `${renderSourced(ref.label)} — record <code>${escapeHtml(ref.sourceRecordId)}</code>${revision} in <code>${escapeHtml(ref.systemInstanceId)}</code> (${escapeHtml(ref.systemClass)}) — ${link} — returns to AISE at <code>${escapeHtml(returnTo)}</code>`,
    `</li>`,
  ];
}

function offerLines(offer: ConnectorActionOffer, returnTo: string): string[] {
  const action = offer.action;
  const descriptor = action.descriptor;
  const label = renderSourced(descriptor.label);
  const head = `<div class="action-offer" data-action-id="${escapeHtml(descriptor.actionId)}" data-action-kind="${escapeHtml(descriptor.kind)}" data-binding-id="${escapeHtml(action.bindingId)}" data-return-to="${escapeHtml(returnTo)}"`;
  if (offer.state.kind === "allowed") {
    const initiate =
      descriptor.initiateUrl === null
        ? `<span class="action-initiate" data-initiate="${escapeHtml(descriptor.actionId)}">${label}</span>`
        : `<a class="action-initiate" href="${escapeHtml(descriptor.initiateUrl)}" data-return-to="${escapeHtml(returnTo)}">${label}</a>`;
    return [
      `${head} data-offer-state="allowed" data-enabled="true">`,
      initiate,
      `<span class="offer-note">Enabled — ${escapeHtml(describeGrant(offer.state.grant))} — returns to AISE at <code>${escapeHtml(returnTo)}</code>.</span>`,
      `</div>`,
    ];
  }
  if (offer.state.kind === "refused") {
    const refusal = offer.state.refusal;
    return [
      `${head} data-offer-state="refused" data-disabled="true">`,
      `<span class="action-initiate" aria-disabled="true">${label}</span>`,
      `<span class="offer-note">DISABLED — authorization refused: <code>${escapeHtml(refusal.code)}</code> — ${escapeHtml(refusal.detail)} — returns to AISE at <code>${escapeHtml(returnTo)}</code>.</span>`,
      `</div>`,
    ];
  }
  return [
    `${head} data-offer-state="unavailable" data-disabled="true">`,
    `<span class="action-initiate" aria-disabled="true">${label}</span>`,
    `<span class="offer-note">DISABLED — authorization unavailable (<code>${escapeHtml(offer.state.reason)}</code>): the authorization decision is not known here — never silently enabled. Returns to AISE at <code>${escapeHtml(returnTo)}</code>.</span>`,
    `</div>`,
  ];
}

/* ------------------------------------------------------------------ */
/* The typed omission list                                              */
/* ------------------------------------------------------------------ */

function omissionListLines(input: ShellInput): string[] {
  const lines = [
    `<section class="omissions" id="omissions" aria-label="Honest omissions" data-omission-count="${String(input.omissions.length)}">`,
    `<h2>Omissions</h2>`,
  ];
  if (input.omissions.length === 0) {
    lines.push(`<p class="pane-note">No omissions — every surface's data port is available and resolved.</p>`);
  } else {
    lines.push(`<ul class="omission-list">`);
    for (const omission of input.omissions) {
      validateShellOmission(omission);
      lines.push(
        `<li class="omission" data-omission-pane="${escapeHtml(omission.pane)}" data-omission-reason="${escapeHtml(omission.reason)}">${escapeHtml(omission.pane)}: ${escapeHtml(omission.detail)} (<code>${escapeHtml(omission.reason)}</code>) — no data is shown rather than guessed.</li>`,
      );
    }
    lines.push(`</ul>`);
  }
  lines.push(`</section>`);
  return lines;
}

/* ------------------------------------------------------------------ */
/* Footer (the authority statement)                                    */
/* ------------------------------------------------------------------ */

function footerLines(): string[] {
  return [
    `<footer class="shell-footer">Read-only adoption shell — AISE is the primary engineering interface and context/action layer for the targeted workflow, while incumbent systems remain connected systems of record where required. The shell never fetches, never mutates and holds no authority: connector actions are offered only on explicit authorization decisions (AISE-036 identity semantics — principal/scope/target), refusals are named and never hidden, external record identities are verbatim references, and unknown states are first-class. Generator ${SHELL_GENERATOR_VERSION}.</footer>`,
  ];
}
