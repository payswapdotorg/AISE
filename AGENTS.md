# AISE v2 Agent Operating Contract

AISE is implemented by replaceable coding workers under an independent Tech Lead/Architect. The repository is the sole durable source of implementation truth. No worker may require prior conversation history.

## Mandatory reading order

1. `README.md`
2. `AGENTS.md`
3. `spec/architecture-lock.md`
4. `spec/architecture.md`
5. `spec/client-adapter-contract.md`
6. `spec/technology-substitution-contract.md`
7. `spec/requirements.md`
8. `spec/domain-model.md`
9. `spec/agent-ownership.md`
10. `spec/work-items.md`
11. `spec/work-orders.md`
12. `spec/dependency-graph.md`
13. `spec/implementation-roadmap.md`
14. `spec/development-protocol.md`
15. `spec/assurance.md`
16. `spec/development-state/program-state.json`
17. `docs/productization-roadmap.md`
18. `docs/productization-work-orders.md`
19. `docs/productization-layer-hardening-work-orders.md`
20. `docs/productization-state.json`
21. `docs/PRODUCTION-READINESS-GATE.md`
22. `docs/free-tier-deployment.md`
23. `docs/INSTALL.md`
24. `docs/DEPLOYMENT.md`
25. `docs/product-journey-simulation.md`
26. `docs/interactive-engineering-solution-workflow.md`
27. `docs/layered-competitive-stress-test-2026-09-16.md`
28. `docs/post-production-discoverability-and-device-validation-plan-2026-09-25.md`
29. `docs/geometry-bim-technology-spike-2026-09-25.md`
30. `docs/geometry-bim-spike-work-orders-2026-09-25.md`
31. `docs/geometry-bim-spike-scorecard-2026-09-25.md`
32. the Work Order for the assigned item

Also inspect all applicable Architecture Change Records, especially ACR-004, ACR-005 and ACR-006.

## Authority hierarchy

1. `spec/architecture-lock.md` — immutable architectural invariants
2. `spec/requirements.md` — product and quality requirements
3. `spec/domain-model.md` — canonical domain semantics
4. `spec/client-adapter-contract.md` — shared cross-platform product contract
5. `spec/technology-substitution-contract.md` — provider/technology substitution invariants
6. `spec/work-items.md` + matching `spec/work-orders.md` — core implementation scope
7. `docs/productization-roadmap.md` + `docs/productization-work-orders.md` + `docs/productization-layer-hardening-work-orders.md` — productization scope
8. state files — eligibility and machine state
9. `spec/development-protocol.md` — execution/governance

A mismatch between architecture, roadmap, work orders and machine state is a governed-state failure.

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
- Proposed intervention and solution states remain distinct from observed/confirmed reality.
- Critical changes require applicable deterministic, negative/discrimination, provenance and physical evidence.
- Workers may not self-approve or self-merge governed Work Items.

## Three-layer product model

```text
LAYER 1 — REALITY
capture → spatial context → evidence → reconstruction → readiness

LAYER 2 — UNDERSTANDING
question → Evidence Envelope → reasoning → deterministic checks → bounded action

LAYER 3 — SOLUTION
problem → EngineeringOperation → proposed states → validation → solution BOQ
```

The layers share one domain core and never create separate engineering authorities.

## Client-adapter rule

Browser, mobile and desktop are adapters over one AISE product/domain core.

Clients may specialize in controls, sensors, offline behavior, density and platform affordances, but may not diverge in engineering semantics or authority.

No client may authoritatively decide readiness, measurement status, evidence sufficiency, verification, intervention approval, solution validation or tenant authorization.

## Technology substitution rule

All Layer-1, Layer-2 and Layer-3 technologies are replaceable behind stable AISE ports as specified by `spec/technology-substitution-contract.md`.

