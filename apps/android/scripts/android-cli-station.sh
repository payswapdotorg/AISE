#!/usr/bin/env bash
set -euo pipefail

# AISE Android CLI integration station (PROD-032).
# No Android Studio is required. The official Android CLI provisions SDK
# packages and virtual devices; the Gradle wrapper remains the build authority.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

: "${ANDROID_HOME:=${HOME}/Android/Sdk}"
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$HOME/.android/bin:$PATH"

if ! command -v android >/dev/null 2>&1; then
  curl -fsSL https://dl.google.com/android/cli/latest/linux_x86_64/install.sh | bash
  export PATH="$HOME/.android/bin:$PATH"
fi

android --version
android sdk install platforms/android-35 build-tools/35.0.0 platform-tools emulator

./gradlew :core:test :app:test
./gradlew :app:assembleDebug

echo
echo "AISE Android CLI station is ready."
echo "APK: app/build/outputs/apk/debug/app-debug.apk"
echo
echo "For an emulator:"
echo "  android emulator create --profile medium_phone"
echo "  android emulator list"
echo "  android emulator start <device-name>"
echo "  android run --apks=app/build/outputs/apk/debug/app-debug.apk --device=<serial>"
echo
echo "For device inspection:"
echo "  android layout --device=<serial>"
echo "  android screen capture --output=build/aise-screen.png --device=<serial>"
