/**
 * HFX-303 — the GENERATED-VISUAL FALLBACK pane renderer.
 *
 * The honest fallback: when visual generation failed (a typed provider
 * failure from the closed vocabulary) or no provider was configured, the
 * viewer renders the CANONICAL deterministic 2D/3D panes (always
 * rendered from the state — nothing is removed) plus THIS notice: the
 * typed failure text, the fallback record's identity and the statement
 * that the canonical projections remain the engineering views. Never a
 * gap, never a silent omission — the fallback itself is recorded and
 * visible.
 *
 * DETERMINISTIC SERVER-RENDERED STRING (the viewer convention): pure
 * string rendering, no DOM, no events, no fetch, no browser APIs, no
 * writes.
 */

import { escapeHtml } from "../format";
import type { ViewerFrame } from "../model";
import type { GeneratedVisualFallbackRecord } from "./model";

/** The fallback notice's fixed lead (verbatim constant). */
export const GENERATED_FALLBACK_LEAD =
  "Generated visual unavailable — the canonical deterministic views remain the engineering views" as const;

/** The pane's fixed id (stable selector for tests + shells). */
export const GENERATED_FALLBACK_PANE_ID = "pane-generated-fallback" as const;

/**
 * Renders the generated-visual fallback notice lines (pure). The notice
 * carries the layer identity attributes (the §027 anchor) plus the
 * fallback record's own pins (fallback id + projection digests).
 */
export function generatedFallbackLines(
  record: GeneratedVisualFallbackRecord,
  frame: ViewerFrame,
): string[] {
  const reasonLines =
    record.reason.reasonKind === "provider-failure"
      ? `Visual generation failed with the typed failure <code>${escapeHtml(record.reason.failure.kind)}</code>: ${escapeHtml(record.reason.failure.detail)}`
      : `No visual-generation provider was available: ${escapeHtml(record.reason.detail)}`;

  return [
    `<section class="pane" id="${GENERATED_FALLBACK_PANE_ID}" aria-label="Generated visual unavailable (canonical views shown)" data-scenario-id="${escapeHtml(frame.scenarioId)}" data-baseline-version-id="${escapeHtml(frame.baselineVersionId)}" data-state-id="${escapeHtml(frame.stateId)}" data-state-index="${String(frame.stateIndex)}" data-applied-step-ids="${escapeHtml(frame.appliedStepIds.join(","))}" data-fallback-id="${escapeHtml(record.fallbackId)}" data-fallback-reason="${escapeHtml(record.reason.reasonKind)}">`,
    `<h2>Generated visual — unavailable</h2>`,
    `<p style="border:1px solid #d97706;background:#fffbeb;border-radius:6px;padding:.35rem .6rem;color:#92400e" data-fallback-notice="true"><strong>${GENERATED_FALLBACK_LEAD}.</strong> ${reasonLines}.</p>`,
    `<p class="pane-note" data-fallback-binding="true">Fallback record <code>${escapeHtml(record.fallbackId)}</code> for visual class <code>${escapeHtml(record.visualClass)}</code> over state <code>${escapeHtml(record.state.stateId)}</code> — the canonical plan and axonometric projections it fell back to are pinned by content digest (<code>${escapeHtml(record.canonicalProjectionDigests.plan.slice(0, 16))}…</code> / <code>${escapeHtml(record.canonicalProjectionDigests.axonometric.slice(0, 16))}…</code>). ${escapeHtml(record.statement)}.</p>`,
    `</section>`,
  ];
}
