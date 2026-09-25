/**
 * HFX-303 — the GENERATED-VISUAL PANE renderer.
 *
 * Renders the generated-visual pane from a `GeneratedVisualArtifact`
 * (the wire mirror of the visual lane's `VisualArtifact`):
 *
 *  - the ALWAYS-PRESENT label block: "GENERATED — HYPOTHETICAL VISUAL,
 *    NOT ENGINEERING GEOMETRY" (the work order's labeling criterion —
 *    the banner is part of the render contract, never conditional);
 *  - the artifact's SVG content, embedded verbatim (the lane's
 *    deterministic server-rendered string);
 *  - the per-region labels from the artifact's label manifest — every
 *    region that exceeds deterministic geometry is labeled;
 *  - the provenance block: the exact state revision (state id, layer,
 *    applied operation ids, content digest), the pinned version and the
 *    provider id/version/descriptor digest;
 *  - the canonical comparison summary (counts only — no numeric
 *    engineering claims are ever derived here).
 *
 * DETERMINISTIC SERVER-RENDERED STRING (the viewer convention): pure
 * string rendering, fixed attribute order, canonical numbers — no DOM,
 * no events, no fetch, no browser APIs, no client state, no writes. The
 * pane NEVER mutates viewer state and never reaches the canonical panes.
 */

import { escapeHtml, fmt } from "../format";
import type { ViewerFrame } from "../model";
import type { GeneratedVisualArtifact } from "./model";

/** The always-present generated/hypothetical banner (verbatim constant). */
export const GENERATED_VISUAL_BANNER =
  "GENERATED — HYPOTHETICAL VISUAL, NOT ENGINEERING GEOMETRY" as const;

/** The pane's note (the lane statement, in viewer wording). */
export const GENERATED_VISUAL_NOTE =
  "A visual-generation provider rendered this hypothesis view of the proposed state for inspection/presentation. It is presentation only: it can never change quantities, validation or canonical Solution Graph state. Regions beyond deterministic geometry are labeled below; the canonical 3D/2D/BOQ panes remain the engineering views." as const;

/**
 * Renders the generated-visual pane lines (pure). The pane carries the
 * SAME layer identity attributes as the canonical panes (the §027
 * synchronization anchor) plus the artifact's own provenance pins.
 */
export function generatedPaneLines(
  artifact: GeneratedVisualArtifact,
  frame: ViewerFrame,
): string[] {
  const provenance = artifact.provenance;
  const lines: string[] = [
    `<section class="pane" id="pane-generated" aria-label="Generated hypothetical visual (not engineering geometry)" data-scenario-id="${escapeHtml(frame.scenarioId)}" data-baseline-version-id="${escapeHtml(frame.baselineVersionId)}" data-state-id="${escapeHtml(frame.stateId)}" data-state-index="${String(frame.stateIndex)}" data-applied-step-ids="${escapeHtml(frame.appliedStepIds.join(","))}" data-artifact-id="${escapeHtml(artifact.artifactId)}" data-visual-class="${escapeHtml(artifact.visualClass)}" data-provider-id="${escapeHtml(provenance.provider.providerId)}" data-provider-version="${escapeHtml(provenance.provider.technologyVersion)}" data-provider-descriptor-digest="${escapeHtml(provenance.provider.descriptorDigest)}">`,
    `<h2>Generated visual — hypothesis rendering</h2>`,
    `<p style="border:1px dashed #92400e;background:#fffbeb;border-radius:6px;padding:.35rem .6rem;color:#92400e;font-weight:600" data-generated-banner="true">${GENERATED_VISUAL_BANNER}</p>`,
    `<p class="pane-note">${GENERATED_VISUAL_NOTE}</p>`,
  ];

  // The rendered content, embedded verbatim (the lane's deterministic
  // SVG string; trimmed of the trailing newline for inline embedding).
  lines.push(artifact.content.svg.trimEnd());

  // The generated/hypothetical region labels (the manifest is the source).
  if (artifact.labels.length === 0) {
    lines.push(
      `<p class="pane-note" data-generated-labels="none">No labeled regions beyond deterministic geometry in this visual.</p>`,
    );
  } else {
    lines.push(`<ul class="omissions" data-generated-labels="true" aria-label="Generated region labels">`);
    for (const label of artifact.labels) {
      lines.push(
        `<li data-region-id="${escapeHtml(label.regionId)}" data-region-kind="${escapeHtml(label.regionKind)}" data-basis="${escapeHtml(label.basis)}">${escapeHtml(label.label)} — <span class="pane-note">${escapeHtml(label.detail)}</span></li>`,
      );
    }
    lines.push(`</ul>`);
  }

  // The provenance block: the exact state revision + provider profile.
  lines.push(
    `<p class="pane-note" data-generated-provenance="true">Rendered by provider <code>${escapeHtml(provenance.provider.providerId)}</code> <code>${escapeHtml(provenance.provider.technologyVersion)}</code> (descriptor digest <code>${escapeHtml(provenance.provider.descriptorDigest)}</code>) for state <code>${escapeHtml(provenance.stateId)}</code> — layer ${String(provenance.stateIndex)}, applied operations <code>${escapeHtml(provenance.appliedOperationIds.join(","))}</code>${provenance.stateContentDigest === undefined ? "" : ` (content digest <code>${escapeHtml(provenance.stateContentDigest)}</code>)`}, pinned to <code>${escapeHtml(provenance.versionRef)}</code> of <code>${escapeHtml(provenance.solutionId)}</code>. ${escapeHtml(provenance.laneStatement)}.</p>`,
    `<p class="pane-note" data-generated-comparison="true">Canonical comparison: ${String(artifact.canonicalComparison.renderedCanonicalShapeCount)} of ${String(artifact.canonicalComparison.canonicalShapeCount)} canonical shapes drawn; ${String(artifact.canonicalComparison.excessRegionCount)} labeled region(s) beyond deterministic geometry. ${escapeHtml(artifact.canonicalComparison.statement)}.</p>`,
    `</section>`,
  );
  return lines;
}

/** The pane's fixed id (stable selector for tests + shells). */
export const GENERATED_PANE_ID = "pane-generated" as const;

/** The banner text re-exported for shells that surface it outside the pane. */
export function generatedVisualBanner(): string {
  return GENERATED_VISUAL_BANNER;
}

/** Canonical count text helper (presentation only; never an engineering claim). */
export function generatedComparisonText(
  artifact: GeneratedVisualArtifact,
): string {
  return `${String(artifact.canonicalComparison.renderedCanonicalShapeCount)}/${String(artifact.canonicalComparison.canonicalShapeCount)} canonical shapes; ${String(artifact.canonicalComparison.excessRegionCount)} beyond-geometry region(s)`;
}

/** fmt re-export guard (keeps the local formatting discipline visible). */
export function canonicalNumber(value: number): string {
  return fmt(value);
}
