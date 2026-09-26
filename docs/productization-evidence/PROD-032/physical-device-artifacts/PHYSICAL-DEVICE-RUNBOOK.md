# AISE POST-002 — PHYSICAL-DEVICE RUNBOOK (Wave R0, Worker 2)

Operator procedure for the physical Android device lane at repo HEAD
`6a223f9fe74ea94138c4b62db8b228a615522e01` (live main at dispatch; `apps/android`
is byte-identical to the PROD-032 station delivery SHA `6728c3b`, so all station
gradle-trio references apply unchanged).

App facts (code-cited): applicationId `org.payswap.aise.app`
(`app/build.gradle.kts:23`), minSdk 26 / targetSdk 35 / compileSdk 35
(`app/build.gradle.kts:20,29,30`), versionName 0.1.0 / versionCode 1
(`app/build.gradle.kts:31-32`), single launcher activity `.MainActivity`
(`AndroidManifest.xml:32-41`), permissions CAMERA + INTERNET only, camera
feature `required="false"` (`AndroidManifest.xml:14-22`), debug APK ~18.4 MB
(station reference: 18,462,388 bytes, sha256 `57a3f664…` at `6728c3b`).

**Classify every step per EVIDENCE-CLASSIFICATION-PROTOCOL.md. Every step below
must produce an artifact (screenshot / photo / screen recording / logcat
excerpt / curl output / sha256sum). Absence of hardware for any step is an
honest BLOCKED row — never skipped silently.**

---

## 0. Prerequisites

- Physical Android device, API 26+ (Android 8.0+), USB debugging enabled.
  Record BEFORE starting: `adb shell getprop ro.product.model`,
  `adb shell getprop ro.build.version.release`,
  `adb shell getprop ro.build.fingerprint`.
- Workstation: git, JDK 21 (Temurin), Android SDK (`platforms;android-35`,
  `build-tools;35.0.0`, `platform-tools`/adb; accept licenses). The Gradle
  JDK 21 toolchain auto-provisions on JRE-only machines via the foojay
  resolver (`apps/android/settings.gradle.kts:23-27`).
- Decide the SYNC TARGET (two lanes; record which one you ran):

  | lane | target | requirement |
  |---|---|---|
  | **A (default, recommended)** | `https://aise-tan.vercel.app` | nothing — this is the baked-in default (`app/build.gradle.kts:24-28`); device needs internet |
  | **B (loopback)** | `http://127.0.0.1:8791` (local `backend/api`) | build-time override + debug cleartext overlay (§0.1) + `adb reverse` |

### 0.1 Loopback-lane honest gap (BLOCKS plain HTTP on the device — by design)

The APK ships NO `usesCleartextTraffic` and NO `networkSecurityConfig`
(verified by grep over `apps/android` at HEAD — zero matches). Android 9+
(API 28+) blocks plain-HTTP to `127.0.0.1` from an app without a cleartext
grant. Also NOTE: **the app has NO runtime server-URL override** — Settings
only *displays* the build-time URL (`SettingsScreen.kt:64`,
`AppContainer.kt:47`); the PROD-032 lane doc's "Settings → server base URL"
instruction is stale against this build. For lane B you must therefore:

1. Create `apps/android/app/src/debug/AndroidManifest.xml` (debug-variant
   overlay only — never ships in release):
   ```xml
   <manifest xmlns:android="http://schemas.android.com/apk/res/android">
       <application android:usesCleartextTraffic="true" />
   </manifest>
   ```
2. Build with the base URL override:
   `AISE_API_BASE_URL="http://127.0.0.1:8791" ./gradlew :app:assembleDebug`
3. After install: `adb reverse tcp:8791 tcp:8791` (device
   `127.0.0.1:8791` → workstation).
