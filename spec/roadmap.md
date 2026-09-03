# AI Site Engineer — v1.0 → Expansion Roadmap

**Status:** GOVERNING ROADMAP
**Architecture:** v1.0 frozen by `spec/architecture.md` + `spec/architecture-lock.md`
**Important:** This roadmap is a planning artifact. Architecture authority remains in the architecture documents; development state remains in `spec/development-state/program-state.json`.

## Product north star

AISE turns physical reality into trustworthy engineering information:

`intent → required assurance → capture plan → multimodal evidence → reconstruction → Reality Graph → evidence/uncertainty → QA → rules → human verification → authoritative model → CAD/BIM/GIS/reports/reasoning`

## Full work graph

```text
                                        ┌───────────────────────────┐
                                        │       FOUNDATION           │
                                        └─────────────┬─────────────┘
                                                      │
                         ┌────────────────────────────┴────────────────────────────┐
                         │                                                         │
                         ▼                                                         ▼
                AISE-001 ZAI                                              AISE-002 GEMINI
          repo/runtime foundation                                      Android foundation
                         │                                                         │
                         └────────────────────────────┬────────────────────────────┘
                                                      │
                                                      ▼
                                       AISE-003 SHARED (ZAI primary)
                                         cross-platform contracts
                                                      │
                         ┌────────────────────────────┴────────────────────────────┐
                         │                                                         │
                         ▼                                                         ▼
                AISE-004 ZAI                                              AISE-005 GEMINI
                 capture ingestion                                         capture session
                         │                                                         │
                         ▼                                                         ▼
                AISE-008 ZAI                                              AISE-007 GEMINI
              reconstruction core                                        capture guidance
                         │                                                         │
                         ▼                                                         │
                AISE-009 ZAI                                                    │
           measurement primitives                                               │
                         │                                                         │
                         ▼                                                         │
                AISE-010 ZAI ◄────────────────────────────────────────────────────┘
           architectural extraction
                         │
                         ▼
                AISE-011 ZAI
              REALITY GRAPH CORE
                         │
              ┌──────────┼───────────────┐
              │          │               │
              ▼          ▼               ▼
       AISE-012 ZAI  AISE-015 ZAI  AISE-017 ZAI
        evidence/       web         2D plan
       provenance     workspace      generation
              │          │               │
              │          ▼               ├───────────────┐
              │    AISE-016 ZAI          │               │
              │   object review         ▼               ▼
              │                     AISE-018 ZAI    AISE-019 ZAI
              │                      IFC export       DXF/PDF
              │                         │
              ▼                         │
       AISE-013 ZAI                     │
 confidence/uncertainty/                │
 model readiness                        │
              │                         │
              ├──────────────┐          │
              ▼              ▼          │
       AISE-014 ZAI      AISE-020 ZAI    │
        model QA        task/assurance   │
              │          engine         │
              │              │          │
              └──────┬───────┘          │
                     ▼                  │
              AISE-021 ZAI              │
          engineering rule engine       │
                     │                  │
                     │                  │
 AISE-008 + AISE-009 + AISE-010 + AISE-011
                     │
                     ▼
              AISE-022 ZAI
          golden benchmark harness
                     │
          ┌──────────┴───────────┐
          ▼                      ▼
 AISE-023 SHARED            AISE-024 ZAI
 physical reality lab       end-to-end composition
          │                      │
          └──────────┬───────────┘
                     ▼
              AISE-025 SHARED
            AISE self-dogfooding
                     │
                     ▼
              ┌──────┴───────┐
              │              │
              ▼              ▼
       AISE-026 ZAI      AISE-027 ZAI
       MEP pipes        MEP assets/topology
              │              │
              └──────┬───────┘
                     ▼
              AISE-028 SHARED
              MEP dogfood benchmark
                     │
             ┌───────┼───────────────┐
             │       │               │
             ▼       ▼               ▼
      AISE-029 ZAI  AISE-030 SHARED AISE-031 ZAI
      reality vs     manhole          historical /
      design        verification      change detection
             │       │               │
             └───────┴───────┬───────┘
                             ▼
                       AISE-032 ZAI
                    ENGINEERING COPILOT
```

## Work item register

### Foundation / cross-platform

- **AISE-001 — ZAI:** repository/runtime foundation.
- **AISE-002 — GEMINI:** Android application foundation.
- **AISE-003 — SHARED:** versioned Android ↔ Web/Cloud contracts; ZAI primary, Gemini secondary.

### Capture / reconstruction

- **AISE-004 — ZAI:** capture ingestion API.
- **AISE-005 — GEMINI:** Android capture session.
- **AISE-006 — GEMINI:** Android offline sync.
- **AISE-007 — GEMINI:** capture quality/coverage guidance.
- **AISE-008 — ZAI:** reconstruction pipeline foundation.
- **AISE-009 — ZAI:** deterministic geometry/measurement primitives.
- **AISE-010 — ZAI:** architectural object extraction.

### Canonical truth model

- **AISE-011 — ZAI:** Reality Graph core.
- **AISE-012 — ZAI:** Evidence/provenance graph.
- **AISE-013 — ZAI:** confidence, uncertainty and model readiness.
- **AISE-014 — ZAI:** self-consistency and geometry QA.

### Engineering workspace / outputs

- **AISE-015 — ZAI:** web engineering workspace.
- **AISE-016 — ZAI:** evidence-aware object review UI.
- **AISE-017 — ZAI:** vector 2D plan generation.
- **AISE-018 — ZAI:** IFC 4.3 export.
- **AISE-019 — ZAI:** DXF + PDF/site report.

