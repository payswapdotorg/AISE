# VOICE-001 — Voice notes as an evidence kind (contract + API conformance)

**Work order:** `docs/voice-notes-evidence-work-orders-2026-09-29.md` (VOICE-001)
**Authorization basis:** layered-competitive-parity scorecard open item 3 (L1) — OpenSpace
captures voice on site; AISE's acquisition methods covered stills/video only.
**Scope held:** contract + server/API semantic conformance. No client UI/UX work
(the PROD-016 pattern: contract first, clients follow in a separate work order).

## 1. The contract delta

| Surface | Before | After |
| --- | --- | --- |
| `EVIDENCE_METHODS` (shared-contracts `evidence.ts`) | 10 values | 11 values — `VOICE_NOTE` appended (append-only position; Android enum and web mirror follow 1:1) |
| `ACQUISITION_METADATA_KEYS` | 5 well-known keys | 9 — plus `voice.duration.ms`, `voice.codec`, `voice.sample.rate.hz`, `voice.language.hint` (string-valued; numeric values string-encoded integers; semantics documented in the contract header) |
| ASR derivation method identity | — | `ASR_TRANSCRIPTION_METHOD = "transcription.asr"` (exported; provider-neutral; no engine is an authority) |
| `Derivation` shape | generic | unchanged — the transcription contract is a *disciplined instance*: input = the voice-note content id, output = the content-addressed transcript artifact, `methodVersion` = the ASR engine/model identity, `parameters` = deterministic string map (`asr.language`, `asr.model`, `asr.encoding`, ...) |
| Contract version | `1.0.0` | `1.1.0` (MINOR bump — additive only: new enum value, new well-known keys, new constant; no removal, no narrowing) |
| JSON Schemas + fixtures | 1.0.0 set | regenerated (`bun run gen:schemas`, zero-byte diff on a clean tree); all 40 same-major fixtures re-versioned; 3 new fixtures: `Evidence.valid-voice-note.json`, `Derivation.valid-transcription.json`, `Evidence.invalid-acquisition-method.json` |

**Provenance rule (load-bearing):** a transcript is a DERIVED CANDIDATE — never
authoritative text, never a rewrite of the raw evidence. The voice note stays
immutable and append-only; the transcript is linked through BOTH a `Derivation`
(method identity + version + deterministic parameters + ordered input content
ids — provenance-complete and replayable) and an evidence-to-evidence
`ProvenanceLink` with role `DERIVED_FROM`. The transcript artifact registers as
`INSTRUMENT_READING` (the ASR engine is the instrument; the transcript is its
reading) carrying `transcript.of` / `transcript.method` / `transcript.candidate`
metadata — it never claims field acquisition it does not have.

## 2. Honest degradation (provider-absent) — the proof

The backend surface is `backend/api/src/evidence/transcription.ts`:
`asrAvailability()` / `transcriptState(contentId)` / `deriveTranscript(contentId)`
over an injectable `AsrProvider` seam. No production ASR engine exists yet, so
the default deployment is provider-absent BY DESIGN — and that state is
explicit everywhere, mirroring the reconstruction provider discipline (PROD-009).

| Guarantee | Test (file `backend/api/src/evidence/transcription.test.ts`) | Expected outcome |
| --- | --- | --- |
| Voice-note registration succeeds with zero ASR wiring | `noAsrAnywhereInRegistration: registering a voice note needs zero ASR wiring (store-only service)` | `registered`, then `idempotent`; list returns the voice note |
| The no-transcript state is explicit + inspectable | `asrProviderNotConfigured: voice-note registration succeeds and the no-transcript state is explicit and inspectable` | `asrAvailability()` = `{ state: "asr_provider_not_configured" }`; `transcriptState()` = `{ kind: "NO_TRANSCRIPT", reason: "asr_provider_not_configured" }` |
| Derivation attempt without a provider: no error, no fabrication, no silent skip | `deriveTranscriptWithoutProviderIsAnExplicitNoTranscript: no error, no fabricated transcript, no silent skip` | returns `{ kind: "NO_TRANSCRIPT", reason: "asr_provider_not_configured" }`; exactly ONE evidence record exists (the voice note), zero derivations, zero links |
| A configured provider that refuses work is surfaced verbatim | `aRefusingProviderSurfacesItsReasonExplicitly (typed, never silent)` | `{ kind: "NO_TRANSCRIPT", reason: "provider_unavailable", detail: "audio format not supported by this engine" }` |
| HTTP read view keeps the absence inspectable | `register -> idempotent re-register -> get -> list -> provenance-link -> derivation (replayable)` (router.test.ts) | `GET /v1/evidence/:id` answers `derivations: { inputsOf: [], derivedFrom: [] }` while no transcript exists |

## 3. API conformance transcript (local stack, deterministic)

Suite: `backend/api/src/evidence/voice-note.test.ts` (service policy, in-memory
AND file-system stores) + `backend/api/src/evidence/router.test.ts` describe
block `evidence HTTP surface: VOICE-001 voice-note conformance` (real request
handler over `FsEvidenceStore`).

