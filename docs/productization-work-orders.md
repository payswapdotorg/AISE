# AISE Productization Work Orders

These Work Orders are subordinate to `spec/architecture-lock.md`, `spec/requirements.md`, `AGENTS.md`, `docs/productization-roadmap.md` and `docs/PRODUCTION-READINESS-GATE.md`.

Each Work Order is one branch/PR. A worker must not self-merge. The Tech Lead must independently reproduce the required evidence.

## Existing productization work orders

`PROD-001` through `PROD-015` remain authoritative for their existing scopes. No completed item is retroactively reopened merely because later adapter/productization hardening was added. New items are conformance/productization gates layered on top of the completed implementation campaign.

- `PROD-011b` closes the deployed-session stability gap by moving the session store onto the existing Redis port when configured.
- `PROD-012` verifies the actual deployed browser experience after stable deployed sessions exist.
- `PROD-013` establishes cost/quota/failure safety and is finalized.
- `PROD-014` is final evaluator documentation and bootstrap readiness.
- `PROD-015` is the only final product-readiness declaration gate.

## PROD-016 — Shared client adapter contract, negotiation and conformance harness

**Owner:** SHARED
**Depends on:** PROD-003

**Purpose**

Enforce ACR-004 without coupling adapter implementation work to one branch. This item establishes the stable semantic boundary that browser, mobile and desktop workers can consume concurrently.

**Scope**

- formalize the shared contract in `spec/client-adapter-contract.md` and any generated/checkable contract artifacts;
- define platform-neutral task, capability, evidence, authorization and result fixtures;
- define capability negotiation for screen/input/sensor/offline differences;
- add contract-level conformance fixtures/tests that can be consumed by each adapter;
- audit the current web and Android code for duplicated authoritative semantics and record any required adapter-local removals;
- define the compatibility window: after this item merges, adapter workers must not change the shared semantic contract without a new governed shared Work Item.

**Explicit non-scope**

Do not build the desktop app, redesign the web UI, or complete Android server integration in this item. The purpose is to make those three implementation tracks independently executable.

**Acceptance**

- a versioned, testable shared adapter contract exists;
- all three adapter profiles are representable through the same contract;
- conformance fixtures cover the required task/result semantics;
- no client-side authority is introduced;
- the contract can be consumed independently by three workers without shared-file contention.

**Evidence**

Contract schema/fixtures + automated conformance harness + adapter boundary audit + compatibility-window note.

## PROD-017 — Browser adapter and task-first product UX

**Owner:** WEB
**Depends on:** PROD-010, PROD-016
**Protected surface:** `apps/web/**` and browser-specific adapter tests/docs.

**Purpose**

Turn the current web product shell into the primary task-first browser adapter over the shared AISE domain/API contracts.

**Scope**

- implement task-first landing, project opening/creation and Next Best Action flows;
- make the golden journey executable from the browser without source-code/API knowledge;
- make loading, empty, error, unavailable-provider and permission states explicit;
- preserve direct auditability from consequential claims/quantities to source/evidence/version context;
- implement browser conformance tests using the PROD-016 fixtures;
- keep browser-specific presentation state non-authoritative.

**Explicit non-scope**

Do not change Android or desktop surfaces. Do not change Reality/Evidence/Assurance/Verification semantics. Do not redesign the shared contract.

**Acceptance**

- browser completes the primary product journey through real application entrypoints;
- every primary screen exposes the next useful action or an explicit blocked reason;
- observed/proposed, provenance, uncertainty and authorization semantics remain visible and intact;
- browser adapter conformance passes.

**Evidence**

Browser task trace + automated browser/adapter tests + provenance spot checks + screenshots/recording as repository evidence.

## PROD-019 — Android mobile adapter productization and field journey

**Owner:** MOBILE
**Depends on:** PROD-016
**Protected surface:** `apps/android/**` and Android-specific adapter tests/docs.

**Purpose**

Promote the existing Android capture foundation into the product's mobile adapter without duplicating domain authority.

**Scope**

