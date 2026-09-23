#!/usr/bin/env bash
# AISE Android E2B station — the three Gradle gates (PROD-032).
#
# Runs INSIDE a bootstrapped E2B station and executes the three empirically
# required commands, each timed separately, each failing the script on a
# non-zero exit:
#
#   1. ./gradlew :core:test        (pure-Kotlin JVM suite)
#   2. ./gradlew :app:test         (JVM suite incl. the HTTP sync adapters)
#   3. ./gradlew :app:assembleDebug (the debug APK)
#
# Memory adaptation: E2B sandbox sizes vary by template. On small sandboxes
# (< 2 GB RAM) the repo's default Gradle heap (-Xmx1792m) exceeds the machine;
# the script writes a USER-scope gradle.properties (~/.gradle/gradle.properties)
# that overrides the heap/worker footprint WITHOUT touching the repository
# (the repo file stays byte-identical; a user-scope file is a documented
# Gradle mechanism). On >= 2 GB stations the repository defaults are used.

set -euo pipefail

STATION_ROOT="${AISE_STATION_ROOT:-/workspace}"
# shellcheck source=/dev/null
source "$STATION_ROOT/station-env.sh"

TOTAL_MB="$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)"
if [ "$TOTAL_MB" -lt 2000 ]; then
  echo "[gradle-trio] small station (${TOTAL_MB} MB) — installing user-scope Gradle memory overrides"
  mkdir -p "$HOME/.gradle"
  cat > "$HOME/.gradle/gradle.properties" <<PROPS
# E2B small-station overrides (user scope; repo gradle.properties untouched)
org.gradle.jvmargs=-Xmx640m -XX:MaxMetaspaceSize=320m -Dfile.encoding=UTF-8
org.gradle.parallel=false
org.gradle.caching=true
org.gradle.daemon=false
kotlin.daemon.jvmargs=-Xmx384m
kotlin.compiler.execution.strategy=in-process
PROPS
else
  echo "[gradle-trio] station has ${TOTAL_MB} MB — repository Gradle defaults apply"
fi

cd "$AISE_ANDROID_DIR"

run_gate() {
  local label="$1"; shift
  local start end rc
  echo
  echo "==================================================================="
  echo "[gradle-trio] $label"
  echo "\$ $*"
  echo "started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  start=$(date +%s)
  rc=0
  "$@" || rc=$?
  end=$(date +%s)
  echo "finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)  exit=$rc  seconds=$((end-start))"
  if [ "$rc" -ne 0 ]; then
    echo "[gradle-trio] GATE FAILED: $label (exit $rc)"
    exit "$rc"
  fi
}

echo "gradle wrapper: $(./gradlew --version | grep -E '^Gradle' | head -1)"

run_gate ":core:test"          ./gradlew :core:test
run_gate ":app:test"           ./gradlew :app:test
run_gate ":app:assembleDebug"  ./gradlew :app:assembleDebug

echo
echo "[gradle-trio] APK artifact:"
ls -l "$AISE_ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
sha256sum "$AISE_ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
echo
echo "[gradle-trio] ALL THREE GATES PASSED on this station."
