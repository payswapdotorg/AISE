# AISE Architect Continuation State

**Purpose:** make AISE survivable across LLM sessions. A fresh architect must be able to clone the repository and resume from this packet plus the linked authoritative artifacts, without conversation history.

**Current repository:** `payswapdotorg/AISE`
**Architecture:** v1.0 — FROZEN
**Current state timestamp:** 2026-09-05T14:50:00Z

## Mission

Build the cross-platform Reality-to-Engineering platform whose canonical product object is the Engineering Reality Graph: geometry + semantics + topology + evidence + uncertainty + time/versioning.

Execution spine:

```text
intent → accuracy requirement → capture → reconstruction → semantics
→ Reality Graph → evidence/uncertainty → self-consistency QA
→ rules → human verification → authoritative model → outputs/reasoning
```

The repository is the sole source of truth. Conversation history is non-authoritative.

## Authority map

Read these before making any implementation decision:

1. `README.md` — project orientation and reading order.
2. `AGENTS.md` — mandatory fresh-agent operating contract.
3. `spec/implementation-roadmap.md` — frozen human-readable sequencing/progress authority.
4. `spec/development-state/program-state.json` — canonical machine-readable status/evidence state.
5. `spec/architecture-lock.md` — frozen v1.0 invariants.
6. `spec/architecture.md` — architecture description.
7. `spec/requirements.md` — product requirements.
8. `spec/work-items.md` — Work Item definitions.
9. `spec/work-orders.md` — executable Work Order contracts and acceptance criteria.
10. `spec/dependency-graph.md` — hard dependencies and design-time parallelization.
11. `spec/development-protocol.md` — lifecycle, evidence, review and merge rules.
12. `spec/agent-ownership.md` — protected implementation surfaces.
13. `spec/development-state/active-handoffs.md` — exact blockers, worker state and active implementation handoff.

`spec/implementation-map.md` is a supporting dependency/authority map, not a competing status authority.

## Governance invariants

- One Work Item → one branch → one implementation PR.
- A Work Item starts only when every hard dependency is finalized/merged and the Work Item is explicitly activated in machine state.
- Workers may implement and update their PR but never self-approve or self-merge.
- Architect review is the merge gate.
- CI and required objective evidence are mandatory; agent narrative is not completion evidence.
- CRITICAL model/measurement/evidence/verification work requires the benchmark and mutation/discrimination evidence specified by its Work Order.
- Cross-component work requires integration/composition evidence in addition to local tests.
- Frozen architecture, ownership and epistemic semantics may not be changed silently. Stop and raise an Architecture Change Request when required.
- `UNKNOWN`, `NOT_OBSERVED`, and `OCCLUDED` are not confirmed absence.
- Confidence does not replace measurement uncertainty.
- Browser/mobile UI is not canonical engineering authority.

## Current roadmap snapshot

### Finalized

- AISE-001 — repository/runtime foundation.
- AISE-002 — Android foundation.
- AISE-003 — shared contracts.
- AISE-004 — capture ingestion API.
- AISE-008 — reconstruction pipeline foundation.
- AISE-009 — geometry measurement primitives.
- AISE-010 — architectural object extraction.
- AISE-011 — Reality Graph core.
- AISE-012 — Evidence + provenance graph.
- AISE-013 — confidence/uncertainty/model readiness.
- AISE-014 — self-consistency/geometry QA.
- AISE-015 — web engineering workspace foundation.
- AISE-016 — evidence-aware object review UI.
- AISE-017 — 2D plan generation.
- AISE-018 — IFC export.
- AISE-019 — DXF/PDF output.
- AISE-020 — task intent and assurance engine.
- AISE-021 — engineering rule engine.
- AISE-022 — golden capture benchmark harness.
- AISE-026 — MEP pipe reconstruction.

Exact PR/merge/CI evidence for finalized items is recorded in `spec/implementation-roadmap.md` and `program-state.json`.

### Active

**AISE-027 — MEP asset/topology reconstruction (ZAI, CRITICAL)**

- Base: `9a65b56804c26d79b76132b984c2a2e32660eb74`
- Branch: `feat/AISE-027-mep-asset-topology`
- PR: #3
- Exact implementation head: `59166b974780768051246d1341ca60dcbb0c45e0`
- CI run: `33972057728` (QUEUED at this snapshot)
- Surface: `services/reality/semantics/mep/**`
- Objective: valves/equipment and the connectivity graph.
- Acceptance: asset/topology fixtures, uncertainty and evidence linkage.
- Merge gate: architect; self-merge forbidden.

