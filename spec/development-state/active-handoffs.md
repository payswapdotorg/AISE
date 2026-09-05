# AISE Active Work Handoffs

Machine status remains `spec/development-state/program-state.json`; this file preserves the operational handoff required for a fresh agent.

## AISE-005 — Gemini

Status: BLOCKED. PR #8 merged but post-merge Android CI `33847147977` failed during `connectedDebugAndroidTest` with `LifecycleRegistry` main-thread `setCurrentState` exception. Required outcome: Android-only correction and fresh architect acceptance; do not modify server/web/canonical authority.

## AISE-006 — Gemini

Status: BLOCKED on hard dependency AISE-005. PR #10; Android CI previously green; no merge until AISE-005 is finalized.

## AISE-023 — SHARED

Status: BLOCKED on AISE-005 + AISE-022. AISE-022 is finalized; AISE-005 remains blocked.

## AISE-026 — Z.ai

Status: FINALIZED. PR #47; exact accepted head `79778fb0096dcc1b7f540254c34879c7b3cbd233`; CI `33954644880` SUCCESS; merge `9a65b56804c26d79b76132b984c2a2e32660eb74`.

## AISE-027 — Z.ai

Status: FINALIZED. PR #3; exact accepted head `59166b974780768051246d1341ca60dcbb0c45e0`; CI `33972057728` SUCCESS; 2,126/2,126 repository tests; benchmark PASS/UNCHANGED; 10/10 mutation/discrimination; merge `b05974094ee40fd4d3de23fe80a71d2f77c3a144`.

Accepted outcome: deterministic MEP asset/topology reconstruction with geometric/evidence-pinned valve/equipment roles, connectivity graph, uncertainty and provenance, fail-closed validator and content-bound topology digest. Canonical model authority and epistemic semantics remained unchanged.

## AISE-029 — Z.ai — CURRENT RESIDENT WORKER DISPATCH

Status: PR OPEN / ACTIVE. Owner: ZAI. Assurance: CRITICAL. Dependency AISE-018 and AISE-022 are finalized.

Work Order: `spec/work-orders.md` — AISE-029.

Declared implementation surface: `backend/services/verification/reality-design/**`.

Objective: compare authoritative reality model against design reference with provenance and uncertainty.

Acceptance: explicit correspondence, mismatch evidence and fail-closed ambiguous cases.

Current implementation PR: #7, branch `feat/AISE-029-reality-design-comparison`, exact head `256ec84439702a07764510d88c5863c9d919f32f`, base `b05974094ee40fd4d3de23fe80a71d2f77c3a144`.

Dispatch issue: #5. Implementation tracking issue: #6.

Implemented v1 surface:
- deterministic geometric correspondence by kind and position;
- explicit unmatched design/reality elements;
- position- and size-specific uncertainty bounds;
- fail-closed `AMBIGUOUS` correspondence;
- provenance-linked evidence on correspondence/mismatches;
- content-bound deterministic report digest and validator;
- read-only behavior with respect to canonical Reality Graph authority.

Required fresh-agent loop: inspect current PR/CI, correct any review or verification findings on the same branch, run objective verification, then sole-architect review and merge exact accepted head.

Canonical dispatch packet:

```text
WORK_ITEM=AISE-029
OWNER=ZAI
REPOSITORY=payswapdotorg/AISE
BASE_SHA=b05974094ee40fd4d3de23fe80a71d2f77c3a144
WORK_ORDER=spec/work-orders.md#AISE-029
ARCHITECTURE=v1.0 frozen
BRANCH=feat/AISE-029-reality-design-comparison
PR=7
HEAD_SHA=256ec84439702a07764510d88c5863c9d919f32f
OWNED_SURFACE=backend/services/verification/reality-design/**
ASSURANCE=CRITICAL
DEPENDENCIES=AISE-018, AISE-022 (finalized)
ACCEPTANCE=explicit correspondence; provenance/uncertainty-aware mismatch evidence; fail-closed ambiguity
MERGE_GATE=ARCHITECT
SOLE_ARCHITECT=payswapdotorg connected architect identity
```

## Governance rule

The architect is the sole merge authority in this project. Worker restrictions prevent an implementation worker from self-approving; they do not require a second human where the connected project role is explicitly the sole architect. Conversation remains non-authoritative; repository state controls continuation.
