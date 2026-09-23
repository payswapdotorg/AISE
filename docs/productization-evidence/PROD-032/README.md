# PROD-032 — Android E2B station: empirical evidence synthesis

This document synthesizes the EMPIRICAL evidence for the AISE Android E2B
development station (PROD-032). Every claim below is backed by a transcript in
[`transcripts/`](transcripts/) — nothing here is asserted without a recorded
run. The station's operator doc (script inventory, quick start, secret
discipline) is [`apps/android/scripts/e2b-station/README.md`](../../../apps/android/scripts/e2b-station/README.md).

Delivery facts: branch `work/prod-032-android-station`, delivery base
`8969d0f` (AISE main), delivery SHA **`6728c3b`** ("send a canonical wire
envelope — station journey caught schema drift"). The final Gradle trio and
field journey (below) both ran at exactly `6728c3b` on the station
(`station-checkout.log`).

---

## 1. Station design and exact recreation

The station is a **reproducible, script-driven Android build/test environment
on an [E2B](https://e2b.dev) sandbox — no Android Studio anywhere.** All
scripts are committed at `apps/android/scripts/e2b-station/`:

| file | runs on | purpose |
| --- | --- | --- |
| `bootstrap.sh` | inside the sandbox | idempotent provisioning: git + Temurin JDK 21 + Android cmdline-tools + platform 35 + build-tools 35.0.0 + adb, then the AISE repo cloned at a PINNED SHA; writes `station-env.sh` + `station-fingerprint.txt` |
| `gradle-trio.sh` | inside the sandbox | the three empirical gates `:core:test`, `:app:test`, `:app:assembleDebug`, each timed, with per-suite JUnit counts and the APK sha256 recorded |
| `emulator-probe.sh` | inside the sandbox | the honest layered emulator/KVM capability probe (`/dev/kvm` → `emulator -accel-check` → real headless AVD boot attempt) |
| `field-journey.sh` | inside the sandbox | boots the REAL `backend/api` (Bun, loopback, demo-auth, random per-run secret) and runs the gated station field-mission journey test |
| `station-driver.py` | the Tech Lead's machine | creates/connects the sandbox, uploads the scripts, streams every command into local transcripts, fetches artifacts |
| `template-Dockerfile` | E2B's build service | OPTIONAL fast-path template (`aise-android-station`, 4 vCPU / 8 GB) with the toolchain preinstalled; the station is fully reproducible from `bootstrap.sh` on a plain sandbox without it |

### Exact recreation commands (fresh Tech Lead)

```bash
python3 -m venv /path/to/venv && /path/to/venv/bin/pip install e2b
export E2B_API_KEY=...   # runtime secret — never commit it

cd apps/android/scripts/e2b-station
python3 station-driver.py up --repo-sha 6728c3b            # full from-scratch bootstrap
python3 station-driver.py script gradle-trio               # the three Gradle gates
python3 station-driver.py script emulator-probe            # honest KVM/emulator verdict
python3 station-driver.py script field-journey             # station-fidelity field mission
python3 station-driver.py fetch /workspace/station-fingerprint.txt .
python3 station-driver.py kill
```

`up` on a plain default sandbox (no custom template): add `--template base`.
The driver also supports background+follow mode for long-running commands
(sandbox-lifetime hardening added during this effort).

### Secrets handling (binding, confirmed)

- The **E2B API key is a RUNTIME secret read from the `E2B_API_KEY`
  environment variable ONLY.** `station-driver.py` refuses to run without it
  and never touches the value itself (the `e2b` SDK reads the env var
  directly). It is **never committed, echoed, logged, or written into any
  transcript/artifact** — every transcript command header records only the
  non-secret envs it forwards (`AISE_REPO_SHA`, `AISE_REPO_URL`,
  `AISE_STATION_ROOT`); `E2B_API_KEY` appears in none of the 30 transcripts.
- The station backend boot secret is generated **per-run from
  `/dev/urandom inside the sandbox** and never transmitted.
- Demo auth tokens are held in memory only (journey record, `auth` step).

---

## 2. The Gradle trio — ALL THREE GATES PASSED

Final run at the delivery SHA `6728c3b`, 2026-09-23T03:39:55–03:40:06Z
(`transcripts/gradle-trio.log`, station checked out per
`transcripts/station-checkout.log`):

| gate | result | wall time | counts |
| --- | --- | --- | --- |
| `:core:test` | BUILD SUCCESSFUL (914 ms) | 1 s | **34 suites, 387 tests, 0 failures, 0 errors, 0 skipped** |
| `:app:test` | BUILD SUCCESSFUL | 6 s | **22 suite executions (11 suites × debug+release variants), 176 tests, 0 failures, 0 errors, 2 skipped** |
| `:app:assembleDebug` | BUILD SUCCESSFUL | 2 s | APK produced |

- The 2 skips are `FieldJourneyStationSyncTest` (1 per variant) — the journey
  is station-gated and ran separately via `field-journey.sh` (§4).
- `:core:test` also enforces the no-network-dependency guard:
  `assertNoNetworkDependencies` verified the `:core` runtime classpath has
  exactly `[org.jetbrains:annotations:13.0, org.jetbrains.kotlin:kotlin-stdlib:2.1.21]`
  — "Kotlin stdlib only."
- **APK artifact (delivery SHA `6728c3b`):** `app-debug.apk`,
  **18,462,388 bytes (18.4 MB)**, sha256
  `57a3f664a4240fb664d6464a676bb8e5a148672b58a2f6bcdbea1039e173018a`.
- Corroborating earlier runs at `ca13474` (per-suite-counts commit):
  warm validation (03:01) and a clean re-run (03:05, after `./gradlew clean`)
  also passed all three gates with APK 18,443,762 bytes, sha256
  `0a2b8718f36e05cac53c151550bc104fbc652c5470e2c4d551aafd4de50b194c`
  (`gradle-trio-warm-validation.log`, `trio-clean.log`,
  `gradle-trio-at-ca13474.log`). The digest changed at `6728c3b` because the
  canonical-wire-envelope fix is in the packaged code.
- Honest retry history: the very first trio attempt (02:45,
  `gradle-trio-attempt1-stream-timeout.log`) hit an output-stream timeout while
  the first-ever Gradle daemon started; the retry passed. Nothing was papered
  over.

**Trio verdict: PASS at the delivery SHA.**

---

## 3. Emulator verdict — `BLOCKED_NO_KVM`

The probe (`transcripts/emulator-probe.log`, final run 03:32 with a 600 s
boot-timeout) produced the machine-readable verdict:

```
EMULATOR_VERDICT=BLOCKED_NO_KVM (no /dev/kvm in sandbox; exact error above)
```

### Evidence chain (layered, every layer recorded)

1. **Layer 1 — `/dev/kvm`:** ABSENT (station fingerprint + every probe run).
   The E2B sandbox has no nested virtualization.
2. **Layer 2 — `emulator -accel-check`:** exit code **8**, message
   `/dev/kvm is not found: VT disabled in BIOS or KVM kernel module not
   loaded` (Android emulator 37.1.11.0, build_id 15917651).
3. **Layer 3 — real headless AVD boot attempt** (`aise-api35-probe`, pixel_6
   profile, system-images;android-35;google_apis;x86_64, `-accel off
   -memory 1024 -gpu swiftshader_indirect`): the emulator process exits
   before boot with the exact FATAL:
   ```
   FATAL | Not enough space to create userdata partition. Available: 3150.73 MB
          | at /home/user/.config/.android/avd/aise-api35-probe.avd, need 7372.80 MB.
   ```

The verdict was not declared prematurely — four probe iterations and four AVD
experiments chased every plausible escape:

| transcript | what was tried | outcome |
| --- | --- | --- |
| `emulator-probe-run1-libs-missing.log` | first probe | emulator binary couldn't load (`libX11.so.6` missing) — libs installed next (`apt-libs.log`: 20 X11/GL/NSS/ALSA packages via apt) |
| `emulator-probe-run2-avd-home-mismatch.log` | probe after libs | `Unknown AVD name` — `ANDROID_AVD_HOME` mismatch diagnosed (`avd-inspect.log`, `avd-inspect2.log`) |
| `emulator-probe-run3-userdata-space.log` | probe with AVD found | the userdata-space FATAL (above) |
| `emulator-probe-run4-config-caps-ineffective.log` | probe with `disk.dataPartition.size` capped to 2G | identical FATAL — config cap ineffective |
| `avd-experiment.log` | `config.ini` surgery: 2G data partition + qcow2 | identical FATAL (and the emulator rewrites the size back to 6442450944) |
| `avd-experiment2.log` | device-profile removal + `-partition-size 2048` flag | identical FATAL in both tests |
| `avd-experiment3.log` | AVD/system-image forensics | pixel_6 default userdata ≈ 7.37 GB vs 3.15 GB free (`sdk-df.log`: 12 GB root FS) |
| `avd-experiment4.log` | `-verbose` emulator run | identical FATAL (EncryptUserData on; disk check "Ok" yet partition creation fails) |
| `emulator-probe.log` | **final probe, 600 s timeout** | **`BLOCKED_NO_KVM`** |

### Consequence (the honest scope of the station)

**E2B is the build/CLI/test station, NOT an emulator-fidelity environment.**
No on-station emulator boot exists, therefore no instrumented-test, no
emulator camera/sensor pipeline, and no emulator runtime-permission evidence
was claimed. Even if the userdata disk limit were dodged, `-accel off`
software emulation without KVM on 4 vCPUs is not a fidelity environment.
Everything emulator-grade or physical-grade is explicitly deferred to the
**physical-device lane**
([`physical-device-lane.md`](physical-device-lane.md)) — a documented lane
awaiting physical execution, never fabricated.

---

## 4. Field journey at station fidelity — PASSED

Final run at the delivery SHA `6728c3b`, 2026-09-23T03:39:07Z
(`transcripts/field-journey.log` + `transcripts/field-journey-record.txt`):
`FieldJourneyStationSyncTest` PASSED (`BUILD SUCCESSFUL in 11s`, 26 tasks
executed) against the **real backend** booted in the sandbox: Bun 1.4.2,
`aise-api` 0.1.0 on loopback `127.0.0.1:8791`, demo-auth, random per-run
secret, disposable data dir, healthy after 2 s. Session
`f99b5cfb-c369-333b-952c-83fd7de7234f`.

### Fidelity matrix — the 16 journey steps, honestly classified

Reproduced verbatim in classification from `field-journey-record.txt`:

| # | step | fidelity | detail |
| --- | --- | --- | --- |
| 1 | `server-health` | **REAL** | `/healthz` HTTP 200 |
| 2 | `auth` | **REAL** | demo principal 'Demo Evaluator' (demo); token held in memory only |
| 3 | `capability-assessment` | DETERMINISTIC | negotiation=PERMITTED; mission=mission-2026-000042; gaps=3 |
| 4 | `session-start` | DETERMINISTIC | session opened with honest baseline (imuActive=false) |
| 5 | `guided-still-capture` | SYNTHETIC | 12 KB deterministic still bytes (no physical camera) |
| 6 | `guided-video-capture` | SYNTHETIC | 24 KB deterministic video bytes (no physical camera) |
| 7 | `sensor-capture` | **UNAVAILABLE-ON-STATION** | no IMU/rotation-vector hardware in an E2B sandbox; the baseline snapshot records imuActive=false (never conflated with supported) |
| 8 | `guided-capture-progress` | DETERMINISTIC | evidenceByStep=[step-stills, step-video] |
| 9 | `pause-resume` | DETERMINISTIC | CAPTURING→PAUSED→CAPTURING journaled transitions |
| 10 | `recovery` | DETERMINISTIC | journal replay recovered session=f99b5cfb… assets=2 |
| 11 | `finalize` | DETERMINISTIC | manifest exported (3550 chars) |
| 12 | `submit-blocked` | DETERMINISTIC | unauthenticated transport defers explicitly: sign in to AISE on the mobile client before syncing evidence |
| 13 | `submit` | **REAL** | server accepted: session:f99b5cfb…:sequence:0 |
| 14 | `submit-idempotent` | **REAL** | same idempotency key re-accepted (server DUPLICATE semantics) |
| 15 | `server-verification` | **REAL** | GET /v1/capture/sessions/f99b5cfb… HTTP 200 |
| 16 | `mark-synced` | DETERMINISTIC | local session f99b5cfb… FINALIZED→SYNCED after server acceptance |

REAL = a real HTTP interaction with the real backend. DETERMINISTIC = pure
in-process logic (state machines, journal, manifest), reproducible byte-for-
byte. SYNTHETIC = fixture bytes standing in for absent hardware. The server
side independently confirms the REAL steps (`field-journey.log` backend tail):
`capture_asset` STORED (12,288 B `image/jpeg`, contentId `95d1814f…`;
24,576 B `video/mp4`, contentId `41d16172…`) → re-upload DUPLICATE;
`capture_sync` ACCEPTED `batch-f99b5cfb…-0` sequence 0 → replay DUPLICATE;
`capture_session_read` 200.

### The journey caught a real bug (honest failure history)

- Attempt 1 (03:33, `field-journey-attempt1-lifecycle-task.log`): Gradle
  task-selection error (`Unknown command-line option '--tests'` on the `:app:test`
  lifecycle task) — script fix, no claims made.
- Attempt 2 (03:34, `field-journey-attempt2-schema-invalid.log`,
  `field-journey-test-result.xml`, `journey-report.log`): the journey ran
  against the real backend and **FAILED at submit** — server answered
  `400 schema_invalid` on `POST /v1/capture/sync`. This was a genuine
  client/server schema drift **caught by the station journey**, fixed by the
  delivery commit `6728c3b` ("send a canonical wire envelope"), after which
  the final journey passed end-to-end. The failing XML is preserved as
  evidence, not hidden.

---

## 5. Honest limitations

1. **No physical camera or sensors exist in an E2B sandbox.** The still/video
   capture bytes are deterministic fixtures (12 KB / 24 KB, content-addressed).
   They are labeled SYNTHETIC at every layer (journey record, this README) and
   are **never conflated with physical evidence** — no camera-fidelity claim is
   made anywhere in PROD-032.
2. **Sensor capture is UNAVAILABLE-ON-STATION.** The session baseline honestly
   records `imuActive=false`; the app never reports unsupported hardware as
   supported.
3. **The submit-blocked → sign-in flow.** Before the authenticated submit, the
   journey exercises the unauthenticated transport path, which defers
   explicitly ("sign in to AISE on the mobile client before syncing evidence")
   — the blocked state is asserted, then resolved by the real sign-in + submit.
4. **No emulator on the station** (`BLOCKED_NO_KVM`, §3) — hence the
   physical-device lane for emulator/physical-grade evidence.
5. **E2B quota/timeout behaviors observed and recorded:** the first
   `gradle-trio` attempt hit an output-stream timeout during first Gradle
   daemon startup (retried, then passed); probe boot-timeouts were extended
   240 s → 600 s to give the (doomed) AVD boot a fair chance; long commands
   run in driver background+follow mode (sandbox-lifetime hardening); the trio
   script auto-tunes Gradle memory for the 8 GB sandbox via user-scope
   properties only (the repository stays untouched); disk is 12 GB total, so
   the pixel_6 userdata partition (≈7.37 GB) cannot fit alongside the
   installed SDK (4.8 GB) + Gradle caches (1.4 GB).
6. **Warm-cache honesty:** the final trio at the delivery SHA ran on a warm
   daemon (many tasks UP-TO-DATE/FROM-CACHE). From-clean execution is
   separately evidenced at `ca13474` (`trio-clean.log` +
   `gradle-trio-at-ca13474.log`); the final log's executed tasks (dex, package,
  `:app:test` both variants) plus the fresh APK digest confirm a real build.

---

## 6. Environment fingerprint

Recorded at 2026-09-23T02:44:46Z (`transcripts/station-fingerprint.txt`; a
first bootstrap at 01:30 pinned the repo at `20bdc0a`, the second at
`ca13474` — `bootstrap.log`):

```
kernel: Linux 6.1.158+ x86_64 GNU/Linux
os: Debian GNU/Linux 12 (bookworm)
cpus: 4
memoryMb: 7956
jdk: openjdk version "21.0.12.1" 2026-08-18 LTS (Temurin)
cmdlineToolsBuild: 13114758
sdkPackages: platform-tools platforms;android-35 build-tools;35.0.0
adb: Android Debug Bridge version 1.0.41
gradleWrapper: gradle-8.14.3-bin.zip
repoUrl: https://github.com/payswapdotorg/AISE.git
repoSha: ca13474b2da715614177da0da87886aaf23d91f1   (delivery runs at 6728c3b, per station-checkout.log)
kvm: ABSENT
disk: 12 GB root filesystem (sdk-df.log)
```

---

## 7. What PROD-032 established, in one paragraph

On a plain E2B sandbox, from committed scripts alone and with zero Android
Studio, the AISE Android workspace builds and passes its full quality trio at
the delivery SHA (`:core:test` 387/387, `:app:test` 176 tests/0 failures,
`:app:assembleDebug` 18.4 MB APK, digest recorded), and the field-mission
journey runs end-to-end against the real backend — including a caught-and-fixed
schema drift — with every one of its 16 steps honestly classified. The emulator
question was answered empirically and negatively (`BLOCKED_NO_KVM`, layered
evidence), which fixes the station's scope: **build/CLI/test station**.
Physical-fidelity evidence (camera, video, sensors, runtime permissions,
capture lifecycle on real hardware) is a documented, awaiting-execution lane:
[`physical-device-lane.md`](physical-device-lane.md).

## Transcript index

| transcript | evidence |
| --- | --- |
| `station-fingerprint.txt` | environment fingerprint (§6) |
| `bootstrap.log` | two full bootstraps (20bdc0a, ca13474), 22.2 s / 18.3 s |
| `station-checkout.log` | delivery checkout at `6728c3b` |
| `gradle-trio-attempt1-stream-timeout.log` | honest retry: first-daemon stream timeout |
| `gradle-trio-warm-validation.log` | trio PASS at `ca13474` (warm) |
| `trio-clean.log`, `gradle-trio-at-ca13474.log` | from-clean trio PASS at `ca13474` |
| `gradle-trio.log` | **trio PASS at delivery SHA `6728c3b`** (§2) |
| `sdk-df.log`, `apt-libs.log` | disk budget; emulator system libraries install |
| `emulator-probe-run1..4-*.log` | the four probe iterations (§3) |
| `avd-inspect.log`, `avd-inspect2.log`, `avd-experiment.log`…`avd-experiment4.log` | AVD forensics / escape attempts (§3) |
| `probe-run1-tail.log`, `probe-run1-sentinel.log`, `probe-procs.log` | probe liveness diagnostics |
| `emulator-probe.log` | **final verdict `BLOCKED_NO_KVM`** (§3) |
| `field-journey-attempt1-lifecycle-task.log`, `field-journey-attempt2-schema-invalid.log`, `field-journey-test-result.xml`, `journey-report.log` | honest failure history incl. caught schema drift (§4) |
| `field-journey.log`, `field-journey-record.txt` | **journey PASS at delivery SHA + the 16-step fidelity matrix** (§4) |
