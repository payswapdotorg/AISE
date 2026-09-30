/**
 * VOICE-002 — the voice-note lane's PURE logic tests (no React, no fetch).
 *
 * The evidence-registration.test.ts discipline: every explicit state is
 * pinned by name —
 *  - `voiceCodecFromMediaType`: the WEAKER observable claim (the media
 *    subtype the File itself states, parameters stripped — never a guessed
 *    encoder behind a container);
 *  - `voiceNoteTranscriptState`: the client-only transcript state derived
 *    from the read view's own derivations set — the explicit calm
 *    `asr_provider_not_configured` no-transcript state (the contract's own
 *    reason word), non-ASR derivations never fabricating a transcript, and
 *    the provider-configured path carrying the derivation + its DERIVED_FROM
 *    provenance link;
 *  - `evidenceKindBadge`: the one shared kebab-case mapping
 *    (voice-note / still-imagery / video-footage from the same table);
 *  - `evidenceRegistrationRequestBody`: the EXACT wire body for the voice
 *    lane — checked against the committed 1.1.0 contract fixture
 *    (`Evidence.valid-voice-note.json`): string values, string-encoded
 *    integers, unmeasured keys ABSENT (never zero, never "unknown").
 */

import { describe, expect, test } from "bun:test";
import {
  ASR_TRANSCRIPTION_METHOD,
  CONTRACT_VERSION,
} from "../../../../packages/shared-contracts/src/index";
import {
  voiceNoteFixture,
  transcriptionDerivationFixture,
} from "../../../../packages/shared-contracts/src/voice-fixtures";
import {
  voiceCodecFromMediaType,
  voiceNoteTranscriptState,
} from "./voice-note";
import { evidenceKindBadge } from "./evidence-kind";
import {
  EVIDENCE_ACQUISITION_METHODS,
  evidenceRegistrationRequestBody,
  validateEvidenceRegistrationDraft,
  type EvidenceRegistrationDraft,
} from "./evidence-registration";
import type { DerivationView, ProvenanceLinkView } from "./api";

/* ------------------------------------------------------------------ */
/* voiceCodecFromMediaType (the weaker observable claim)                */
/* ------------------------------------------------------------------ */

describe("VOICE-002 voiceCodecFromMediaType (the browser-reported subtype)", () => {
  test("audio/ogg answers ogg — the subtype, never a guessed encoder behind the container", () => {
    expect(voiceCodecFromMediaType("audio/ogg")).toBe("ogg");
  });

  test("parameters are stripped: audio/ogg; codecs=opus still answers ogg (the browser did not say opus)", () => {
    expect(voiceCodecFromMediaType("audio/ogg; codecs=opus")).toBe("ogg");
    expect(voiceCodecFromMediaType("AUDIO/OGG; codecs=opus")).toBe("ogg");
  });

  test("other audio subtypes map (webm, mp4, wav) — the same rule, no special cases", () => {
    expect(voiceCodecFromMediaType("audio/webm")).toBe("webm");
    expect(voiceCodecFromMediaType("audio/mp4")).toBe("mp4");
    expect(voiceCodecFromMediaType("audio/wav")).toBe("wav");
  });

  test("non-audio types, empty types and parameter-only types answer the honest null", () => {
    expect(voiceCodecFromMediaType("image/jpeg")).toBe(null);
    expect(voiceCodecFromMediaType("video/mp4")).toBe(null);
    expect(voiceCodecFromMediaType("application/octet-stream")).toBe(null);
    expect(voiceCodecFromMediaType("audio/")).toBe(null);
    expect(voiceCodecFromMediaType("")).toBe(null);
    expect(voiceCodecFromMediaType("audio")).toBe(null);
  });
});

/* ------------------------------------------------------------------ */
/* voiceNoteTranscriptState (the client-only transcript state)          */
/* ------------------------------------------------------------------ */

/** A derivation entry shaped exactly as the read view answers it. */
function derivationView(overrides: Partial<DerivationView>): DerivationView {
  return {
    derivationId: "derivation-204-voice-transcript-001",
    outputContentId: "55015939de43a3a8b5568b58f40e6588c05045a1bb2c0fde5c4bc0c280f4e81b",
    inputEvidenceContentIds: [
      "c30ef5571e696486cf6cc59e22f90ddcf74fe6532c4361225d0b6821a4754c23",
    ],
    method: ASR_TRANSCRIPTION_METHOD,
    methodVersion: "1.2.0+model.asr-7b-q5",
    parameters: { "asr.language": "en", "asr.model": "asr-7b-q5" },
    createdAt: "2026-01-15T09:42:31.000Z",
    ...overrides,
  };
}

