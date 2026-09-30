/**
 * VOICE-002 — the voice-note capture lane's pure logic (no React, no fetch).
 *
 * The web client lane over the UNCHANGED VOICE-001 contract
 * (`packages/shared-contracts` 1.1.0 — READ-ONLY here). Two pure concerns
 * plus one browser platform probe:
 *
 *  - the honest acquisition metadata: `voiceCodecFromMediaType()` derives
 *    `voice.codec` from the browser-reported media type (the media SUBTYPE —
 *    the weaker observable claim; the browser cannot see the encoder behind
 *    a container, so it never guesses one). Duration and sample rate are
 *    MEASURED by {@link browserVoiceNoteAudioProbe} when the platform can
 *    (HTMLMediaElement metadata / Web Audio `decodeAudioData`) and are
 *    honestly `null` when it cannot — absence renders as absence, never
 *    zero, never "unknown", never fabricated (the open-map discipline).
 *  - the CLIENT transcript state: `voiceNoteTranscriptState()` derives the
 *    explicit transcript state of one registered voice note from the
 *    evidence read view's own derivations set (`GET /v1/evidence/:contentId`
 *    answers `derivations.inputsOf` + `provenance.asObject` — pinned by
 *    VOICE-001's conformance). NO backend transcript-state route exists and
 *    none is added: the client derives the state from the read view.
 *    - no `transcription.asr` entry in `inputsOf` → the explicit calm
 *      NO-TRANSCRIPT state with reason `asr_provider_not_configured` (this
 *      deployment's actual state — the reason word is the contract's own
 *      vocabulary, from `backend/api/src/evidence/transcription.ts`); a
 *      calm informational state: never an error, never a fabricated
 *      transcript, never a silent skip;
 *    - a `transcription.asr` entry present → TRANSCRIPT_AVAILABLE carrying
 *      the derivation (method identity, methodVersion, outputContentId) and
 *      its evidence-to-evidence `DERIVED_FROM` provenance link — a DERIVED
 *      CANDIDATE, never authoritative text, never a rewrite of the raw
 *      evidence. When several ASR derivations exist the canonically-first
 *      is surfaced (the backend service's own rule — the journal is
 *      append-only; provider version bumps append, never rewrite).
 *
 * Determinism: the pure functions are functions of their inputs; no clock,
 * no randomness, no IO. The browser probe touches platform APIs only inside
 * its function body and answers honest `null`s for what it cannot measure.
 */

import { ASR_TRANSCRIPTION_METHOD } from "../../../../packages/shared-contracts/src/index";
import type { DerivationView, ProvenanceLinkView } from "./api";

/* ------------------------------------------------------------------ */
/* The honest acquisition metadata                                     */
/* ------------------------------------------------------------------ */

/**
 * The voice-note acquisition metadata the browser lane can HONESTLY know.
 * Every key is `string | null`: a value is a measurement or an observable
 * fact; `null` is the honest absence (the platform could not measure or
 * observe it). Numeric values are string-encoded integers per the contract
 * (`voice.duration.ms`, `voice.sample.rate.hz` — see the contract header).
 */
export interface VoiceNoteMeasured {
  /**
   * The media subtype of the browser-reported media type (e.g. `ogg` for
   * `audio/ogg`) — the weaker observable claim, never a guessed codec
   * behind a container. `null` when the browser reports no audio subtype.
   */
  readonly codec: string | null;
  /**
   * The recording duration in milliseconds, string-encoded, measured via
   * HTMLMediaElement metadata when the platform can load it; `null` when it
   * cannot (absence, never zero).
   */
  readonly durationMs: string | null;
  /**
   * The audio sample rate in hertz, string-encoded, measured via Web Audio
   * `decodeAudioData` → `AudioBuffer.sampleRate` when the platform can
   * decode the codec; `null` when it cannot (absence, never zero).
   */
  readonly sampleRateHz: string | null;
}

/**
 * Derive `voice.codec` from the browser-reported media type: the subtype of
 * the `audio/<subtype>` type, lowercased, parameters stripped. The browser
 * lane reports the weaker claim it can actually observe — never a guessed
 * codec behind a container (`audio/ogg` → `ogg`, even when the payload
 * happens to be Opus-encoded: the browser did not say so).
 */
export function voiceCodecFromMediaType(mediaType: string): string | null {
  const base = mediaType.split(";")[0] ?? "";
  const parts = base.split("/");
  if (parts.length !== 2 || (parts[0] ?? "").trim().toLowerCase() !== "audio") {
    return null;
  }
  const subtype = (parts[1] ?? "").trim().toLowerCase();
  if (subtype.length === 0) {
    return null;
  }
  return subtype;
}

/**
 * The platform measurement seam: reads one selected audio file and answers
 * the honestly-measurable keys. Each key is `null` when THIS platform could
 * not measure it — a wrong platform never fabricates a value.
 */
export type VoiceNoteAudioProbe = (
  file: File,
  bytes: Uint8Array,
) => Promise<{ readonly durationMs: string | null; readonly sampleRateHz: string | null }>;

/**
 * Measure an audio file's duration and sample rate with the browser
 * platform's own decoders, each independently honest:
 *
 *  - duration: an `HTMLMediaElement` loads the metadata (object URL) and
 *    reports `duration`; a non-finite/non-positive duration (some browsers
 *    report `Infinity` for live streams, `NaN` for unloadable codecs) is
 *    the honest absence;
 *  - sample rate: Web Audio `decodeAudioData` decodes a COPY of the bytes
 *    (the API detaches its input buffer) and reports `sampleRate`; an
 *    undecodable codec or a missing AudioContext is the honest absence.
 *
 * Every failure path answers `null` for that key — never a thrown error,
 * never a fallback value.
 */
