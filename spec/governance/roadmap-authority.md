# AISE Roadmap Authority Adoption — Governance Record

**Change:** GOV-001
**Status:** FROZEN
**Reference pattern:** `pectoraux/floooz` (pattern only)
**Applied to:** `payswapdotorg/AISE`

## Adopted process

AISE uses a repository-first project-tracking pattern adapted to engineering/reality-model assurance.

1. `spec/implementation-roadmap.md` is the frozen, human-readable implementation sequencing and progress artifact.
2. `spec/development-state/program-state.json` is the canonical machine-readable status/evidence counterpart.
3. `spec/implementation-map.md` is the detailed supporting dependency/authority map and is not a second status authority.
4. `spec/work-orders.md` contains durable implementation contracts so agents do not need chat history.
5. `AGENTS.md` makes the reading order, selection loop, ownership and completion rules explicit for fresh agents.
6. A roadmap/program-state mismatch is an invalid governed repository state.
7. Work is selected only from dependency-eligible, explicitly activated state; no agent activates work merely because the dependency graph permits it.
8. Completion requires objective acceptance evidence and architect review; post-merge finalization records exact merged SHA.
9. Important active blockers, CI failures, exact PR heads, and handoff instructions are persisted in repository state.
10. `spec/development-state/CONTINUATION.md` is the durable architect continuation packet: it summarizes the current mission, authoritative state pointers, active work, blockers, next-work selection rule and worker protocol without becoming a second status authority.

## AISE-specific adaptation

AISE's architecture authority remains `spec/architecture-lock.md`; its canonical model authority remains the Engineering Reality Graph; its provenance authority remains the Evidence subsystem; and its model-readiness authority remains Assurance.

The roadmap records the engineering program spine and assurance state. CRITICAL AISE work retains its golden-capture, ground-truth, mutation/discrimination and fail-closed requirements.

## Reconciliation record — 2026-09-05

The authoritative remote is `payswapdotorg/AISE`. Earlier references to the former `pectoraux/AISE` development remote are historical provenance only.

The repository was reconciled against its current GitHub state. The prior governance record was stale in three material ways: it described AISE-014 as current activated work although AISE-027 is current; it described an obsolete AISE-005 handoff; and it did not record the already-open AISE-027 implementation PR.

Current execution facts:

- AISE-001 through AISE-004 are finalized.
- AISE-008 through AISE-022 are finalized except the explicitly blocked capture branch `AISE-005` and its dependent items.
- AISE-026 is finalized at merge `9a65b56804c26d79b76132b984c2a2e32660eb74`.
- AISE-027 is the single active Work Item. PR #3 is open on branch `feat/AISE-027-mep-asset-topology`, exact head `59166b974780768051246d1341ca60dcbb0c45e0`, base `9a65b56804c26d79b76132b984c2a2e32660eb74`, and CI run `33972057728` is queued at reconciliation time.
- AISE-005 remains blocked by its post-merge Android instrumentation failure; AISE-006, AISE-007 and AISE-023 remain hard-blocked by that state. AISE-024 and AISE-025 remain blocked by their declared dependencies. AISE-028 remains blocked pending AISE-023 and AISE-027. AISE-029, AISE-031 and AISE-032 are future/unactivated work; AISE-030 is additionally gated by AISE-024.
- The exact machine state is `spec/development-state/program-state.json`; this document is governance provenance and must not be treated as a substitute status authority.

## Work-state artifacts

| Need | Authoritative artifact |
|---|---|
| Human roadmap / progress | `spec/implementation-roadmap.md` |
| Machine work-item registry / evidence | `spec/development-state/program-state.json` |
| Current worker handoffs / blockers | `spec/development-state/active-handoffs.md` |
| Durable architect continuation packet | `spec/development-state/CONTINUATION.md` |
| Work-item definitions / acceptance | `spec/work-items.md` + `spec/work-orders.md` |
| Architecture constraints | `spec/architecture-lock.md` + `spec/architecture.md` |
| Dependency eligibility | `spec/dependency-graph.md` + `program-state.json` |
| Process / merge rules | `spec/development-protocol.md` + `AGENTS.md` |

## Freeze rule

This adoption record and the roadmap/map/work-order governance structure may only change through a governed repository change that records the reason and preserves `spec/architecture-lock.md`.
