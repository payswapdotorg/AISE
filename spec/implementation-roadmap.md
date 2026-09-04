# AISE IMPLEMENTATION ROADMAP

**Status:** FROZEN
**Authority:** Human-readable implementation sequencing and progress
**Machine state:** `spec/development-state/program-state.json`
**Detailed map:** `spec/implementation-map.md`
**Work contracts:** `spec/work-orders.md`

This roadmap is the human-readable governance view of the project. Statuses, evidence references, active handoffs, and dependency eligibility are synchronized with `program-state.json`. A mismatch is an invalid governed repository state.

## Product execution spine

```text
User intent
   ↓
Accuracy requirement
   ↓
Capture plan
   ↓
Multimodal capture
   ↓
Sensor fusion / reconstruction
   ↓
Scene understanding
   ↓
Engineering Reality Graph
   ↓
Evidence + uncertainty
   ↓
Self-consistency QA
   ↓
Engineering rules
   ↓
Human verification
   ↓
Authoritative model
   ↓
CAD / BIM / GIS / reports / reasoning
```

The canonical product object is the **Engineering Reality Graph**: geometry + semantics + topology + evidence + uncertainty + time/versioning.

## Current governed frontier

```text
FINALIZED FOUNDATION
AISE-001 ─┐
AISE-002 ─┴─→ AISE-003 → AISE-004 → AISE-008 → AISE-009 → AISE-010 → AISE-011 → AISE-012 → AISE-013
                                                                    │                       │
                                                                    │                       ├──→ AISE-014 ✅ FINALIZED
                                                                    │                       │
                                                                    ├──→ AISE-015 ⬜ BLOCKED
                                                                    └──→ AISE-017 ⬜ BLOCKED

CAPTURE FRONT
AISE-005 ⛔ BLOCKED (post-merge verification failure) ─→ AISE-006 ⬜ BLOCKED
                                                   └→ AISE-007 ⬜ BLOCKED

ASSURANCE / RULES
AISE-020 ✅ FINALIZED → AISE-021 🟦 ACTIVE
AISE-011 + AISE-013 + AISE-014 + AISE-020 → AISE-021

BENCHMARK / COMPOSITION
AISE-008 + AISE-009 + AISE-010 + AISE-011 → AISE-022 ⬜ BLOCKED
AISE-005 + AISE-022 → AISE-023 ⬜ BLOCKED
AISE-006 + AISE-008 + AISE-011 + AISE-012 + AISE-015 + AISE-018 + AISE-019 → AISE-024 ⬜
AISE-024 → AISE-025 ⬜

MEP
AISE-009 + AISE-011 + AISE-012 + AISE-022 → AISE-026 ⬜ → AISE-027 ⬜ → AISE-028 ⬜

FUTURE EXPANSION
AISE-018 + AISE-022 → AISE-029 ⬜
AISE-021 + AISE-024 → AISE-030 ⬜
AISE-011 + AISE-012 + AISE-022 → AISE-031 ⬜
AISE-012 + AISE-013 + AISE-021 + AISE-024 → AISE-032 ⬜
```

Legend: `✅ FINALIZED` is accepted/merged work; `🟦 ACTIVE` is an authorized current handoff; `⛔ BLOCKED` is blocked after implementation/verification; `⬜ BLOCKED` is not start-eligible; `⬜` without a current handoff is planned but not activated.

## Work-item status ledger