The PR description provides the worker's local verification results. Acceptance remains pending until the required CI/evidence is available and reviewed.

### Blocked

- AISE-005 — Android capture session; blocked by post-merge Android instrumentation failure and requires corrective Android-only implementation plus fresh architect review.
- AISE-006 — Android offline sync; hard-blocked by AISE-005.
- AISE-007 — capture quality/coverage guidance; hard-blocked by AISE-005.
- AISE-023 — physical Reality Lab; hard-blocked by AISE-005 (AISE-022 is finalized).
- AISE-024 — end-to-end composition; blocked by AISE-006 and other declared dependencies.
- AISE-025 — AISE dogfood capture; blocked by AISE-024.
- AISE-028 — MEP dogfood benchmark; blocked by AISE-023 and AISE-027.

### Future / not activated

- AISE-029 — reality-vs-design comparison.
- AISE-031 — historical comparison/change detection.
- AISE-030 — manhole verification vertical; additionally blocked by AISE-024.
- AISE-032 — Engineering Copilot; additionally blocked by AISE-024.

Dependency-complete does not mean activation. Only explicitly activated Work Items may start.

## Completed milestone evidence explicitly required for continuity

The current repository already persists the requested completed AISE core milestones:

- AISE-011: finalized with PR #13, CI `33806624742`, merge `b1731536203e6bc4698f5804cea882675c798abf`.
- AISE-012: finalized with PR #14, CI `33818256481`, merge `80e7c6f7f5552d6b8562fe7c0c3954c8ad74da1a`.
- AISE-013: finalized with PR #15, CI `33829570146`, merge `66a9e329dd145f38ee69d3286278039f44e9ea70`.
- AISE-014: finalized with PR #19, CI `33854132772`, merge `934e32479d929bcdabf846663e6b625d24bdb8c3`.
- AISE-026: finalized with PR #47, CI `33954644880`, merge `9a65b56804c26d79b76132b984c2a2e32660eb74`.
- Android/backend/web milestones are represented by their Work Item rows and exact evidence in the roadmap/state ledger.

## Known historical blocker

AISE-005 contains a post-merge verification incident: the original implementation merged as `66d87da0a70a6f0013fd5bad8f2cf07b716e57d1`, but Android CI `33847147977` failed in `connectedDebugAndroidTest` because `LifecycleRegistry.setCurrentState` was called off the main thread. This remains a blocker and must not be erased by later status prose.

## Exact next worker instructions

Start with repository state, not chat:

```text
READ:
  AGENTS.md
  spec/implementation-roadmap.md
  spec/development-state/program-state.json
  spec/architecture-lock.md
  spec/work-items.md
  spec/work-orders.md#AISE-027
  spec/dependency-graph.md
  spec/development-protocol.md
  spec/agent-ownership.md
  spec/development-state/active-handoffs.md

BIND:
  WORK_ITEM=AISE-027
  OWNER=ZAI
  REPOSITORY=payswapdotorg/AISE
  BASE_SHA=9a65b56804c26d79b76132b984c2a2e32660eb74
  BRANCH=feat/AISE-027-mep-asset-topology
  PR=3
  HEAD_SHA=59166b974780768051246d1341ca60dcbb0c45e0
  SURFACE=services/reality/semantics/mep/**
  ASSURANCE=CRITICAL
  MERGE_GATE=ARCHITECT
  SELF_MERGE=FORBIDDEN
```

Then inspect the current PR and CI state. Continue the same Work Item on the same branch/PR. Do not create a second AISE-027 PR. Do not broaden scope. Do not modify Android, canonical authority, or frozen epistemic semantics.

The acceptance target is the Work Order, not a narrative: asset/topology fixtures; uncertainty/evidence linkage; required tests; required benchmark/discrimination evidence; green CI; and architect review.

After acceptance/merge, the architect must verify the exact merged SHA, write objective evidence into `program-state.json`, synchronize the roadmap row, update `active-handoffs.md`, and recompute eligibility before activating later work.

## What not to assume

- Do not infer missing design details from previous LLM conversations.
- Do not treat dependency eligibility as activation.
- Do not treat an open PR as merged/finalized.
- Do not treat local test results as a substitute for required CI or physical benchmark evidence.
- Do not move canonical engineering authority into the browser/mobile client.
- Do not convert uncertainty/unknown observations into absence.
- Do not create a new Work Item merely to bypass a blocked dependency.
