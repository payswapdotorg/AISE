#!/usr/bin/env bash
# AISE Android E2B station — field-mission journey at station fidelity (PROD-032).
#
# Runs INSIDE a bootstrapped E2B station. Boots the REAL AISE backend
# (backend/api, unmodified, Bun runtime, loopback-only, demo-auth mode with a
# random per-run session secret) and then executes the gated station journey
# test (FieldJourneyStationSyncTest) through the Gradle wrapper.
#
# The journey this records (with honest fidelity labels — see the test and
# docs/productization-evidence/PROD-032/README.md):
#
#   capability assessment (DETERMINISTIC)
#   → guided still/video capture (SYNTHETIC bytes — no physical camera)
#   → sensor capture (UNAVAILABLE-ON-STATION, recorded honestly)
#   → pause/resume (DETERMINISTIC)
#   → crash recovery (DETERMINISTIC journal replay)
#   → finalize (DETERMINISTIC)
#   → authenticated submit over REAL HTTP to the REAL backend
#   → idempotent DUPLICATE re-submit (REAL)
#   → offline-defer + resume (DETERMINISTIC + REAL)
#   → server-verified session (REAL)
#   → local FINALIZED→SYNCED marking (DETERMINISTIC)
#
# Emits /workspace/field-journey-record.txt (one line per step, with the
# fidelity label) plus the Gradle transcript on stdout.

set -euo pipefail

STATION_ROOT="${AISE_STATION_ROOT:-/workspace}"
# shellcheck source=/dev/null
source "$STATION_ROOT/station-env.sh"

PORT="${AISE_STATION_BACKEND_PORT:-8791}"
JOURNAL="$STATION_ROOT/field-journey-record.txt"
DATA_DIR="$STATION_ROOT/aise-backend-data"
: > "$JOURNAL"

echo "[field-journey] station: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[field-journey] backend: loopback 127.0.0.1:$PORT (demo-auth, random per-run secret, disposable data dir)"

# ---------------------------------------------------------------- bun -----
if ! command -v bun >/dev/null 2>&1; then
  echo "[field-journey] installing Bun (backend/api runtime)"
  curl -fsSL https://bun.sh/install | bash >/dev/null
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
bun --version

# ------------------------------------------------ backend dependencies -----
cd "$AISE_STATION_ROOT/aise"
if [ ! -d node_modules ]; then
  echo "[field-journey] bun install (workspace dependencies)"
  # Skip browser downloads for test-only tooling the backend never uses —
  # the station boots backend/api only.
  export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  export PUPPETEER_SKIP_DOWNLOAD=1
  bun install --frozen-lockfile >/tmp/bun-install.log 2>&1 || {
    echo "[field-journey] frozen-lockfile install failed; retrying plain install"
    bun install >/tmp/bun-install.log 2>&1
  }
  tail -3 /tmp/bun-install.log
fi

# -------------------------------------------------------- boot backend -----
mkdir -p "$DATA_DIR"
AUTH_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export AISE_AUTH=1
export AISE_AUTH_MODE=demo-open
export AISE_DATA_DIR="$DATA_DIR"
export AUTH_SECRET
export HOST=127.0.0.1
export PORT

cd "$AISE_STATION_ROOT/aise/backend/api"
bun run start > "$STATION_ROOT/backend.log" 2>&1 &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null || true' EXIT

echo "[field-journey] backend pid $BACKEND_PID; waiting for /healthz"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
    echo "[field-journey] backend healthy after ${i}s"
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "[field-journey] BACKEND DIED — log follows"
    cat "$STATION_ROOT/backend.log"
    exit 1
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/healthz" || {
  echo "[field-journey] backend never became healthy"
  cat "$STATION_ROOT/backend.log"
  exit 1
}
echo

# ------------------------------------------------------- journey test ------
cd "$AISE_ANDROID_DIR"
export AISE_STATION_SYNC_BASE_URL="http://127.0.0.1:$PORT"
export AISE_STATION_JOURNAL_PATH="$JOURNAL"

echo "[field-journey] running FieldJourneyStationSyncTest via Gradle"
set +e
./gradlew :app:test --tests "org.payswap.aise.app.field.FieldJourneyStationSyncTest" --rerun-tasks
RC=$?
set -e

echo
echo "[field-journey] journey record ($JOURNAL):"
cat "$JOURNAL"
echo
if [ "$RC" -ne 0 ]; then
  echo "[field-journey] JOURNEY TEST FAILED (exit $RC) — Gradle report follows"
  exit "$RC"
fi
echo "[field-journey] JOURNEY COMPLETED at station fidelity; backend log tail:"
tail -20 "$STATION_ROOT/backend.log"
