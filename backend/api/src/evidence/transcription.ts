/**
 * ASR transcription over voice notes (VOICE-001) — the provider-gated
 * derivation path plus the honest-degradation guarantee.
 *
 * Contract (docs/voice-notes-evidence-work-orders-2026-09-29.md VOICE-001;
 * spec/architecture-lock.md "Raw field evidence is immutable", "Evidence
 * Graph is the only provenance authority"; the reconstruction provider
 * discipline of PROD-009 applied to ASR):
 *
 *  - AUTHORITY DISCIPLINE: this service DERIVES AND RECORDS ONLY. It
 *    performs no readiness scoring and no truth judgement; a transcript is
 *    a DERIVED CANDIDATE, never authoritative text and never a rewrite of
 *    the raw evidence. The voice note stays immutable and append-only — a
 *    transcript can never rewrite, invalidate or supersede it.
 *  - PROVIDER SEAM: `AsrProvider` is the provider-neutral seam behind the
 *    canonical method identity `transcription.asr`
 *    (`ASR_TRANSCRIPTION_METHOD`, shared-contracts). No engine is an
 *    authority; providers must be deterministic for identical inputs so a
 *    derivation is replayable (identical inputs => identical transcript
 *    bytes => identical content address => idempotent registration and a
 *    duplicate derivation record).
 *  - HONEST DEGRADATION (load-bearing): with NO ASR provider configured,
 *    voice-note registration SUCCEEDS (it never consults ASR at all) and the
 *    absence of a transcript is an EXPLICIT, INSPECTABLE state —
 *    `asrAvailability()` answers `asr_provider_not_configured`,
 *    `transcriptState()` answers `NO_TRANSCRIPT` naming that reason, and
 *    `deriveTranscript()` returns that same explicit no-transcript outcome.
 *    No fabricated transcript, no silent skip, no error. A configured
 *    provider that refuses work is surfaced just as explicitly
 *    (`provider_unavailable` with the provider's own reason), mirroring the
 *    reconstruction adapters' honest ACCESS_REQUIRED/UNAVAILABLE states.
 *  - DERIVATION RECORDS: the transcript artifact is content-addressed
 *    (sha-256 over the UTF-8 transcript bytes — the capture store's
 *    bytes-address discipline), pinned in the capture store when one is
 *    wired, registered as `Evidence` (the evidence service's provenance
 *    closure requires the output to be registered), and linked to the voice
 *    note through BOTH a `Derivation` (method identity + version +
 *    deterministic parameters + ordered input ids — provenance-complete)
 *    and an evidence-to-evidence `ProvenanceLink` with role `DERIVED_FROM`
 *    (the derived-ness stays inspectable in the provenance graph too).
 *  - The transcript artifact's own `Evidence` record uses
 *    `INSTRUMENT_READING` (the ASR engine is the instrument; the transcript
 *    is its reading) and carries `transcript.*` acquisition-metadata keys
 *    naming the voice note, the method and the derived-candidate status —
 *    the metadata never claims field acquisition it does not have.
 *  - The service owns NO wall clock and NO randomness: the clock is
 *    injected, identifiers are derived deterministically from
 *    (provider id, provider version, voice-note content id), so every
 *    persisted byte is deterministic given the same call sequence.
 */

import {
  ASR_TRANSCRIPTION_METHOD,
  CONTRACT_VERSION,
  type Derivation,
  type Evidence,
  type ProvenanceLink,
} from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type { CaptureStore } from "../capture/store";
import type { EvidenceService } from "./service";

/* ------------------------------------------------------------------ */
/* Provider seam                                                       */
/* ------------------------------------------------------------------ */

/** One voice note handed to an ASR provider (all fields verbatim). */
export interface AsrTranscriptionInput {
  /** The voice note's content address (also the input evidence content id). */
  readonly contentId: string;
  /** The raw audio bytes exactly as pinned in the content store. */
  readonly bytes: Uint8Array;
  /** The media type of the audio payload (e.g. `audio/ogg`). */
  readonly mediaType: string;
  /** The advisory `voice.language.hint` metadata value, when present. */
  readonly languageHint: string | null;
}

/**
 * A provider's explicit answer. `TRANSCRIPTION_UNAVAILABLE` is an honest,
 * typed refusal (the provider's own reason, surfaced verbatim) — a provider
 * may never fabricate text and never fail silently.
 */
