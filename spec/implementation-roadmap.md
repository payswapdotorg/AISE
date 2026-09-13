# AISE v2 Implementation Roadmap

**Authority:** human-readable implementation sequencing. Machine counterpart: `spec/development-state/program-state.json`.

## Execution spine

```text
Intent → Assurance → Capability Assessment → Capture Mission → Evidence
→ Reconstruction → Reality Graph → Adaptive Evidence → Verification
→ BOQ Lens / Engineering Case → Intervention Simulation → Execution → Outcome
```

## Earliest-safe three-worker waves

| Wave | Work Items | Goal |
|---:|---|---|
| 0 | 001, 002 | repository + Android foundation |
| 1 | 003 | shared contract foundation |
| 2 | 004, 005 | ingestion + capture session |
| 3 | 006, 007, 008 | device capability, mission planner, evidence |
| 4 | 009, 010, 011 | guided capture, reconstruction orchestration, BOQ ingest |
| 5 | 012, 014, 030 | reconstruction adapters, BOQ normalization, mobile hardening |
| 6 | 013 | deterministic geometry/measurement |
| 7 | 015 | architectural semantics |
| 8 | 016 | Reality Graph v2 |
| 9 | 017, 018, 019 | BOQ mapping, adaptive evidence, benchmarks |
| 10 | 020, 022, 033 | 2D, assurance, historical comparison |
| 11 | 021, 023, 032 | workspace, verification, reality-vs-design |
| 12 | 024, 025, 034 | BOQ Lens, Engineering Case, MEP semantics |
| 13 | 026, 029, 037 | intervention model, reasoning, connectors |
| 14 | 027, 031, 036 | synchronized simulation, outcomes, enterprise controls |
| 15 | 028, 035, 038 | cost impacts, physical lab/dogfood, developer API |
| 16 | 039 | production pilot hardening |

Some waves contain fewer than three items because authority-sensitive model/contract joins deliberately serialize the critical path.

## Product gates

**Gate A:** guided room capture creates evidence-linked measurable model.

**Gate B:** the same task produces different capture plans on different devices without assurance downgrade.

**Gate C:** BOQ lines can be explained and traced into 2D/3D/evidence.

**Gate D:** an issue can be inspected as a structured case and a proposed repair stepped layer-by-layer with synchronized BOQ/2D/3D.

**Gate E:** executed work can be recaptured and compared to the proposed state.

**Gate F:** pilot users can use AISE as their primary project interface while incumbents remain connected where needed.

## Activation rule

Only the Tech Lead may activate work. After each merge, update machine state, roadmap status and dependency eligibility from actual repository evidence.
