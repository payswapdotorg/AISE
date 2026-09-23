# AISE Android E2B development station (PROD-032)

A REPRODUCIBLE, script-driven Android development/test station on
[E2B](https://e2b.dev) sandboxes — no Android Studio anywhere. Everything a
fresh Tech Lead needs is committed here:

| file | runs on | purpose |
| --- | --- | --- |
| `bootstrap.sh` | inside the sandbox | idempotent provisioning: git + Temurin JDK 21 + Android cmdline-tools + platform 35 + build-tools 35.0.0 + adb, then the AISE repo cloned at a PINNED SHA; writes `station-env.sh` + `station-fingerprint.txt` |
| `gradle-trio.sh` | inside the sandbox | the three empirical gates `:core:test`, `:app:test`, `:app:assembleDebug`, each timed; auto-tunes Gradle memory on small sandboxes (user-scope properties only — the repo stays untouched) |
| `emulator-probe.sh` | inside the sandbox | the honest layered emulator/KVM capability probe (`/dev/kvm` → `emulator -accel-check` → real headless AVD boot attempt) |
| `field-journey.sh` | inside the sandbox | boots the REAL `backend/api` (Bun, loopback, demo-auth, random per-run secret) and runs the gated station field-mission journey test |
| `station-driver.py` | the Tech Lead's machine | creates/connects the sandbox, uploads these scripts, streams every command into local transcripts, fetches artifacts |
| `template-Dockerfile` | E2B's build service | OPTIONAL fast-path template (`aise-android-station`, 4 vCPU / 8 GB) with the toolchain preinstalled; the station is fully reproducible from `bootstrap.sh` on a plain sandbox without it |

## Secret discipline (binding)

The E2B API key is a RUNTIME secret read from the `E2B_API_KEY` environment
variable ONLY. It is never committed, echoed, logged, or written into any
transcript/artifact. `station-driver.py` refuses to run without it and never
touches the value itself (the `e2b` SDK reads the env var directly). The
station's backend boot secret is generated per-run from `/dev/urandom` inside
the sandbox and is never transmitted.

## Quick start (fresh Tech Lead)

```bash
python3 -m venv /path/to/venv && /path/to/venv/bin/pip install e2b
export E2B_API_KEY=...   # runtime secret — never commit it

cd apps/android/scripts/e2b-station
python3 station-driver.py up --repo-sha <pinned-commit-sha>          # full from-scratch bootstrap
python3 station-driver.py script gradle-trio                          # the three Gradle gates
python3 station-driver.py script emulator-probe                       # honest KVM/emulator verdict
python3 station-driver.py script field-journey                        # station-fidelity field mission
python3 station-driver.py fetch /workspace/station-fingerprint.txt .
python3 station-driver.py kill
```

`up` without the custom template (plain default sandbox): add
`--template base`. The full recreation guide — including what was EMPIRICALLY
proven on the station, sandbox behavior (boot time, resources, quotas) and the
honest fidelity classification matrix — lives in
`docs/productization-evidence/PROD-032/README.md`.
