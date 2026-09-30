/**
 * VOICE-002 — the voice-note CAPTURE surface tests (the client lane over
 * the landed VOICE-001 contract).
 *
 * The capture-mission.test.tsx discipline: static renders of pure
 * projections (renderToStaticMarkup — no network, no clock, no randomness)
 * + typed seam tests with stubbed transports. Every explicit state is
 * pinned:
 *  - the audio entry's honest states (demo notice, Web-Crypto unavailable,
 *    measured metadata with unmeasured keys ABSENT, the measuring state,
 *    the STORED outcome);
 *  - the SAME registration panel carrying the voice lane additively
 *    (and NOT carrying it for stills — the regression);
 *  - the client transcript state — BOTH designed states: the explicit calm
 *    `asr_provider_not_configured` no-transcript state (this deployment's
 *    actual state) and the provider-configured derived-candidate render
 *    with its provenance link;
 *  - the evidence read-view seam (GET /v1/evidence/:contentId) with its
 *    typed failures;
 *  - the kind badge on the evidence lists (voice-note for VOICE_NOTE from
 *    the same mapping the other kinds badge through).
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EvidenceRegistrationPanel,
  VoiceNoteCaptureCardBody,
  VoiceNoteTranscriptBody,
  type VoiceNoteTranscriptResource,
} from "./surfaces/CaptureMission";
import { SiteTwinBody } from "./surfaces/SiteTwin";
import {
  loadEvidenceReadViewLive,
  type CaptureAssetUploadRecord,
  type DerivationView,
  type EvidenceReadView,
  type FetchLike,
  type ProvenanceLinkView,
} from "./api";
import type { EvidencePaneView } from "../shell";
import { ASR_TRANSCRIPTION_METHOD } from "../../../../packages/shared-contracts/src/index";
import { voiceNoteTranscriptState } from "./voice-note";

const noop = () => {};
const PROJECT = "proj-riverside-refit";

const VOICE_NOTE_ID = "c30ef5571e696486cf6cc59e22f90ddcf74fe6532c4361225d0b6821a4754c23";
const TRANSCRIPT_ID = "55015939de43a3a8b5568b58f40e6588c05045a1bb2c0fde5c4bc0c280f4e81b";

/** The upload's own record for a stored voice note (verbatim fields). */
const voiceUpload: CaptureAssetUploadRecord = {
  outcome: "STORED",
  contentId: VOICE_NOTE_ID,
  byteSize: 148932,
  mediaType: "audio/ogg",
};

/** A non-fetching transport (never called in static renders). */
const neverFetch: FetchLike = (input) =>
  Promise.reject(new Error(`no transport expected in a static render (${input})`));

/** The loaded transcript resource for one read view's own sets. */
function transcriptState(
  inputsOf: readonly DerivationView[],
  asObject: readonly ProvenanceLinkView[],
): VoiceNoteTranscriptResource {
  return { kind: "loaded", state: voiceNoteTranscriptState(inputsOf, asObject) };
}

/** The evidence read view with the given derivations and links. */
function readView(
  inputsOf: readonly DerivationView[],
  asObject: readonly ProvenanceLinkView[],
): EvidenceReadView {
  return {
    evidence: {
      contentId: VOICE_NOTE_ID,
      acquisitionMethod: "VOICE_NOTE",
      mediaType: "audio/ogg",
      byteSize: 148932,
      capturedAt: "2026-01-15T09:41:03.000Z",
      acquisitionMetadata: {
        "capture.kind": "voice",
        "voice.codec": "ogg",
        "voice.duration.ms": "18400",
        "voice.sample.rate.hz": "48000",
      },
    },
    invalidation: null,
    provenance: { asSubject: [], asObject },
    derivations: { inputsOf, derivedFrom: [] },
  };
}

/* ------------------------------------------------------------------ */
/* The audio entry's honest states                                     */
/* ------------------------------------------------------------------ */

