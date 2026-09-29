# ANDROID-TRIO-REPAIR — the stale 1.0.0 version pins, repaired and station-proven (2026-09-29)

## What this is

The Android gradle trio (`./gradlew :core:test :app:test :app:assembleDebug`) was
RED at HEAD: three "1.0.0"-era version pins were left stale by VOICE-001's
source-sync-only contract bump (`4a6983c`: `CaptureContractVersion.V1`
"1.0.0" → "1.1.0") — VOICE-001's own gate was `bun run verify` (TS-side) with no
Gradle run required by its work order, so the drift never surfaced. The finding
is recorded in the resident-watch worklog (Task 139, verified against the code,
not suspected; Task 140 decision: repair lead-side so VOICE-003 dispatches on a
green baseline).

## The repair (commit `50b66aa`, 3 files, +5/−3, no TS-side changes needed)

All three refresh to `CaptureContractVersion.CURRENT` — pinned to the constant,
NEVER a literal (the same discipline the shared `CONTRACT_VERSION` constant
enforces on every platform); the next version bump fails loudly at the
version-pin tests instead of silently in a string:

1. `apps/android/core/src/test/kotlin/org/payswap/aise/core/session/SessionManifestExporterTest.kt`
   — "manifest carries the required wire fields with correct shapes":
   `assertEquals("1.0.0", tree.get("contractVersion").asText())` →
   `assertEquals(CaptureContractVersion.CURRENT, tree.get("contractVersion").asText())`
   (was the `:core:test` failure against the 1.1.0-emitting code).
2. `apps/android/app/src/test/kotlin/org/payswap/aise/app/capture/CaptureSessionControllerTest.kt`
   — "full lifecycle - start, stills, pause, resume, video, finalize, manifest":
   `manifestText.contains("\"contractVersion\": \"1.0.0\"")` →
   `manifestText.contains("\"contractVersion\": \"${CaptureContractVersion.CURRENT}\"")`
   (was the `:app:test` failure).
3. `apps/android/app/src/main/kotlin/org/payswap/aise/app/field/HttpEvidenceSubmissionTransport.kt`
   — the SyncBatch wrapper: `"contractVersion" to JsonValue.str("1.0.0")` →
   `JsonValue.str(CaptureContractVersion.CURRENT)` (same-major-accepted by the
   backend gateway today, so the wire worked — a drift hazard, now closed).

Pre-check performed: no TS-side test pins the literal in these Kotlin files as
text (the android-wiring tests read other files); the diff touches no TS file —
confirmed by the commit stat (3 Kotlin files, +5/−3).

## The station proof (the merge gate for this repair)

E2B station `aise-android-station`, sandbox `id590quvqd37a0qs5vogc` (boot 1.4s),
repo synced to **`50b66aa`** (bootstrap log: "repo HEAD: 50b66aa android: repair
the three stale 1.0.0 version pins …"), trio run 2026-09-29T20:19:43Z →
20:22:38Z, **ALL THREE GATES PASSED** (each timed; `gradle-trio.sh` fails on any
non-zero exit):

| gate | verdict | time | evidence |
| --- | --- | --- | --- |
| `:core:test` | PASS | 72s (BUILD SUCCESSFUL in 1m 10s, finished 20:20:57Z, exit=0) | `transcripts/gradle-trio.txt` §[gradle-trio] :core:test |
| `:app:test` | PASS | 35s (BUILD SUCCESSFUL in 34s, finished 20:21:32Z, exit=0) | `transcripts/gradle-trio.txt` §[gradle-trio] :app:test |
| `:app:assembleDebug` | PASS | 66s (BUILD SUCCESSFUL in 1m 6s, finished 20:22:38Z, exit=0) | `transcripts/gradle-trio.txt` §[gradle-trio] APK |

APK artifact: `app-debug.apk`, 18,460,302 bytes,
sha256 `d44e399321f3b2feae166fb304f5fdf9d2ed8e5a8121a74e3be08b367d312090`.

Environment fingerprint: see `transcripts/station-fingerprint.txt` (4 vCPU /
7956 MB, Debian 12, Temurin JDK 21.0.12.1, platform 35, build-tools 35.0.0,
Gradle 8.14.3, `kvm: ABSENT` — the honest no-KVM state; no emulator claim is
made here). The sandbox was explicitly killed after the proof fetch
(`station-driver.py kill`, 20:44:29Z).

Per-suite counts note: this run's gates are recorded by verdict + timing above;
the PROD-032 station record (`docs/productization-evidence/PROD-032/README.md`,
delivery SHA `6728c3b`: `:core:test` 387/387, `:app:test` 176/0) is the
per-suite-count reference for the era's suites — the two repaired tests are
among them and now pass against the 1.1.0-emitting code (that is the substance
of this repair: the trio gate could not pass without it).

## Honest boundary

This record claims ONLY what was run: the trio at `50b66aa` on the named
station, the repair diff above, and the TS-side repo gate `bun run verify`
(PASS at `50b66aa` — the resident-watch worklog Task 141 entry records the
run). No emulator/instrumented/physical claim (KVM absent — the physical lane
stays with `docs/productization-evidence/PROD-032/physical-device-lane.md`).
The VOICE-003 work order (`docs/android-voice-work-orders-2026-09-29.md`)
still governs the voice lane itself; its "stale version-literal repairs"
clause is now already satisfied at baseline — the VOICE-003 worker verifies
and reports it as found-done.
