# AISE Roadmap Authority Adoption — Governance Record

**Change:** GOV-001
**Status:** FROZEN
**Reference pattern:** `pectoraux/floooz`
**Applied to:** `pectoraux/AISE`

## Adopted process

AISE adopts the same repository-first project-tracking pattern used by Floooz, adapted to engineering/reality-model assurance.

1. `spec/implementation-roadmap.md` is the frozen, human-readable implementation sequencing and progress artifact.
2. `spec/development-state/program-state.json` is the canonical machine-readable status/evidence counterpart.
3. `spec/implementation-map.md` is the detailed supporting dependency/authority map and is not a second status authority.
4. `spec/work-orders.md` contains durable implementation contracts so agents do not need chat history.
5. `AGENTS.md` makes the reading order, selection loop, ownership and completion rules explicit for fresh agents.
6. A roadmap/program-state mismatch is an invalid governed repository state.
7. Work is selected only from dependency-eligible, explicitly activated state; no agent activates work merely because the dependency graph permits it.
8. Completion requires objective acceptance evidence and architect review; post-merge finalization records exact merged SHA.
9. Important active blockers, CI failures, exact PR heads, and handoff instructions are persisted in repository state.

## AISE-specific adaptation

The reference pattern is retained without importing Floooz-specific architecture. AISE's architecture authority remains `spec/architecture-lock.md`, its canonical model authority remains the Engineering Reality Graph, its provenance authority remains the Evidence subsystem, and its model-readiness authority remains Assurance.

The roadmap records the engineering program spine and assurance state rather than the Floooz agent-execution spine. CRITICAL AISE work retains its golden-capture, ground-truth, mutation/discrimination and fail-closed requirements.

## Current persisted execution facts

- AISE-001 through AISE-004 are finalized.
- AISE-008 through AISE-013 are finalized.
- AISE-005 remains active on PR #8; Android CI currently fails during instrumentation-source compilation at `AppShellEmulatorSmokeTest.kt:29:37` with unresolved `rememberNavController`.
- AISE-006 is open on PR #10 with green Android CI but is blocked from merge by hard dependency AISE-005.
- AISE-014 is the current activated ZAI CRITICAL work item.
- The exact current program state is stored in `spec/development-state/program-state.json`; this document is governance provenance, not a substitute for that state.

## Freeze rule

This adoption record and the roadmap/map/work-order governance structure may only change through a governed repository change that records the reason and preserves `spec/architecture-lock.md`.