export type AsrTranscriptionResult =
  | {
      readonly kind: "TRANSCRIBED";
      /** The transcript text (UTF-8; becomes the content-addressed artifact). */
      readonly text: string;
      /**
       * Deterministic transcription parameters, recorded VERBATIM in the
       * derivation (e.g. `asr.language`, `asr.model`, `asr.encoding`).
       */
      readonly parameters: Record<string, string>;
    }
  | {
      readonly kind: "TRANSCRIPTION_UNAVAILABLE";
      /** The provider's own honest reason (surfaced verbatim, never dropped). */
      readonly reason: string;
    };

/**
 * Provider-neutral ASR seam (VOICE-001). Implementations MUST be
 * deterministic for identical inputs (replayability) and MUST answer with
 * the typed result above — never throw for unavailability, never fabricate.
 */
export interface AsrProvider {
  /** Stable provider identity (recorded in derivation ids). */
  readonly id: string;
  /** Engine/model version identity (recorded as the derivation methodVersion). */
  readonly version: string;
  /** Transcribe one voice note. */
  transcribe(input: AsrTranscriptionInput): Promise<AsrTranscriptionResult>;
}

/* ------------------------------------------------------------------ */
/* Typed errors                                                        */
/* ------------------------------------------------------------------ */

/** Stable machine-readable codes (single authority: this module). */
export type TranscriptionServiceErrorCode =
  | "evidence_not_found"
  | "not_a_voice_note"
  | "transcript_source_unavailable";

/** Typed transcription failure. `detail` is deterministic and names ids. */
export class TranscriptionServiceError extends Error {
  readonly code: TranscriptionServiceErrorCode;
  readonly detail: string;

