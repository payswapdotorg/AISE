# VOICE-002 — Voice-note capture in the web Capture surface (the client lane)

**Work order:** `docs/voice-notes-work-orders-2026-09-29.md` (VOICE-002)
**Authorization basis:** VOICE-001's deliberate client-lane deferral — the contract
(1.1.0) landed, merged `a409603`, deployed and re-proven at production (POST-012
`0b96844`); this work order is the WEB client lane over that UNCHANGED contract.
**Program basis:** layered-competitive-parity scorecard open item 3 (L1) — OpenSpace
captures voice on site.
**Scope held:** web client only. No file under `backend/`,
`packages/shared-contracts/`, or `apps/android/` is touched; the `AsrProvider` seam
is untouched (provider-gated by design — wiring an engine is a governed backend
work order); no backend transcript-state route is added (VOICE-001 added none and
this work order adds none — the client derives the state from the read view's own
derivations set, which is inspectable today).

## 1. The acquisition lane (what the web Capture surface gained)

A dedicated audio-accepting entry — `VoiceNoteCapturePanel` /
`VoiceNoteCaptureCardBody` in `apps/web/src/app/surfaces/CaptureMission.tsx` —
mounted on the Capture surface after the generic upload entry. The lane reuses
EVERY seam the stills/video lanes use, unchanged:

| Leg | Seam (reused, not forked) | Notes |
| --- | --- | --- |
| file entry | `<input type="file" accept="audio/*">` | the instructed minimum — a dedicated audio-accepting entry |
| content address | `webCryptoSha256()` | the TRANSPORT content address; the gateway re-verifies server-side |
| upload | `uploadCaptureAssetLive()` → `POST /v1/capture/assets/:contentId` | the capture gateway is already media-type-agnostic (VOICE-001's own conformance uploaded `audio/ogg` through it) |
| registration | the SINGLE `EvidenceRegistrationPanel` → `registerEvidenceLive()` → `POST /v1/evidence` | `acquisitionMethod: "VOICE_NOTE"` (the honest prefill via `defaultAcquisitionMethod("audio/…")`, kept) — one registration path extended for the voice draft, never forked |
| pinning gate | unchanged | the audio bytes must be uploaded before registration; a `content_not_pinned` refusal surfaces verbatim |

The explicit states hold for the voice lane exactly as for stills: the demo-mode
never-fabricate notice, the Web-Crypto-unavailable honest block (never a fallback
hash), and the typed upload/registration failures verbatim.

## 2. The metadata honesty rules (measured vs. never asserted)

The canonical keys are the 1.1.0 contract's own (`voice.duration.ms`,
`voice.codec`, `voice.sample.rate.hz`, `voice.language.hint` — all strings;
numerics string-encoded integers). The browser lane asserts ONLY what it can
actually know (`apps/web/src/app/voice-note.ts`):