### Verification / benchmark / dogfood

- **AISE-020 — ZAI:** task intent and assurance engine.
- **AISE-021 — ZAI:** engineering rule engine.
- **AISE-022 — ZAI:** golden capture benchmark harness.
- **AISE-023 — SHARED:** physical Reality Lab protocol; ZAI primary, Gemini secondary.
- **AISE-024 — ZAI:** end-to-end composition pipeline.
- **AISE-025 — SHARED:** first real AISE dogfood; Gemini capture, ZAI processing/workspace.

### MEP

- **AISE-026 — ZAI:** pipe/centerline/diameter/connectivity reconstruction.
- **AISE-027 — ZAI:** valves/equipment/topology reconstruction.
- **AISE-028 — SHARED:** controlled MEP dogfood benchmark; Gemini capture, ZAI processing.

### Expansion

- **AISE-029 — ZAI:** reality-vs-design comparison.
- **AISE-030 — SHARED:** manhole verification vertical; ZAI primary, Gemini secondary.
- **AISE-031 — ZAI:** historical comparison/change detection.
- **AISE-032 — ZAI:** Engineering Copilot grounded in the Reality Graph and evidence.

## Parallel waves

### Wave 0 — start immediately

```text
AISE-001 ZAI       ||       AISE-002 GEMINI
```

These have no hard dependencies and have disjoint implementation surfaces.

### Wave 1 — integration contract

```text
AISE-003 SHARED
```

Blocked until 001 + 002 are merged. It is deliberately the first explicit bilateral integration boundary.

### Wave 2 — field + ingestion + reconstruction foundation

```text
AISE-004 ZAI      || AISE-005 GEMINI
                         │
                         └──→ AISE-007 GEMINI

AISE-004 → AISE-008 ZAI
```

The Android and server capture streams proceed independently after the shared contract. Reconstruction begins once ingestion exists.

### Wave 3 — measured geometry + offline sync

```text
AISE-006 GEMINI      ||      AISE-009 ZAI
                              │
                              ▼
                         AISE-010 ZAI
```

### Wave 4 — canonical model + web workspace

```text
AISE-011 ZAI
    ├──→ AISE-012 ZAI
    ├──→ AISE-013 ZAI
    └──→ AISE-015 ZAI
              │
              └──→ AISE-016 ZAI
```

### Wave 5 — outputs + QA

```text
AISE-012 ZAI   ||   AISE-014 ZAI   ||   AISE-017 ZAI
                                          │
                           ┌──────────────┴──────────────┐
                           ▼                             ▼
                     AISE-018 ZAI                 AISE-019 ZAI
```

### Wave 6 — assurance + benchmark

```text
AISE-020 ZAI   ||   AISE-022 ZAI
                     │
                     ▼
              AISE-023 SHARED
```

### Wave 7 — composition + rules

```text
AISE-021 ZAI   ||   AISE-024 ZAI   ||   AISE-023 SHARED
                                      │
                                      ▼
                               AISE-025 SHARED
```

### Wave 8 — MEP

```text
AISE-026 ZAI → AISE-027 ZAI → AISE-028 SHARED
```

### Wave 9 — expansion

```text
AISE-029 ZAI   ||   AISE-030 SHARED   ||   AISE-031 ZAI
             \             |             /
              \            |            /
               └───────────┴───────────┘
                           ▼
                    AISE-032 ZAI
```

## Critical ordering principles

1. **No implementation depends on conversation history.** Repository artifacts are authoritative.
2. **Dependencies are satisfied by merged state, not by an unfinished branch.**
3. **Cross-platform integration uses explicit contracts, not shared assumptions.**
4. **ZAI and GEMINI work in parallel whenever surfaces are disjoint.**
5. **Shared work is explicit and has a primary/secondary owner.**
6. **No coding agent merges its own governed Work Item.**
7. **Critical work requires benchmark/reality evidence in addition to software tests.**
8. **Parallel component completion is followed by composition validation.**
9. **Post-merge development state must be finalized before downstream eligibility is computed.**
10. **A frozen architecture is changed only through an Architecture Change Request and a new version.**

## Dogfood loop

```text
implemented Work Item
        ↓
software verification
        ↓
model/benchmark verification (where applicable)
        ↓
real or controlled physical capture
        ↓
AISE product workflow
        ↓
observed failures / uncertainty / UX friction
        ↓
engineering signal
        ↓
governed Work Item
        ↓
next implementation wave
```

## Success gates

### Gate A — Capture works

A supported Android device can produce a durable, replayable capture package.

### Gate B — Reality can be reconstructed

A representative capture yields a registered measurable spatial representation.

### Gate C — Reality can be structured

Walls/floors/ceilings/openings become typed editable objects.

### Gate D — Reality is auditable

Objects and consequential properties have provenance, epistemic state and uncertainty.

### Gate E — Reality is usable

An engineer can review it in the browser and generate 2D/IFC/DXF/PDF outputs.

### Gate F — Reality is verifiable

Task-specific rules and tolerances produce deterministic PASS/FAIL/UNKNOWN results.

### Gate G — Reality pipeline is trusted

Golden captures and physical test fixtures show acceptable regression behavior.

### Gate H — MEP is useful

Pipes/assets/topology are sufficiently reconstructed for the intended maintenance/as-built workflows.

### Gate I — Reality becomes operational intelligence

Reality-vs-design, history/change detection and grounded engineering reasoning operate over the canonical graph.
