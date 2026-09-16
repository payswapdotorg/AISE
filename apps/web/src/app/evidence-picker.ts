/**
 * PROD-010 — the evidence PICKER's pure logic (no React, no fetch).
 *
 * The golden journey's write legs need real 64-hex evidence content
 * addresses; hand-typing them is the documented blocker this module
 * removes. Options come from EXACTLY two honest sources:
 *
 *  - the LIVE register (`GET /v1/evidence` answers `{ evidence: […record +
 *    invalidation pairs…] }` — invalidated records are excluded by the
 *    backend's default query, and this mapping mirrors that discipline);
 *  - the DEMO dataset's OWN records (the shell fixtures' evidence pane
 *    views — never re-keyed, never borrowed from another project).
 *
 * INVALIDATED records are excluded from the pickable options (invalidated ≠
 * deleted — full read views stay reachable; picking one for a NEW write is
 * refused). Captions are built from the RECORD'S OWN fields only
 * (acquisition method, media type, byte size, captured instant) — nothing
 * invented, nothing guessed.
 *
 * Determinism: pure functions of their inputs; no clock, no randomness,
 * no IO. The toggle math works over the panels' comma-separated id fields.
 */

import type { EvidenceIndexItem } from "./api";
import type { EvidencePaneView } from "../shell";

/** One pickable evidence option (record fields only). */
export interface EvidenceOption {
  readonly evidenceId: string;
  /** Honest caption from the record's own fields, nothing invented. */
  readonly caption: string;
  readonly invalidated: boolean;
  readonly invalidationReason: string | null;
}

function caption(
  acquisitionMethod: string,
  mediaType: string,
  byteSize: number,
  capturedAt: string,
): string {
  return `${acquisitionMethod} · ${mediaType} · ${String(byteSize)} bytes · ${capturedAt}`;
}

/**
 * Map the LIVE register's items into picker options. Invalidated entries
 * are EXCLUDED (mirroring the register's own default read discipline —
 * an invalidated record is never offered for a new write).
 */
export function evidenceOptionsFromLive(
  items: readonly EvidenceIndexItem[],
): readonly EvidenceOption[] {
  const options: EvidenceOption[] = [];
  for (const item of items) {
    if (item.invalidation !== null) {
      continue;
    }
    options.push({
      evidenceId: item.evidence.contentId,
      caption: caption(
        item.evidence.acquisitionMethod,
        item.evidence.mediaType,
        item.evidence.byteSize,
        item.evidence.capturedAt,
      ),
      invalidated: false,
      invalidationReason: null,
    });
  }
  return options;
}

/**
 * Map the DEMO dataset's own evidence records into picker options
 * (invalidated records excluded — the demo dataset's OWN records only,
 * never borrowed data).
 */
export function evidenceOptionsFromDemo(
  views: readonly EvidencePaneView[],
): readonly EvidenceOption[] {
  const options: EvidenceOption[] = [];
  for (const view of views) {
    if (view.invalidationReason !== null) {
      continue;
    }
    options.push({
      evidenceId: view.evidenceId,
      caption: caption(
        view.acquisitionMethod.value,
        view.mediaType.value,
        view.byteSize.value,
        view.capturedAt.value,
      ),
      invalidated: false,
      invalidationReason: null,
    });
  }
  return options;
}

/**
 * Parse the panels' comma-separated evidence-id field into a de-duplicated
 * id list (order preserved; blanks dropped).
 */
export function evidenceIdsFromField(field: string): readonly string[] {
  return [
    ...new Set(
      field
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ];
}

/**
 * Toggle one evidence id in a comma-separated field (the picker's state
 * math): present → removed; absent → appended. The result is the
 * normalized comma-separated text (order preserved, new ids last).
 */
export function toggleEvidenceId(field: string, evidenceId: string): string {
  const current = evidenceIdsFromField(field);
  const next = current.includes(evidenceId)
    ? current.filter((id) => id !== evidenceId)
    : [...current, evidenceId];
  return next.join(", ");
}