- map the Android client to the shared task/capability/result contract;
- wire field-intent selection → capability assessment → adaptive mission → guided capture → evidence submission/resume;
- preserve the existing offline-first capture/session integrity guarantees;
- support explicit provider/network-unavailable behavior and resumable synchronization;
- implement mobile conformance tests using PROD-016 fixtures;
- make the mobile UI expose exact capture actions and evidence gaps instead of generic capture prompts.

**Explicit non-scope**

Do not modify `apps/web/**` or `apps/desktop/**`. Do not make mobile assurance decisions. Do not lower evidence requirements for weak devices. iOS is not required for this item; a future iOS adapter must consume the same contract.

**Acceptance**

- Android is an adapter, not a second domain implementation;
- representative field journey is executable with offline interruption/resume;
- evidence reaches the same server-authoritative semantics as browser operations;
- mobile conformance passes;
- capability degradation changes acquisition strategy/operator burden, not assurance thresholds.

**Evidence**

Android unit/instrumentation trace + adapter conformance report + offline/resume evidence + representative field journey recording.

## PROD-020 — Desktop adapter productization

**Owner:** DESKTOP
**Depends on:** PROD-016
**Protected surface:** `apps/desktop/**` and desktop-specific adapter tests/docs.

**Purpose**

Create a real desktop adapter over the shared AISE product contracts. The implementation may be a thin installed shell over the existing web application, provided it exposes desktop-appropriate capabilities without creating a domain fork.

**Scope**

- create `apps/desktop/` with a reproducible desktop build/run workflow;
- choose the lightest maintainable desktop technology compatible with the repository and target operating-system support;
- consume the same task/capability/result contract as browser/mobile;
- optimize for high-density review, large files, keyboard shortcuts and optional local integration affordances;
- add desktop conformance tests using PROD-016 fixtures;
- ensure the desktop adapter can open a project and exercise representative review/intervention workflows.

**Explicit non-scope**

Do not fork domain services, Reality/Evidence/Assurance/Verification logic, or the shared contract. Do not make local filesystem state authoritative. Do not block the web/mobile product on platform-specific features.

**Acceptance**

- `apps/desktop` is a real runnable product surface, not documentation or a placeholder;
- desktop actions resolve to shared server/domain actions;
- representative desktop project/review journey passes;
- desktop conformance passes on at least one documented supported desktop environment;
- platform-specific convenience features remain optional and non-authoritative.

**Evidence**

Build/run transcript + desktop smoke trace + adapter conformance report + supported-platform declaration.

## PROD-018 — Competitive-parity and differentiation hardening

**Owner:** SHARED
**Depends on:** PROD-012, PROD-017, PROD-019, PROD-020

**Purpose**

Close product gaps revealed by the 2026 competitor simulation without cloning incumbents or weakening AISE's architectural boundary.

**Required capability set**

1. Smartphone/field capture is low-friction, resumable and offline-capable.
2. Reality is spatially contextualized to the project.
3. Quantities are editable/reviewable and source-linked.
4. Drawings/documents are revision-aware and interoperable with incumbents.
5. Issues carry rich visual/spatial context and actionable next steps.
6. AI actions are bounded and inspectable, not chat-only.
7. Plan-vs-reality and before/after are easy to access.
8. Intervention simulation connects geometry, cost and execution.
9. Post-work evidence and outcome comparison are a first-class workflow.
10. Uncertainty, provenance and human verification remain visible at consequential boundaries.

**Acceptance**

- competitive simulation in `docs/competitor-simulation-2026-09-16.md` is re-run against the composed product;
- every required capability is either implemented or has an explicit governed exception with rationale;
- AISE's evidence → understanding → intervention → execution → outcome continuity remains visible;
- no feature introduces a second authority or provider lock-in;
- browser/mobile/desktop continue to produce semantically equivalent engineering results.

**Evidence**

Competitive journey matrix + capability traceability + final golden journey replay + cross-adapter semantic equivalence checks.

## PROD-021 — Interactive solution graph and engineering operation contract

**Owner:** SHARED
**Depends on:** AISE-026, AISE-027, AISE-028, PROD-016
**Architecture:** ACR-005
**Protected surfaces:** `packages/*` solution contracts/fixtures, relevant server/domain contracts, `spec/*` only as explicitly assigned.

**Purpose**

Create the stable, domain-extensible contract for the new interactive engineering solution workflow without implementing a platform-specific editor or agent.

