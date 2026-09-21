# AISE Android Field Client — `apps/android`

AISE-002 foundation + **AISE-005 capture session layer** + **PROD-019 mobile
adapter layer**: the Android shell, navigation, the local persistence
abstraction, the build/test harness, the offline capture session runtime —
stills, video, sensor metadata, the event-sourced session journal, the
offline manifest and crash recovery — and the **shared client-adapter
contract consumption** that promotes this foundation into the product's
mobile adapter (capability negotiation, conformance, the field journey and
the explicit-unavailable submission seam). Everything here is
**offline-first** and carries **no server authority**.

This is a self-contained Gradle (Kotlin DSL) project inside the AISE
repository. The repository root is a bun/TypeScript workspace that ignores
this directory (no `package.json` exists here, so the root workspace glob
skips it; Gradle ignores the root workspace entirely).

## Modules

| Module | Kind | Contents |
|---|---|---|
| `:core` | pure Kotlin/JVM (no Android) | AISE-002 persistence abstraction + content identity + their contracts; **AISE-005 capture domain**: the session state machine, journal events + replay fold, asset records, the manifest exporter, the streaming content hasher and the strict-subset JSON codec — all fully unit-tested on a plain JVM; **PROD-019 adapter package** (`org.payswap.aise.core.adapter`): the adapter-contract version mirror, the `ClientCapabilityProfile` / `TaskCapabilityRequirements` / `CapabilityNegotiation` wire mirrors + the faithful negotiation consumer, the honest `mobile-field` profile declaration, the C0–C9 conformance runner, the TaskIntent mirror, the field-journey state machine and the explicit-unavailable submission seam |
| `:app` | Android application | single-activity Compose shell (Home / **Capture** / Settings / About), the capture runtime (`capture/`), CameraX/sensor platform glue (`capture/platform/`), the file-backed local store, the file-based journal/recovery engine, and the **field-journey runtime + mission panel** (`field/`, PROD-019): intent → assessment → adaptive mission → guided capture bookkeeping → submission |

Toolchain: **Kotlin 2.1.21, AGP 8.7.3, Gradle 8.14.3 (wrapper), JDK 21
toolchain, compileSdk 35, minSdk 26, targetSdk 35.** Every version is pinned
exactly in `gradle/libs.versions.toml` (AISE-005 added CameraX 1.4.1,
kotlinx-coroutines 1.10.2, and a TEST-scope json-schema-validator). The
foojay toolchain resolver is applied in `settings.gradle.kts`, so a machine
with only a JRE can still build/test `:core` (the JDK 21 toolchain is
auto-provisioned); building `:app` additionally requires the Android SDK.

## Commands

```bash
cd apps/android

# First run on a machine: performs the one-time dependency sync
# (downloads Gradle distribution + pinned artifacts from
# services.gradle.org / Maven Central / Google Maven — see "Offline
# behavior" below). On a JRE-only machine the JDK 21 toolchain is
# auto-provisioned by the foojay resolver.
./gradlew help

# Pure-JVM tests of the persistence abstraction + capture domain (CI gate)
./gradlew :core:test

# App unit tests (navigation invariants, viewmodels, file store, journal,
# recovery, capture controller — no emulator); CI gate
./gradlew :app:test

# Full Android debug build (requires the Android SDK); CI gate
./gradlew :app:assembleDebug
```

Local Android SDK: create `local.properties` containing
`sdk.dir=/absolute/path/to/android-sdk` (this file is git-ignored), or set
`ANDROID_HOME`/`ANDROID_SDK_ROOT`. Required pieces: `platforms;android-35`
and `build-tools;35.0.0` (accept licenses with `sdkmanager --licenses`).
On memory-constrained machines, `GRADLE_OPTS="-Xmx1024m" ./gradlew
--no-daemon :app:assembleDebug` avoids daemon OOM during APK packaging.

## Offline behavior

