# AISE IMPLEMENTATION ROADMAP

**Status:** FROZEN
**Authority:** Human-readable implementation sequencing and progress
**Machine state:** `spec/development-state/program-state.json`
**Detailed map:** `spec/implementation-map.md`
**Work contracts:** `spec/work-orders.md`

This roadmap is the human-readable governance view of the project. Statuses, evidence references, active handoffs, and dependency eligibility are synchronized with `program-state.json`. A mismatch is an invalid governed repository state.

## Product execution spine

```text
User intent → Accuracy requirement → Capture plan → Multimodal capture
→ Reconstruction → Scene understanding → Engineering Reality Graph
→ Evidence + uncertainty → Self-consistency QA → Engineering rules
→ Human verification → Authoritative model → CAD / BIM / GIS / reports / reasoning
```

The canonical product object is the **Engineering Reality Graph**: geometry + semantics + topology + evidence + uncertainty + time/versioning.

## Current governed frontier

```text
ACTIVE
AISE-029 🟦 PR OPEN
  depends on AISE-018 ✅ and AISE-022 ✅

MEP
AISE-026 ✅ → AISE-027 ✅ → AISE-028 ⬜ BLOCKED

CAPTURE / COMPOSITION
AISE-005 ⛔ BLOCKED → AISE-006 ⬜ BLOCKED / AISE-007 ⬜ BLOCKED
AISE-005 + AISE-022 → AISE-023 ⛔ BLOCKED
AISE-006 + core services → AISE-024 ⬜ BLOCKED → AISE-025 ⬜ BLOCKED

OTHER ELIGIBILITY
AISE-031 is dependency-complete but intentionally not activated while AISE-029 is the sole active handoff.
```

Legend: `✅ FINALIZED` = accepted/merged; `🟦 PR OPEN` = active governed implementation; `⛔ BLOCKED` = blocked after implementation/verification; `⬜ BLOCKED` = not start-eligible; planned items are not activated merely because dependencies are complete.

## Work-item status ledger

