# AISE Detailed Implementation Map

**Status:** FROZEN SUPPORTING ARTIFACT
**Canonical roadmap:** `spec/implementation-roadmap.md`
**Machine progress authority:** `spec/development-state/program-state.json`
**Work contracts:** `spec/work-orders.md`

This document contains the detailed dependency/authority mapping behind the roadmap. It is not a second progress authority. Current statuses live in `program-state.json` and are rendered in the roadmap.

## Product execution model

```text
User intent / accuracy requirement
          ↓
Capture plan + field evidence
          ↓
Reconstruction / sensor fusion
          ↓
Scene semantics
          ↓
Engineering Reality Graph
          ↓
Evidence + provenance + uncertainty
          ↓
Self-consistency QA
          ↓
Engineering rules
          ↓
Human verification
          ↓
Authoritative model version
          ↓
IFC / DXF / PDF / APIs / reasoning
```

## Authority map

| Concern | Authority |
|---|---|
| Frozen architecture invariants | `spec/architecture-lock.md` |
| Product requirements | `spec/requirements.md` |
| Work-item scope | `spec/work-items.md` + selected section of `spec/work-orders.md` |
| Dependency eligibility | `spec/dependency-graph.md` + `spec/development-state/program-state.json` |
| Implementation sequencing/progress | `spec/implementation-roadmap.md` + synchronized `program-state.json` |
| Canonical engineering model | Reality Graph (`packages/engineering-model/**`) |
| Provenance / source evidence | Evidence subsystem (`services/evidence/**`) |
| Model-readiness | Assurance subsystem (`services/assurance/**`) |
| Formal verification | Verification subsystem (`services/verification/**`) |
| Export outputs | Export layer; never canonical state |
| Device-local capture | Android runtime/adapters, subject to contracts and server authority |

## Implementation streams

### Capture and ingestion

`AISE-001` + `AISE-002` → `AISE-003` → `AISE-004` and `AISE-005`.

`AISE-005 + AISE-004 → AISE-006`; `AISE-005 → AISE-007`.

### Reality processing

`AISE-004 → AISE-008 → AISE-009 → AISE-010 → AISE-011`.

`AISE-004 + AISE-011 → AISE-012 → AISE-013`.

`AISE-011 + AISE-013 → AISE-014`.

### Workspace and outputs

`AISE-001 + AISE-011 → AISE-015 → AISE-016`.

`AISE-009 + AISE-011 → AISE-017 → AISE-018` and `AISE-019`.

### Assurance, rules and validation

`AISE-013 → AISE-020`.

`AISE-011 + AISE-013 + AISE-014 + AISE-020 → AISE-021`.

`AISE-008 + AISE-009 + AISE-010 + AISE-011 → AISE-022`.

### Composition and dogfood

`AISE-005 + AISE-022 → AISE-023`.

`AISE-006 + AISE-008 + AISE-011 + AISE-012 + AISE-015 + AISE-018 + AISE-019 → AISE-024 → AISE-025`.

### MEP

`AISE-009 + AISE-011 + AISE-012 + AISE-022 → AISE-026 → AISE-027`.

`AISE-023 + AISE-026 + AISE-027 → AISE-028`.

### Expansion

`AISE-018 + AISE-022 → AISE-029`.

`AISE-021 + AISE-024 → AISE-030`.

`AISE-011 + AISE-012 + AISE-022 → AISE-031`.

`AISE-012 + AISE-013 + AISE-021 + AISE-024 → AISE-032`.

## Cross-cutting invariants

1. Raw field evidence is immutable and remains discoverable; derived representations are versioned.
2. `OBSERVED`, `INFERRED`, `CONFIRMED`, and `PROPOSED` remain distinct epistemic states.
3. `UNKNOWN`, `NOT_OBSERVED`, and `OCCLUDED` never imply confirmed absence.
4. Consequential assertions carry traceable provenance and retain evidence references.
5. Confidence is not measurement uncertainty.
6. Deterministic geometry/measurement logic is used where consequences are measurable.
7. Critical results fail closed when required evidence is missing or ambiguous.
8. Android and server authority remain separated by explicit contracts.
9. The Reality Graph is the only canonical structured engineering-model authority.
10. The Evidence subsystem is the only authoritative provenance mapping.
11. The Assurance subsystem is the only model-readiness authority.
12. Verification is read-only with respect to the canonical model; validation failures do not become hidden edits.
13. One Work Item per branch/PR; no implementation agent self-merges.
14. Critical model/measurement changes require the benchmark/mutation evidence defined by the work order.

## Fresh-agent completion loop

```text
read roadmap + program state
        ↓
select dependency-eligible item
        ↓
read work order + architecture/contracts
        ↓
inspect repository
        ↓
implement smallest conforming change
        ↓
run objective verification
        ↓
record acceptance evidence / handoff
        ↓
synchronize program state + roadmap
        ↓
open/update PR
        ↓
architect review
        ↓
merge exact accepted head
        ↓
finalize + recompute eligibility
```