| Work item | Status | Owner | Assurance | Primary surface | Current evidence/state |
|---|---|---|---|---|---|
| AISE-001 | ✅ FINALIZED | ZAI | STANDARD | repository/bootstrap | PR #4; merge `c448f587637f4ad45281ec89ce21daeb96cdfdb` |
| AISE-002 | ✅ FINALIZED | GEMINI | STANDARD | `apps/android/**` | PR #5; merge `52e3a722735dd3265e23177a5191f27f245decb1` |
| AISE-003 | ✅ FINALIZED | SHARED | HIGH_ASSURANCE | shared contracts | PR #6; merge `492fbddc3b7633b49ff6e710ba291a01f78fcb75` |
| AISE-004 | ✅ FINALIZED | ZAI | HIGH_ASSURANCE | capture ingestion | PR #7; merge `55146bae0edd0724a487e30becb458493b1c003d` |
| AISE-005 | ⛔ BLOCKED | GEMINI | HIGH_ASSURANCE | `apps/android/capture/**` | PR #8 merged `66d87da0a70a6f0013fd5bad8f2cf07b716e57d1` from head `06a13f70262f5e50d011d29abb8bdfeec89dd705`; generic CI `33847147969` green, Android CI `33847147977` failed during `connectedDebugAndroidTest`: `LifecycleRegistry` main-thread `setCurrentState` exception |
| AISE-006 | ⬜ BLOCKED | GEMINI | HIGH_ASSURANCE | `apps/android/sync/**` | PR #10; head `106de267e61e837bdca3c90878154a8d4f3d73ea`; Android CI green; held on AISE-005 |
| AISE-007 | ⬜ BLOCKED | GEMINI | HIGH_ASSURANCE | `apps/android/capture/**` | held on AISE-005 |
| AISE-008 | ✅ FINALIZED | ZAI | HIGH_ASSURANCE | reconstruction | PR #9; accepted and merged |
| AISE-009 | ✅ FINALIZED | ZAI | CRITICAL | geometry | PR #11; merge `77edaca38fadea95c431d4f191642e0395d8cc17`; CI `33789886879` |
| AISE-010 | ✅ FINALIZED | ZAI | HIGH_ASSURANCE | semantics | PR #12; merge `5c840c1465fa5213e02b547dd03ad456066fe820`; CI `33801132802` |
| AISE-011 | ✅ FINALIZED | ZAI | CRITICAL | Reality Graph | PR #13; merge `b1731536203e6bc4698f5804cea882675c798abf`; CI `33806624742` |
| AISE-012 | ✅ FINALIZED | ZAI | CRITICAL | evidence/provenance | PR #14; merge `80e7c6f7f5552d6b8562fe7c0c3954c8ad74da1a`; CI `33818256481` |
| AISE-013 | ✅ FINALIZED | ZAI | CRITICAL | assurance/readiness | PR #15; head `aa4bc27a4c8338beaa45229531711fe2ca37bd26`; merge `66a9e329dd145f38ee69d3286278039f44e9ea70`; CI `33829570146` |
| AISE-014 | ✅ FINALIZED | ZAI | CRITICAL | `services/verification/model-qa/**` | PR #19; head `a6212c799a431a1348a3b6b45d2a667ebbde5560`; CI `33854132772`; merge `934e32479d929bcdabf846663e6b625d24bdb8c3` |
| AISE-015 | ⬜ BLOCKED | ZAI | STANDARD | `apps/web/**` | design-graph eligible but not activated by current scheduler |
| AISE-016 | ⬜ BLOCKED | ZAI | HIGH_ASSURANCE | `apps/web/review/**` | blocked on AISE-012 + AISE-013 + AISE-015 |
| AISE-017 | ⬜ BLOCKED | ZAI | HIGH_ASSURANCE | 2D export/UI | blocked by scheduler/dependency sequencing |
| AISE-018 | ⬜ BLOCKED | ZAI | CRITICAL | IFC export | blocked on AISE-017 |
| AISE-019 | ⬜ BLOCKED | ZAI | HIGH_ASSURANCE | DXF/PDF | blocked on AISE-017 |
| AISE-020 | ✅ FINALIZED | ZAI | CRITICAL | `services/assurance/**` | PR #23; head `267a6b83ff095f694c838d54b68b5898c890e001`; CI `33897439954`; 1,540/1,540 repository tests; 8/8 mutation/discrimination; merge `8d351c43ca9cfed43ea507296ceedc2bffd3a12a` |
| AISE-021 | 🟦 ACTIVE | ZAI | CRITICAL | `services/verification/rules/**` | base `8d351c43ca9cfed43ea507296ceedc2bffd3a12a`; resident worker dispatch |
| AISE-022 | ⬜ BLOCKED | ZAI | CRITICAL | benchmarks/CI | dependency-eligible by graph but not explicitly activated |
| AISE-023 | ⬜ BLOCKED | SHARED | CRITICAL | Reality Lab | blocked on AISE-005 + AISE-022 |
| AISE-024 | ⬜ BLOCKED | ZAI | CRITICAL | integration/E2E | blocked on declared dependencies |
| AISE-025 | ⬜ BLOCKED | SHARED | CRITICAL | dogfood | blocked on AISE-024 |
| AISE-026 | ⬜ BLOCKED | ZAI | CRITICAL | MEP semantics | blocked on AISE-022 |
| AISE-027 | ⬜ BLOCKED | ZAI | CRITICAL | MEP topology | blocked on AISE-026 |
| AISE-028 | ⬜ BLOCKED | SHARED | CRITICAL | MEP benchmark | blocked on AISE-023 + AISE-026 + AISE-027 |
| AISE-029 | ⬜ BLOCKED | ZAI | CRITICAL | reality-vs-design | future expansion |
| AISE-030 | ⬜ BLOCKED | SHARED | CRITICAL | manhole verification | future expansion |
| AISE-031 | ⬜ BLOCKED | ZAI | HIGH_ASSURANCE | historical comparison | future expansion |
| AISE-032 | ⬜ BLOCKED | ZAI | HIGH_ASSURANCE | Engineering Copilot | future expansion |