describe("VOICE-002 the audio upload entry (VoiceNoteCaptureCardBody)", () => {
  test("demo mode disables submission with the honest never-fabricate notice (the same discipline as stills)", () => {
    const html = renderToStaticMarkup(
      <VoiceNoteCaptureCardBody
        projectId={PROJECT}
        demo={true}
        digestAvailable={true}
        file={null}
        reading={false}
        measurement={null}
        submitting={false}
        outcome={null}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-demo-notice="true"');
    expect(html).toContain("the shell never fabricates writes");
    expect(html).toContain('data-submit-state="demo"');
  });

  test("a platform without Web Crypto renders the explicit blocked reason (never a fallback hash)", () => {
    const html = renderToStaticMarkup(
      <VoiceNoteCaptureCardBody
        projectId={PROJECT}
        demo={false}
        digestAvailable={false}
        file={null}
        reading={false}
        measurement={null}
        submitting={false}
        outcome={null}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-digest-unavailable="true"');
    expect(html).toContain("never falls back to an unverified address");
    expect(html).toContain('data-submit-state="no-digest"');
  });

  test("a measured selection renders the honest metadata display — measured keys shown, values only the platform observed", () => {
    const html = renderToStaticMarkup(
      <VoiceNoteCaptureCardBody
        projectId={PROJECT}
        demo={false}
        digestAvailable={true}
        file={{ name: "site-walkthrough.ogg", byteSize: 148932, mediaType: "audio/ogg" }}
        reading={false}
        measurement={{
          kind: "measured",
          measured: { codec: "ogg", durationMs: "18400", sampleRateHz: "48000" },
        }}
        submitting={false}
        outcome={null}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-voice-metadata="true"');
    expect(html).toContain('data-voice-key="voice.codec"');
    expect(html).toContain("ogg");
    expect(html).toContain("18400");
    expect(html).toContain("48000");
    expect(html).toContain('data-submit-state="ready"');
  });

  test("unmeasured keys render as the explicit not-asserted absence — never zero, never \"unknown\", never fabricated", () => {
    const html = renderToStaticMarkup(
      <VoiceNoteCaptureCardBody
        projectId={PROJECT}
        demo={false}
        digestAvailable={true}
        file={{ name: "site-walkthrough.ogg", byteSize: 148932, mediaType: "audio/ogg" }}
        reading={false}
        measurement={{
          kind: "measured",
          measured: { codec: "ogg", durationMs: null, sampleRateHz: null },
        }}
        submitting={false}
        outcome={null}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-voice-metadata="true"');
    expect(html).toContain("not measurable on this platform — the key is not asserted");
    expect(html).toContain("not decodable on this platform — the key is not asserted");
    // Never a fabricated zero for an unmeasured numeric key.
    expect(html).not.toContain("0 ms");
  });

  test("the measuring state is explicit and holds the submit (no silently dropped measurable keys)", () => {
    const html = renderToStaticMarkup(
      <VoiceNoteCaptureCardBody
        projectId={PROJECT}
        demo={false}
        digestAvailable={true}
        file={{ name: "site-walkthrough.ogg", byteSize: 148932, mediaType: "audio/ogg" }}
        reading={false}
        measurement={{ kind: "measuring" }}
        submitting={false}
        outcome={null}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-voice-measuring="true"');
    expect(html).toContain('data-submit-state="measuring"');
    expect(html).not.toContain('data-voice-metadata="true"');
  });

  test("the STORED outcome states the verbatim gateway fields", () => {
    const html = renderToStaticMarkup(
      <VoiceNoteCaptureCardBody
        projectId={PROJECT}
        demo={false}
        digestAvailable={true}
        file={{ name: "site-walkthrough.ogg", byteSize: 148932, mediaType: "audio/ogg" }}
        reading={false}
        measurement={{
          kind: "measured",
          measured: { codec: "ogg", durationMs: "18400", sampleRateHz: "48000" },
        }}
        submitting={false}
        outcome={{
          kind: "stored",
          record: voiceUpload,
          endpoint: `/v1/capture/assets/${VOICE_NOTE_ID}`,
        }}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-outcome="stored"');
    expect(html).toContain("Stored server-side.");
    expect(html).toContain(VOICE_NOTE_ID);
  });
});

/* ------------------------------------------------------------------ */
/* The registration panel (the SAME single path, additively voice-aware) */
/* ------------------------------------------------------------------ */

describe("VOICE-002 the registration panel (the voice lane rides the same path)", () => {
  test("the voice measurement renders the honest metadata and the one user-entered advisory field", () => {
    const html = renderToStaticMarkup(
      <EvidenceRegistrationPanel
        projectId={PROJECT}
        fetchImpl={neverFetch}
        record={voiceUpload}
        capturedAtDefault="2026-01-15T09:41:03.000Z"
        voiceMeasurement={{
          kind: "measured",
          measured: { codec: "ogg", durationMs: "18400", sampleRateHz: null },
        }}
      />,
    );
    expect(html).toContain('data-voice-metadata="true"');
    expect(html).toContain("18400");
    expect(html).toContain("not decodable on this platform — the key is not asserted");
    expect(html).toContain("Spoken-language hint (optional)");
    expect(html).toContain("voice.language.hint");
    expect(html).toContain("never an authoritative language determination");
    expect(html).toContain("VOICE_NOTE");
    expect(html).toContain('data-submit-state="ready"');
  });

  test("the measuring state holds registration (the draft waits for the platform's own measurement)", () => {
    const html = renderToStaticMarkup(
      <EvidenceRegistrationPanel
        projectId={PROJECT}
        fetchImpl={neverFetch}
        record={voiceUpload}
        capturedAtDefault="2026-01-15T09:41:03.000Z"
        voiceMeasurement={{ kind: "measuring" }}
      />,
    );
    expect(html).toContain('data-voice-measuring="true"');
    expect(html).toContain('data-submit-state="measuring"');
    expect(html).toContain("Measuring the audio");
  });

  test("a stills registration (no voice props) renders NO voice UI at all — the flow is unchanged", () => {
    const html = renderToStaticMarkup(
      <EvidenceRegistrationPanel
        projectId={PROJECT}
        fetchImpl={neverFetch}
        record={{
          outcome: "STORED",
          contentId: "a".repeat(64),
          byteSize: 2048,
          mediaType: "image/jpeg",
        }}
        capturedAtDefault="2026-09-29T07:52:07.720Z"
      />,
    );
    expect(html).toContain('data-submit-state="ready"');
    expect(html).not.toContain('data-voice-metadata="true"');
    expect(html).not.toContain("Spoken-language hint");
    expect(html).not.toContain("voice.language.hint");
    expect(html).not.toContain('data-voice-measuring="true"');
    expect(html).toContain("STILL_IMAGERY");
  });
});

/* ------------------------------------------------------------------ */
/* The client transcript state (BOTH designed states)                  */
/* ------------------------------------------------------------------ */

describe("VOICE-002 the client transcript state (VoiceNoteTranscriptBody)", () => {
  test("the no-provider state: an empty derivations set renders the explicit calm asr_provider_not_configured state — never an error, never a transcript", () => {
    const html = renderToStaticMarkup(
      <VoiceNoteTranscriptBody
        projectId={PROJECT}
        contentId={VOICE_NOTE_ID}
        resource={transcriptState([], [])}
      />,
    );
    expect(html).toContain('data-transcript-state="no-transcript"');
    expect(html).toContain("No transcript exists");
    expect(html).toContain("asr_provider_not_configured");
    expect(html).toContain("provider-gated derivation");
    expect(html).toContain("Nothing is fabricated here and nothing is lost");
    // A calm informational state: no error styling, no retry button.
    expect(html).not.toContain("state-error");
    expect(html).not.toContain("Try again");
    expect(html).not.toContain("transcript exists" + " — DERIVED");
  });

  test("the provider-configured state: an ASR derivation renders the DERIVED CANDIDATE with its provenance link", () => {
    const derivation: DerivationView = {
      derivationId: "derivation-204-voice-transcript-001",
      outputContentId: TRANSCRIPT_ID,
      inputEvidenceContentIds: [VOICE_NOTE_ID],
      method: ASR_TRANSCRIPTION_METHOD,
      methodVersion: "1.2.0+model.asr-7b-q5",
      parameters: { "asr.language": "en", "asr.model": "asr-7b-q5" },
      createdAt: "2026-01-15T09:42:31.000Z",
    };
    const link: ProvenanceLinkView = {
      subjectKind: "evidence",
      subjectId: TRANSCRIPT_ID,
      evidenceContentId: VOICE_NOTE_ID,
      role: "DERIVED_FROM",
    };
    const html = renderToStaticMarkup(
      <VoiceNoteTranscriptBody
        projectId={PROJECT}
        contentId={VOICE_NOTE_ID}
        resource={transcriptState([derivation], [link])}
      />,
    );
    expect(html).toContain('data-transcript-state="derived-candidate"');
    expect(html).toContain("DERIVED CANDIDATE, never");
    expect(html).toContain("transcription.asr");
    expect(html).toContain("1.2.0+model.asr-7b-q5");
    expect(html).toContain(TRANSCRIPT_ID);
    expect(html).toContain("DERIVED_FROM");
    expect(html).toContain("never authoritative text");
  });

  test("the loading state renders the labelled skeleton (never a bare spinner)", () => {
    const html = renderToStaticMarkup(
      <VoiceNoteTranscriptBody
        projectId={PROJECT}
        contentId={VOICE_NOTE_ID}
        resource={{ kind: "loading" }}
      />,
    );
    expect(html).toContain("state-loading");
    expect(html).toContain("Reading the evidence read view");
  });

  test("a typed read failure renders verbatim (the read view's own reason, never a generic error)", () => {
    const html = renderToStaticMarkup(
      <VoiceNoteTranscriptBody
        projectId={PROJECT}
        contentId={VOICE_NOTE_ID}
        resource={{
          kind: "failed",
          detail: "HTTP 404 — evidence_not_found: no evidence record is registered under this content id",
        }}
      />,
    );
    expect(html).toContain("state-error");
    expect(html).toContain("evidence_not_found");
    expect(html).toContain("This data could not be loaded");
  });
});

/* ------------------------------------------------------------------ */
/* The evidence read-view seam (typed, stubbed transport)               */
/* ------------------------------------------------------------------ */

describe("VOICE-002 loadEvidenceReadViewLive (the GET /v1/evidence/:contentId seam)", () => {
  test("a 200 read view answers the verbatim record and both-direction graph sets", async () => {
    const derivation: DerivationView = {
      derivationId: "derivation-204-voice-transcript-001",
      outputContentId: TRANSCRIPT_ID,
      inputEvidenceContentIds: [VOICE_NOTE_ID],
      method: ASR_TRANSCRIPTION_METHOD,
      methodVersion: "1.2.0+model.asr-7b-q5",
      parameters: { "asr.language": "en" },
      createdAt: "2026-01-15T09:42:31.000Z",
    };
    let seen: { input: string; init?: RequestInit } | null = null;
    const fetchImpl: FetchLike = async (input, init) => {
      seen = { input, init };
      return new Response(
        JSON.stringify({
          ok: true,
          ...readView([derivation], []),
        }),
        { status: 200 },
      );
    };
    const result = await loadEvidenceReadViewLive(fetchImpl, VOICE_NOTE_ID);
    expect(result.ok).toBe(true);
    expect(seen!.input).toBe(`/v1/evidence/${VOICE_NOTE_ID}`);
    expect(seen!.init).toBe(undefined);
    if (result.ok) {
      expect(result.view.evidence.acquisitionMethod).toBe("VOICE_NOTE");
      expect(result.view.derivations.inputsOf.length).toBe(1);
      expect(result.view.derivations.inputsOf[0]!.method).toBe("transcription.asr");
    }
  });

  test("the typed 404 (evidence_not_found) surfaces verbatim", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: "evidence_not_found",
          detail: "no evidence record is registered under this content id",
        }),
        { status: 404 },
      );
    const result = await loadEvidenceReadViewLive(fetchImpl, "f".repeat(64));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("http");
      if (result.failure.kind === "http") {
        expect(result.failure.status).toBe(404);
        expect(result.failure.code).toBe("evidence_not_found");
      }
    }
  });

  test("a structurally invalid 2xx answer is the explicit invalid failure (never coerced)", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ ok: true, evidence: "not-an-object" }), {
        status: 200,
      });
    const result = await loadEvidenceReadViewLive(fetchImpl, VOICE_NOTE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("invalid");
      expect(result.failure.detail).toContain("evidence must be an object");
    }
  });
});