| Leg | Route / call | Outcome |
| --- | --- | --- |
| register | `POST /v1/evidence` (VOICE_NOTE, `audio/ogg`, canonical voice keys) | 200 `REGISTERED`; record verbatim |
| idempotent re-register | `POST /v1/evidence` (byte-identical) | 200 `IDEMPOTENT` |
| get | `GET /v1/evidence/:contentId` | 200 full read view; `invalidation: null`; empty derivation/provenance sets |
| list | `GET /v1/evidence` | the voice note present with `acquisitionMethod: "VOICE_NOTE"` |
| provenance-link | `POST /v1/evidence/provenance-links` (`property_assertion` subject, SUPPORTS) | 200 `LINKED`; exact duplicate `DUPLICATE` |
| derivation | `POST /v1/evidence/derivations` (`transcription.asr`, voice note input, registered transcript output) | 200 `RECORDED`; identical replay `DUPLICATE` (replayable) |
| pinning gate | upload audio via `POST /v1/capture/assets/:id` then register | unpinned register = 422 `content_not_pinned`; after pinning = 200 `REGISTERED` |
| immutability | derivation + link recorded over the voice note | voice-note record byte-identical before/after (`theDerivationCarriesADerivedFromProvenanceLinkAndNeverRewritesTheVoiceNote`) |

## 4. Mirror sync (the three-platform one-contract discipline)

- `apps/android/.../session/AcquisitionMethod.kt` — `VOICE_NOTE` appended at the
  same position (source-sync only; no Gradle run required by this work order's
  gate). The exhaustive consumers were synced in the same pass:
  `MissionCompatibilityChecker` table (VOICE_NOTE → device-independent; the
  frozen capability vocabulary has no microphone domain), `FieldJourney.exactCaptureAction`
  (`"Record voice note"`), and `CaptureContractVersion.V1` → `"1.1.0"` (the
  station cross-check reads the committed TS source).
- `apps/web/src/app/evidence-registration.ts` — the second enum mirror
  (`EVIDENCE_ACQUISITION_METHODS`) gains `VOICE_NOTE`, and
  `defaultAcquisitionMethod("audio/…")` now answers `VOICE_NOTE` (honest
  prefill; previously audio fell through to `DOCUMENT_REGION`). Pure
  contract-sync, no UI work.
- Backend exhaustive tables over `EvidenceMethod`: gaps
  `DEFAULT_METHOD_EFFORT` (`VOICE_NOTE: 0.2` — the HUMAN_ANSWER effort class:
  a quick operator-recorded capture), assurance `METHOD_CAPABILITY_FACT_KEYS`
  (`capability.voice_note`), mission planner (`alwaysAvailable("VOICE_NOTE")` —
  operator-recorded, not device-gated), reconstruction `METHOD_TO_MODALITY`
  (deliberately unmapped — a voice note provides no reconstruction input).

## 5. Hand-off notes for the follow-up client work order

What the web capture surface and the Android field capture will consume:

1. **Registration** — identical to every other evidence kind: `POST /v1/evidence`
   with `acquisitionMethod: "VOICE_NOTE"`, the audio media type
   (`audio/ogg`, `audio/mp4`, ...), and the canonical voice metadata keys
   (`voice.duration.ms`, `voice.codec`, `voice.sample.rate.hz`,
   `voice.language.hint` — all strings; producers may add their own keys).
   Under the pinning gate the audio bytes must be uploaded
   (`POST /v1/capture/assets/:contentId`) before registration.
2. **Transcript inspection** — the evidence read view
   (`GET /v1/evidence/:contentId`) exposes `derivations.inputsOf`: any entry
   with `method === "transcription.asr"` is a transcript candidate; its
   `outputContentId` is the content-addressed transcript artifact
   (`text/plain`). Server-side, `createTranscriptionService` answers the
   explicit state (`TRANSCRIPT_AVAILABLE` / `NO_TRANSCRIPT` + reason) — wire an
   HTTP route for it when the client lane lands (deliberately NOT added in
   VOICE-001; the work order's conformance list is the authority).
3. **The provider seam** — `AsrProvider` (`backend/api/src/evidence/transcription.ts`)
   is where a real ASR engine plugs in: implement `transcribe()` (deterministic,
   typed `TRANSCRIBED | TRANSCRIPTION_UNAVAILABLE`), wire it at server
   construction. With no provider the system behaves exactly as documented in
   §2 — registration works, transcripts are absent-but-explicit.
4. **Android advisory keys** — `AcquisitionMetadataKeys` (Kotlin) was
   intentionally NOT extended: those are naming conventions for the capture
   surface; the canonical vocabulary is AISE-003's. The field-capture work
   order should add the four `voice.*` constants there when it builds the
   audio capture path.
5. **Open design question for the lead** — the transcript artifact's
   `acquisitionMethod` is `INSTRUMENT_READING` + `transcript.*` metadata + a
   `DERIVED_FROM` link. If a dedicated method (e.g. `DERIVED_TEXT`) is
   preferred, that is a governed additive contract change on top of 1.1.0.

## 6. Gate

`bun run verify` (typecheck → lint → test → boundaries) at the delivered tree:
**PASS** — 6302 tests, 0 fail (41 new tests over the 6261 baseline), 0 boundary
violations across 1080+ scanned source files.
