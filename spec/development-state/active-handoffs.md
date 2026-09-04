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

## AISE-021 — Z.ai — RESIDENT WORKER DISPATCH

Status: ACTIVE. Owner: ZAI. Assurance: CRITICAL. Base SHA: `8d351c43ca9cfed43ea507296ceedc2bffd3a12a`.

Work Order: `spec/work-orders.md` — AISE-021. Dependencies AISE-011, AISE-013, AISE-014, and AISE-020 are finalized.

Declared surface: `services/verification/rules/**`.

Forbidden surfaces: `apps/android/**` and unrelated/cross-scope changes. Do not modify architecture authority, epistemic semantics, Reality Graph authority, Evidence authority, Assurance authority, dependency rules, or Work Item scope.

Objective: machine-evaluable dimensions, tolerances and specification rules with PASS/FAIL/UNKNOWN semantics.

Acceptance:

- deterministic rule evaluation;
- uncertainty-aware tolerances;
- evidence/readiness gating;
- fail-closed critical behavior;
- discrimination tests.

Resident worker operating contract:

- Prefer continuation of one resident Z.ai session for this Work Item/change loop.
- Session must remain bound to repository `pectoraux/AISE`, Work Item `AISE-021`, this exact base SHA, the Work Order, declared scope, required checks, and one branch/PR.
- Session identity is non-authoritative; recovery must reconstruct from repository + GitHub state.
- Worker may implement and open/update its one PR, but may not approve, merge, rewrite architecture, or silently broaden scope.
- On review changes, resume the same branch/PR where possible and apply the exact immutable review packet without dropping or paraphrasing findings.
- Worker narrative is not verification evidence; Architect independently verifies the repository, diff, CI, and required evidence.

Required completion evidence:

- exact final implementation head SHA;
- changed-surface audit showing only authorized surfaces;
- `npm run verify` and Work Item-specific tests;
- deterministic rule-evaluation/replay evidence;
- uncertainty-aware tolerance evidence;
- evidence/readiness gating evidence;
- fail-closed CRITICAL evidence;
- discrimination/mutation evidence demonstrating unsafe rule downgrades are detected;
- known limitations and explicit out-of-scope;
- no self-merge.

Stop conditions: any proposed architecture/authority change, epistemic-semantic change, dependency/assurance change, or cross-scope change requires a governed amendment and must stop implementation.

Canonical dispatch packet:

```text
WORK_ITEM=AISE-021
OWNER=ZAI
REPOSITORY=pectoraux/AISE
BASE_SHA=8d351c43ca9cfed43ea507296ceedc2bffd3a12a
WORK_ORDER=spec/work-orders.md#AISE-021
ARCHITECTURE=v1.0 frozen
BRANCH=feat/AISE-021-engineering-rule-engine
PR=(none yet; create exactly one for AISE-021)
OWNED_SURFACE=services/verification/rules/**
FORBIDDEN_SURFACES=apps/android/**; unrelated/cross-scope changes
ASSURANCE=CRITICAL
DEPENDENCIES=AISE-011; AISE-013; AISE-014; AISE-020 (all finalized)
ACCEPTANCE=deterministic rule evaluation; uncertainty-aware tolerances; evidence/readiness gating; fail-closed critical behavior; discrimination tests
MERGE_GATE=ARCHITECT
SELF_MERGE=FORBIDDEN
```
