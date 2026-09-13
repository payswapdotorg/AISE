# AISE v2 Dependency Graph and Three-Worker Waves

## Hard DAG

```text
001 ─┐
002 ─┴→ 003 ─┬→ 004 ─┬→ 007 ─┬→ 009
             │       │        └→ 010
             └→ 005 ─→ 006 ───┘
004 ─→ 008
007 + 004 → 010
004 + 003 → 011 → 014
010 → 012 → 013
012 + 013 + 015 + 016 → 017
013 + 015 → 016
008 + 016 → 018
012 + 013 + 016 → 019
013 + 016 → 020
016 + 020 → 021
007 + 008 + 016 → 022
016 + 022 → 023
017 + 021 → 024
016 + 008 + 023 → 025
025 + 023 → 026
021 + 026 → 027
017 + 026 + 027 → 028
008 + 022 + 023 + 025 → 029
006 + 009 → 030
025 + 026 + 029 → 031
016 + 019 + 020 → 032
016 + 019 → 033
013 + 015 + 016 + 019 → 034
019 + 030 + 031 → 035
023 + 024 + 029 → 036
016 + 017 + 020 + 021 → 037
024 + 027 + 029 + 037 → 038
031 + 032 + 033 + 034 + 035 + 036 + 037 + 038 → 039
```

## Three-worker wave plan

### Wave 0 — foundations
- 001 ZAI: repo/runtime
- 002 GEMINI: Android foundation

### Wave 1 — capture and contracts
- 003 SHARED: contracts (after 001+002)
- 004 ZAI: capture gateway (after 003)
- 005 GEMINI: capture session (after 003)

### Wave 2 — adaptive acquisition substrate
- 006 GEMINI: device capability adapters
- 007 ZAI: mission planner
- 008 ZAI: evidence service

### Wave 3 — capture-to-processing
- 009 GEMINI: mission execution/guidance
- 010 ZAI: reconstruction orchestration
- 011 ZAI: BOQ ingestion

### Wave 4 — engines
- 012 ZAI: reconstruction adapters
- 013 ZAI: geometry/measurement
- 014 ZAI: BOQ normalization

### Wave 5 — canonical intelligence
- 015 ZAI: semantics
- 016 ZAI: Reality Graph v2
- 017 ZAI: BOQ↔reality mapping

### Wave 6 — evidence and projections
- 018 ZAI: adaptive evidence-gap engine
- 019 ZAI: benchmark/device matrix
- 020 ZAI: 2D projections

### Wave 7 — verification workspace
- 021 ZAI: engineering workspace
- 022 ZAI: assurance/readiness v2
- 023 ZAI: QA/verification v2

### Wave 8 — BOQ + case + intervention
- 024 ZAI: BOQ Lens workspace
- 025 ZAI: Engineering Case
- 026 ZAI: intervention state model

### Wave 9 — simulation/reasoning
- 027 ZAI: synchronized 2D/3D/BOQ intervention viewer
- 028 ZAI: intervention quantities/cost impacts
- 029 ZAI: reasoning gateway

### Wave 10 — outcome/comparison
- 030 GEMINI: multi-device/offline hardening
- 031 ZAI: execution/outcome loop
- 032 ZAI: reality-vs-design

### Wave 11 — durable expansion
- 033 ZAI: historical change detection
- 034 ZAI: MEP semantics
- 035 SHARED: physical reality lab + dogfood

### Wave 12 — enterprise/developer
- 036 ZAI: identity/permissions/audit
- 037 ZAI: imports/exports/connectors
- 038 ZAI: developer API/SDK

### Wave 13 — release gate
- 039 SHARED: production pilot hardening and acceptance

## Parallelization rules

Same-agent parallelism is allowed because each item owns a disjoint surface. Shared contracts, migrations, canonical schemas and integration roots are conflict surfaces. The Tech Lead may dispatch fewer than three items if the exact current state makes a nominal wave unsafe.
