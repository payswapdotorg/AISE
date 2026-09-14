/**
 * AISE-024 — `renderBoqLens`: the BOQ Lens workspace document.
 *
 * ⚠⚠⚠ NO BROWSER-SIDE AUTHORITY (frozen invariant: UI state is never
 * canonical) ⚠⚠⚠
 *
 * `renderBoqLens(input)` is a PURE FUNCTION from a server-assembled
 * `BoqLensInput` to ONE complete HTML document string. It renders a view
 * selector plus ALL THREE persona views as sections, in deterministic order:
 *
 *  1. Executive — section totals, item counts, mapping health stats. NO
 *     per-cell noise: every total carries a provenance FOOTNOTE listing the
 *     contributing cell refs (and explicit exclusion notes — never silent).
 *  2. QS (quantity surveyor) — per-item rows: original text VERBATIM,
 *     normalized concept/unit marked "derived", mapping status + targets +
 *     confidence, stated numbers with their cell refs, the grounded
 *     natural-language explanation, and an explicit "interpretation
 *     uncertain" badge where confidence is uncertain.
 *  3. Contractor — tasks grouped by mapped location; items without a
 *     confirmed location are listed separately under "location unconfirmed"
 *     with the honest reason (never guessed into a group).
 *
 * R8 DISCIPLINE: every material claim carries `data-claim-id` and resolves
 * through `traceClaim` (claims.ts) to source cells / interpretation records
 * / mapping records, or to an explicit `[inference: …]` marker. Derived
 * values are ALWAYS marked "derived". The lens never parses cells, never
 * converts currencies, never fabricates σ-free numbers: rollups only sum
 * already-parsed amounts (see derive.ts). Same input → BYTE-IDENTICAL HTML
 * (no clock, no randomness, canonical number text, fixed attribute order).
 */

import {
  GRAND_TOTAL_CLAIM_ID,
  LOCATION_UNCONFIRMED_CLAIM_ID,
  explanationClaimId,
  healthClaimId,
  interpretationClaimId,
  itemClaimId,
  locationClaimId,
  mappingClaimId,
  sectionTotalClaimId,
} from "./claims";
import {
  locationGroups,
  rollupAmounts,
  sectionGroups,
  unconfirmedReason,
  type SectionGroup,
} from "./derive";
import { explainBoqItem } from "./explain";
import { escapeHtml, fmt, moneyFmt, pct } from "./format";
import { computeBoqHealth } from "./health";
import {
  LENS_INTERPRETATION_CONFIDENCES,
  LENS_INTERPRETATION_METHODS,
  LENS_MAPPING_CONFIDENCES,
  LENS_MAPPING_METHODS,
  LENS_MAPPING_STATUSES,
} from "./model";
import type { BoqLensInput, BoqLensItem } from "./model";
import { BoqLensError } from "./errors";

/** Version stamped on every BOQ Lens document (determinism pin). */
export const BOQ_LENS_GENERATOR_VERSION = "aise-boqlens/1.0";

/** Fixed stylesheet — a constant string, never derived from input data. */
const BOQ_LENS_CSS = `main.views,header,footer,.view-selector{max-width:72rem;margin:0 auto;padding:0 1rem}
.views section,.view-selector,header,footer{font:14px/1.45 system-ui,sans-serif;color:#1c1917}
.view-selector{display:flex;gap:1rem;margin:.5rem 0}
.views{display:flex;flex-direction:column;gap:1rem}
.views section{border:1px solid #d6d3d1;border-radius:6px;padding:.75rem;background:#fff}
.pane-note,.footnotes,.workspace-footer{color:#57534e;font-size:12px}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:.25rem .5rem;border-bottom:1px dotted #e7e5e4;vertical-align:top}
td.num,th.num{text-align:right}
.derived{color:#1d4ed8}
.badge-uncertain{display:inline-block;margin-left:.25rem;padding:0 .35rem;border:1px solid #b45309;border-radius:3px;background:#fffbeb;color:#9a3412;font-weight:600}
.cellref{color:#57534e;font-size:12px}
.explanation-row td{border-bottom:1px solid #e7e5e4}
.explanation{margin:.1rem 0 .25rem;color:#292524}
.footnotes,.health,.tasks{list-style:none;padding-left:0;margin:.25rem 0}
.footnotes li,.health li,.tasks li{padding:.15rem 0;border-bottom:1px dotted #e7e5e4}
.location-group{border:1px solid #e7e5e4;border-radius:6px;margin:.5rem 0;padding:.5rem}
.location-group.location-unconfirmed{border-color:#b45309;background:#fffbeb}
.excluded{color:#9a3412}
code{background:#f5f5f4;padding:0 .25rem;border-radius:3px}`;

