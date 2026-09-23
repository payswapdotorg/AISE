#!/usr/bin/env bash
# AISE Android E2B development station — in-sandbox bootstrap (PROD-032).
#
# This script runs INSIDE an E2B sandbox (Debian bookworm) and provisions the
# full Android CLI station WITHOUT Android Studio:
#
#   * system packages: git, curl, unzip, xz, zip, ca-certificates, procps
#   * Eclipse Temurin JDK 21 (Adoptium, x64)
#   * Android SDK cmdline-tools (pinned build 13114758)
#   * platform-tools (adb), platforms;android-35, build-tools;35.0.0
#   * the AISE repository cloned at a PINNED SHA (never a moving branch)
#
# It is IDEMPOTENT: every step is skipped when already satisfied, so the
# driver can re-run it on a resumed sandbox.
#
# Required environment (supplied by the driver; no defaults that could
# silently build the wrong tree):
#
#   AISE_REPO_URL  git remote to clone (default: the AISE repository)
#   AISE_REPO_SHA  the EXACT commit SHA to check out (REQUIRED, no default)
#   AISE_STATION_ROOT  workspace directory (default /workspace)
#
# The script never receives or stores credentials: the repository is public
# and the E2B API key lives ONLY in the driver process on the Tech Lead's
# machine (see station-driver.py).
#
# After success, source /workspace/station-env.sh (written by this script)
# to get JAVA_HOME, ANDROID_HOME and PATH exports.

set -euo pipefail

AISE_REPO_URL="${AISE_REPO_URL:-https://github.com/payswapdotorg/AISE.git}"
AISE_REPO_SHA="${AISE_REPO_SHA:?AISE_REPO_SHA must be set to the exact pinned commit SHA}"
AISE_STATION_ROOT="${AISE_STATION_ROOT:-$HOME/aise-station}"
ANDROID_HOME="${ANDROID_HOME:-$AISE_STATION_ROOT/android-sdk}"
JDK_HOME="$AISE_STATION_ROOT/jdk-21"
CMDLINE_TOOLS_BUILD="13114758"   # pinned cmdline-tools build (see fingerprint below)
SDK_PACKAGES=("platform-tools" "platforms;android-35" "build-tools;35.0.0")

log() { printf '\n[bootstrap %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

mkdir -p "$AISE_STATION_ROOT"
cd "$AISE_STATION_ROOT"

# ---------------------------------------------------------------- system ---
log "system packages"
APT="apt-get"
if [ "$(id -u)" != "0" ]; then
  APT="sudo -n apt-get"   # E2B sandboxes give the default user passwordless sudo
fi
if ! command -v git >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then
  $APT update -qq
  DEBIAN_FRONTEND=noninteractive $APT install -y -qq \
    ca-certificates curl git unzip xz-utils zip procps less >/dev/null
fi
echo "git: $(git --version)"

# ------------------------------------------------------------------- JDK ---
log "Temurin JDK 21"
NEED_JDK=1
if [ -x "$JDK_HOME/bin/java" ]; then
  v="$("$JDK_HOME/bin/java" -version 2>&1 | head -1)"
  case "$v" in *'"21"'*) NEED_JDK=0;; esac
elif command -v java >/dev/null 2>&1; then
  v="$(java -version 2>&1 | head -1)"
  case "$v" in *'"21"'*) NEED_JDK=0; JDK_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")";; esac
fi
if [ "$NEED_JDK" -eq 1 ]; then
  curl -fsSL "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse" \
    -o /tmp/jdk21.tar.gz
  rm -rf "$JDK_HOME"
  mkdir -p "$JDK_HOME"
  tar -xzf /tmp/jdk21.tar.gz -C "$JDK_HOME" --strip-components=1
  rm -f /tmp/jdk21.tar.gz
fi
export JAVA_HOME="$JDK_HOME"
export PATH="$JAVA_HOME/bin:$PATH"
echo "java: $($JAVA_HOME/bin/java -version 2>&1 | head -1)"

