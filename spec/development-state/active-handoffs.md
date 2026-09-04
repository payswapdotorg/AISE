# AISE Active Work Handoffs

This file is a human-readable execution handoff. Machine status remains `spec/development-state/program-state.json`; this file preserves operational details that a new agent needs without chat history.

## AISE-005 — Gemini

Status: BLOCKED — corrective verification required. Original implementation PR #8 merged as `66d87da0a70a6f0013fd5bad8f2cf07b716e57d1` from head `06a13f70262f5e50d011d29abb8bdfeec89dd705`.

Authoritative verification: generic CI `33847147969` SUCCESS; Android CI `33847147977` FAILURE; emulator boot and `compileDebugAndroidTestKotlin` SUCCESS; `connectedDebugAndroidTest` FAILURE.

Failure: `AppShellEmulatorSmokeTest` throws `java.lang.IllegalStateException: Method setCurrentState must be called on the main thread` from `LifecycleRegistry.enforceMainThreadIfNeeded`.

Required outcome: Gemini corrects the Android-only instrumentation lifecycle/threading issue and produces a new exact head with green Android CI including emulator execution. Fresh architect review is required before AISE-005 can be finalized.

Scope: `apps/android/**` only. Do not modify server, web, shared-contract, or canonical engineering-model authority to compensate.

## AISE-006 — Gemini

Status: BLOCKED. PR #10; head `106de267e61e837bdca3c90878154a8d4f3d73ea`; Android CI `33834435135` SUCCESS; local assemble/unit tests reported 28/28. Held solely by hard dependency AISE-005.

## AISE-014 — Z.ai

Status: FINALIZED. PR #19; head `a6212c799a431a1348a3b6b45d2a667ebbde5560`; CI `33854132772` SUCCESS; merge `934e32479d929bcdabf846663e6b625d24bdb8c3`.

## AISE-020 — Z.ai

Status: FINALIZED. PR #23; head `267a6b83ff095f694c838d54b68b5898c890e001`; CI `33897439954` SUCCESS; merge `8d351c43ca9cfed43ea507296ceedc2bffd3a12a`.

## AISE-021 — Z.ai

Status: FINALIZED. PR #26; head `20ed22e7bcb173ca36a592c7ffb3a6863aaac00f`; CI `33902235657` SUCCESS; 1,628/1,628 tests; 10/10 mutation/discrimination detected; merge `0de293d7081e4d9b4dae6ef30e8d1dedc0d7bef4`.

## AISE-022 — Z.ai

Status: FINALIZED. PR #29; head `d4788eaba2ff6c92978f89eb9d964ba7254e8f82`; CI `33907110274` SUCCESS; 1,662/1,662 tests; benchmark PASS/UNCHANGED; 10/10 mutation/discrimination detected; merge `f79730b5bed0906a95c94c6d9bfcfa143d8a96b4`.

## AISE-023 — SHARED

Status: BLOCKED. Dependencies AISE-005 and AISE-022. AISE-022 is finalized; AISE-005 remains blocked. No implementation until AISE-005 is genuinely finalized.

Declared surfaces: `docs/reality-lab/**`, benchmark manifests, Android fixture hooks.

## AISE-015 — Z.ai

Status: FINALIZED. Owner: ZAI. Assurance: STANDARD. Declared surface: `apps/web/**`.

Final evidence: PR #32; exact implementation head `cb8743f70c2a146892e5fab701bef46adb99b47c`; CI run `33912710174` SUCCESS with Foundation verify and Golden capture benchmark green; repository tests `1690/1690`; 28 new tests; 6/6 discrimination mutations detected; architect clearance review `5117458821`; merge commit `197bce9ec96198a049d3db29675c14800729987c`.

Accepted outcome: authenticated/read-only browser workspace, stable model/version routing, authoritative server-side model reads, epistemic passthrough, 3D inspection shell, and no browser-side canonical authority. Corrections addressed the read-only `process.env.NODE_ENV` typing issue and future-dated fixture timestamp.

## AISE-016 — Z.ai — RESIDENT WORKER DISPATCH

Status: ACTIVE. Owner: ZAI. Assurance: HIGH_ASSURANCE. Base SHA: `197bce9ec96198a049d3db29675c14800729987c`.

Work Order: `spec/work-orders.md` — AISE-016. Dependencies AISE-012, AISE-013, AISE-015 are finalized.

Declared surface: `apps/web/review/**`.

Forbidden surfaces: `apps/android/**`; unrelated/cross-scope changes; canonical authority outside the governed model/evidence/readiness services; architecture or epistemic semantic changes.

Objective: evidence-aware object review UI covering object selection, evidence, properties, uncertainty, confidence, epistemic state, and governed review/correction interactions.

Acceptance: every consequential displayed assertion can trace to evidence/authority; corrections produce governed model changes, not UI-only mutations.

Resident worker operating contract:

- Remain resident for the Work Item/change loop where possible.
- Bind the session to repository `pectoraux/AISE`, Work Item `AISE-016`, exact base SHA above, the Work Order, declared review scope, required checks, and one branch/PR.
- Recover from repository + GitHub state rather than chat history.
- One Work Item = one branch = one implementation PR.
- Worker may implement/update the PR but may not approve, self-merge, rewrite architecture, or silently broaden scope.
- Apply architect review packets on the same branch/PR where possible.
- Stop on requests to move canonical authority into the browser or alter frozen epistemic semantics.

Canonical dispatch packet:

```text
WORK_ITEM=AISE-016
OWNER=ZAI
REPOSITORY=pectoraux/AISE
BASE_SHA=197bce9ec96198a049d3db29675c14800729987c
WORK_ORDER=spec/work-orders.md#AISE-016
ARCHITECTURE=v1.0 frozen
BRANCH=feat/AISE-016-evidence-review-ui
PR=(none yet; create exactly one for AISE-016)
OWNED_SURFACE=apps/web/review/**
FORBIDDEN_SURFACES=apps/android/**; unrelated/cross-scope changes; canonical authority changes; epistemic semantic changes
ASSURANCE=HIGH_ASSURANCE
DEPENDENCIES=AISE-012; AISE-013; AISE-015 (all finalized)
ACCEPTANCE=every consequential displayed assertion traces to evidence/authority; corrections produce governed model changes, not UI-only mutations
MERGE_GATE=ARCHITECT
SELF_MERGE=FORBIDDEN
```