- **Test execution never touches the network.** `:core` has zero third-party
  main dependencies (Kotlin stdlib only) and its tests perform no I/O; the
  tests assert this themselves (see "No-server-authority guard").
- The **first** Gradle run on a machine requires network access for the
  dependency sync only (Gradle distribution, AGP/Kotlin/AndroidX/JUnit/CameraX
  artifacts, foojay-resolving a JDK if needed). After one sync, tests can be
  re-run fully offline:

  ```bash
  ./gradlew :core:test --offline --rerun-tasks
  ```

## The capture session layer (AISE-005)

### Domain model (`:core`, pure Kotlin, offline-safe)

- **`CaptureSessionRecord`** — the folded session state. State machine:
  `DRAFT → CAPTURING ⇄ PAUSED → FINALIZED → SYNCED` (plus `DRAFT →
  FINALIZED` for abandoned empty sessions; 7 legal transitions, everything
  else rejected — `SessionTransitions` is the normative matrix).
- **`CapturedAssetRecord`** — one captured asset with full content identity:
  AISE-CONTENT-V1 `contentId` (frozen 002 encoding), byte size, media type,
  UTC capture instant, acquisition method (the 10-value Evidence contract
  enum), verbatim sensor metadata map (EXIF-ish open string map) and the
  relative path under the session dir.
- **`SessionManifest`** — the session's `CaptureSessionRecord` serialized by
  `SessionManifestExporter` as canonical JSON matching the COMMITTED
  AISE-003 `CaptureSessionEnvelope` schema
  (`packages/shared-contracts/schemas/sync/CaptureSessionEnvelope.schema.json`,
  with per-asset records matching `Evidence.schema.json`). Validation is
  pinned in tests against the committed schemas (networknt validator,
  TEST-scope dep). Corrupted assets are excluded from `assets` and recorded
  in an explicit `recovery` audit field — lost evidence is never silently
  dropped.
- **Journal** — the append-only, event-sourced truth: one JSONL file per
  session, events `session.created` / `session.state` / `asset.captured` /
  `asset.corrupted` / `session.reopened`. Replay (`SessionReplay`) is a pure
  fold that validates EVERY invariant (strict +1 sequencing, legal
  transitions, assets only while capturing, exactly-once reopens,
  monotonic time) and fails closed with `JournalCorruptionException`.
- **Streaming content identity** — `StreamingContentHasher` feeds the SAME
  frozen AISE-CONTENT-V1 encoding in chunks: stills are hashed while being
  written (single pass), videos by one sequential 1 MiB-chunk read after the
  recorder closes the file — never a whole-file in-memory copy. Pinned
  equal to `ContentIdentity.contentId` across chunk sizes.

### On-disk layout (all under app-private `<filesDir>/aise/`, zero extra permissions)

```text
aise/
  device-id.txt                  — stable local device identity (generated UUID)
  store/                         — the persistent LocalCaptureStore (AISE-002 interface)
    blobs/<contentId>            — content-addressed payload bytes (atomic writes)
    index.jsonl / acked.jsonl    — append-only ledgers (fsynced)
  sessions/<sessionId>/
    journal.jsonl                — THE TRUTH (append-only, fsynced per line)
    manifest.json                — derived, deterministic; (re-)written at finalize
    assets/a-0001.jpg …          — committed asset files
    tmp/a-0002.mp4.tmp …         — in-flight writes (asset-id-keyed names)
```

### Capture runtime (`:app`, JVM-testable controller + thin platform glue)

- **`CaptureSessionController`** — a PLAIN controller, not a foreground
  service (decision: CameraX use cases are lifecycle-aware and bound to the
  activity; a foreground service is an operational/policy concern for
  AISE-009 mission execution and AISE-030 offline hardening to own — promote
  then, with the notification + service semantics that implies).
  Owns: start/pause/resume/finalize, still ingestion (write+hash in one
  pass → journal → atomic rename → store append), video writers, recovery
  at startup, and the manifest write. Single mutex, all I/O on
  `Dispatchers.IO`, one open session per device.
