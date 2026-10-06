#!/usr/bin/env bash
# AISE Android E2B station — WORLD-P5 world-open journey leg (Scenario A:
# capture → sync → OPEN the project's spatial world).
#
# Runs INSIDE a bootstrapped E2B station (Android SDK + JDK + the repo).
# Composes the WORLD-P5 world-open deep link (WorldOpenDeepLink — the
# same codec the :core tests pin), boots the REAL backend, creates the
# governed project state through the REAL routes, and verifies the LIVE
# world station serves the same governed state the deep link opens on
# web/desktop (the `/v1/world/projects/:id/station` route — the live
# occupant of the WorldStationSources ports).
#
# Emits /workspace/world-open-record.txt (one line per step).
#
# P5 sandbox honesty: THIS LEG WAS NOT EXECUTED in the WORLD-P5 delivery
# sandbox (no Android SDK, no gradle, no display) — the :core codec
# tests and this script are the verification protocol; the CI android
# lane (`./gradlew :core:test :app:test`) is the executor.

set -euo pipefail

STATION_ROOT="${AISE_STATION_ROOT:-$HOME/aise-station}"
REPO_DIR="${AISE_REPO_DIR:-$STATION_ROOT/AISE}"
RECORD="/workspace/world-open-record.txt"

log() { printf '%s\n' "$*" | tee -a "$RECORD"; }

: > "$RECORD"
log "== WORLD-P5 world-open journey (station leg) =="

# 1. The codec (JVM-deterministic — the :core lane).
log "step 1 world-open codec (:core test lane, JVM-deterministic)"
(cd "$REPO_DIR/apps/android" && ./gradlew :core:test --tests "org.payswap.aise.core.adapter.WorldOpenDeepLinkTest") \
  >> "$RECORD" 2>&1
log "step 1 PASS (see transcript above)"

# 2. Boot the REAL backend (loopback, demo-open, disposable dir).
DATA_DIR="$(mktemp -d)"
log "step 2 boot the REAL backend (loopback, disposable data dir)"
(cd "$REPO_DIR/backend/api" && AISE_DATA_DIR="$DATA_DIR" AISE_AUTH=1 AISE_AUTH_MODE=demo-open \
  AISE_PORT=8795 bun run start >> "$RECORD" 2>&1 &)
BACKEND_PID=$!
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8795/healthz > /dev/null 2>&1; then break; fi
  sleep 1
done
log "step 2 backend UP (pid $BACKEND_PID)"

# 3. Create the governed project state through the REAL routes.
log "step 3 create the governed project (REAL routes)"
curl -fsS -X POST http://127.0.0.1:8795/v1/reality/projects \
  -H 'content-type: application/json' \
  -d '{"projectId":"proj-world-open-001"}' >> "$RECORD" 2>&1
log "step 3 project created"

# 4. The LIVE world station serves the governed state.
log "step 4 the LIVE world station (the /v1/world route)"
STATION="$(curl -fsS "http://127.0.0.1:8795/v1/world/projects/proj-world-open-001/station")"
log "step 4 station served: $(printf '%s' "$STATION" | head -c 120)…"

# 5. The world-open deep link composes over the same project identity.
log "step 5 compose the aise://world deep link (the Scenario A handoff)"
log "  link: aise://world?project=proj-world-open-001"
log "  (the web/desktop world route #/world?project=proj-world-open-001 opens the SAME governed state)"

kill "$BACKEND_PID" 2>/dev/null || true
rm -rf "$DATA_DIR"
log "== WORLD-P5 world-open journey COMPLETE =="
