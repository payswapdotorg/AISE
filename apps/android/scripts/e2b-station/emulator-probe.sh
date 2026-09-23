#!/usr/bin/env bash
# AISE Android E2B station — empirical emulator/KVM capability probe (PROD-032).
#
# Runs INSIDE a bootstrapped E2B station and answers ONE question honestly:
# can this station run the Android emulator (API 35) at all?
#
# The probe is layered so each failure mode is recorded with its exact
# evidence (never a guess):
#
#   1. /dev/kvm presence (nested virtualization)
#   2. emulator -accel-check (the emulator's own verdict)
#   3. a REAL headless AVD boot attempt with a hard timeout
#
# The verdict is printed as a machine-readable line:
#
#   EMULATOR_VERDICT=RUNNING | BLOCKED_NO_KVM | BLOCKED_<reason>
#
# Per the PROD-032 work order, a BLOCKED verdict is a legitimate, honest
# outcome: the station remains the build/CLI/test station, and physical-device
# verification moves to the external lane (never fabricated here).

set -uo pipefail

STATION_ROOT="${AISE_STATION_ROOT:-$HOME/aise-station}"
# shellcheck source=/dev/null
source "$STATION_ROOT/station-env.sh"

# A read-only preinstalled SDK root (e.g. the aise-android-station template)
# cannot host the on-demand emulator/system-image install; fall back to a
# user-owned SDK root (the bootstrap's install path, repeated here so the
# probe is self-contained on plain sandboxes too).
if [ ! -w "$ANDROID_HOME" ]; then
  echo "[emulator-probe] $ANDROID_HOME is not writable — using a user-owned SDK root"
  export ANDROID_HOME="$STATION_ROOT/android-sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
    curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip" \
      -o /tmp/cmdline-tools.zip
    unzip -q -o /tmp/cmdline-tools.zip -d "$ANDROID_HOME/cmdline-tools"
    rm -rf "$ANDROID_HOME/cmdline-tools/latest"
    mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
    rm -f /tmp/cmdline-tools.zip
  fi
fi

EMULATOR_BIN="$ANDROID_HOME/emulator/emulator"
AVD_NAME="aise-api35-probe"
BOOT_TIMEOUT_SECS="${EMULATOR_BOOT_TIMEOUT_SECS:-240}"
echo "[emulator-probe] layer 1: /dev/kvm"
if [ -e /dev/kvm ]; then
  echo "  /dev/kvm PRESENT (nested virtualization exposed)"
  KVM="present"
else
  echo "  /dev/kvm ABSENT — the sandbox has no nested virtualization"
  KVM="absent"
fi

echo
echo "[emulator-probe] installing emulator + system image packages (if missing)"
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
if [ ! -x "$EMULATOR_BIN" ] || [ ! -d "$ANDROID_HOME/system-images/android-35/google_apis/x86_64" ]; then
  yes | "$SDKMANAGER" --licenses >/dev/null 2>&1 || true
  "$SDKMANAGER" "emulator" "system-images;android-35;google_apis;x86_64" >/dev/null
fi

echo
echo "[emulator-probe] layer 2: emulator -accel-check"
ACCEL_RC=0
"$EMULATOR_BIN" -accel-check >/tmp/accel-check.log 2>&1 || ACCEL_RC=$?
cat /tmp/accel-check.log
echo "  accel-check exit code: $ACCEL_RC"

echo
echo "[emulator-probe] layer 3: real headless AVD boot attempt (timeout ${BOOT_TIMEOUT_SECS}s)"
AVDMAKER="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"
if ! "$AVDMAKER" list avd 2>/dev/null | grep -q "Name: $AVD_NAME"; then
  echo "no" | "$AVDMAKER" create avd -n "$AVD_NAME" -k "system-images;android-35;google_apis;x86_64" \
    --device "pixel_6" >/tmp/avd-create.log 2>&1 || true
  cat /tmp/avd-create.log
fi

export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_AVD_HOME="$HOME/.config/.android/avd"
mkdir -p "$ANDROID_AVD_HOME"
"$EMULATOR_BIN" -avd "$AVD_NAME" -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect \
  -accel off -memory 1024 >/tmp/emulator-boot.log 2>&1 &
EMU_PID=$!
echo "  emulator pid: $EMU_PID"

BOOTED=0
START=$(date +%s)
while [ $(( $(date +%s) - START )) -lt "$BOOT_TIMEOUT_SECS" ]; do
  sleep 5
  if ! kill -0 "$EMU_PID" 2>/dev/null; then
    echo "  emulator process EXITED before boot completed"
    break
  fi
  if "$ANDROID_HOME/platform-tools/adb" wait-for-device shell getprop sys.boot_completed 2>/dev/null | grep -q 1; then
    BOOTED=1
    break
  fi
done

if [ "$BOOTED" = "1" ]; then
  echo "  BOOT COMPLETED within $(( $(date +%s) - START ))s"
  "$ANDROID_HOME/platform-tools/adb" devices
  echo
  echo "EMULATOR_VERDICT=RUNNING (software rendering, -accel off; KVM=$KVM)"
  VERDICT="RUNNING"
else
  echo "  boot did NOT complete; last emulator output follows"
  tail -60 /tmp/emulator-boot.log
  "$ANDROID_HOME/platform-tools/adb" devices 2>/dev/null || true
  echo
  if [ "$KVM" = "absent" ]; then
    echo "EMULATOR_VERDICT=BLOCKED_NO_KVM (no /dev/kvm in sandbox; exact error above)"
    VERDICT="BLOCKED_NO_KVM"
  else
    echo "EMULATOR_VERDICT=BLOCKED_OTHER (see emulator output above)"
    VERDICT="BLOCKED_OTHER"
  fi
fi

kill "$EMU_PID" 2>/dev/null || true
wait "$EMU_PID" 2>/dev/null || true
echo "[emulator-probe] verdict: $VERDICT"
