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
                                                                    ├──→ AISE-015 ✅ FINALIZED ─→ AISE-016 ✅ FINALIZED ─→ AISE-017 ✅ FINALIZED ─→ AISE-018 ✅ FINALIZED ─→ AISE-019 ✅ FINALIZED
                                                                    └──→ AISE-018 ✅ FINALIZED

ACTIVE MEP FRONT
AISE-009 + AISE-011 + AISE-012 + AISE-022 → AISE-026 ✅ FINALIZED → AISE-027 🟦 ACTIVE → AISE-028 ⬜ BLOCKED

CAPTURE FRONT
AISE-005 ⛔ BLOCKED (post-merge verification failure) ─→ AISE-006 ⬜ BLOCKED
                                                   └→ AISE-007 ⬜ BLOCKED

ASSURANCE / RULES
AISE-020 ✅ FINALIZED → AISE-021 ✅ FINALIZED
                                  │
                                  └──→ AISE-030 ⬜

BENCHMARK / COMPOSITION
AISE-008 + AISE-009 + AISE-010 + AISE-011 → AISE-022 ✅ FINALIZED
AISE-005 + AISE-022 → AISE-023 ⛔ BLOCKED
AISE-006 + AISE-008 + AISE-011 + AISE-012 + AISE-015 + AISE-018 + AISE-019 → AISE-024 ⬜
AISE-024 → AISE-025 ⬜

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
| AISE-015 | ✅ FINALIZED | ZAI | STANDARD | `apps/web/**` | PR #32; head `cb8743f70c2a146892e5fab701bef46adb99b47c`; CI `33912710174` SUCCESS (verify + benchmark); 1,690/1,690 tests; 28 new tests; 6/6 discrimination; architect clearance review `5117458821`; merge `197bce9ec96198a049d3db29675c14800729987c` |
| AISE-016 | ✅ FINALIZED | ZAI | HIGH_ASSURANCE | `apps/web/review/**` | PR #35; head `4ec9ca559ec241f86d00d909a1880bafe21df859`; CI `33925697514` SUCCESS; 1,738/1,738 tests; 11/11 mutation/discrimination; architect clearance review `5118400479`; merge `51ffa38a2887d39671b83ef174d2517c5fab248d` |
| AISE-017 | ✅ FINALIZED | ZAI | HIGH_ASSURANCE | 2D export/UI | PR #38; head `b18adbb2e98ac9243a9be805f5a317b14163ee30`; CI `33931455302` SUCCESS; 1,807/1,807 repository tests; 69 new tests; 10/10 mutation/discrimination; architect clearance review `5119539617`; merge `077fcb2120b06d0aa93ab47d612e9f193113e99c` |
| AISE-018 | ✅ FINALIZED | ZAI | CRITICAL | IFC export | dispatch Issue #39; base `077fcb2120b06d0aa93ab47d612e9f193113e99c`; PR #41; head `d75d83d6660ec65f0f8e07cde44b71fbb7814169`; CI `33946801824` SUCCESS; 1,914/1,914 tests; 107 new; benchmark PASS/UNCHANGED; 10/10 mutation/discrimination; architect clearance `5549845334`; merge `2286090ee542c4d82e9608e72a96f32957748bae` |
| AISE-019 | ✅ FINALIZED | ZAI | HIGH_ASSURANCE | DXF/PDF | dispatch Issue #42; base `2286090ee542c4d82e9608e72a96f32957748bae`; PR #44; head `6334647d619ed10c4305cf198c6d14c20da42d93`; CI `33951984063` SUCCESS; 2,016/2,016 tests; 102 new; benchmark PASS/UNCHANGED; 10/10 mutation/discrimination; architect clearance `5550318933`; merge `b63f973c8512c3728413625911c37854a16ed3f5` |
| AISE-020 | ✅ FINALIZED | ZAI | CRITICAL | `services/assurance/**` | PR #23; head `267a6b83ff095f694c838d54b68b5898c890e001`; CI `33897439954`; 1,540/1,540 repository tests; 8/8 mutation/discrimination; merge `8d351c43ca9cfed43ea507296ceedc2bffd3a12a` |
| AISE-021 | ✅ FINALIZED | ZAI | CRITICAL | `services/verification/rules/**` | PR #26; head `20ed22e7bcb173ca36a592c7ffb3a6863aaac00f`; CI `33902235657`; 1,628/1,628 repository tests; 10/10 mutation/discrimination; merge `0de293d7081e4d9b4dae6ef30e8d1dedc0d7bef4` |
| AISE-022 | ✅ FINALIZED | ZAI | CRITICAL | `benchmarks/**`, CI | PR #29; head `d4788eaba2ff6c92978f89eb9d964ba7254e8f82`; CI `33907110274` (verify + benchmark green); 1,662/1,662 repository tests; benchmark `PASS / UNCHANGED`; 10/10 mutation/discrimination; merge `f79730b5bed0906a95c94c6d9bfcfa143d8a96b4` |
| AISE-023 | ⛔ BLOCKED | SHARED | CRITICAL | Reality Lab | blocked on AISE-005 + AISE-022; AISE-022 finalized but AISE-005 remains blocked |
| AISE-024 | ⬜ BLOCKED | ZAI | CRITICAL | integration/E2E | blocked on declared dependencies |
| AISE-025 | ⬜ BLOCKED | SHARED | CRITICAL | dogfood | blocked on AISE-024 |
| AISE-026 | ✅ FINALIZED | ZAI | CRITICAL | MEP semantics | dispatch Issue #45; exact base `b63f973c8512c3728413625911c37854a16ed3f5`; PR #47; head `79778fb0096dcc1b7f540254c34879c7b3cbd233`; CI `33954644880` SUCCESS; 2,059/2,059 tests; 43 new; benchmark PASS/UNCHANGED; 10/10 mutation/discrimination; architect merge authorization `5120633672`; merge `9a65b56804c26d79b76132b984c2a2e32660eb74` |
| AISE-027 | 🟦 ACTIVE | ZAI | CRITICAL | MEP topology | dispatch Issue #48; exact base `9a65b56804c26d79b76132b984c2a2e32660eb74`; dependency AISE-026 finalized |
| AISE-028 | ⬜ BLOCKED | SHARED | CRITICAL | MEP benchmark | blocked on AISE-023 + AISE-026 + AISE-027 |
| AISE-029 | ⬜ BLOCKED | ZAI | CRITICAL | reality-vs-design | future expansion |
| AISE-030 | ⬜ BLOCKED | SHARED | CRITICAL | manhole verification | future expansion |
| AISE-031 | ⬜ BLOCKED | ZAI | HIGH_ASSURANCE | historical comparison | dependency-complete but not activated |
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
