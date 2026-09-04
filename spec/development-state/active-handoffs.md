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

## AISE-020 — Z.ai

Status: FINALIZED. Owner: ZAI. Assurance: CRITICAL. Declared surface: `services/assurance/**`.

Final evidence: PR #23; implementation head `267a6b83ff095f694c838d54b68b5898c890e001`; CI run `33897439954` SUCCESS; merge commit `8d351c43ca9cfed43ea507296ceedc2bffd3a12a`.

Accepted implementation is the additive task-intent policy layer over AISE-013. It keeps AISE-013 as the single profile→requirements authority, floors intent resolution transparently, rejects below-floor intent-bound profiles before store write, and does not rewrite the AISE-013 primitive path.

## AISE-021 — Z.ai

Status: FINALIZED. Owner: ZAI. Assurance: CRITICAL. Declared surface: `services/verification/rules/**`.

Final evidence: PR #26; implementation head `20ed22e7bcb173ca36a592c7ffb3a6863aaac00f`; CI run `33902235657` SUCCESS; 1,628/1,628 repository tests; 10/10 mutation/discrimination tests detected; merge commit `0de293d7081e4d9b4dae6ef30e8d1dedc0d7bef4`.

Accepted implementation provides deterministic dimension/specification rules with PASS/FAIL/UNKNOWN semantics, uncertainty-aware interval evaluation, evidence/readiness gating, fail-closed CRITICAL behavior, reader-port-only composition, and content-pinned reports without creating a second authority.

## AISE-022 — Z.ai

Status: FINALIZED. Owner: ZAI. Assurance: CRITICAL. Declared surfaces: `benchmarks/**`, CI.

Final evidence: PR #29; implementation head `d4788eaba2ff6c92978f89eb9d964ba7254e8f82`; CI run `33907110274` SUCCESS with both verify and benchmark jobs; 1,662/1,662 repository tests; benchmark `PASS / UNCHANGED` versus committed baseline; 10/10 mutation/discrimination tests detected; merge commit `f79730b5bed0906a95c94c6d9bfcfa143d8a96b4`.

Accepted implementation provides versioned deterministic golden-capture fixtures, ground-truth scoring, honest MISSING handling, regression reporting, critical-class analysis, integrity-verified baseline state, and a dedicated CI benchmark gate without changing the canonical verify stage chain.

## AISE-023 — SHARED

Status: BLOCKED. Owner: SHARED; primary ZAI, secondary GEMINI. Assurance: CRITICAL. Dependencies: AISE-005 and AISE-022. AISE-022 is finalized, but AISE-005 remains blocked; implementation must not begin until AISE-005 is genuinely finalized.

Declared surfaces: `docs/reality-lab/**`, benchmark manifests, Android fixture hooks.

Objective: repeatable physical capture missions, ground truth, device metadata and acceptance procedure.

Acceptance: mission manifests; capture protocol; traceable ground truth; repeatable acceptance package.

Dependency gate is explicit: benchmark completion does not satisfy the physical/Android prerequisite represented by AISE-005.

## AISE-015 — Z.ai — RESIDENT WORKER DISPATCH

Status: ACTIVE. Owner: ZAI. Assurance: STANDARD. Base SHA: `f79730b5bed0906a95c94c6d9bfcfa143d8a96b4`.

Work Order: `spec/work-orders.md` — AISE-015. Dependencies AISE-001 and AISE-011 are finalized.

Declared surface: `apps/web/**`.

Forbidden surfaces: `apps/android/**`; unrelated/cross-scope changes; browser-side canonical authority; architecture/epistemic/assurance semantic changes.

Objective: browser project/model workspace with 3D shell and authoritative backend reads.

Acceptance: authenticated/read-only model browsing, stable routing, no browser-side canonical state authority.

Resident worker operating contract:

- Remain resident for the Work Item/change loop where possible.
- Bind the session to repository `pectoraux/AISE`, Work Item `AISE-015`, exact base SHA `f79730b5bed0906a95c94c6d9bfcfa143d8a96b4`, the Work Order, declared web scope, required checks, and one branch/PR.
- Recover from repository + GitHub state rather than chat history.
- One Work Item = one branch = one implementation PR.
- Worker may implement and update the PR, but may not approve, self-merge, rewrite architecture, or silently broaden scope.
- Apply review packets exactly on the same branch/PR where possible.
- Stop on any request to move canonical authority into the browser or change frozen architecture/epistemic semantics.

Required completion evidence:

- exact implementation head SHA;
- changed-surface audit showing only `apps/web/**`;
- required lint/typecheck/tests/build evidence;
- authenticated/read-only model browsing evidence;
- stable routing evidence;
- explicit proof that no browser-side canonical authority is introduced;
- known limitations and explicit out-of-scope;
- no self-merge.

Stop conditions: any architecture/authority/epistemic/dependency/assurance/scope change requires a governed amendment.

Canonical dispatch packet:

```text
WORK_ITEM=AISE-015
OWNER=ZAI
REPOSITORY=pectoraux/AISE
BASE_SHA=f79730b5bed0906a95c94c6d9bfcfa143d8a96b4
WORK_ORDER=spec/work-orders.md#AISE-015
ARCHITECTURE=v1.0 frozen
BRANCH=feat/AISE-015-web-workspace
PR=(none yet; create exactly one for AISE-015)
OWNED_SURFACE=apps/web/**
FORBIDDEN_SURFACES=apps/android/**; unrelated/cross-scope changes; browser canonical authority
ASSURANCE=STANDARD
DEPENDENCIES=AISE-001; AISE-011 (all finalized)
ACCEPTANCE=authenticated/read-only model browsing; stable routing; no browser-side canonical state authority
MERGE_GATE=ARCHITECT
SELF_MERGE=FORBIDDEN
```