/* ------------------------------------------------------------------ */
/* Input validation                                                    */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, what: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new BoqLensError("invalid_input", `${what} requires a non-empty string`);
  }
}

function requireOptionalString(value: unknown, what: string): void {
  if (!(value === null || value === undefined || typeof value === "string")) {
    throw new BoqLensError("invalid_input", `${what} must be a string or null`);
  }
}

function requireNumeric(value: unknown, what: string): void {
  if (!(value === null || isRecord(value))) {
    throw new BoqLensError("invalid_input", `${what} must be an object or null`);
  }
  if (isRecord(value)) {
    requireOptionalString(value.cellRef, `${what} cellRef`);
    if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
      throw new BoqLensError("invalid_input", `${what} value must be a finite number`);
    }
  }
}

function requireInterpretationRecord(value: unknown, what: string): void {
  if (!isRecord(value)) {
    throw new BoqLensError("invalid_input", `${what} must be an object`);
  }
  requireNonEmptyString(value.originalText, `${what} originalText`);
  if (!["description", "unit", "concept"].includes(value.field as string)) {
    throw new BoqLensError("invalid_input", `${what} field is not a valid interpretation field`);
  }
  if (!LENS_INTERPRETATION_CONFIDENCES.includes(value.confidence as never)) {
    throw new BoqLensError("invalid_input", `${what} confidence is not a valid confidence`);
  }
  if (!LENS_INTERPRETATION_METHODS.includes(value.method as never)) {
    throw new BoqLensError("invalid_input", `${what} method is not a valid interpretation method`);
  }
  if (!Array.isArray(value.sourceRefs) || value.sourceRefs.some((ref) => typeof ref !== "string")) {
    throw new BoqLensError("invalid_input", `${what} sourceRefs must be an array of strings`);
  }
}

function requireMappingEntry(value: unknown, what: string): void {
  if (!isRecord(value)) {
    throw new BoqLensError("invalid_input", `${what} must be an object`);
  }
  requireNonEmptyString(value.entryId, `${what} entryId`);
  if (!isRecord(value.boqItem)) {
    throw new BoqLensError("invalid_input", `${what} boqItem must be an object`);
  }
  if (typeof value.boqItem.rowNumber !== "number" || !Number.isInteger(value.boqItem.rowNumber)) {
    throw new BoqLensError("invalid_input", `${what} boqItem rowNumber must be an integer`);
  }
  requireNonEmptyString(value.boqItem.originalText, `${what} boqItem originalText`);
  requireOptionalString(value.boqItem.descriptionCellRef, `${what} boqItem descriptionCellRef`);
  requireOptionalString(value.boqItem.unitCellRef, `${what} boqItem unitCellRef`);
  if (!Array.isArray(value.targets)) {
    throw new BoqLensError("invalid_input", `${what} targets must be an array`);
  }
  for (const target of value.targets) {
    if (!isRecord(target) || typeof target.nodeId !== "string" || target.nodeId === "") {
      throw new BoqLensError("invalid_input", `${what} has a target without a nodeId`);
    }
  }
  if (!LENS_MAPPING_STATUSES.includes(value.status as never)) {
    throw new BoqLensError("invalid_input", `${what} status is not a valid mapping status`);
  }
  if (!LENS_MAPPING_CONFIDENCES.includes(value.confidence as never)) {
    throw new BoqLensError("invalid_input", `${what} confidence is not a valid mapping confidence`);
  }
  if (!LENS_MAPPING_METHODS.includes(value.method as never)) {
    throw new BoqLensError("invalid_input", `${what} method is not a valid mapping method`);
  }
  if (!isRecord(value.provenance) || typeof value.provenance.recordedAt !== "string") {
    throw new BoqLensError("invalid_input", `${what} provenance requires a recordedAt string`);
  }
}

