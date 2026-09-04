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

Status: FINALIZED. Owner: ZAI. Assurance: CRITICAL. Declared surface: `services/verification/model-qa/**`. Dependencies AISE-011 and AISE-013 are finalized.

Final evidence: PR #19; implementation head `a6212c799a431a1348a3b6b45d2a667ebbde5560`; CI run `33854132772` SUCCESS; merge commit `934e32479d929bcdabf846663e6b625d24bdb8c3`.

The accepted implementation is read-only over the Reality Graph, Evidence mapping, and AISE-013 readiness state. It provides deterministic QA reports and fail-closed outcomes without mutating canonical authority.

## AISE-020 — Z.ai — RESIDENT WORKER DISPATCH

Status: ACTIVE. Owner: ZAI. Assurance: CRITICAL. Base SHA: `934e32479d929bcdabf846663e6b625d24bdb8c3`.

Work Order: `spec/work-orders.md` — AISE-020. Dependency AISE-013 is finalized.

Declared surface: `services/assurance/**`.

Forbidden surfaces: `apps/android/**` and unrelated/cross-scope changes. Do not modify architecture authority, epistemic semantics, verification authority, dependency rules, or the Work Item scope.

Objective: deterministic mapping from engineering intent to required evidence and verification depth.

Acceptance:

- explicit task profiles;
- monotone assurance requirements;
- no hidden downgrade for critical work.

Resident worker operating contract:

- Prefer continuation of one resident Z.ai session for this Work Item/change loop.
- Session must remain bound to repository `pectoraux/AISE`, Work Item `AISE-020`, this exact base SHA until a governed transition changes it, the Work Order, declared scope, required checks, and one branch/PR.
- Session identity is non-authoritative; recovery must reconstruct from repository + GitHub state.
- Worker may implement and open/update its one PR, but may not approve, merge, rewrite architecture, or silently broaden scope.
- On review changes, resume the same branch/PR where possible and apply the exact immutable review packet without dropping or paraphrasing findings.
- Worker narrative is not verification evidence; Architect independently verifies the repository, diff, CI, and required evidence.

Required completion evidence:

- exact final implementation head SHA;
- changed-surface audit showing only authorized surfaces;
- `npm run verify` and Work Item-specific tests;
- deterministic behavior/replay evidence;
- proof that assurance requirements are monotone;
- explicit task-profile coverage;
- negative/discrimination evidence showing critical work cannot silently downgrade assurance;
- known limitations and explicit out-of-scope;
- no self-merge.

Stop conditions: any proposed architecture/authority change, epistemic-semantic change, dependency/assurance change, or cross-scope change requires a governed amendment and must stop implementation.

Canonical dispatch packet:

```text
WORK_ITEM=AISE-020
OWNER=ZAI
REPOSITORY=pectoraux/AISE
BASE_SHA=934e32479d929bcdabf846663e6b625d24bdb8c3
WORK_ORDER=spec/work-orders.md#AISE-020
ARCHITECTURE=v1.0 frozen
BRANCH=feat/AISE-020-task-intent-assurance
PR=(none yet; create exactly one for AISE-020)
OWNED_SURFACE=services/assurance/**
FORBIDDEN_SURFACES=apps/android/**; unrelated/cross-scope changes
ASSURANCE=CRITICAL
DEPENDENCIES=AISE-013 (finalized)
ACCEPTANCE=explicit task profiles; monotone assurance requirements; no hidden downgrade for critical work
MERGE_GATE=ARCHITECT
SELF_MERGE=FORBIDDEN
``` 