4. Boot the real backend on the workstation exactly as the station does
   (`apps/android/scripts/e2b-station/field-journey.sh:66-97`):
   `bun install` at repo root, then in `backend/api` with
   `AISE_AUTH=1 AISE_AUTH_MODE=demo-open AUTH_SECRET=<random 32B hex>
   HOST=127.0.0.1 PORT=8791 AISE_DATA_DIR=<disposable dir> bun run start`;
   wait for `curl -fsS http://127.0.0.1:8791/healthz` → 200.

## 1. Build the APK exactly as the station does

```bash
git clone https://github.com/payswapdotorg/AISE.git && cd AISE
git rev-parse HEAD          # record: expect 6a223f9fe74ea94138c4b62db8b228a615522e01 (or the live HEAD you audited)
cd apps/android
./gradlew :core:test :app:test :app:assembleDebug   # the station gradle trio
sha256sum app/build/outputs/apk/debug/app-debug.apk # record
```

Expected: `:core:test` 34 suites / 387 tests / 0 failures; `:app:test` 176
tests / 0 failures / 2 skipped (the station-gated journey test; PROD-032 §2);
APK ~18.4 MB. Any divergence → STOP and record it as a defect, do not proceed
on a red build.

**Evidence:** full command transcript + `sha256sum` output + test-count
summary (per-suite XML under `core/build/test-results/test/`,
`app/build/test-results/testDebugUnitTest/`). Class: deterministic.

## 2. Install and launch

```bash
adb devices                                                # device visible + authorized
adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
adb shell dumpsys package org.payswap.aise.app | grep -E 'versionName|targetSdk|permission'
adb shell monkey -p org.payswap.aise.app -c android.intent.category.LAUNCHER 1   # or tap the icon
```

Expected observable: install succeeds; `versionName=0.1.0`; app launches to
the Home tab with bottom navigation Home / Capture / Settings / About
(`AiseApp.kt:45-61`). No crash dialog.

**Evidence:** `adb devices` output, `dumpsys` grep, launch screenshot, first
30 s of `adb logcat` (filter `AndroidRuntime:E`). Class: physical.

## 3. Runtime permission matrix (grant/deny, BOTH orders)

The CAMERA permission is requested **mission-scoped from the capture screen**
(`CaptureScreen.kt:78-85,108-130`), never at install/launch. The manifest
declares only CAMERA + INTERNET; video records NO audio (no RECORD_AUDIO —
`CameraCaptureAdapter.kt:171`); no storage/media permission (app-private
`<filesDir>/aise/`).

Run BOTH orders and record each:

- **Order 1 (grant):** open Capture tab → observe the "Camera permission
  required" card BEFORE granting (screenshot) → tap "Grant camera access" →
  OS dialog appears at capture time (screenshot/video of the dialog) → Allow
  → preview renders, capture controls appear.
- **Deny once:** Deny the OS dialog → the card persists with the honest copy
  ("Capture needs the camera while a session is active. No other permission
  is requested…") → NO crash, NO force-close (`adb logcat` clean of
  `AndroidRuntime` crashes) → app remains navigable.
- **Order 2 (deny-first, then grant via Settings):** fresh install or
  `adb shell pm reset-permissions` → Deny twice ("Don't ask again" state if
  offered) → the card remains (the honest degraded state) → navigate to OS
  Settings → Apps → AISE → Permissions → Camera → Allow → return to the app
  → the capture stage now renders (permission state is re-checked on
  composition, `CaptureScreen.kt:78-85`).
- Record granted state:
  `adb shell dumpsys package org.payswap.aise.app | grep -A6 'runtime permissions'`

**Evidence per sub-step:** screenshot + logcat excerpt + `dumpsys` output.
Class: physical.

## 4. Capability assessment + session start