| Key | Source | Rule |
| --- | --- | --- |
| `voice.codec` | `voiceCodecFromMediaType(file.type)` | the media SUBTYPE of the browser-reported media type, parameters stripped (`audio/ogg; codecs=opus` → `ogg`) — the weaker observable claim. The contract fixture's `opus` belongs to a field device that knows its encoder; the browser lane never guesses an encoder behind a container. |
| `voice.duration.ms` | `HTMLMediaElement` metadata | measured when the platform can load it; honestly `null` (key absent) when it cannot |
| `voice.sample.rate.hz` | Web Audio `decodeAudioData` → `AudioBuffer.sampleRate` | measured on a COPY of the bytes (`decodeAudioData` detaches its input — the upload's own bytes stay intact); honestly `null` when undecodable |
| `voice.language.hint` | the ONE user-entered field | optional advisory (the contract's own header: a hint for ASR providers and UIs, never an authoritative determination); absent by default |
| `capture.kind` | the operator's lane choice | `"voice"` — a fact, not an inference |

Absence renders as absence — never zero, never "unknown", never fabricated: the
draft carries `string | null` per key and `evidenceRegistrationRequestBody` simply
does not assert a `null` key. The display states the explicit "the key is not
asserted" per unmeasured key; the wire body omits it. The platform probe
(`browserVoiceNoteAudioProbe`) holds registration while measuring
(`data-voice-measuring`, submit `data-submit-state="measuring"`) so no
honestly-measurable key is silently dropped.

## 3. The registration conformance (the exact wire body, checked against the fixtures)

`evidenceRegistrationRequestBody` maps a validated voice draft to the EXACT
Evidence document: `contractVersion` pinned to the shared `CONTRACT_VERSION`
constant (never a literal), `acquisitionMethod: "VOICE_NOTE"`, the voice keys
riding `acquisitionMetadata` alongside `session.id`. Test
`a measured voice draft maps to the EXACT Evidence document with the canonical
voice keys as strings` (apps/web/src/app/voice-note.test.ts) checks the body
against the committed fixture `Evidence.valid-voice-note.json`
(`packages/shared-contracts/fixtures/evidence/`):

- `voice.duration.ms: "18400"`, `voice.sample.rate.hz: "48000"`,
  `voice.language.hint: "en"` — byte-identical string values to the fixture's own;
- `contractVersion` equals the fixture's (`1.1.0`) through the shared constant;
- the WEAKER codec claim is proven by contrast: the lane sends `ogg` for
  `audio/ogg` where the fixture's field device sends `opus`;
- `unmeasured keys are ABSENT from the wire body` proves a null-measurement draft
  carries NO voice keys (only `capture.kind` + `session.id`) — absence, not defaults;
- `a draft with NO voice metadata produces the byte-identical stills/video body`
  proves the stills/video wire body is unchanged (empty metadata map);
- the named defects are typed: non-integer duration, non-positive sample rate,
  over-long (33-char) language hint — each refused by name.

## 4. The honest no-transcript state (client-only, BOTH designed states proven)

No backend transcript-state route exists and none is added. The client derives
the state (`voiceNoteTranscriptState`, apps/web/src/app/voice-note.ts) from the
evidence read view's own sets — loaded through the NEW read seam
`loadEvidenceReadViewLive()` (`GET /v1/evidence/:contentId`, additive in
`apps/web/src/app/api.ts`; the signature of `uploadCaptureAssetLive` /
`registerEvidenceLive` / `loadEvidenceIndexLive` is untouched) from
`derivations.inputsOf` + `provenance.asObject`.

| State | Derivation rule | Test (expected outcome) |
| --- | --- | --- |
| NO_TRANSCRIPT | no `transcription.asr` entry in `inputsOf` | `an empty derivations set is the explicit calm asr_provider_not_configured state — never an error, never a transcript` (VoiceNoteTranscriptBody renders `data-transcript-state="no-transcript"`, the reason word `asr_provider_not_configured` — the contract's own vocabulary and this deployment's ACTUAL state; no error state, no retry, no fabricated transcript). Non-ASR derivations never fabricate a transcript: `reconstruction.worldsculpt` in `inputsOf` still renders the no-transcript state. |
| TRANSCRIPT_AVAILABLE | a `transcription.asr` entry present (the future provider-configured path) | `an ASR derivation renders the DERIVED CANDIDATE with its provenance link` — the method identity, `methodVersion` (the ASR engine/model identity), the `outputContentId` of the content-addressed transcript artifact, and the `DERIVED_FROM` linkage (the link whose subject IS the transcript artifact); presented as a DERIVED CANDIDATE, never authoritative text. `the committed transcription.asr fixture itself maps through` proves the client state derives from the real wire shape. Several derivations surface the canonically-first as primary (append-only journal) with the later ones counted. |

The seam itself is typed-test-proven: a 200 read view answers the verbatim record
and both-direction graph sets; the typed 404 `evidence_not_found` surfaces
verbatim; a structurally invalid 2xx is the explicit invalid failure (never
coerced).

## 5. The kind badge (voice notes are not a special case)

`apps/web/src/app/evidence-kind.ts` — ONE mapping built from the closed
`EVIDENCE_ACQUISITION_METHODS` vocabulary: `VOICE_NOTE` → `voice-note`,
`STILL_IMAGERY` → `still-imagery`, `VIDEO_FOOTAGE` → `video-footage`, … A word
outside the closed vocabulary renders VERBATIM (never re-authored). The SiteTwin
evidence card and the EngineeringCase case-evidence card render the badge in the
existing tag pattern (`<span class="tag" title="…">`), the record's own
UPPER_SNAKE word staying inspectable in the tag's `title` (the pinned
post007 assertion `markup.includes("STILL_IMAGERY")` stays green). Tests:
`VOICE_NOTE renders voice-note`, `the same mapping badges the other kinds
identically`, and the two SiteTwinBody static renders.

## 6. Tests (the capture-mission discipline)

Static renders of pure projections (`renderToStaticMarkup` — no network, no
clock, no randomness) + typed seam tests with stubbed transports:

- `apps/web/src/app/voice-note.test.ts` — the pure logic: codec derivation
  (the weaker claim, parameters stripped), the transcript state (both states,
  non-ASR never fabricating, the committed derivation fixture mapping through),
  the kind badge mapping, and the registration wire body vs. the committed
  fixtures (measured keys as strings, unmeasured keys ABSENT, the stills body
  unchanged, the named defects).
- `apps/web/src/app/voice-note-surface.test.tsx` — the surface states: the
  audio entry's demo notice / Web-Crypto block / measured display /
  measuring state / STORED outcome; the registration panel carrying the voice
  lane additively (and a stills registration rendering NO voice UI — the
  regression); BOTH transcript render paths; the read-view seam (200 / typed
  404 / invalid 2xx); the kind badge on the SiteTwin evidence card.

37 new tests. The existing stills/video upload + registration tests
(capture-mission.test.tsx, evidence-registration.test.ts, post007, golden
journey, evidence envelope, conformance …) stay green and unmodified.

## 7. Gate

`bun run verify` (typecheck → lint → test → boundaries) at the delivered tree
(branch `work/voice-002`, base `d807b73`; the work-order report carries the
commit sha):
**PASS** — 6342 tests, 0 fail (37 new tests over the 6305 baseline), ~81.1k
expect() calls across 418 files (the exact count varies by ±1 between runs —
the QA-003 live-API test probes the real deployment); 0 boundary violations
across 1089 scanned source files. Note: `QA-003 live proof — the ephemerality
honesty` (apps/web/src/app/boq-flow-live.test.tsx) drives the REAL deployed
Vercel instance and is routing-dependent by its own subject — it can flake on
any tree (identically before and after this change); it passed in the recorded
gate run.

## 8. Hand-off notes for the Android field-capture follow-up (the next work order)

1. **The same contract keys.** The Android lane registers the SAME exact
   Evidence document over the same seams it already uses
   (`acquisitionMethod: "VOICE_NOTE"` with the canonical voice keys as strings,
   string-encoded integers for numerics). The four `voice.*` naming constants
   belong in `AcquisitionMetadataKeys` (Kotlin) when the audio capture path is
   built — VOICE-001 §5 deliberately deferred them.
2. **The honest metadata scales UP, not down.** A field device KNOWS its
   encoder: the contract fixture's `voice.codec: "opus"` is the honest claim a
   device-side MediaRecorder can make (its own encoder configuration), plus
   `voice.sample.rate.hz`/`voice.duration.ms` from the recorder's own
   AudioRecord format. The web lane's weaker `ogg` claim is the FLOOR of the
   discipline, not its ceiling — assert what YOUR platform actually knows.
   `device.id` and `acquisition.sensorId` (e.g. `bottom-mic`) ride the same open
   map the field journey already records.
3. **The transcript state is derivable today.** The same client-only rule
   applies: `GET /v1/evidence/:contentId` answers `derivations.inputsOf`;
   an entry with `method === "transcription.asr"` is a transcript candidate
   (its `outputContentId` is the content-addressed transcript artifact,
   `text/plain`). The explicit `asr_provider_not_configured` no-transcript
   state is the deployment's actual state — surface it calmly, never as an
   error, never with a fabricated transcript. (VOICE-001 README §5 point 2
   suggested wiring an HTTP route for it when the client lane lands — this
   work order deliberately did NOT; the read view is sufficient and adding
   routes is a backend concern. If the Android lane prefers a dedicated
   endpoint, that is a governed additive backend work order.)
4. **Device-side proof.** Cite the E2B station trio —
   `./gradlew :core:test :app:test :app:assembleDebug` on the PROD-032 E2B
   Android development station — and mirror the web lane's test discipline
   (pure-projection renders + typed seam tests; the kind badge is the same
   kebab-case mapping — `voice-note` from the one table).
