# AISE v2 Work Items

Each item is independently reviewable and intentionally bounded for a three-worker Tech Lead. One item = one branch/PR. Work is dispatched in waves of up to three safe concurrent items.

| ID | Wave | Owner | Depends on | Scope |
|---|---:|---|---|---|
| AISE-001 | 0 | ZAI | — | repo/runtime/CI foundation |
| AISE-002 | 0 | GEMINI | — | Android foundation |
| AISE-003 | 1 | SHARED | 001,002 | versioned cross-platform contracts |
| AISE-004 | 1 | ZAI | 001,003 | capture ingestion gateway |
| AISE-005 | 1 | GEMINI | 002,003 | Android capture session |
| AISE-006 | 2 | GEMINI | 003,005 | device capability adapters/matrix |
| AISE-007 | 2 | ZAI | 003,004 | adaptive capture mission planner |
| AISE-008 | 2 | ZAI | 004 | evidence/source service |
| AISE-009 | 3 | GEMINI | 006,007 | guided mission executor/offline capture UX |
| AISE-010 | 3 | ZAI | 004,007 | reconstruction orchestration/strategy interface |
| AISE-011 | 3 | ZAI | 004,003 | BOQ ingestion |
| AISE-012 | 4 | ZAI | 010 | reconstruction engine adapters |
| AISE-013 | 4 | ZAI | 012 | deterministic geometry/measurement primitives |
| AISE-014 | 4 | ZAI | 011 | BOQ normalization/interpretation |
| AISE-015 | 5 | ZAI | 012,013 | architectural semantics |
| AISE-016 | 5 | ZAI | 013,015 | Reality Graph v2 persistence/core |
| AISE-017 | 5 | ZAI | 014,016 | BOQ↔reality scope mapping |
| AISE-018 | 6 | ZAI | 008,016 | adaptive evidence-gap/information-gain engine |
| AISE-019 | 6 | ZAI | 012,013,016 | golden capture/device benchmark harness |
| AISE-020 | 6 | ZAI | 013,016 | vector 2D plan/elevation projections |
| AISE-021 | 7 | ZAI | 016,020 | browser 2D/3D/evidence workspace |
| AISE-022 | 7 | ZAI | 007,008,016 | assurance/readiness v2 |
| AISE-023 | 7 | ZAI | 016,022 | model QA/verification v2 |
| AISE-024 | 8 | ZAI | 017,021 | BOQ Lens intelligence workspace |
| AISE-025 | 8 | ZAI | 016,008,023 | Engineering Case domain |
| AISE-026 | 8 | ZAI | 025,023 | Intervention Scenario/State model |
| AISE-027 | 9 | ZAI | 021,026 | synchronized 3D/2D/BOQ intervention viewer |
| AISE-028 | 9 | ZAI | 017,026,027 | intervention quantities/cost impacts |
| AISE-029 | 9 | ZAI | 008,022,023,025 | model/provider-neutral Engineering Reasoning gateway |
| AISE-030 | 10 | GEMINI | 006,009 | multi-device/offline capture hardening |
| AISE-031 | 10 | ZAI | 025,026,029 | post-work execution/outcome loop |
| AISE-032 | 10 | ZAI | 016,019,020 | reality-vs-design comparison |
| AISE-033 | 11 | ZAI | 016,019 | historical/change detection |
| AISE-034 | 11 | ZAI | 013,015,016,019 | MEP semantics foundation |
| AISE-035 | 11 | SHARED | 019,030,031 | physical reality lab + end-to-end dogfood |
| AISE-036 | 12 | ZAI | 023,024,029 | enterprise identity/permissions/audit |
| AISE-037 | 12 | ZAI | 016,017,020,021 | imports/exports/connectors |
| AISE-038 | 12 | ZAI | 024,027,029,037 | developer API/SDK |
| AISE-039 | 13 | SHARED | 031,032,033,034,035,036,037,038 | production pilot hardening/release gate |

## Wave policy

A wave is a scheduling suggestion, not permission to violate dependencies. The Tech Lead may split a wave if dependency or surface analysis requires it. The target is three concurrent workers whenever three safe items exist.

## Required Work Item fields

Every matching work order records objective, acceptance, exact surfaces, dependencies, assurance, benchmark/physical evidence, forbidden changes, stop conditions and composition checkpoint.
