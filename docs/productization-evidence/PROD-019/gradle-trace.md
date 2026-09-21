# PROD-019 — Gradle trace

**Work item:** PROD-019. **Base:** public main
`7d21d47147a3df14a0e6138131de6d9add672d27`.

## Sandbox environment (honest statement)

- The sandbox ships a JRE 21 only (no `javac`, no sudo). A portable JDK 21
  (Eclipse Temurin 21.0.12.1+1, linux x64, from the Adoptium API endpoint
  named in the task packet) was fetched into `/tmp` and put on `PATH`/
  `JAVA_HOME` for the Gradle runs below.
- **No Android SDK** is present (`ANDROID_HOME` unset, no `local.properties`)
  — `:app:test` and `:app:assembleDebug` CANNOT run in this sandbox. The
  Android-module code (including the new `FieldJourneyRuntimeTest`) follows
  the existing module patterns exactly; **the Lead re-runs the full Gradle
  gate (`:core:test`, `:app:test`, `:app:assembleDebug`) at the integration
  station.** No Gradle results are claimed below that were not produced here.

## Commands run and their summaries

### 1. Baseline probe (before any change)

```bash
cd apps/android
./gradlew --no-daemon :core:test
```

```text
> Task :core:test
BUILD SUCCESSFUL in 2m 23s
5 actionable tasks: 5 executed
```

Baseline: 26 test classes, **323 tests, 0 failures** (counted from the
generated JUnit XML).

### 2. The gate (after the PROD-019 implementation)

```bash
cd apps/android
./gradlew --no-daemon :core:test
```

```text
BUILD SUCCESSFUL
5 actionable tasks: 1 executed, 4 up-to-date
```

### 3. Final clean re-run (the trace of record)

```bash
cd apps/android
./gradlew --no-daemon :core:test --rerun-tasks
```

```text
BUILD SUCCESSFUL in 59s
5 actionable tasks: 5 executed
```

Verified from the generated JUnit XML
(`core/build/test-results/test/*.xml`):

- **387 tests total, 0 failures, 0 errors** — 323 baseline + **64 new
  adapter tests** across 8 new test classes:

| New `:core` suite (`org.payswap.aise.core.adapter`) | Tests |
|---|---|
| `AdapterContractVersionTest` (A-R1 version mirrors + typed refusals) | 7 |
| `AdapterCorpusConformanceTest` (A-R4 schema validation + C0–C9 + discrimination) | 14 |
| `AuthoritativeFieldsMirrorTest` (TS data mirrors) | 4 |
| `CapabilityNegotiationTest` (A-R2 negotiation fidelity + no-assurance) | 13 |
| `ClientCapabilityProfileTest` (profile mirror + honest declaration) | 9 |
| `CompatibilityCheckerAlignmentTest` (A-R3 alignment invariants) | 6 |
| `FieldJourneyTest` (the representative journey + blocked/degraded/device-blocker scenarios) | 7 |
| `TaskIntentWireTest` (TaskIntent round-trip + version gate) | 4 |
| **Total new** | **64** |

- The no-network-dependency guard ran with every `test` invocation
  (`:core:test` dependsOn `assertNoNetworkDependencies`): the `:core`
  runtime classpath still resolves nothing beyond the Kotlin stdlib — the
  frozen AISE-002 runtime invariant is preserved (the networknt
  json-schema-validator remains TEST-scope only, now also used by the
  adapter-corpus tests exactly like `SessionManifestExporterTest`).

- No existing test was weakened, skipped or deleted: all 26 baseline classes
  still run and pass (323/323), plus the 64 new tests.

## Not runnable in this sandbox

- `./gradlew --no-daemon :app:test` — requires the Android SDK (not
  present). The new `:app` sources (`field/FieldJourneyRuntime.kt`,
  `OfflineUntilSyncTransport`, `ProvisionedJourneyDocs`,
  `FieldJourneyViewModel.kt`, the CaptureScreen mission panel, the
  AppContainer/AiseApp wiring, the CaptureSessionController manifest accessor
  and the CaptureViewModel missionRef parameter) follow the existing module
  patterns (JVM-pure view models, controller owns truth); the new
  `FieldJourneyRuntimeTest` (8 JVM tests) executes at the integration
  station.
- `./gradlew --no-daemon :app:assembleDebug` — same reason.

## Root TypeScript gate (for completeness)

```bash
bun run verify
```

```text
 3718 pass
 0 fail
 61632 expect() calls
Ran 3718 tests across 225 files. [6.98s]
==> boundaries
  scanned 627 source files across apps/, backend/, packages/, tools/
  no cross-zone import violations
VERIFY: PASS
```

Unchanged from the base expectation (3718 pass / 0 fail) — this item adds no
TypeScript tests; the Kotlin N is in Gradle.