- **Asset commit protocol (crash-safe)**: write `tmp/<assetId>.<ext>.tmp` →
  journal `asset.captured` (fsync — the commit point) → atomic rename.
  A crash between journal and rename leaves an asset-id-keyed tmp that
  recovery recognizes and adopts (exactly-once completion).
- **`SessionRecovery`** — on process restart: an interrupted session (open
  state, journal tail not a reopen) is re-opened EXACTLY ONCE (a
  `session.reopened` event is the marker; the fold rejects double reopens);
  uncommitted `.tmp` files are discarded; journaled assets are re-verified
  cheaply (size + sha-256 of the first 64 KiB head sample), full re-hash only
  for unverified assets; genuinely corrupted assets get an `asset.corrupted`
  event and are excluded from the manifest (explicit loss, fail closed);
  finalized sessions get their manifest re-derived if missing or stale.
- **Journal crash discipline (WAL)**: appends are one line + newline +
  fsync; a torn (unterminated) tail line is an uncommitted append —
  discarded on read and truncated on the next append (self-heal); a
  complete-but-garbage line anywhere is hard corruption → typed failure.
- **Fsync policy**: journal lines fsynced on append; asset/manifest files
  fsynced before their atomic rename; directories fsynced after (best
  effort — the journal remains the truth either way).
- **CameraX adapter** (`capture/platform/`): binds Preview + ImageCapture +
  VideoCapture (the guaranteed LIMITED+ combination; degrades honestly to
  preview+still when a device refuses). Stills: in-memory JPEG bytes +
  rotation + frame timestamp + LATCHED exposure parameters (Camera2Interop
  session-capture callback; keys say `latched`, including the latch sensor
  timestamp — provenance states exactly what the values are). Video:
  CameraX Recorder writes the writer's tmp file; no audio is recorded
  (visual evidence only — no RECORD_AUDIO permission). Rotation-vector
  sensor snapshots (`sensor.rotation.*`) attach verbatim to every asset.
- **`FileBackedLocalCaptureStore`** — AISE-002's in-memory store's persistent
  twin behind the SAME interface (append-only, idempotent duplicates,
  re-derived content ids, sync-ack ledger). Stills are appended to it; video
  segments are NOT (see Limitations).
- **Permissions**: the manifest now declares CAMERA (mission-scoped,
  requested at runtime from the capture screen) + camera feature
  `required="false"`. No location, no microphone, no network.

### No-judgment discipline

The device is never an assurance authority: no quality scoring, no
"good-enough" logic anywhere. Capability statuses are honest facts
(`unknown` = "not yet determined — AISE-006 adapter pending", never
conflated with `unavailable`); `asset.corrupted` is an integrity fact; the
capture UI displays journal-derived state only. Mission policy, readiness
and verification are server-side (AISE-007/009/022).

## What is verified where

