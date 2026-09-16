# AISE Productization Work Orders

These Work Orders are subordinate to `spec/architecture-lock.md`, `spec/requirements.md`, `AGENTS.md`, `docs/productization-roadmap.md` and `docs/PRODUCTION-READINESS-GATE.md`.

Each Work Order is one branch/PR. A worker must not self-merge. The Tech Lead must independently reproduce the required evidence.

## Existing productization work orders

The previously defined `PROD-001` through `PROD-015` remain authoritative. Their complete scopes and acceptance criteria remain unchanged except where the dependency sequencing below is superseded by the new adapter/UX hardening items.

- `PROD-011b` closes the deployed-session stability gap discovered after the Vercel deployment by moving the session store onto the existing Redis port when configured.
- `PROD-012` verifies the actual deployed browser experience.
- `PROD-013` establishes cost/quota/failure safety.
- `PROD-014` is final evaluator documentation.
- `PROD-015` is the only final product-readiness declaration gate.

## PROD-016 — Shared client adapter contract and conformance

**Owner:** SHARED
**Depends on:** PROD-003

**Purpose**

Enforce ACR-004. Browser, mobile and desktop are adapters over one AISE product/domain core rather than separate implementations.

**Scope**

- implement or formalize the shared contract in `spec/client-adapter-contract.md`;
- expose platform-neutral task/capability/domain result shapes;
- add conformance fixtures/tests for browser, mobile and desktop;
- identify and remove duplicate client-side domain semantics found during audit;
- ensure authorization, epistemic state, evidence provenance, uncertainty and proposal/reality semantics are server/domain-owned;
- define adapter capability negotiation for screen, input, sensor and offline differences.

**Acceptance**

- all three adapters can represent the core task contract;
- no adapter owns canonical engineering state;
- equivalent server actions yield equivalent semantic results;
- client-specific UI differences do not alter engineering truth or authority;
- conformance tests pass from the same repository state.

**Evidence**

Adapter conformance matrix + automated tests + representative browser/mobile/desktop traces.

## PROD-017 — Task-first next-best-action and cross-adapter journey parity

**Owner:** SHARED
**Depends on:** PROD-010, PROD-016

**Purpose**

Turn the implemented modules into one understandable product centered on user intent and the next useful action.

**Scope**

- make the primary UI task-first rather than architecture-first;
- introduce a visible `Next Best Action` pattern driven by evidence gaps/readiness and workflow state;
- improve first-run, loading, empty, error and unavailable states;
- ensure the complete golden journey can be executed without knowledge of AISE internals;
- verify semantic parity of the journey across browser, mobile and desktop adapters;
- preserve direct auditability from every consequential quantity/claim to source evidence, geometry and revision.

**Acceptance**

- a first-time evaluator can identify what to do next on every primary screen;
- field operators receive precise capture actions rather than generic “capture more” prompts;
- BOQ explanations, issues and intervention states remain inspectable and traceable;
- before/after comparison is one first-class action;
- the same project state and permitted action semantics are visible through every adapter.

**Evidence**

Full golden-journey replay + usability/task trace + adapter parity report + provenance spot checks.

## PROD-018 — Competitive-parity and differentiation hardening

**Owner:** SHARED
**Depends on:** PROD-017

**Purpose**

Close product gaps revealed by the 2026 competitor simulation without cloning incumbents or weakening AISE's architectural boundary.

**Required capability set**

1. Smartphone/field capture must be low-friction, resumable and offline-capable.
2. Reality must be spatially contextualized to the project.
3. Quantities must be editable/reviewable and source-linked.
4. Drawings/documents must be revision-aware and interoperable with incumbents.
5. Issues must carry rich visual/spatial context and actionable next steps.
6. AI actions must be bounded and inspectable, not chat-only.
7. Plan-vs-reality and before/after must be easy to access.
8. Intervention simulation must connect geometry, cost and execution.
9. Post-work evidence and outcome comparison must be a first-class workflow.
10. Uncertainty, provenance and human verification must remain visible at consequential boundaries.

**Acceptance**

- competitive simulation in `docs/competitor-simulation-2026-09-16.md` is re-run against the final product;
- every identified required capability is either implemented or has an explicit governed exception;
- AISE's differentiated continuity from evidence through outcome remains visible;
- no feature introduces a second authority or provider lock-in.

**Evidence**

Competitive journey matrix + implementation-to-capability traceability + final golden journey replay.

## Cross-item composition rule

`PROD-011b`, `PROD-012`, `PROD-016`, `PROD-017` and `PROD-018` are product-critical. A failure in any one prevents `PROD-014` and therefore `PROD-015` from being finalized.

The final product must compose as:

```text
same AISE domain state
        ↓
shared task/capability contract
        ↓
┌────────────┬────────────┬────────────┐
│ browser    │ mobile     │ desktop    │
│ adapter    │ adapter    │ adapter    │
└────────────┴────────────┴────────────┘
        ↓
same engineering semantics
```