/** The single input-validation path (mirrors AISE-021's requireInput). */
export function requireBoqLensInput(input: BoqLensInput): void {
  if (!isRecord(input)) {
    throw new BoqLensError("invalid_input", "input must be an object");
  }
  requireNonEmptyString(input.importId, "importId");
  requireNonEmptyString(input.sourceName, "sourceName");
  requireOptionalString(input.dictionaryVersion, "dictionaryVersion");
  if (
    input.mappingVersion !== null &&
    (typeof input.mappingVersion !== "number" || !Number.isInteger(input.mappingVersion) || input.mappingVersion < 1)
  ) {
    throw new BoqLensError("invalid_input", "mappingVersion must be a positive integer or null");
  }
  if (!Array.isArray(input.sourceCellRefs) || input.sourceCellRefs.some((ref) => typeof ref !== "string")) {
    throw new BoqLensError("invalid_input", "sourceCellRefs must be an array of strings");
  }
  if (!Array.isArray(input.items)) {
    throw new BoqLensError("invalid_input", "items must be an array");
  }
  const seenIds = new Set<string>();
  for (let index = 0; index < input.items.length; index += 1) {
    const item = input.items[index];
    const what = `item at index ${index}`;
    if (!isRecord(item)) {
      throw new BoqLensError("invalid_input", `${what} must be an object`);
    }
    const itemId = item.itemId;
    if (typeof itemId !== "string" || itemId.length === 0) {
      throw new BoqLensError("invalid_input", `${what} itemId requires a non-empty string`);
    }
    if (seenIds.has(itemId)) {
      throw new BoqLensError("invalid_input", `duplicate itemId '${itemId}'`);
    }
    seenIds.add(itemId);
    if (typeof item.rowNumber !== "number" || !Number.isInteger(item.rowNumber) || item.rowNumber < 1) {
      throw new BoqLensError("invalid_input", `${what} rowNumber must be a positive integer`);
    }
    requireOptionalString(item.sectionTitle, `${what} sectionTitle`);
    requireNonEmptyString(item.originalText, `${what} originalText`);
    requireOptionalString(item.descriptionCellRef, `${what} descriptionCellRef`);
    requireOptionalString(item.unitCellRef, `${what} unitCellRef`);
    requireOptionalString(item.unitText, `${what} unitText`);
    requireNonEmptyString(item.currency, `${what} currency`);
    requireNumeric(item.quantity, `${what} quantity`);
    requireNumeric(item.rate, `${what} rate`);
    requireNumeric(item.amount, `${what} amount`);
    if (item.interpretation !== undefined && item.interpretation !== null) {
      const interpretation = item.interpretation;
      if (!isRecord(interpretation)) {
        throw new BoqLensError("invalid_input", `${what} interpretation must be an object`);
      }
      for (const field of ["description", "unit"] as const) {
        if (interpretation[field] !== null && interpretation[field] !== undefined) {
          requireInterpretationRecord(interpretation[field], `${what} interpretation ${field}`);
        }
      }
    }
    if (item.mapping !== undefined && item.mapping !== null) {
      requireMappingEntry(item.mapping, `${what} mapping`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Cell-ref + fragment helpers                                         */
/* ------------------------------------------------------------------ */

function cellRefText(ref: string | null): string {
  return ref === null ? "(cell ref absent)" : `[${ref}]`;
}

function numbersCell(item: BoqLensItem): string {
  const parts: string[] = [];
  if (item.quantity !== null) {
    const unit = item.unitText === null ? "" : ` ${escapeHtml(item.unitText)}`;
    parts.push(`${fmt(item.quantity.value)}${unit} ${cellRefText(item.quantity.cellRef)}`);
  }
  if (item.rate !== null) {
    parts.push(`${escapeHtml(item.currency)} ${fmt(item.rate.value)}/unit ${cellRefText(item.rate.cellRef)}`);
  }
  if (item.amount !== null) {
    parts.push(`${escapeHtml(item.currency)} ${moneyFmt(item.amount.value)} ${cellRefText(item.amount.cellRef)}`);
  }
  return parts.length === 0 ? "no stated numbers" : parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* Executive view                                                      */
/* ------------------------------------------------------------------ */

function sectionMappingSummary(items: readonly BoqLensItem[]): string {
  const mapped = items.filter((item) => item.mapping?.status === "mapped").length;
  const ambiguous = items.filter((item) => item.mapping?.status === "ambiguous").length;
  const unmapped = items.length - mapped - ambiguous;
  return [`${mapped} mapped`, `${ambiguous} ambiguous`, `${unmapped} unmapped`].join(" / ");
}

function footnoteFor(claimId: string, label: string, rollup: ReturnType<typeof rollupAmounts>): string {
  const money = rollup.currency === null ? "(no amounts stated)" : `${rollup.currency} ${moneyFmt(rollup.total)}`;
  const refs =
    rollup.contributors
      .map((contributor) => `${contributor.cellRef === "" ? "(no cell ref)" : contributor.cellRef} (${moneyFmt(contributor.value)})`)
      .join(" + ") || "(no contributing amount cells)";
  const exclusions: string[] = [];
  if (rollup.excludedNoAmount.length > 0) {
    exclusions.push(
      `excludes ${rollup.excludedNoAmount.length} item(s) without a stated amount (never assumed zero)`,
    );
  }
  if (rollup.excludedCurrency.length > 0) {
    exclusions.push(
      `excludes ${rollup.excludedCurrency.length} item(s) stated in a different currency (never converted)`,
    );
  }
  const exclusionText = exclusions.length === 0 ? "" : ` — [inference: ${exclusions.join("; ")}]`;
  return `<li data-for="${claimId}">${escapeHtml(label)} total ${escapeHtml(money)} provenance: ${escapeHtml(refs)}${escapeHtml(exclusionText)}.</li>`;
}

function executiveLines(input: BoqLensInput): string[] {
  const sections = sectionGroups(input.items);
  const health = computeBoqHealth(input);
  const grand = rollupAmounts(input.items);
  const grandMoney = grand.currency === null ? "(no amounts stated)" : `${grand.currency} ${moneyFmt(grand.total)}`;
  const lines = [
    `<section class="view" id="view-executive" aria-label="Executive view">`,
    `<h2>Executive view — cost hierarchy &amp; mapping health</h2>`,
    `<p class="pane-note">${input.items.length} items · ${sections.length} section(s) · totals sum stated amount cells only (the lens parses nothing; currencies are never converted).</p>`,
    `<table class="exec">`,
    `<thead><tr><th>Section</th><th class="num">Items</th><th>Mapping</th><th class="num">Stated total</th></tr></thead>`,
    `<tbody>`,
  ];
  for (const section of sections) {
    const rollup = rollupAmounts(section.items);
    const money = rollup.currency === null ? "(no amounts stated)" : `${rollup.currency} ${moneyFmt(rollup.total)}`;
    const title = section.title === null ? "(no section title)" : `"${section.title}"`;
    lines.push(
      `<tr data-claim-id="${sectionTotalClaimId(section.index)}"><td>${escapeHtml(title)}</td><td class="num">${section.items.length}</td><td>${escapeHtml(sectionMappingSummary(section.items))}</td><td class="num">${escapeHtml(money)}</td></tr>`,
    );
  }
  lines.push(
    `</tbody>`,
    `<tfoot><tr data-claim-id="${GRAND_TOTAL_CLAIM_ID}" class="grand"><td><strong>Grand total</strong></td><td class="num">${input.items.length}</td><td>${escapeHtml(sectionMappingSummary(input.items))}</td><td class="num"><strong>${escapeHtml(grandMoney)}</strong></td></tr></tfoot>`,
    `</table>`,
    `<h3>Provenance footnotes (contributing source cells)</h3>`,
    `<ul class="footnotes">`,
  );
  for (const section of sections) {
    const rollup = rollupAmounts(section.items);
    const title = section.title === null ? "(no section title)" : `"${section.title}"`;
    lines.push(footnoteFor(sectionTotalClaimId(section.index), `Section ${title}`, rollup));
  }
  lines.push(footnoteFor(GRAND_TOTAL_CLAIM_ID, "Grand total", grand));
  lines.push(`</ul>`, `<h3>Mapping health</h3>`, `<ul class="health">`);
  const total = input.items.length;
  lines.push(
    `<li data-claim-id="${healthClaimId("mapped")}">Mapped: ${health.mapped} of ${total} items (${pct(health.mapped, total)}%)</li>`,
    `<li data-claim-id="${healthClaimId("ambiguous")}">Ambiguous: ${health.ambiguous} of ${total} items (${pct(health.ambiguous, total)}%)</li>`,
    `<li data-claim-id="${healthClaimId("unmapped")}">Unmapped: ${health.unmapped} of ${total} items (${pct(health.unmapped, total)}%)</li>`,
    `<li data-claim-id="${healthClaimId("concepts-resolved")}">Concepts resolved: ${health.conceptsResolved} of ${total} (${pct(health.conceptsResolved, total)}%) — derived interpretations</li>`,
    `<li data-claim-id="${healthClaimId("concepts-unresolved")}">Concepts unresolved: ${health.conceptsUnresolved} of ${total} (${pct(health.conceptsUnresolved, total)}%)</li>`,
    `<li data-claim-id="${healthClaimId("no-provenance")}">Claims without provenance: ${health.claimsWithoutProvenance} (must be zero — every rendered claim resolves to source cells, records or explicit inference)</li>`,
  );
  if (health.claimsWithoutProvenance > 0) {
    for (const defect of health.provenanceDefects) {
      lines.push(`<li class="excluded" data-defect="true">${escapeHtml(defect)}</li>`);
    }
  }
  lines.push(`</ul>`, `</section>`);
  return lines;
}

/* ------------------------------------------------------------------ */
/* QS view                                                             */
/* ------------------------------------------------------------------ */

function conceptCell(item: BoqLensItem): string {
  const interpretation = item.interpretation ?? null;
  const description = interpretation?.description ?? null;
  if (description === null) {
    return `<span class="honest">no interpretation record</span>`;
  }
  if (description.conceptCode === undefined) {
    const alternatives = description.alternatives?.length ?? 0;
    return `<span class="derived">(no concept resolved) · ${escapeHtml(description.confidence)} · ${escapeHtml(description.method)}${alternatives === 0 ? "" : ` · ${alternatives} competing recorded`}</span>${description.confidence === "uncertain" ? uncertainBadge() : ""}`;
  }
  return `<span class="derived">${escapeHtml(description.conceptCode)} (derived · ${escapeHtml(description.confidence)} · ${escapeHtml(description.method)})</span>${description.confidence === "uncertain" ? uncertainBadge() : ""}`;
}

function uncertainBadge(): string {
  return ` <span class="badge-uncertain" data-uncertain="true">interpretation uncertain</span>`;
}

function unitCell(item: BoqLensItem): string {
  const interpretation = item.interpretation ?? null;
  const unit = interpretation?.unit ?? null;
  const sourceText = item.unitText ?? "(no unit cell)";
  if (unit === null) {
    return `${escapeHtml(sourceText)} <span class="honest">(no unit interpretation)</span>`;
  }
  if (unit.unitCode === undefined) {
    return `${escapeHtml(sourceText)} <span class="derived">(no unit code resolved · ${escapeHtml(unit.confidence)} · ${escapeHtml(unit.method)})</span>${unit.confidence === "uncertain" ? uncertainBadge() : ""}`;
  }
  return `${escapeHtml(sourceText)} <span class="derived">→ ${escapeHtml(unit.unitCode)} (derived · ${escapeHtml(unit.confidence)})</span>`;
}

function mappingCell(item: BoqLensItem): string {
  const mapping = item.mapping;
  if (mapping === undefined) {
    return `<span class="honest">no mapping record</span>`;
  }
  if (mapping.status === "mapped") {
    const withPath = mapping.targets.find((target) => (target.spacePath?.length ?? 0) > 0);
    const location = withPath === undefined ? " (location not recorded)" : ` · ${escapeHtml(withPath.spacePath?.join(" / ") ?? "")}`;
    return `<span class="derived">mapped · ${mapping.targets.length} target(s) · ${escapeHtml(mapping.confidence)}${location}</span>`;
  }
  if (mapping.status === "ambiguous") {
    const alternatives = mapping.alternatives?.length ?? 0;
    return `<span class="derived">ambiguous · ${alternatives} candidate(s) · ${escapeHtml(mapping.confidence)}</span>`;
  }
  const reason = mapping.reason === undefined ? "" : ` · ${escapeHtml(mapping.reason)}`;
  return `<span class="derived">unmapped · ${escapeHtml(mapping.confidence)}${reason}</span>`;
}

function qsSectionLines(section: SectionGroup): string[] {
  const title = section.title === null ? "(no section title)" : `"${section.title}"`;
  const lines = [
    `<h3>Section ${escapeHtml(title)}</h3>`,
    `<table class="qs">`,
    `<thead><tr><th>Row</th><th>Original text (verbatim)</th><th>Concept (derived)</th><th>Unit (derived)</th><th>Mapping</th><th>Stated numbers</th></tr></thead>`,
    `<tbody>`,
  ];
  for (const item of section.items) {
    lines.push(
      `<tr data-claim-id="${itemClaimId(item.itemId)}">`,
      `<td class="num">${item.rowNumber}</td>`,
      `<td class="verbatim">${escapeHtml(item.originalText)} <span class="cellref">${escapeHtml(cellRefText(item.descriptionCellRef))}</span></td>`,
      `<td data-claim-id="${interpretationClaimId(item.itemId)}">${conceptCell(item)}</td>`,
      `<td>${unitCell(item)}</td>`,
      `<td data-claim-id="${mappingClaimId(item.itemId)}">${mappingCell(item)}</td>`,
      `<td class="num">${numbersCell(item)}</td>`,
      `</tr>`,
      `<tr class="explanation-row"><td colspan="6"><p class="explanation" data-claim-id="${explanationClaimId(item.itemId)}">${escapeHtml(explainBoqItem(item, item.interpretation ?? null, item.mapping ?? null))}</p></td></tr>`,
    );
  }
  lines.push(`</tbody>`, `</table>`);
  return lines;
}

function qsLines(input: BoqLensInput): string[] {
  const lines = [
    `<section class="view" id="view-qs" aria-label="QS detail view">`,
    `<h2>QS view — verbatim items, derived interpretations &amp; mappings</h2>`,
    `<p class="pane-note">Original wording is preserved byte-for-byte; normalized concepts/units and mapping statuses are EXPLICIT DERIVED interpretations (marked "derived") from AISE-014/017 records.</p>`,
  ];
  for (const section of sectionGroups(input.items)) {
    lines.push(...qsSectionLines(section));
  }
  lines.push(`</section>`);
  return lines;
}

/* ------------------------------------------------------------------ */
/* Contractor view                                                     */
/* ------------------------------------------------------------------ */

function taskLi(item: BoqLensItem, extra: string): string {
  const numbers: string[] = [];
  if (item.quantity !== null) {
    const unit = item.unitText === null ? "" : ` ${escapeHtml(item.unitText)}`;
    numbers.push(`${fmt(item.quantity.value)}${unit}`);
  }
  if (item.rate !== null) {
    numbers.push(`${escapeHtml(item.currency)} ${fmt(item.rate.value)}/unit`);
  }
  const numbersText = numbers.length === 0 ? "" : ` — ${numbers.join(" · ")}`;
  return `<li data-claim-id="${itemClaimId(item.itemId)}">Row ${item.rowNumber} — "${escapeHtml(item.originalText)}"${numbersText} — source ${escapeHtml(item.descriptionCellRef ?? "(no cell ref)")}${extra}</li>`;
}

function contractorLines(input: BoqLensInput): string[] {
  const lines = [
    `<section class="view" id="view-contractor" aria-label="Contractor task list view">`,
    `<h2>Contractor view — tasks by location</h2>`,
    `<p class="pane-note">Grouped by the mapped reality locations (derived mappings). Items without a confirmed location are listed under "location unconfirmed" with the honest reason — never guessed into a group.</p>`,
  ];
  for (const group of locationGroups(input.items)) {
    const claimId = group.confirmed ? locationClaimId(group.index) : LOCATION_UNCONFIRMED_CLAIM_ID;
    lines.push(
      `<section class="location-group${group.confirmed ? "" : " location-unconfirmed"}" data-claim-id="${claimId}"${group.confirmed ? "" : ' data-unconfirmed="true"'}>`,
      `<h3>${escapeHtml(group.confirmed ? group.label : "Location unconfirmed")}</h3>`,
      `<ul class="tasks">`,
    );
    for (const item of group.items) {
      const extra = group.confirmed ? "" : ` — location unconfirmed: ${escapeHtml(unconfirmedReason(item))}`;
      lines.push(taskLi(item, extra));
    }
    lines.push(`</ul>`, `</section>`);
  }
  lines.push(`</section>`);
  return lines;
}

/* ------------------------------------------------------------------ */
/* Document assembly                                                   */
/* ------------------------------------------------------------------ */

/** Render the complete BOQ Lens HTML document (deterministic, pure). */
export function renderBoqLens(input: BoqLensInput): string {
  requireBoqLensInput(input);

  const lines: string[] = [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8"/>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1"/>`,
    `<title>BOQ Lens — ${escapeHtml(input.importId)}</title>`,
    `<style>${BOQ_LENS_CSS}</style>`,
    `</head>`,
    `<body class="aise-boqlens" data-import-id="${escapeHtml(input.importId)}" data-source-name="${escapeHtml(input.sourceName)}" data-dictionary-version="${escapeHtml(input.dictionaryVersion ?? "unknown")}" data-mapping-version="${input.mappingVersion === null ? "none" : String(input.mappingVersion)}" data-generator="${BOQ_LENS_GENERATOR_VERSION}">`,
    `<header class="workspace-header">`,
    `<h1>BOQ Lens</h1>`,
    `<p class="version-pin">Source <code>${escapeHtml(input.sourceName)}</code> (import <code>${escapeHtml(input.importId)}</code>) · dictionary <code>${escapeHtml(input.dictionaryVersion ?? "unknown")}</code> · mapping revision <code>${input.mappingVersion === null ? "none" : String(input.mappingVersion)}</code>. Original source wording is preserved; normalization and mappings are explicit derived interpretations.</p>`,
    `</header>`,
    `<nav class="view-selector" aria-label="View selector">`,
    `<a href="#view-executive">Executive</a>`,
    `<a href="#view-qs">QS detail</a>`,
    `<a href="#view-contractor">Contractor tasks</a>`,
    `</nav>`,
    `<main class="views">`,
    ...executiveLines(input),
    ...qsLines(input),
    ...contractorLines(input),
    `</main>`,
    `<footer class="workspace-footer">Server-assembled, read-only projection of the imported BOQ, its derived normalization and its derived mappings. The BOQ Lens holds no authority: it never fetches, never parses cells, never converts currencies and never alters the source document, the normalized view or the mapping record. Every claim carries provenance (source cells or explicit inference markers). Generator ${BOQ_LENS_GENERATOR_VERSION}.</footer>`,
    `</body>`,
    `</html>`,
  ];
  return `${lines.join("\n")}\n`;
}
