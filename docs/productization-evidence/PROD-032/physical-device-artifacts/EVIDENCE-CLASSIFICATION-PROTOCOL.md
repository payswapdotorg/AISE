# AISE POST-002 — EVIDENCE CLASSIFICATION PROTOCOL

Binding rules for classifying every step of the Android/device validation
lanes. Derived from `docs/TECH-LEAD-HANDOFF.md` §8/§14/§15 and
`docs/post-production-discoverability-and-device-validation-plan-2026-09-25.md`
§4, and aligned with the class discipline already used by the committed
PROD-033 journey records.

## 1. The four evidence classes

The class is EXACTLY ONE of {**deterministic**, **synthetic**, **emulated**,
**physical**} and it names the EVIDENCE SOURCE — where the proof bytes came
from — never the execution mode alone. The parenthesized qualifier names the
execution mode. Classes are never upgraded, never re-labeled after the fact,
and never dropped.

| class | means | examples |
|---|---|---|
| **deterministic** | proof produced by pure code execution with no environment variance: unit suites, pure state machines, schema validation, replay folds, code-level audit citing file:line | `:core:test` 387 tests on a JVM; `SessionReplay` fold; journal determinism pins; this POST-002 Section A audit |
| **synthetic** | inputs/artifacts generated in-test or in-harness — real code paths exercised on fake evidence bytes | station journey's 12 KB deterministic still / 24 KB video bytes; generated fixtures |
| **emulated** | evidence recorded on a non-physical execution environment (E2B sandbox, Android emulator, committed transcripts cited forward) | the PROD-032 station Gradle trio + field journey (committed transcripts at `6728c3b`); any emulator run (if one ever boots) |
| **physical** | proof produced by real hardware in the operator's hands: real camera frames, real IMU readings, real OS permission dialogs, real process death on a device | the lane this runbook prepares; photos/screen recordings of the physical device; real device network sync |

## 2. The never-upgrade law (verbatim from the work order and Handoff §8/§14)

1. **Never upgrade one class into another.** Emulator results are never
   physical evidence; a code-level audit is deterministic evidence, not
   device evidence; carried-forward committed transcripts are emulated even
   when their original fidelity labels were REAL (the carrying document
   records the source verbatim — PROD-033 m-run discipline).
2. **Never accept:** documentation-only claims as runtime evidence; emulator
   results as physical-device evidence; a later main SHA as covered by older
   deployment evidence.
3. **A live run is never fabricated.** If Chromium/hardware/emulator is
   unavailable, the step records its honest fallback (or BLOCKED) — the class
   column says so.
4. **Absence of hardware is an honest BLOCKED state, not a failure to hide.**
   BLOCKED rows (e.g. `BLOCKED_NO_KVM`, `BLOCKED_NO_PHYSICAL_HARDWARE`,
   `BLOCKED_NO_TOOLCHAIN`, `BLOCKED_NO_CREDENTIALS`) are recorded, never
   dropped, never counted as harness failures.
5. **A claim without a committed artifact behind it is not evidence.** Every
   PASS row cites its artifact (file path + digest where applicable).
6. **A fresh run you did not do is never claimed.** If no fresh run was
   performed (e.g. no E2B_API_KEY), the record states that VERBATIM.

## 3. Per-step classification rules for this lane

- Steps executed on the physical device (install, launch, OS dialogs, real
  camera still/video, real sensor readings, force-stop, device-originated
  HTTP sync): **physical**.
- Steps that are pure UI state machines whose semantics are pinned by
  committed JVM tests (journey phases, journal fold, recovery exactly-once):
  the OBSERVATION is physical; the SEMANTICS guarantee is deterministic.
  Record the row as `physical (semantics pinned by deterministic suite X)`.
- Server-side acceptance (HTTP 200 / ACCEPTED / DUPLICATE from a real
  backend reached from the device): `physical (device-originated, real
  server answer)`.
- The Gradle trio on the operator workstation: **deterministic** (same
  evidence class as on the station — the station's own emulated record of it
  does not transfer).
- Anything replayed from committed transcripts: **emulated**, with the
  original fidelity labels carried forward verbatim, never upgraded.
- Expected-but-not-observed capabilities (e.g. no rotation-vector sensor on
  the test device): the honest absence is recorded — class `physical`
  (a real hardware fact), content "absence observed and recorded".

## 4. Evidence record format (binding table template)

One table per run; one row per numbered runbook step. Verdict is
PASS / FAIL / BLOCKED_<REASON> — nothing else.

| step | action | observed | class | artifact | timestamp (UTC) |
|---|---|---|---|---|---|
| §2 | `adb install -r app-debug.apk` | install Success, versionName 0.1.0, launches to Home | physical | `02-install.png`, `aise-post002-logcat.txt:L12-40` | 2026-09-25T16:03:12Z |
| §5 | guided still capture (portrait + landscape) | a-0001 image/jpeg N bytes; `sensor.rotation.*` values differ between orientations | physical | `05-still.png`, manifest JSON | … |
| §8 | force-stop + relaunch ×2 | same session id; Recovery events: 1 after both | physical (semantics pinned by SessionRecoveryTest) | `08-recovery-1.png`, `08-recovery-2.png` | … |
| §n | … | BLOCKED_NO_ROTATION_SENSOR (device model has no rotation-vector sensor; honest absence) | physical | `0n-imu-absence.png` | … |

Rules: `observed` must be operator-verbatim (what was seen, including
unexpected results and the stale-copy contradiction in
`CaptureScreen.kt:328-333` if observed); `artifact` must name a file that is
actually committed/filed; `timestamp` is the observation instant, UTC.

## 5. Security/secret discipline for evidence artifacts

- No secrets in any artifact: no AUTH_SECRET values, no session tokens
  (tokens are in-memory only by construction — `MobileAuthClient.kt:24-25`
  — and never rendered in the UI), no API keys, no E2B keys. If a screen
  recording accidentally captures a secret, re-record; do not redact
  transcripts by hand.
- Camera/photo evidence excludes secrets by construction: manifests carry
  only content hashes, sizes, media types, acquisition metadata and device
  identity (`SessionManifestExporter.kt:58-105`); no principal PII beyond
  the display name the demo principal publishes.
- `adb shell run-as`/`dumpsys` outputs: review before filing (they can
  contain paths but no secrets in this app's private storage).
