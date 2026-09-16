# AISE v2 Agent Operating Contract

AISE is implemented by replaceable coding workers under an independent Tech Lead/Architect. The repository is the sole durable source of implementation truth. No worker may require prior conversation history.

## Mandatory reading order

1. `README.md`
2. `AGENTS.md`
3. `spec/architecture-lock.md`
4. `spec/architecture.md`
5. `spec/client-adapter-contract.md`
6. `spec/requirements.md`
7. `spec/domain-model.md`
8. `spec/agent-ownership.md`
9. `spec/work-items.md`
10. `spec/work-orders.md`
11. `spec/dependency-graph.md`
12. `spec/implementation-roadmap.md`
13. `spec/development-protocol.md`
14. `spec/assurance.md`
15. `spec/development-state/program-state.json`
16. `docs/productization-roadmap.md`
17. `docs/productization-work-orders.md`
18. `docs/productization-state.json`
19. `docs/PRODUCTION-READINESS-GATE.md`
20. `docs/free-tier-deployment.md`
21. `docs/INSTALL.md`
22. `docs/DEPLOYMENT.md`
23. `docs/product-journey-simulation.md`
24. `docs/interactive-engineering-solution-workflow.md`
25. `docs/competitor-simulation-2026-09-16.md`
26. the Work Order for the assigned item

Also inspect all applicable Architecture Change Records, especially `spec/governance/architecture-change-record-004.md` and `spec/governance/architecture-change-record-005.md`.

## Authority hierarchy

1. `spec/architecture-lock.md` — immutable v2 architectural invariants
2. `spec/requirements.md` — product and quality requirements
3. `spec/domain-model.md` — canonical domain semantics
4. `spec/client-adapter-contract.md` — shared cross-platform product contract
5. `spec/work-items.md` + matching `spec/work-orders.md` — core implementation scope and acceptance
6. `docs/productization-roadmap.md` + `docs/productization-work-orders.md` — productization scope and acceptance
7. `spec/dependency-graph.md` + `program-state.json` + `docs/productization-state.json` — eligibility and machine state
8. `spec/implementation-roadmap.md` — human sequence/progress view
9. `spec/development-protocol.md` — execution/governance

A mismatch between roadmap and machine state is a governed-state failure.

## Worker rules

- One Work Item = one branch = one implementation PR.
- Start only activated, dependency-eligible Work Items.
- Never use an unfinished branch as a dependency.
- Do not modify another worker's protected surface without an explicit SHARED Work Item.
- Never create a second canonical model, provenance authority or readiness authority.
- Never turn AI output into authoritative engineering truth by implication.
- Preserve raw evidence and prior model versions.
- Confidence is not measurement uncertainty.
- `UNKNOWN`, `NOT_OBSERVED` and `OCCLUDED` are not absence.
- Proposed intervention and solution states must remain distinct from observed/confirmed reality.
- Critical measurement/model/evidence changes require benchmark, physical and mutation/discrimination evidence as specified by the Work Order.
- Workers may not self-approve or self-merge governed Work Items.

## Client-adapter rule

Browser, mobile and desktop are adapters over one AISE product/domain core.

Clients may specialize in controls, sensors, offline behavior, density and platform affordances, but may not diverge in engineering semantics or authority.

The following can never be decided authoritatively by a client:

- engineering readiness;
- canonical measurement status;
- evidence sufficiency;
- verification result;
- intervention approval;
- source-of-record authority;
- solution validation authority;
- tenant authorization beyond server-provided decisions.

## Three-worker operating model

The Tech Lead may dispatch up to three concurrent workers. Prefer three only when their Work Items have:

- all hard dependencies merged;
- disjoint change surfaces;
- no shared migration/schema conflict;
- explicit coordination contracts;
- available verification fixtures;
- a composition checkpoint defined for the wave.

### Adapter wave

```text
PROD-016 merged
     │
     ├── PROD-017 → apps/web/**
     ├── PROD-019 → apps/android/**
     └── PROD-020 → apps/desktop/**
```

### Interactive-solution wave

```text
PROD-021 merged
     │
     ├── PROD-022 → solution engine/validation
     ├── PROD-023 → agent operation compiler
     └── PROD-025 → solution BOQ derivation/tracing
```

The protected surfaces are intentionally disjoint. Workers must not edit frozen shared contracts after the shared contract item merges. A shared semantic defect becomes a new SHARED Work Item.

If fewer than three safe items exist, dispatch fewer. Throughput never outranks architectural or engineering assurance.

## Shared work

A SHARED Work Item must name:

- primary owner;
- secondary owner;
- exact shared contract/files;
- compatibility window;
- merge order;
- verification responsibilities;
- composition test.

## Architecture change

Stop and raise an Architecture Change Record when implementation would require:

- a second Reality Graph authority;
- a second Evidence authority;
- a second Assurance/Readiness authority;
- changing epistemic semantics;
- silently lowering task assurance because of device limitations;
- making UI/client state authoritative;
- treating a BOQ, BIM model, CAD file or vendor platform as canonical;
- removing uncertainty/provenance requirements;
- creating divergent browser/mobile/desktop domain semantics;
- changing ownership or merge authority;
- making a game/simulation/rendered-world representation authoritative over the Reality Graph;
- allowing agent-generated geometry or natural-language commands to bypass deterministic operation/validation rules.

## Required worker completion package

Every worker must report:

- Work Item ID;
- dependencies and exact base SHA;
- changed/protected surfaces;
- implementation summary;
- tests and results;
- benchmark/physical evidence when required;
- acceptance-criterion mapping;
- security/tenant considerations;
- known limitations;
- out-of-scope items;
- durable handoff for a successor;
- any architecture change discovered, raised explicitly rather than hidden in code.

## Reality-specific rule

A field capture is not complete because the operator walked around or because a visual mesh exists. A capture is complete only for a declared task when the Assurance Engine says the required evidence/uncertainty budget has been satisfied or an authorized human explicitly accepts the residual limitations under policy.

## Interactive-solution rule

The interactive engineering workflow is a proposal authoring system, not a second reality system.

- Direct manipulation and agent commands must resolve to the same typed `EngineeringOperation` semantics.
- The server/domain solution engine is authoritative for applying operations to proposed states.
- Validation is server-side and deterministic for supported checks.
- Solution-generated BOQs are derived from a validated Solution Graph version and must retain step/geometry/calculation provenance.
- BOQ lines and solution operations must have bidirectional navigation identity.
- The initial implementation scope is buildings; the operation contract must remain extensible to later domains.
- A solution, no matter how visually realistic, never becomes observed reality without evidence and the existing assurance/verification process.

## Productization rule

The 41-item implementation campaign is complete. Productization remains governed by `docs/productization-roadmap.md` and `docs/productization-state.json`, now extended through PROD-026.

Do not declare the product ready because code exists. Final readiness requires the independent evidence gate in `docs/PRODUCTION-READINESS-GATE.md`.

The baseline golden journey must not require paid GPU inference. Heavy reconstruction engines are optional providers.

## Fresh-agent rule

A newly spawned worker must be able to identify exactly one authorized Work Item and exactly what evidence is required for acceptance from the repository alone.

A newly spawned Tech Lead must be able to identify the current productization frontier, adapter contract, interactive-solution architecture, protected client/solution surfaces, three-worker waves and final readiness gate without chat history.
