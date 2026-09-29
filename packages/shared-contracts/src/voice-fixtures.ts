/**
 * Typed views of the committed VOICE-001 wire fixtures (test support only).
 *
 * Single source of truth: the JSON files under `fixtures/evidence/` — these
 * constants are parsed FROM those files (never re-typed by hand), so the
 * contract tests and the ajv fixture corpus exercise identical documents.
 */

import type { Derivation, Evidence } from "./index";

import voiceNoteJson from "../fixtures/evidence/Evidence.valid-voice-note.json" with {
  type: "json",
};
import derivationJson from "../fixtures/evidence/Derivation.valid-transcription.json" with {
  type: "json",
};

/** The committed VOICE_NOTE evidence fixture (verbatim). */
export const voiceNoteFixture: Evidence = voiceNoteJson as Evidence;

/** The committed transcription.asr derivation fixture (verbatim). */
export const transcriptionDerivationFixture: Derivation =
  derivationJson as Derivation;
