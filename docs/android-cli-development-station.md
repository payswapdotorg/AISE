# AISE Android CLI Development & Verification Station

**Owner:** PROD-032  
**Status:** governed implementation target  
**Date:** 2026-09-23

## Decision

AISE Android development does **not** require Android Studio.

The supported station is:

- JDK 21
- the Gradle wrapper committed in `apps/android`
- Google's official Android CLI
- Android SDK API 35 + build-tools 35.0.0 + platform-tools
- Android Emulator / ADB for device execution
- GitHub Actions for reproducible CI instrumentation

Google's current Android CLI can install SDK packages with `android sdk`, create and manage emulators with `android emulator`, build/run APKs with `android run`, inspect UI with `android layout`, and capture screens with `android screen`.

## Local setup

From the repository:

```bash
cd apps/android
./scripts/android-cli-station.sh
```

The script installs the CLI when absent, provisions the pinned API 35 build toolchain, runs the JVM test suites, and assembles the debug APK. It never installs or launches Android Studio.

The normal interactive loop is:

```bash
android --version
android sdk list
./gradlew :app:test
./gradlew :app:assembleDebug

android emulator create --profile medium_phone
android emulator list
android emulator start <device-name>

android run --apks=app/build/outputs/apk/debug/app-debug.apk --device=<serial>

android layout --device=<serial>
android screen capture --output=build/aise-screen.png --device=<serial>
```

Before evaluating an Android journey, inspect current state first, use `android layout` as the primary UI inspection mechanism, use `android screen capture` as the visual fallback, and use ADB for input. A missing action is a journey failure, not something to work around.

## Cloud development / free-tier posture

GitHub Codespaces is the preferred browser-based development station for the TypeScript/web side and Android CLI/JVM work. Personal GitHub accounts currently include 120 core-hours and 15 GB-month storage. GitHub explicitly notes that Codespaces are unavailable for emulators, so Android emulator verification is performed in GitHub Actions or on a local host rather than inside Codespaces.

The practical free-tier topology is:

```text
GitHub repository
  ├─ Codespaces (code, Android CLI, Gradle/JVM tests)
  ├─ GitHub Actions (real Android emulator instrumentation)
  ├─ Vercel (web/API preview/test deployment)
  ├─ Neon (Postgres test environment when enabled)
  ├─ Upstash Redis (session/rate-limit test state)
  └─ Cloudflare R2 (capture/artifact blobs)
```

Current verified free-tier facts on 2026-09-23:

- GitHub personal Free: 120 Codespaces core-hours + 15 GB-month storage; GitHub Actions includes 2,000 minutes/month for Free accounts.
- Cloudflare R2 Standard: 10 GB-month storage, 1M Class A operations, 10M Class B operations per month, and zero egress charges.
- Upstash Redis Free: 256 MB data, 10 GB monthly bandwidth, and 500K commands/month.
- Vercel Hobby remains $0, but its terms restrict Hobby use to personal/non-commercial use. Treat the existing Hobby deployment as development/demo/test infrastructure unless the applicable commercial terms or paid plan permit the workload.
- Neon remains the Postgres provider in the existing architecture; this document does not hard-code a Neon allowance because current allowance details are account/plan dependent and were not machine-verifiable in this update.

## Environment rules

1. Never store provider credentials in the repository.
2. Keep provider ports replaceable behind existing AISE abstractions.
3. Free-tier limits are development/test budgets, not product semantics.
4. A provider over quota must surface an explicit operational state; it must not silently lower engineering assurance.
5. Android CI must prove compilation and emulator journeys without Android Studio.