**Scope**

- define versioned `Solution`, `SolutionVersion`, `EngineeringOperation`, `ProposedState`, `OperationDependency`, `OperationTarget`, `OperationEffect`, `SolutionValidationSnapshot` and solution-to-BOQ trace objects;
- define typed operation intents with explicit units, spatial targets, parameters and provenance;
- define lifecycle/version/branch semantics for draft, validated, superseded and abandoned proposals;
- define operation capability negotiation and unsupported-operation states;
- define bidirectional solution-step ↔ generated-BOQ-line identity contracts;
- create deterministic fixtures for initial building operations.

**Explicit non-scope**

No 3D editor, no agent implementation, no direct mutation of authoritative reality, no payment/cost-provider integration, and no support for non-building verticals in the first implementation.

**Acceptance**

- same operation intent can be produced by direct manipulation or an agent;
- every operation has deterministic identity, parameters, units, target, provenance and version context;
- proposed state remains separate from observed reality;
- contract is extensible beyond buildings without encoding building-specific authority semantics into clients;
- BOQ trace objects are bidirectional and version-pinned.

**Evidence**

Schemas + fixtures + serialization tests + authority/negative tests + operation/BOQ traceability fixtures.

## PROD-022 — Deterministic interactive solution engine

**Owner:** CORE
**Depends on:** PROD-021
**Protected surfaces:** `packages/*solution-engine*`, server solution execution/validation code, deterministic geometry tests.

**Purpose**

Implement the server/domain engine that applies typed engineering operations to a proposed solution and produces reproducible proposed states.

**Scope**

- implement operation application and state-delta computation;
- implement deterministic geometry/topology/quantity calculations for the initial building operation subset;
- support undo/revision via new solution versions rather than destructive mutation;
- produce explicit unsupported/invalid/needs-input states;
- expose deterministic tool endpoints for validate, step, inspect and derived quantities;
- preserve provenance and version lineage for every state transition.

**Acceptance**

- identical inputs/operation sequences reproduce identical proposed states and quantities;
- authoritative Reality Graph is never mutated;
- invalid or ambiguous operations fail closed;
- operation effects and quantities are traceable to their parameters and source state;
- deterministic tests and negative/discrimination tests pass.

**Evidence**

Engine fixtures + deterministic replay + mutation protection + negative/discrimination suite + building operation quantity tests.

## PROD-023 — Agent engineering-operation compiler and interaction loop

**Owner:** AI/REASONING
**Depends on:** PROD-021
**Protected surfaces:** reasoning/agent integration code and solution-command tests; no shared contract edits after PROD-021.

**Purpose**

Let a competent real-world problem solver interact with the virtual solution through natural language while keeping engineering execution deterministic and inspectable.

**Scope**

- parse natural-language requests into typed `EngineeringOperationIntent` objects;
- ask targeted clarification questions for missing dimensions, materials, locations, sequencing or constraints;
- show the proposed operation before execution where ambiguity or material consequences exist;
- call deterministic solution/validation tools rather than generating geometry directly;
- support navigation, explanation, inspection and BOQ-step lookup commands;
- preserve agent/user attribution and the exact normalized command that was executed.

**Explicit non-scope**

The agent must not declare reality, readiness, validation success, engineering approval or cost authority. It must not write raw geometry or bypass the solution engine.

**Acceptance**

Representative building commands such as excavation dimensions, plaster thickness, block-wall height and material/layer changes compile into typed operations or explicit clarification/unsupported states. Equivalent commands from different phrasings resolve to equivalent semantic operations where unambiguous.

**Evidence**

Command corpus + parser/tool trace + ambiguity/clarification tests + refusal/unsafe-operation tests + semantic-equivalence tests.

## PROD-024 — Building interactive solution adapter / game-like environment

**Owner:** WEB/3D
**Depends on:** PROD-017, PROD-022, PROD-023
**Protected surface:** solution-specific browser UI under `apps/web/**`; may not alter generic adapter contract.

**Purpose**

Deliver the intuitive interactive environment in which the user can inspect the reconstructed building, manipulate proposed work, step layer-by-layer and see the engineering consequences.

**Scope**

