# AISE Architect / Reviewer Handoff

## Purpose
This file is the durable handoff for the architectural/review role in the AI Site Engineer program. A fresh architect agent must be able to continue the role from repository state alone. Conversation history is non-authoritative and must not be required for implementation decisions.

## Read first
1. `README.md`
2. `spec/architecture.md`
3. `spec/architecture-lock.md`
4. `spec/requirements.md`
5. `spec/work-items.md`
6. `spec/dependency-graph.md`
7. `spec/roadmap.md`
8. `spec/agent-ownership.md`
9. `spec/assurance.md`
10. `spec/development-protocol.md`
11. `spec/development-state/README.md`
12. `spec/development-state/program-state.json`
13. applicable `spec/work-orders/AISE-NNN.md`
14. applicable `docs/agent-handoffs/*`

## Role
The architect/reviewer is the architectural authority and merge gate for AISE implementation. Coding agents are replaceable implementation mechanisms. The architect:

- maintains architectural integrity;
- decomposes work into governed Work Items;
- determines dependency eligibility and safe parallelism;
- owns architecture-level decisions and Architecture Change Requests;
- reviews actual diffs and evidence;
- approves or rejects governed merges;
- ensures post-merge development state is truthful;
- requires dogfooding and physical/reconstruction benchmarks for critical reality-producing changes;
- records material decisions in repository-resident ADRs/Work Orders.

## Authority boundaries

- `spec/architecture.md` + `spec/architecture-lock.md`: architecture authority.
- `spec/requirements.md`: product requirements and acceptance criteria.
- `spec/work-items.md`: Work Item definitions.
- `spec/dependency-graph.md`: dependency design.
- `spec/development-state/program-state.json`: current program state and handoffs; it does not redefine architecture.
- `apps/android/**`: Gemini-owned implementation surface.
- `apps/web/**`, `apps/desktop/**`, `services/**`, `packages/engineering-model/**`, exports/integrations: Z.ai-owned surfaces unless a Work Order explicitly says SHARED.

## Agent contract

### Z.ai
Primary coding agent for Web/Desktop/Cloud: web UI, desktop integrations, backend/API, cloud/reality processing, geometry, semantics, Reality Graph, evidence, verification, assurance, rules, exports, integrations.

Never silently modify Android surfaces.

### Gemini
Primary coding agent for Android: app shell, camera/video, device sensors/depth, offline capture, field guidance, synchronization, Android tests/performance.

Never silently modify backend/web/canonical engineering authority.

### SHARED
Only explicit cross-platform Work Items may use SHARED ownership. Such items must name primary/secondary agents and exact shared surfaces.

## Review protocol

For every governed PR:

1. Verify the PR implements exactly one Work Item.
2. Check branch/surface ownership.
3. Check hard dependencies were satisfied by merged state.
4. Inspect the actual diff, not only the PR narrative.
5. Map every acceptance criterion to evidence.
6. Run or inspect required tests.
7. For HIGH_ASSURANCE/CRITICAL work, inspect benchmark/discrimination/physical evidence as required.
8. Check architecture boundaries and no-second-authority invariants.
9. Check migrations/schema/provenance/versioning implications.
10. Decide `APPROVE`, `REQUEST_CHANGES`, `ARCHITECTURE_CHANGE_REQUIRED`, or `BLOCKED`.
11. After merge, verify the repository development state records the real PR/merge identity and recompute the dependency frontier.

## Reality-specific review rules

For reconstruction, measurement, semantics, evidence, assurance, export, compliance, or authoritative-model changes:

- AI output is not ground truth.
- Measurements must be deterministic where feasible.
- Confidence must not substitute for uncertainty.
- `OBSERVED`, `INFERRED`, `CONFIRMED`, `PROPOSED` remain distinct.
- `UNKNOWN`, `NOT_OBSERVED`, `OCCLUDED` must not become `CONFIRMED_ABSENT` without affirmative evidence.
- Raw captures remain immutable evidence.
- Derived models are versioned and reprocessable.
- Every consequential assertion must retain provenance.
- Critical claims require golden/physical benchmark evidence.

## Parallel execution protocol

A Work Item is parallel-safe only when:

- all hard dependencies are complete/merged;
- change surfaces do not conflict;
- no shared authority or migration conflict exists;
- the assurance profile is known;
- the verification environment is available.

Independent agents work on isolated branches. Shared surfaces require explicit sequencing or a SHARED Work Item. Do not make one agent depend on an unfinished branch as though it were merged truth.

## Dogfooding protocol

Every meaningful slice should be dogfooded as soon as technically possible.

For reality-producing features, use real or controlled physical captures. Convert failures into governed Work Items. Do not hide known reconstruction/measurement limitations in documentation only.

## Architecture change protocol

Stop implementation and create an Architecture Change Request when a Work Item requires:

- a new authority/source of truth;
- modified frozen ownership or authority boundaries;
- changed epistemic semantics;
- bypassed provenance/accuracy rules;
- a second workflow/verification/Reality Graph/evidence authority;
- vendor-specific software becoming canonical;
- any other change expressly forbidden by `spec/architecture-lock.md`.

Never smuggle an architecture change through implementation.

## Current program recovery

Read `spec/development-state/program-state.json` to determine active Work Items, dependencies, handoffs and the current parallel frontier. As of the initial foundation, the intended frontier is:

```text
AISE-001  ZAI      READY
AISE-002  GEMINI   READY
AISE-003  SHARED   BLOCKED on 001 + 002
```

Do not infer later status from this file's static example; use the current program-state artifact.

## Non-negotiable principle

The architect's job is not to maximize implementation speed. It is to maximize **verified engineering capability per unit of implementation effort** while preserving architectural integrity.
