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

## AISE-023 — SHARED

Status: BLOCKED. Dependencies AISE-005 and AISE-022. AISE-022 is finalized; AISE-005 remains blocked. No implementation until AISE-005 is genuinely finalized.

Declared surfaces: `docs/reality-lab/**`, benchmark manifests, Android fixture hooks.

## AISE-014 — Z.ai

Status: FINALIZED. PR #19; head `a6212c799a431a1348a3b6b45d2a667ebbde5560`; CI `33854132772` SUCCESS; merge `934e32479d929bcdabf846663e6b625d24bdb8c3`.

## AISE-020 — Z.ai

Status: FINALIZED. PR #23; head `267a6b83ff095f694c838d54b68b5898c890e001`; CI `33897439954` SUCCESS; merge `8d351c43ca9cfed43ea507296ceedc2bffd3a12a`.

## AISE-021 — Z.ai

Status: FINALIZED. PR #26; head `20ed22e7bcb173ca36a592c7ffb3a6863aaac00f`; CI `33902235657` SUCCESS; 1,628/1,628 tests; 10/10 mutation/discrimination detected; merge `0de293d7081e4d9b4dae6ef30e8d1dedc0d7bef4`.

## AISE-022 — Z.ai

Status: FINALIZED. PR #29; head `d4788eaba2ff6c92978f89eb9d964ba7254e8f82`; CI `33907110274` SUCCESS; 1,662/1,662 tests; benchmark PASS/UNCHANGED; 10/10 mutation/discrimination detected; merge `f79730b5bed0906a95c94c6d9bfcfa143d8a96b4`.

## AISE-015 — Z.ai

Status: FINALIZED. PR #32; exact implementation head `cb8743f70c2a146892e5fab701bef46adb99b47c`; CI `33912710174` SUCCESS; 1,690/1,690 tests; 28 new; 6/6 discrimination; architect clearance review `5117458821`; merge `197bce9ec96198a049d3db29675c14800729987c`.

## AISE-016 — Z.ai

Status: FINALIZED. PR #35; exact implementation head `4ec9ca559ec241f86d00d909a1880bafe21df859`; CI `33925697514` SUCCESS; 1,738/1,738 tests; 48 new; 11/11 mutation/discrimination; architect clearance review `5118400479`; merge `51ffa38a2887d39671b83ef174d2517c5fab248d`.

## AISE-017 — Z.ai

Status: FINALIZED. PR #38; exact implementation head `b18adbb2e98ac9243a9be805f5a317b14163ee30`; CI `33931455302` SUCCESS; 1,807/1,807 tests; 69 new; 10/10 mutation/discrimination; architect clearance review `5119539617`; merge `077fcb2120b06d0aa93ab47d612e9f193113e99c`.

## AISE-018 — Z.ai

Status: FINALIZED. PR #41; exact implementation head `d75d83d6660ec65f0f8e07cde44b71fbb7814169`; CI `33946801824` SUCCESS; 1,914/1,914 tests; 107 new; benchmark PASS/UNCHANGED; 10/10 mutation/discrimination; architect clearance `5549845334`; merge `2286090ee542c4d82e9608e72a96f32957748bae`.

## AISE-019 — Z.ai

Status: FINALIZED. PR #44; exact implementation head `6334647d619ed10c4305cf198c6d14c20da42d93`; CI `33951984063` SUCCESS; 2,016/2,016 tests; 102 new; benchmark PASS/UNCHANGED; 10/10 mutation/discrimination; architect clearance `5550318933`; merge `b63f973c8512c3728413625911c37854a16ed3f5`.

## AISE-026 — Z.ai

Status: FINALIZED. Owner: ZAI. Assurance: CRITICAL. Declared surface: `services/reality/semantics/mep/**`.

Final evidence: dispatch Issue #45; exact dispatched base `b63f973c8512c3728413625911c37854a16ed3f5`; implementation PR #47; head `79778fb0096dcc1b7f540254c34879c7b3cbd233`; CI `33954644880` SUCCESS; 2,059/2,059 repository tests; 43 new tests; golden benchmark PASS/UNCHANGED; 10/10 mutation/discrimination; architect merge authorization review `5120633672`; merge commit `9a65b56804c26d79b76132b984c2a2e32660eb74`.

Accepted outcome: deterministic pipe centerline, diameter and connectivity representation with content-derived identity, provenance/evidence linkage, epistemic passthrough, controlled exact/noisy fixtures, deterministic replay and honest refusals. Canonical model authority was not changed.

## AISE-027 — Z.ai — RESIDENT WORKER DISPATCH

Status: ACTIVE. Owner: ZAI. Assurance: CRITICAL. Base SHA: `9a65b56804c26d79b76132b984c2a2e32660eb74`.

Work Order: `spec/work-orders.md` — AISE-027. Dependency AISE-026 is finalized.

Declared surface: `services/reality/semantics/mep/**`.

Forbidden surfaces: `apps/android/**`; `apps/web/**` unless explicitly required by the Work Order; unrelated/cross-scope changes; canonical authority changes; architecture or epistemic semantic changes.

Objective: valves/equipment and connectivity graph.

Acceptance: asset/topology fixtures, uncertainty and evidence linkage.

Resident worker operating contract:

- Remain resident for the Work Item/change loop where possible.
- Bind the session to repository `pectoraux/AISE`, Work Item `AISE-027`, exact base SHA above, the Work Order, declared review scope, required checks, and one branch/PR.
- Recover from repository + GitHub state rather than chat history.
- One Work Item = one branch = one implementation PR.
- Worker may implement/update the PR but may not approve, self-merge, rewrite architecture, or silently broaden scope.
- Apply architect review packets on the same branch/PR where possible.
- Stop on requests to move canonical authority into the browser or alter frozen epistemic semantics.

Canonical dispatch packet:

```text
WORK_ITEM=AISE-027
OWNER=ZAI
REPOSITORY=pectoraux/AISE
BASE_SHA=9a65b56804c26d79b76132b984c2a2e32660eb74
WORK_ORDER=spec/work-orders.md#AISE-027
ARCHITECTURE=v1.0 frozen
BRANCH=feat/AISE-027-mep-asset-topology
PR=(none yet; create exactly one for AISE-027)
OWNED_SURFACE=services/reality/semantics/mep/**
FORBIDDEN_SURFACES=apps/android/**; apps/web/** unless explicitly required by the Work Order; unrelated/cross-scope changes; canonical authority changes; epistemic semantic changes
ASSURANCE=CRITICAL
DEPENDENCIES=AISE-026 (finalized)
ACCEPTANCE=asset/topology fixtures, uncertainty and evidence linkage for valves/equipment and connectivity graph
MERGE_GATE=ARCHITECT
SELF_MERGE=FORBIDDEN
```

Dispatch relay issue: GitHub Issue #48. It is the canonical relay packet and does not claim direct transport to Z.ai.
