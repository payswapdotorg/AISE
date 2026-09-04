# AISE Agent Operating Contract

This repository is the sole source of truth for implementation. Assume no access to prior conversations. Any implementation-critical decision, handoff, acceptance evidence, or sequencing decision must be recorded here or in the linked repository governance artifacts.

## Mandatory reading order

1. `README.md`
2. `spec/implementation-roadmap.md` — frozen human-readable roadmap and progress authority
3. `spec/implementation-map.md` — detailed supporting roadmap/contracts map
4. `spec/development-state/program-state.json` — canonical machine-readable progress state and evidence ledger
5. `spec/architecture-lock.md` — frozen architecture invariants
6. `spec/architecture.md` — architecture description
7. `spec/requirements.md` — product requirements
8. `spec/work-items.md` — work-item scope
9. `spec/work-orders.md` — implementation contracts and acceptance evidence
10. `spec/dependency-graph.md` — dependency authority
11. `spec/development-protocol.md` — implementation/governance protocol
12. `spec/agent-ownership.md` — surface ownership

Then read the specialist contract for the assigned surface where present.

## Repository authority

The repository is the durable project truth. Conversation history is not authoritative and must not be required to implement or resume work.

Authority hierarchy:

- `spec/architecture-lock.md` — frozen architecture invariants
- `spec/requirements.md` — product requirements
- `spec/work-items.md` + selected `spec/work-orders.md` section — work-item scope and contracts
- `spec/dependency-graph.md` + `spec/development-state/program-state.json` — dependency eligibility
- `spec/implementation-roadmap.md` + synchronized `spec/development-state/program-state.json` — human-readable implementation sequencing/progress and its machine counterpart
- `spec/development-protocol.md` — governance process

The roadmap is a governing, frozen, human-readable artifact. `program-state.json` is the canonical machine-readable status/evidence counterpart. Both must be synchronized whenever a status, dependency eligibility, completion claim, block, or material execution state changes. A mismatch is an invalid governed repository state.

## Work discipline

Implement one Work Item per branch and at most one active implementation PR for that Work Item. Do not start blocked work. Select only work that is dependency-eligible in `program-state.json` and consistent with the roadmap. Read the complete work order and inspect the current repository before coding.

Required loop:

```text
roadmap + program state
        ↓
eligible Work Item
        ↓
work order / contracts
        ↓
inspect repository
        ↓
implement smallest conforming change
        ↓
objective verification
        ↓
acceptance evidence / handoff
        ↓
synchronize program state + roadmap
        ↓
PR
        ↓
architect review / merge gate
        ↓
post-merge finalization
        ↓
recompute dependency eligibility
```

## Ownership

- `ZAI`: web, desktop, backend, reality processing, engineering model, evidence, assurance/verification, rules, exports and enterprise integrations.
- `GEMINI`: Android field application, Android capture/sensors, offline capture/sync, field guidance and Android-specific behavior.
- `SHARED`: only explicitly designated cross-platform work with named primary/secondary agents.

Z.ai MUST NOT implement `apps/android/**`. Gemini MUST NOT implement server-side authority, backend persistence, web surfaces, or canonical engineering verification. No agent may silently cross ownership boundaries.

## Frozen architecture

Do not change frozen v1.0 invariants inside an implementation PR. If implementation requires a second authority, changed epistemic semantics, changed ownership, changed canonical model semantics, or another frozen-invariant change, stop and use the architecture-change process.

## Completion and merge

Agent statements are claims, not completion evidence. A Work Item is complete only when its work-order acceptance criteria have objective evidence and the architect has accepted the implementation for merge. Coding agents may not self-approve or self-merge governed Work Items.

For CRITICAL Work Items, include mutation/discrimination evidence and benchmark evidence where the work order requires them. Cross-component work requires composition evidence. Post-merge state is finalized only against actual merge evidence and exact merged SHA.

## Fresh-agent rule

A new agent must be able to resume from repository state without conversational context. If an important decision, unresolved blocker, exact CI failure, dependency condition, or implementation instruction exists only in chat, record it in the appropriate repository artifact before relying on it.

## No-chat-history rule

Do not invent missing design details from prior conversation. When repository artifacts are insufficient, record the ambiguity as a repository issue/change proposal and follow the governed change process.