| Work item | Status | Owner | Assurance | Primary surface | Current state |
|---|---|---|---|---|---|
| AISE-001 | ✅ FINALIZED | ZAI | STANDARD | repository/bootstrap | PR #4; merged |
| AISE-002 | ✅ FINALIZED | GEMINI | STANDARD | `apps/android/**` | PR #5; merged |
| AISE-003 | ✅ FINALIZED | SHARED | HIGH_ASSURANCE | shared contracts | PR #6; merged |
| AISE-004 | ✅ FINALIZED | ZAI | HIGH_ASSURANCE | capture ingestion | PR #7; merged |
| AISE-005 | ⛔ BLOCKED | GEMINI | HIGH_ASSURANCE | `apps/android/capture/**` | post-merge Android instrumentation verification failure |
| AISE-006 | ⬜ BLOCKED | GEMINI | HIGH_ASSURANCE | `apps/android/sync/**` | held on AISE-005 |
| AISE-007 | ⬜ BLOCKED | GEMINI | HIGH_ASSURANCE | Android capture | held on AISE-005 |
| AISE-008 | ✅ FINALIZED | ZAI | HIGH_ASSURANCE | reconstruction | accepted/merged |
| AISE-009 | ✅ FINALIZED | ZAI | CRITICAL | geometry | accepted/merged |
| AISE-010 | ✅ FINALIZED | ZAI | HIGH_ASSURANCE | semantics | accepted/merged |
| AISE-011 | ✅ FINALIZED | ZAI | CRITICAL | Reality Graph | accepted/merged |
| AISE-012 | ✅ FINALIZED | ZAI | CRITICAL | evidence/provenance | accepted/merged |
| AISE-013 | ✅ FINALIZED | ZAI | CRITICAL | assurance/readiness | accepted/merged |
| AISE-014 | ✅ FINALIZED | ZAI | CRITICAL | model QA | accepted/merged |
| AISE-015 | ✅ FINALIZED | ZAI | STANDARD | web workspace | accepted/merged |
| AISE-016 | ✅ FINALIZED | ZAI | HIGH_ASSURANCE | web review | accepted/merged |
| AISE-017 | ✅ FINALIZED | ZAI | HIGH_ASSURANCE | 2D plan | accepted/merged |
| AISE-018 | ✅ FINALIZED | ZAI | CRITICAL | IFC export | accepted/merged |
| AISE-019 | ✅ FINALIZED | ZAI | HIGH_ASSURANCE | DXF/PDF | accepted/merged |
| AISE-020 | ✅ FINALIZED | ZAI | CRITICAL | assurance engine | accepted/merged |
| AISE-021 | ✅ FINALIZED | ZAI | CRITICAL | rule engine | accepted/merged |
| AISE-022 | ✅ FINALIZED | ZAI | CRITICAL | benchmark harness | accepted/merged |
| AISE-023 | ⛔ BLOCKED | SHARED | CRITICAL | Reality Lab | blocked on AISE-005 + AISE-022 |
| AISE-024 | ⬜ BLOCKED | ZAI | CRITICAL | E2E composition | blocked on declared dependencies |
| AISE-025 | ⬜ BLOCKED | SHARED | CRITICAL | dogfood | blocked on AISE-024 |
| AISE-026 | ✅ FINALIZED | ZAI | CRITICAL | MEP pipe reconstruction | PR #47; merge `9a65b56804c26d79b76132b984c2a2e32660eb74` |
| AISE-027 | ✅ FINALIZED | ZAI | CRITICAL | MEP asset/topology | PR #3; exact head `59166b974780768051246d1341ca60dcbb0c45e0`; CI `33972057728` SUCCESS; merge `b05974094ee40fd4d3de23fe80a71d2f77c3a144` |
| AISE-028 | ⬜ BLOCKED | SHARED | CRITICAL | MEP dogfood benchmark | blocked on AISE-023 + AISE-026 + AISE-027 |
| AISE-029 | 🟦 PR OPEN | ZAI | CRITICAL | `backend/services/verification/reality-design/**` | dispatch Issue #5; PR #7; head `256ec84439702a07764510d88c5863c9d919f32f`; base `b05974094ee40fd4d3de23fe80a71d2f77c3a144` |
| AISE-030 | ⬜ BLOCKED | SHARED | CRITICAL | manhole verification | blocked on AISE-024 |
| AISE-031 | ⬜ BLOCKED | ZAI | HIGH_ASSURANCE | historical comparison | dependency-complete but not activated |
| AISE-032 | ⬜ BLOCKED | ZAI | HIGH_ASSURANCE | Engineering Copilot | blocked on AISE-024 |

## AISE-029 acceptance contract

Reality-vs-design comparison is read-only with respect to canonical model authority. The implementation must provide deterministic explicit correspondence, provenance-linked mismatch evidence, uncertainty-aware comparisons, explicit unmatched elements, and fail-closed ambiguity. It must not mutate the Reality Graph, invent semantic identity, or convert absence of evidence into success.

## Governance and authority

1. Repository is the durable source of development truth; conversation is non-authoritative.
2. `program-state.json` is the machine status/evidence authority; this roadmap is the synchronized human-readable projection.
3. `spec/architecture-lock.md` is frozen and authoritative for architecture/epistemic/ownership rules.
4. Work-item scope is defined by `spec/work-items.md` + selected `spec/work-orders.md` section.
5. One Work Item = one branch = at most one active implementation PR.
6. The architect is the merge gate. The sole architect in this session is the connected `payswapdotorg` architect identity; worker self-merge restrictions do not prevent the architect from exercising the merge gate as architect.
7. Critical work must carry the benchmark/discrimination/evidence required by its Work Order.
8. After merge: verify exact SHA → record evidence → finalize item → synchronize roadmap → recompute eligibility → activate only the next governed item.

## Freeze/change rule

Status/evidence synchronization is permitted routine governance maintenance. Changes to scope, sequencing, dependencies, assurance, or architecture-sensitive rules require a governed change preserving the architecture lock.
