/**
 * VOICE-002 — the evidence KIND badge (kebab-case) — the one mapping every
 * evidence list renders from (`still-imagery`, `video-footage`,
 * `voice-note`, …).
 *
 * Voice notes are not a special case: every acquisition method in the closed
 * vocabulary renders the same badge discipline (a kebab-case tag; the
 * record's own UPPER_SNAKE word stays inspectable in the tag's `title`, so
 * the badge is a presentation of the record's own field, never a
 * re-authoring of it). A value outside the closed vocabulary renders
 * VERBATIM (never kebab-cased — transforming an unknown word could
 * mislabel it; the register's server-side validation keeps the vocabulary
 * closed, so this branch is the honest anomaly path, not a guess).
 *
 * Pure: a function of its input; no clock, no randomness, no IO.
 */

import { EVIDENCE_ACQUISITION_METHODS } from "./evidence-registration";

/** The kebab-case badge per closed-vocabulary method (built once, frozen). */
const KIND_BADGES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    EVIDENCE_ACQUISITION_METHODS.map((method) => [
      method,
      method.toLowerCase().replaceAll("_", "-"),
    ]),
  ),
);

/**
 * The kebab-case kind badge of one acquisition method (e.g. `VOICE_NOTE` →
 * `voice-note`). Closed-vocabulary methods map through the single shared
 * mapping; anything else renders verbatim.
 */
export function evidenceKindBadge(acquisitionMethod: string): string {
  return KIND_BADGES[acquisitionMethod] ?? acquisitionMethod;
}