- interactive 3D/2D navigation around the current/proposed building;
- direct manipulation controls mapped to typed solution operations;
- timeline/step navigation through operation states;
- isolate/inspect affected geometry and operation details;
- embedded agent interaction for the same operation system;
- clear observed vs proposed visual state distinction;
- responsive synchronization between geometry, operation list and selected BOQ lines once available;
- accessible non-3D fallback for core operation inspection.

**Acceptance**

A user who understands the real-world task can create or modify a building solution without learning AISE internals; every manipulation resolves to the same deterministic operation semantics used by the agent; proposed reality cannot overwrite authoritative reality.

**Evidence**

Browser interactive-solution recording + operation trace + adapter-conformance result + accessibility/fallback trace + mutation-protection evidence.

## PROD-025 — Validate → solution BOQ generation → bidirectional traceability

**Owner:** QS/CORE
**Depends on:** PROD-021, PROD-022
**Protected surfaces:** solution BOQ derivation code, BOQ trace schemas/tests, solution/BOQ service tests.

**Purpose**

Turn a validated interactive solution into an auditable BOQ and make the BOQ an explorable explanation of the virtual construction/repair process.

**Scope**

- compute solution quantities from deterministic operation/state deltas;
- group operations into meaningful building BOQ lines with units, materials/activities and calculation methods;
- attach validation snapshot and solution/version identity;
- preserve uncertainty and unresolved assumptions;
- implement BOQ-line → operation/geometry navigation and operation → BOQ-line reverse navigation;
- preserve the distinction between source BOQ and solution-generated BOQ.

**Acceptance**

Clicking `Validate` on a supported solution yields a validation snapshot. Clicking `Generate BOQ` creates a versioned derived BOQ from that snapshot. Every line can navigate to the corresponding solution step/geometry and every operation can reveal its affected/generated BOQ lines.

**Evidence**

Building fixture BOQ + calculation trace + validation snapshot + bidirectional navigation trace + source-vs-generated BOQ non-overwrite tests.

## PROD-026 — Interactive solution end-to-end composition and building benchmark

**Owner:** SHARED
**Depends on:** PROD-024, PROD-025, PROD-018

**Purpose**

Compose and independently verify the complete new workflow as a first-class AISE product workflow.

**Required journey**

```text
reconstruct/open current building reality
 → select engineering problem
 → create interactive solution
 → manipulate directly and/or use agent commands
 → step through proposed layers/states
 → validate
 → generate solution BOQ
 → click BOQ line
 → jump to corresponding solution step/geometry
 → inspect and understand solution
 → save/revise solution without altering observed reality
```

**Acceptance**

The full journey works on a seeded building fixture and on at least one representative physically grounded building scenario. All consequential quantities have provenance, the agent and direct manipulation produce equivalent operations, validation is deterministic, and no proposed state leaks into authoritative reality.

**Evidence**

Complete recording + request/operation trace + deterministic replay + physical/building benchmark + semantic agent/direct-manipulation equivalence + provenance audit.

## Cross-item composition and branch-safety rules

The adapter wave is deliberately partitioned:

```text
PROD-016 merged
     │
     ├── PROD-017  → apps/web/**
     ├── PROD-019  → apps/android/**
     └── PROD-020  → apps/desktop/**
```

These three workers may run concurrently because their protected implementation surfaces are disjoint. They must not modify shared contract files after PROD-016 merges. A discovered shared-contract defect is escalated to the Tech Lead as a new shared work item.

The interactive-solution wave is similarly partitioned:

```text
PROD-021 merged
     │
     ├── PROD-022 → solution engine
     ├── PROD-023 → agent compiler
     └── PROD-025 → solution BOQ derivation
             │
             └── PROD-024 after 022 + 023
                         │
                         └── PROD-026 composition
```

`PROD-022`, `PROD-023` and `PROD-025` are intentionally separable after the shared operation contract. They may run concurrently when the Tech Lead verifies that their protected surfaces remain disjoint. `PROD-024` is serialized after the engine/compiler seam is stable because it composes both interaction modes. `PROD-026` is the final workflow benchmark.

No worker may add a building operation directly to client code; new operations belong in the shared operation contract/engine and then become available to every adapter through the same semantics.
