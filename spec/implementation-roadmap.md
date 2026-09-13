# AISE v2 Implementation Roadmap

**Authority:** human-readable implementation sequencing. Machine counterpart: `spec/development-state/program-state.json`.

## Execution spine

```text
Intent → Assurance → Capability Assessment → Capture Mission → Evidence
→ Reconstruction → Reality Graph → Adaptive Evidence → Verification
→ BOQ Lens / Engineering Case → Intervention Simulation → Execution → Outcome
```

## Waves

| Wave | Work Items | Goal |
|---:|---|---|
| 0 | 001, 002 | repository + Android foundation |
| 1 | 003, 004, 005 | contracts, ingestion, capture |
| 2 | 006, 007, 008 | device capabilities, missions, evidence |
| 3 | 009, 010, 011 | guided capture, reconstruction orchestration, BOQ ingest |
| 4 | 012, 013, 014 | reconstruction adapters, geometry, BOQ normalization |
| 5 | 015, 016, 017 | semantics, Reality Graph, BOQ mappings |
| 6 | 018, 019, 020 | adaptive evidence, benchmarks, 2D |
| 7 | 021, 022, 023 | workspace, readiness, verification |
| 8 | 024, 025, 026 | BOQ Lens, Engineering Case, intervention model |
| 9 | 027, 028, 029 | synchronized simulation, cost impacts, reasoning |
| 10 | 030, 031, 032 | mobile hardening, outcomes, design comparison |
| 11 | 033, 034, 035 | change history, MEP, dogfood lab |
| 12 | 036, 037, 038 | enterprise, connectors, developer API |
| 13 | 039 | production pilot hardening |

## Product gates

**Gate A:** guided room capture creates evidence-linked measurable model.

**Gate B:** same task produces different capture plans on different devices without assurance downgrade.

**Gate C:** BOQ lines can be explained and traced into 2D/3D/evidence.

**Gate D:** an issue can be inspected as a structured case and proposed repair stepped layer-by-layer with synchronized BOQ/2D/3D.

**Gate E:** executed work can be recaptured and compared to the proposed state.

**Gate F:** pilot users can use AISE as their primary project interface while incumbents remain connected where needed.

## Activation rule

Only the Tech Lead may activate work. After each merge, update machine state, roadmap status and dependency eligibility from actual repository evidence.
