# AISE v2 Work Items

Each item is independently reviewable and intentionally bounded for a three-worker Tech Lead. One item = one branch/PR. Work is dispatched in the earliest-safe waves below.

| ID | Wave | Owner | Depends on | Scope |
|---|---:|---|---|---|
| AISE-001 | 0 | ZAI | — | repo/runtime/CI foundation |
| AISE-002 | 0 | GEMINI | — | Android foundation |
| AISE-003 | 1 | SHARED | 001,002 | versioned cross-platform contracts |
| AISE-004 | 2 | ZAI | 001,003 | capture ingestion gateway |
| AISE-005 | 2 | GEMINI | 002,003 | Android capture session |
| AISE-006 | 3 | GEMINI | 003,005 | device capability adapters/matrix |
| AISE-007 | 3 | ZAI | 003,004 | adaptive capture mission planner |
| AISE-008 | 3 | ZAI | 004 | evidence/source service |
| AISE-009 | 4 | GEMINI | 006,007 | guided mission executor/offline capture UX |
| AISE-010 | 4 | ZAI | 004,007 | reconstruction orchestration/strategy interface |
| AISE-011 | 4 | ZAI | 004,003 | BOQ ingestion |
| AISE-012 | 5 | ZAI | 010 | reconstruction engine adapters |
| AISE-013 | 6 | ZAI | 012 | deterministic geometry/measurement primitives |
| AISE-014 | 5 | ZAI | 011 | BOQ normalization/interpretation |
| AISE-015 | 7 | ZAI | 012,013 | architectural semantics |
| AISE-016 | 8 | ZAI | 013,015 | Reality Graph v2 persistence/core |
| AISE-017 | 9 | ZAI | 014,016 | BOQ↔reality scope mapping |
| AISE-018 | 9 | ZAI | 008,016 | adaptive evidence-gap/information-gain engine |
| AISE-019 | 9 | ZAI | 012,013,016 | golden capture/device benchmark harness |
| AISE-020 | 10 | ZAI | 013,016 | vector 2D plan/elevation projections |
| AISE-021 | 11 | ZAI | 016,020 | browser 2D/3D/evidence workspace |
| AISE-022 | 10 | ZAI | 007,008,016 | assurance/readiness v2 |
| AISE-023 | 11 | ZAI | 016,022 | model QA/verification v2 |
| AISE-024 | 12 | ZAI | 017,021 | BOQ Lens intelligence workspace |
| AISE-025 | 12 | ZAI | 016,008,023 | Engineering Case domain |
| AISE-026 | 13 | ZAI | 025,023 | Intervention Scenario/State model |
| AISE-027 | 14 | ZAI | 021,026 | synchronized 3D/2D/BOQ intervention viewer |
| AISE-028 | 15 | ZAI | 017,026,027 | intervention quantities/cost impacts |
| AISE-029 | 13 | ZAI | 008,022,023,025 | model/provider-neutral Engineering Reasoning gateway |
| AISE-030 | 5 | GEMINI | 006,009 | multi-device/offline capture hardening |
| AISE-031 | 14 | ZAI | 025,026,029 | post-work execution/outcome loop |
| AISE-032 | 11 | ZAI | 016,019,020 | reality-vs-design comparison |
| AISE-033 | 10 | ZAI | 016,019 | historical/change detection |
| AISE-034 | 12 | ZAI | 013,015,016,019 | MEP semantics foundation |
| AISE-035 | 15 | SHARED | 019,030,031 | physical reality lab + end-to-end dogfood |
| AISE-036 | 14 | ZAI | 023,024,029 | enterprise identity/permissions/audit |
| AISE-037 | 13 | ZAI | 016,017,020,021 | imports/exports/connectors |
| AISE-038 | 15 | ZAI | 024,027,029,037 | developer API/SDK |
| AISE-039 | 16 | SHARED | 031,032,033,034,035,036,037,038 | production pilot hardening |

## Wave policy

A wave is the earliest-safe batch under `spec/dependency-graph.md`. Fewer than three items is intentional when canonical model joins create a serial critical path. The Tech Lead may split waves further if surface conflicts appear.