/* ------------------------------------------------------------------ */
/* The kind badge on the evidence lists                                 */
/* ------------------------------------------------------------------ */

function evidenceView(
  acquisitionMethod: string,
  mediaType: string,
): EvidencePaneView {
  const source = { module: "evidence" as const, recordId: VOICE_NOTE_ID };
  return {
    source,
    projectId: PROJECT,
    evidenceId: VOICE_NOTE_ID,
    acquisitionMethod: { value: acquisitionMethod, source },
    mediaType: { value: mediaType, source },
    byteSize: { value: 148932, source },
    capturedAt: { value: "2026-01-15T09:41:03.000Z", source },
    invalidationReason: null,
    relatedCaseIds: [],
  };
}

describe("VOICE-002 the kind badge on the evidence lists", () => {
  test("the SiteTwin evidence card renders the voice-note badge for VOICE_NOTE (the record's own word stays inspectable in the title)", () => {
    const html = renderToStaticMarkup(
      <SiteTwinBody
        data={{
          mode: "api",
          projectId: PROJECT,
          workspace: null,
          reality: null,
          evidence: [evidenceView("VOICE_NOTE", "audio/ogg")],
        }}
        selectedNodeId={null}
        onSelectNode={() => {}}
      />,
    );
    expect(html).toContain("voice-note");
    expect(html).toContain('title="VOICE_NOTE"');
    expect(html).toContain("audio/ogg");
  });

  test("the same mapping badges the other kinds identically (still-imagery, video-footage — no special case for voice)", () => {
    const html = renderToStaticMarkup(
      <SiteTwinBody
        data={{
          mode: "api",
          projectId: PROJECT,
          workspace: null,
          reality: null,
          evidence: [
            evidenceView("STILL_IMAGERY", "image/jpeg"),
            evidenceView("VIDEO_FOOTAGE", "video/mp4"),
          ],
        }}
        selectedNodeId={null}
        onSelectNode={() => {}}
      />,
    );
    expect(html).toContain("still-imagery");
    expect(html).toContain('title="STILL_IMAGERY"');
    expect(html).toContain("video-footage");
    expect(html).toContain('title="VIDEO_FOOTAGE"');
  });
});
