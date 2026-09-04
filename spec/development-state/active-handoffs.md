# AISE Active Work Handoffs

This file is a human-readable execution handoff. Machine status remains `spec/development-state/program-state.json`; this file preserves operational details that a new agent needs without chat history.

## AISE-005 — Gemini

Status: BLOCKED — corrective verification required. Original implementation PR #8 merged as `66d87da0a70a6f0013fd5bad8f2cf07b716e57d1` from exact implementation head `06a13f70262f5e50d011d29abb8bdfeec89dd705`.

Authoritative final verification:

- Generic CI run `33847147969`: SUCCESS.
- Android CI run `33847147977`: FAILURE.
- Emulator boot: SUCCESS.
- `compileDebugAndroidTestKotlin`: SUCCESS.
- `connectedDebugAndroidTest`: FAILURE.

Failure:

```text
com.aise.field.AppShellEmulatorSmokeTest > fullAcceptancePath_emulatorSmokeTest FAILED
java.lang.IllegalStateException: Method setCurrentState must be called on the main thread
at androidx.lifecycle.LifecycleRegistry.enforceMainThreadIfNeeded(LifecycleRegistry.kt:304)
```

This is a real instrumentation runtime failure, not the earlier `rememberNavController` compile failure. The current test harness uses `createAndroidComposeRule<MainActivity>()`; the failure occurs while executing the UI smoke test after the emulator is operational.

Required corrective outcome: Gemini must correct the Android-only instrumentation lifecycle/threading issue and produce a new exact head with green Android CI, including the emulator test. Fresh architect review is required before AISE-005 can be finalized.

Scope remains `apps/android/**` only. Do not modify server, web, shared-contract, or canonical engineering-model authority to compensate.

## AISE-006 — Gemini

Status: BLOCKED. PR #10. Current head: `106de267e61e837bdca3c90878154a8d4f3d73ea`.

Android CI run `33834435135` is successful; local `assembleDebug` and `testDebugUnitTest` were reported 28/28. Implementation includes sync state machine, Room v3 migration 2→3, multipart upload with local hash/size validation, retry policy, and WorkManager worker.

Merge/finalization is held solely by hard dependency AISE-005. Do not bypass the dependency gate.

## AISE-014 — Z.ai

Status: ACTIVE. Owner: ZAI. Assurance: CRITICAL. Declared surface: `services/verification/model-qa/**`; physical path: `backend/services/verification/model-qa/**`. Dependencies AISE-011 and AISE-013 are finalized.

Authority boundaries:

- Reality Graph is the only canonical model authority.
- Evidence is the only provenance authority.
- AISE-013 Assurance is the only model-readiness authority.
- QA is read-only and must never silently repair or rewrite the canonical model.

Required outcomes: deterministic `QAReport` with stable finding IDs/codes; outcomes PASS, CONTRADICTION, INSUFFICIENT_EVIDENCE, UNEVALUABLE, INVALID_INPUT; critical fail-closed behavior where required.

Required families: geometry, topology, semantic, evidence/epistemic, and cross-object contradiction checks.

Required discrimination/mutation suite: disable geometry validity; disable topology; disable semantic contradiction; ignore invalidated evidence; treat UNKNOWN as absence; downgrade blocking contradiction to advisory; constant report digest; remove deterministic ordering; bypass input validation; mutate canonical graph during QA.

Required completion evidence: exact final head SHA; changed-surface audit; `npm run verify`; AISE-014-specific and repository-wide test counts; deterministic replay; golden-room contradiction/consistency evidence; geometry/topology/semantic/evidence/epistemic/fail-closed/boundary-integrity evidence; known limitations and explicit out-of-scope. Do not merge your own PR.