On the Capture tab: tap **"Start field journey"**. Expected: the mission
panel renders the negotiated verdict banner (expect `Task permitted` on a
camera+IMU device) and the 3 provisioned mission steps with exact capture
actions ("Capture still image … Crack pattern overview stills (mandatory)",
"… detail stills (mandatory)", "Record video footage … (optional)") and
"Evidence gap — not yet captured" per step. NOTE honestly: mission/task
documents are BUILD-TIME PROVISIONED and badged "(provisioned)" in the UI
(`ProvisionedJourneyDocs`, `FieldJourneyRuntime.kt:186-251`,
`CaptureScreen.kt:428`) — live server task fetch is not in this build.

Then tap **"Start session"** (missionRef flows from the active mission,
`CaptureScreen.kt:222-232`). Expected: status line "Session <id8> —
capturing". On a device WITH a rotation-vector sensor the session baseline
records `imuActive=true` (contrast the station's honest `imuActive=false`).

**Evidence:** screenshots of verdict banner + step list + session status.
Class: physical (device capability facts) + deterministic (journey state
machine — classify the verdict banner row as physical-sourced since the
profile derives from THIS device's hardware facts).

## 5. Guided still capture

Tap **"Still"** (enabled while CAPTURING and not recording). Expected:
message "Still captured: a-0001 (<N> bytes)"; the session summary lists
`a-0001 — image/jpeg, N bytes`; the mission step's gap flips to "Evidence
recorded: 1 asset(s)".

Record: file lands at
`/data/data/org.payswap.aise.app/files/aise/sessions/<sessionId>/assets/a-0001.jpg`
(app-private). Pull for verification:

```bash
adb shell run-as org.payswap.aise.app ls files/aise/sessions/
adb shell run-as org.payswap.aise.app cat files/aise/sessions/<id>/manifest.json   # after finalize (§8)
```

**Sensor-metadata verification (what to look for):** after finalize, in the
manifest's `assets[].acquisitionMetadata`, expect EXACTLY these verbatim
keys — `capture.kind=still`, `acquisition.sensorId=<cameraId>`,
`camera.orientation.degrees`, `camera.frameTimestampNanos`,
`camera.exposureTimeNs.latched`, `camera.iso.latched`,
`camera.focalLengthMm.latched`, `camera.exposure.latchedAtSensorNanos`
(latched keys only after the first preview frames; keys say `.latched` —
honest provenance, `CameraCaptureAdapter.kt:142-147,242-247`),
`sensor.rotation.x/.y/.z/.accuracy/.timestampNanos`
(`RotationVectorSnapshotter.kt:57-63`), plus `mission.id`, `session.id`,
`device.id` (`CaptureSessionController.kt:438-442`). Cross-check: capture
one still in landscape and one in portrait → `camera.orientation.degrees`
and/or `sensor.rotation.*` values MUST CHANGE (non-fabricated evidence). On
a device WITHOUT a rotation-vector sensor: the sensor keys are ABSENT (empty
snapshot — "absence is absence, never a fabricated 0",
`RotationVectorSnapshotter.kt:23-24,48-49`) — record that honestly; it is
valid evidence.

**Evidence:** screenshot after each still; the manifest JSON (post-finalize)
with the metadata keys; byte sizes. Class: physical.

## 6. Guided video capture

Tap **"Record"** → recording indicator (Stop button appears) → hold ≥10 s →
tap **"Stop recording"**. Expected: message "Video captured: a-0002
(<N> bytes)"; summary lists `a-0002 — video/mp4, N bytes`; file at
`…/assets/a-0002.mp4`. The segment carries `video.durationNanos` in its
metadata (`CaptureScreen.kt:170-174`). NOTE: video has NO audio track by
design (no RECORD_AUDIO; `CameraCaptureAdapter.kt:171`). If the device
refuses the Preview+ImageCapture+VideoCapture triple binding, the UI shows
"Video not supported by this camera combination" and hides Record — that is
the honest degraded fact (`CameraCaptureAdapter.kt:99-111`,
`CaptureScreen.kt:266-286`); record it if it occurs.

**Evidence:** screen recording of the whole capture (see §11); manifest
metadata incl. `video.durationNanos`; file size. Class: physical.

## 7. Pause / resume (+ mid-session permission/process checks)

While CAPTURING with ≥1 asset: tap **"Pause"** → status "Session <id8> —
paused" → tap **"Resume"** → status returns to "capturing". Capture a still
while paused is REFUSED (the Still button is disabled while paused — assets
are only legal while CAPTURING, `CaptureSessionController.kt:425-431`).
Also: rotation/backgrounding — rotate the device and background/foreground
the app mid-session: the session survives (journal is the truth; camera
rebinds with lifecycle).

What persists: every transition is a journaled `session.state` event
(`CaptureSessionController.kt:214-229`); the UI restores purely from the
journal fold. Expected observable after process death is §8.

**Evidence:** screenshots of each status; screen recording of
pause→resume→capture. Class: physical.

## 8. Process restart (force-stop + relaunch)

```bash
adb shell am force-stop org.payswap.aise.app
adb shell monkey -p org.payswap.aise.app -c android.intent.category.LAUNCHER 1
```

Expected: the Capture tab shows the SAME session id in status
"Session <id8> — capturing" (reopened by recovery); the session summary card
shows **"Recovery events: 1"** (`CaptureScreen.kt:545`); all previously
captured assets still listed and intact; a `session.reopened` event was
appended exactly once (`SessionRecovery.kt:125-137,198`). Repeat the
force-stop WITHOUT any operator action in between → relaunch → still
"Recovery events: 1" (exactly-once: the second recovery does NOT re-open;
`SessionRecovery.kt:126-128`).

Then: pause the session → force-stop → relaunch → status "paused" restored
(journaled state survives).

**Evidence:** screenshots after each relaunch (session id + recovery count),
logcat excerpt. Class: physical (process death is real) with the recovery
SEMANTICS verified deterministically by the committed
`SessionRecoveryTest`/`CaptureSessionControllerTest` suites.

## 9. Finalize + submit-blocked + submit + idempotent resubmit + SYNCED

1. **Finalize:** tap **"Finalize"** → message "Session finalized — manifest:
   manifest.json"; status "Session finalized"; the mission panel's submission
   panel appears ("Evidence submission" card). The manifest is the
   deterministic journal projection
   (`CaptureSessionController.kt:194-212`).
2. **Submit-blocked (unauthenticated):** Settings tab → (if signed in)
   "Sign out" → Capture tab → "Submit evidence" → expected: the explicit
   deferral banner — `deferred-offline` with reason "sign in to AISE on the
   mobile client before syncing evidence"
   (`HttpEvidenceSubmissionTransport.kt:24-26`). NO crash, NO silent drop:
   evidence stays in the durable offline store.
3. **Submit:** Settings → "Enter demo" (lane A: the deployed server; lane B:
   the loopback backend) → signed-in message with principal name → Capture →
   "Submit evidence". Expected: "Submitted — server ref
   session:<sessionId>:sequence:0; local session marked synced"; the verdict
   banner flips to `submitted`; the local journal gains FINALIZED→SYNCED
   (`FieldJourneyViewModel.kt:53-56`,
   `CaptureSessionController.kt:379-403`).
4. **Idempotent resubmit:** tap "Retry submission" (or Submit again after
   reset+re-journey): the same idempotency key (`aise-submission-v1:<sha256
   of payload>`, `FieldJourney.kt:104-106`) is re-sent; the server answers
   DUPLICATE and the client treats it as Accepted
   (`HttpEvidenceSubmissionTransport.kt:97-98`). NO duplicate evidence.
5. **Server verification (workstation):**
   ```bash
   # lane A:
   curl -fsS https://aise-tan.vercel.app/healthz
   # lane B:
   curl -fsS http://127.0.0.1:8791/healthz
   # session id = the app's session id (from status line / sync message):
   curl -fsS -H "Accept: application/json" <BASE>/v1/capture/sessions/<session-id> | head -c 800
   ```
   Expected: HTTP 200 with the session envelope (the sequence the device
   submitted). Lane A alternative: sign in on the web app and locate the
   evidence/capture-session record in the product UI (see §10).

**Evidence:** screenshots of every banner/message; curl outputs; logcat.
Class: physical (real device transport) — the server-side acceptance is REAL
network evidence; classify the row "physical (device-originated, real
server answer)".

## 10. Post-work capture entry point + return-to-web (HONEST current state)

- **Current build fact:** there is NO distinct post-work-capture entry
  point. Navigation has exactly 4 destinations
  (`AppDestination.kt:13-17`); the field journey's task/mission identity is
  build-time provisioned (`ProvisionedJourneyDocs`,
  `FieldJourneyRuntime.kt:186-251`); no deep links are declared
  (profile: deep-links `none`, `MobileFieldAdapterProfile.kt:53-56`). The
  web→mobile handoff, post-work capture return path and task-identity
  continuity are assigned to Wave R1 / POST-005 (plan §6 Wave 1 Worker 2).
- **What the operator records instead (this wave):** after §9, on a DESKTOP
  browser open `<BASE>` (lane A: https://aise-tan.vercel.app), sign in with
  the same demo principal, and verify the synced session/evidence is visible
  in the web product (evidence/capture surfaces). Screenshot the web-side
  record showing the device session id. This is the CURRENT combined-loop
  continuity check at product level; the full X-journey (field→office with
  preserved task/evidence identity) is PROD-033's harness-scoped record plus
  this manual check, honestly labeled.
- **Deliverable for the Lead:** file the absence as a confirmed GAP row
  (defect: "no post-work capture entry point / no task-identity return path
  in the Android build") with the file:line citations above and the proposed
  governed fix route (POST-005 scope), NOT a worker patch.

**Evidence:** web screenshot(s) + the device session id cross-reference.
Class: physical (device-originated evidence appearing in the web product) —
but the *entry-point absence* is a deterministic code-level fact.

## 11. Evidence capture commands (run alongside §2–§10)

```bash
adb shell getprop ro.build.fingerprint                       # device fingerprint
adb shell getprop ro.product.model; adb shell getprop ro.build.version.release
adb shell screenrecord /sdcard/aise-post002.mp4 &            # start BEFORE §3; stop after §10
adb pull /sdcard/aise-post002.mp4 .
adb logcat -d > aise-post002-logcat.txt                      # after each numbered section, or at the end
adb shell dumpsys package org.payswap.aise.app > aise-post002-package.txt
sha256sum app-debug.apk aise-post002.mp4 aise-post002-logcat.txt
```

Photos of the device screen are ALSO acceptable first-class evidence
(physical class) where screenrecord is impractical.

## 12. Filing

File under `docs/productization-evidence/PROD-032/physical-device/` (per the
committed lane doc §5) or a new dated evidence directory per the Lead's
instruction, using EVIDENCE-RECORD-TEMPLATE.md per run: fingerprint, journey
recording, logcat, session GET output, per-step classification table updated
to physical fidelity. **Until a real run fills it in, physical fidelity
remains UNEVIDENCED — by design, honestly.**

## Known operator-facing defects this audit found (do NOT patch in the lane;
record them as observed)

1. Submission-panel copy says "The sync transport is not wired in this
   build…" (`CaptureScreen.kt:328-333`) — STALE: the HTTP transport IS wired
   (`AppContainer.kt:83-94`). Expect actual submission to WORK while the
   panel text claims it will defer. Record the contradiction.
2. Still-capture failures are swallowed by an empty `onError` callback
   (`CaptureScreen.kt:258`) — if a still fails you will see NO message.
   Record any silent failure with logcat.
3. PROD-032 lane doc §3's "Settings → server base URL" instruction is stale
   (no runtime override exists — `SettingsScreen.kt:64` is read-only).
