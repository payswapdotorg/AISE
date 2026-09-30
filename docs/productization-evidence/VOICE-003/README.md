# VOICE-003 — Voice-note capture in the Android field app (the field lane over the VOICE-001 contract)

**Work order:** `docs/android-voice-work-orders-2026-09-29.md` (VOICE-003)
**Contract basis:** shared-contracts `1.1.0` — landed, deployed and journey-verified by VOICE-001 (`a409603`); frozen and UNCHANGED by this work order. Registration rides the ONE existing Android path: manifest → `CaptureSessionEnvelope` → `POST /v1/capture/assets/:contentId` + `POST /v1/capture/sync` (`HttpEvidenceSubmissionTransport`, media-type-agnostic — NO second path, NO direct `/v1/evidence` POST, NO fork).
**Base:** `5ef7e11` (main tip at branch start; the work order's authorization commit `71ad460` and the lead-side version-pin repair `50b66aa` are both in the ancestry).

## 1. The field lane (capture flow, permission model, commit protocol)

- **The voice entry** sits next to Still/Record in the capture controls (a Mic
  button + the optional spoken-language advisory field). `RECORD_AUDIO` is
  requested **mission-scoped at runtime FROM the voice entry** — the exact
  `permissionLauncher` pattern the camera permission already uses
  (`CaptureScreen.kt`): tapping Voice without the grant launches the request;
  with the grant it opens the voice segment. The voice entry stays **honestly
  reachable WITHOUT the camera**: a dedicated voice-only stage (session
  lifecycle + voice controls, no preview, no stills/video) renders below the
  permissions card when the camera was not granted — no camera is pretended.
- **State-driven like video:** a voice segment is a session ASSET under the
  open session; capture only while CAPTURING; **pause/finalize refuse while a
  voice segment is open** (the controller enforces it, the UI honestly
  disables); one in-flight recorder at a time (a video writer refuses while a
  voice segment is open and vice versa — the asset-id sequence demands it).
- **Commit protocol — the `VideoAssetWriter` protocol followed step-for-step**
  (`CaptureSessionController.beginVoiceAsset`/`closeVoiceAsset`/
  `discardVoiceAsset` + the `VoiceAssetWriter` handle): tmp file
  `tmp/<assetId>.<ext>.tmp` → the recorder writes → ONE sequential chunked
  hash over (payload, metadata) → journal `asset.captured` (fsync — the commit
  point) → atomic rename; `acquisitionMethod: VOICE_NOTE`; a discarded
  segment leaves no journal trace; crash mid-segment → recovery discards the
  tmp (never evidence) and the session continues. The video path was mirrored
  deliberately, NOT refactored — the stills/video commit code is
  byte-identical to the baseline (the protected-surface clause). Voice notes
  are NOT appended to the `LocalCaptureStore` (the 002 interface is
  ByteArray-based — the video discipline, documented in the README).
- **The microphone adapter** (`capture/platform/MicrophoneRecorderAdapter.kt`)
  follows the `CameraCaptureAdapter` platform-glue discipline: NOT
  unit-tested, exercised on the physical lane, every failure reported to the
  UI (the `ok=false` callback → the writer is discarded, the journal stays
  truthful), never a crash. `MediaRecorder` (AAC in MPEG_4, MIC source,
  48 kHz configured) + `MediaMetadataRetriever`/`MediaExtractor` measurement
  over the closed file.

## 2. Metadata honesty (what the device measures vs. never asserts)

| Key | Claim | Discipline |
| --- | --- | --- |
| `voice.codec` | **CONFIGURED** (`aac` for this adapter's profile) | The recorder's ACTUAL configured encoder — a fact the adapter states (it set it). This is the contract's device-that-knows-its-encoder case, **STRONGER than the web lane** (which reports the browser-observed container subtype and never guesses the encoder behind it). Never a guess behind a container, never invented. |
| `voice.duration.ms` | **MEASURED** when measurable | `MediaMetadataRetriever` over the committed file after the recorder closes it; honestly ABSENT when the platform cannot measure it. |
| `voice.sample.rate.hz` | **MEASURED** when measurable | `MediaExtractor` track format over the closed file; honestly ABSENT when not. |
| `voice.language.hint` | **USER-ENTERED** (optional advisory) | An optional operator field before recording; absent by default; never an authoritative language determination. |
| `capture.kind` | `"voice"` — a FACT | The operator chose the voice entry; composed by the view model as the lane fact. |
| `acquisition.sensorId` | e.g. `mic` | The adapter's audio source (a configuration fact); absent when not meaningful. |

All values are strings; numeric values string-encoded integers; absence
renders as absence — never zero, never "unknown", never fabricated (pinned by
`SessionManifestVoiceExporterTest`, `CaptureVoiceControllerTest`,
`CaptureVoiceViewModelTest` and the wire-body test). The station's SYNTHETIC
voice legs carry NO `voice.*` keys at all — nothing was measured or
configured there, so nothing is asserted.

## 3. Registration — the ONE existing path, extended

Each manifest voice asset IS the exact 1.1.0 `Evidence` document
(`contractVersion`/`contentId`/`byteSize`/`mediaType`/`capturedAt`/
`acquisitionMethod: VOICE_NOTE`/`acquisitionMetadata` — canonical voice keys
as strings). The bytes upload first (`POST /v1/capture/assets/:contentId`,
`Content-Type: audio/mp4` — the transport is media-type-agnostic; VOICE-001's
own conformance uploaded `audio/ogg` through the same gateway), then the
manifest rides `POST /v1/capture/sync` as the `CaptureSessionEnvelope`.
`contractVersion` is pinned to `CaptureContractVersion.CURRENT` everywhere
(manifest exporter, SyncBatch) — never a literal. **No direct
`POST /v1/evidence` call exists anywhere in the Android tree** (held by the
TS wiring test's source scan).

## 4. The transcript state — CLIENT-ONLY, both paths designed

The state derives from the evidence read view (`GET /v1/evidence/:contentId`
answers `derivations.inputsOf` + `provenance.asObject` — pinned by VOICE-001's
conformance) through the new read function `HttpEvidenceReadClient`
(`field/HttpEvidenceReadClient.kt` — the existing `open()`/`request()`
discipline of `HttpEvidenceSubmissionTransport`/`MobileAuthClient`; a READ
only). NO backend transcript-state route exists and none was added (backend
frozen).

- **No-provider path (this deployment's live state):** empty
  `derivations.inputsOf` → the explicit calm informational state
  `asr_provider_not_configured` (the contract's own vocabulary) — never an
  error, never a fabricated transcript, never a silent skip.
- **Provider-configured path:** a `transcription.asr` derivation → the DERIVED
  CANDIDATE rendering (method, methodVersion, the transcript artifact's
  content address) + its `DERIVED_FROM` provenance link — never authoritative
  text, never a rewrite of the raw evidence; the canonically-first derivation
  is primary and later candidates (provider version bumps) are counted.

**Tests proving both:** `HttpEvidenceReadClientTest` —
`an empty derivations set derives the explicit asr_provider_not_configured state`
and `a transcription asr derivation renders the derived candidate with its DERIVED_FROM link`
(plus non-ASR derivations never fabricating, several-candidates primary
selection, the typed refusals); `VoiceNoteTranscriptViewModelTest` —
`an empty derivations set renders the explicit asr_provider_not_configured informational state`
and `a transcription asr derivation renders the derived candidate with its provenance link`.
The station journey's `voice-transcript-state` leg (REAL read against the real
backend) records the no-provider answer verbatim.

## 5. Journey bookkeeping — no fork

`FieldJourneyRuntime.observeSessionEvidence` matched gap steps to assets by
`AcquisitionMethod` generically — untouched. `FieldJourney.exactCaptureAction`
already carried `"Record voice note"` for `VOICE_NOTE` (the VOICE-001 source
sync). The PROVISIONED mission plan was extended (the work-order-sanctioned
choice) with the OPTIONAL `step-voice-note` (`mandatory = false`), and the
journey tests were updated in the same honest pass: `FieldJourneyRuntimeTest`
now pins 4 steps / 4 gaps and adds
`a voice-note asset closes the optional voice step - matching by AcquisitionMethod generically`
(the no-fork proof). The station journey folds the SYNTHETIC voice leg into
`step-voice-note` out of the box.

## 6. The stale version-pin repairs — found-done at baseline (verified)

The work order named three 1.0.0-era pins. All three were repaired LEAD-SIDE
at `50b66aa` (station-proven: `docs/productization-evidence/ANDROID-TRIO-REPAIR/`
— the trio green at that SHA) and are therefore **found-done at this
baseline — verified, not re-done**:

- `SessionManifestExporterTest.kt` — `assertEquals(CaptureContractVersion.CURRENT, tree.get("contractVersion").asText())` ✓
- `CaptureSessionControllerTest.kt` — `manifestText.contains("\"contractVersion\": \"${CaptureContractVersion.CURRENT}\"")` ✓
- `HttpEvidenceSubmissionTransport.kt` — `"contractVersion" to JsonValue.str(CaptureContractVersion.CURRENT)` ✓

**Verification sweep (this delivery):** no literal `"1.0.0"`/`"1.1.0"`
version pin remains at any Android-tree contractVersion EMISSION or ASSERTION
site. The remaining version literals in the Android tree belong to OTHER
contract families or fixtures, none of them capture-contract pins:
`AdapterContractVersion.V1 = "1.0.0"` (the adapter-contract family's own
current version — cross-checked by its own mirror test), the mission-plan
family's `1.0.0` (`FAMILY_VERSIONS.mission`) and its test fixtures, an
arbitrary JSON value in `JsonCodecTest`, and the mock SERVER-ack bodies in
`HttpEvidenceSubmissionTransportTest`/`HttpEvidenceVoiceSyncTest` (server-side
echoes the client treats as opaque — the client never emits or validates the
ack's version). The TS wiring test holds all three named sites to the
constant, durably.

## 7. Verification record — HONEST

- **`bun run verify` (the full AISE repo gate) at the delivered tree: PASS**
  — 6356 tests, 0 fail (14 new TS tests over the 6342 baseline: the
  `android-voice-wiring.test.ts` source-level wiring suite), 81 305 expect()
  calls, 419 files, boundaries 1090 scanned / 0 violations. The transcript of
  the run is committed at `transcripts/bun-verify.txt`.
- **The E2B station trio `./gradlew :core:test :app:test :app:assembleDebug`:
  NOT RUN in this environment.** This worker's sandbox has no Gradle and no
  Android SDK (a bare JRE is present; a standalone `kotlinc` 2.1.21 was
  downloaded to `/tmp` purely as a SYNTAX sanity check of the new Kotlin —
  the `:core` main sources compile cleanly against the stdlib, and the
  modified/new app+test sources show zero syntax errors with only the
  classpath-cascade diagnostics the unmodified baseline tree also produces
  under the same harness — NOT a gate, NOT a substitute for the trio), so
  `:core:test`, `:app:test` and `:app:assembleDebug` were NOT executed here
  and are NOT claimed — **the Lead runs the trio at
  the delivered SHA as the merge gate** (the station operator doc:
  `apps/android/scripts/e2b-station/README.md`; the trio script:
  `apps/android/scripts/e2b-station/gradle-trio.sh`). The expected Kotlin
  suites are inventoried in §8. A fabricated PASS would be void; this is the
  honest delivery.
- **Baseline sanity:** `bun run verify` at `5ef7e11` (branch point) — PASS,
  6342/0, after installing this sandbox's missing Playwright Chromium (an
  environment gap, not a repo defect: the three baseline failures
  PROD-030/PROD-031/qa002-browser all named the missing browser and all
  passed once it was installed).

## 8. Kotlin test inventory (station-pending — the trio runs them)

New suites (the existing stills/video/transport tests stay green and
unmodified except the journey tests' honest same-pass updates named in §5
and the station journey's voice legs in §9):

- `:core` `AcquisitionMetadataKeysTest` (3 tests) — the four voice constants
  + the TS-source cross-check (`ACQUISITION_METADATA_KEYS` mirror discipline)
  + the legacy keys unchanged.
- `:core` `SessionManifestVoiceExporterTest` (5 tests) — the voice manifest
  validates against the committed `CaptureSessionEnvelope` + `Evidence`
  schemas; measured keys string-encoded integers (the committed fixture's
  pattern); unmeasured keys absent; the fixture's canonical key set; export
  determinism.
- `:app` `CaptureVoiceControllerTest` (11 tests) — the voice commit flow
  (VOICE_NOTE + honest metadata), content identity over (payload, metadata)
  (cross-checked against `ContentIdentity`), pause/finalize refusal,
  state-machine refusals, non-audio media-type refusal, discard, crash
  recovery, byte-identical determinism.
- `:app` `CaptureVoiceViewModelTest` (6 tests) — the voice callbacks, the
  honest metadata composition (measured ride / unmeasured absent / never zero
  / never "unknown"), the optional language hint, clean discard, failures as
  messages.
- `:app` `HttpEvidenceReadClientTest` (9 tests) — the GET discipline, BOTH
  transcript states, non-ASR non-fabrication, several-candidate primary
  selection, the typed refusals, the mirror constants.
- `:app` `VoiceNoteTranscriptViewModelTest` (5 tests) — the panel render
  states: no finalized session, no voice notes, the no-provider informational
  state, the derived candidate + provenance link, the honest read refusal.
- `:app` `HttpEvidenceVoiceSyncTest` (4 tests) — the voice wire body: upload
  order + `audio/mp4` content type, the SyncBatch envelope's voice entry IS
  the exact Evidence document (seven contract fields, canonical keys as
  strings, version pinned to the constant, no local-only keys), the
  partially-measured wire honesty, the idempotent DUPLICATE re-submit.

## 9. Station journey extension — honest fidelity classification

`FieldJourneyStationSyncTest` (station-gated by `AISE_STATION_SYNC_BASE_URL`,
inert in the ordinary trio) was extended in the same pass, per the work
order's station-journey clause. The fidelity classes ride the journey record
verbatim (the PROD-032 pattern):

| Leg | Fidelity | Detail |
| --- | --- | --- |
| `guided-voice-capture` | SYNTHETIC | 9 KB deterministic voice-note bytes through the REAL voice-commit protocol; no physical microphone; `voice.*` keys honestly absent (never conflated with physical evidence) |
| `guided-capture-progress` | DETERMINISTIC | `step-voice-note` closes generically (AcquisitionMethod matching — no fork) |
| `recovery` | DETERMINISTIC | journal replay recovers still + video + voice (3 assets) |
| `submit`, `submit-idempotent`, `server-verification` | REAL | unchanged semantics, one more asset on the wire |
| `voice-transcript-state` | REAL | `GET /v1/evidence/:voiceContentId` answered empty derivations → `NO_TRANSCRIPT` `asr_provider_not_configured` (the deployment's honest no-ASR state; derived CLIENT-side, no backend transcript route) |

## 10. Hand-off notes for the physical-device lane

The physical-device lane (`docs/productization-evidence/PROD-032/physical-device-lane.md`
is the documented, awaiting-execution lane) owns the evidence this sandbox
cannot produce (`BLOCKED_NO_KVM` — the honest recorded station verdict):

1. **Runtime permission**: the `RECORD_AUDIO` mission-scoped request flow from
   the voice entry (grant → the voice button records; deny → the entry
   re-requests on next tap, never a crash, never a silent no-op).
2. **Physical microphone**: a real recording through
   `MicrophoneRecorderAdapter` — the configured `aac` profile producing a
   playable `audio/mp4` file, `voice.duration.ms`/`voice.sample.rate.hz`
   MEASURED over the closed file (and honestly absent on platforms that
   refuse the measurement).
3. **Voice-note end-to-end on device**: capture → finalize → sync → the
   read-view transcript state rendering the deployment's
   `asr_provider_not_configured` state.
4. **Concurrent-lane sanity**: stills during a paused voice segment, the
   one-recorder-at-a-time refusals, crash mid-voice-note (recovery discards
   the tmp exactly once).

## 11. Scope discipline

No file under `backend/`, `packages/shared-contracts/` or `apps/web/` was
modified (the `AsrProvider` seam untouched — provider-gated BY DESIGN). The
stills/video capture, sync and journey behavior is unchanged: the existing
controller/VM/transport tests are green and unmodified; the only existing
test files touched are the journey tests (the work order's sanctioned
same-pass update: `FieldJourneyRuntimeTest`'s step/gap counts + the new
voice-step test, and `FieldJourneyStationSyncTest`'s voice legs). The UI's
stills/video controls keep their exact enabled-state logic for every
pre-existing state; the new `anySegmentOpen` flag only adds the
voice-recording state (which did not exist before).
