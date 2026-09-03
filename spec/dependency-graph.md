# AISE v1.0 Dependency Graph

## Hard dependency graph

```text
AISE-001 ──┐
           ├── AISE-003 ──┬── AISE-004 ── AISE-008 ── AISE-009 ──┬── AISE-010 ── AISE-011 ── AISE-012 ── AISE-013
AISE-002 ──┘              │                                      │                                  │
                          └── AISE-005 ── AISE-006                │                                  └── AISE-014
                               │                                  │
                               └── AISE-007                        ├── AISE-017 ──┬── AISE-018
                                                                  │               └── AISE-019
                                                                  └── AISE-015 ── AISE-016

AISE-013 ── AISE-020 ── AISE-021

AISE-008 + AISE-009 + AISE-010 + AISE-011 ── AISE-022
AISE-005 + AISE-022 ── AISE-023
AISE-006 + AISE-008 + AISE-011 + AISE-012 + AISE-015 + AISE-018 + AISE-019 ── AISE-024
AISE-024 ── AISE-025

AISE-009 + AISE-011 + AISE-012 + AISE-022 ── AISE-026 ── AISE-027
AISE-023 + AISE-026 + AISE-027 ── AISE-028

AISE-018 + AISE-022 ── AISE-029
AISE-021 + AISE-024 ── AISE-030
AISE-011 + AISE-012 + AISE-022 ── AISE-031
AISE-012 + AISE-013 + AISE-021 + AISE-024 ── AISE-032
```

## Parallel waves

### Wave 0 — foundation
- AISE-001 ZAI
- AISE-002 GEMINI

### Wave 1 — shared contract + capture/backend substrate
- AISE-003 SHARED (ZAI primary)
- after AISE-001, ZAI may also prepare backend capture boundaries in AISE-004
- after AISE-002, GEMINI may prepare capture session work in AISE-005

### Wave 2 — independent capture/processing streams
- AISE-004 ZAI
- AISE-005 GEMINI
- AISE-007 GEMINI (after AISE-005)
- AISE-008 ZAI (after AISE-004)

AISE-004/008 do not touch Android implementation surfaces; AISE-005/007 do not touch server authority.

### Wave 3 — core model
- AISE-006 GEMINI after AISE-004 + AISE-005
- AISE-009 ZAI after AISE-008
- once AISE-009 is complete, AISE-010 ZAI can run

### Wave 4 — Reality Graph / evidence / workspace
- AISE-011 ZAI
- AISE-015 ZAI after AISE-001 + AISE-011

AISE-012 depends on AISE-004 + AISE-011; AISE-013 depends on AISE-009 + AISE-011 + AISE-012.

### Wave 5 — quality + outputs
- AISE-012 ZAI
- AISE-017 ZAI
- AISE-014 ZAI after AISE-011 + AISE-013
- AISE-016 ZAI after AISE-012 + AISE-013 + AISE-015

### Wave 6 — exports/rules/benchmarks
- AISE-018 ZAI
- AISE-019 ZAI
- AISE-020 ZAI
- AISE-022 ZAI

AISE-023 SHARED can begin after AISE-005 + AISE-022.

### Wave 7 — composition / dogfood
- AISE-021 ZAI after AISE-014 + AISE-020
- AISE-024 ZAI after all declared dependencies
- AISE-023 SHARED
- AISE-025 SHARED after AISE-024

### Wave 8 — MEP
- AISE-026 ZAI
- AISE-027 ZAI
- AISE-028 SHARED

### Wave 9 — expansion
- AISE-029 ZAI
- AISE-030 SHARED
- AISE-031 ZAI
- AISE-032 ZAI

## Parallelization rules

1. A Work Item is start-eligible only when all hard dependencies are complete/merged.
2. Same-agent parallelism is allowed only when declared surfaces do not conflict.
3. ZAI and GEMINI may work in parallel by default when their ownership surfaces are disjoint.
4. Shared contract work is a coordination boundary, not an invitation to modify both codebases freely.
5. Shared files, shared API schemas, migrations, canonical model schemas and integration roots are conflict surfaces.
6. An agent must not use an unfinished branch as an implicit dependency. Dependencies become satisfied through merged authoritative state.
7. When conflict is unavoidable, sequence the work or create an explicit SHARED Work Item.

## Expected first parallel frontier

Immediately after foundation and contract stabilization, the intended high-value parallel frontier is:

```text
ZAI:    AISE-004 Capture API
        AISE-008 Reconstruction
        AISE-015 Web workspace (when model contract permits)

GEMINI: AISE-005 Android capture
        AISE-007 Capture guidance
```

The exact activation order is determined from current Work Item status and declared surfaces; this file is the design-time graph, not mutable runtime state.
