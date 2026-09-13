# AISE Android Field Client — `apps/android`

AISE-002 foundation: the Android shell, navigation, the local persistence
abstraction and the build/test harness for the AISE v2 field client.
Everything here is **offline-first** and carries **no server authority**.

This is a self-contained Gradle (Kotlin DSL) project inside the AISE
repository. The repository root is a bun/TypeScript workspace that ignores
this directory (no `package.json` exists here, so the root workspace glob
skips it; Gradle ignores the root workspace entirely).

## Modules

| Module | Kind | Contents |
|---|---|---|
| `:core` | pure Kotlin/JVM (no Android) | the local capture-store persistence abstraction + content identity + all their contracts, fully unit-tested on a plain JVM |
| `:app` | Android application | single-activity Compose shell, placeholder navigation (Home / Settings / About), bottom nav, build-info screen, proof of `:core` wiring |

Toolchain: **Kotlin 2.1.21, AGP 8.7.3, Gradle 8.14.3 (wrapper), JDK 21
toolchain, compileSdk 35, minSdk 26, targetSdk 35.** Every version is pinned
exactly in `gradle/libs.versions.toml`. The foojay toolchain resolver is
applied in `settings.gradle.kts`, so a machine with only a JRE can still
build/test `:core` (the JDK 21 toolchain is auto-provisioned); building
`:app` additionally requires the Android SDK.

## Commands

```bash
cd apps/android

# First run on a machine: performs the one-time dependency sync
# (downloads Gradle distribution + pinned artifacts from
# services.gradle.org / Maven Central / Google Maven — see "Offline
# behavior" below). On a JRE-only machine the JDK 21 toolchain is
# auto-provisioned by the foojay resolver.
./gradlew help

# Pure-JVM tests of the persistence abstraction (the heart of AISE-002)
./gradlew :core:test

# App unit tests (navigation invariants + viewmodel logic; no emulator)
./gradlew :app:test

# Full Android debug build (requires the Android SDK)
./gradlew :app:assembleDebug
```

Local Android SDK: create `local.properties` containing
`sdk.dir=/absolute/path/to/android-sdk` (this file is git-ignored), or set
`ANDROID_HOME`/`ANDROID_SDK_ROOT`. Required pieces: `platforms;android-35`
and `build-tools;35.0.0` (accept licenses with `sdkmanager --licenses`).

## Offline behavior

- **Test execution never touches the network.** `:core` has zero third-party
  main dependencies (Kotlin stdlib only) and its tests perform no I/O; the
  tests assert this themselves (see "No-server-authority guard").
- The **first** Gradle run on a machine requires network access for the
  dependency sync only (Gradle distribution, AGP/Kotlin/AndroidX/JUnit
  artifacts, foojay-resolving a JDK if needed). After one sync, tests can be
  re-run fully offline:

  ```bash
  ./gradlew :core:test --offline --rerun-tasks
  ```

## What is verified where

| Verification | Where it runs |
|---|---|
| `:core` content identity determinism, key-order invariance, reference vectors (independently derived), UTF-8 byte-order key sorting, timezone invariance | `:core:test` (JVM, offline-safe) — local + CI |
| `:core` append-only contract (exact reflection allowlist of `LocalCaptureStore` methods; entry immutability) | `:core:test` |
| `:core` in-memory store behavior (append/get/list/pending/acknowledge, idempotent duplicates, id verification) | `:core:test` |
| `:core` no-network guard (classpath allowlist/denylist + loader probes + Gradle `assertNoNetworkDependencies` resolving the runtime classpath) | `:core:test` (the Gradle task is wired into `test`) |
| `:app` navigation invariants + Home viewmodel/store wiring | `:app:test` (JVM, no Robolectric) |
| Full Android build (`assembleDebug`, zero-permission manifest, adaptive icon, resources) | CI (`.github/workflows/android.yml`); locally when an SDK is present |
| Instrumented smoke test | declared in `app/src/androidTest/` — requires an emulator, deliberately NOT part of `test` or the required CI commands |

## No-server-authority architectural note

Per `spec/architecture.md` §4 and `spec/architecture-lock.md` (authority
invariant 8: *UI state, mobile state and exported files are not canonical
authorities*):

- The client is a **mission executor**. Mission policy, engineering truth,
  readiness and verification are **server-authoritative**. No code in
  `apps/android` computes, asserts or declares engineering results.
- `:core`'s `LocalCaptureStore` is a **persistence abstraction**: it stores
  payload bytes plus acquisition metadata, nothing more. There is no
  "mark verified", no "mission complete" call — capture completion is
  declared only by the Assurance Engine server-side.
- `:core` resolves **zero third-party runtime artifacts** (no HTTP client,
  no server SDK). This is enforced twice: the Gradle task
  `:core:assertNoNetworkDependencies` resolves the runtime classpath and
  fails on anything beyond the Kotlin stdlib; the unit test
  `NoNetworkDependencyTest` re-asserts the same at test-execution time via
  classpath scanning and loader probes.
- The app's source manifest requests **zero permissions** (verified: no
  `uses-permission`/`uses-feature` elements). One build-time footnote for
  precision: the merged APK carries a single application-local marker
  permission, `<applicationId>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
  injected by the manifest merger from `androidx.core`'s AAR manifest. It is
  not declared by this project, is invisible to users, grants no device
  capability (no camera/sensor/location/network/storage), and never prompts.
  Camera/sensors arrive mission-scoped with AISE-005/009.
- Raw evidence is immutable and append-only: duplicates are idempotent
  no-ops, entries are never updated or deleted, and sync acknowledgement is
  an append-only side ledger, never a mutation.

## Content identity (the contract the whole platform will re-derive)

`org.payswap.aise.core.identity.ContentIdentity.contentId(payload, metadata)`
computes a deterministic sha-256 id over a canonical, fully documented
encoding (`AISE-CONTENT-V1`: fixed 15-byte ASCII tag, length-prefixed
payload, then metadata entries sorted **by UTF-8 byte sequence** — not Java
string order — each length-prefixed). The exact byte-level specification is
normative and frozen in the KDoc of `ContentIdentity`; reference vectors
were derived independently of the Kotlin implementation and are pinned in
`ContentIdentityTest`. The server side (AISE-004 ingestion, Evidence Graph
pinning) MUST re-derive exactly this encoding.

## Mapping to AISE-005 (forward-looking notes ONLY — no implementation here)

- The on-device capture session (AISE-005) will implement
  `LocalCaptureStore` (SQLite/file-backed) with the SAME semantics the
  in-memory implementation specifies: append-only, idempotent duplicates,
  re-derived content ids, sync-ack ledger for `pending()`.
- Acquisition metadata keys (`AcquisitionMetadataKeys`) are advisory
  conventions; the canonical cross-platform contract lands in AISE-003
  (`packages/shared-contracts`).
- `HomeViewModel`'s explicit `refresh()` is a foundation stop-gap; AISE-003
  contracts + AISE-005 will introduce a real observation mechanism.
- The instrumented-test harness under `app/src/androidTest/` is the growth
  point for device-side verification once capture exists.

## What is deliberately NOT here

Camera, sensors, capture UI, mission logic, network/sync code, permissions,
capture semantics of any kind — owned by AISE-005/006/009/030.