## Governance and authority

1. **Repository sole source of truth.** Conversation history is not an implementation dependency.
2. **Roadmap authority.** This file is the frozen human-readable implementation sequencing/progress artifact. It is synchronized with `program-state.json`; neither may silently diverge.
3. **Machine status authority.** `spec/development-state/program-state.json` is the canonical machine-readable status/evidence projection used for eligibility and automation.
4. **Architecture authority.** `spec/architecture-lock.md` overrides roadmap sequencing when there is a conflict.
5. **Work-item authority.** `spec/work-items.md` and the selected `spec/work-orders.md` section define scope and acceptance.
6. **Dependency authority.** `spec/dependency-graph.md` plus current `program-state.json` define actual start eligibility.
7. **Merge authority.** Architect review is the merge gate; coding agents cannot self-approve or self-merge.
8. **Scope integrity.** One Work Item = one branch = at most one active PR. Cross-scope work requires a governed amendment/Work Item.
9. **CRITICAL assurance.** Measurement/model/evidence/verification/compliance changes require the specified benchmark and discrimination evidence; software CI alone is not sufficient where the work order requires physical evidence.
10. **Epistemic integrity.** `UNKNOWN`, `NOT_OBSERVED`, and `OCCLUDED` are not absence. Confidence never replaces uncertainty. AI inference never silently overwrites measured/confirmed information.

## Status update protocol

After a Work Item is accepted and merged:

```text
verify exact merged SHA
        ↓
record objective evidence in program-state.json
        ↓
set Work Item FINALIZED
        ↓
update this roadmap row/status
        ↓
recompute dependency eligibility
        ↓
activate only the next governed item(s)
```

A failed review, failed verification, or unresolved blocker returns the item to implementation/blocked state; it is not marked final from agent narrative. A post-merge verification failure must also be recorded explicitly and must block dependent Work Items until corrected and re-verified.

## Freeze/change rule

This roadmap is frozen. Changes to work-item scope, sequencing, dependencies, assurance, or architecture-sensitive governance must be made through a governed repository change that records the reason and preserves the architecture lock. Status/evidence synchronization is routine state maintenance and must not be used to smuggle in scope or architecture changes.
