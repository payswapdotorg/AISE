#!/usr/bin/env bash
set -euo pipefail

curl -fsSL https://dl.google.com/android/cli/latest/linux_x86_64/install.sh | bash
export PATH="$HOME/.android/bin:$PATH"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

android --version
android sdk install platforms/android-35 build-tools/35.0.0 platform-tools emulator

cd apps/android
./gradlew :core:test :app:test