| Verification | Where it runs |
|---|---|
| `:core` content identity determinism, reference vectors, timezone invariance (AISE-002) | `:core:test` (JVM, offline-safe) — local + CI |
| `:core` append-only contract, in-memory store behavior, no-network guard (AISE-002) | `:core:test` |
| `:core` JSON codec: full-Unicode round-trips, escapes, duplicate-key/float/trailing rejection | `:core:test` |
| `:core` state machine: exhaustive 25-pair legal/illegal matrix | `:core:test` |
| `:core` journal replay: happy path, mid-crash fold, corruption battery, exactly-once reopen invariant, wire round-trips | `:core:test` |
| `:core` determinism: same journal input → identical state (injected clock, no wall time; JVM-locale/timezone invariance) | `:core:test` |
| `:core` streaming hasher == frozen ContentIdentity across sizes/chunks; reference vectors streamed | `:core:test` |
| `:core` manifest export: schema-validated against the COMMITTED CaptureSessionEnvelope + Evidence `.schema.json` files (valid case + the committed 003 fixture + 4 deliberately-invalid mutations); export refusals for open sessions | `:core:test` |
| `:core` contract version parity with the committed TS source of `CONTRACT_VERSION` | `:core:test` |
| `:app` file-backed store: AISE-002 behavioral contract (shared assertion block with the in-memory twin) + durability across instances + divergence detection | `:app:test` (JVM) |
| `:app` journal file I/O: round-trips, torn-tail WAL rule + self-heal, mid-file corruption fail-closed | `:app:test` |
| `:app` recovery: exactly-once re-open (incl. re-interruption), tmp discard, head-sample verify, full re-hash rescue, corruption handling, tmp adoption of interrupted commits, manifest re-derivation, quarantine paths, determinism | `:app:test` |
| `:app` capture controller: full lifecycle, crash-restart cycles, state-machine enforcement, determinism (identical scripts → byte-identical journals/manifests) | `:app:test` |
| `:app` navigation invariants (4 destinations) + Home + Capture viewmodels | `:app:test` |
| Full Android build (`assembleDebug`, CAMERA permission, adaptive icon, resources) | CI (`.github/workflows/android.yml`); locally when an SDK is present |
| Instrumented smoke test | declared in `app/src/androidTest/` — requires an emulator, deliberately NOT part of `test` or the required CI commands |

## Physical-device test plan (future dogfood — AISE-035; OUT of 005 scope)

Instrumented-camera tests are deliberately out of scope for AISE-005; the
plan below is the dogfood checklist AISE-035 executes on real hardware:

1. **Camera matrix**: bind + still + video on one device per capability
   class (flagship w/ triple camera, mid-range, camera-less fallback check).
2. **Still pipeline**: capture 20 stills in one session; verify every
   `contentId` on the host by re-deriving AISE-CONTENT-V1 over the pulled
   JPEGs + journaled metadata (cross-implementation check, 003/004 parity).
3. **Video pipeline**: record ≥ 3 segments incl. a > 5 min segment; verify
   chunked-hash equals host-side whole-file hash; verify manifest byte-size
   fields match pulled files.
4. **Sensor metadata**: confirm `sensor.rotation.*`, `camera.*`,
   latched-exposure keys present and non-fabricated (values actually change
   across captures in different lighting/orientation).
5. **Crash matrix** (the recovery contract, on-device): kill the process
   (a) mid-still, (b) mid-video, (c) after finalize before manifest write,
   (d) twice in a row before operator input — each restart must re-open
   exactly once, discard exactly the uncommitted tmp, adopt the
   journal-committed rename, and re-derive missing manifests.
6. **Power loss**: where feasible, power off mid-session; same assertions.
7. **Honest degradation**: device without rotation-vector sensor → IMU
   domain `unknown` + limitation recorded; device refusing the triple
   camera combination → video disabled with the fact surfaced.

## The mobile adapter layer (PROD-019)

The Android client is an **adapter over the shared AISE product core**
(ACR-004): it consumes the versioned, checkable client-adapter contract of
PROD-016 (`packages/adapter-contract`, `ADAPTER_CONTRACT_VERSION = 1.0.0`)
and never duplicates domain authority. The compatibility window forbids
adapter workers from changing the shared contract — this client CONSUMES the
committed JSON Schemas, fixtures and `CONFORMANCE_CHECKS` semantics.

### `:core` — `org.payswap.aise.core.adapter` (pure Kotlin, JVM-tested)

- **`AdapterContractVersion`** (A-R1): the `1.0.0` mirror, cross-checked
  against the committed TypeScript source AND `schemas/manifest.json` by
  tests, so wire drift is a CI failure. Same-major versions decode;
  cross-major is a typed refusal — never silently accepted.
