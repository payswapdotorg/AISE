# M journey (E2B lane) — fresh-station run record, 2026-09-29

- recorded at: 2026-09-29T08:51:30Z
- station: E2B sandbox `i756v8pfkwihw2evxmfdd` (template `aise-android-station`, Debian 12, 4 CPU / 7956 MB, JDK 21.0.12.1, Android SDK platform 35 + build-tools 35.0.0, Gradle 8.14.3, KVM ABSENT — `station-fingerprint.txt`)
- repo SHA at run time: `477534a` (synced after the deferral-reason expectation fix; `sync.log` shows `1e608f8..477534a`)
- artifacts in this directory: `bootstrap.log`, `emulator-probe.log`, `gradle-trio.log`, `field-journey.log`, `field-journey-record.txt`, `sync.log`, `station-fingerprint.txt`

## Why this run exists

The 2026-09-29 fresh-station trio caught a stale expectation in the Android
unit gate (`FieldJourneyRuntimeTest` still expected the pre-POST-005
"no sync transport" phrasing; the delivered seam contract says
`sign in to AISE on the mobile client before syncing evidence`). Fixed at
`477534a` — the fix is the *test expectation only*; the production seam is
unchanged. This record proves the fixed tree passes everything, on a
station that had never seen this repository before.

## The gates

| Gate | Verdict | Evidence |
|---|---|---|
| station bootstrap | PASS | 22 s to ready (`bootstrap.log`) |
| gradle `:core:test` | PASS | `BUILD SUCCESSFUL` (`gradle-trio.log`) |
| gradle `:app:test` | PASS | 89/89 tests, `BUILD SUCCESSFUL` |
| gradle `:app:assembleDebug` | PASS | `BUILD SUCCESSFUL in 1m 28s` (APK assembled) |
| emulator probe | BLOCKED_NO_KVM (honest) | the station kernel has no KVM — the probe records the blocked lane rather than fabricating an emulator run (`emulator-probe.log`) |
| field journey | PASS | all 16 steps recorded with per-step fidelity classes (`field-journey-record.txt`) |

## The field journey's honest fidelity ledger (16 steps)

REAL: server-health (`/healthz` HTTP 200), auth (demo principal), submit
(server accepted `session:f99b5cfb…:sequence:0`), submit-idempotent (server
DUPLICATE semantics), server-verification (GET session HTTP 200).
DETERMINISTIC: capability-assessment, session-start, guided-capture-progress,
pause-resume, recovery (journal replay recovered the session + 2 assets),
finalize, mark-synced.
SYNTHETIC: guided-still-capture (12 KB deterministic still), guided-video-capture
(24 KB deterministic video) — no physical camera on a station.
UNAVAILABLE-ON-STATION: sensor-capture — no IMU hardware in an E2B sandbox;
the baseline records `imuActive=false` and never conflates it with supported.

The server side of this run is the strongest available mobile proof on this
KVM-less lane: the app's real HTTP transport, real content-addressed asset
uploads, real idempotent sync semantics, real session read-back — with the
capture bytes honestly labeled synthetic.