export function browserVoiceNoteAudioProbe(): VoiceNoteAudioProbe {
  return async (file: File, bytes: Uint8Array): Promise<{
    readonly durationMs: string | null;
    readonly sampleRateHz: string | null;
  }> => {
    const [durationMs, sampleRateHz] = await Promise.all([
      measureDurationMs(file),
      measureSampleRateHz(bytes),
    ]);
    return { durationMs, sampleRateHz };
  };
}

/** HTMLMediaElement metadata duration, or the honest null. */
async function measureDurationMs(file: File): Promise<string | null> {
  if (typeof URL?.createObjectURL !== "function" || typeof Audio !== "function") {
    return null;
  }
  let url: string | null = null;
  try {
    url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    const duration = await new Promise<number>((resolve, reject) => {
      audio.addEventListener(
        "loadedmetadata",
        () => {
          resolve(audio.duration);
        },
        { once: true },
      );
      audio.addEventListener(
        "error",
        () => {
          reject(new Error("audio metadata unavailable"));
        },
        { once: true },
      );
      audio.src = url as string;
    });
    if (Number.isFinite(duration) && duration > 0) {
      return String(Math.round(duration * 1000));
    }
    return null;
  } catch {
    return null;
  } finally {
    if (url !== null) {
      URL.revokeObjectURL(url);
    }
  }
}

/** Web Audio decodeAudioData sample rate, or the honest null. */
async function measureSampleRateHz(bytes: Uint8Array): Promise<string | null> {
  type AudioContextCtor = new () => {
    decodeAudioData(buffer: ArrayBuffer): Promise<{ readonly sampleRate: number }>;
    close(): Promise<void>;
  };
  const scope = globalThis as Record<string, unknown>;
  const Ctor = (scope.AudioContext ?? scope.webkitAudioContext) as AudioContextCtor | undefined;
  if (Ctor === undefined) {
    return null;
  }
  let context: { decodeAudioData(buffer: ArrayBuffer): Promise<{ readonly sampleRate: number }>; close(): Promise<void> } | null = null;
  try {
    context = new Ctor();
    // decodeAudioData DETACHES its input buffer — hand it a copy so the
    // upload's own bytes stay intact.
    const decoded = await context.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
    if (Number.isFinite(decoded.sampleRate) && decoded.sampleRate > 0) {
      return String(Math.round(decoded.sampleRate));
    }
    return null;
  } catch {
    return null;
  } finally {
    if (context !== null) {
      try {
        await context.close();
      } catch {
        // The measurement is already answered; the close is best-effort.
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* The client transcript state (derived from the read view)             */
/* ------------------------------------------------------------------ */

/** The explicit no-transcript reason (the contract's own vocabulary). */
export type VoiceNoteNoTranscriptReason = "asr_provider_not_configured";

/**
 * The explicit transcript state of one registered voice note, derived
 * client-side from the evidence read view's own sets. The future
 * provider-configured path carries the derivation entry verbatim plus its
 * `DERIVED_FROM` provenance link (when the read view holds one).
 */
export type VoiceNoteTranscriptState =
  | { readonly kind: "NO_TRANSCRIPT"; readonly reason: VoiceNoteNoTranscriptReason }
  | {
      readonly kind: "TRANSCRIPT_AVAILABLE";
      /** The canonically-first ASR derivation (the journal is append-only). */
      readonly derivation: DerivationView;
      /**
       * The evidence-to-evidence `DERIVED_FROM` link naming the transcript
       * artifact (subject) and this voice note (object), when recorded —
       * the derived-ness stays inspectable in the provenance graph.
       */
      readonly derivedFromLink: ProvenanceLinkView | null;
      /** Additional ASR candidates recorded after the primary (version bumps). */
      readonly additionalCandidateCount: number;
    };

/**
 * Derive the transcript state of one registered voice note from its read
 * view's derivations set (`derivations.inputsOf`) and the evidence-to-evidence
 * links pointing at it (`provenance.asObject`):
 *
 *  - NO `transcription.asr` entry in `inputsOf` → the explicit
 *    NO-TRANSCRIPT state with reason `asr_provider_not_configured` (this
 *    deployment's actual state; the reason word is the contract's own
 *    vocabulary) — a calm informational state, never an error;
 *  - an entry present → TRANSCRIPT_AVAILABLE with the derivation (method
 *    identity, methodVersion, outputContentId — the content address of the
 *    transcript artifact) and its `DERIVED_FROM` linkage: a DERIVED
 *    CANDIDATE, never authoritative text.
 *
 * Non-ASR derivations never fabricate a transcript: only entries whose
 * `method` is exactly `ASR_TRANSCRIPTION_METHOD` count.
 */
export function voiceNoteTranscriptState(
  inputsOf: readonly DerivationView[],
  linksToObject: readonly ProvenanceLinkView[],
): VoiceNoteTranscriptState {
  const asrDerivations = inputsOf.filter(
    (derivation) => derivation.method === ASR_TRANSCRIPTION_METHOD,
  );
  const primary = asrDerivations[0];
  if (primary === undefined) {
    return { kind: "NO_TRANSCRIPT", reason: "asr_provider_not_configured" };
  }
  const derivedFromLink =
    linksToObject.find(
      (link) =>
        link.role === "DERIVED_FROM" && link.subjectId === primary.outputContentId,
    ) ?? null;
  return {
    kind: "TRANSCRIPT_AVAILABLE",
    derivation: primary,
    derivedFromLink,
    additionalCandidateCount: asrDerivations.length - 1,
  };
}