- **`ClientCapabilityProfile` / `TaskCapabilityRequirements` /
  `CapabilityNegotiation` mirrors** (A-R2): the seven-domain capability
  declaration, the server-owned requirements set (immutable, read-only) and
  the negotiation result object — all rendered/parsed by the frozen canonical
  JSON codec and validated in tests against the committed schemas/fixtures.
- **`negotiateCapabilities`** (A-R2): the faithful Kotlin mirror of the
  package's pure negotiation — same domain outcomes
  (`satisfied | unsupported | unknown`), same overall verdicts
  (`permitted | degraded | unknown | blocked`, worst-of with impossibility
  outranking undetermination), same interaction-mode derivation, same VERBATIM
  reason strings. Byte-pinned against all four committed negotiation
  fixtures. NO AUTHORITY: it changes capture strategy and operator burden,
  never an assurance threshold (asserted by tests).
- **`MobileFieldAdapterProfile.declare(snapshot)`**: the honest
  `mobile-field` declaration derived from the AISE-006 device snapshot:
  still+video capture kinds ONLY (the adapter exercises the CameraX
  still/video binding — no depth API, so no depth kind even on depth-capable
  hardware; the device fact flows into the limitations verbatim),
  `persistent-store` offline mode with NO guessed byte bound (an undeclared
  bound is never invented — byte-bounded requirements negotiate to explicit
  honest shortfalls), `in-app` notifications, no deep links, GPS never
  declared (no location permission — AISE-005 decision).
