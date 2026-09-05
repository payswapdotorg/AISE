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

## AISE-029 — Z.ai — FINALIZED

Status: FINALIZED. Owner: ZAI. Assurance: CRITICAL. Dependencies AISE-018 and AISE-022 were finalized.

Implementation PR #7, branch `feat/AISE-029-reality-design-comparison`. Accepted head `574bb7fa1e28912fa8874a4e57b3f3e8af162be8`; base `b05974094ee40fd4d3de23fe80a71d2f77c3a144`; CI `33976810894` SUCCESS; architect review `5122091269`; merge `709d6282595d68964200ba47075071b117fe0458`.

Accepted outcome: deterministic read-only Reality-vs-Design comparison with explicit correspondence/unmatched facts, quantity-specific uncertainty, fail-closed ambiguity, provenance-linked evidence, and content-bound report digest/validator. Canonical Reality Graph/design authority were not mutated.

## AISE-031 — Z.ai — FINALIZED

Status: FINALIZED. Owner: ZAI. Assurance: HIGH_ASSURANCE. Dependencies AISE-011, AISE-012, and AISE-022 were finalized.

Dispatch Issue: #8. Base `709d6282595d68964200ba47075071b117fe0458`.

Implementation PR #9, branch `feat/AISE-031-historical-comparison`. Accepted head `34c2e89b7f32515d72d29f546b1fe8bf076d1ea2`; CI `33983126193` SUCCESS; architect review `5122431137`; merge `3752a3482f409827b69371beadb245d2eead89b8`.

Accepted outcome: deterministic version-to-version geometry/semantic/evidence change detection with provenance, strict confidence/uncertainty separation, explicit optional-quantity presence changes, authoritative source-version provenance for spaces/relationships, fail-closed input/report validation, content-bound record/report identities, and read-only canonical authority.

## Current resident worker dispatch

There is currently **no active Work Item**. The governed frontier is held by blocked dependencies, principally AISE-005 → AISE-006/007 → AISE-023 → AISE-028 and AISE-024 → AISE-025/AISE-030/AISE-032.

No blocked or merely dependency-eligible item is to be activated automatically. A fresh agent must recompute eligibility from `program-state.json` and activate a new Work Item only through an explicit governance action.

## Governance rule

The architect is the sole merge authority in this project. The connected `payswapdotorg` architect identity may approve and merge the Work Item when objective acceptance evidence is satisfied. Conversation remains non-authoritative; repository state controls continuation.