# ------------------------------------------------------------ Android SDK ---
log "Android SDK cmdline-tools + platform 35 + build-tools 35.0.0"
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
mkdir -p "$ANDROID_HOME/cmdline-tools"
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
if [ ! -x "$SDKMANAGER" ]; then
  curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS_BUILD}_latest.zip" \
    -o /tmp/cmdline-tools.zip
  unzip -q -o /tmp/cmdline-tools.zip -d "$ANDROID_HOME/cmdline-tools"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -f /tmp/cmdline-tools.zip
fi
if [ ! -x "$ANDROID_HOME/platform-tools/adb" ] || [ ! -d "$ANDROID_HOME/platforms/android-35" ]; then
  yes | "$SDKMANAGER" --licenses >/dev/null 2>&1 || true
  "$SDKMANAGER" "${SDK_PACKAGES[@]}" >/dev/null
fi
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
echo "adb: $("$ANDROID_HOME/platform-tools/adb" --version | head -1)"

# ------------------------------------------------------------- repo clone ---
log "AISE repository @ $AISE_REPO_SHA"
AISE_CHECKOUT="$AISE_STATION_ROOT/aise"
if [ ! -d "$AISE_CHECKOUT/.git" ]; then
  git clone --quiet "$AISE_REPO_URL" "$AISE_CHECKOUT"
fi
git -C "$AISE_CHECKOUT" fetch --quiet origin "$AISE_REPO_SHA" --depth=1 2>/dev/null \
  || git -C "$AISE_CHECKOUT" fetch --quiet origin
git -C "$AISE_CHECKOUT" checkout --quiet --detach "$AISE_REPO_SHA"
git -C "$AISE_CHECKOUT" rev-parse HEAD
echo "repo HEAD: $(git -C "$AISE_CHECKOUT" log -1 --oneline)"

# --------------------------------------------------------- station env file --
cat > "$AISE_STATION_ROOT/station-env.sh" <<ENV
# Sourced station environment (written by e2b-station/bootstrap.sh).
export JAVA_HOME="$JAVA_HOME"
export ANDROID_HOME="$ANDROID_HOME"
export ANDROID_SDK_ROOT="$ANDROID_SDK_ROOT"
export PATH="\$JAVA_HOME/bin:\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$PATH"
export AISE_REPO_URL="$AISE_REPO_URL"
export AISE_REPO_SHA="$AISE_REPO_SHA"
export AISE_STATION_ROOT="$AISE_STATION_ROOT"
export AISE_ANDROID_DIR="$AISE_CHECKOUT/apps/android"
ENV

# ------------------------------------------------------------- fingerprint --
log "station fingerprint"
{
  echo "=== AISE Android E2B station fingerprint ==="
  echo "fingerprintAt: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "kernel: $(uname -srmo)"
  echo "os: $(. /etc/os-release && echo "$PRETTY_NAME")"
  echo "cpus: $(nproc)"
  echo "memoryMb: $(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)"
  echo "jdk: $($JAVA_HOME/bin/java -version 2>&1 | head -1)"
  echo "cmdlineToolsBuild: $CMDLINE_TOOLS_BUILD"
  echo "sdkPackages: ${SDK_PACKAGES[*]}"
  echo "buildTools: $("$SDKMANAGER" --list_installed 2>/dev/null | grep -c 'build-tools;35.0.0') x build-tools;35.0.0 (sdkmanager)"
  echo "adb: $("$ANDROID_HOME/platform-tools/adb" --version | head -1)"
  echo "gradleWrapper: $(grep distributionUrl "$AISE_CHECKOUT/apps/android/gradle/wrapper/gradle-wrapper.properties" | cut -d= -f2-)"
  echo "repoUrl: $AISE_REPO_URL"
  echo "repoSha: $(git -C "$AISE_CHECKOUT" rev-parse HEAD)"
  echo "kvm: $([ -e /dev/kvm ] && echo present || echo ABSENT)"
} | tee "$AISE_STATION_ROOT/station-fingerprint.txt"

log "bootstrap complete — source $AISE_STATION_ROOT/station-env.sh"