- **`AdapterConformance` + `MobileAdapterBinding`** (A-R4): the C0–C9
  conformance runner (pure; the networknt validator + committed schemas are
  injected test-side) and the mobile binding — the four mirrored objects
  round-trip through Kotlin domain types; the other semantic objects are
  carried opaque and read-only (the audit's verbatim-mirror discipline).
  Sabotage bindings that drop/mutate authoritative fields or claim
  unsupported modes FAIL explicit checks (discrimination-tested).
- **`CompatibilityCheckerAlignment`** (A-R3): the recorded alignment between
  the DEVICE-capture-domain checker (AISE-030, 8 domains, step verdicts) and
  the CLIENT-platform negotiation (PROD-016, 7 domains, task verdicts) — a
  total order-preserving vocabulary mapping, identical honest-unknown
  discipline, impossibility-outranks-undetermination in both, and the two
  gates are INDEPENDENT (either can block without the other; both directions
  are proven by tests). The checker stays facts-not-policy.
- **`FieldJourney`**: the pure journey state machine — field-intent
  selection (`TaskIntentValue`, the client-authored object) → capability
  assessment → adaptive mission (`MissionDirective`: exact capture actions,
  server instructions/mandatory/requirementRefs VERBATIM, honest readiness +
  burden notes, blocked reasons verbatim) → evidence bookkeeping →
  submission/resume.
- **`EvidenceSubmission`**: the resumable submission engine — deterministic
  idempotency key (sha-256 of the payload), explicit
  `Deferred(reason, attempts)` when the network is unavailable (a first-class
  state, never a silent failure), `Submitted(serverRef)` /
  `Failed(reason)` on typed server answers.

### `:app` — the field-journey runtime and the mission panel

- **`field/FieldJourneyRuntime`**: wires the :core journey to the EXISTING
  capture controller (which stays the owner of capture truth). Server-owned
  documents (requirements, mission plan) are PROVISIONED AT BUILD TIME and
  badged as such in the UI (like the web app's badged demo dataset) until
  the AISE-030 transport lands; they are consumed read-only. Evidence
  bookkeeping assigns each new intact session asset to the earliest open gap
  step with a matching acquisition method — deterministic progress FACTS,
  never sufficiency/readiness claims.
- **`field/OfflineUntilSyncTransport`**: this build's submission seam —
  always explicitly `Unavailable` with the surfaced reason; evidence remains
  in the durable offline store (sessions + manifests) until the transport
  arrives.
- **The mission panel** (Capture screen, extended not replaced): the
  negotiated verdict banner (blocked reasons and degraded notes rendered
  VERBATIM — an explicit BLOCKED state, never a generic prompt), the step
  list with EXACT capture actions and evidence gaps, device blockers, and
  the submission panel with the explicit offline state.

### What is verified where (PROD-019 additions)

| Verification | Where it runs |
|---|---|
| Adapter-contract version mirror == committed TS source == committed schema manifest; same-major/cross-major typed refusals; version-mismatch fixtures refused | `:core:test` |
| Committed corpus: 27 valid fixtures validate against the committed schemas; 30 deliberately-invalid fixtures rejected; 8 version-mismatch fixtures schema-valid but wire-refused | `:core:test` |
| C0–C9 conformance with the lossless golden binding AND the mobile adapter binding; 6 sabotage discrimination cases (dropped/mutated authoritative fields, hidden denials/failure/blockers, dishonest modes) | `:core:test` |
| Kotlin `AUTHORITATIVE_FIELDS` + `CONFORMANCE_CHECKS` mirrors == committed TypeScript source | `:core:test` |
| Negotiation consumer reproduces ALL committed negotiation fixtures exactly (outcomes, domain order, verbatim reasons, mode order); mode derivation of the three reference profiles; unknown≠unsupported; worst-of; blocked⇒no modes; no-assurance invariants | `:core:test` |
| Honest profile declaration from device snapshots (camera/depth/IMU cases); profile schema-validity; determinism | `:core:test` |
| TaskIntent round-trip + schema validity; cross-major refusal | `:core:test` |
| The representative field journey with offline interruption/resume (journal fold, exactly-once reopen, finalize, schema-validated submission payload, deferred→resumed submission with a stable idempotency key); blocked journeys render verbatim reasons; degradation changes burden not thresholds (mandatory/requirementRefs verbatim) | `:core:test` |
| A-R3 alignment invariants (total mapping, severity orders, honest-unknown, independent gates, distinct vocabularies) | `:core:test` |
| Field-journey runtime (journey start, honest profile, evidence bookkeeping, seam deferral/resume, reset) | `:app:test` (JVM; requires the Android SDK to execute) |

## No-server-authority architectural note

Per `spec/architecture.md` §4 and `spec/architecture-lock.md` (authority
invariant 8: *UI state, mobile state and exported files are not canonical
authorities*):

- The client is a **mission executor**. Mission policy, engineering truth,
  readiness and verification are **server-authoritative**. No code in
  `apps/android` computes, asserts or declares engineering results.
- `:core`'s `LocalCaptureStore` is a **persistence abstraction**: it stores
  payload bytes plus acquisition metadata, nothing more. The capture
  session journal/manifest likewise record FACTS (provenance, integrity);
  `FINALIZED`/`SYNCED` are lifecycle/transport facts, never quality or
  readiness claims — capture completion for a task is declared only by the
  server-side Assurance Engine.
- `:core` resolves **zero third-party runtime artifacts** (no HTTP client,
  no server SDK). This is enforced twice: the Gradle task
  `:core:assertNoNetworkDependencies` resolves the runtime classpath and
  fails on anything beyond the Kotlin stdlib; the unit test
  `NoNetworkDependencyTest` re-asserts the same at test-execution time.
  AISE-005 added TEST-scope artifacts (networknt json-schema-validator +
  its Jackson/slf4j transitives) to validate manifests against the committed
  schemas — the test allowlist documents this DELIBERATELY; the runtime
  classpath is untouched.
- The app's source manifest requests **one** permission: CAMERA
  (mission-scoped, runtime-requested from the capture screen). The AISE-002
  build-time footnote still applies: the merged APK carries the single
  application-local marker permission from `androidx.core`'s AAR manifest
  (invisible, grants no capability, never prompts).
- Raw evidence is immutable and append-only: journal lines are never
  rewritten, entries are never updated or deleted, duplicates are
  idempotent no-ops, and sync acknowledgement (AISE-030) will be an
  append-only side ledger.

## Content identity (the contract the whole platform will re-derive)

`org.payswap.aise.core.identity.ContentIdentity.contentId(payload, metadata)`
computes a deterministic sha-256 id over a canonical, fully documented
encoding (`AISE-CONTENT-V1`: fixed 15-byte ASCII tag, length-prefixed
payload, then metadata entries sorted **by UTF-8 byte sequence** — not Java
string order — each length-prefixed). The exact byte-level specification is
normative and frozen in the KDoc of `ContentIdentity`; reference vectors
were derived independently of the Kotlin implementation and are pinned in
`ContentIdentityTest`. The server side (AISE-004 ingestion, Evidence Graph
pinning) MUST re-derive exactly this encoding. AISE-005 added
`StreamingContentHasher` (same encoding, chunked delivery) — pinned equal
by tests; nothing about the frozen identity contract changed.

## Known limitations (AISE-005 scope)

- **Video assets are not appended to the `LocalCaptureStore`** — the 002
  interface is ByteArray-based and cannot take multi-hundred-MB payloads
  without an in-memory copy. Video evidence lives in the session dir and
  the manifest (content-addressed); a streaming ingestion interface is
  AISE-030's design decision (an interface extension to 002's abstraction
  would be a governed change, raised then, never hacked here).
- **Store `list()`/`pending()` materialize payloads** (the 002 interface
  returns full entries) — count-only use is O(total bytes) today. A
  count/stream API is deliberately NOT added silently (same governed-change
  rule).
- **No GPS/location metadata** — optional in the work order; the location
  permission is a mission-scoped decision for AISE-009/030, with the
  privacy considerations it implies.
- **No audio in video segments** — visual evidence only; documented
  decision (avoids RECORD_AUDIO; audio evidence, if ever required, has
  different provenance semantics).
- **One open session per device** — deliberate 005 scope; concurrent/paused
  multi-session scheduling is mission-executor territory (009/030).
- **deviceId stability is app-data-scoped** — a locally generated UUID
  persisted in app-private storage; reinstall/clear-data yields a new
  device identity (enterprise identity/tenancy is AISE-036). Session
  manifests stay stable within a device lifetime.
- **Exposure metadata is latched, not per-frame** — CameraX stills do not
  expose their exact CaptureResult; the adapter latches the latest session
  capture result and the metadata keys say so (`*.latched`,
  `camera.exposure.latchedAtSensorNanos`). Honest provenance over precise
  per-frame values; revisit with camera2-direct capture if a mission ever
  requires it.
- **Preview + ImageCapture + VideoCapture triple binding** may be refused
  by BASE-level devices; the adapter degrades to stills-only and surfaces
  the fact (no silent capability claims).
- `material-icons-extended` inflates the DEBUG APK (~18 MB); release builds
  with R8 will strip unused icons (minify is currently disabled per the
  002 foundation note; revisit at release hardening).

## Mapping forward (AISE-006 / 009 / 030)

- **AISE-006** replaces the baseline capability snapshot (camera/IMU
  exercised, everything else `unknown`) with real adapter output — the
  `CapabilitySnapshot` wire shape is already the committed 003 contract.
- **AISE-009** executes server-authoritative missions: `missionRef` flows
  through the journal/manifest already; the guided UI wraps this
  controller; recapture uses the corrupted-asset facts as evidence gaps.
- **AISE-030** owns transport: `SyncBatch` wrapping of the manifest,
  idempotency keys, resumable uploads, the sync-ack ledger that flips
  `FINALIZED → SYNCED`, and the video-blob streaming-ingestion decision
  noted above.

## What is deliberately NOT here

Mission logic and coverage coaching (AISE-007/009), capability adapters
(006), upload/sync/transport (030), quality or readiness judgment of any
kind (server-side assurance), location capture, audio recording,
multi-device coordination.