  constructor(code: TranscriptionServiceErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "TranscriptionServiceError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Read types                                                          */
/* ------------------------------------------------------------------ */

/** The explicit ASR configuration state of this deployment. */
export type AsrAvailability =
  | { readonly state: "asr_provider_not_configured" }
  | {
      readonly state: "asr_ready";
      readonly providerId: string;
      readonly providerVersion: string;
    };

/** Why a registered voice note has no transcript (explicit, inspectable). */
export type NoTranscriptReason = "asr_provider_not_configured" | "no_transcript_recorded";

/**
 * The explicit transcript state of one registered voice note. When several
 * ASR derivations exist (e.g. provider version bumps — the journal is
 * append-only), the canonically-first derivation is surfaced; the full
 * candidate list stays inspectable through the evidence read view.
 */
export type TranscriptState =
  | { readonly kind: "TRANSCRIPT_AVAILABLE"; readonly derivation: Derivation }
  | { readonly kind: "NO_TRANSCRIPT"; readonly reason: NoTranscriptReason };

/** Result of the provider-gated derivation attempt. */
export type DeriveTranscriptResult =
  | {
      readonly kind: "TRANSCRIBED";
      readonly derivation: Derivation;
      readonly transcript: Evidence;
      /** `recorded` on first append, `duplicate` on an identical replay. */
      readonly outcome: "recorded" | "duplicate";
    }
  | { readonly kind: "NO_TRANSCRIPT"; readonly reason: "asr_provider_not_configured" }
  | {
      readonly kind: "NO_TRANSCRIPT";
      readonly reason: "provider_unavailable";
      readonly detail: string;
    };

export interface TranscriptionService {
  /** The explicit ASR configuration state (honest degradation surface). */
  asrAvailability(): AsrAvailability;
  /** The explicit transcript state of one registered voice note. */
  transcriptState(contentId: string): Promise<TranscriptState>;
  /** Run the provider-gated derivation over one registered voice note. */
  deriveTranscript(contentId: string): Promise<DeriveTranscriptResult>;
}

export interface TranscriptionServiceDeps {
  /** The evidence register (transcript registration + derivation journal). */
  readonly evidence: EvidenceService;
  /**
   * The ASR provider. ABSENT (the default deployment) = no ASR configured:
   * every surface answers the explicit `asr_provider_not_configured` state.
   */
  readonly asrProvider?: AsrProvider;
  /**
   * Content store seam: reads the voice note's raw bytes and pins the
   * content-addressed transcript bytes. Absent only in wirings that also
   * run the evidence service without a pinning resolver.
   */
  readonly contentStore?: CaptureStore;
  /** UTC instant supplier — ISO 8601, millisecond precision, `Z` suffix. */
  readonly clock: () => string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Media type of the content-addressed transcript artifact. */
export const TRANSCRIPT_MEDIA_TYPE = "text/plain";

/** Acquisition-metadata keys stamped on the transcript artifact (open map). */
export const TRANSCRIPT_METADATA_KEYS = {
  sourceVoiceNote: "transcript.of",
  method: "transcript.method",
  candidate: "transcript.candidate",
} as const;

/**
 * Deterministic derivation id: stable per (provider, provider version,
 * voice note) — a provider version bump yields a NEW derivation record and
 * the old candidate stays in the append-only journal, never rewritten.
 */
function derivationIdFor(provider: AsrProvider, voiceNoteContentId: string): string {
  return `${ASR_TRANSCRIPTION_METHOD}:${provider.id}:${provider.version}:${voiceNoteContentId}`;
}

/** The transcript artifact's evidence document (deterministic, inspectable). */
function transcriptEvidence(
  voiceNote: Evidence,
  transcriptContentId: string,
  transcriptBytes: Uint8Array,
  derivedAt: string,
): Evidence {
  const source = voiceNote.acquisitionMetadata;
  const metadata: Record<string, string> = {
    [TRANSCRIPT_METADATA_KEYS.sourceVoiceNote]: voiceNote.contentId,
    [TRANSCRIPT_METADATA_KEYS.method]: ASR_TRANSCRIPTION_METHOD,
    [TRANSCRIPT_METADATA_KEYS.candidate]: "true",
  };
  // The transcript rides the voice note's mission/session/device identity
  // (nothing invented — only keys the voice note itself carries).
  for (const key of ["mission.id", "session.id", "device.id"] as const) {
    const value = source[key];
    if (value !== undefined) {
      metadata[key] = value;
    }
  }
  return {
    contractVersion: CONTRACT_VERSION,
    contentId: transcriptContentId,
    byteSize: transcriptBytes.length,
    mediaType: TRANSCRIPT_MEDIA_TYPE,
    capturedAt: derivedAt,
    // The ASR engine is the instrument; the transcript is its reading. The
    // derived-ness is carried by the Derivation + DERIVED_FROM link, never
    // claimed as field acquisition.
    acquisitionMethod: "INSTRUMENT_READING",
    acquisitionMetadata: metadata,
  };
}

/** The evidence-to-evidence derived-from link (transcript -> voice note). */
function derivedFromLink(
  transcriptContentId: string,
  voiceNoteContentId: string,
): ProvenanceLink {
  return {
    contractVersion: CONTRACT_VERSION,
    subjectKind: "evidence",
    subjectId: transcriptContentId,
    evidenceContentId: voiceNoteContentId,
    role: "DERIVED_FROM",
  };
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/** Create the transcription service (pure policy + injected I/O). */
export function createTranscriptionService(
  deps: TranscriptionServiceDeps,
): TranscriptionService {
  const { evidence, asrProvider, contentStore, clock } = deps;

  /** Load the registered record; typed refusals name the exact id. */
  const requireVoiceNote = async (contentId: string): Promise<Evidence> => {
    const view = await evidence.getEvidence(contentId);
    if (view === null) {
      throw new TranscriptionServiceError(
        "evidence_not_found",
        `evidence ${contentId} is not registered`,
      );
    }
    if (view.evidence.acquisitionMethod !== "VOICE_NOTE") {
      throw new TranscriptionServiceError(
        "not_a_voice_note",
        `evidence ${contentId} was acquired by ${view.evidence.acquisitionMethod}, ` +
          "not VOICE_NOTE; transcription applies to voice notes only",
      );
    }
    return view.evidence;
  };

  const asrAvailability = (): AsrAvailability => {
    if (asrProvider === undefined) {
      return { state: "asr_provider_not_configured" };
    }
    return {
      state: "asr_ready",
      providerId: asrProvider.id,
      providerVersion: asrProvider.version,
    };
  };

  const transcriptState = async (contentId: string): Promise<TranscriptState> => {
    const voiceNote = await requireVoiceNote(contentId);
    const view = await evidence.getEvidence(voiceNote.contentId);
    // The read view's inputsOf is canonically sorted by the evidence
    // service; the first ASR derivation is the deterministic primary.
    const asrDerivations = (view?.derivations.inputsOf ?? []).filter(
      (derivation) => derivation.method === ASR_TRANSCRIPTION_METHOD,
    );
    const primary = asrDerivations[0];
    if (primary !== undefined) {
      return { kind: "TRANSCRIPT_AVAILABLE", derivation: primary };
    }
    return {
      kind: "NO_TRANSCRIPT",
      reason:
        asrProvider === undefined ? "asr_provider_not_configured" : "no_transcript_recorded",
    };
  };

  const deriveTranscript = async (
    contentId: string,
  ): Promise<DeriveTranscriptResult> => {
    // 1. Honest degradation FIRST: no provider configured is an explicit
    //    no-transcript outcome — never an error, never fabricated. The
    //    voice note's own registration never consulted ASR at all.
    if (asrProvider === undefined) {
      return { kind: "NO_TRANSCRIPT", reason: "asr_provider_not_configured" };
    }

    // 2. The voice note must be registered (typed refusals otherwise).
    const voiceNote = await requireVoiceNote(contentId);

    // 3. Read the raw audio bytes exactly as pinned (typed refusal when the
    //    content store is absent or the bytes were never pinned).
    if (contentStore === undefined) {
      throw new TranscriptionServiceError(
        "transcript_source_unavailable",
        `no content store is wired; the raw bytes of voice note ${contentId} ` +
          "cannot be read for transcription",
      );
    }
    const bytes = await contentStore.readAssetBytes(voiceNote.contentId);
    if (bytes === null) {
      throw new TranscriptionServiceError(
        "transcript_source_unavailable",
        `voice note ${contentId} has no pinned bytes in the content store; ` +
          "transcription requires the pinned raw audio",
      );
    }

    // 4. Provider turn (its own typed refusal surfaces verbatim).
    const languageHint =
      voiceNote.acquisitionMetadata["voice.language.hint"] ?? null;
    const answer = await asrProvider.transcribe({
      contentId: voiceNote.contentId,
      bytes,
      mediaType: voiceNote.mediaType,
      languageHint,
    });
    if (answer.kind === "TRANSCRIPTION_UNAVAILABLE") {
      return {
        kind: "NO_TRANSCRIPT",
        reason: "provider_unavailable",
        detail: answer.reason,
      };
    }

    // 5. Content-address the transcript artifact (bytes-address discipline).
    const transcriptBytes = new TextEncoder().encode(answer.text);
    const transcriptContentId = sha256Hex(transcriptBytes);
    const derivedAt = clock();

    // 6. Pin the transcript bytes (idempotent; a store-less wiring relies
    //    on an evidence service without a pinning resolver, matching it).
    if (contentStore !== undefined) {
      await contentStore.putAsset(
        transcriptContentId,
        transcriptBytes,
        TRANSCRIPT_MEDIA_TYPE,
        derivedAt,
      );
    }

    // 7. Register the transcript artifact as Evidence (write-once,
    //    idempotent for the content-addressed bytes).
    const transcript = transcriptEvidence(
      voiceNote,
      transcriptContentId,
      transcriptBytes,
      derivedAt,
    );
    await evidence.registerEvidence(transcript);

    // 8. The DERIVED_FROM provenance link (exact duplicates are no-ops).
    await evidence.addProvenanceLink(derivedFromLink(transcriptContentId, voiceNote.contentId));

    // 9. The provenance-complete Derivation (identical replay = duplicate).
    const derivation: Derivation = {
      contractVersion: CONTRACT_VERSION,
      derivationId: derivationIdFor(asrProvider, voiceNote.contentId),
      outputContentId: transcriptContentId,
      inputEvidenceContentIds: [voiceNote.contentId],
      method: ASR_TRANSCRIPTION_METHOD,
      methodVersion: asrProvider.version,
      parameters: answer.parameters,
      createdAt: derivedAt,
    };
    const recorded = await evidence.recordDerivation(derivation);
    return {
      kind: "TRANSCRIBED",
      derivation: recorded.derivation,
      transcript,
      outcome: recorded.kind === "recorded" ? "recorded" : "duplicate",
    };
  };

  return { asrAvailability, transcriptState, deriveTranscript };
}
