# Architecture Change Record 005 — Interactive Engineering Solution Workflow

**Status:** APPROVED
**Architecture baseline:** 2.2 + ACR-004 client-adapter boundary

## Decision

AISE adds a second primary workflow alongside the existing reality/diagnosis/intervention/outcome workflow:

```text
CURRENT REALITY
    ↓
ENGINEERING PROBLEM / INTENT
    ↓
INTERACTIVE SOLUTION
    ↓
OPERATION STEPS
    ↓
VALIDATE
    ↓
GENERATE BOQ
    ↓
BOQ LINE ↔ SOLUTION STEP TRACEABILITY
```

The interactive solution is a versioned proposal built from authoritative observed/confirmed reality. It is not a game-world truth source and does not mutate observed reality.

## Solution model

Introduce a versioned **Solution Graph** composed of ordered `EngineeringOperation` records and resulting proposed states. Each operation is deterministic, typed, parameterized, spatially anchored and attributable to its source intent/user/agent.

Phase 1 operations are for buildings and should prioritize deterministic, quantifiable operations such as excavation, demolition/removal, wall/block/brick placement, plaster/render/surface layers, simple slabs/foundations and supported building-service operations.

## Interaction model

The solution environment supports two equivalent input modes:

1. **Direct manipulation:** select, place, move, resize, cut, remove, layer, inspect and step through operations using an interactive 3D/2D environment.
2. **Agent command:** natural-language requests are translated into typed operation intents against the same operation contract.

The agent is an interpreter/planner, not an engineering authority. Missing dimensions, materials, locations, sequencing or evidence must result in questions or explicit blocked states rather than invented facts.

## Validation

`Validate` is a deterministic server-side operation over the solution version. It may evaluate geometry, topology, units, quantities, operation ordering, modeled engineering rules, evidence/readiness constraints and unsupported/ambiguous operations.

Validation produces explicit pass/fail/unknown/review-needed findings. A draft may remain editable, but a generated solution BOQ must be tied to a declared validation snapshot.

## BOQ derivation and bidirectional navigation

The solution BOQ is derived from the validated Solution Graph and proposed state deltas. Each generated line retains solution/version ID, contributing operation IDs, geometry references, units, calculation method, material/activity semantics, uncertainty and validation snapshot.

Users must be able to navigate in both directions:

```text
BOQ line → corresponding operation(s) and geometry
operation → generated/affected BOQ line(s)
```

The existing source BOQ remains separate and is never silently overwritten.

## Architectural invariants

- Reality Graph remains the canonical observed/confirmed engineering-model authority.
- Evidence Graph remains the provenance authority.
- Assurance Engine remains the task-readiness authority.
- Verification Engine remains the deterministic verification authority.
- Solution Graph is authoritative only for a proposed solution's operation/state history.
- BOQ Graph remains a projection/domain representation.
- LLMs/agents never directly become authoritative engineering executors.
- All clients remain adapters over the same semantic operation/solution contracts.
- Generated geometry is never labeled observed without evidence and acceptance.
- Every operation is reproducible from versioned inputs and parameters.

## Scope strategy

Phase 1 is buildings only. The contracts must be domain-extensible so future verticals can add civil works, MEP, industrial machinery, electronics and integrated circuits without changing the client architecture or authority model.

## Evidence requirement

This is a CRITICAL change because it touches intervention simulation, geometry, quantities and verification. Implementation must provide deterministic tests, negative/discrimination tests, provenance tests and representative building/physical validation where engineering geometry or quantities are claimed.