A worker may not make a provider/vendor framework a canonical dependency. Provider-specific identifiers/types must remain outside canonical domain semantics. Any replacement must preserve semantic outputs, provenance, uncertainty, authority and client contracts and must provide explicit failure behavior.

A technology substitution that changes engineering semantics requires an Architecture Change Record.

## Three-worker operating model

The Tech Lead may dispatch up to three concurrent workers. Prefer three only when hard dependencies are merged, surfaces are disjoint, migrations do not conflict, fixtures exist, and a composition checkpoint is defined.

### Adapter wave

```text
PROD-016
 ├── PROD-017 → apps/web/**
 ├── PROD-019 → apps/android/**
 └── PROD-020 → apps/desktop/**
```

### Interactive-solution wave

```text
PROD-021
 ├── PROD-022 → solution engine/validation
 ├── PROD-023 → agent operation compiler
 └── PROD-025 → solution BOQ derivation/tracing
```

### Layer-hardening wave

```text
PROD-026
 ├── PROD-027 → Layer 1 reality/capture hardening
 ├── PROD-028 → Layer 2 Evidence Envelope/reasoning hardening
 └── PROD-029 → Layer 3 operation/validation/BOQ hardening
```

Protected surfaces are intentionally disjoint. Shared semantic defects are escalated to a new SHARED Work Item.

## Interactive-solution rule

The interactive engineering workflow is a proposal-authoring system, not a second reality system.

- Direct manipulation and agent commands must resolve to the same typed `EngineeringOperation` semantics.
- The server/domain solution engine is authoritative for proposed-state operations.
- Validation is server-side and deterministic for supported checks.
- Solution BOQs derive only from a declared validation snapshot and retain step/geometry/calculation provenance.
- BOQ lines and operations have bidirectional navigation identity.
- Phase 1 operations are buildings-only and remain domain-extensible.
- A visually realistic proposal never becomes observed reality without evidence and the existing assurance/verification process.

## Evidence Envelope rule

Every consequential Layer-2 result/action must expose the available task/context, evidence, observed/confirmed facts, inferred assumptions, unknowns/gaps, measurement uncertainty, checks performed, result/status, next action, invalidation conditions and provider/agent identity where relevant.

## Worker completion package

Every worker must report Work Item ID, exact base/head SHA, protected surfaces, implementation summary, tests/results, required benchmark/physical evidence, acceptance mapping, security/tenant considerations, limitations, out-of-scope items, successor handoff and any Architecture Change Record raised.

## Productization and readiness

The original 41-item implementation campaign is complete. Productization now extends through PROD-029. Do not reopen AISE-001…041 for polish unless a governed finding demonstrates a real architectural defect.

`docs/PRODUCTION-READINESS-GATE.md` is binding. Only PROD-015 may declare PRODUCT-READY after all product, adapter, layered-solution and technology-substitution evidence passes.

The baseline product must not require paid GPU inference or a particular LLM/reconstruction/rendering/solver technology.

## Fresh-agent rule

A newly spawned worker must be able to identify exactly one authorized Work Item and its required evidence from the repository alone.

A newly spawned Tech Lead must be able to identify the current frontier, three-worker waves, protected surfaces, technology substitution rules, external verification limits and final readiness gate without chat history.


## Post-readiness R&D rule

The geometry/BIM spike is an architect-authorized exploratory program. It is subordinate to the
frozen architecture and technology-substitution contract, and it does not modify the meaning of
PROD-015.

G0 may use exactly three concurrent workers:
- GBIM-001 — exact geometry: OCCT + CadQuery/OCP + FreeCAD.
- GBIM-002 — IFC/OpenBIM: IfcOpenShell + IFC + Bonsai/Blender.
- GBIM-003 — browser spatial UX: Three.js + That Open/web-ifc + Atelier-derived Spatial Studio.

Do not fork an external project during the spike. Provider-specific IDs/types/formats remain
outside canonical AISE semantics. A successful spike produces evidence, not an automatic default
provider.