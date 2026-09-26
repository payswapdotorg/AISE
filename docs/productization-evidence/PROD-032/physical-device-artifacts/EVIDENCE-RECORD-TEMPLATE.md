# AISE POST-002 — EVIDENCE RECORD TEMPLATE (fill ONE per physical run)

Copy this file per run. Every field is mandatory; write `N/A` only with a
recorded reason. File the completed record with its artifacts under
`docs/productization-evidence/PROD-032/physical-device/` (or the dated
evidence directory the Tech Lead designates).

## Run header

| field | value |
|---|---|
| Run ID | POST-002-PHYSICAL-<YYYYMMDD>-<seq> |
| Date (UTC) | |
| Operator | |
| Operator role | (contractor / Lead / named worker — the Lead harvests and files) |
| Repo URL + SHA | https://github.com/payswapdotorg/AISE @ `git rev-parse HEAD` = |
| apps/android drift check | `git diff --stat 6728c3b..HEAD -- apps/android` output = |
| APK path + sha256 | app/build/outputs/apk/debug/app-debug.apk, sha256 = |
| APK byte size | |
| Sync lane used | A (https://aise-tan.vercel.app) / B (loopback 127.0.0.1:8791 + cleartext overlay + adb reverse) |
| Backend healthcheck output | (curl /healthz output + timestamp) |
| Build gates | :core:test = __ suites / __ tests / __ failures; :app:test = __ / __ / __ (skipped __); assembleDebug = PASS/FAIL |

## Device header

| field | value |
|---|---|
| Model (`ro.product.model`) | |
| Android release (`ro.build.version.release`) / API level | |
| Build fingerprint (`ro.build.fingerprint`) | |
| Cameras present (rear count) | |
| Rotation-vector sensor present (yes/no) | |
| Screen size class | |
| Granted permissions at end (dumpsys excerpt) | |

## Per-step evidence table (one row per runbook §; verdict ∈ PASS/FAIL/BLOCKED_<REASON>)

| step | action | observed (verbatim) | class (physical/deterministic/synthetic/emulated + qualifier) | artifact | timestamp UTC |
|---|---|---|---|---|---|
| §2 install/launch | | | | | |
| §3 permission order 1 (grant) | | | | | |
| §3 permission deny-once | | | | | |
| §3 permission order 2 (deny→settings→grant) | | | | | |
| §4 capability assessment + session start | | | | | |
| §5 still capture (portrait) | | | | | |
| §5 still capture (landscape; metadata changed?) | | | | | |
| §5 sensor metadata keys present/absent (list them) | | | | | |
| §6 video capture (incl. video.durationNanos) | | | | | |
| §7 pause → resume | | | | | |
| §8 force-stop + relaunch #1 (recovery events count) | | | | | |
| §8 force-stop + relaunch #2 (exactly-once) | | | | | |
| §8 paused-state survival | | | | | |
| §9 finalize (manifest written) | | | | | |
| §9 submit-blocked (signed out) — exact deferral reason | | | | | |
| §9 submit (server ref) | | | | | |
| §9 idempotent resubmit (DUPLICATE) | | | | | |
| §9 server-side session GET (curl output head) | | | | | |
| §10 web return-to-web check (session visible on web) | | | | | |
| §10 post-work-capture entry point (expected GAP observation) | | | | | |

## Defects/observations (including the three known audit findings, if observed)

| # | observation | file:line if code-related | severity | proposed governed route |
|---|---|---|---|---|
| 1 | stale submission-panel copy ("sync transport is not wired") | apps/android/…/CaptureScreen.kt:328-333 | minor/docs | text refresh in a governed UI work item |
| 2 | still-capture failure swallowed (empty onError) | apps/android/…/CaptureScreen.kt:258 | minor/UX | route error to ViewModel message |
| 3 | no post-work capture entry point / no task-identity return | AppDestination.kt:13-17, FieldJourneyRuntime.kt:186-251 | planned | POST-005 (Wave R1) scope |
| … | (new observations) | | | |

## Artifact manifest (every file + sha256)

| artifact | sha256 |
|---|---|
| aise-post002.mp4 (screen recording) | |
| aise-post002-logcat.txt | |
| aise-post002-package.txt | |
| screenshots (…) | |
| manifest.json (session envelope) | |
| server session GET output | |

## Honesty attestation

- [ ] Every PASS row cites a committed artifact.
- [ ] Every BLOCKED row states its reason verbatim and was not dropped.
- [ ] No evidence class was upgraded (no emulator/synthetic/deterministic row
      is labeled physical; deterministic code-audit rows are labeled
      deterministic).
- [ ] No secrets appear in any artifact (no AUTH_SECRET, no session token,
      no API keys; tokens are in-memory only by construction).
- [ ] A fresh run was actually performed by the named operator at the stated
      date/time on the stated device.

Operator signature/date: ____________________
Lead harvest/filing confirmation: ____________________