/** The evidence-to-evidence DERIVED_FROM link the read view records. */
function derivedFromLink(subjectId: string): ProvenanceLinkView {
  return {
    subjectKind: "evidence",
    subjectId,
    evidenceContentId:
      "c30ef5571e696486cf6cc59e22f90ddcf74fe6532c4361225d0b6821a4754c23",
    role: "DERIVED_FROM",
  };
}

describe("VOICE-002 voiceNoteTranscriptState (derived from the read view)", () => {
  test("an empty derivations set is the explicit calm NO_TRANSCRIPT state with the contract's own reason word", () => {
    const state = voiceNoteTranscriptState([], []);
    expect(state.kind).toBe("NO_TRANSCRIPT");
    if (state.kind === "NO_TRANSCRIPT") {
      expect(state.reason).toBe("asr_provider_not_configured");
    }
  });

  test("non-ASR derivations never fabricate a transcript (only transcription.asr counts)", () => {
    const reconstruction = derivationView({
      derivationId: "derivation-301",
      method: "reconstruction.worldsculpt",
      methodVersion: "0.9.1",
    });
    const state = voiceNoteTranscriptState([reconstruction], []);
    expect(state.kind).toBe("NO_TRANSCRIPT");
    if (state.kind === "NO_TRANSCRIPT") {
      expect(state.reason).toBe("asr_provider_not_configured");
    }
  });

  test("an ASR derivation present answers TRANSCRIPT_AVAILABLE with the derivation and its DERIVED_FROM link", () => {
    const asr = derivationView({});
    const link = derivedFromLink(asr.outputContentId);
    const state = voiceNoteTranscriptState([asr], [link]);
    expect(state.kind).toBe("TRANSCRIPT_AVAILABLE");
    if (state.kind === "TRANSCRIPT_AVAILABLE") {
      expect(state.derivation.method).toBe(ASR_TRANSCRIPTION_METHOD);
      expect(state.derivation.methodVersion).toBe("1.2.0+model.asr-7b-q5");
      expect(state.derivation.outputContentId).toBe(
        "55015939de43a3a8b5568b58f40e6588c05045a1bb2c0fde5c4bc0c280f4e81b",
      );
      expect(state.derivedFromLink).toEqual(link);
      expect(state.additionalCandidateCount).toBe(0);
    }
  });

  test("a DERIVED_FROM link naming a different subject is not the transcript's (the linkage must name the transcript artifact)", () => {
    const asr = derivationView({});
    const other = derivedFromLink("f".repeat(64));
    const state = voiceNoteTranscriptState([asr], [other]);
    expect(state.kind).toBe("TRANSCRIPT_AVAILABLE");
    if (state.kind === "TRANSCRIPT_AVAILABLE") {
      expect(state.derivedFromLink).toBe(null);
    }
  });

  test("several ASR derivations surface the first as primary and count the later candidates (append-only journal)", () => {
    const first = derivationView({ derivationId: "derivation-204" });
    const later = derivationView({
      derivationId: "derivation-209",
      methodVersion: "1.3.0+model.asr-7b-q6",
    });
    const state = voiceNoteTranscriptState([first, later], []);
    expect(state.kind).toBe("TRANSCRIPT_AVAILABLE");
    if (state.kind === "TRANSCRIPT_AVAILABLE") {
      expect(state.derivation.derivationId).toBe("derivation-204");
      expect(state.additionalCandidateCount).toBe(1);
    }
  });

  test("the committed transcription.asr fixture itself maps through as a TRANSCRIPT_AVAILABLE derivation", () => {
    // The fixture IS a DerivationView structurally (the read view answers
    // these verbatim) — proving the client state derives from real wire
    // shapes, never a bespoke one.
    const view: DerivationView = transcriptionDerivationFixture;
    const state = voiceNoteTranscriptState([view], [
      derivedFromLink(view.outputContentId),
    ]);
    expect(state.kind).toBe("TRANSCRIPT_AVAILABLE");
    if (state.kind === "TRANSCRIPT_AVAILABLE") {
      expect(state.derivation.method).toBe("transcription.asr");
      expect(state.derivation.methodVersion).toBe("1.2.0+model.asr-7b-q5");
      expect(state.derivation.outputContentId).toBe(
        "55015939de43a3a8b5568b58f40e6588c05045a1bb2c0fde5c4bc0c280f4e81b",
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* evidenceKindBadge (the one shared kebab-case mapping)                */
/* ------------------------------------------------------------------ */

describe("VOICE-002 evidenceKindBadge (the kind badge mapping)", () => {
  test("VOICE_NOTE renders voice-note", () => {
    expect(evidenceKindBadge("VOICE_NOTE")).toBe("voice-note");
  });

  test("the other kinds render the same discipline from the same mapping (no special cases)", () => {
    expect(evidenceKindBadge("STILL_IMAGERY")).toBe("still-imagery");
    expect(evidenceKindBadge("VIDEO_FOOTAGE")).toBe("video-footage");
    expect(evidenceKindBadge("DEPTH_SENSING")).toBe("depth-sensing");
    expect(evidenceKindBadge("DOCUMENT_REGION")).toBe("document-region");
  });

  test("every closed-vocabulary method has a badge (the mapping covers EVIDENCE_ACQUISITION_METHODS)", () => {
    for (const method of EVIDENCE_ACQUISITION_METHODS) {
      expect(evidenceKindBadge(method)).toBe(
        method.toLowerCase().replaceAll("_", "-"),
      );
    }
  });

  test("a word outside the closed vocabulary renders verbatim (never re-authored)", () => {
    expect(evidenceKindBadge("SOMETHING_ELSE")).toBe("SOMETHING_ELSE");
  });
});

/* ------------------------------------------------------------------ */
/* The registration wire body (the EXACT Evidence document)             */
/* ------------------------------------------------------------------ */

/** A voice draft with EXPLICIT measured/absent keys (null stays null). */
function voiceDraft(voice: {
  readonly durationMs: string | null;
  readonly sampleRateHz: string | null;
  readonly codec: string | null;
  readonly languageHint?: string;
}): EvidenceRegistrationDraft {
  return {
    contentId: voiceNoteFixture.contentId,
    byteSize: String(voiceNoteFixture.byteSize),
    mediaType: "audio/ogg",
    capturedAt: "2026-01-15T09:41:03.000Z",
    acquisitionMethod: "VOICE_NOTE",
    sessionId: "session-2026-0007",
    voice: {
      durationMs: voice.durationMs,
      sampleRateHz: voice.sampleRateHz,
      codec: voice.codec,
      languageHint: voice.languageHint ?? "",
    },
  };
}

describe("VOICE-002 evidenceRegistrationRequestBody (the voice wire body vs the committed fixture)", () => {
  test("a measured voice draft maps to the EXACT Evidence document with the canonical voice keys as strings", () => {
    const result = evidenceRegistrationRequestBody(
      voiceDraft({ durationMs: "18400", sampleRateHz: "48000", codec: "ogg", languageHint: "en" }),
    );
    if (!result.ok) {
      throw new Error(`unreachable: the measured draft must map (${result.defects.join("; ")})`);
    }
    const body = result.body;
    expect(body.contractVersion).toBe(CONTRACT_VERSION);
    expect(body.contractVersion).toBe(voiceNoteFixture.contractVersion);
    expect(body.contentId).toBe(voiceNoteFixture.contentId);
    expect(body.byteSize).toBe(voiceNoteFixture.byteSize);
    expect(body.acquisitionMethod).toBe("VOICE_NOTE");
    expect(body.acquisitionMetadata["session.id"]).toBe("session-2026-0007");
    expect(body.acquisitionMetadata["capture.kind"]).toBe("voice");
    expect(body.acquisitionMetadata["voice.duration.ms"]).toBe("18400");
    expect(body.acquisitionMetadata["voice.sample.rate.hz"]).toBe("48000");
    expect(body.acquisitionMetadata["voice.language.hint"]).toBe("en");
    // The committed fixture types these EXACT keys the same way: strings,
    // string-encoded integers (the contract's own rule).
    expect(typeof voiceNoteFixture.acquisitionMetadata["voice.duration.ms"]).toBe("string");
    expect(voiceNoteFixture.acquisitionMetadata["voice.duration.ms"]).toBe("18400");
    expect(voiceNoteFixture.acquisitionMetadata["voice.sample.rate.hz"]).toBe("48000");
    expect(voiceNoteFixture.acquisitionMetadata["voice.language.hint"]).toBe("en");
    expect(body.acquisitionMetadata["voice.duration.ms"]).toBe(
      voiceNoteFixture.acquisitionMetadata["voice.duration.ms"],
    );
    expect(body.acquisitionMetadata["voice.sample.rate.hz"]).toBe(
      voiceNoteFixture.acquisitionMetadata["voice.sample.rate.hz"],
    );
    expect(body.acquisitionMetadata["voice.language.hint"]).toBe(
      voiceNoteFixture.acquisitionMetadata["voice.language.hint"],
    );
  });

  test("the browser lane reports the WEAKER codec claim: audio/ogg answers ogg, the fixture's opus belongs to a device that knows its encoder", () => {
    const result = evidenceRegistrationRequestBody(
      voiceDraft({ durationMs: "18400", sampleRateHz: "48000", codec: "ogg" }),
    );
    if (!result.ok) {
      throw new Error("unreachable: the weaker codec claim must map");
    }
    expect(result.body.acquisitionMetadata["voice.codec"]).toBe("ogg");
    expect(voiceNoteFixture.acquisitionMetadata["voice.codec"]).toBe("opus");
    expect(result.body.acquisitionMetadata["voice.codec"]).not.toBe(
      voiceNoteFixture.acquisitionMetadata["voice.codec"],
    );
  });

  test("unmeasured keys are ABSENT from the wire body (never zero, never \"unknown\", never fabricated)", () => {
    const result = evidenceRegistrationRequestBody(
      voiceDraft({ durationMs: null, sampleRateHz: null, codec: null }),
    );
    if (!result.ok) {
      throw new Error("unreachable: the honest-absence draft must map");
    }
    const metadata = result.body.acquisitionMetadata;
    expect("voice.duration.ms" in metadata).toBe(false);
    expect("voice.sample.rate.hz" in metadata).toBe(false);
    expect("voice.codec" in metadata).toBe(false);
    expect("voice.language.hint" in metadata).toBe(false);
    // What IS honestly known still rides: the lane fact + the session id.
    expect(metadata["capture.kind"]).toBe("voice");
    expect(metadata["session.id"]).toBe("session-2026-0007");
  });

  test("a draft with NO voice metadata produces the byte-identical stills/video body (no voice keys at all)", () => {
    const result = evidenceRegistrationRequestBody({
      contentId: "a".repeat(64),
      byteSize: "2048",
      mediaType: "image/jpeg",
      capturedAt: "2026-09-29T07:52:07.720Z",
      acquisitionMethod: "STILL_IMAGERY",
      sessionId: "",
      voice: null,
    });
    if (!result.ok) {
      throw new Error("unreachable: the stills draft must map");
    }
    expect(result.body.acquisitionMethod).toBe("STILL_IMAGERY");
    expect(result.body.acquisitionMetadata).toEqual({});
  });

  test("the voice lane's named defects: non-integer duration, invalid sample rate, over-long hint", () => {
    expect(
      validateEvidenceRegistrationDraft(
        voiceDraft({ durationMs: "18.4", sampleRateHz: "48000", codec: "ogg" }),
      ),
    ).toContain(
      "voice duration must be a string-encoded non-negative integer of milliseconds, or absent",
    );
    expect(
      validateEvidenceRegistrationDraft(
        voiceDraft({ durationMs: "18400", sampleRateHz: "0", codec: "ogg" }),
      ),
    ).toContain(
      "voice sample rate must be a string-encoded positive integer of hertz, or absent",
    );
    expect(
      validateEvidenceRegistrationDraft(
        voiceDraft({
          durationMs: "18400",
          sampleRateHz: "48000",
          codec: "ogg",
          languageHint: "x".repeat(33),
        }),
      ),
    ).toContain(
      "voice language hint must be at most 32 characters (an advisory tag, e.g. en, de-CH)",
    );
    // The honest draft carries zero defects.
    expect(
      validateEvidenceRegistrationDraft(
        voiceDraft({ durationMs: "18400", sampleRateHz: "48000", codec: "ogg" }),
      ),
    ).toEqual([]);
  });
});
